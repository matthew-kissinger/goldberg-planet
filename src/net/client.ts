/**
 * Multiplayer Client & In-Memory Room Broker (`?room=<id>`).
 *
 * Connects to the Cloudflare Durable Object room endpoint (`/api/room/:roomId`)
 * or an injected transport (for deterministic multi-peer tests).
 * Broadcasts 15 Hz spherical player snapshots and world mutations
 * (`structure_place`, `structure_remove`, `tree_chop`, `column_edit`, `eco_seed`).
 */

import {
  interpolateSphericalPosition,
  type ClientMessage,
  type RemotePlayerSnapshot,
  type RoomPlanetDelta,
  type RoomStatePayload,
  type ServerMessage,
  type WorldMutationMessage,
} from './protocol';
import type { PlacedStructure } from '../sim/persistence';

export interface MultiplayerTransport {
  send(data: string): void;
  close(): void;
  onMessage: ((data: string) => void) | null;
  onOpen: (() => void) | null;
  onClose: (() => void) | null;
}

export interface PeerTrack {
  prev: RemotePlayerSnapshot;
  curr: RemotePlayerSnapshot;
  receivedAtMs: number;
}

const PEER_COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#facc15', '#c084fc', '#fb923c'];

export interface MultiplayerCallbacks {
  onRoomInit?: (state: RoomStatePayload) => void;
  onWorldMutation?: (mutation: WorldMutationMessage, fromPeerId: string) => void;
  onPeerJoinOrUpdate?: (snapshot: RemotePlayerSnapshot) => void;
  onPeerLeft?: (peerId: string) => void;
}

export class MultiplayerClient {
  readonly roomId: string;
  readonly peerId: string;
  readonly name: string;
  readonly color: string;
  readonly universeSeed: string;
  readonly peers = new Map<string, PeerTrack>();
  connected = false;

  private transport: MultiplayerTransport | null = null;
  private readonly callbacks: MultiplayerCallbacks;
  private sendAccum = 0;
  /** 15 Hz state broadcast interval */
  private readonly sendInterval = 1 / 15;

  constructor(
    opts: {
      roomId: string;
      universeSeed: string;
      peerId?: string;
      name?: string;
      color?: string;
      callbacks?: MultiplayerCallbacks;
    },
  ) {
    this.roomId = opts.roomId;
    this.universeSeed = opts.universeSeed;
    this.peerId = opts.peerId ?? `peer_${Math.random().toString(36).slice(2, 9)}`;
    this.name = opts.name ?? `Wayfarer-${this.peerId.slice(-4)}`;
    const colorIdx = Math.abs(this.hashCode(this.peerId)) % PEER_COLORS.length;
    this.color = opts.color ?? PEER_COLORS[colorIdx]!;
    this.callbacks = opts.callbacks ?? {};
  }

  private hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    return h;
  }

  /** Connect using a browser WebSocket or a custom MultiplayerTransport. */
  connect(customTransport?: MultiplayerTransport, wsUrlOverride?: string): void {
    if (customTransport) {
      this.bindTransport(customTransport);
      return;
    }
    if (typeof WebSocket === 'undefined') return;
    const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : 'localhost:8787';
    const url = wsUrlOverride ?? `${proto}//${host}/api/room/${encodeURIComponent(this.roomId)}`;
    try {
      const ws = new WebSocket(url);
      const transport: MultiplayerTransport = {
        send: (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        },
        close: () => ws.close(),
        onMessage: null,
        onOpen: null,
        onClose: null,
      };
      ws.addEventListener('open', () => transport.onOpen?.());
      ws.addEventListener('message', (ev) => {
        if (typeof ev.data === 'string') transport.onMessage?.(ev.data);
      });
      ws.addEventListener('close', () => transport.onClose?.());
      ws.addEventListener('error', () => {
        // Silently degrade to solo offline mode if room server isn't reachable
      });
      this.bindTransport(transport);
    } catch {
      // Offline fallback
    }
  }

  private bindTransport(transport: MultiplayerTransport): void {
    this.transport = transport;
    transport.onOpen = () => {
      this.connected = true;
      this.sendRaw({
        type: 'join',
        peerId: this.peerId,
        name: this.name,
        color: this.color,
        universeSeed: this.universeSeed,
      });
    };
    transport.onClose = () => {
      this.connected = false;
    };
    transport.onMessage = (raw) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(raw) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };
  }

  private handleServerMessage(msg: ServerMessage): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    switch (msg.type) {
      case 'room_init': {
        for (const snap of msg.state.peers) {
          if (snap.peerId === this.peerId) continue;
          this.peers.set(snap.peerId, { prev: snap, curr: snap, receivedAtMs: now });
        }
        this.callbacks.onRoomInit?.(msg.state);
        break;
      }
      case 'peer_state': {
        if (msg.snapshot.peerId === this.peerId) break;
        const existing = this.peers.get(msg.snapshot.peerId);
        if (existing) {
          existing.prev = existing.curr;
          existing.curr = msg.snapshot;
          existing.receivedAtMs = now;
        } else {
          this.peers.set(msg.snapshot.peerId, {
            prev: msg.snapshot,
            curr: msg.snapshot,
            receivedAtMs: now,
          });
        }
        this.callbacks.onPeerJoinOrUpdate?.(msg.snapshot);
        break;
      }
      case 'peer_left': {
        this.peers.delete(msg.peerId);
        this.callbacks.onPeerLeft?.(msg.peerId);
        break;
      }
      case 'world_mutation': {
        if (msg.fromPeerId === this.peerId) break;
        this.callbacks.onWorldMutation?.(msg.mutation, msg.fromPeerId);
        break;
      }
    }
  }

  /** Broadcast a persistent world mutation (structure, chopped tree, mined voxel, eco-seed). */
  sendMutation(mutation: WorldMutationMessage): void {
    this.sendRaw(mutation);
  }

  /** Step 15 Hz state publisher. */
  tick(dt: number, snapshot: Omit<RemotePlayerSnapshot, 'peerId' | 'name' | 'color'>): void {
    if (!this.connected) return;
    this.sendAccum += dt;
    if (this.sendAccum < this.sendInterval) return;
    this.sendAccum = 0;
    this.sendRaw({
      type: 'player_state',
      snapshot: {
        ...snapshot,
        peerId: this.peerId,
        name: this.name,
        color: this.color,
      },
    });
  }

  /**
   * Compute spherical-arc interpolated snapshots for all active peers at `nowMs`.
   */
  getInterpolatedPeers(nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()): RemotePlayerSnapshot[] {
    const out: RemotePlayerSnapshot[] = [];
    const windowMs = this.sendInterval * 1000;
    for (const track of this.peers.values()) {
      const alpha = Math.max(0, Math.min(1, (nowMs - track.receivedAtMs) / windowMs));
      const [px, py, pz] = interpolateSphericalPosition(track.prev, track.curr, alpha);
      out.push({
        ...track.curr,
        px,
        py,
        pz,
      });
    }
    return out;
  }

  disconnect(): void {
    this.transport?.close();
    this.connected = false;
  }

  private sendRaw(msg: ClientMessage): void {
    if (!this.connected || !this.transport) return;
    this.transport.send(JSON.stringify(msg));
  }
}

/**
 * In-memory Room Broker that mirrors the Cloudflare Durable Object room logic
 * (`worker/src/index.ts`) for local co-op testing and unit tests.
 */
export class InMemoryRoomBroker {
  readonly roomId: string;
  universeSeed: string;
  readonly peers = new Map<string, RemotePlayerSnapshot>();
  readonly structures = new Map<string, PlacedStructure>();
  readonly planetDeltas = new Map<string, RoomPlanetDelta>();
  private readonly sockets = new Map<string, { peerId: string; sendToClient: (data: string) => void }>();
  private nextSocketId = 1;

  constructor(roomId: string, universeSeed = 'GP192-01') {
    this.roomId = roomId;
    this.universeSeed = universeSeed;
  }

  private getOrCreateDelta(planetId: string): RoomPlanetDelta {
    let delta = this.planetDeltas.get(planetId);
    if (!delta) {
      delta = { choppedTrees: [], columnEdits: [], seededEcoTiles: [] };
      this.planetDeltas.set(planetId, delta);
    }
    return delta;
  }

  createClientTransport(): MultiplayerTransport {
    const socketId = `sock_${this.nextSocketId++}`;
    const transport: MultiplayerTransport = {
      send: (data: string) => {
        this.onClientData(socketId, data);
      },
      close: () => {
        const entry = this.sockets.get(socketId);
        this.sockets.delete(socketId);
        if (entry && entry.peerId) {
          this.peers.delete(entry.peerId);
          this.broadcast({ type: 'peer_left', peerId: entry.peerId }, socketId);
        }
        transport.onClose?.();
      },
      onMessage: null,
      onOpen: null,
      onClose: null,
    };

    this.sockets.set(socketId, {
      peerId: '',
      sendToClient: (data: string) => transport.onMessage?.(data),
    });

    queueMicrotask(() => transport.onOpen?.());
    return transport;
  }

  /** Synchronous connect helper for unit tests. */
  connectSync(client: MultiplayerClient): void {
    const socketId = `sock_${this.nextSocketId++}`;
    const transport: MultiplayerTransport = {
      send: (data: string) => {
        this.onClientData(socketId, data);
      },
      close: () => {
        const entry = this.sockets.get(socketId);
        this.sockets.delete(socketId);
        if (entry && entry.peerId) {
          this.peers.delete(entry.peerId);
          this.broadcast({ type: 'peer_left', peerId: entry.peerId }, socketId);
        }
        transport.onClose?.();
      },
      onMessage: null,
      onOpen: null,
      onClose: null,
    };
    this.sockets.set(socketId, {
      peerId: '',
      sendToClient: (data: string) => transport.onMessage?.(data),
    });
    client.connect(transport);
    transport.onOpen?.();
  }

  private onClientData(socketId: string, raw: string): void {
    const sock = this.sockets.get(socketId);
    if (!sock) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'join': {
        sock.peerId = msg.peerId;
        if (!this.universeSeed) this.universeSeed = msg.universeSeed;
        const deltasObj: Record<string, RoomPlanetDelta> = {};
        for (const [pid, d] of this.planetDeltas) deltasObj[pid] = d;
        const initMsg: ServerMessage = {
          type: 'room_init',
          state: {
            roomId: this.roomId,
            universeSeed: this.universeSeed,
            peers: [...this.peers.values()],
            structures: [...this.structures.values()],
            planetDeltas: deltasObj,
          },
        };
        sock.sendToClient(JSON.stringify(initMsg));
        break;
      }
      case 'player_state': {
        this.peers.set(msg.snapshot.peerId, msg.snapshot);
        this.broadcast({ type: 'peer_state', snapshot: msg.snapshot }, socketId);
        break;
      }
      case 'structure_place': {
        this.structures.set(msg.structure.id, msg.structure);
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId: sock.peerId }, socketId);
        break;
      }
      case 'structure_remove': {
        this.structures.delete(msg.structureId);
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId: sock.peerId }, socketId);
        break;
      }
      case 'tree_chop': {
        const delta = this.getOrCreateDelta(msg.planetId);
        if (!delta.choppedTrees.includes(msg.tile)) delta.choppedTrees.push(msg.tile);
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId: sock.peerId }, socketId);
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
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId: sock.peerId }, socketId);
        break;
      }
      case 'eco_seed': {
        const delta = this.getOrCreateDelta(msg.planetId);
        if (!delta.seededEcoTiles.includes(msg.tile)) delta.seededEcoTiles.push(msg.tile);
        this.broadcast({ type: 'world_mutation', mutation: msg, fromPeerId: sock.peerId }, socketId);
        break;
      }
    }
  }

  private broadcast(msg: ServerMessage, excludeSocketId?: string): void {
    const raw = JSON.stringify(msg);
    for (const [id, sock] of this.sockets) {
      if (id === excludeSocketId) continue;
      sock.sendToClient(raw);
    }
  }
}
