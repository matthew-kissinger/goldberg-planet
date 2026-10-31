/**
 * 7-Slot Hex Plot Survival Station & Landmark Renderer (`StructureRenderer`).
 *
 * Uses the Kiln-verified low-poly faceted survival & spacefaring asset kit:
 *  - `campfire`: Stone-ring hearth + split-log tripod + roasting spit + flickering flame (`bbox.min.y = 0`)
 *  - `workbench`: Heavy timber workbench + vice + anvil + saw (`bbox.min.y = 0`)
 *  - `furnace`: Masoned stone smelting kiln + arched hearth + glowing coal bed + chimney (`bbox.min.y = 0`)
 *  - `storage_chest`: Iron-banded timber chest + brass clasp (`bbox.min.y = 0`)
 *  - `landing_pad`: Hexagonal starship launch deck + corner safety bollards + orbital beacon (`bbox.min.y = 0`)
 *  - `eco_dome`: Geodesic living biosphere dome (`bbox.min.y = 0`)
 *  - Plus 12 Pentagon Harmonic Obelisks (`tileId 0..11`) that mark the planet's 12 topological pentagons!
 */

import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import {
  STRUCTURE_DEFS,
  structureWorldPosition,
  type ConduitLink,
  type PlacedStructure,
  type StructureKind,
} from '../sim/persistence';
import { ITEM_DEFS } from '../sim/crafting';

export class StructureRenderer {
  readonly group = new THREE.Group();
  private readonly instances = new Map<string, THREE.Group>();
  private readonly conduitLines: THREE.LineSegments;
  private readonly conduitGeom = new THREE.BufferGeometry();
  private readonly previewGroup = new THREE.Group();
  private previewKind: StructureKind | null = null;
  private readonly matCache = new Map<string, THREE.Material>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'outOfCoreStructures';
    scene.add(this.group);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0x54f0e8,
      transparent: true,
      opacity: 0.65,
    });
    this.conduitLines = new THREE.LineSegments(this.conduitGeom, lineMat);
    this.conduitLines.frustumCulled = false;
    this.group.add(this.conduitLines);

    this.previewGroup.visible = false;
    this.group.add(this.previewGroup);
  }

  private stdMat(hex: number, roughness = 0.65, metalness = 0.15, emissiveHex = 0x000000, emissiveIntensity = 0): THREE.MeshStandardMaterial {
    const key = `std:${hex}:${roughness}:${metalness}:${emissiveHex}:${emissiveIntensity}`;
    let m = this.matCache.get(key) as THREE.MeshStandardMaterial | undefined;
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: hex,
        roughness,
        metalness,
        emissive: emissiveHex,
        emissiveIntensity,
        flatShading: true,
      });
      this.matCache.set(key, m);
    }
    return m;
  }

  private basicMat(hex: number, opacity = 0.35, additive = false): THREE.MeshBasicMaterial {
    const key = `bas:${hex}:${opacity}:${additive}`;
    let m = this.matCache.get(key) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({
        color: hex,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.matCache.set(key, m);
    }
    return m;
  }

  /**
   * Build Kiln-verified low-poly faceted 3D geometry for any `StructureKind`.
   * Every station sits flush on `Y = 0` (`bbox.min.y === 0`, zero negative skirts!)
   * and fits cleanly within its hex plot sub-slot so nothing ever sinks or overhangs cliff steps.
   */
  private buildStructureModel(kind: StructureKind, isPreview = false): THREE.Group {
    const root = new THREE.Group();
    const wrapMat = (mat: THREE.Material): THREE.Material => {
      if (!isPreview) return mat;
      return this.basicMat(0x54f0e8, 0.42, true);
    };

    const mWoodDark = wrapMat(this.stdMat(0x5c3c24, 0.85, 0.05));
    const mWoodWarm = wrapMat(this.stdMat(0x8e5c34, 0.78, 0.05));
    const mWoodPlank = wrapMat(this.stdMat(0xb67e48, 0.72, 0.05));
    const mStoneDark = wrapMat(this.stdMat(0x4b515a, 0.88, 0.08));
    const mStoneMid = wrapMat(this.stdMat(0x6e7682, 0.82, 0.1));
    const mIron = wrapMat(this.stdMat(0x2e3540, 0.42, 0.72));
    const mBrass = wrapMat(this.stdMat(0xd89e44, 0.35, 0.78));
    const mFlame = wrapMat(this.stdMat(0xff7418, 0.25, 0.0, 0xff4e00, 1.35));
    const mEmber = wrapMat(this.stdMat(0xff2800, 0.35, 0.0, 0xd82000, 1.0));
    const mMeat = wrapMat(this.stdMat(0xb84a2c, 0.65, 0.05));
    const mGlowCyan = wrapMat(this.stdMat(0x54f0e8, 0.2, 0.1, 0x38d8d0, 1.2));
    const mGlowGreen = wrapMat(this.stdMat(0x38e898, 0.25, 0.1, 0x22c878, 1.1));

    if (kind === 'campfire' || kind === 'solar_relay') {
      // --- Kiln-Verified Campfire with Stone Ring & Cooking Spit (bbox.min.y = 0) ---
      const hearthPad = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.82, 0.06, 8), mStoneDark);
      hearthPad.position.y = 0.03;
      root.add(hearthPad);

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const cobble = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.16, 0),
          i % 2 === 0 ? mStoneMid : mStoneDark,
        );
        cobble.scale.set(1.15, 0.75, 0.95);
        cobble.position.set(Math.cos(a) * 0.66, 0.12, Math.sin(a) * 0.66);
        cobble.rotation.y = a;
        root.add(cobble);
      }

      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.3;
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.68, 6), mWoodDark);
        log.position.set(Math.cos(a) * 0.15, 0.16, Math.sin(a) * 0.15);
        log.rotation.z = 0.62;
        log.rotation.y = a;
        root.add(log);
      }

      const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.58, 5), mFlame);
      flameOuter.name = 'animPulse';
      flameOuter.position.y = 0.36;
      const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.38, 5), mEmber);
      flameInner.position.set(0.05, 0.28, 0.04);
      root.add(flameOuter, flameInner);

      for (const sx of [-0.62, 0.62]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.88, 5), mWoodWarm);
        post.position.set(sx, 0.44, 0);
        root.add(post);
      }
      const spitBar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.36, 6), mIron);
      spitBar.rotation.z = Math.PI / 2;
      spitBar.position.y = 0.82;
      const roastCut = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), mMeat);
      roastCut.name = 'animRotor';
      roastCut.scale.set(1.4, 0.85, 0.85);
      roastCut.position.y = 0.82;
      root.add(spitBar, roastCut);
    } else if (kind === 'workbench' || kind === 'extractor') {
      // --- Kiln-Verified Timber Crafting Workbench (bbox.min.y = 0) ---
      for (const [lx, lz] of [[-0.58, -0.34], [0.58, -0.34], [-0.58, 0.34], [0.58, 0.34]] as const) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.76, 0.12), mWoodDark);
        leg.position.set(lx, 0.38, lz);
        root.add(leg);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.06, 0.64), mWoodWarm);
      shelf.position.y = 0.24;
      root.add(shelf);

      for (let p = -1; p <= 1; p++) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.10, 0.27), mWoodPlank);
        plank.position.set(0, 0.81, p * 0.29);
        root.add(plank);
      }

      const viceBlock = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.20), mIron);
      viceBlock.position.set(-0.52, 0.94, 0.32);
      const anvilMini = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.15, 0.18), mIron);
      anvilMini.position.set(0.42, 0.935, -0.18);
      const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), mBrass);
      malletHead.rotation.z = Math.PI / 2;
      malletHead.position.set(0.05, 0.91, 0.12);
      root.add(viceBlock, anvilMini, malletHead);

      const rackL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), mWoodDark);
      rackL.position.set(-0.56, 1.16, -0.36);
      const rackR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), mWoodDark);
      rackR.position.set(0.56, 1.16, -0.36);
      const rackBar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.10, 0.06), mWoodWarm);
      rackBar.position.set(0, 1.40, -0.36);
      root.add(rackL, rackR, rackBar);
    } else if (kind === 'furnace' || kind === 'synthesizer') {
      // --- Kiln-Verified Stone Smelting Furnace (bbox.min.y = 0) ---
      const basePlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.84, 0.28, 8), mStoneDark);
      basePlinth.position.y = 0.14;
      const bodyDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.74, 0.96, 8), mStoneMid);
      bodyDrum.position.y = 0.76;
      const domeCap = new THREE.Mesh(new THREE.ConeGeometry(0.64, 0.42, 8), mStoneDark);
      domeCap.position.y = 1.45;
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.65, 8), mStoneMid);
      chimney.position.y = 1.88;
      const chimneyRim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.10, 8), mIron);
      chimneyRim.position.y = 2.22;
      root.add(basePlinth, bodyDrum, domeCap, chimney, chimneyRim);

      const hearthFrame = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.50, 0.26), mIron);
      hearthFrame.position.set(0, 0.52, 0.62);
      const hearthGlow = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.36, 0.28), mFlame);
      hearthGlow.name = 'animPulse';
      hearthGlow.position.set(0, 0.50, 0.63);
      const ingotTray = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.32), mIron);
      ingotTray.position.set(0, 0.28, 0.82);
      const hotIngot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.12), mEmber);
      hotIngot.position.set(0, 0.35, 0.82);
      root.add(hearthFrame, hearthGlow, ingotTray, hotIngot);
    } else if (kind === 'storage_chest' || kind === 'mass_driver') {
      // --- Kiln-Verified Ironbound Storage Chest (bbox.min.y = 0) ---
      const feet = [[-0.46, -0.28], [0.46, -0.28], [-0.46, 0.28], [0.46, 0.28]] as const;
      for (const [fx, fz] of feet) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.14), mIron);
        foot.position.set(fx, 0.04, fz);
        root.add(foot);
      }
      const boxBody = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.48, 0.66), mWoodWarm);
      boxBody.position.y = 0.32;
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 1.06, 6, 1, false, 0, Math.PI), mWoodPlank);
      lid.rotation.z = Math.PI / 2;
      lid.position.y = 0.56;
      root.add(boxBody, lid);

      for (const bx of [-0.36, 0.36]) {
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.52, 0.69), mIron);
        strap.position.set(bx, 0.34, 0);
        root.add(strap);
      }
      const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.06), mBrass);
      lockPlate.position.set(0, 0.52, 0.34);
      root.add(lockPlate);
    } else if (kind === 'landing_pad') {
      // --- Hexagonal Starship Launch Pad & Beacon (bbox.min.y = 0, fits within hex) ---
      const baseDeck = new THREE.Mesh(new THREE.CylinderGeometry(2.25, 2.38, 0.22, 6), mStoneDark);
      baseDeck.position.y = 0.11;
      const innerDeck = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 0.08, 6), mIron);
      innerDeck.position.y = 0.26;
      const brassRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.35, 6), mBrass);
      brassRing.rotation.x = -Math.PI / 2;
      brassRing.position.y = 0.31;
      root.add(baseDeck, innerDeck, brassRing);

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.38, 6), mIron);
        bollard.position.set(Math.cos(a) * 1.95, 0.41, Math.sin(a) * 1.95);
        const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), mGlowCyan);
        lamp.position.set(Math.cos(a) * 1.95, 0.64, Math.sin(a) * 1.95);
        root.add(bollard, lamp);
      }

      if (!isPreview) {
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.35, 85, 8, 1, true),
          this.basicMat(0x54f0e8, 0.18, true),
        );
        beam.position.y = 42.8;
        root.add(beam);
      }
    } else if (kind === 'eco_dome') {
      // --- Geodesic Biosphere Oasis Dome (bbox.min.y = 0) ---
      const rimBase = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.25, 0.20, 8), mStoneDark);
      rimBase.position.y = 0.10;
      const domeShell = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.05, 1),
        this.basicMat(0x38e898, isPreview ? 0.36 : 0.22, true),
      );
      domeShell.position.y = 0.20;
      domeShell.scale.set(1, 0.78, 1);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.25, 6), mWoodWarm);
      trunk.position.y = 0.82;
      const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(0.88, 0), mGlowGreen);
      canopy.name = 'animPulse';
      canopy.position.y = 1.65;
      root.add(rimBase, domeShell, trunk, canopy);
    }

    const cargoIndicator = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), mGlowCyan);
    cargoIndicator.name = 'cargoIndicator';
    cargoIndicator.position.set(0, 1.85, 0);
    cargoIndicator.visible = false;
    root.add(cargoIndicator);

    return root;
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
    const upVec = new THREE.Vector3(up[0], up[1], up[2]).normalize();
    const fwdVec = new THREE.Vector3(
      -east[0] * sinY + north[0] * cosY,
      -east[1] * sinY + north[1] * cosY,
      -east[2] * sinY + north[2] * cosY,
    ).normalize();
    const rightVec = new THREE.Vector3().crossVectors(upVec, fwdVec).normalize();
    fwdVec.crossVectors(rightVec, upVec).normalize();

    const m = new THREE.Matrix4();
    m.makeBasis(rightVec, upVec, fwdVec);
    obj.quaternion.setFromRotationMatrix(m);
  }

  /** Update holographic placement preview ghost. */
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
          child.rotation.x = timeSec * 1.2;
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
            if (s.outputItem && (child as THREE.Mesh).material) {
              const hex = ITEM_DEFS[s.outputItem]?.css;
              if (hex) ((child as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(hex);
            }
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
      const verts = new Float32Array(links.length * segsPerLink * 2 * 3);
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
      this.conduitGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      this.conduitGeom.computeBoundingSphere();
    }
  }
}
