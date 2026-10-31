import { describe, expect, it } from 'vitest';
import { interpolateSphericalPosition, type RoomStatePayload, type WorldMutationMessage } from '../src/net/protocol';
import { InMemoryRoomBroker, MultiplayerClient } from '../src/net/client';
import type { PlacedStructure } from '../src/sim/persistence';

describe('Multiplayer Wire Protocol, Spherical Slerp & Room Broker', () => {
  it('interpolates remote peer positions along the spherical great-circle arc without chord tunneling', () => {
    const R = 1600;
    // Two points 60 degrees apart on the equator
    const angle = Math.PI / 3;
    const a = { px: R, py: 0, pz: 0 };
    const b = { px: Math.cos(angle) * R, py: 0, pz: Math.sin(angle) * R };

    const [mx, my, mz] = interpolateSphericalPosition(a, b, 0.5);
    const midR = Math.hypot(mx, my, mz);
    // Linear chord midpoint would dip to R * cos(30deg) = 1385.6m (214m underground!).
    // Spherical arc interpolation preserves R = 1600m.
    expect(midR).toBeCloseTo(R, 3);
    expect(my).toBeCloseTo(0, 5);
    expect(Math.atan2(mz, mx)).toBeCloseTo(angle * 0.5, 4);
  });

  it('synchronizes player snapshots, structures, chopped trees, column edits, and eco seeds across peers', () => {
    const broker = new InMemoryRoomBroker('alpha-sector', 'GP192-01');

    const receivedMutationsB: WorldMutationMessage[] = [];
    let lateJoinStateC: RoomStatePayload | null = null;

    const peerA = new MultiplayerClient({
      roomId: 'alpha-sector',
      universeSeed: 'GP192-01',
      peerId: 'peer_A',
      name: 'Alice',
    });

    const peerB = new MultiplayerClient({
      roomId: 'alpha-sector',
      universeSeed: 'GP192-01',
      peerId: 'peer_B',
      name: 'Bob',
      callbacks: {
        onWorldMutation: (m) => receivedMutationsB.push(m),
      },
    });

    broker.connectSync(peerA);
    broker.connectSync(peerB);

    expect(peerA.connected).toBe(true);
    expect(peerB.connected).toBe(true);

    // 1. Peer A sends a 15 Hz position update
    peerA.tick(0.1, {
      planetId: 'verdant-prime',
      px: 1600, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0,
      fwdX: 0, fwdY: 0, fwdZ: 1,
      mode: 'walk',
      bank: 0,
      updatedAt: 100,
    });
    expect(peerB.peers.has('peer_A')).toBe(true);

    // 2. Peer A places a persistent structure, chops a tree, mines a voxel, and seeds an ecosystem
    const structure: PlacedStructure = {
      id: 'st_relay_1',
      kind: 'solar_relay',
      planetId: 'verdant-prime',
      anchorTile: 42,
      offsetEast: 0,
      offsetNorth: 0,
      groundRadius: 1600,
      yaw: 0,
      builtAt: 1000,
      lastTickAt: 1000,
      storedCount: 0,
      fractionalProgress: 0,
    };
    peerA.sendMutation({ type: 'structure_place', structure });
    peerA.sendMutation({ type: 'tree_chop', planetId: 'verdant-prime', tile: 77 });
    peerA.sendMutation({ type: 'column_edit', planetId: 'verdant-prime', tile: 88, layer: 14, action: 'mine', mat: 0 });
    peerA.sendMutation({ type: 'eco_seed', planetId: 'boreal-spire', tile: 19 });

    expect(receivedMutationsB).toHaveLength(4);
    expect(receivedMutationsB[0]?.type).toBe('structure_place');
    expect(receivedMutationsB[1]?.type).toBe('tree_chop');
    expect(receivedMutationsB[2]?.type).toBe('column_edit');
    expect(receivedMutationsB[3]?.type).toBe('eco_seed');

    // 3. Peer C joins later and receives the full persisted room state
    const peerC = new MultiplayerClient({
      roomId: 'alpha-sector',
      universeSeed: 'GP192-01',
      peerId: 'peer_C',
      name: 'Charlie',
      callbacks: {
        onRoomInit: (state) => {
          lateJoinStateC = state;
        },
      },
    });
    broker.connectSync(peerC);

    expect(lateJoinStateC).not.toBeNull();
    expect(lateJoinStateC!.structures).toHaveLength(1);
    expect(lateJoinStateC!.structures[0]?.id).toBe('st_relay_1');
    expect(lateJoinStateC!.planetDeltas['verdant-prime']?.choppedTrees).toContain(77);
    expect(lateJoinStateC!.planetDeltas['verdant-prime']?.columnEdits).toHaveLength(1);
    expect(lateJoinStateC!.planetDeltas['boreal-spire']?.seededEcoTiles).toContain(19);
    expect(peerC.peers.has('peer_A')).toBe(true);
  });
});
