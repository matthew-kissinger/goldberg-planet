/** Opaque expedition stations with shared, merged authoring geometry. */
import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import { STRUCTURE_DEFS, structureWorldPosition, type ConduitLink, type PlacedStructure, type StructureKind } from '../sim/persistence';
import { ITEM_DEFS, type ItemId } from '../sim/crafting';
import { buildCampStation, CAMP_COLORS, type CampStationAsset } from './campKit';

export class StructureRenderer {
  readonly group = new THREE.Group();
  private readonly instances = new Map<string, THREE.Group>();
  private readonly conduitLines: THREE.LineSegments;
  private readonly conduitGeom = new THREE.BufferGeometry();
  private readonly previewGroup = new THREE.Group();
  private previewKind: StructureKind | null = null;
  private readonly assets = new Map<StructureKind, CampStationAsset>();
  private readonly surface = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.06 });
  private readonly warm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, emissive: 0xc27a2d, emissiveIntensity: 0.45 });
  private readonly preview = new THREE.MeshStandardMaterial({ color: CAMP_COLORS.cream, roughness: 0.9, emissive: CAMP_COLORS.ochre, emissiveIntensity: 0.15 });
  private readonly cargoMaterials = new Map<ItemId | 'empty', THREE.MeshStandardMaterial>();
  private readonly cargoGeometry = new THREE.BoxGeometry(0.19, 0.17, 0.19);
  private readonly upVec = new THREE.Vector3();
  private readonly fwdVec = new THREE.Vector3();
  private readonly rightVec = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'outOfCoreStructures';
    scene.add(this.group);
    this.conduitLines = new THREE.LineSegments(this.conduitGeom, new THREE.LineBasicMaterial({ color: CAMP_COLORS.ochre }));
    this.conduitLines.visible = false;
    this.conduitLines.frustumCulled = false;
    this.group.add(this.conduitLines);
    this.previewGroup.name = 'stationPlacementPreview';
    this.previewGroup.visible = false;
    this.group.add(this.previewGroup);
  }

  private cargoMaterial(item?: ItemId): THREE.MeshStandardMaterial {
    const key = item ?? 'empty';
    let material = this.cargoMaterials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color: item ? ITEM_DEFS[item].css : CAMP_COLORS.ochre, roughness: 0.75 });
      this.cargoMaterials.set(key, material);
    }
    return material;
  }

  private buildStructureModel(kind: StructureKind, isPreview = false): THREE.Group {
    let asset = this.assets.get(kind);
    if (!asset) { asset = buildCampStation(kind); this.assets.set(kind, asset); }
    const root = new THREE.Group();
    root.name = `expedition-${kind}`;
    const body = new THREE.Mesh(asset.geometry, isPreview ? this.preview : this.surface);
    body.name = 'stationBody'; body.castShadow = !isPreview; body.receiveShadow = true;
    root.add(body);
    if (asset.animation) {
      const part = asset.animation;
      const animated = new THREE.Mesh(part.geometry, isPreview ? this.preview : part.emissive ? this.warm : this.surface);
      animated.position.set(...part.position);
      animated.name = part.motion === 'pulse' ? 'animPulse' : 'animRotor';
      animated.castShadow = !isPreview; animated.receiveShadow = true;
      root.add(animated);
    }
    if (!isPreview) {
      const cargo = new THREE.Mesh(this.cargoGeometry, this.cargoMaterial());
      cargo.name = 'cargoIndicator'; cargo.position.y = asset.cargoY; cargo.visible = false;
      root.add(cargo);
    }
    return root;
  }

  /** Releases this renderer's bounded prototype cache, never an individual instance's shared assets. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent(); this.group.clear(); this.instances.clear(); this.previewGroup.clear();
    for (const asset of this.assets.values()) { asset.geometry.dispose(); asset.animation?.geometry.dispose(); }
    this.assets.clear();
    this.cargoGeometry.dispose(); this.conduitGeom.dispose();
    (this.conduitLines.material as THREE.Material).dispose();
    this.surface.dispose(); this.warm.dispose(); this.preview.dispose();
    for (const material of this.cargoMaterials.values()) material.dispose();
    this.cargoMaterials.clear();
  }

  /** Orient a structure group so its local +Y aligns with spherical `up` and rotates by `yaw` (right-handed basis det = +1). */
  private applySphericalTransform(
    obj: THREE.Object3D,
    pos: [number, number, number],
    up: [number, number, number],
    east: [number, number, number],
    north: [number, number, number],
    yaw: number,
    camX: number,
    camY: number,
    camZ: number,
  ): void {
    obj.position.set(pos[0] - camX, pos[1] - camY, pos[2] - camZ);
    const cosY = Math.cos(yaw);
    const sinY = Math.sin(yaw);
    // Note: in Goldberg.frameOf(tile), `north = up x east`, so `(east, north, up)` is right-handed (`east x north = +up`).
    // Therefore for `[X, Y, Z]` with `Y = up` to be right-handed (`X x Y = +Z`, i.e. `Z = X x up`),
    // when `Z = fx` (`-east * sinY + north * cosY`), `X` must be `up x Z = -east * cosY - north * sinY`!
    const upVec = this.upVec.set(up[0], up[1], up[2]).normalize();
    const fwdVec = this.fwdVec.set(
      -east[0] * sinY + north[0] * cosY,
      -east[1] * sinY + north[1] * cosY,
      -east[2] * sinY + north[2] * cosY,
    ).normalize();
    const rightVec = this.rightVec.crossVectors(upVec, fwdVec).normalize();
    fwdVec.crossVectors(rightVec, upVec).normalize();

    this.basis.makeBasis(rightVec, upVec, fwdVec);
    obj.quaternion.setFromRotationMatrix(this.basis);
  }

  /** Update the opaque cream placement maquette using the same station geometry. */
  updatePreview(
    geo: Goldberg,
    kind: StructureKind | null,
    anchorTile: number,
    offsetEast: number,
    offsetNorth: number,
    groundRadius: number,
    yaw: number,
    camX: number,
    camY: number,
    camZ: number,
  ): void {
    if (!kind) {
      this.previewGroup.visible = false;
      return;
    }
    if (this.previewKind !== kind) {
      this.previewGroup.clear();
      this.previewGroup.add(this.buildStructureModel(kind, true));
      this.previewKind = kind;
    }
    this.previewGroup.visible = true;
    const frame = structureWorldPosition(geo, { anchorTile, offsetEast, offsetNorth, groundRadius });
    this.applySphericalTransform(
      this.previewGroup,
      frame.pos,
      frame.up,
      frame.east,
      frame.north,
      yaw,
      camX,
      camY,
      camZ,
    );
  }

  /**
   * Synchronize out-of-core structures on `activePlanetId`, updating floating-origin
   * positions and campfire/hearth animations every frame.
   */
  update(
    geo: Goldberg,
    structures: readonly PlacedStructure[],
    links: readonly ConduitLink[],
    camX: number,
    camY: number,
    camZ: number,
    timeSec: number,
  ): void {
    const activeIds = new Set<string>();
    for (const s of structures) {
      activeIds.add(s.id);
      let inst = this.instances.get(s.id);
      if (inst && inst.userData.kind !== s.kind) { this.group.remove(inst); this.instances.delete(s.id); inst = undefined; }
      if (!inst) {
        inst = this.buildStructureModel(s.kind, false);
        inst.userData.structureId = s.id;
        inst.userData.kind = s.kind;
        this.instances.set(s.id, inst);
        this.group.add(inst);
      }

      const frame = structureWorldPosition(geo, s);
      this.applySphericalTransform(inst, frame.pos, frame.up, frame.east, frame.north, s.yaw, camX, camY, camZ);

      inst.traverse((child) => {
        if (child.name === 'animRotor') {
          child.rotation.y = timeSec * 1.2;
        } else if (child.name === 'animPulse') {
          const sFac = 1.0 + Math.sin(timeSec * 5.5 + s.anchorTile) * 0.09;
          child.scale.set(1, sFac, 1);
        } else if (child.name === 'cargoIndicator') {
          child.visible = s.storedCount > 0;
          if (s.storedCount > 0) {
            const cap = Math.max(1, STRUCTURE_DEFS[s.kind].storageCap);
            const fill = Math.min(1, s.storedCount / cap);
            child.scale.setScalar(0.55 + fill * 0.75);
            child.rotation.y = timeSec * 2.2;
            (child as THREE.Mesh).material = this.cargoMaterial(s.outputItem);
          }
        }
      });
    }

    for (const [id, inst] of [...this.instances.entries()]) {
      if (!activeIds.has(id)) {
        this.group.remove(inst);
        this.instances.delete(id);
      }
    }

    if (links.length === 0) {
      this.conduitLines.visible = false;
    } else {
      this.conduitLines.visible = true;
      const segsPerLink = 6;
      const floats = links.length * segsPerLink * 2 * 3;
      let position = this.conduitGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (!position || position.array.length !== floats) {
        position = new THREE.BufferAttribute(new Float32Array(floats), 3).setUsage(THREE.DynamicDrawUsage);
        this.conduitGeom.setAttribute('position', position);
      }
      const verts = position.array as Float32Array;
      let ptr = 0;
      for (const link of links) {
        const ax = link.fromPos[0], ay = link.fromPos[1], az = link.fromPos[2];
        const bx = link.toPos[0], by = link.toPos[1], bz = link.toPos[2];
        for (let s = 0; s < segsPerLink; s++) {
          const t0 = s / segsPerLink;
          const t1 = (s + 1) / segsPerLink;
          const arc0 = 1.2 + Math.sin(t0 * Math.PI) * 1.8;
          const arc1 = 1.2 + Math.sin(t1 * Math.PI) * 1.8;

          const p0x = ax + (bx - ax) * t0, p0y = ay + (by - ay) * t0, p0z = az + (bz - az) * t0;
          const l0 = Math.hypot(p0x, p0y, p0z) || 1;
          const p1x = ax + (bx - ax) * t1, p1y = ay + (by - ay) * t1, p1z = az + (bz - az) * t1;
          const l1 = Math.hypot(p1x, p1y, p1z) || 1;

          verts[ptr++] = p0x + (p0x / l0) * arc0 - camX;
          verts[ptr++] = p0y + (p0y / l0) * arc0 - camY;
          verts[ptr++] = p0z + (p0z / l0) * arc0 - camZ;

          verts[ptr++] = p1x + (p1x / l1) * arc1 - camX;
          verts[ptr++] = p1y + (p1y / l1) * arc1 - camY;
          verts[ptr++] = p1z + (p1z / l1) * arc1 - camZ;
        }
      }
      position.needsUpdate = true;
    }
  }
}
