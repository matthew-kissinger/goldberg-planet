/**
 * Cloudflare Worker & Durable Object Room Server (`PlanetRoomDurableObject`).
 *
 * Uses the Durable Object WebSocket Hibernation API (`ctx.acceptWebSocket`) and
 * persistent Durable Object key-value / SQLite storage so structures, chopped
 * trees, mined voxel columns, and cross-planet ecosystem seeds survive room
 * hibernation across sessions.
 */

import type {
  ClientMessage,
  RemotePlayerSnapshot,
  RoomPlanetDelta,
  ServerMessage,
} from '../../src/net/protocol';
import type { PlacedStructure } from '../../src/sim/persistence';

export interface Env {
  PLANET_ROOM: DurableObjectNamespace;
}

interface DurableObjectStorageLike {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
}

export class PlanetRoomDurableObject {
  private readonly ctx: DurableObjectStateLike;
  private initialized = false;
  private universeSeed = 'GP192-01';
  private readonly peers = new Map<string, RemotePlayerSnapshot>();
  private readonly structures = new Map<string, PlacedStructure>();
  private readonly planetDeltas = new Map<string, RoomPlanetDelta>();
  private readonly socketPeerIds = new Map<WebSocket, string>();

  constructor(ctx: DurableObjectStateLike, _env: Env) {
    this.ctx = ctx;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const savedSeed = await this.ctx.storage.get<string>('universeSeed');
    if (savedSeed) this.universeSeed = savedSeed;
    const savedStructures = await this.ctx.storage.get<PlacedStructure[]>('structures');
    if (savedStructures) {
      for (const s of savedStructures) this.structures.set(s.id, s);
    }
    const savedDeltas = await this.ctx.storage.get<Record<string, RoomPlanetDelta>>('planetDeltas');
    if (savedDeltas) {
      for (const [pid, delta] of Object.entries(savedDeltas)) {
        this.planetDeltas.set(pid, delta);
      }
    }
  }

  private async persistState(): Promise<void> {
    await this.ctx.storage.put('universeSeed', this.universeSeed);
    await this.ctx.storage.put('structures', [...this.structures.values()]);
    const deltasObj: Record<string, RoomPlanetDelta> = {};
    for (const [pid, d] of this.planetDeltas) deltasObj[pid] = d;
    await this.ctx.storage.put('planetDeltas', deltasObj);
  }

  private getOrCreateDelta(planetId: string): RoomPlanetDelta {
    let delta = this.planetDeltas.get(planetId);
    if (!delta) {
      delta = { choppedTrees: [], columnEdits: [], seededEcoTiles: [] };
      this.planetDeltas.set(planetId, delta);
    }
    return delta;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureLoaded();
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response(
        JSON.stringify({
          universeSeed: this.universeSeed,
          peers: this.peers.size,
          structures: this.structures.size,
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    await this.ensureLoaded();
    if (typeof message !== 'string') return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        this.socketPeerIds.set(ws, msg.peerId);
        if (!this.universeSeed) this.universeSeed = msg.universeSeed;
        const deltasObj: Record<string, RoomPlanetDelta> = {};
        for (const [pid, d] of this.planetDeltas) deltasObj[pid] = d;
        const initMsg: ServerMessage = {
          type: 'room_init',
          state: {
            roomId: 'room',
            universeSeed: this.universeSeed,
            peers: [...this.peers.values()],
            structures: [...this.structures.values()],
            planetDeltas: deltasObj,
          },
        };
        ws.send(JSON.stringify(initMsg));
        break;
      }
      case 'player_state': {
        this.socketPeerIds.set(ws, msg.snapshot.peerId);
        this.peers.set(msg.snapshot.peerId, msg.snapshot);
        this.broadcast({ type: 'peer_state', snapshot: msg.snapshot }, ws);
        break;
      }
      case 'structure_place': {
        this.structures.set(msg.structure.id, msg.structure);
        await this.persistState();
        const fromPeerId = this.socketPeerIds.get(ws) ?? '';
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId }, ws);
        break;
      }
      case 'structure_remove': {
        this.structures.delete(msg.structureId);
        await this.persistState();
        const fromPeerId = this.socketPeerIds.get(ws) ?? '';
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId }, ws);
        break;
      }
      case 'tree_chop': {
        const delta = this.getOrCreateDelta(msg.planetId);
        if (!delta.choppedTrees.includes(msg.tile)) delta.choppedTrees.push(msg.tile);
        await this.persistState();
        const fromPeerId = this.socketPeerIds.get(ws) ?? '';
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId }, ws);
        break;
      }
      case 'column_edit': {
        const delta = this.getOrCreateDelta(msg.planetId);
        delta.columnEdits.push({
          tile: msg.tile,
          solid: [msg.action === 'place' ? 1 : 0],
          placed: [msg.layer],
          mat: msg.mat !== undefined ? [[msg.layer, msg.mat]] : undefined,
        });
        await this.persistState();
        const fromPeerId = this.socketPeerIds.get(ws) ?? '';
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId }, ws);
        break;
      }
      case 'eco_seed': {
        const delta = this.getOrCreateDelta(msg.planetId);
        if (!delta.seededEcoTiles.includes(msg.tile)) delta.seededEcoTiles.push(msg.tile);
        await this.persistState();
        const fromPeerId = this.socketPeerIds.get(ws) ?? '';
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId }, ws);
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const peerId = this.socketPeerIds.get(ws);
    this.socketPeerIds.delete(ws);
    if (peerId) {
      this.peers.delete(peerId);
      this.broadcast({ type: 'peer_left', peerId }, ws);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  private broadcast(msg: ServerMessage, exclude?: WebSocket): void {
    const raw = JSON.stringify(msg);
    for (const sock of this.ctx.getWebSockets()) {
      if (sock === exclude) continue;
      try {
        sock.send(raw);
      } catch {
        // Ignore closed socket
      }
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/api\/room\/([^/]+)$/.exec(url.pathname);
    if (!match) {
      return new Response('Goldberg Planet Multiplayer Room Worker', { status: 200 });
    }
    const roomId = decodeURIComponent(match[1]!);
    const id = env.PLANET_ROOM.idFromName(roomId);
    const stub = env.PLANET_ROOM.get(id);
    return stub.fetch(request);
  },
};
