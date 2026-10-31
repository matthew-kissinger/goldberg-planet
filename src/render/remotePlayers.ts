/**
 * Remote Co-op Player Renderer (`?room=<id>`).
 *
 * Renders connected peers on the active planet as procedural Wayfarer avatars
 * (walking/flying) or banking Bush Planes (in plane mode), oriented to the
 * spherical surface normal and interpolated along the great-circle arc.
 */

import * as THREE from 'three/webgpu';
import type { RemotePlayerSnapshot } from '../net/protocol';

interface RemoteAvatarEntry {
  group: THREE.Group;
  walker: THREE.Group;
  plane: THREE.Group;
  prop: THREE.Mesh;
  beacon: THREE.Mesh;
}

export class RemotePlayerRenderer {
  readonly root = new THREE.Group();
  private readonly entries = new Map<string, RemoteAvatarEntry>();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    this.root.name = 'remote-players';
    scene.add(this.root);
  }

  private getOrCreateAvatar(peerId: string, colorHex: string): RemoteAvatarEntry {
    let entry = this.entries.get(peerId);
    if (entry) return entry;

    const group = new THREE.Group();
    const walker = new THREE.Group();
    const plane = new THREE.Group();

    const suitMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.55,
      metalness: 0.15,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.75,
    });
    const beaconMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
    });

    // Procedural Wayfarer body + head + pack
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.72, 0.28), suitMat);
    torso.position.y = 0.92;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), suitMat);
    head.position.y = 1.52;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.18), beaconMat);
    visor.position.set(0, 1.52, -0.16);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.22), darkMat);
    pack.position.set(0, 0.95, 0.22);
    walker.add(torso, head, visor, pack);

    // Procedural Bush Plane
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 3.4), suitMat);
    fuselage.position.y = 0.85;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.12, 0.95), suitMat);
    wing.position.set(0, 1.25, -0.2);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.7), darkMat);
    tail.position.set(0, 1.25, 1.45);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 0.08), darkMat);
    prop.position.set(0, 0.85, -1.76);
    plane.add(fuselage, wing, tail, prop);

    // Overhead holo beacon diamond so co-op friends are easy to spot across ridges
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), beaconMat);
    beacon.position.y = 2.35;

    group.add(walker, plane, beacon);
    this.root.add(group);

    entry = { group, walker, plane, prop, beacon };
    this.entries.set(peerId, entry);
    return entry;
  }

  update(
    snapshots: RemotePlayerSnapshot[],
    activePlanetId: string,
    cameraWorld: THREE.Vector3,
    dt: number,
    timeSec: number,
  ): void {
    const activeIds = new Set<string>();
    for (const snap of snapshots) {
      activeIds.add(snap.peerId);
      const entry = this.getOrCreateAvatar(snap.peerId, snap.color);
      if (snap.planetId !== activePlanetId) {
        entry.group.visible = false;
        continue;
      }
      entry.group.visible = true;
      entry.group.position.set(
        snap.px - cameraWorld.x,
        snap.py - cameraWorld.y,
        snap.pz - cameraWorld.z,
      );

      this.up.set(snap.px, snap.py, snap.pz).normalize();
      this.fwd.set(snap.fwdX, snap.fwdY, snap.fwdZ);
      this.fwd.addScaledVector(this.up, -this.fwd.dot(this.up));
      if (this.fwd.lengthSq() < 1e-6) this.fwd.set(1, 0, 0);
      else this.fwd.normalize();
      this.right.crossVectors(this.fwd, this.up).normalize();
      this.fwd.crossVectors(this.up, this.right).normalize();

      // Character / plane local -Z is forward, +Y is radial up, +X is right
      this.basis.makeBasis(this.right, this.up, this.fwd.clone().negate());
      entry.group.quaternion.setFromRotationMatrix(this.basis);

      const inPlane = snap.mode === 'plane';
      entry.walker.visible = !inPlane;
      entry.plane.visible = inPlane;
      if (inPlane) {
        entry.plane.rotation.z = snap.bank;
        entry.prop.rotation.z += dt * 36;
      }
      entry.beacon.position.y = 2.35 + Math.sin(timeSec * 3.2) * 0.14;
      entry.beacon.rotation.y = timeSec * 1.8;
    }

    for (const [peerId, entry] of this.entries) {
      if (!activeIds.has(peerId)) {
        this.root.remove(entry.group);
        this.entries.delete(peerId);
      }
    }
  }
}
