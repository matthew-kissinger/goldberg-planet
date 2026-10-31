/**
 * Multiplayer Wire Protocol & Spherical Arc Interpolation (`?room=<id>`).
 *
 * Shared between the browser client (`src/net/client.ts`) and the Cloudflare
 * Durable Object room server (`worker/src/index.ts`).
 */

import type { PlacedStructure } from '../sim/persistence';
import type { SerializedColumnEdit } from '../world/columns';
import type { MoveMode } from '../player/player';

export interface RemotePlayerSnapshot {
  peerId: string;
  name: string;
  color: string;
  planetId: string;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vy: number;
  vz: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  mode: MoveMode;
  bank: number;
  updatedAt: number;
}

export interface RoomPlanetDelta {
  choppedTrees: number[];
  columnEdits: SerializedColumnEdit[];
  seededEcoTiles: number[];
}

export interface RoomStatePayload {
  roomId: string;
  universeSeed: string;
  peers: RemotePlayerSnapshot[];
  structures: PlacedStructure[];
  planetDeltas: Record<string, RoomPlanetDelta>;
}

export type WorldMutationMessage =
  | { type: 'structure_place'; structure: PlacedStructure }
  | { type: 'structure_remove'; structureId: string }
  | { type: 'tree_chop'; planetId: string; tile: number }
  | { type: 'column_edit'; planetId: string; tile: number; layer: number; action: 'mine' | 'place'; mat?: number }
  | { type: 'eco_seed'; planetId: string; tile: number };

export type ClientMessage =
  | { type: 'join'; peerId: string; name: string; color: string; universeSeed: string }
  | { type: 'player_state'; snapshot: RemotePlayerSnapshot }
  | WorldMutationMessage;

export type ServerMessage =
  | { type: 'room_init'; state: RoomStatePayload }
  | { type: 'peer_state'; snapshot: RemotePlayerSnapshot }
  | { type: 'peer_left'; peerId: string }
  | { type: 'world_mutation'; mutation: WorldMutationMessage; fromPeerId: string };

/**
 * Interpolate two remote player snapshots along the spherical great-circle arc
 * (`slerp(u0, u1, t) * lerp(r0, r1, t)`) so remote players never chord-tunnel
 * through the curved planet terrain between 15 Hz network updates.
 */
export function interpolateSphericalPosition(
  a: Pick<RemotePlayerSnapshot, 'px' | 'py' | 'pz'>,
  b: Pick<RemotePlayerSnapshot, 'px' | 'py' | 'pz'>,
  alpha: number,
): [number, number, number] {
  const t = Math.max(0, Math.min(1, alpha));
  const r0 = Math.hypot(a.px, a.py, a.pz) || 1;
  const r1 = Math.hypot(b.px, b.py, b.pz) || 1;
  const u0x = a.px / r0, u0y = a.py / r0, u0z = a.pz / r0;
  const u1x = b.px / r1, u1y = b.py / r1, u1z = b.pz / r1;

  const dot = Math.max(-1, Math.min(1, u0x * u1x + u0y * u1y + u0z * u1z));
  const omega = Math.acos(dot);
  const r = r0 + (r1 - r0) * t;

  if (omega < 1e-4) {
    const lx = u0x + (u1x - u0x) * t;
    const ly = u0y + (u1y - u0y) * t;
    const lz = u0z + (u1z - u0z) * t;
    const ll = Math.hypot(lx, ly, lz) || 1;
    return [(lx / ll) * r, (ly / ll) * r, (lz / ll) * r];
  }

  const sinO = Math.sin(omega);
  const w0 = Math.sin((1 - t) * omega) / sinO;
  const w1 = Math.sin(t * omega) / sinO;
  return [
    (u0x * w0 + u1x * w1) * r,
    (u0y * w0 + u1y * w1) * r,
    (u0z * w0 + u1z * w1) * r,
  ];
}
