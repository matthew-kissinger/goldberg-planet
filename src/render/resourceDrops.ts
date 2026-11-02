/** Recognizable field bundles with a bounded shared geometry/material cache. */
import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import type { ResourceDropSave } from '../sim/resourceDrops';
import { RESOURCE_DROP_PICKUP_DELAY } from '../sim/resourceDrops';
import { ITEM_DEFS } from '../sim/crafting';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';
import { CAMP_COLORS, GeometryKit } from './campKit';

type DropFamily = 'wood' | 'mineral' | 'crystal' | 'fiber' | 'ration' | 'bone' | 'ingot' | 'tool' | 'pack';
function family(item: ResourceDropSave['item']): DropFamily {
  if (item === 'wood') return 'wood';
  if (['stone', 'flint', 'iron_ore', 'alloy_ore'].includes(item)) return 'mineral';
  if (['crystal', 'star_shard', 'cryo_core', 'magma_core', 'mycelium_spore'].includes(item)) return 'crystal';
  if (item === 'fiber') return 'fiber';
  if (['raw_meat', 'cooked_meat', 'hide'].includes(item)) return 'ration';
  if (item === 'bone') return 'bone';
  if (item === 'iron_ingot') return 'ingot';
  if (['hatchet', 'pickaxe', 'spear'].includes(item)) return 'tool';
  return 'pack';
}
function pieceCount(count: number): number { return Math.max(1, Math.min(3, Math.trunc(count))); }

class DropAssetKit {
  private readonly geometry = new Map<string, { body: THREE.BufferGeometry; binding: THREE.BufferGeometry }>();
  private readonly materials = new Map<ResourceDropSave['item'], THREE.MeshStandardMaterial>();
  private readonly surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  private readonly marker = new THREE.MeshStandardMaterial({ color: CAMP_COLORS.ochre, emissive: CAMP_COLORS.ochre, emissiveIntensity: 0.18, roughness: 0.75 });
  private readonly markerGeometry = new THREE.OctahedronGeometry(0.5, 0);

  private asset(item: ResourceDropSave['item'], count: number): { body: THREE.BufferGeometry; binding: THREE.BufferGeometry } {
    const kind = family(item), pieces = pieceCount(count), key = `${kind}:${pieces}`;
    const cached = this.geometry.get(key); if (cached) return cached;
    const body = new GeometryKit(), binding = new GeometryKit(), c = CAMP_COLORS;
    for (let i = 0; i < pieces; i++) {
      const x = (i - (pieces - 1) * 0.5) * 0.13;
      if (kind === 'wood') {
        body.cylinder(0x665446, [x, 0.1, 0], 0.06, 0.07, 0.49 - (i % 2) * 0.05, 7, [Math.PI / 2, 0, 0]);
        for (const side of [-1, 1]) body.cylinder(0xc4a77b, [x, 0.1, side * (0.246 - (i % 2) * 0.025)], 0.053, 0.053, 0.006, 7, [Math.PI / 2, 0, 0]);
      } else if (kind === 'mineral') {
        body.crown(0xffffff, [x, 0.12 + (i % 2) * 0.025, i % 2 ? 0.045 : -0.035], [0.13, 0.12 + i * 0.015, 0.15]);
      } else if (kind === 'crystal') {
        body.cylinder(0xffffff, [x, 0.15 + i * 0.015, 0], 0.025, 0.085, 0.3 + i * 0.03, 5, [0, i * 0.5, (i - 1) * 0.16]);
      } else if (kind === 'fiber') {
        for (let j = 0; j < 4; j++) body.beam(0xffffff, [x - 0.025 + j * 0.016, 0.045, -0.18], [x - 0.015 + j * 0.02, 0.09, 0.2], 0.018, 5);
      } else if (kind === 'ration') {
        body.crown(0xffffff, [x, 0.1, 0], [0.12, 0.07, 0.19]);
      } else if (kind === 'bone') {
        body.beam(0xffffff, [x, 0.08, -0.17], [x, 0.08, 0.17], 0.035, 6);
        for (const z of [-0.16, 0.16]) body.crown(0xffffff, [x, 0.08, z], [0.06, 0.045, 0.06]);
      } else if (kind === 'ingot') {
        body.box(0xffffff, [x, 0.07 + i * 0.018, 0], [0.115, 0.1, 0.26], [0, i * 0.08, 0]);
      } else if (kind === 'tool') {
        body.beam(0xffffff, [x, 0.08, -0.21], [x, 0.08, 0.22], 0.025);
        body.crown(0xffffff, [x, 0.09, 0.17], [0.12, 0.055, 0.09]);
      } else {
        body.box(0xffffff, [x, 0.11, 0], [0.12, 0.19, 0.28]);
        binding.box(c.cream, [x, 0.212, 0], [0.12, 0.025, 0.29]);
      }
    }
    const width = pieces * 0.13 + 0.025;
    if (kind === 'wood' || kind === 'fiber' || kind === 'bone' || kind === 'pack') {
      const top = kind === 'pack' ? 0.24 : kind === 'fiber' ? 0.12 : kind === 'bone' ? 0.13 : 0.17;
      for (const z of [-0.1, 0.1]) binding.box(c.cream, [0, top, z], [width, 0.025, 0.035]);
      binding.box(c.ochre, [width * 0.5 - 0.04, top + 0.025, 0], [0.07, 0.045, 0.09]);
    } else {
      binding.box(c.cream, [0, 0.025, 0], [width + 0.08, 0.035, 0.36]);
      binding.box(c.ochre, [width * 0.5, 0.055, 0.12], [0.07, 0.03, 0.075]);
    }
    const asset = { body: body.finish(), binding: binding.finish() };
    this.geometry.set(key, asset); return asset;
  }

  make(drop: ResourceDropSave): THREE.Group {
    const asset = this.asset(drop.item, drop.count);
    let material = this.materials.get(drop.item);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: ITEM_DEFS[drop.item].css, vertexColors: true, roughness: 0.82, metalness: 0.02 });
      this.materials.set(drop.item, material);
    }
    const group = new THREE.Group(); group.name = `resource-drop-${drop.item}-${drop.id}`;
    const body = new THREE.Mesh(asset.body, drop.item === 'wood' ? this.surface : material);
    body.name = drop.item === 'wood' ? 'dropWoodLog' : 'dropChip'; body.receiveShadow = true;
    const binding = new THREE.Mesh(asset.binding, this.surface); binding.name = 'fieldBinding'; binding.receiveShadow = true;
    const glint = new THREE.Mesh(this.markerGeometry, this.marker); glint.name = 'dropGlint';
    glint.position.set(0.04, 0.37, 0.02); glint.scale.setScalar(0.045);
    group.add(body, binding, glint); return group;
  }

  dispose(): void {
    for (const asset of this.geometry.values()) { asset.body.dispose(); asset.binding.dispose(); }
    this.geometry.clear(); this.markerGeometry.dispose(); this.surface.dispose(); this.marker.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}

export class ResourceDropRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly kit = new DropAssetKit();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'resource-drops';
    scene.add(this.group);
  }

  setDrops(drops: readonly ResourceDropSave[]): void {
    const wanted = new Set(drops.map((drop) => drop.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const drop of drops) {
      const previous = this.objects.get(drop.id);
      if (previous && previous.userData.item === drop.item && previous.userData.pieces === pieceCount(drop.count)) continue;
      if (previous) this.group.remove(previous);
      const obj = this.kit.make(drop);
      obj.userData.resourceDropId = drop.id;
      obj.userData.item = drop.item;
      obj.userData.tile = drop.tile;
      obj.userData.pieces = pieceCount(drop.count);
      this.objects.set(drop.id, obj);
      this.group.add(obj);
    }
  }

  update(
    drops: readonly ResourceDropSave[],
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    camWorld: { x: number; y: number; z: number },
    seconds: number,
  ): void {
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const c = geo.centers;
    for (const drop of drops) {
      const obj = this.objects.get(drop.id);
      if (!obj) continue;
      const frame = geo.frameOf(drop.tile);
      const yaw = drop.id * 1.173 + drop.tile * 0.013;
      makeSurfaceBasisFromYaw(frame, yaw, m, vX, vY, vZ);

      // Ground height is cached at spawn time (see sim/resourceDrops.ts) so that terrain
      // changes near an existing drop don't make it visibly snap/teleport every frame. The
      // live lookup is only a defensive fallback for malformed/legacy entries that were
      // never assigned a cached height.
      const ground = drop.groundRadius > 0
        ? drop.groundRadius
        : layers.topRadius(columns.groundLayerBelow(drop.tile, layers.bounds[0]));
      const toss = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? Math.sin((drop.age / RESOURCE_DROP_PICKUP_DELAY) * Math.PI) * 0.42
        : Math.sin(seconds * 4.3 + drop.id) * 0.035;
      const pulse = drop.age < RESOURCE_DROP_PICKUP_DELAY
        ? 0.72 + (drop.age / RESOURCE_DROP_PICKUP_DELAY) * 0.28
        : 1 + Math.sin(seconds * 3.1 + drop.id) * 0.045;
      const r = ground + 0.12 + toss;
      obj.setRotationFromMatrix(m);
      obj.position.set(
        c[drop.tile * 3] * r + vX.x * drop.offsetA + vZ.x * drop.offsetB - camWorld.x,
        c[drop.tile * 3 + 1] * r + vX.y * drop.offsetA + vZ.y * drop.offsetB - camWorld.y,
        c[drop.tile * 3 + 2] * r + vX.z * drop.offsetA + vZ.z * drop.offsetB - camWorld.z,
      );
      obj.scale.setScalar(pulse);
      obj.visible = true;
      obj.traverse((child) => {
        if (child.name === 'dropGlint') {
          const glint = 0.8 + Math.sin(seconds * 5.2 + drop.id) * 0.22;
          child.scale.setScalar(0.045 * glint);
          child.visible = drop.age >= RESOURCE_DROP_PICKUP_DELAY * 0.35;
        }
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent(); this.group.clear(); this.objects.clear(); this.kit.dispose();
  }

  stats(): {
    groups: number;
    meshes: number;
    active: number;
  } {
    let meshes = 0;
    let active = 0;
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes++;
      });
    }
    return {
      groups: this.objects.size,
      meshes,
      active,
    };
  }
}
