/**
 * The player's body: a procedural survival-builder avatar with visible equip sockets,
 * readable action poses, and the existing bush plane in plane mode. The model is still a
 * fallback asset, but it now communicates selected tools, carried props, and recent verbs.
 */

import * as THREE from 'three/webgpu';
import { attribute, color, float, positionLocal, time, vec3 } from 'three/tsl';
import type { Player } from '../player/player';
import { CHARACTER_PROP_IDS, type CharacterAction, type CharacterPropId, type CharacterVisualState } from '../sim/equipment';

const PROP_COLORS: Record<CharacterPropId, number> = {
  hands: 0xd8dee8,
  map: 0xd7c58f,
  torch: 0xffa349,
  dirt: 0x8a6242,
  rock: 0x8d9095,
  sand: 0xd8c48a,
  snow: 0xeef2f5,
  wood: 0xa8763f,
  sticks: 0xc69254,
  workbench: 0x8d6948,
  stoneHatchet: 0xb6aaa0,
  stoneAxe: 0xa5a7ac,
  stonePick: 0x8f939b,
  stoneShovel: 0x9b8974,
  echoAxe: 0x62d4c7,
  echoPick: 0x6de2d8,
  echoShovel: 0x78cfc2,
  packFrame: 0xb58b52,
  repairKit: 0xc9a56d,
  fishingRod: 0xc8a36b,
  bait: 0xc98b5a,
  seeds: 0x9abf5a,
  compost: 0x6b5b32,
  berries: 0xb64d6b,
  caveMushroom: 0x8bd0b0,
  snowHerb: 0xc9eef2,
  kelp: 0x4f9f74,
  reeds: 0x7da65f,
  rawFish: 0x8bb7c8,
  cookedFish: 0xd59a63,
  campMeal: 0xd9c16c,
  trailRation: 0xb89458,
  expeditionStew: 0xe8a65f,
  glowCrystal: 0x70d6d1,
  campfire: 0xe07a3f,
  chest: 0xa56d3a,
  bedroll: 0x8fb0d0,
  rainCistern: 0x5faed2,
  rootCellar: 0x7b6a8f,
  waterJar: 0x7dc6e8,
  dockSegment: 0x7b6a4a,
  fishTrap: 0x8bb7c8,
  shoreNet: 0x7da65f,
  dryingRack: 0xb89458,
  weatherVane: 0x9fb8c2,
  lantern: 0xffd06f,
  waystone: 0x87a9d6,
  echoLantern: 0x6de2d8,
  planeFrame: 0xd6a86a,
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const CHARACTER_ACTION_POSE_COVERAGE: readonly CharacterAction[] = [
  'idle',
  'move',
  'sprint',
  'jump',
  'swim',
  'plane',
  'mine',
  'chop',
  'build',
  'craft',
  'fish',
  'farm',
  'cook',
  'pickup',
  'ward',
  'shoot',
  'brace',
  'stagger',
  'sleep',
  'discover',
  'interact',
] as const;

export interface CharacterRendererStats {
  visible: boolean;
  meshes: number;
  silhouetteParts: number;
  propSockets: string[];
  readabilityRoles: string[];
  supportedActions: CharacterAction[];
  actionPoseCoverage: number;
  heldProp: CharacterPropId;
  heldPropMeshes: number;
  backPropsVisible: CharacterPropId[];
  backPropMeshes: number;
  normalDistanceReady: boolean;
}

type SdfVolume = {
  center: [number, number, number];
  radius: [number, number, number];
};

const sdfScratch = new THREE.Vector3();
const sdfCenter = new THREE.Vector3();
const sdfDir = new THREE.Vector3();

function sdEllipsoid(p: THREE.Vector3, volume: SdfVolume): number {
  const [cx, cy, cz] = volume.center;
  const [rx, ry, rz] = volume.radius;
  const x = (p.x - cx) / rx;
  const y = (p.y - cy) / ry;
  const z = (p.z - cz) / rz;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / rx, y / ry, z / rz);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

function smoothMin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function blendSdf(p: THREE.Vector3, volumes: readonly SdfVolume[], blend: number): number {
  let d = sdEllipsoid(p, volumes[0]);
  for (let i = 1; i < volumes.length; i++) d = smoothMin(d, sdEllipsoid(p, volumes[i]), blend);
  return d;
}

function makeBlendShellGeometry(volumes: readonly SdfVolume[], origin: [number, number, number], detail = 2, blend = 0.12): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(pos.count * 3);
  const phase = new Float32Array(pos.count);
  sdfCenter.set(...origin);
  for (let i = 0; i < pos.count; i++) {
    sdfDir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let lo = 0;
    let hi = 1.3;
    for (let guard = 0; guard < 4; guard++) {
      sdfScratch.copy(sdfDir).multiplyScalar(hi).add(sdfCenter);
      if (blendSdf(sdfScratch, volumes, blend) >= 0) break;
      hi *= 1.45;
    }
    for (let step = 0; step < 18; step++) {
      const mid = (lo + hi) * 0.5;
      sdfScratch.copy(sdfDir).multiplyScalar(mid).add(sdfCenter);
      if (blendSdf(sdfScratch, volumes, blend) < 0) lo = mid;
      else hi = mid;
    }
    sdfScratch.copy(sdfDir).multiplyScalar((lo + hi) * 0.5).add(sdfCenter);
    out[i * 3] = sdfScratch.x;
    out[i * 3 + 1] = sdfScratch.y;
    out[i * 3 + 2] = sdfScratch.z;
    const rawPhase = Math.sin(sdfDir.x * 12.9898 + sdfDir.y * 78.233 + sdfDir.z * 37.719) * 43758.5453;
    phase[i] = rawPhase - Math.floor(rawPhase);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geom.setAttribute('shellPhase', new THREE.BufferAttribute(phase, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export class Character {
  readonly group: THREE.Group;
  private readonly plane: THREE.Group;
  private readonly prop: THREE.Group;
  private readonly body: THREE.Group;
  private readonly pilotBody: THREE.Group;
  private readonly rightArm = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightSocket = new THREE.Group();
  private readonly leftSocket = new THREE.Group();
  private readonly backSocket = new THREE.Group();
  private readonly heldProps = new Map<CharacterPropId, THREE.Group>();
  private readonly backProps = new Map<CharacterPropId, THREE.Group>();
  private readonly fadeMats: THREE.Material[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly upV = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private propAngle = 0;
  private walkPhase = 0;
  private lastState: CharacterVisualState = {
    action: 'idle',
    held: 'hands',
    backProps: [],
    actionT: 0,
    actionDuration: 0,
  };

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();

    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: number, roughness = 0.6, metalness = 0.05, emissive = 0x000000): THREE.MeshStandardMaterial => {
      const key = `${color}|${roughness}|${metalness}|${emissive}`;
      const cached = materialCache.get(key);
      if (cached) return cached;
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        emissive,
        emissiveIntensity: emissive === 0 ? 0 : 0.65,
        transparent: true,
      });
      materialCache.set(key, m);
      this.fadeMats.push(m);
      return m;
    };

    const visorMat = mat(0x2a3d55, 0.25, 0.2);
    const strapMat = mat(0x3b2b22, 0.78, 0.02);
    const hullMat = mat(0xc4502e, 0.55, 0.1);
    const wingMat = mat(0xe8dfc8, 0.7, 0);
    wingMat.side = THREE.DoubleSide;
    const propMat = mat(0x2b2b30, 0.5, 0.1);
    const metalMat = mat(0x9da3a9, 0.54, 0.1);
    const woodMat = mat(0x8b5a33, 0.8, 0.02);
    const glowMat = mat(0xffc15f, 0.35, 0.02, 0xff8a23);
    const coatDark = mat(0x375663, 0.86, 0.02);
    const creamMat = mat(0xe6d59b, 0.78, 0.02);
    const faceMat = mat(0xf0bf7b, 0.66, 0.02);
    const eyeMat = mat(0x101923, 0.35, 0.03, 0x69d7e5);
    const rustMat = mat(0xc4502e, 0.7, 0.04);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const sphere8 = new THREE.SphereGeometry(0.5, 8, 6);
    const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
    const dodeca = new THREE.DodecahedronGeometry(0.5, 0);
    const torus = new THREE.TorusGeometry(0.18, 0.025, 6, 18);

    const mesh = (geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh => {
      const m = new THREE.Mesh(geom, material);
      m.name = name;
      m.position.set(...pos);
      m.scale.set(...scale);
      m.castShadow = false;
      m.receiveShadow = true;
      return m;
    };

    const markRole = <T extends THREE.Object3D>(object: T, role: string): T => {
      object.userData.characterReadabilityRole = role;
      return object;
    };

    const colorMat = (id: CharacterPropId): THREE.MeshStandardMaterial => mat(PROP_COLORS[id] ?? 0xffffff, 0.72, 0.03);

    const makeShellMaterial = (baseColor: number, roughness = 0.84, metalness = 0.02): THREE.MeshStandardNodeMaterial => {
      const material = new THREE.MeshStandardNodeMaterial();
      material.colorNode = color(baseColor);
      material.roughnessNode = float(roughness);
      material.metalnessNode = float(metalness);
      material.transparent = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shellPhase = float(attribute('shellPhase', 'float') as any);
      const local = positionLocal.sub(vec3(0, 1.04, -0.02));
      const pulse = time.mul(1.35).add(shellPhase.mul(6.283)).sin().mul(0.009);
      material.positionNode = positionLocal.add(local.normalize().mul(pulse));
      this.fadeMats.push(material);
      return material;
    };

    const makeProp = (id: CharacterPropId): THREE.Group => {
      const g = new THREE.Group();
      g.name = `character-prop-${id}`;
      if (id === 'hands') return g;
      if (id === 'stoneHatchet' || id === 'stoneAxe' || id === 'echoAxe') {
        const hatchet = id === 'stoneHatchet';
        g.add(mesh(cyl6, woodMat, [0, hatchet ? 0.22 : 0.28, 0], [hatchet ? 0.038 : 0.045, hatchet ? 0.54 : 0.78, hatchet ? 0.038 : 0.045], hatchet ? 'hatchetHandle' : 'axeHandle'));
        g.add(mesh(box, metalMat, [hatchet ? 0.105 : 0.13, hatchet ? 0.49 : 0.68, -0.02], [hatchet ? 0.2 : 0.28, hatchet ? 0.15 : 0.2, 0.06], hatchet ? 'hatchetBlade' : 'axeBlade'));
        g.add(mesh(box, metalMat, [-0.02, hatchet ? 0.47 : 0.64, -0.02], [hatchet ? 0.09 : 0.13, hatchet ? 0.12 : 0.16, 0.05], hatchet ? 'hatchetPoll' : 'axePoll'));
        if (hatchet) {
          g.add(mesh(torus, mat(0xc9a56d), [0.01, 0.42, -0.01], [0.38, 0.34, 0.38], 'hatchetWrap'));
        }
        if (id === 'echoAxe') {
          g.add(mesh(sphere8, mat(0x6de2d8, 0.28, 0.02, 0x3bd6cf), [0.23, 0.76, -0.02], [0.055, 0.055, 0.055], 'echoAxeCrystal'));
          g.add(mesh(box, mat(0x62d4c7, 0.34, 0.02, 0x2bcac3), [-0.01, 0.47, -0.03], [0.035, 0.46, 0.035], 'echoAxeBinding'));
        }
        return g;
      }
      if (id === 'stonePick' || id === 'echoPick') {
        g.add(mesh(cyl6, woodMat, [0, 0.28, 0], [0.04, 0.82, 0.04], 'pickHandle'));
        const head = mesh(box, metalMat, [0, 0.72, 0], [0.64, 0.08, 0.07], 'pickHead');
        head.rotation.z = 0.12;
        g.add(head);
        if (id === 'echoPick') {
          g.add(mesh(cone8, mat(0x6de2d8, 0.26, 0.03, 0x3bd6cf), [0.36, 0.73, 0], [0.07, 0.18, 0.07], 'echoPickTipR'));
          g.add(mesh(cone8, mat(0x6de2d8, 0.26, 0.03, 0x3bd6cf), [-0.36, 0.73, 0], [0.07, 0.18, 0.07], 'echoPickTipL'));
          g.add(mesh(sphere8, mat(0x9efff7, 0.22, 0.02, 0x44efe2), [0, 0.78, 0], [0.055, 0.055, 0.055], 'echoPickCore'));
        }
        return g;
      }
      if (id === 'stoneShovel' || id === 'echoShovel') {
        g.add(mesh(cyl6, woodMat, [0, 0.3, 0], [0.04, 0.86, 0.04], 'shovelHandle'));
        const blade = mesh(cone8, metalMat, [0, 0.02, -0.02], [0.17, 0.26, 0.17], 'shovelBlade');
        blade.rotation.x = Math.PI;
        g.add(blade);
        if (id === 'echoShovel') {
          g.add(mesh(cone8, mat(0x78cfc2, 0.28, 0.03, 0x3bd6cf), [0, 0.12, -0.03], [0.09, 0.2, 0.09], 'echoShovelEdge'));
          g.add(mesh(box, mat(0x62d4c7, 0.34, 0.02, 0x2bcac3), [0, 0.45, -0.03], [0.035, 0.42, 0.035], 'echoShovelBinding'));
        }
        return g;
      }
      if (id === 'repairKit') {
        g.add(mesh(box, mat(0x6c4d2d), [0, 0.18, 0], [0.36, 0.2, 0.22], 'repairKitWrap'));
        g.add(mesh(torus, mat(0xc9a56d), [-0.1, 0.32, 0.01], [0.55, 0.55, 0.55], 'repairKitLashing'));
        g.add(mesh(box, metalMat, [0.12, 0.34, -0.02], [0.16, 0.06, 0.08], 'repairKitStoneWedge'));
        const handle = mesh(cyl6, woodMat, [-0.02, 0.42, 0.04], [0.025, 0.38, 0.025], 'repairKitPeg');
        handle.rotation.z = Math.PI / 2;
        g.add(handle);
        return g;
      }
      if (id === 'packFrame') {
        const spine = mesh(cyl6, woodMat, [0, 0.38, -0.02], [0.035, 0.86, 0.035], 'packFrameSpine');
        const left = mesh(cyl6, woodMat, [-0.18, 0.34, -0.02], [0.03, 0.72, 0.03], 'packFrameSideL');
        const right = mesh(cyl6, woodMat, [0.18, 0.34, -0.02], [0.03, 0.72, 0.03], 'packFrameSideR');
        const top = mesh(cyl6, woodMat, [0, 0.7, -0.02], [0.028, 0.46, 0.028], 'packFrameTopRail');
        const bottom = mesh(cyl6, woodMat, [0, 0.05, -0.02], [0.028, 0.42, 0.028], 'packFrameBottomRail');
        top.rotation.z = Math.PI / 2;
        bottom.rotation.z = Math.PI / 2;
        g.add(spine, left, right, top, bottom);
        g.add(mesh(box, strapMat, [0, 0.32, -0.08], [0.44, 0.055, 0.04], 'packFrameReedLash'));
        g.add(mesh(torus, mat(0xc9a56d), [0, 0.5, -0.05], [0.9, 0.55, 0.9], 'packFrameShoulderLoop'));
        g.add(mesh(box, mat(0x6b4a2f), [0, 0.23, -0.03], [0.26, 0.22, 0.12], 'packFramePouch'));
        return g;
      }
      if (id === 'fishingRod') {
        const rod = mesh(cyl6, woodMat, [0, 0.66, -0.08], [0.025, 1.38, 0.025], 'fishingRod');
        rod.rotation.z = -0.22;
        g.add(rod);
        g.add(mesh(box, metalMat, [0.12, 0.3, -0.08], [0.13, 0.13, 0.04], 'reel'));
        const line = mesh(box, mat(0xd9edf7, 0.35, 0), [-0.24, 1.1, -0.22], [0.012, 0.82, 0.012], 'lineHint');
        line.rotation.z = -0.18;
        g.add(line);
        return g;
      }
      if (id === 'map') {
        const chart = mesh(box, colorMat(id), [0, 0.25, -0.03], [0.42, 0.05, 0.32], 'mapChart');
        chart.rotation.x = -0.5;
        g.add(chart);
        g.add(mesh(box, mat(0x6d4b2d), [-0.23, 0.25, -0.03], [0.035, 0.07, 0.35], 'mapRoll'));
        return g;
      }
      if (id === 'torch' || id === 'lantern' || id === 'echoLantern') {
        g.add(mesh(cyl6, woodMat, [0, 0.3, 0], [0.04, 0.66, 0.04], 'torchHandle'));
        const glow = mesh(sphere8, id === 'echoLantern' ? mat(0x6de2d8, 0.22, 0.03, 0x44efe2) : glowMat, [0, 0.68, 0], [0.13, 0.13, 0.13], 'torchGlow');
        g.add(glow);
        if (id === 'echoLantern') {
          g.add(mesh(cone8, mat(0x70d6d1, 0.35, 0.02, 0x2bcac3), [0, 0.86, 0], [0.08, 0.18, 0.08], 'echoCrystal'));
        }
        return g;
      }
      if (id === 'waterJar') {
        g.add(mesh(cyl8, mat(0x6f8790, 0.5, 0.06), [0, 0.22, 0], [0.16, 0.3, 0.16], 'waterJarBody'));
        g.add(mesh(cyl8, mat(0x7dc6e8, 0.22, 0.02, 0x3a9ed0), [0, 0.4, 0], [0.13, 0.035, 0.13], 'waterJarSurface'));
        g.add(mesh(cyl6, metalMat, [0, 0.5, 0], [0.12, 0.08, 0.12], 'waterJarRim'));
        return g;
      }
      if (id === 'glowCrystal') {
        const crystal = mesh(cone8, mat(0x70d6d1, 0.28, 0.04, 0x2bcac3), [0, 0.28, 0], [0.14, 0.38, 0.14], 'glowCrystal');
        crystal.rotation.z = 0.18;
        g.add(crystal);
        g.add(mesh(sphere8, mat(0xa9fff8, 0.32, 0.02, 0x49e3dd), [0, 0.14, 0], [0.09, 0.07, 0.09], 'crystalCore'));
        return g;
      }
      if (id === 'workbench') {
        g.add(mesh(box, woodMat, [0, 0.28, 0], [0.48, 0.18, 0.32], 'workbenchCarryTop'));
        g.add(mesh(box, mat(0x5b3a22), [-0.18, 0.08, -0.1], [0.055, 0.28, 0.055], 'workbenchCarryLeg'));
        g.add(mesh(box, mat(0x5b3a22), [0.18, 0.08, 0.1], [0.055, 0.28, 0.055], 'workbenchCarryLeg'));
        g.add(mesh(box, metalMat, [0.12, 0.41, -0.05], [0.18, 0.05, 0.06], 'workbenchCarryTool'));
        g.add(mesh(box, strapMat, [0, 0.22, -0.2], [0.52, 0.045, 0.035], 'workbenchCarryStrap'));
        return g;
      }
      if (id === 'campfire') {
        for (let i = 0; i < 3; i++) {
          const log = mesh(cyl6, woodMat, [(i - 1) * 0.08, 0.18, 0], [0.04, 0.42, 0.04], 'campfireCarryLog');
          log.rotation.z = Math.PI / 2 + (i - 1) * 0.34;
          g.add(log);
        }
        g.add(mesh(cone8, glowMat, [0, 0.36, -0.02], [0.12, 0.28, 0.12], 'campfireCarryFlame'));
        g.add(mesh(box, strapMat, [0, 0.12, -0.18], [0.34, 0.045, 0.035], 'campfireCarryTie'));
        return g;
      }
      if (id === 'chest') {
        g.add(mesh(box, mat(0x8a5a33), [0, 0.22, 0], [0.46, 0.3, 0.32], 'chestCarryBox'));
        g.add(mesh(cyl8, mat(0xa56d3a), [0, 0.39, 0], [0.24, 0.28, 0.24], 'chestCarryRoundedLid'));
        g.add(mesh(box, metalMat, [0, 0.28, -0.19], [0.14, 0.12, 0.035], 'chestCarryLatch'));
        g.add(mesh(box, strapMat, [0, 0.23, -0.22], [0.5, 0.045, 0.035], 'chestCarryStrap'));
        return g;
      }
      if (id === 'bedroll') {
        const roll = mesh(cyl8, mat(0x8fb0d0), [0, 0.28, 0], [0.24, 0.54, 0.24], 'bedrollCarryRoll');
        roll.rotation.z = Math.PI / 2;
        g.add(roll);
        g.add(mesh(box, creamMat, [0, 0.28, -0.2], [0.44, 0.07, 0.05], 'bedrollCarryBlanketEdge'));
        g.add(mesh(box, strapMat, [-0.16, 0.28, -0.25], [0.035, 0.32, 0.035], 'bedrollCarryLeftTie'));
        g.add(mesh(box, strapMat, [0.16, 0.28, -0.25], [0.035, 0.32, 0.035], 'bedrollCarryRightTie'));
        return g;
      }
      if (id === 'rainCistern') {
        g.add(mesh(cyl8, woodMat, [0, 0.22, 0], [0.28, 0.32, 0.28], 'rainCisternCarryBarrel'));
        g.add(mesh(cyl8, mat(0x7dc6e8, 0.25, 0.02, 0x3a9ed0), [0, 0.42, 0], [0.24, 0.035, 0.24], 'rainCisternCarryWater'));
        g.add(mesh(box, strapMat, [0, 0.22, -0.3], [0.46, 0.05, 0.035], 'rainCisternCarryStrap'));
        g.add(mesh(box, metalMat, [0, 0.52, 0], [0.4, 0.04, 0.08], 'rainCisternCarryLip'));
        return g;
      }
      if (id === 'rootCellar') {
        g.add(mesh(box, mat(0x5b3a22), [0, 0.18, 0], [0.42, 0.18, 0.34], 'rootCellarCarryCrate'));
        g.add(mesh(box, mat(0x7b6a8f, 0.58, 0.04, 0x3a3354), [0, 0.34, -0.02], [0.34, 0.08, 0.26], 'rootCellarCarryCoolStone'));
        g.add(mesh(box, strapMat, [0, 0.22, -0.22], [0.46, 0.045, 0.035], 'rootCellarCarryStrap'));
        g.add(mesh(cyl6, mat(0x8bd0b0, 0.44, 0.02, 0x4fcfa4), [0.12, 0.46, 0], [0.055, 0.14, 0.055], 'rootCellarCarryMushroom'));
        return g;
      }
      if (id === 'dockSegment') {
        for (let i = 0; i < 3; i++) {
          const plank = mesh(box, woodMat, [(i - 1) * 0.12, 0.22, 0], [0.09, 0.52, 0.08], 'dockPlankBundle');
          plank.rotation.z = (i - 1) * 0.08;
          g.add(plank);
        }
        g.add(mesh(box, mat(0x5b3a22), [0, 0.47, 0], [0.4, 0.05, 0.08], 'dockBundleStrap'));
        return g;
      }
      if (id === 'fishTrap') {
        g.add(mesh(box, mat(0x5b3a22), [0, 0.16, 0], [0.42, 0.08, 0.28], 'fishTrapCarrySkid'));
        for (const x of [-0.18, 0.18]) {
          const hoop = mesh(torus, mat(0xc9a56d), [x, 0.3, 0], [0.75, 0.75, 0.75], 'fishTrapCarryHoop');
          hoop.rotation.y = Math.PI / 2;
          g.add(hoop);
        }
        for (const z of [-0.12, 0, 0.12]) {
          const slat = mesh(cyl6, mat(0xc9a56d), [0, 0.3, z], [0.018, 0.48, 0.018], 'fishTrapCarrySlat');
          slat.rotation.z = Math.PI / 2;
          g.add(slat);
        }
        g.add(mesh(sphere8, mat(0xc98b5a), [0.02, 0.31, 0], [0.055, 0.055, 0.055], 'fishTrapCarryBait'));
        g.add(mesh(box, mat(0x8bb7c8), [-0.07, 0.34, 0.04], [0.12, 0.04, 0.03], 'fishTrapCarryFishHint'));
        return g;
      }
      if (id === 'shoreNet') {
        const frame = mesh(torus, mat(0xc9a56d), [0, 0.28, 0], [1.15, 0.78, 1], 'shoreNetCarryHoop');
        frame.rotation.x = Math.PI / 2;
        g.add(frame);
        for (let i = -2; i <= 2; i++) {
          const strand = mesh(box, mat(i % 2 === 0 ? 0x7da65f : 0xb7c66e), [i * 0.045, 0.28, 0], [0.012, 0.42, 0.012], 'shoreNetCarryStrand');
          strand.rotation.z = i * 0.04;
          g.add(strand);
          const cross = mesh(box, mat(0xc9a56d), [0, 0.28 + i * 0.04, 0], [0.34, 0.012, 0.012], 'shoreNetCarryCross');
          g.add(cross);
        }
        g.add(mesh(sphere8, mat(0x5faed2, 0.3, 0.03, 0x287aa6), [0.19, 0.5, 0.02], [0.055, 0.055, 0.055], 'shoreNetCarryFloat'));
        g.add(mesh(box, strapMat, [0, 0.13, -0.05], [0.42, 0.04, 0.045], 'shoreNetCarryTie'));
        return g;
      }
      if (id === 'dryingRack') {
        const left = mesh(cyl6, woodMat, [-0.14, 0.32, 0], [0.025, 0.7, 0.025], 'rackCarryPost');
        left.rotation.z = -0.28;
        const right = mesh(cyl6, woodMat, [0.14, 0.32, 0], [0.025, 0.7, 0.025], 'rackCarryPost');
        right.rotation.z = 0.28;
        g.add(left, right);
        const rail = mesh(cyl6, woodMat, [0, 0.64, 0], [0.025, 0.46, 0.025], 'rackCarryRail');
        rail.rotation.z = Math.PI / 2;
        g.add(rail);
        g.add(mesh(box, mat(0x6c4d2d), [0, 0.22, 0], [0.34, 0.08, 0.16], 'rackFoodBundle'));
        return g;
      }
      if (id === 'weatherVane') {
        g.add(mesh(cyl6, woodMat, [0, 0.32, 0], [0.025, 0.78, 0.025], 'weatherVaneCarryPost'));
        const cross = mesh(cyl6, metalMat, [0, 0.72, 0], [0.025, 0.48, 0.025], 'weatherVaneCarryNeedle');
        cross.rotation.z = Math.PI / 2;
        g.add(cross);
        const head = mesh(cone8, metalMat, [0.28, 0.72, 0], [0.08, 0.16, 0.08], 'weatherVaneCarryArrow');
        head.rotation.z = -Math.PI / 2;
        g.add(head);
        const tail = mesh(box, mat(0x6c7880), [-0.23, 0.72, 0], [0.12, 0.12, 0.035], 'weatherVaneCarryTail');
        tail.rotation.z = 0.35;
        g.add(tail);
        const ribbon = mesh(box, mat(0x87a9d6), [-0.04, 0.56, 0.02], [0.035, 0.2, 0.018], 'weatherVaneCarryRibbon');
        ribbon.rotation.z = -0.28;
        g.add(ribbon);
        return g;
      }
      if (id === 'waystone') {
        g.add(mesh(dodeca, mat(0x5f6e7f), [0, 0.24, 0], [0.2, 0.34, 0.16], 'waystoneCarryBody'));
        g.add(mesh(sphere8, mat(0x87a9d6, 0.28, 0.04, 0x447fb8), [0, 0.48, -0.02], [0.11, 0.11, 0.09], 'waystoneCarryCore'));
        g.add(mesh(box, mat(0xd7c58f, 0.5, 0.02, 0x9d7f2a), [0, 0.25, -0.14], [0.3, 0.04, 0.03], 'waystoneCarryGlyphBar'));
        g.add(mesh(box, strapMat, [0, 0.15, -0.2], [0.38, 0.045, 0.035], 'waystoneCarryStrap'));
        return g;
      }
      if (id === 'bait' || id === 'seeds' || id === 'compost' || id === 'berries' || id === 'caveMushroom' || id === 'snowHerb' || id === 'kelp' || id === 'rawFish' || id === 'cookedFish' || id === 'campMeal' || id === 'trailRation' || id === 'expeditionStew') {
        g.add(mesh(sphere8, colorMat(id), [0, 0.2, 0], [0.18, 0.16, 0.18], 'foodBundle'));
        if (id === 'seeds' || id === 'bait') g.add(mesh(box, mat(0x6c4d2d), [0, 0.12, 0], [0.32, 0.2, 0.12], id === 'bait' ? 'baitPouch' : 'seedPouch'));
        if (id === 'compost') {
          g.add(mesh(box, mat(0x4b3a20), [0, 0.14, 0], [0.34, 0.18, 0.18], 'compostWrap'));
          g.add(mesh(sphere8, mat(0x76a45e), [0.08, 0.33, 0], [0.055, 0.035, 0.055], 'compostSprout'));
        }
        if (id === 'snowHerb') g.add(mesh(cone8, mat(0xe8fbff, 0.45, 0.02, 0xbceff5), [0.02, 0.42, 0], [0.07, 0.2, 0.07], 'snowHerbSprig'));
        if (id === 'kelp') {
          const strand = mesh(box, mat(0x2d7959), [0.04, 0.32, 0], [0.05, 0.34, 0.025], 'kelpStrand');
          strand.rotation.z = 0.25;
          g.add(strand);
        }
        if (id === 'trailRation') {
          g.add(mesh(box, mat(0x6c4d2d), [0, 0.2, -0.02], [0.36, 0.13, 0.16], 'rationWrap'));
          g.add(mesh(box, mat(0xe2c47a), [0, 0.32, -0.02], [0.3, 0.035, 0.18], 'rationTie'));
        }
        if (id === 'expeditionStew') {
          g.add(mesh(cyl8, mat(0x72503a), [0, 0.17, -0.01], [0.22, 0.16, 0.22], 'stewBowl'));
          g.add(mesh(cyl8, mat(0xe8a65f, 0.42, 0.02, 0x7b3f1e), [0, 0.3, -0.01], [0.18, 0.035, 0.18], 'stewSurface'));
          const spoon = mesh(box, metalMat, [0.2, 0.34, -0.02], [0.035, 0.34, 0.025], 'stewSpoon');
          spoon.rotation.z = -0.55;
          g.add(spoon);
          g.add(mesh(box, mat(0xf0d7a2, 0.36, 0.02, 0x9c5c2c), [-0.08, 0.45, -0.02], [0.025, 0.18, 0.025], 'stewSteam'));
        }
        return g;
      }
      if (id === 'dirt' || id === 'rock' || id === 'sand' || id === 'snow' || id === 'wood') {
        g.add(mesh(box, colorMat(id), [0, 0.2, 0], [0.28, 0.28, 0.28], 'heldBlock'));
        return g;
      }
      if (id === 'sticks') {
        for (let i = 0; i < 3; i++) {
          const stick = mesh(cyl6, woodMat, [(i - 1) * 0.05, 0.28, 0], [0.025, 0.62, 0.025], 'stickBundle');
          stick.rotation.z = (i - 1) * 0.15;
          g.add(stick);
        }
        return g;
      }
      if (id === 'reeds') {
        for (let i = 0; i < 5; i++) {
          const reed = mesh(cyl6, mat(i % 2 === 0 ? 0x7da65f : 0xb7c66e), [(i - 2) * 0.035, 0.34, 0], [0.018, 0.7 + i * 0.03, 0.018], 'reedBundleStem');
          reed.rotation.z = (i - 2) * 0.08;
          g.add(reed);
        }
        g.add(mesh(box, strapMat, [0, 0.24, -0.04], [0.28, 0.04, 0.05], 'reedBundleTie'));
        return g;
      }
      if (id === 'planeFrame') {
        const rib = mesh(cyl6, woodMat, [0, 0.28, 0], [0.025, 0.72, 0.025], 'planeFrameCarryRib');
        rib.rotation.z = Math.PI / 2;
        const wing = mesh(box, wingMat, [0, 0.4, -0.02], [0.56, 0.055, 0.2], 'planeFrameCarryWing');
        const cowlHint = mesh(cyl8, hullMat, [0.28, 0.28, -0.02], [0.12, 0.16, 0.12], 'planeFrameCarryCowl');
        cowlHint.rotation.x = Math.PI / 2;
        g.add(rib, wing, cowlHint);
        g.add(mesh(box, strapMat, [0, 0.18, -0.18], [0.52, 0.045, 0.035], 'planeFrameCarryStrap'));
        return g;
      }
      const pack = mesh(box, colorMat(id), [0, 0.2, 0], [0.38, 0.26, 0.28], 'propPack');
      pack.rotation.y = 0.18;
      g.add(pack);
      g.add(mesh(box, strapMat, [0, 0.34, -0.15], [0.42, 0.045, 0.04], 'propStrap'));
      return g;
    };

    this.pilotBody = new THREE.Group();

    const wayfarerShell = new THREE.Mesh(
      makeBlendShellGeometry([
        { center: [0, 0.96, 0], radius: [0.42, 0.56, 0.34] },
        { center: [0, 0.68, 0.02], radius: [0.34, 0.24, 0.3] },
        { center: [0, 1.42, -0.03], radius: [0.35, 0.32, 0.31] },
        { center: [0, 1.33, -0.28], radius: [0.22, 0.14, 0.1] },
        { center: [-0.34, 1.15, 0], radius: [0.16, 0.22, 0.18] },
        { center: [0.34, 1.15, 0], radius: [0.16, 0.22, 0.18] },
      ], [0, 1.03, -0.02], 2, 0.14),
      makeShellMaterial(0x6fa69b),
    );
    wayfarerShell.name = 'wayfarerSdfBlendShell';
    markRole(wayfarerShell, 'fused soft-facet body shell');
    wayfarerShell.receiveShadow = true;
    this.pilotBody.add(wayfarerShell);

    const bellyPatch = markRole(mesh(dodeca, creamMat, [0, 0.92, -0.31], [0.34, 0.36, 0.08], 'wayfarerBellyPatch'), 'bright front belly patch');
    bellyPatch.rotation.x = -0.08;
    const hoodRim = markRole(mesh(torus, creamMat, [0, 1.39, -0.29], [1.05, 0.68, 0.6], 'wayfarerHoodRim'), 'oversized hood rim');
    hoodRim.rotation.x = Math.PI / 2;
    const face = markRole(mesh(box, faceMat, [0, 1.38, -0.365], [0.28, 0.14, 0.035], 'wayfarerFacePlate'), 'warm face plate');
    const eyeL = markRole(mesh(box, eyeMat, [-0.075, 1.4, -0.389], [0.045, 0.035, 0.018], 'wayfarerEyeL'), 'left glowing eye');
    const eyeR = markRole(mesh(box, eyeMat, [0.075, 1.4, -0.389], [0.045, 0.035, 0.018], 'wayfarerEyeR'), 'right glowing eye');
    const faceNose = markRole(mesh(cone8, faceMat, [0, 1.35, -0.407], [0.04, 0.09, 0.04], 'wayfarerNose'), 'small goofy nose');
    faceNose.rotation.x = -Math.PI / 2;
    const capPebble = markRole(mesh(dodeca, rustMat, [0.08, 1.77, -0.02], [0.11, 0.13, 0.1], 'wayfarerCapPebble'), 'asymmetric cap pebble');
    capPebble.rotation.z = -0.22;
    const hoodEarL = markRole(mesh(dodeca, creamMat, [-0.24, 1.55, -0.24], [0.09, 0.14, 0.055], 'wayfarerHoodEarL'), 'left soft hood ear');
    hoodEarL.rotation.z = -0.32;
    const hoodEarR = markRole(mesh(dodeca, creamMat, [0.24, 1.55, -0.24], [0.09, 0.14, 0.055], 'wayfarerHoodEarR'), 'right soft hood ear');
    hoodEarR.rotation.z = 0.32;
    const scarf = markRole(mesh(torus, rustMat, [-0.06, 1.16, -0.08], [1.35, 0.74, 0.64], 'wayfarerScarfLoop'), 'rust scarf loop');
    scarf.rotation.x = Math.PI / 2;
    scarf.rotation.z = 0.12;
    const scarfTail = markRole(mesh(box, rustMat, [-0.26, 1.02, -0.24], [0.08, 0.36, 0.045], 'wayfarerScarfTail'), 'fluttering scarf tail');
    scarfTail.rotation.z = -0.26;
    const scarfPin = markRole(mesh(sphere8, glowMat, [-0.18, 1.14, -0.34], [0.045, 0.045, 0.03], 'wayfarerScarfPin'), 'warm scarf pin');
    const diagonalStrap = markRole(mesh(box, strapMat, [0.17, 0.95, -0.34], [0.065, 0.62, 0.045], 'wayfarerDiagonalStrap'), 'diagonal carry strap');
    diagonalStrap.rotation.z = 0.48;
    const belt = markRole(mesh(box, strapMat, [0, 0.61, -0.05], [0.52, 0.09, 0.3], 'toolBelt'), 'tool belt');
    const beltBuckle = markRole(mesh(box, metalMat, [0.02, 0.62, -0.26], [0.13, 0.075, 0.04], 'beltBuckle'), 'front belt buckle');
    const satchel = markRole(mesh(dodeca, mat(0x6b4a2f), [-0.36, 0.76, -0.02], [0.21, 0.25, 0.14], 'sideSatchel'), 'left side satchel');
    satchel.rotation.z = -0.08;
    const satchelFlap = markRole(mesh(box, strapMat, [-0.36, 0.86, -0.11], [0.2, 0.045, 0.13], 'sideSatchelFlap'), 'satchel flap');
    satchelFlap.rotation.z = -0.08;
    this.pilotBody.add(bellyPatch, hoodRim, face, eyeL, eyeR, faceNose, capPebble, hoodEarL, hoodEarR, scarf, scarfTail, scarfPin, diagonalStrap, belt, beltBuckle, satchel, satchelFlap);

    const backpack = markRole(mesh(dodeca, coatDark, [0, 0.98, 0.36], [0.34, 0.46, 0.17], 'roundedBackpack'), 'rounded backpack silhouette');
    backpack.rotation.x = 0.08;
    const backPatch = markRole(mesh(dodeca, creamMat, [0, 1.02, 0.53], [0.18, 0.24, 0.055], 'wayfarerBackPatch'), 'rear bright back patch');
    backPatch.rotation.x = 0.16;
    const backStrap = markRole(mesh(box, rustMat, [-0.08, 1.02, 0.56], [0.045, 0.42, 0.04], 'wayfarerBackStrap'), 'rear rust strap');
    backStrap.rotation.z = -0.28;
    const bedroll = markRole(mesh(cyl8, creamMat, [0, 1.42, 0.43], [0.22, 0.36, 0.22], 'wayfarerTopBedroll'), 'top bedroll roll');
    bedroll.rotation.z = Math.PI / 2;
    const bedrollTie = markRole(mesh(box, strapMat, [0, 1.42, 0.66], [0.36, 0.045, 0.035], 'wayfarerBedrollTie'), 'bedroll tie');
    this.pilotBody.add(backpack, backPatch, backStrap, bedroll, bedrollTie);
    this.backSocket.position.set(0, 1.08, 0.48);
    this.backSocket.rotation.x = 0.18;
    this.rightSocket.userData.characterPropSocket = 'right hand';
    this.leftSocket.userData.characterPropSocket = 'left hand';
    this.backSocket.userData.characterPropSocket = 'back pack';
    this.pilotBody.add(this.backSocket);

    const makeArm = (sign: 1 | -1, socket: THREE.Group): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(sign * 0.43, 1.23, -0.02);
      const armShell = new THREE.Mesh(
        makeBlendShellGeometry([
          { center: [0, -0.22, 0], radius: [0.08, 0.22, 0.08] },
          { center: [0, -0.5, -0.02], radius: [0.07, 0.24, 0.07] },
          { center: [0, -0.78, -0.07], radius: [0.11, 0.09, 0.1] },
        ], [0, -0.38, -0.02], 1, 0.055),
        makeShellMaterial(0xe6d59b, 0.8, 0.02),
      );
      armShell.name = sign > 0 ? 'rightSdfBlendArm' : 'leftSdfBlendArm';
      markRole(armShell, sign > 0 ? 'right soft-facet arm' : 'left soft-facet arm');
      arm.add(armShell);
      arm.add(markRole(mesh(dodeca, coatDark, [0, -0.03, 0], [0.12, 0.12, 0.1], sign > 0 ? 'rightShoulderPad' : 'leftShoulderPad'), sign > 0 ? 'right shoulder pad' : 'left shoulder pad'));
      arm.add(markRole(mesh(box, strapMat, [0, -0.67, -0.045], [0.13, 0.045, 0.09], sign > 0 ? 'rightWristWrap' : 'leftWristWrap'), sign > 0 ? 'right wrist wrap' : 'left wrist wrap'));
      const mitten = markRole(mesh(dodeca, rustMat, [0, -0.85, -0.09], [0.13, 0.09, 0.12], sign > 0 ? 'rightWayfarerMitten' : 'leftWayfarerMitten'), sign > 0 ? 'right oversized mitten' : 'left oversized mitten');
      mitten.rotation.x = -0.12;
      arm.add(mitten);
      socket.position.set(0, -0.88, -0.1);
      socket.rotation.set(0.25, 0, sign * 0.08);
      arm.add(socket);
      return arm;
    };
    this.rightArm.add(...makeArm(1, this.rightSocket).children);
    this.rightArm.position.set(0.43, 1.23, -0.02);
    this.leftArm.add(...makeArm(-1, this.leftSocket).children);
    this.leftArm.position.set(-0.43, 1.23, -0.02);

    const setupLeg = (leg: THREE.Group, sign: 1 | -1): void => {
      leg.position.set(sign * 0.18, 0.68, 0.04);
      const legShell = new THREE.Mesh(
        makeBlendShellGeometry([
          { center: [0, -0.12, 0], radius: [0.09, 0.2, 0.08] },
          { center: [0, -0.39, -0.01], radius: [0.075, 0.22, 0.07] },
        ], [0, -0.26, 0], 1, 0.045),
        makeShellMaterial(0x375663, 0.86, 0.02),
      );
      legShell.name = sign > 0 ? 'rightSdfBlendLeg' : 'leftSdfBlendLeg';
      markRole(legShell, sign > 0 ? 'right soft-facet leg' : 'left soft-facet leg');
      leg.add(legShell);
      const boot = markRole(mesh(dodeca, propMat, [0, -0.66, -0.09], [0.18, 0.1, 0.25], sign > 0 ? 'rightBoot' : 'leftBoot'), sign > 0 ? 'right chunky boot' : 'left chunky boot');
      boot.rotation.x = -0.08;
      leg.add(boot);
      leg.add(markRole(mesh(sphere8, metalMat, [0, -0.3, -0.08], [0.07, 0.045, 0.035], sign > 0 ? 'rightKneePad' : 'leftKneePad'), sign > 0 ? 'right knee pad' : 'left knee pad'));
      leg.add(markRole(mesh(box, creamMat, [0, -0.68, -0.28], [0.13, 0.04, 0.06], sign > 0 ? 'rightBootToe' : 'leftBootToe'), sign > 0 ? 'right bright boot toe' : 'left bright boot toe'));
    };
    setupLeg(this.rightLeg, 1);
    setupLeg(this.leftLeg, -1);
    this.pilotBody.add(this.rightArm, this.leftArm, this.rightLeg, this.leftLeg);

    for (const id of CHARACTER_PROP_IDS) {
      if (id !== 'hands') {
        const held = makeProp(id);
        held.visible = false;
        held.userData.characterPropKind = id;
        held.userData.characterPropMount = 'right hand';
        this.rightSocket.add(held);
        this.heldProps.set(id, held);

        const back = makeProp(id);
        back.visible = false;
        back.userData.characterPropKind = id;
        back.userData.characterPropMount = 'back pack';
        back.scale.setScalar(0.72);
        this.backSocket.add(back);
        this.backProps.set(id, back);
      }
    }

    this.body.add(this.pilotBody);

    // --- the plane: a high-wing bush flyer, forward = -Z, pilot rides in the open cockpit ---
    this.plane = new THREE.Group();

    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.55, 12), propMat);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.82, -1.42);
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 1.5, 12), hullMat);
    cabin.rotation.x = Math.PI / 2;
    cabin.position.set(0, 0.85, -0.42);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.48, 1.9, 10), hullMat);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.92, 1.27);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 12), propMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.82, -1.9);
    this.plane.add(cowl, cabin, boom, nose);

    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.05), visorMat);
    shield.position.set(0, 1.5, -0.82);
    shield.rotation.x = 0.42;
    this.plane.add(shield);

    const seatedPilot = new THREE.Group();
    seatedPilot.name = 'wayfarerSeatedPilot';
    seatedPilot.position.set(0, 0.88, -0.58);
    const seatedBody = markRole(mesh(dodeca, coatDark, [0, 0.08, 0.03], [0.22, 0.24, 0.18], 'seatedWayfarerBody'), 'plane seated body');
    const seatedHood = markRole(mesh(dodeca, creamMat, [0, 0.38, -0.05], [0.19, 0.17, 0.15], 'seatedWayfarerHood'), 'plane seated hood');
    const seatedFace = markRole(mesh(box, faceMat, [0, 0.37, -0.18], [0.15, 0.07, 0.025], 'seatedWayfarerFace'), 'plane seated face');
    const seatedEye = markRole(mesh(box, eyeMat, [0, 0.39, -0.198], [0.11, 0.018, 0.012], 'seatedWayfarerEyeBand'), 'plane seated eye band');
    const yoke = markRole(mesh(torus, metalMat, [0, 0.14, -0.22], [0.62, 0.48, 0.62], 'seatedPilotYoke'), 'plane steering yoke');
    yoke.rotation.x = Math.PI / 2;
    const handL = markRole(mesh(dodeca, rustMat, [-0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandL'), 'left steering mitten');
    const handR = markRole(mesh(dodeca, rustMat, [0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandR'), 'right steering mitten');
    seatedPilot.add(seatedBody, seatedHood, seatedFace, seatedEye, yoke, handL, handR);
    this.plane.add(seatedPilot);

    for (const sign of [1, -1]) {
      const halfGeo = new THREE.BoxGeometry(3.0, 0.09, 1.15);
      halfGeo.translate(sign * 1.5, 0, 0);
      const half = new THREE.Mesh(halfGeo, wingMat);
      half.position.set(0, 1.86, -0.35);
      half.rotation.z = sign * 0.07;
      const tipGeo = new THREE.BoxGeometry(0.24, 0.11, 1.17);
      tipGeo.translate(sign * 2.9, 0, 0);
      const tip = new THREE.Mesh(tipGeo, hullMat);
      tip.position.copy(half.position);
      tip.rotation.z = half.rotation.z;
      this.plane.add(half, tip);
    }
    const strutR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.58, 6), propMat);
    strutR.position.set(0.99, 1.28, -0.35);
    strutR.rotation.z = -0.8;
    const strutL = strutR.clone();
    strutL.position.x = -0.99;
    strutL.rotation.z = 0.8;
    this.plane.add(strutR, strutL);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.6), hullMat);
    fin.position.set(0, 1.45, 2.0);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.62), wingMat);
    finTip.position.set(0, 1.78, 2.0);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.55), wingMat);
    stab.position.set(0, 1.0, 2.05);
    this.plane.add(fin, finTip, stab);

    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelR = new THREE.Mesh(wheelGeo, propMat);
    wheelR.position.set(0.7, 0.18, -0.85);
    const wheelL = wheelR.clone();
    wheelL.position.x = -0.7;
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6), hullMat);
    legR.position.set(0.45, 0.51, -0.85);
    legR.rotation.z = 0.87;
    const legL = legR.clone();
    legL.position.x = -0.45;
    legL.rotation.z = -0.87;
    const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateZ(Math.PI / 2), propMat);
    tailWheel.position.set(0, 0.58, 2.15);
    const tailStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), propMat);
    tailStrut.position.set(0, 0.72, 2.15);
    this.plane.add(wheelR, wheelL, legR, legL, tailWheel, tailStrut);

    this.prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.05), propMat);
    const blade2 = blade.clone();
    blade2.rotation.z = Math.PI / 2;
    this.prop.add(blade, blade2);
    this.prop.position.set(0, 0.82, -2.2);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10), propMat);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, 0.82, -2.32);
    this.plane.add(this.prop, spinner);

    this.plane.visible = false;
    this.body.add(this.plane);

    this.group.add(this.body);
    this.group.visible = false;
    scene.add(this.group);
  }

  state(): CharacterVisualState {
    return {
      ...this.lastState,
      backProps: [...this.lastState.backProps],
    };
  }

  stats(): CharacterRendererStats {
    const readabilityRoles = new Set<string>();
    const propSockets = new Set<string>();
    let meshes = 0;
    this.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) meshes++;
      const role = part.userData.characterReadabilityRole;
      if (typeof role === 'string') readabilityRoles.add(role);
      const socket = part.userData.characterPropSocket;
      if (typeof socket === 'string') propSockets.add(socket);
    });
    const countMeshes = (root: THREE.Object3D | undefined): number => {
      if (!root) return 0;
      let count = 0;
      root.traverse((part) => {
        if ((part as THREE.Mesh).isMesh) count++;
      });
      return count;
    };
    const heldProp = [...this.heldProps.entries()].find(([, obj]) => obj.visible)?.[0] ?? 'hands';
    const backPropsVisible = [...this.backProps.entries()].filter(([, obj]) => obj.visible).map(([id]) => id);
    const heldPropMeshes = heldProp === 'hands' ? 0 : countMeshes(this.heldProps.get(heldProp));
    const backPropMeshes = backPropsVisible.reduce((sum, id) => sum + countMeshes(this.backProps.get(id)), 0);
    return {
      visible: this.group.visible,
      meshes,
      silhouetteParts: readabilityRoles.size,
      propSockets: [...propSockets].sort(),
      readabilityRoles: [...readabilityRoles].sort(),
      supportedActions: [...CHARACTER_ACTION_POSE_COVERAGE],
      actionPoseCoverage: CHARACTER_ACTION_POSE_COVERAGE.length,
      heldProp,
      heldPropMeshes,
      backPropsVisible,
      backPropMeshes,
      normalDistanceReady: readabilityRoles.size >= 28
        && propSockets.size >= 3
        && CHARACTER_ACTION_POSE_COVERAGE.length >= 18,
    };
  }

  /** eye/camera-relative update; camWorld is f64 */
  update(
    player: Player,
    camWorld: { x: number; y: number; z: number },
    camDist: number,
    dt: number,
    visual?: CharacterVisualState,
  ): void {
    const alpha = Math.max(0, Math.min(1, (camDist - 1.3) / 1.7));
    const show = alpha > 0.02;
    this.group.visible = show;
    if (!show) return;
    for (const m of this.fadeMats) m.opacity = alpha;

    const speed = Math.hypot(player.vx, player.vy, player.vz);
    this.walkPhase += dt * Math.max(1.5, Math.min(12, speed * 1.35));
    const moving = player.mode === 'walk' && speed > 0.45;
    const state: CharacterVisualState = visual ?? {
      action: moving ? 'move' : 'idle',
      held: 'hands',
      backProps: [],
      actionT: 0,
      actionDuration: 0,
    };
    this.lastState = { ...state, backProps: [...state.backProps] };

    this.plane.visible = player.mode === 'plane';
    this.pilotBody.visible = player.mode !== 'plane';
    this.applyEquipment(state);
    this.applyPose(state, moving);

    const [ux, uy, uz] = player.up();
    this.upV.set(ux, uy, uz);
    this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ);
    this.right.crossVectors(this.upV, this.back);
    this.m.makeBasis(this.right, this.upV, this.back);
    this.group.quaternion.setFromRotationMatrix(this.m);

    if (player.mode === 'plane') {
      const v = Math.hypot(player.vx, player.vy, player.vz);
      if (v > 1) {
        const vr = (player.vx * ux + player.vy * uy + player.vz * uz) / v;
        const vp = Math.asin(Math.max(-1, Math.min(1, vr)));
        this.q.setFromAxisAngle(this.right.normalize(), vp * 0.8);
        this.group.quaternion.premultiply(this.q);
      }
      this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ).normalize();
      this.q.setFromAxisAngle(this.back, player.bank);
      this.group.quaternion.premultiply(this.q);
      this.propAngle += dt * (8 + player.planeSpeed * 0.5);
      this.prop.rotation.z = this.propAngle;
    }

    const s = player.stepSmooth;
    this.group.position.set(
      player.px - camWorld.x - this.upV.x * s,
      player.py - camWorld.y - this.upV.y * s,
      player.pz - camWorld.z - this.upV.z * s,
    );
  }

  private applyEquipment(state: CharacterVisualState): void {
    const held = this.heldProps.has(state.held) ? state.held : 'hands';
    for (const [id, obj] of this.heldProps) obj.visible = id === held;
    const activeBack = new Set(state.backProps.filter((id) => id !== held));
    let visibleIndex = 0;
    for (const [id, obj] of this.backProps) {
      const visible = activeBack.has(id);
      obj.visible = visible;
      if (!visible) continue;
      if (id === 'packFrame') {
        obj.position.set(0, -0.1, 0.04);
        obj.rotation.set(0.18, 0, 0);
        obj.scale.setScalar(0.95);
        continue;
      }
      obj.scale.setScalar(0.72);
      obj.position.set(-0.26 + visibleIndex * 0.17, -0.12 + visibleIndex * 0.02, 0.02);
      obj.rotation.set(0.85, 0.08 * visibleIndex, -0.55 + visibleIndex * 0.22);
      visibleIndex++;
    }
  }

  private applyPose(state: CharacterVisualState, moving: boolean): void {
    this.pilotBody.position.set(0, moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.025 : Math.sin(this.walkPhase * 0.6) * 0.006, 0);
    this.pilotBody.rotation.set(0, 0, 0);
    const setSquash = (amount: number): void => {
      const a = Math.max(-0.05, Math.min(0.07, amount));
      this.pilotBody.scale.set(1 + a * 0.85, 1 - a, 1 + a * 0.55);
    };
    setSquash(Math.sin(this.walkPhase * 0.6) * 0.008);
    this.rightArm.rotation.set(0.08, 0, -0.2);
    this.leftArm.rotation.set(0.08, 0, 0.2);
    this.rightLeg.rotation.set(0, 0, -0.04);
    this.leftLeg.rotation.set(0, 0, 0.04);
    this.rightSocket.rotation.set(0.25, 0, 0.08);
    this.leftSocket.rotation.set(0.25, 0, -0.08);

    const active = state.action !== 'idle' && state.actionDuration > 0 && state.actionT < state.actionDuration;
    const p = active ? clamp01(state.actionT / state.actionDuration) : 0;
    const swing = Math.sin(p * Math.PI);

    const applyGait = (intensity: number): void => {
      const gait = Math.sin(this.walkPhase);
      const lift = Math.max(0, Math.sin(this.walkPhase * 2));
      this.rightArm.rotation.x = gait * 0.3 * intensity;
      this.leftArm.rotation.x = -gait * 0.3 * intensity;
      this.rightLeg.rotation.x = -gait * 0.52 * intensity;
      this.leftLeg.rotation.x = gait * 0.52 * intensity;
      this.pilotBody.rotation.x = -0.03 * intensity;
      this.pilotBody.rotation.z = gait * 0.018 * intensity;
      this.pilotBody.position.y += lift * 0.018 * intensity;
      setSquash(lift * 0.028 * intensity);
    };

    if (!active) {
      if (state.action === 'move') {
        applyGait(1);
        return;
      }
      if (state.action === 'sprint') {
        applyGait(1.45);
        this.rightArm.rotation.z = -0.34;
        this.leftArm.rotation.z = 0.34;
        this.pilotBody.rotation.x = -0.08;
        return;
      }
      if (state.action === 'jump') {
        // Arms reach forward/up, legs tuck back — rotation.x > 0 swings a hanging limb
        // toward -Z (the character's front); this pose had both pairs backwards.
        this.rightArm.rotation.x = 0.62;
        this.leftArm.rotation.x = 0.5;
        this.rightArm.rotation.z = -0.36;
        this.leftArm.rotation.z = 0.36;
        this.rightLeg.rotation.x = -0.48;
        this.leftLeg.rotation.x = -0.32;
        this.rightLeg.rotation.z = -0.18;
        this.leftLeg.rotation.z = 0.18;
        this.pilotBody.rotation.x = -0.08;
        setSquash(-0.035);
        return;
      }
      if (state.action === 'swim') {
        const paddle = Math.sin(this.walkPhase * 1.35);
        this.rightArm.rotation.x = -0.82 + paddle * 0.22;
        this.leftArm.rotation.x = -0.82 - paddle * 0.22;
        this.rightArm.rotation.z = -0.58;
        this.leftArm.rotation.z = 0.58;
        this.rightLeg.rotation.x = -0.2 - paddle * 0.26;
        this.leftLeg.rotation.x = -0.2 + paddle * 0.26;
        this.pilotBody.rotation.x = -0.28;
        setSquash(0.018 + Math.abs(paddle) * 0.012);
        return;
      }
      if (state.action === 'plane') {
        this.rightArm.rotation.x = -0.32;
        this.leftArm.rotation.x = -0.32;
        this.rightLeg.rotation.x = 0.22;
        this.leftLeg.rotation.x = 0.22;
        setSquash(0.012);
        return;
      }
    } else if (moving && (state.action === 'move' || state.action === 'sprint')) {
      applyGait(state.action === 'sprint' ? 1.45 : 1);
      return;
    }

    switch (state.action) {
      case 'mine':
      case 'chop':
        // rotation.x > 0 swings a hanging arm toward -Z (the character's front, where the
        // target sits) — this was negative, swinging the tool backward instead of striking forward.
        this.rightArm.rotation.x = 0.45 + swing * 1.35;
        this.rightArm.rotation.z = -0.32;
        this.rightSocket.rotation.z = 0.55 * swing;
        this.leftArm.rotation.x = 0.25;
        this.pilotBody.rotation.x = -0.06 * swing;
        this.rightLeg.rotation.x = -0.08;
        this.leftLeg.rotation.x = 0.12;
        setSquash(swing * 0.026);
        break;
      case 'build':
        this.rightArm.rotation.x = -0.62 - swing * 0.55;
        this.leftArm.rotation.x = -0.48 - swing * 0.2;
        this.rightArm.rotation.z = -0.34;
        this.leftArm.rotation.z = 0.32;
        this.rightLeg.rotation.x = -0.06;
        this.leftLeg.rotation.x = 0.1;
        setSquash(swing * 0.018);
        break;
      case 'craft':
        this.rightArm.rotation.x = -0.85 + Math.sin(p * Math.PI * 4) * 0.12;
        this.leftArm.rotation.x = -0.75 - Math.sin(p * Math.PI * 4) * 0.12;
        this.rightArm.rotation.z = -0.42;
        this.leftArm.rotation.z = 0.42;
        this.rightLeg.rotation.x = 0.06;
        this.leftLeg.rotation.x = 0.06;
        setSquash(Math.abs(Math.sin(p * Math.PI * 4)) * 0.012);
        break;
      case 'fish':
        this.rightArm.rotation.x = -1.25 + swing * 0.45;
        this.rightArm.rotation.z = -0.52;
        this.leftArm.rotation.x = -0.5;
        this.leftArm.rotation.z = 0.34;
        this.pilotBody.rotation.x = -0.04;
        this.rightLeg.rotation.x = -0.08;
        this.leftLeg.rotation.x = 0.14;
        setSquash(swing * 0.02);
        break;
      case 'farm':
        this.rightArm.rotation.x = -0.95 - swing * 0.28;
        this.leftArm.rotation.x = -0.85 - swing * 0.2;
        this.rightArm.rotation.z = -0.18;
        this.leftArm.rotation.z = 0.18;
        this.pilotBody.rotation.x = -0.12 * swing;
        this.rightLeg.rotation.x = 0.18;
        this.leftLeg.rotation.x = -0.08;
        setSquash(swing * 0.024);
        break;
      case 'cook':
      case 'interact':
        this.rightArm.rotation.x = -0.78 - swing * 0.25;
        this.leftArm.rotation.x = -0.45;
        this.rightArm.rotation.z = -0.45;
        this.leftArm.rotation.z = 0.36;
        this.rightLeg.rotation.x = 0.04;
        this.leftLeg.rotation.x = 0.04;
        setSquash(swing * 0.014);
        break;
      case 'pickup': {
        const reach = Math.sin(Math.min(1, p * 1.25) * Math.PI);
        const lift = clamp01((p - 0.36) / 0.64);
        this.pilotBody.rotation.x = -0.22 * reach + 0.04 * lift;
        this.pilotBody.position.y -= 0.045 * reach;
        this.rightArm.rotation.x = -0.96 - reach * 0.34 + lift * 0.3;
        this.leftArm.rotation.x = -0.78 - reach * 0.22 + lift * 0.22;
        this.rightArm.rotation.z = -0.26 - reach * 0.2 + lift * 0.1;
        this.leftArm.rotation.z = 0.24 + reach * 0.16 - lift * 0.08;
        this.rightSocket.rotation.x = 0.82 * reach - 0.18 * lift;
        this.rightSocket.rotation.z = -0.26 * reach + 0.18 * lift;
        this.leftSocket.rotation.x = 0.6 * reach;
        this.rightLeg.rotation.x = 0.22 * reach - 0.08 * lift;
        this.leftLeg.rotation.x = 0.18 * reach;
        this.rightLeg.rotation.z = -0.08 - 0.08 * reach;
        this.leftLeg.rotation.z = 0.08 + 0.08 * reach;
        setSquash(0.04 * reach - 0.018 * lift);
        break;
      }
      case 'ward': {
        const guard = Math.sin(Math.min(1, p * 1.2) * Math.PI);
        const slash = Math.sin(clamp01((p - 0.18) / 0.62) * Math.PI);
        this.pilotBody.rotation.x = -0.07 - guard * 0.05;
        this.pilotBody.rotation.z = -0.05 - slash * 0.04;
        this.rightArm.rotation.x = -0.78 - slash * 0.72;
        this.rightArm.rotation.z = -0.52 - guard * 0.18;
        this.leftArm.rotation.x = -0.72 + guard * 0.12;
        this.leftArm.rotation.z = 0.58 + guard * 0.18;
        this.rightSocket.rotation.z = 0.28 + slash * 0.64;
        this.rightSocket.rotation.y = -0.12 * guard;
        this.rightLeg.rotation.x = -0.14;
        this.leftLeg.rotation.x = 0.22;
        this.rightLeg.rotation.z = -0.18;
        this.leftLeg.rotation.z = 0.16;
        setSquash(0.02 + guard * 0.018);
        break;
      }
      case 'shoot': {
        const draw = clamp01(p / 0.42);
        const release = clamp01((p - 0.58) / 0.42);
        const settle = 1 - release;
        this.pilotBody.rotation.x = -0.05;
        this.pilotBody.rotation.z = -0.07 * settle;
        this.rightArm.rotation.x = -0.82 - draw * 0.16 + release * 0.2;
        this.rightArm.rotation.z = -0.52 - draw * 0.34 + release * 0.3;
        this.leftArm.rotation.x = -1.08 + release * 0.38;
        this.leftArm.rotation.z = 0.48 + draw * 0.24 - release * 0.2;
        this.rightSocket.rotation.y = -0.34 * draw + 0.18 * release;
        this.rightSocket.rotation.z = -0.18 * draw;
        this.rightLeg.rotation.x = -0.1;
        this.leftLeg.rotation.x = 0.16;
        this.rightLeg.rotation.z = -0.14;
        this.leftLeg.rotation.z = 0.14;
        setSquash(0.012 + draw * 0.012 - release * 0.012);
        break;
      }
      case 'brace': {
        const brace = Math.sin(Math.min(1, p * 1.15) * Math.PI);
        const recoil = Math.sin(clamp01((p - 0.28) / 0.72) * Math.PI);
        this.pilotBody.rotation.x = -0.22 * brace + 0.08 * recoil;
        this.pilotBody.rotation.z = -0.06 * brace;
        this.pilotBody.position.y -= 0.025 * brace;
        this.rightArm.rotation.x = -1.0 - brace * 0.25;
        this.leftArm.rotation.x = -0.95 - brace * 0.18;
        this.rightArm.rotation.z = -0.42 - brace * 0.2;
        this.leftArm.rotation.z = 0.54 + brace * 0.18;
        this.rightSocket.rotation.x = 0.4 * brace;
        this.rightLeg.rotation.x = 0.24 * brace;
        this.leftLeg.rotation.x = 0.18 * brace;
        this.rightLeg.rotation.z = -0.22;
        this.leftLeg.rotation.z = 0.22;
        setSquash(0.042 * brace - 0.018 * recoil);
        break;
      }
      case 'stagger': {
        const hit = Math.sin(p * Math.PI);
        const wobble = Math.sin(p * Math.PI * 3) * hit;
        this.pilotBody.rotation.x = 0.18 * hit;
        this.pilotBody.rotation.z = 0.14 * wobble;
        this.pilotBody.position.y += 0.025 * hit;
        this.rightArm.rotation.x = -0.22 + hit * 0.7;
        this.leftArm.rotation.x = -0.18 + hit * 0.62;
        this.rightArm.rotation.z = -0.62 - hit * 0.2;
        this.leftArm.rotation.z = 0.62 + hit * 0.2;
        this.rightLeg.rotation.x = -0.28 * hit;
        this.leftLeg.rotation.x = 0.42 * hit;
        this.rightLeg.rotation.z = -0.22 * hit;
        this.leftLeg.rotation.z = 0.26 * hit;
        setSquash(-0.035 * hit);
        break;
      }
      case 'sleep':
        this.rightArm.rotation.x = -0.25;
        this.leftArm.rotation.x = -0.25;
        this.pilotBody.rotation.z = 0.08 * swing;
        this.rightLeg.rotation.x = 0.38;
        this.leftLeg.rotation.x = 0.38;
        setSquash(0.03);
        break;
      case 'discover':
        this.rightArm.rotation.x = -1.65 + swing * 0.16;
        this.leftArm.rotation.x = -1.05;
        this.rightArm.rotation.z = -0.2;
        this.leftArm.rotation.z = 0.62;
        this.pilotBody.rotation.x = -0.05;
        this.rightLeg.rotation.x = -0.04;
        this.leftLeg.rotation.x = 0.08;
        setSquash(-0.018);
        break;
      default:
        break;
    }
  }
}
