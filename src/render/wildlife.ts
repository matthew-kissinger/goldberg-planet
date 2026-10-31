/**
 * Planetary Procedural Wildlife & Ecosystem Simulation (`WildlifeManager`).
 *
 * Synthesizes and simulates infinitely varied low-poly fauna (`quadruped`, `biped`,
 * `avian` birds, and `aquatic` fish) driven by deterministic `CreatureDna` (`wildlifePool.ts`):
 *  - Land Quadrupeds & Bipedals: graze, wander, flee when struck (herbivores) or stalk/lunge
 *    at the player (predators), grounded flush at `Y = 0` (`det = +1` right-handed spherical basis).
 *  - Avian Sky-Gliders: soar and circle at `8–20 m AGL` with articulated flapping wings.
 *  - Aquatic Fish & Reef-Leviathans: swim in coastal waters, lagoons, and rivers below `waterSurface`
 *    with oscillating caudal & pectoral fins.
 */

import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { Player } from '../player/player';
import type { ItemId } from '../sim/crafting';
import {
  generateCreatureDna,
  type CreatureDiet,
  type CreatureDna,
  type CreatureLocomotion,
} from '../world/wildlifePool';

export type CreatureKind = 'stag' | 'wolf' | 'biped' | 'avian' | 'aquatic';

export interface WildlifeCreature {
  id: string;
  kind: CreatureKind;
  speciesName: string;
  locomotion: CreatureLocomotion;
  diet: CreatureDiet;
  dna: CreatureDna;
  tile: number;
  px: number;
  py: number;
  pz: number;
  fwdX: number;
  fwdY: number;
  fwdZ: number;
  hp: number;
  maxHp: number;
  state: 'graze' | 'wander' | 'flee' | 'stalk' | 'attack' | 'soar' | 'swim';
  stateTimer: number;
  attackCooldown: number;
  hurtFlash: number;
  walkPhase: number;
  meshGroup: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  tailFin: THREE.Object3D | null;
}

export interface HuntStrikeOutcome {
  hit: boolean;
  killed: boolean;
  creature?: WildlifeCreature;
  drops: Array<{ item: ItemId; count: number }>;
}

export class WildlifeManager {
  readonly group = new THREE.Group();
  readonly creatures: WildlifeCreature[] = [];
  private seq = 1;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'planetaryWildlife';
    scene.add(this.group);
  }

  /** Clear all active creatures (e.g. when switching planets). */
  clear(): void {
    for (const c of this.creatures) {
      this.group.remove(c.meshGroup);
    }
    this.creatures.length = 0;
  }

  /**
   * Procedurally assemble a 3D low-poly creature mesh from its `CreatureDna`.
   * Local forward is `+Z`, local up is `+Y`, and feet/hooves touch `Y = 0` (`bbox.min.y = 0`).
   */
  private buildProceduralMesh(dna: CreatureDna): {
    root: THREE.Group;
    legs: THREE.Object3D[];
    wings: THREE.Object3D[];
    tailFin: THREE.Object3D | null;
  } {
    const root = new THREE.Group();
    const legs: THREE.Object3D[] = [];
    const wings: THREE.Object3D[] = [];
    let tailFin: THREE.Object3D | null = null;

    const mPrimary = new THREE.MeshStandardMaterial({
      color: dna.primaryColor,
      roughness: dna.locomotion === 'aquatic' ? 0.35 : 0.72,
      metalness: dna.locomotion === 'aquatic' ? 0.22 : 0.06,
      flatShading: true,
    });
    const mSecondary = new THREE.MeshStandardMaterial({
      color: dna.secondaryColor,
      roughness: 0.76,
      metalness: 0.05,
      flatShading: true,
    });
    const mAccent = new THREE.MeshStandardMaterial({
      color: dna.accentColor,
      roughness: 0.38,
      metalness: 0.15,
      emissive: dna.emissiveAccent ? dna.accentColor : 0x000000,
      emissiveIntensity: dna.emissiveAccent ? 0.55 : 0,
      flatShading: true,
    });
    const mEye = new THREE.MeshStandardMaterial({
      color: dna.eyeColor,
      roughness: 0.2,
      emissive: dna.eyeColor,
      emissiveIntensity: 1.2,
      flatShading: true,
    });
    const mDark = new THREE.MeshStandardMaterial({
      color: 0x222832,
      roughness: 0.65,
      metalness: 0.15,
      flatShading: true,
    });

    if (dna.locomotion === 'avian') {
      // Flying Avian Bird / Sky-Glider (forward = +Z)
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(dna.bodyWidth * 0.5, dna.bodyWidth * 0.38, dna.bodyLength, 7),
        mPrimary,
      );
      body.rotation.x = Math.PI / 2;
      body.position.set(0, 0.22, 0);

      const breast = new THREE.Mesh(
        new THREE.SphereGeometry(dna.bodyWidth * 0.48, 7, 5),
        mSecondary,
      );
      breast.position.set(0, 0.18, dna.bodyLength * 0.35);

      const head = new THREE.Mesh(new THREE.SphereGeometry(dna.bodyWidth * 0.42, 7, 6), mPrimary);
      head.position.set(0, 0.30, dna.bodyLength * 0.56);

      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 5), mAccent);
      beak.rotation.x = Math.PI / 2;
      beak.position.set(0, 0.28, dna.bodyLength * 0.56 + 0.18);

      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), mEye);
        eye.position.set(sx * dna.bodyWidth * 0.36, 0.32, dna.bodyLength * 0.62);
        root.add(eye);
      }

      if (dna.hornStyle === 'dorsal_crest') {
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.24), mAccent);
        crest.position.set(0, 0.40, dna.bodyLength * 0.48);
        crest.rotation.x = -0.35;
        root.add(crest);
      }

      // Articulated Left & Right Wing Pivots
      const halfSpan = dna.wingSpan * 0.5;
      for (const sx of [-1, 1]) {
        const wingPivot = new THREE.Group();
        wingPivot.position.set(sx * dna.bodyWidth * 0.35, 0.25, 0.04);

        const innerWing = new THREE.Mesh(
          new THREE.BoxGeometry(halfSpan * 0.58, 0.035, dna.bodyLength * 0.48),
          mPrimary,
        );
        innerWing.position.set(sx * halfSpan * 0.28, 0, 0);

        const outerWing = new THREE.Mesh(
          new THREE.BoxGeometry(halfSpan * 0.48, 0.028, dna.bodyLength * 0.34),
          mAccent,
        );
        outerWing.position.set(sx * halfSpan * 0.74, 0.03, -0.05);
        outerWing.rotation.y = -sx * 0.18;

        wingPivot.add(innerWing, outerWing);
        root.add(wingPivot);
        wings.push(wingPivot);
      }

      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(dna.bodyWidth * 1.4, 0.03, 0.34),
        mAccent,
      );
      tail.position.set(0, 0.22, -dna.bodyLength * 0.58);
      tail.rotation.x = 0.14;

      root.add(body, breast, head, beak, tail);
      root.scale.setScalar(dna.scale);
      return { root, legs, wings, tailFin };
    }

    if (dna.locomotion === 'aquatic') {
      // Swimming Fish / Reef-Leviathan (forward = +Z)
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(dna.bodyHeight * 0.5, dna.bodyHeight * 0.36, dna.bodyLength, 8),
        mPrimary,
      );
      body.rotation.x = Math.PI / 2;
      body.scale.set(0.68, 1.0, 1.12);
      body.position.set(0, 0.25, 0);

      const snout = new THREE.Mesh(
        new THREE.ConeGeometry(dna.bodyHeight * 0.48, 0.28, 7),
        mPrimary,
      );
      snout.rotation.x = Math.PI / 2;
      snout.scale.set(0.68, 1.0, 1.0);
      snout.position.set(0, 0.25, dna.bodyLength * 0.5 + 0.12);

      const dorsal = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, dna.bodyHeight * 0.85, dna.bodyLength * 0.48),
        mAccent,
      );
      dorsal.position.set(0, 0.25 + dna.bodyHeight * 0.55, -0.04);
      dorsal.rotation.x = 0.28;

      const tailPivot = new THREE.Group();
      tailPivot.position.set(0, 0.25, -dna.bodyLength * 0.5);
      const caudal = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, dna.bodyHeight * 1.25, 0.30),
        mAccent,
      );
      caudal.position.set(0, 0, -0.14);
      tailPivot.add(caudal);
      tailFin = tailPivot;

      for (const sx of [-1, 1]) {
        const pec = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.028, 0.16), mAccent);
        pec.position.set(sx * dna.bodyWidth * 0.65, 0.18, 0.12);
        pec.rotation.set(0.2, -sx * 0.3, sx * 0.35);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), mEye);
        eye.position.set(sx * dna.bodyWidth * 0.42, 0.28, dna.bodyLength * 0.48);
        root.add(pec, eye);
      }

      root.add(body, snout, dorsal, tailPivot);
      root.scale.setScalar(dna.scale);
      return { root, legs, wings, tailFin };
    }

    if (dna.locomotion === 'biped') {
      // Two-legged Raptor-Strider / Bipedal Runner (grounded at Y = 0)
      const legH = dna.legLength;
      for (const sx of [-0.18, 0.18]) {
        const legPivot = new THREE.Group();
        legPivot.position.set(sx, legH, 0);

        const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, legH * 0.55, 6), mPrimary);
        thigh.position.set(0, -legH * 0.24, 0.02);
        thigh.rotation.x = -0.25;

        const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.035, legH * 0.58, 6), mSecondary);
        shin.position.set(0, -legH * 0.68, -0.03);
        shin.rotation.x = 0.22;

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.24), mDark);
        foot.position.set(0, -legH + 0.03, 0.04);

        legPivot.add(thigh, shin, foot);
        root.add(legPivot);
        legs.push(legPivot);
      }

      const torsoY = legH + dna.bodyHeight * 0.35;
      const torso = new THREE.Mesh(
        new THREE.CylinderGeometry(dna.bodyWidth * 0.46, dna.bodyWidth * 0.54, dna.bodyLength, 7),
        mPrimary,
      );
      torso.rotation.x = 1.18;
      torso.position.set(0, torsoY, 0);

      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.105, dna.neckLength, 6),
        mPrimary,
      );
      neck.position.set(0, torsoY + dna.neckLength * 0.55, dna.bodyLength * 0.44);
      neck.rotation.x = dna.neckAngle;

      const headY = torsoY + dna.neckLength * 0.92;
      const headZ = dna.bodyLength * 0.62;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.38, 6), mPrimary);
      head.rotation.x = Math.PI / 2;
      head.position.set(0, headY, headZ);

      for (const sx of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.035, 0.04), mEye);
        eye.position.set(sx * 0.09, headY + 0.03, headZ + 0.04);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), mSecondary);
        arm.position.set(sx * dna.bodyWidth * 0.48, torsoY - 0.04, dna.bodyLength * 0.25);
        arm.rotation.x = 0.45;
        root.add(eye, arm);
      }

      if (dna.hornStyle !== 'none') {
        const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.32), mAccent);
        crest.position.set(0, headY + 0.12, headZ - 0.06);
        crest.rotation.x = -0.28;
        root.add(crest);
      }

      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.78, 6), mPrimary);
      tail.rotation.x = -1.42;
      tail.position.set(0, torsoY - 0.04, -dna.bodyLength * 0.68);
      root.add(torso, neck, head, tail);

      if (dna.tailStyle === 'feathered_fan') {
        const fan = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.035, 0.26), mAccent);
        fan.position.set(0, torsoY - 0.08, -dna.bodyLength * 1.05);
        root.add(fan);
      }

      root.scale.setScalar(dna.scale);
      return { root, legs, wings, tailFin };
    }

    // Default: Procedural Quadruped (4-legged herbivore or predator, grounded at Y = 0)
    const legH = dna.legLength;
    const lxOff = dna.bodyWidth * 0.38;
    const lzOff = dna.bodyLength * 0.35;
    const legCoords = [
      [-lxOff, -lzOff],
      [lxOff, -lzOff],
      [-lxOff, lzOff],
      [lxOff, lzOff],
    ] as const;

    for (const [lx, lz] of legCoords) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, legH, 5), mPrimary);
      leg.position.set(lx, legH * 0.5, lz);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.09, 5), mDark);
      hoof.position.set(0, -legH * 0.5 + 0.045, 0);
      leg.add(hoof);
      root.add(leg);
      legs.push(leg);
    }

    const torsoY = legH + dna.bodyHeight * 0.42;
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(dna.bodyWidth, dna.bodyHeight, dna.bodyLength),
      mPrimary,
    );
    torso.position.set(0, torsoY, 0);

    const belly = new THREE.Mesh(
      new THREE.BoxGeometry(dna.bodyWidth * 0.86, dna.bodyHeight * 0.28, dna.bodyLength * 0.88),
      mSecondary,
    );
    belly.position.set(0, torsoY - dna.bodyHeight * 0.42, 0);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(dna.bodyWidth * 0.25, dna.bodyWidth * 0.34, dna.neckLength, 6),
      mPrimary,
    );
    neck.position.set(0, torsoY + dna.bodyHeight * 0.35 + dna.neckLength * 0.28, dna.bodyLength * 0.40);
    neck.rotation.x = dna.neckAngle;

    const headY = torsoY + dna.bodyHeight * 0.35 + dna.neckLength * 0.68;
    const headZ = dna.bodyLength * 0.54 + Math.sin(dna.neckAngle) * dna.neckLength * 0.35;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(dna.bodyWidth * 0.54, dna.bodyHeight * 0.52, 0.40),
      mPrimary,
    );
    head.position.set(0, headY, headZ);

    const snout = new THREE.Mesh(
      new THREE.BoxGeometry(dna.bodyWidth * 0.36, dna.bodyHeight * 0.34, 0.24),
      dna.diet === 'predator' ? mPrimary : mSecondary,
    );
    snout.position.set(0, headY - 0.04, headZ + 0.24);

    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.04), mEye);
      eye.position.set(sx * dna.bodyWidth * 0.28, headY + 0.03, headZ + 0.14);
      root.add(eye);
    }

    // Procedural Horns / Antlers / Crown / Tusks
    if (dna.hornStyle === 'branched_antlers') {
      for (const sx of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.042, 0.48, 5), mSecondary);
        beam.position.set(sx * 0.15, headY + 0.28, headZ - 0.04);
        beam.rotation.z = -sx * 0.42;
        beam.rotation.x = -0.22;
        const tine1 = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.26, 5), mSecondary);
        tine1.position.set(sx * 0.25, headY + 0.36, headZ + 0.08);
        tine1.rotation.x = 0.55;
        const tine2 = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.24, 5), mSecondary);
        tine2.position.set(sx * 0.29, headY + 0.46, headZ - 0.08);
        tine2.rotation.z = -sx * 0.65;
        root.add(beam, tine1, tine2);
      }
    } else if (dna.hornStyle === 'curved_horns') {
      for (const sx of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.38, 6), mAccent);
        horn.position.set(sx * 0.18, headY + 0.18, headZ - 0.05);
        horn.rotation.set(0.45, 0, -sx * 0.58);
        root.add(horn);
      }
    } else if (dna.hornStyle === 'crystal_crown') {
      for (let i = -1; i <= 1; i++) {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.32 - Math.abs(i) * 0.06, 5), mAccent);
        spire.position.set(i * 0.10, headY + 0.22, headZ - 0.02);
        spire.rotation.z = -i * 0.25;
        root.add(spire);
      }
    } else if (dna.hornStyle === 'tusks') {
      for (const sx of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.26, 5), mSecondary);
        tusk.position.set(sx * 0.14, headY - 0.06, headZ + 0.32);
        tusk.rotation.x = 0.65;
        root.add(tusk);
      }
    } else {
      // Lupine ears
      for (const sx of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.18, 4), mPrimary);
        ear.position.set(sx * 0.13, headY + 0.16, headZ - 0.06);
        root.add(ear);
      }
    }

    // Procedural Dorsal Feature
    if (dna.dorsalStyle === 'ridge_plates' || dna.dorsalStyle === 'glowing_spores') {
      for (let i = 0; i < 4; i++) {
        const zOff = (i - 1.5) * (dna.bodyLength * 0.22);
        const plate = new THREE.Mesh(
          dna.dorsalStyle === 'glowing_spores'
            ? new THREE.SphereGeometry(0.075, 6, 5)
            : new THREE.ConeGeometry(0.06, 0.18, 4),
          mAccent,
        );
        plate.position.set(0, torsoY + dna.bodyHeight * 0.54, zOff);
        root.add(plate);
      }
    } else if (dna.dorsalStyle === 'sail_fin') {
      const sail = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, dna.bodyHeight * 0.65, dna.bodyLength * 0.72),
        mAccent,
      );
      sail.position.set(0, torsoY + dna.bodyHeight * 0.62, 0);
      root.add(sail);
    }

    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, dna.tailStyle === 'long_whip' ? 0.54 : 0.26, 5),
      mSecondary,
    );
    tail.position.set(0, torsoY + 0.04, -dna.bodyLength * 0.56);
    tail.rotation.x = -0.85;

    root.add(torso, belly, neck, head, snout, tail);
    root.scale.setScalar(dna.scale);
    return { root, legs, wings, tailFin };
  }

  /**
   * Spawn a procedural creature on `tile`.
   * Supports `'stag'`, `'wolf'`, `'biped'`, `'avian'`, or `'aquatic'`.
   */
  spawnOnTile(
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    tile: number,
    kind: CreatureKind = 'stag',
  ): WildlifeCreature | null {
    const topK = columns.topLayerOf(tile);
    const rG = layers.topRadius(topK);
    const hasOcean = columns.terrain.config.ocean.hasOcean;
    const isUnderwater = hasOcean && rG <= layers.waterSurface + 0.25;

    if (kind === 'aquatic') {
      if (!isUnderwater) return null;
    } else if (kind !== 'avian') {
      if (isUnderwater) return null;
    }

    const arch = columns.terrain.archetype;
    const seed = columns.terrain.seed;
    const locomotion: CreatureLocomotion =
      kind === 'avian'
        ? 'avian'
        : kind === 'aquatic'
          ? 'aquatic'
          : kind === 'biped'
            ? 'biped'
            : 'quadruped';
    const diet: CreatureDiet =
      kind === 'wolf' || (kind === 'biped' && this.seq % 2 === 0) ? 'predator' : 'herbivore';

    const dna = generateCreatureDna(seed, arch, locomotion, diet, this.seq);
    const f = geo.frameOf(tile);
    const ux = f.normal[0], uy = f.normal[1], uz = f.normal[2];
    const built = this.buildProceduralMesh(dna);
    this.group.add(built.root);

    const spawnRadius =
      locomotion === 'avian'
        ? Math.max(rG, layers.waterSurface) + dna.flightAGL
        : locomotion === 'aquatic'
          ? Math.max(rG + 0.35, layers.waterSurface - dna.swimDepth)
          : rG;

    const creature: WildlifeCreature = {
      id: `wildlife-${this.seq++}`,
      kind,
      speciesName: dna.name,
      locomotion,
      diet,
      dna,
      tile,
      px: ux * spawnRadius,
      py: uy * spawnRadius,
      pz: uz * spawnRadius,
      fwdX: f.east[0],
      fwdY: f.east[1],
      fwdZ: f.east[2],
      hp: dna.maxHp,
      maxHp: dna.maxHp,
      state:
        locomotion === 'avian'
          ? 'soar'
          : locomotion === 'aquatic'
            ? 'swim'
            : diet === 'herbivore'
              ? 'graze'
              : 'wander',
      stateTimer: 2 + Math.random() * 4,
      attackCooldown: 0,
      hurtFlash: 0,
      walkPhase: Math.random() * 6.28,
      meshGroup: built.root,
      legs: built.legs,
      wings: built.wings,
      tailFin: built.tailFin,
    };
    this.creatures.push(creature);
    return creature;
  }

  /**
   * Maintain a rich multi-guild ecosystem around the player (up to 10 creatures):
   *  - Quadruped grazers & predators
   *  - Bipedal striders & raptors
   *  - Avian sky-gliders soaring overhead
   *  - Aquatic fish swimming in nearby coastal waters/rivers
   */
  private maintainPopulation(geo: Goldberg, layers: Layers, columns: Columns, player: Player): void {
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i]!;
      const d = Math.hypot(c.px - player.px, c.py - player.py, c.pz - player.pz);
      if (d > 95) {
        this.group.remove(c.meshGroup);
        this.creatures.splice(i, 1);
      }
    }

    if (this.creatures.length >= 10 || player.inSpaceCruise) return;

    const seen = new Set<number>([player.tile]);
    let frontier = [player.tile];
    const landCandidates: number[] = [];
    const waterCandidates: number[] = [];
    const hasOcean = columns.terrain.config.ocean.hasOcean;

    for (let ring = 1; ring <= 6; ring++) {
      const next: number[] = [];
      for (const t of frontier) {
        const deg = geo.degreeOf(t);
        for (let e = 0; e < deg; e++) {
          const n = geo.neighbor(t, e);
          if (seen.has(n)) continue;
          seen.add(n);
          next.push(n);
          if (ring >= 2) {
            const rG = layers.topRadius(columns.topLayerOf(n));
            if (hasOcean && rG <= layers.waterSurface + 0.25) {
              waterCandidates.push(n);
            } else {
              landCandidates.push(n);
            }
          }
        }
      }
      frontier = next;
    }

    const avians = this.creatures.filter((c) => c.locomotion === 'avian').length;
    const aquatics = this.creatures.filter((c) => c.locomotion === 'aquatic').length;
    const bipeds = this.creatures.filter((c) => c.locomotion === 'biped').length;
    const wolves = this.creatures.filter((c) => c.diet === 'predator' && c.locomotion !== 'avian').length;

    let desiredKind: CreatureKind = 'stag';
    if (avians < 2 && (landCandidates.length > 0 || waterCandidates.length > 0)) {
      desiredKind = 'avian';
    } else if (aquatics < 2 && waterCandidates.length > 0) {
      desiredKind = 'aquatic';
    } else if (bipeds < 2 && landCandidates.length > 0) {
      desiredKind = 'biped';
    } else if (wolves < 2 && this.creatures.length >= 2) {
      desiredKind = 'wolf';
    }

    const pool = desiredKind === 'aquatic' ? waterCandidates : landCandidates.length > 0 ? landCandidates : waterCandidates;
    if (pool.length === 0) return;

    for (let attempt = 0; attempt < 8; attempt++) {
      const pickTile = pool[(this.seq * 19 + attempt * 11) % pool.length]!;
      if (this.creatures.some((c) => c.tile === pickTile)) continue;
      if (this.spawnOnTile(geo, layers, columns, pickTile, desiredKind)) break;
    }
  }

  /**
   * Test a player melee/spear strike from `eye` along `dir` (`maxReach` meters).
   */
  strikeNearest(
    px: number,
    py: number,
    pz: number,
    dirX: number,
    dirY: number,
    dirZ: number,
    damage = 1,
    maxReach = 8.5,
  ): HuntStrikeOutcome {
    let best: WildlifeCreature | null = null;
    let bestScore = Infinity;

    for (const c of this.creatures) {
      const vx = c.px - px;
      const vy = c.py - py;
      const vz = c.pz - pz;
      const dist = Math.hypot(vx, vy, vz);
      if (dist > maxReach) continue;
      const dot = (vx * dirX + vy * dirY + vz * dirZ) / (dist || 1);
      if (dist > 3.5 && dot < 0.32) continue;
      const score = dist * (1.2 - dot * 0.5);
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (!best) return { hit: false, killed: false, drops: [] };

    best.hp = Math.max(0, best.hp - damage);
    best.hurtFlash = 0.35;
    if (best.diet === 'herbivore' || best.locomotion === 'avian' || best.locomotion === 'aquatic') {
      best.state = 'flee';
      best.stateTimer = 4.0;
    } else {
      best.state = 'attack';
      best.stateTimer = 5.0;
    }

    if (best.hp <= 0) {
      const idx = this.creatures.indexOf(best);
      if (idx >= 0) this.creatures.splice(idx, 1);
      this.group.remove(best.meshGroup);
      const drops: Array<{ item: ItemId; count: number }> =
        best.diet === 'predator'
          ? [
              { item: 'raw_meat', count: 2 },
              { item: 'hide', count: 2 },
              { item: 'bone', count: 2 },
            ]
          : [
              { item: 'raw_meat', count: 2 },
              { item: 'hide', count: 1 },
              { item: 'bone', count: 1 },
            ];
      return { hit: true, killed: true, creature: best, drops };
    }

    return { hit: true, killed: false, creature: best, drops: [] };
  }

  /**
   * Step creature AI, spherical locomotion (ground, avian flight, aquatic swimming),
   * predator lunge attacks, and floating-origin transforms.
   */
  update(
    dt: number,
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    player: Player,
    camX: number,
    camY: number,
    camZ: number,
  ): { playerDamage: number; attackerName?: string } {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.25;
      this.maintainPopulation(geo, layers, columns, player);
    }

    let playerDamage = 0;
    let attackerName: string | undefined;

    const upVec = new THREE.Vector3();
    const fwdVec = new THREE.Vector3();
    const rightVec = new THREE.Vector3();
    const basisMat = new THREE.Matrix4();

    for (const c of this.creatures) {
      c.stateTimer -= dt;
      c.attackCooldown = Math.max(0, c.attackCooldown - dt);
      c.hurtFlash = Math.max(0, c.hurtFlash - dt);

      const r = Math.hypot(c.px, c.py, c.pz) || 1;
      const ux = c.px / r, uy = c.py / r, uz = c.pz / r;

      const toPlayerX = player.px - c.px;
      const toPlayerY = player.py - c.py;
      const toPlayerZ = player.pz - c.pz;
      const distToPlayer = Math.hypot(toPlayerX, toPlayerY, toPlayerZ);

      let speed = 0;

      if (c.locomotion === 'avian') {
        // Avian birds soar continuously and gently bank in large circles overhead
        speed = c.state === 'flee' ? c.dna.runSpeed : c.dna.walkSpeed;
        const turnRate = 0.42;
        const rightX = uy * c.fwdZ - uz * c.fwdY;
        const rightY = uz * c.fwdX - ux * c.fwdZ;
        const rightZ = ux * c.fwdY - uy * c.fwdX;
        c.fwdX += rightX * turnRate * dt;
        c.fwdY += rightY * turnRate * dt;
        c.fwdZ += rightZ * turnRate * dt;

        const nx = c.px + c.fwdX * speed * dt;
        const ny = c.py + c.fwdY * speed * dt;
        const nz = c.pz + c.fwdZ * speed * dt;
        const nextTile = geo.tileOf(nx, ny, nz);
        const groundR = Math.max(layers.topRadius(columns.topLayerOf(nextTile)), layers.waterSurface);
        const targetR = groundR + c.dna.flightAGL + Math.sin(c.walkPhase * 0.5) * 1.4;
        const nl = Math.hypot(nx, ny, nz) || 1;
        c.px = (nx / nl) * targetR;
        c.py = (ny / nl) * targetR;
        c.pz = (nz / nl) * targetR;
        c.tile = nextTile;
        c.walkPhase += dt * 7.5;

        // Flap articulated wings
        const flap = Math.sin(c.walkPhase) * 0.48;
        if (c.wings.length === 2) {
          c.wings[0]!.rotation.z = flap;
          c.wings[1]!.rotation.z = -flap;
        }
      } else if (c.locomotion === 'aquatic') {
        // Aquatic fish swim through water tiles and turn back at shorelines
        speed = c.state === 'flee' ? c.dna.runSpeed : c.dna.walkSpeed;
        if (c.stateTimer <= 0) {
          c.stateTimer = 2.5 + Math.random() * 3.5;
          const f = geo.frameOf(c.tile);
          const ang = Math.random() * Math.PI * 2;
          c.fwdX = f.east[0] * Math.cos(ang) + f.north[0] * Math.sin(ang);
          c.fwdY = f.east[1] * Math.cos(ang) + f.north[1] * Math.sin(ang);
          c.fwdZ = f.east[2] * Math.cos(ang) + f.north[2] * Math.sin(ang);
        }

        const nx = c.px + c.fwdX * speed * dt;
        const ny = c.py + c.fwdY * speed * dt;
        const nz = c.pz + c.fwdZ * speed * dt;
        const nextTile = geo.tileOf(nx, ny, nz);
        const nextGroundR = layers.topRadius(columns.topLayerOf(nextTile));
        if (nextGroundR <= layers.waterSurface - 0.15) {
          const swimR = Math.max(nextGroundR + 0.35, layers.waterSurface - c.dna.swimDepth);
          const nl = Math.hypot(nx, ny, nz) || 1;
          c.px = (nx / nl) * swimR;
          c.py = (ny / nl) * swimR;
          c.pz = (nz / nl) * swimR;
          c.tile = nextTile;
        } else {
          c.fwdX = -c.fwdX; c.fwdY = -c.fwdY; c.fwdZ = -c.fwdZ;
        }
        c.walkPhase += dt * speed * 3.6;
        if (c.tailFin) {
          c.tailFin.rotation.y = Math.sin(c.walkPhase) * 0.45;
        }
      } else {
        // Terrestrial Quadrupeds & Bipedals
        if (c.diet === 'herbivore') {
          if (distToPlayer < 6.0 && c.state !== 'flee') {
            c.state = 'flee';
            c.stateTimer = 3.2;
          }
          if (c.state === 'flee') {
            let awayX = -toPlayerX, awayY = -toPlayerY, awayZ = -toPlayerZ;
            const dotU = awayX * ux + awayY * uy + awayZ * uz;
            awayX -= dotU * ux; awayY -= dotU * uy; awayZ -= dotU * uz;
            const al = Math.hypot(awayX, awayY, awayZ) || 1;
            c.fwdX = awayX / al; c.fwdY = awayY / al; c.fwdZ = awayZ / al;
            speed = c.dna.runSpeed;
            if (c.stateTimer <= 0) {
              c.state = 'graze';
              c.stateTimer = 3.0 + Math.random() * 3.0;
            }
          } else if (c.state === 'wander') {
            speed = c.dna.walkSpeed;
            if (c.stateTimer <= 0) {
              c.state = 'graze';
              c.stateTimer = 2.5 + Math.random() * 3.5;
            }
          } else {
            speed = 0;
            if (c.stateTimer <= 0) {
              c.state = 'wander';
              c.stateTimer = 2.5 + Math.random() * 3.0;
              const f = geo.frameOf(c.tile);
              const ang = Math.random() * Math.PI * 2;
              c.fwdX = f.east[0] * Math.cos(ang) + f.north[0] * Math.sin(ang);
              c.fwdY = f.east[1] * Math.cos(ang) + f.north[1] * Math.sin(ang);
              c.fwdZ = f.east[2] * Math.cos(ang) + f.north[2] * Math.sin(ang);
            }
          }
        } else {
          // Territorial Predator AI (Quadruped Wolf or Bipedal Raptor)
          if (distToPlayer < 13.5 && !player.inSafeAura && player.mode === 'walk') {
            c.state = 'attack';
            let tx = toPlayerX, ty = toPlayerY, tz = toPlayerZ;
            const dotU = tx * ux + ty * uy + tz * uz;
            tx -= dotU * ux; ty -= dotU * uy; tz -= dotU * uz;
            const tl = Math.hypot(tx, ty, tz) || 1;
            c.fwdX = tx / tl; c.fwdY = ty / tl; c.fwdZ = tz / tl;

            if (distToPlayer > 2.3) {
              speed = c.dna.runSpeed;
            } else if (c.attackCooldown <= 0) {
              c.attackCooldown = 1.75;
              playerDamage += 10;
              attackerName = c.speciesName;
            }
          } else {
            speed = c.dna.walkSpeed;
            if (c.stateTimer <= 0) {
              c.stateTimer = 3.0 + Math.random() * 3.0;
              const f = geo.frameOf(c.tile);
              const ang = Math.random() * Math.PI * 2;
              c.fwdX = f.east[0] * Math.cos(ang) + f.north[0] * Math.sin(ang);
              c.fwdY = f.east[1] * Math.cos(ang) + f.north[1] * Math.sin(ang);
              c.fwdZ = f.east[2] * Math.cos(ang) + f.north[2] * Math.sin(ang);
            }
          }
        }

        if (speed > 0.05) {
          const nx = c.px + c.fwdX * speed * dt;
          const ny = c.py + c.fwdY * speed * dt;
          const nz = c.pz + c.fwdZ * speed * dt;
          const nextTile = geo.tileOf(nx, ny, nz);
          const nextTop = columns.topLayerOf(nextTile);
          const nextR = layers.topRadius(nextTop);
          const curR = layers.topRadius(columns.topLayerOf(c.tile));
          const isUnderwater = columns.terrain.config.ocean.hasOcean && nextR <= layers.waterSurface + 0.2;

          if (!isUnderwater && Math.abs(nextR - curR) <= 1.6) {
            const nl = Math.hypot(nx, ny, nz) || 1;
            c.px = (nx / nl) * nextR;
            c.py = (ny / nl) * nextR;
            c.pz = (nz / nl) * nextR;
            c.tile = nextTile;
          } else {
            c.fwdX = -c.fwdX; c.fwdY = -c.fwdY; c.fwdZ = -c.fwdZ;
          }
          c.walkPhase += dt * speed * 2.4;
        }

        const swing = speed > 0.05 ? Math.sin(c.walkPhase) * 0.48 : 0;
        if (c.legs.length === 4) {
          c.legs[0]!.rotation.x = swing;
          c.legs[1]!.rotation.x = -swing;
          c.legs[2]!.rotation.x = -swing;
          c.legs[3]!.rotation.x = swing;
        } else if (c.legs.length === 2) {
          c.legs[0]!.rotation.x = swing;
          c.legs[1]!.rotation.x = -swing;
        }
      }

      // Orient creature mesh (`+Y` = surface normal, `+Z` = forward, `det = +1`)
      const nr = Math.hypot(c.px, c.py, c.pz) || 1;
      upVec.set(c.px / nr, c.py / nr, c.pz / nr);
      fwdVec.set(c.fwdX, c.fwdY, c.fwdZ);
      const d = fwdVec.dot(upVec);
      fwdVec.addScaledVector(upVec, -d).normalize();
      rightVec.crossVectors(upVec, fwdVec).normalize();
      basisMat.makeBasis(rightVec, upVec, fwdVec);

      c.meshGroup.position.set(c.px - camX, c.py - camY, c.pz - camZ);
      c.meshGroup.quaternion.setFromRotationMatrix(basisMat);
    }

    return { playerDamage, attackerName };
  }
}
