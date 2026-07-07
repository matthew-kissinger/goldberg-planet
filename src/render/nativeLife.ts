import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Columns } from '../world/columns';
import type { Layers } from '../world/layers';
import type { NativeCreatureKind, NativeCreatureSite } from '../sim/nativeLife';
import {
  CREATURE_ACTIVE_MIXER_RADIUS,
  CREATURE_LOW_RATE_MIXER_RADIUS,
  CREATURE_FROZEN_MIXER_RADIUS,
  type CreatureSkinProvider,
  type KilnCreatureSkinFitSnapshot,
  type KilnCreatureSkinSlug,
  type KilnCreatureSkinTemplate,
} from './kilnAssets';

export const KILN_CREATURE_SKIN_SLUGS: readonly KilnCreatureSkinSlug[] = [
  'creature-moss-puff',
  'creature-brambleback',
  'creature-shell-skitter',
  'creature-reedback-grazer',
  'creature-cave-belljaw',
  'creature-cave-blinker',
  'creature-scree-snapper',
  'creature-storm-burr',
  'creature-tide-lurker',
];

const KILN_CREATURE_SKIN_BY_KIND: Record<NativeCreatureKind, KilnCreatureSkinSlug> = {
  mossPuff: 'creature-moss-puff',
  brambleback: 'creature-brambleback',
  shellSkitter: 'creature-shell-skitter',
  reedbackGrazer: 'creature-reedback-grazer',
  caveBelljaw: 'creature-cave-belljaw',
  caveBlinker: 'creature-cave-blinker',
  screeSnapper: 'creature-scree-snapper',
  stormBurr: 'creature-storm-burr',
  tideLurker: 'creature-tide-lurker',
};

type CreatureSkinStatus = 'pending' | 'loaded' | 'fallback';
type CreatureAnimationBand = 'active' | 'lowRate' | 'frozen' | 'hidden';

interface CreatureSkinRecord {
  slug: KilnCreatureSkinSlug;
  kind: NativeCreatureKind;
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationClip>;
  actions: Map<string, THREE.AnimationAction>;
  currentClip: string | null;
  lastMixerSeconds: number;
  lastLowRateStepSeconds: number;
  band: CreatureAnimationBand;
}

function mat(color: number, roughness = 0.78, metalness = 0.02, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : 0.22 });
}

type NativeLifeSilhouette =
  | 'moss-seed-puff'
  | 'shore-shell-skitter'
  | 'reedback-grazer'
  | 'blinkcap-cave-helper'
  | 'tide-eye-lurker'
  | 'hinged-bell-jaw'
  | 'lifting-scree-snapper'
  | 'gust-quill-burr'
  | 'thorn-brambleback';

const silhouettes: Record<NativeCreatureKind, NativeLifeSilhouette> = {
  mossPuff: 'moss-seed-puff',
  shellSkitter: 'shore-shell-skitter',
  reedbackGrazer: 'reedback-grazer',
  caveBlinker: 'blinkcap-cave-helper',
  tideLurker: 'tide-eye-lurker',
  caveBelljaw: 'hinged-bell-jaw',
  screeSnapper: 'lifting-scree-snapper',
  stormBurr: 'gust-quill-burr',
  brambleback: 'thorn-brambleback',
};

const materials = {
  moss: mat(0x7fae62),
  mossDark: mat(0x496c3f),
  belly: mat(0xa6c990),
  foot: mat(0x2f3540),
  eye: mat(0x10151c, 0.5, 0.02),
  seed: mat(0xd4b45d, 0.58, 0.04, 0xb89324),
  bramble: mat(0x9b7652),
  brambleDark: mat(0x59422f),
  shell: mat(0x4e6b4d),
  thorn: mat(0xd9b25a, 0.56, 0.04, 0xc4822f),
  warning: mat(0xf08a42, 0.44, 0.02, 0xe16b2e),
  shellSand: mat(0xc9ad76),
  shellBlue: mat(0x6ca6b7, 0.52, 0.03),
  shellPearl: mat(0xf1d9a1, 0.38, 0.03, 0xf2bf64),
  reedGreen: mat(0x7da65f),
  reedWet: mat(0x506c48),
  compost: mat(0x4b3a20),
  caveShell: mat(0x5b6070),
  caveShellDark: mat(0x343844),
  caveMouth: mat(0x2a1f2b),
  caveGlow: mat(0x70d6d1, 0.3, 0.03, 0x38d6cc),
  screeStone: mat(0x747780),
  screeDark: mat(0x3d3f46),
  screeWarm: mat(0xb98b4e, 0.52, 0.03, 0xb66a2e),
  stormFur: mat(0x9aa6b2),
  stormFurDark: mat(0x526070),
  stormStatic: mat(0x9be7ff, 0.34, 0.04, 0x56d7f2),
  stormAmber: mat(0xd5aa5a, 0.5, 0.03, 0xc88830),
  tideBody: mat(0x4f8ca0, 0.58, 0.03),
  tideShell: mat(0x315970, 0.62, 0.03),
  tideFin: mat(0x7fc7bc, 0.48, 0.03, 0x2faea5),
  tideFoam: mat(0xbfeee5, 0.36, 0.02, 0x7be4d9),
  tideEye: mat(0x14222a, 0.42, 0.02, 0x1bc0c2),
  blinkerBody: mat(0x6f7188, 0.68, 0.02),
  blinkerShell: mat(0x454b60, 0.72, 0.02),
  blinkerGlow: mat(0x8df0c5, 0.34, 0.02, 0x52e8bc),
  blinkerCap: mat(0xb77aa5, 0.64, 0.02, 0x874d78),
  blinkerGill: mat(0xf0c7db, 0.55, 0.02),
  blinkerFoot: mat(0x30323d, 0.78, 0.02),
};

const sphere8 = new THREE.SphereGeometry(0.5, 9, 6);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const torus = new THREE.TorusGeometry(0.72, 0.018, 6, 24);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.receiveShadow = true;
  return m;
}

function telegraph(m: THREE.Mesh, role: string): THREE.Mesh {
  m.userData.nativeTelegraphRole = role;
  return m;
}

function overlay(m: THREE.Mesh, role: string): THREE.Mesh {
  m.userData.nativeOverlayRole = role;
  return m;
}

function makeMossPuff(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.moss, [0, 0.36, 0], [0.48, 0.36, 0.43], 'puffBody'));
  g.add(mesh(sphere8, materials.belly, [0, 0.28, -0.3], [0.28, 0.18, 0.08], 'puffBelly'));
  for (const x of [-0.2, 0.2]) {
    const eye = mesh(sphere8, materials.eye, [x, 0.44, -0.39], [0.035, 0.035, 0.018], 'puffEye');
    g.add(eye);
  }
  for (let i = 0; i < 5; i++) {
    const a = site.id * 0.37 + i * 1.26;
    const tuft = mesh(cone8, i % 2 === 0 ? materials.mossDark : materials.moss, [Math.cos(a) * 0.2, 0.7 + (i % 2) * 0.05, Math.sin(a) * 0.16], [0.055, 0.2, 0.055], 'puffTuft');
    tuft.rotation.z = 0.45 * Math.cos(a);
    tuft.rotation.y = a;
    g.add(tuft);
  }
  for (const x of [-0.23, 0.23]) {
    for (const z of [-0.14, 0.18]) {
      const foot = mesh(sphere8, materials.foot, [x, 0.08, z], [0.08, 0.045, 0.075], 'puffFoot');
      g.add(foot);
    }
  }
  for (let i = 0; i < 3; i++) {
    const seed = overlay(mesh(cyl8, materials.seed, [-0.12 + i * 0.12, 0.57 + i * 0.025, 0.25], [0.026, 0.11, 0.026], 'puffSeedBurr'), 'seed reward burr');
    seed.rotation.x = Math.PI / 2;
    seed.rotation.z = i * 0.7;
    seed.visible = !site.tended;
    g.add(seed);
  }
  return g;
}

function makeBrambleback(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.bramble, [0, 0.34, 0], [0.58, 0.34, 0.46], 'brambleBody'));
  g.add(mesh(sphere8, materials.shell, [0, 0.58, 0.05], [0.52, 0.22, 0.36], 'brambleShell'));
  g.add(mesh(sphere8, materials.brambleDark, [0, 0.26, -0.34], [0.26, 0.15, 0.08], 'brambleMuzzle'));
  for (const x of [-0.18, 0.18]) {
    g.add(mesh(sphere8, materials.eye, [x, 0.43, -0.42], [0.036, 0.036, 0.02], 'brambleEye'));
  }
  for (const x of [-0.22, 0.22]) {
    const horn = mesh(cone8, materials.thorn, [x, 0.58, -0.32], [0.055, 0.22, 0.055], 'brambleHorn');
    horn.rotation.x = -0.42;
    horn.rotation.z = x < 0 ? 0.35 : -0.35;
    g.add(horn);
  }
  for (let i = 0; i < 7; i++) {
    const x = -0.36 + i * 0.12;
    const z = 0.03 + Math.sin(i * 1.7 + site.id) * 0.06;
    const quill = mesh(cone8, materials.thorn, [x, 0.82, z], [0.04, 0.24 + (i % 2) * 0.05, 0.04], 'brambleQuill');
    quill.rotation.z = -0.28 + i * 0.095;
    quill.rotation.y = site.id * 0.17 + i * 0.35;
    g.add(quill);
  }
  for (const x of [-0.27, 0.27]) {
    for (const z of [-0.15, 0.18]) {
      g.add(mesh(sphere8, materials.brambleDark, [x, 0.08, z], [0.075, 0.045, 0.075], 'brambleFoot'));
    }
  }
  const ring = telegraph(mesh(torus, materials.warning, [0, 0.035, 0], [1, 1, 1], 'brambleWarningRing'), 'bristle crowding ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.warded;
  g.add(ring);
  return g;
}

function makeShellSkitter(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.shellSand, [0, 0.2, 0], [0.34, 0.16, 0.28], 'skitterBody'));
  g.add(mesh(sphere8, materials.shellBlue, [0, 0.35, 0.06], [0.3, 0.18, 0.24], 'skitterShell'));
  g.add(mesh(sphere8, materials.shellSand, [0, 0.2, -0.3], [0.18, 0.11, 0.09], 'skitterFace'));
  for (const x of [-0.08, 0.08]) {
    g.add(mesh(sphere8, materials.eye, [x, 0.27, -0.37], [0.026, 0.026, 0.014], 'skitterEye'));
  }
  for (const x of [-0.12, 0.12]) {
    const feeler = mesh(cyl8, materials.shellSand, [x, 0.39, -0.36], [0.014, 0.2, 0.014], 'skitterFeeler');
    feeler.rotation.x = -0.65;
    feeler.rotation.z = x < 0 ? -0.25 : 0.25;
    g.add(feeler);
  }
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const leg = mesh(cyl8, materials.brambleDark, [side * 0.26, 0.09, -0.16 + row * 0.16], [0.018, 0.18, 0.018], 'skitterLeg');
    leg.rotation.z = side * 1.12;
    leg.rotation.x = -0.2 + row * 0.13;
    g.add(leg);
  }
  const scrapMat = site.reward.item === 'kelp' ? materials.mossDark : materials.shellPearl;
  const scrap = overlay(mesh(site.reward.item === 'kelp' ? cone8 : sphere8, scrapMat, [0.24, 0.24, -0.12], [0.055, 0.12, 0.055], 'skitterRewardScrap'), 'shore reward scrap');
  scrap.rotation.z = 0.45;
  scrap.visible = !site.tended;
  g.add(scrap);
  return g;
}

function makeCaveBelljaw(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  const lower = mesh(sphere8, materials.caveShellDark, [0, 0.23, 0.02], [0.52, 0.18, 0.38], 'belljawLowerShell');
  const upper = telegraph(mesh(sphere8, materials.caveShell, [0, 0.47, -0.03], [0.58, 0.2, 0.42], 'belljawUpperShell'), 'hinged cave jaw lift');
  upper.rotation.x = -0.16;
  g.add(lower, upper);
  g.add(mesh(sphere8, materials.caveMouth, [0, 0.34, -0.34], [0.38, 0.11, 0.08], 'belljawMouth'));
  g.add(mesh(sphere8, materials.caveGlow, [0, 0.34, -0.42], [0.1, 0.07, 0.04], 'belljawGlowTongue'));
  for (const x of [-0.18, 0.18]) {
    const tooth = mesh(cone8, materials.thorn, [x, 0.38, -0.42], [0.045, 0.13, 0.045], 'belljawTooth');
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  for (const x of [-0.24, 0.24]) {
    const stalk = mesh(cyl8, materials.caveShellDark, [x, 0.62, -0.18], [0.018, 0.22, 0.018], 'belljawEyeStalk');
    stalk.rotation.x = -0.48;
    stalk.rotation.z = x < 0 ? -0.16 : 0.16;
    g.add(stalk);
    g.add(mesh(sphere8, materials.eye, [x, 0.73, -0.27], [0.036, 0.036, 0.018], 'belljawEye'));
  }
  for (const x of [-0.28, 0.28]) {
    for (const z of [-0.12, 0.18]) {
      g.add(mesh(sphere8, materials.caveShellDark, [x, 0.08, z], [0.08, 0.045, 0.08], 'belljawHingeFoot'));
    }
  }
  for (let i = 0; i < 5; i++) {
    const x = -0.28 + i * 0.14;
    const ridge = mesh(cone8, i % 2 === 0 ? materials.caveShell : materials.caveShellDark, [x, 0.7, 0.04], [0.04, 0.16 + (i % 2) * 0.035, 0.04], 'belljawShellRidge');
    ridge.rotation.z = -0.22 + i * 0.1;
    ridge.rotation.y = site.id * 0.13 + i * 0.34;
    g.add(ridge);
  }
  const ring = telegraph(mesh(torus, materials.caveGlow, [0, 0.035, 0], [0.92, 0.92, 0.92], 'belljawWarningRing'), 'glow clap warning ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.warded;
  g.add(ring);
  return g;
}

function makeCaveBlinker(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.blinkerBody, [0, 0.31, 0], [0.46, 0.28, 0.4], 'blinkerBody'));
  g.add(mesh(sphere8, materials.blinkerGlow, [0, 0.25, -0.33], [0.24, 0.11, 0.06], 'blinkerBellyGlow'));
  g.add(mesh(sphere8, materials.blinkerShell, [0, 0.48, 0.08], [0.44, 0.17, 0.32], 'blinkerShell'));
  g.add(mesh(sphere8, materials.blinkerShell, [0, 0.34, -0.34], [0.22, 0.09, 0.06], 'blinkerSleepyMuzzle'));
  for (const x of [-0.16, 0.16]) {
    g.add(mesh(sphere8, materials.blinkerGlow, [x, 0.43, -0.42], [0.075, 0.075, 0.032], 'blinkerEyeBulb'));
    g.add(mesh(sphere8, materials.blinkerShell, [x, 0.49, -0.43], [0.086, 0.026, 0.024], 'blinkerEyelid'));
    const antenna = mesh(cyl8, materials.blinkerGill, [x * 0.72, 0.66, -0.11], [0.014, 0.18, 0.014], 'blinkerAntenna');
    antenna.rotation.x = -0.34;
    antenna.rotation.z = x < 0 ? -0.24 : 0.24;
    g.add(antenna);
    g.add(mesh(sphere8, materials.blinkerGlow, [x * 0.86, 0.79, -0.18], [0.035, 0.035, 0.025], 'blinkerAntennaGlow'));
  }
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.13, 0.18]) {
      g.add(mesh(sphere8, materials.blinkerFoot, [x, 0.08, z], [0.07, 0.04, 0.08], 'blinkerFoot'));
    }
  }
  const capCount = site.label.includes('spring') ? 3 : 2;
  for (let i = 0; i < capCount; i++) {
    const x = -0.13 + i * 0.13;
    const z = 0.17 + (i % 2) * 0.05;
    const stem = overlay(mesh(cyl8, materials.blinkerGill, [x, 0.62 + i * 0.015, z], [0.025, 0.1, 0.025], 'blinkerMushroomStem'), 'cave mushroom reward stem');
    stem.visible = !site.tended;
    g.add(stem);
    const cap = overlay(mesh(cone8, materials.blinkerCap, [x, 0.72 + i * 0.015, z], [0.11, 0.1, 0.11], 'blinkerMushroomCap'), 'cave mushroom reward cap');
    cap.rotation.y = site.id * 0.17 + i;
    cap.visible = !site.tended;
    g.add(cap);
  }
  const ring = telegraph(mesh(torus, materials.blinkerGlow, [0, 0.034, 0], [0.7, 0.7, 0.7], 'blinkerFocusRing'), 'blink rhythm focus ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.tended;
  g.add(ring);
  return g;
}

function makeScreeSnapper(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.screeStone, [0, 0.24, 0], [0.56, 0.2, 0.42], 'snapperBody'));
  g.add(mesh(sphere8, materials.screeDark, [0, 0.2, -0.32], [0.34, 0.1, 0.08], 'snapperMouth'));
  for (const x of [-0.18, 0.18]) {
    g.add(mesh(sphere8, materials.eye, [x, 0.34, -0.4], [0.034, 0.034, 0.018], 'snapperEye'));
  }
  for (const x of [-0.22, 0.22]) {
    const plate = telegraph(mesh(cone8, materials.screeStone, [x, 0.49, -0.18], [0.12, 0.22, 0.08], 'snapperJawPlate'), 'lifting scree jaw plates');
    plate.rotation.x = -0.92;
    plate.rotation.z = x < 0 ? -0.2 : 0.2;
    g.add(plate);
  }
  for (let i = 0; i < 6; i++) {
    const x = -0.32 + i * 0.128;
    const shard = mesh(cone8, i % 2 === 0 ? materials.screeDark : materials.screeStone, [x, 0.49, 0.06 + Math.sin(site.id + i) * 0.05], [0.045, 0.18 + (i % 2) * 0.04, 0.045], 'snapperBackShard');
    shard.rotation.z = -0.22 + i * 0.08;
    shard.rotation.y = site.id * 0.17 + i * 0.28;
    shard.visible = !site.warded;
    g.add(shard);
  }
  for (const x of [-0.26, 0.26]) {
    for (const z of [-0.12, 0.18]) {
      const foot = mesh(sphere8, materials.screeDark, [x, 0.07, z], [0.07, 0.04, 0.085], 'snapperWedgeFoot');
      g.add(foot);
    }
  }
  const tail = mesh(cone8, materials.screeStone, [0, 0.23, 0.4], [0.07, 0.2, 0.07], 'snapperTailShard');
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  const ring = telegraph(mesh(torus, materials.screeWarm, [0, 0.034, 0], [0.94, 0.94, 0.94], 'snapperWarningRing'), 'mining-noise snap ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.warded;
  g.add(ring);
  return g;
}

function makeStormBurr(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.stormFur, [0, 0.35, 0], [0.48, 0.34, 0.43], 'stormBurrBody'));
  g.add(mesh(sphere8, materials.stormFurDark, [0, 0.31, -0.34], [0.24, 0.13, 0.08], 'stormBurrSnout'));
  for (const x of [-0.14, 0.14]) {
    g.add(mesh(sphere8, materials.eye, [x, 0.43, -0.41], [0.032, 0.032, 0.017], 'stormBurrEye'));
  }
  for (const x of [-0.2, 0.2]) {
    const ear = mesh(cone8, materials.stormFurDark, [x, 0.62, -0.2], [0.07, 0.17, 0.055], 'stormBurrEar');
    ear.rotation.x = -0.34;
    ear.rotation.z = x < 0 ? -0.28 : 0.28;
    g.add(ear);
  }
  for (let i = 0; i < 10; i++) {
    const a = site.id * 0.21 + i * 0.63;
    const x = Math.cos(a) * (0.18 + (i % 3) * 0.035);
    const z = Math.sin(a) * 0.2 + (i % 2) * 0.03;
    const quill = telegraph(mesh(cone8, i % 3 === 0 ? materials.stormStatic : materials.stormFurDark, [x, 0.6 + (i % 2) * 0.06, z], [0.035, 0.22 + (i % 3) * 0.035, 0.035], 'stormBurrQuill'), 'flattening storm quills');
    quill.rotation.z = Math.cos(a) * 0.42;
    quill.rotation.y = a;
    quill.visible = !site.warded;
    g.add(quill);
  }
  for (const x of [-0.22, 0.22]) {
    for (const z of [-0.13, 0.18]) {
      g.add(mesh(sphere8, materials.stormFurDark, [x, 0.08, z], [0.07, 0.045, 0.075], 'stormBurrFoot'));
    }
  }
  const staticTail = mesh(cone8, materials.stormStatic, [0, 0.35, 0.36], [0.052, 0.18, 0.052], 'stormBurrStaticTail');
  staticTail.rotation.x = Math.PI / 2;
  staticTail.visible = !site.warded;
  g.add(staticTail);
  const ring = telegraph(mesh(torus, materials.stormStatic, [0, 0.034, 0], [0.9, 0.9, 0.9], 'stormBurrWarningRing'), 'static gust warning ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.warded;
  g.add(ring);
  const windArc = telegraph(mesh(torus, materials.stormAmber, [0, 0.36, 0.02], [0.58, 0.25, 0.58], 'stormBurrWindArc'), 'directional gust arc');
  windArc.rotation.x = Math.PI / 2;
  windArc.rotation.z = 0.65;
  windArc.visible = !site.warded;
  g.add(windArc);
  return g;
}

function makeTideLurker(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.tideBody, [0, 0.24, 0], [0.66, 0.18, 0.46], 'tideLurkerBody'));
  g.add(mesh(sphere8, materials.tideShell, [0, 0.38, 0.08], [0.54, 0.16, 0.34], 'tideLurkerShell'));
  g.add(mesh(sphere8, materials.tideShell, [0, 0.2, -0.35], [0.36, 0.09, 0.08], 'tideLurkerMouth'));
  for (const x of [-0.2, 0.2]) {
    const stalk = mesh(cyl8, materials.tideFin, [x, 0.48, -0.22], [0.018, 0.26, 0.018], 'tideLurkerEyeStalk');
    stalk.rotation.x = -0.5;
    stalk.rotation.z = x < 0 ? -0.18 : 0.18;
    g.add(stalk);
    g.add(telegraph(mesh(sphere8, materials.tideEye, [x, 0.63, -0.33], [0.048, 0.048, 0.024], 'tideLurkerEyeBulb'), 'rising tide eye bulbs'));
  }
  for (const x of [-0.38, 0.38]) {
    const fin = mesh(cone8, materials.tideFin, [x, 0.2, -0.04], [0.12, 0.28, 0.055], 'tideLurkerFin');
    fin.rotation.z = x < 0 ? 1.24 : -1.24;
    fin.rotation.x = 0.18;
    g.add(fin);
  }
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    const whisker = mesh(cyl8, materials.tideFoam, [x, 0.23, -0.45], [0.012, 0.22, 0.012], 'tideLurkerWhisker');
    whisker.rotation.x = -1.2;
    whisker.rotation.z = -0.24 + i * 0.16;
    whisker.visible = !site.warded;
    g.add(whisker);
  }
  const tail = mesh(cone8, materials.tideFin, [0, 0.24, 0.42], [0.09, 0.24, 0.09], 'tideLurkerTail');
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  const crestCount = site.label.includes('lamp-shy') ? 6 : 5;
  for (let i = 0; i < crestCount; i++) {
    const x = -0.3 + i * (0.6 / Math.max(1, crestCount - 1));
    const crest = mesh(cone8, i % 2 === 0 ? materials.tideFoam : materials.tideFin, [x, 0.56, 0.06 + Math.sin(site.id + i) * 0.04], [0.038, 0.16 + (i % 2) * 0.03, 0.038], 'tideLurkerCrest');
    crest.rotation.z = -0.18 + i * 0.07;
    crest.rotation.y = site.id * 0.09 + i * 0.28;
    crest.visible = !site.warded;
    g.add(crest);
  }
  const ring = telegraph(mesh(torus, materials.tideFoam, [0, 0.034, 0], [0.94, 0.94, 0.94], 'tideLurkerWarningRing'), 'tide snap warning ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = !site.warded;
  g.add(ring);
  const splashArc = telegraph(mesh(torus, materials.tideFoam, [0, 0.25, -0.08], [0.42, 0.12, 0.42], 'tideLurkerSplashArc'), 'cupped water splash arc');
  splashArc.rotation.x = Math.PI / 2;
  splashArc.rotation.z = 0.34;
  splashArc.visible = !site.warded;
  g.add(splashArc);
  return g;
}

function makeReedbackGrazer(site: NativeCreatureSite): THREE.Group {
  const g = new THREE.Group();
  g.name = `native-${site.kind}-${site.id}`;
  g.add(mesh(sphere8, materials.reedGreen, [0, 0.34, 0], [0.52, 0.3, 0.4], 'reedbackBody'));
  g.add(mesh(sphere8, materials.belly, [0, 0.27, -0.3], [0.27, 0.14, 0.08], 'reedbackMuzzle'));
  g.add(mesh(sphere8, materials.reedWet, [0, 0.55, 0.04], [0.46, 0.16, 0.3], 'reedbackManePad'));
  for (const x of [-0.16, 0.16]) {
    g.add(mesh(sphere8, materials.eye, [x, 0.39, -0.38], [0.034, 0.034, 0.018], 'reedbackEye'));
  }
  for (let i = 0; i < 6; i++) {
    const x = -0.3 + i * 0.12;
    const reed = mesh(cone8, i % 2 === 0 ? materials.reedWet : materials.reedGreen, [x, 0.72, 0.02 + Math.sin(site.id + i) * 0.04], [0.04, 0.24 + (i % 2) * 0.04, 0.04], 'reedbackManeReed');
    reed.rotation.z = -0.24 + i * 0.08;
    reed.rotation.y = site.id * 0.11 + i * 0.32;
    g.add(reed);
  }
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.14, 0.18]) {
      g.add(mesh(sphere8, materials.foot, [x, 0.08, z], [0.07, 0.045, 0.075], 'reedbackFoot'));
    }
  }
  for (let i = 0; i < 2; i++) {
    const pellet = overlay(mesh(sphere8, materials.compost, [-0.08 + i * 0.16, 0.22, 0.32], [0.06, 0.045, 0.055], 'reedbackCompostPellet'), 'compost reward pellet');
    pellet.visible = !site.tended;
    g.add(pellet);
  }
  const tail = mesh(cone8, materials.reedWet, [0, 0.38, 0.38], [0.055, 0.18, 0.055], 'reedbackTailReed');
  tail.rotation.x = Math.PI / 2;
  g.add(tail);
  return g;
}

function makeNativeCreature(site: NativeCreatureSite): THREE.Group {
  if (site.kind === 'brambleback') return makeBrambleback(site);
  if (site.kind === 'caveBelljaw') return makeCaveBelljaw(site);
  if (site.kind === 'caveBlinker') return makeCaveBlinker(site);
  if (site.kind === 'screeSnapper') return makeScreeSnapper(site);
  if (site.kind === 'stormBurr') return makeStormBurr(site);
  if (site.kind === 'tideLurker') return makeTideLurker(site);
  if (site.kind === 'shellSkitter') return makeShellSkitter(site);
  if (site.kind === 'reedbackGrazer') return makeReedbackGrazer(site);
  return makeMossPuff(site);
}

export class NativeLifeRenderer {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private readonly skinTemplates = new Map<KilnCreatureSkinSlug, KilnCreatureSkinTemplate>();
  private readonly skinPromises = new Map<KilnCreatureSkinSlug, Promise<KilnCreatureSkinTemplate | null>>();
  private readonly skinStatus = new Map<KilnCreatureSkinSlug, CreatureSkinStatus>();
  private readonly skinRecords = new Map<number, CreatureSkinRecord>();

  constructor(scene: THREE.Scene, private readonly creatureSkins?: CreatureSkinProvider) {
    this.group.name = 'native-life';
    scene.add(this.group);
  }

  setSites(sites: readonly NativeCreatureSite[]): void {
    const wanted = new Set(sites.map((site) => site.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.disposeSkinRecord(id);
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const site of sites) {
      let obj = this.objects.get(site.id);
      if (!obj) {
        obj = makeNativeCreature(site);
        obj.userData.nativeCreatureId = site.id;
        obj.userData.tile = site.tile;
        obj.userData.nativeKind = site.kind;
        obj.userData.nativeTemperament = site.temperament;
        obj.userData.nativeSilhouette = silhouettes[site.kind];
        this.objects.set(site.id, obj);
        this.group.add(obj);
      }
      const slug = KILN_CREATURE_SKIN_BY_KIND[site.kind];
      this.ensureSkin(slug);
      const template = this.skinTemplates.get(slug);
      if (template) this.attachSkin(site, obj, template);
    }
  }

  private ensureSkin(slug: KilnCreatureSkinSlug): void {
    if (this.skinTemplates.has(slug)) {
      this.skinStatus.set(slug, 'loaded');
      return;
    }
    if (!this.creatureSkins) {
      this.skinStatus.set(slug, 'fallback');
      return;
    }
    if (this.skinPromises.has(slug)) {
      this.skinStatus.set(slug, 'pending');
      return;
    }
    this.skinStatus.set(slug, 'pending');
    const promise = this.creatureSkins.createCreatureSkinTemplate(slug)
      .then((template) => {
        this.skinPromises.delete(slug);
        if (!template) {
          this.skinStatus.set(slug, 'fallback');
          return null;
        }
        this.skinTemplates.set(slug, template);
        this.skinStatus.set(slug, 'loaded');
        for (const obj of this.objects.values()) {
          if (obj.userData.nativeKind === template.kind) {
            const site: NativeCreatureSite = {
              id: Number(obj.userData.nativeCreatureId),
              kind: template.kind,
              tile: Number(obj.userData.tile),
              slot: 0,
              label: String(obj.userData.nativeKind),
              detail: '',
              temperament: obj.userData.nativeTemperament === 'harmless' ? 'harmless' : obj.userData.nativeTemperament === 'combative' ? 'combative' : 'territorial',
              reward: { item: 'reeds', count: 1, label: 'reward' },
              tended: false,
              warded: false,
              hint: '',
            };
            this.attachSkin(site, obj, template);
          }
        }
        return template;
      })
      .catch(() => {
        this.skinPromises.delete(slug);
        this.skinStatus.set(slug, 'fallback');
        return null;
      });
    this.skinPromises.set(slug, promise);
  }

  private disposeSkinRecord(id: number): void {
    const record = this.skinRecords.get(id);
    if (!record) return;
    record.mixer.stopAllAction();
    record.mixer.uncacheRoot(record.root);
    this.skinRecords.delete(id);
  }

  private attachSkin(site: NativeCreatureSite, obj: THREE.Group, template: KilnCreatureSkinTemplate): void {
    if (this.skinRecords.has(site.id)) return;
    const root = template.template.clone(true);
    root.name = `kiln-creature-${template.slug}-${site.id}`;
    root.userData.kilnAssetSlug = template.slug;
    root.userData.kilnCreatureKind = template.kind;
    root.userData.kilnCreatureFit = template.fit;
    root.userData.kilnCreatureSkin = true;
    root.traverse((child) => {
      child.userData.kilnAssetSlug = template.slug;
      child.userData.kilnCreatureKind = template.kind;
      child.userData.kilnCreatureSkin = true;
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
      }
    });
    obj.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const clips = new Map(template.clips.map((clip) => [clip.name, clip]));
    this.skinRecords.set(site.id, {
      slug: template.slug,
      kind: template.kind,
      root,
      mixer,
      clips,
      actions: new Map(),
      currentClip: null,
      lastMixerSeconds: 0,
      lastLowRateStepSeconds: 0,
      band: 'frozen',
    });
    this.applyProceduralBodyVisibility(obj, false);
  }

  private applyProceduralBodyVisibility(obj: THREE.Group, visible: boolean): void {
    obj.traverse((child) => {
      if (child.userData.kilnCreatureSkin) return;
      if (!(child as THREE.Mesh).isMesh) return;
      if (typeof child.userData.nativeTelegraphRole === 'string') return;
      if (typeof child.userData.nativeOverlayRole === 'string') return;
      child.visible = visible;
    });
  }

  private updateCreatureSkin(site: NativeCreatureSite, obj: THREE.Group, seconds: number): void {
    const record = this.skinRecords.get(site.id);
    if (!record) return;
    this.applyProceduralBodyVisibility(obj, false);
    const distance = obj.position.length();
    const desiredBand: CreatureAnimationBand =
      distance <= CREATURE_ACTIVE_MIXER_RADIUS ? 'active'
      : distance <= CREATURE_LOW_RATE_MIXER_RADIUS ? 'lowRate'
      : distance <= CREATURE_FROZEN_MIXER_RADIUS ? 'frozen'
      : 'hidden';
    record.band = desiredBand;
    record.root.visible = desiredBand !== 'hidden';
    const desiredClip = site.temperament === 'harmless' || site.tended || site.warded ? 'idle' : 'walk';
    const clip = record.clips.get(desiredClip) ?? record.clips.get('idle') ?? [...record.clips.values()][0];
    if (!clip) return;
    let action = record.actions.get(clip.name);
    if (!action) {
      action = record.mixer.clipAction(clip);
      record.actions.set(clip.name, action);
    }
    if (record.currentClip !== clip.name) {
      if (record.currentClip) record.actions.get(record.currentClip)?.fadeOut(0.12);
      action.reset().fadeIn(0.12).play();
      record.currentClip = clip.name;
    }
    const dt = record.lastMixerSeconds > 0 ? Math.max(0, Math.min(0.05, seconds - record.lastMixerSeconds)) : 1 / 60;
    record.lastMixerSeconds = seconds;
    const shouldStepLowRate = desiredBand === 'lowRate' && seconds - record.lastLowRateStepSeconds >= 0.24;
    for (const ownedAction of record.actions.values()) ownedAction.paused = desiredBand !== 'active' && !shouldStepLowRate;
    if (desiredBand === 'active') {
      record.mixer.update(dt);
    } else if (shouldStepLowRate) {
      record.mixer.update(Math.min(0.08, Math.max(0.016, seconds - record.lastLowRateStepSeconds)));
      record.lastLowRateStepSeconds = seconds;
      for (const ownedAction of record.actions.values()) ownedAction.paused = true;
    }
  }

  update(
    sites: readonly NativeCreatureSite[],
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
    for (const site of sites) {
      const obj = this.objects.get(site.id);
      if (!obj) continue;
      const frame = geo.frameOf(site.tile);
      const yaw = site.id * 0.41 + Math.sin(seconds * 0.58 + site.id) * 0.16;
      const ca = Math.cos(yaw);
      const sa = Math.sin(yaw);
      vX.set(
        frame.east[0] * ca + frame.north[0] * sa,
        frame.east[1] * ca + frame.north[1] * sa,
        frame.east[2] * ca + frame.north[2] * sa,
      );
      vY.set(...frame.normal);
      vZ.set(
        -frame.east[0] * sa + frame.north[0] * ca,
        -frame.east[1] * sa + frame.north[1] * ca,
        -frame.east[2] * sa + frame.north[2] * ca,
      );
      m.makeBasis(vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const ground = layers.topRadius(columns.groundLayerBelow(site.tile, layers.bounds[0]));
      const hop = site.kind === 'brambleback'
        ? Math.max(0, Math.sin(seconds * 2.05 + site.id * 0.31)) * 0.04
        : site.kind === 'caveBelljaw'
        ? Math.max(0, Math.sin(seconds * 3.35 + site.id * 0.37)) * 0.035
        : site.kind === 'caveBlinker'
        ? Math.max(0, Math.sin(seconds * 2.8 + site.id * 0.41)) * 0.05
        : site.kind === 'screeSnapper'
        ? Math.max(0, Math.sin(seconds * 4.1 + site.id * 0.33)) * 0.055
        : site.kind === 'stormBurr'
        ? Math.max(0, Math.sin(seconds * 4.8 + site.id * 0.29)) * 0.065
        : site.kind === 'tideLurker'
        ? Math.max(0, Math.sin(seconds * 3.9 + site.id * 0.25)) * 0.038
        : site.kind === 'shellSkitter'
        ? Math.max(0, Math.sin(seconds * 5.4 + site.id * 0.23)) * 0.025
        : site.kind === 'reedbackGrazer'
        ? Math.max(0, Math.sin(seconds * 2.2 + site.id * 0.27)) * 0.045
        : Math.max(0, Math.sin(seconds * 2.7 + site.id * 0.31)) * 0.07;
      const grazeA = site.kind === 'shellSkitter'
        ? Math.sin(seconds * 1.4 + site.id) * 0.16
        : site.kind === 'caveBelljaw'
        ? Math.sin(seconds * 0.72 + site.id) * 0.07
        : site.kind === 'caveBlinker'
        ? Math.sin(seconds * 0.86 + site.id) * 0.1
        : site.kind === 'screeSnapper'
        ? Math.sin(seconds * 0.94 + site.id) * 0.08
        : site.kind === 'stormBurr'
        ? Math.sin(seconds * 1.9 + site.id) * 0.2
        : site.kind === 'tideLurker'
        ? Math.sin(seconds * 1.65 + site.id) * 0.18
        : site.kind === 'reedbackGrazer'
        ? Math.sin(seconds * 0.62 + site.id) * 0.14
        : Math.sin(seconds * 0.43 + site.id) * 0.12;
      const grazeB = site.kind === 'shellSkitter'
        ? Math.cos(seconds * 1.1 + site.id * 1.7) * 0.12
        : site.kind === 'caveBelljaw'
        ? Math.cos(seconds * 0.68 + site.id * 1.7) * 0.06
        : site.kind === 'caveBlinker'
        ? Math.cos(seconds * 0.92 + site.id * 1.7) * 0.09
        : site.kind === 'screeSnapper'
        ? Math.cos(seconds * 0.86 + site.id * 1.7) * 0.07
        : site.kind === 'stormBurr'
        ? Math.cos(seconds * 1.35 + site.id * 1.7) * 0.16
        : site.kind === 'tideLurker'
        ? Math.cos(seconds * 1.2 + site.id * 1.7) * 0.15
        : site.kind === 'reedbackGrazer'
        ? Math.cos(seconds * 0.56 + site.id * 1.7) * 0.11
        : Math.cos(seconds * 0.37 + site.id * 1.7) * 0.1;
      const r = ground + 0.06 + hop;
      obj.position.set(
        c[site.tile * 3] * r + vX.x * grazeA + vZ.x * grazeB - camWorld.x,
        c[site.tile * 3 + 1] * r + vX.y * grazeA + vZ.y * grazeB - camWorld.y,
        c[site.tile * 3 + 2] * r + vX.z * grazeA + vZ.z * grazeB - camWorld.z,
      );
      const breathe = site.kind === 'brambleback'
        ? (site.warded ? 0.9 : 1 + Math.sin(seconds * 4.8 + site.id) * 0.055)
        : site.kind === 'caveBelljaw'
        ? (site.warded ? 0.84 : 1 + Math.sin(seconds * 5.6 + site.id) * 0.06)
        : site.kind === 'caveBlinker'
        ? (site.tended ? 0.84 : 1 + Math.sin(seconds * 3.8 + site.id) * 0.05)
        : site.kind === 'screeSnapper'
        ? (site.warded ? 0.72 : 1 + Math.sin(seconds * 5.3 + site.id) * 0.07)
        : site.kind === 'stormBurr'
        ? (site.warded ? 0.78 : 1 + Math.sin(seconds * 6.8 + site.id) * 0.075)
        : site.kind === 'tideLurker'
        ? (site.warded ? 0.76 : 1 + Math.sin(seconds * 5.9 + site.id) * 0.065)
        : site.kind === 'shellSkitter'
        ? (site.tended ? 0.82 : 1 + Math.sin(seconds * 6.2 + site.id) * 0.035)
        : site.kind === 'reedbackGrazer'
        ? (site.tended ? 0.88 : 1 + Math.sin(seconds * 2.6 + site.id) * 0.045)
        : (site.tended ? 0.9 : 1 + Math.sin(seconds * 3.1 + site.id) * 0.04);
      obj.scale.setScalar((site.kind === 'brambleback' ? 2.05 : site.kind === 'caveBelljaw' ? 1.95 : site.kind === 'caveBlinker' ? 1.62 : site.kind === 'screeSnapper' ? 1.72 : site.kind === 'stormBurr' ? 1.7 : site.kind === 'tideLurker' ? 1.76 : site.kind === 'shellSkitter' ? 1.45 : site.kind === 'reedbackGrazer' ? 1.85 : 1.75) * breathe);
      obj.visible = true;
      obj.traverse((child) => {
        if (child.name === 'puffSeedBurr') child.visible = !site.tended;
        if (child.name === 'puffBody') child.scale.set(0.48, 0.34 + Math.sin(seconds * 3.1 + site.id) * 0.025, 0.43);
        if (child.name === 'puffTuft') child.rotation.z += Math.sin(seconds * 2.4 + site.id) * 0.002;
        if (child.name === 'skitterRewardScrap') child.visible = !site.tended;
        if (child.name === 'skitterLeg') child.rotation.x += Math.sin(seconds * 8.5 + site.id) * 0.006;
        if (child.name === 'skitterFeeler') child.rotation.z += Math.sin(seconds * 4.8 + site.id) * 0.004;
        if (child.name === 'reedbackCompostPellet') child.visible = !site.tended;
        if (child.name === 'reedbackManeReed') child.rotation.z += Math.sin(seconds * 3.4 + site.id) * 0.003;
        if (child.name === 'reedbackTailReed') child.rotation.z += Math.sin(seconds * 4.1 + site.id) * 0.006;
        if (child.name === 'belljawUpperShell') child.rotation.x = -0.16 - (site.warded ? 0.02 : Math.max(0, Math.sin(seconds * 3.2 + site.id)) * 0.16);
        if (child.name === 'belljawGlowTongue') {
          const pulse = site.warded ? 0.75 : 1 + Math.sin(seconds * 6.1 + site.id) * 0.22;
          child.scale.set(0.1 * pulse, 0.07 * pulse, 0.04 * pulse);
        }
        if (child.name === 'belljawEyeStalk') child.rotation.z += Math.sin(seconds * 4.5 + site.id) * 0.004;
        if (child.name === 'belljawShellRidge') child.rotation.z += Math.sin(seconds * 4.9 + site.id) * 0.003;
        if (child.name === 'belljawWarningRing') {
          child.visible = !site.warded;
          child.scale.setScalar(0.86 + Math.sin(seconds * 5.2 + site.id) * 0.08);
        }
        if (child.name === 'blinkerMushroomStem' || child.name === 'blinkerMushroomCap') {
          child.visible = !site.tended;
          child.rotation.z += Math.sin(seconds * 3.6 + site.id) * 0.003;
        }
        if (child.name === 'blinkerEyeBulb') {
          const blink = 0.32 + Math.max(0, Math.sin(seconds * 2.2 + site.id * 0.23)) * 0.68;
          child.scale.set(0.075, 0.035 + blink * 0.04, 0.032);
        }
        if (child.name === 'blinkerEyelid') {
          child.position.y = 0.49 - Math.max(0, Math.sin(seconds * 2.2 + site.id * 0.23)) * 0.03;
        }
        if (child.name === 'blinkerBellyGlow') {
          const pulse = site.tended ? 0.72 : 1 + Math.sin(seconds * 4.8 + site.id) * 0.2;
          child.scale.set(0.24 * pulse, 0.11 * pulse, 0.06 * pulse);
        }
        if (child.name === 'blinkerAntennaGlow') {
          const pulse = site.tended ? 0.72 : 1 + Math.sin(seconds * 4.8 + site.id) * 0.2;
          child.scale.set(0.035 * pulse, 0.035 * pulse, 0.025 * pulse);
        }
        if (child.name === 'blinkerAntenna') child.rotation.z += Math.sin(seconds * 3.8 + site.id) * 0.004;
        if (child.name === 'blinkerFoot') child.scale.y = 0.04 + Math.max(0, Math.sin(seconds * 4.2 + site.id)) * 0.01;
        if (child.name === 'blinkerFocusRing') {
          child.visible = !site.tended;
          child.scale.setScalar(0.7 + Math.sin(seconds * 3.9 + site.id) * 0.07);
        }
        if (child.name === 'snapperJawPlate') child.rotation.x = -0.92 - (site.warded ? -0.12 : Math.max(0, Math.sin(seconds * 3.9 + site.id)) * 0.34);
        if (child.name === 'snapperBackShard') {
          child.visible = !site.warded;
          child.rotation.z += Math.sin(seconds * 5.8 + site.id) * 0.004;
        }
        if (child.name === 'snapperTailShard') child.rotation.z += Math.sin(seconds * 5.1 + site.id) * 0.008;
        if (child.name === 'snapperWarningRing') {
          child.visible = !site.warded;
          child.scale.setScalar(0.78 + Math.max(0, Math.sin(seconds * 4.6 + site.id)) * 0.22);
        }
        if (child.name === 'stormBurrQuill') {
          child.visible = !site.warded;
          child.rotation.z += Math.sin(seconds * 8.4 + site.id) * 0.006;
        }
        if (child.name === 'stormBurrStaticTail') {
          child.visible = !site.warded;
          child.rotation.z += Math.sin(seconds * 7.4 + site.id) * 0.01;
        }
        if (child.name === 'stormBurrWarningRing') {
          child.visible = !site.warded;
          child.scale.setScalar(0.8 + Math.max(0, Math.sin(seconds * 6.2 + site.id)) * 0.18);
        }
        if (child.name === 'stormBurrWindArc') {
          child.visible = !site.warded;
          child.rotation.z = seconds * 1.8 + site.id * 0.12;
          child.scale.set(0.58, 0.24 + Math.sin(seconds * 5.7 + site.id) * 0.04, 0.58);
        }
        if (child.name === 'tideLurkerEyeStalk') child.rotation.z += Math.sin(seconds * 3.7 + site.id) * 0.004;
        if (child.name === 'tideLurkerFin') child.rotation.x += Math.sin(seconds * 5.3 + site.id) * 0.007;
        if (child.name === 'tideLurkerWhisker') {
          child.visible = !site.warded;
          child.rotation.z += Math.sin(seconds * 4.9 + site.id) * 0.005;
        }
        if (child.name === 'tideLurkerTail') child.rotation.z += Math.sin(seconds * 6.1 + site.id) * 0.012;
        if (child.name === 'tideLurkerCrest') {
          child.visible = !site.warded;
          child.rotation.z += Math.sin(seconds * 5.4 + site.id) * 0.004;
        }
        if (child.name === 'tideLurkerWarningRing') {
          child.visible = !site.warded;
          child.scale.setScalar(0.78 + Math.max(0, Math.sin(seconds * 4.9 + site.id)) * 0.22);
        }
        if (child.name === 'tideLurkerSplashArc') {
          child.visible = !site.warded;
          child.rotation.z = seconds * 1.35 + site.id * 0.08;
          child.scale.set(0.42, 0.11 + Math.sin(seconds * 5.1 + site.id) * 0.035, 0.42);
        }
        if (child.name === 'brambleWarningRing') {
          child.visible = !site.warded;
          child.scale.setScalar(0.92 + Math.sin(seconds * 4.2 + site.id) * 0.07);
        }
        if (child.name === 'brambleQuill') child.rotation.z += Math.sin(seconds * 5.1 + site.id) * 0.0035;
      });
      this.updateCreatureSkin(site, obj, seconds);
    }
  }

  stats(): {
    groups: number;
    meshes: number;
    active: number;
    kinds: number;
    silhouettes: number;
    hazards: number;
    telegraphRoles: number;
    telegraphMeshes: number;
    kilnCreatureSkinsLoaded: number;
    kilnCreatureSkinsPending: number;
    kilnCreatureSkinFallbacks: number;
    kilnCreatureSkinGroups: number;
    kilnCreatureGlbVisible: number;
    proceduralCreatureFallbackVisible: number;
    activeMixers: number;
    lowRateMixers: number;
    frozenMixers: number;
    hiddenCreatureSkins: number;
    activeMixerRadius: number;
    lowRateMixerRadius: number;
    frozenMixerRadius: number;
    kilnCreatureSkinsBySlug: Partial<Record<KilnCreatureSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      glbVisible: number;
      clips: readonly string[];
    }>>;
    kilnCreatureSkinFits: Partial<Record<KilnCreatureSkinSlug, KilnCreatureSkinFitSnapshot>>;
  } {
    let meshes = 0;
    let active = 0;
    let hazardCount = 0;
    let telegraphMeshes = 0;
    const kinds = new Set<string>();
    const silhouettes = new Set<string>();
    const telegraphRoles = new Set<string>();
    for (const obj of this.objects.values()) {
      if (obj.visible) active++;
      if (typeof obj.userData.nativeKind === 'string') kinds.add(obj.userData.nativeKind);
      if (typeof obj.userData.nativeSilhouette === 'string') silhouettes.add(obj.userData.nativeSilhouette);
      if (obj.userData.nativeTemperament === 'territorial' || obj.userData.nativeTemperament === 'combative') hazardCount++;
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes++;
        if (typeof child.userData.nativeTelegraphRole === 'string') {
          telegraphMeshes++;
          telegraphRoles.add(child.userData.nativeTelegraphRole);
        }
      });
    }
    let activeMixers = 0;
    let lowRateMixers = 0;
    let frozenMixers = 0;
    let hiddenCreatureSkins = 0;
    let kilnCreatureGlbVisible = 0;
    let proceduralCreatureFallbackVisible = 0;
    const kilnCreatureSkinsBySlug: Partial<Record<KilnCreatureSkinSlug, {
      loaded: number;
      pending: number;
      fallback: number;
      activeMixers: number;
      lowRateMixers: number;
      frozenMixers: number;
      hidden: number;
      glbVisible: number;
      clips: readonly string[];
    }>> = {};
    const kilnCreatureSkinFits: Partial<Record<KilnCreatureSkinSlug, KilnCreatureSkinFitSnapshot>> = {};
    for (const [id, obj] of this.objects) {
      if (!this.skinRecords.has(id) && obj.visible) proceduralCreatureFallbackVisible++;
    }
    for (const slug of KILN_CREATURE_SKIN_SLUGS) {
      const status = this.skinStatus.get(slug);
      const template = this.skinTemplates.get(slug);
      const records = [...this.skinRecords.values()].filter((record) => record.slug === slug);
      const activeForSlug = records.filter((record) => record.band === 'active').length;
      const lowRateForSlug = records.filter((record) => record.band === 'lowRate').length;
      const frozenForSlug = records.filter((record) => record.band === 'frozen').length;
      const hiddenForSlug = records.filter((record) => record.band === 'hidden').length;
      const glbVisibleForSlug = records.filter((record) => record.root.visible).length;
      activeMixers += activeForSlug;
      lowRateMixers += lowRateForSlug;
      frozenMixers += frozenForSlug;
      hiddenCreatureSkins += hiddenForSlug;
      kilnCreatureGlbVisible += glbVisibleForSlug;
      if (template) kilnCreatureSkinFits[slug] = template.fit;
      kilnCreatureSkinsBySlug[slug] = {
        loaded: records.length,
        pending: status === 'pending' ? 1 : 0,
        fallback: status === 'fallback' ? 1 : 0,
        activeMixers: activeForSlug,
        lowRateMixers: lowRateForSlug,
        frozenMixers: frozenForSlug,
        hidden: hiddenForSlug,
        glbVisible: glbVisibleForSlug,
        clips: template?.clips.map((clip) => clip.name) ?? [],
      };
    }
    return {
      groups: this.objects.size,
      meshes,
      active,
      kinds: kinds.size,
      silhouettes: silhouettes.size,
      hazards: hazardCount,
      telegraphRoles: telegraphRoles.size,
      telegraphMeshes,
      kilnCreatureSkinsLoaded: this.skinRecords.size,
      kilnCreatureSkinsPending: KILN_CREATURE_SKIN_SLUGS.filter((slug) => this.skinStatus.get(slug) === 'pending').length,
      kilnCreatureSkinFallbacks: KILN_CREATURE_SKIN_SLUGS.filter((slug) => this.skinStatus.get(slug) === 'fallback').length,
      kilnCreatureSkinGroups: this.skinRecords.size,
      kilnCreatureGlbVisible,
      proceduralCreatureFallbackVisible,
      activeMixers,
      lowRateMixers,
      frozenMixers,
      hiddenCreatureSkins,
      activeMixerRadius: CREATURE_ACTIVE_MIXER_RADIUS,
      lowRateMixerRadius: CREATURE_LOW_RATE_MIXER_RADIUS,
      frozenMixerRadius: CREATURE_FROZEN_MIXER_RADIUS,
      kilnCreatureSkinsBySlug,
      kilnCreatureSkinFits,
    };
  }
}
