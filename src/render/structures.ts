import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import { homeScore, structureSocketOccupancy, type ShelterReport, type StructureSave, type StructureSocketSpec } from '../sim/structures';
import { makeSurfaceBasisFromYaw } from './surfaceFrame';

type PropFactory = () => THREE.Group;

export interface StructureSnapPreview {
  active: boolean;
  mode: 'place' | 'relocate';
  item: StructureSave['item'];
  tile: number;
  layer: number;
  yaw: number;
  turn: number;
  fromTile?: number;
  fromLayer?: number;
  ok: boolean;
  blocker: string | null;
  id?: number;
  sourceId?: number;
  message?: string;
  blockers?: readonly string[];
  socket?: StructureSocketSpec;
  socketRole?: string;
}

function mat(color: number, roughness = 0.85, metalness = 0.02, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : 0.7 });
}

const materials = {
  wood: mat(0x9a6434),
  darkWood: mat(0x5b3a22),
  stone: mat(0x7b7f84),
  soil: mat(0x5a3824),
  water: mat(0x5faed2, 0.26, 0.04, 0x287aa6),
  reed: mat(0x7da65f),
  reedTip: mat(0xb7c66e),
  cloth: mat(0x7199bd),
  warm: mat(0xff8a3d, 0.6, 0, 0xff5b18),
  metal: mat(0xa4a9ad, 0.55, 0.2),
  rope: mat(0xc9a56d),
  gold: mat(0xf0be5a, 0.48, 0.15, 0xf0a020),
  route: mat(0x87a9d6, 0.42, 0.08, 0x4b83d1),
  cave: mat(0x70d6d1, 0.36, 0.08, 0x2bcac3),
  shore: mat(0x5faed2, 0.4, 0.05, 0x287aa6),
  fish: mat(0x8bb7c8, 0.72, 0.02),
  berry: mat(0xb64263),
  ration: mat(0xb89458, 0.78, 0.02),
  weather: mat(0x9fb8c2, 0.5, 0.16),
  weatherRibbon: mat(0x87a9d6, 0.62, 0.03, 0x3f6fa5),
  storm: mat(0x82c7ff, 0.28, 0.04, 0x4aa8ff),
  cellar: mat(0x7b6a8f, 0.5, 0.08, 0x3a3354),
  cellarGlow: mat(0x8bd0b0, 0.32, 0.03, 0x48cfa2),
  forage: mat(0x7db35f, 0.58, 0.03, 0x4f8d45),
  home: mat(0xf0be5a, 0.45, 0.12, 0xf0a020),
  smoke: new THREE.MeshStandardMaterial({ color: 0x9aa3a7, roughness: 1, metalness: 0, transparent: true, opacity: 0.46, depthWrite: false }),
  snapPreviewOk: new THREE.MeshStandardMaterial({ color: 0x8fe88a, roughness: 0.55, metalness: 0.02, emissive: 0x3ecf62, emissiveIntensity: 0.45, transparent: true, opacity: 0.38, depthWrite: false }),
  snapPreviewBlocked: new THREE.MeshStandardMaterial({ color: 0xff8b64, roughness: 0.55, metalness: 0.02, emissive: 0xff4f2d, emissiveIntensity: 0.52, transparent: true, opacity: 0.42, depthWrite: false }),
  snapPreviewRingOk: new THREE.MeshStandardMaterial({ color: 0xc8f0a3, roughness: 0.6, metalness: 0.02, emissive: 0x5fd65b, emissiveIntensity: 0.65, transparent: true, opacity: 0.72, depthWrite: false }),
  snapPreviewRingBlocked: new THREE.MeshStandardMaterial({ color: 0xffc08a, roughness: 0.6, metalness: 0.02, emissive: 0xff5b36, emissiveIntensity: 0.72, transparent: true, opacity: 0.78, depthWrite: false }),
};

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const cyl12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const sphere8 = new THREE.SphereGeometry(0.5, 8, 6);
const torus = new THREE.TorusGeometry(0.5, 0.025, 6, 24);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}

function role<T extends THREE.Object3D>(obj: T, roleName: string): T {
  obj.userData.structureReadabilityRole = roleName;
  return obj;
}

type StructureSilhouette = 'waystone-attuned-marker';

function silhouette<T extends THREE.Object3D>(obj: T, silhouetteName: StructureSilhouette): T {
  obj.userData.structureSilhouette = silhouetteName;
  return obj;
}

function post(name: string, x: number, z: number, height = 0.8): THREE.Mesh {
  return mesh(box, materials.darkWood, [x, height / 2, z], [0.09, height, 0.09], name);
}

function makeWorkbench(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-workbench';
  g.add(mesh(box, materials.wood, [0, 0.55, 0], [1.35, 0.16, 0.82], 'benchTop'));
  g.add(mesh(box, materials.darkWood, [-0.32, 0.72, -0.28], [0.38, 0.12, 0.12], 'toolBlock'));
  g.add(mesh(box, materials.metal, [0.42, 0.69, 0.24], [0.18, 0.07, 0.18], 'metalVise'));
  for (const x of [-0.55, 0.55]) for (const z of [-0.3, 0.3]) g.add(post('benchLeg', x, z, 0.55));
  return g;
}

function makeCampfire(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-campfire';
  const halo = role(mesh(torus, materials.warm, [0, 0.075, 0], [1.18, 1.18, 1.18], 'hearthWarmthHalo'), 'warmth radius from lit shelter fire');
  halo.rotation.x = Math.PI / 2;
  halo.visible = false;
  g.add(halo);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 0.48;
    const rock = mesh(cyl8, materials.stone, [Math.cos(a) * r, 0.1, Math.sin(a) * r], [0.12, 0.18, 0.12], 'fireRingStone');
    rock.rotation.y = a;
    g.add(rock);
  }
  for (let i = 0; i < 3; i++) {
    const log = mesh(cyl8, materials.darkWood, [0, 0.18 + i * 0.04, 0], [0.08, 0.8, 0.08], 'crossedLog');
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i * Math.PI / 3;
    g.add(log);
  }
  g.add(mesh(cone8, materials.warm, [0, 0.52, 0], [0.28, 0.72, 0.28], 'flameCore'));
  for (let i = 0; i < 6; i++) {
    const puff = mesh(sphere8, materials.smoke, [0, 1.1 + i * 1.45, 0], [0.55 + i * 0.34, 0.34 + i * 0.18, 0.55 + i * 0.34], `smokePuff${i}`);
    puff.visible = false;
    puff.receiveShadow = false;
    g.add(puff);
  }
  return g;
}

function makeChest(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-chest';
  g.add(mesh(box, materials.wood, [0, 0.34, 0], [0.9, 0.46, 0.62], 'chestBox'));
  g.add(mesh(box, materials.darkWood, [0, 0.62, 0], [0.94, 0.14, 0.66], 'chestLid'));
  g.add(mesh(box, materials.metal, [0, 0.47, 0.34], [0.16, 0.18, 0.05], 'frontLatch'));
  g.add(mesh(box, materials.metal, [-0.36, 0.49, 0.34], [0.08, 0.26, 0.05], 'leftBand'));
  g.add(mesh(box, materials.metal, [0.36, 0.49, 0.34], [0.08, 0.26, 0.05], 'rightBand'));
  return g;
}

function makeBedroll(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-bedroll';
  const ring = role(mesh(torus, materials.home, [0, 0.07, 0], [1.34, 1.34, 1.34], 'homeComfortRing'), 'functional shelter comfort ring');
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  g.add(ring);
  g.add(mesh(box, materials.cloth, [0, 0.12, 0], [1.25, 0.12, 0.62], 'sleepMat'));
  const roll = mesh(cyl12, materials.cloth, [-0.48, 0.24, 0], [0.18, 0.62, 0.18], 'rolledBlanket');
  roll.rotation.x = Math.PI / 2;
  g.add(roll);
  g.add(mesh(box, materials.darkWood, [0.38, 0.17, 0], [0.18, 0.08, 0.58], 'strap'));
  g.add(mesh(cone8, materials.gold, [0.5, 0.34, 0], [0.08, 0.2, 0.08], 'homeMarker'));
  return g;
}

function makeRainCistern(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-rain-cistern';
  g.add(mesh(cyl12, materials.stone, [0, 0.14, 0], [0.62, 0.24, 0.62], 'rainCisternStoneBase'));
  g.add(mesh(cyl12, materials.wood, [0, 0.42, 0], [0.5, 0.54, 0.5], 'rainCisternBarrel'));
  g.add(mesh(cyl12, materials.darkWood, [0, 0.72, 0], [0.55, 0.08, 0.55], 'rainCisternRim'));
  g.add(mesh(cyl12, materials.water, [0, 0.78, 0], [0.44, 0.035, 0.44], 'rainCisternWater'));
  for (let i = 0; i < 3; i++) {
    const ring = mesh(cyl12, materials.shore, [0, 0.805 + i * 0.012, 0], [0.24 + i * 0.1, 0.012, 0.24 + i * 0.1], `rainCisternRing${i}`);
    ring.visible = false;
    g.add(ring);
  }
  for (const x of [-0.42, 0.42]) {
    g.add(mesh(box, materials.darkWood, [x, 0.42, -0.42], [0.08, 0.6, 0.08], 'rainCisternStave'));
    g.add(mesh(box, materials.darkWood, [x, 0.42, 0.42], [0.08, 0.6, 0.08], 'rainCisternStave'));
  }
  const gutter = mesh(box, materials.metal, [0, 0.94, -0.36], [0.9, 0.06, 0.16], 'rainCisternGutter');
  gutter.rotation.x = -0.18;
  g.add(gutter);
  g.add(mesh(box, materials.weatherRibbon, [0.42, 0.84, -0.08], [0.08, 0.42, 0.04], 'rainCisternSpout'));
  return g;
}

function makeRootCellar(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-root-cellar';
  g.add(mesh(box, materials.stone, [0, 0.08, 0], [1.2, 0.12, 0.88], 'rootCellarStoneLip'));
  g.add(mesh(box, materials.soil, [0, 0.13, 0], [0.86, 0.08, 0.58], 'rootCellarDarkMouth'));
  const hatch = mesh(box, materials.darkWood, [-0.18, 0.28, 0], [0.72, 0.12, 0.52], 'rootCellarHatch');
  hatch.rotation.z = -0.18;
  g.add(hatch);
  for (let i = 0; i < 4; i++) {
    const rung = mesh(box, materials.rope, [0.24, 0.08 - i * 0.11, -0.16 + i * 0.06], [0.34, 0.035, 0.035], 'rootCellarLadderRung');
    rung.rotation.x = -0.22;
    g.add(rung);
  }
  g.add(mesh(box, materials.cellar, [0.18, 0.1, 0.12], [0.32, 0.08, 0.22], 'rootCellarCoolStone'));
  g.add(mesh(sphere8, materials.cellarGlow, [0.18, 0.22, 0.12], [0.16, 0.07, 0.16], 'rootCellarCoolGlow'));
  for (let i = 0; i < 4; i++) {
    const x = -0.3 + i * 0.18;
    const bundle = mesh(box, i % 2 === 0 ? materials.ration : materials.forage, [x, 0.34 + (i % 2) * 0.04, 0.22], [0.16, 0.09, 0.12], 'rootCellarProvisionBundle');
    bundle.rotation.y = i * 0.35;
    bundle.visible = false;
    g.add(bundle);
  }
  g.add(mesh(box, materials.darkWood, [0, 0.42, -0.32], [0.9, 0.08, 0.08], 'rootCellarBrace'));
  return g;
}

function makeDockSegment(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-dock-segment';
  for (let i = 0; i < 4; i++) {
    const z = -0.36 + i * 0.24;
    g.add(mesh(box, materials.wood, [0, 0.32, z], [1.48, 0.1, 0.16], 'dockDeckPlank'));
  }
  g.add(mesh(box, materials.darkWood, [-0.46, 0.2, 0], [0.11, 0.12, 1.08], 'dockLeftStringer'));
  g.add(mesh(box, materials.darkWood, [0.46, 0.2, 0], [0.11, 0.12, 1.08], 'dockRightStringer'));
  for (const x of [-0.58, 0.58]) {
    for (const z of [-0.42, 0.42]) {
      g.add(mesh(cyl8, materials.darkWood, [x, -0.14, z], [0.08, 0.82, 0.08], 'dockPiling'));
    }
  }
  const rail = mesh(cyl8, materials.rope, [0, 0.56, -0.48], [0.035, 1.22, 0.035], 'dockRopeRail');
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  g.add(mesh(box, materials.shore, [0.48, 0.47, 0.48], [0.16, 0.08, 0.16], 'dockFishingMark'));
  return g;
}

function makeFishTrap(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-fish-trap';
  g.add(mesh(box, materials.darkWood, [0, 0.1, 0], [0.96, 0.07, 0.62], 'fishTrapSkid'));
  for (const x of [-0.4, 0.4]) {
    g.add(mesh(cyl12, materials.rope, [x, 0.32, 0], [0.34, 0.055, 0.34], 'fishTrapHoop'));
  }
  for (const z of [-0.24, 0, 0.24]) {
    const slat = mesh(cyl8, materials.rope, [0, 0.34, z], [0.035, 0.92, 0.035], 'fishTrapLongSlat');
    slat.rotation.z = Math.PI / 2;
    g.add(slat);
  }
  for (const y of [0.2, 0.46]) {
    const slat = mesh(cyl8, materials.rope, [0, y, -0.28], [0.026, 0.82, 0.026], 'fishTrapSideSlat');
    slat.rotation.z = Math.PI / 2;
    g.add(slat);
    const back = slat.clone();
    back.name = 'fishTrapSideSlat';
    back.position.z = 0.28;
    g.add(back);
  }
  const funnel = mesh(cone8, materials.rope, [-0.5, 0.32, 0], [0.18, 0.34, 0.18], 'fishTrapFunnel');
  funnel.rotation.z = Math.PI / 2;
  g.add(funnel);
  g.add(mesh(sphere8, materials.berry, [0.06, 0.34, 0], [0.08, 0.08, 0.08], 'fishTrapBait'));
  for (let i = 0; i < 3; i++) {
    const fish = mesh(box, materials.fish, [-0.12 + i * 0.13, 0.36 + (i % 2) * 0.05, -0.06 + i * 0.06], [0.16, 0.055, 0.04], 'fishTrapFish');
    fish.rotation.y = i * 0.5;
    fish.visible = false;
    g.add(fish);
  }
  g.add(mesh(sphere8, materials.shore, [0.48, 0.82, -0.42], [0.12, 0.08, 0.12], 'fishTrapFloat'));
  const tether = mesh(cyl8, materials.rope, [0.28, 0.56, -0.28], [0.018, 0.7, 0.018], 'fishTrapTether');
  tether.rotation.z = -0.62;
  tether.rotation.x = 0.28;
  g.add(tether);
  for (let i = 0; i < 3; i++) {
    const ring = mesh(cyl12, materials.shore, [0, 0.08 + i * 0.012, 0], [0.28 + i * 0.14, 0.01, 0.28 + i * 0.14], `fishTrapSoakRing${i}`);
    ring.visible = false;
    g.add(ring);
  }
  return g;
}

function makeShoreNet(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-shore-net';
  g.add(mesh(box, materials.darkWood, [0, 0.08, 0], [1.12, 0.06, 0.08], 'shoreNetFootRail'));
  for (const x of [-0.52, 0.52]) {
    const pole = mesh(cyl8, materials.darkWood, [x, 0.46, 0], [0.035, 0.86, 0.035], 'shoreNetPole');
    pole.rotation.z = x < 0 ? -0.08 : 0.08;
    g.add(pole);
    g.add(mesh(sphere8, materials.shore, [x, 0.92, -0.05], [0.11, 0.08, 0.11], 'shoreNetFloat'));
  }
  const top = mesh(cyl8, materials.rope, [0, 0.82, 0], [0.025, 1.12, 0.025], 'shoreNetTopCord');
  top.rotation.z = Math.PI / 2;
  g.add(top);
  for (let i = 0; i < 6; i++) {
    const x = -0.42 + i * 0.168;
    const strand = mesh(box, i % 2 === 0 ? materials.reed : materials.reedTip, [x, 0.44, 0], [0.018, 0.64, 0.018], 'shoreNetStrand');
    strand.rotation.z = (i - 2.5) * 0.035;
    g.add(strand);
  }
  for (let i = 0; i < 4; i++) {
    const y = 0.24 + i * 0.14;
    g.add(mesh(box, materials.rope, [0, y, 0], [0.92, 0.018, 0.018], 'shoreNetCrossCord'));
  }
  for (let i = 0; i < 4; i++) {
    const fish = mesh(box, materials.fish, [-0.3 + i * 0.2, 0.34 + (i % 2) * 0.07, -0.05 + i * 0.025], [0.14, 0.05, 0.035], 'shoreNetFish');
    fish.rotation.y = i * 0.4;
    fish.visible = false;
    g.add(fish);
  }
  for (let i = 0; i < 3; i++) {
    const scrap = mesh(i === 0 ? sphere8 : box, i === 0 ? materials.berry : i === 1 ? materials.reed : materials.forage, [0.18 + i * 0.12, 0.28, 0.08 - i * 0.04], [0.07, 0.045, 0.07], 'shoreNetScrap');
    scrap.visible = false;
    g.add(scrap);
  }
  for (let i = 0; i < 3; i++) {
    const ring = mesh(cyl12, materials.shore, [0, 0.07 + i * 0.012, 0], [0.32 + i * 0.15, 0.01, 0.22 + i * 0.1], `shoreNetSoakRing${i}`);
    ring.visible = false;
    g.add(ring);
  }
  return g;
}

function makeDryingRack(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-drying-rack';
  const leftA = mesh(box, materials.darkWood, [-0.48, 0.46, -0.24], [0.08, 0.95, 0.08], 'dryingRackLeg');
  leftA.rotation.z = -0.22;
  const leftB = mesh(box, materials.darkWood, [-0.48, 0.46, 0.24], [0.08, 0.95, 0.08], 'dryingRackLeg');
  leftB.rotation.z = -0.22;
  const rightA = mesh(box, materials.darkWood, [0.48, 0.46, -0.24], [0.08, 0.95, 0.08], 'dryingRackLeg');
  rightA.rotation.z = 0.22;
  const rightB = mesh(box, materials.darkWood, [0.48, 0.46, 0.24], [0.08, 0.95, 0.08], 'dryingRackLeg');
  rightB.rotation.z = 0.22;
  g.add(leftA, leftB, rightA, rightB);
  const rail = mesh(cyl8, materials.wood, [0, 0.92, 0], [0.045, 1.12, 0.045], 'dryingRackRail');
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  for (let i = 0; i < 4; i++) {
    const x = -0.36 + i * 0.24;
    const cord = mesh(box, materials.rope, [x, 0.67, -0.02], [0.018, 0.36, 0.018], 'dryingFoodCord');
    const fish = mesh(box, i % 2 === 0 ? materials.fish : materials.ration, [x, 0.45, -0.02], [0.08, 0.22, 0.035], 'dryingFood');
    fish.rotation.z = (i % 2 === 0 ? -1 : 1) * 0.12;
    g.add(cord, fish);
  }
  g.add(mesh(box, materials.darkWood, [0, 0.2, 0.28], [0.9, 0.08, 0.12], 'dryingRackBrace'));
  g.add(mesh(box, materials.darkWood, [0, 0.2, -0.28], [0.9, 0.08, 0.12], 'dryingRackBrace'));
  return g;
}

function makeWeatherVane(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-weather-vane';
  g.add(mesh(cyl8, materials.stone, [0, 0.12, 0], [0.32, 0.22, 0.32], 'weatherVaneStoneBase'));
  g.add(mesh(box, materials.darkWood, [0, 0.72, 0], [0.09, 1.2, 0.09], 'weatherVanePost'));
  const disk = mesh(cyl12, materials.weather, [0, 0.34, 0], [0.42, 0.035, 0.42], 'weatherVaneCompassDisk');
  g.add(disk);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    const tick = mesh(box, i === 0 ? materials.home : materials.weather, [Math.cos(a) * 0.28, 0.39, Math.sin(a) * 0.28], [0.11, 0.035, 0.035], 'weatherVaneCompassTick');
    tick.rotation.y = -a;
    g.add(tick);
  }

  const needle = new THREE.Group();
  needle.name = 'weatherVaneNeedle';
  needle.position.set(0, 1.36, 0);
  const cross = mesh(cyl8, materials.weather, [0, 0, 0], [0.035, 0.9, 0.035], 'weatherVaneNeedleBar');
  cross.rotation.z = Math.PI / 2;
  needle.add(cross);
  const arrow = mesh(cone8, materials.weather, [0.52, 0, 0], [0.13, 0.28, 0.13], 'weatherVaneArrowHead');
  arrow.rotation.z = -Math.PI / 2;
  needle.add(arrow);
  const tailA = mesh(box, materials.weather, [-0.38, 0.05, 0], [0.18, 0.18, 0.035], 'weatherVaneTailFin');
  tailA.rotation.z = 0.42;
  const tailB = mesh(box, materials.weather, [-0.38, -0.05, 0], [0.18, 0.18, 0.035], 'weatherVaneTailFin');
  tailB.rotation.z = -0.42;
  needle.add(tailA, tailB);
  g.add(needle);

  for (let i = 0; i < 3; i++) {
    const ribbon = mesh(box, materials.weatherRibbon, [-0.08 + i * 0.08, 1.04 - i * 0.08, 0.08], [0.045, 0.34 - i * 0.05, 0.018], `weatherVaneRibbon${i}`);
    ribbon.rotation.z = -0.35 + i * 0.16;
    g.add(ribbon);
  }
  const glow = mesh(sphere8, materials.storm, [0, 1.08, 0], [0.22, 0.08, 0.22], 'weatherVaneStormGlow');
  glow.visible = false;
  g.add(glow);
  return g;
}

function makeLantern(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-lantern';
  g.add(post('lanternPost', 0, 0, 1.25));
  g.add(mesh(box, materials.darkWood, [0.2, 1.18, 0], [0.42, 0.06, 0.06], 'arm'));
  g.add(mesh(box, materials.metal, [0.4, 0.88, 0], [0.22, 0.36, 0.22], 'lanternCage'));
  g.add(mesh(box, materials.gold, [0.4, 0.88, 0], [0.14, 0.24, 0.14], 'lanternGlow'));
  return g;
}

function makeWaystone(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-waystone';
  silhouette(g, 'waystone-attuned-marker');
  g.add(mesh(cyl8, materials.stone, [0, 0.18, 0], [0.34, 0.34, 0.34], 'waystoneBase'));
  g.add(mesh(box, materials.stone, [0, 0.52, 0], [0.34, 0.58, 0.22], 'waystoneCore'));
  const surveyNeedle = role(mesh(cone8, materials.route, [0, 1.04, 0], [0.17, 0.38, 0.17], 'waystoneGlyph-survey'), 'survey bearing needle');
  surveyNeedle.rotation.z = -0.32;
  const surveyBar = role(mesh(box, materials.route, [0, 0.86, 0.03], [0.42, 0.055, 0.055], 'waystoneGlyph-survey'), 'survey route tick');
  surveyBar.rotation.z = 0.2;
  g.add(surveyNeedle, surveyBar);
  g.add(role(mesh(sphere8, materials.home, [0, 0.98, 0], [0.17, 0.17, 0.17], 'waystoneGlyph-home'), 'hearth home sun'));
  const homeRoofA = role(mesh(box, materials.home, [-0.08, 1.12, 0], [0.22, 0.055, 0.055], 'waystoneGlyph-home'), 'home roof chevron');
  homeRoofA.rotation.z = 0.55;
  const homeRoofB = role(mesh(box, materials.home, [0.08, 1.12, 0], [0.22, 0.055, 0.055], 'waystoneGlyph-home'), 'home roof chevron');
  homeRoofB.rotation.z = -0.55;
  g.add(homeRoofA, homeRoofB);
  const caveArchA = role(mesh(box, materials.cave, [-0.13, 0.96, 0], [0.06, 0.26, 0.055], 'waystoneGlyph-cave'), 'cave arch side');
  const caveArchB = role(mesh(box, materials.cave, [0.13, 0.96, 0], [0.06, 0.26, 0.055], 'waystoneGlyph-cave'), 'cave arch side');
  const caveArchTop = role(mesh(box, materials.cave, [0, 1.1, 0], [0.34, 0.055, 0.055], 'waystoneGlyph-cave'), 'cave arch lintel');
  g.add(caveArchA, caveArchB, caveArchTop);
  const shoreA = role(mesh(box, materials.shore, [0, 0.92, 0], [0.36, 0.055, 0.18], 'waystoneGlyph-shore'), 'shore wave bar');
  const shoreB = role(mesh(box, materials.shore, [0.03, 1.02, 0], [0.28, 0.045, 0.14], 'waystoneGlyph-shore'), 'shore second wave bar');
  shoreB.rotation.z = 0.22;
  g.add(shoreA, shoreB);
  const leaf = role(mesh(cone8, materials.forage, [0, 1.0, 0], [0.12, 0.28, 0.12], 'waystoneGlyph-forage'), 'forage leaf sprout');
  leaf.rotation.z = 0.55;
  const stem = role(mesh(box, materials.forage, [-0.08, 0.86, 0], [0.045, 0.28, 0.04], 'waystoneGlyph-forage'), 'forage stem');
  stem.rotation.z = -0.3;
  g.add(leaf, stem);
  g.add(mesh(box, materials.darkWood, [0, 0.58, -0.13], [0.42, 0.06, 0.04], 'waystoneBand'));
  return g;
}

const FACTORIES: Record<StructureSave['item'], PropFactory> = {
  workbench: makeWorkbench,
  campfire: makeCampfire,
  chest: makeChest,
  bedroll: makeBedroll,
  rainCistern: makeRainCistern,
  rootCellar: makeRootCellar,
  dockSegment: makeDockSegment,
  fishTrap: makeFishTrap,
  shoreNet: makeShoreNet,
  dryingRack: makeDryingRack,
  weatherVane: makeWeatherVane,
  lantern: makeLantern,
  waystone: makeWaystone,
};

export class StructureRenderer {
  readonly group = new THREE.Group();
  readonly snapPreviewGroup = new THREE.Group();
  private readonly objects = new Map<number, THREE.Group>();
  private snapPreviewObject: THREE.Group | null = null;
  private snapPreviewItem: StructureSave['item'] | null = null;
  private snapPreviewCacheKey: string | null = null;
  private lastSnapPreview: StructureSnapPreview | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = 'placed-structures';
    this.snapPreviewGroup.name = 'structure-snap-preview';
    this.snapPreviewGroup.visible = false;
    scene.add(this.group);
    scene.add(this.snapPreviewGroup);
  }

  setStructures(structures: readonly StructureSave[]): void {
    const wanted = new Set(structures.map((s) => s.id));
    for (const [id, obj] of this.objects) {
      if (!wanted.has(id)) {
        this.group.remove(obj);
        this.objects.delete(id);
      }
    }
    for (const s of structures) {
      if (this.objects.has(s.id)) continue;
      const obj = FACTORIES[s.item]();
      obj.userData.structureId = s.id;
      obj.userData.structureItem = s.item;
      obj.userData.structureTile = s.tile;
      obj.userData.structureSocket = structureSocketOccupancy(s);
      this.objects.set(s.id, obj);
      this.group.add(obj);
    }
  }

  update(structures: readonly StructureSave[], geo: Goldberg, layers: Layers, camWorld: { x: number; y: number; z: number }, timeSec = 0): void {
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const c = geo.centers;
    const shelter = homeScore(structures, geo).shelter;
    for (const s of structures) {
      const obj = this.objects.get(s.id);
      if (!obj) continue;
      obj.userData.structureTile = s.tile;
      obj.userData.structureSocket = structureSocketOccupancy(s);
      const frame = geo.frameOf(s.tile);
      makeSurfaceBasisFromYaw(frame, s.yaw, m, vX, vY, vZ);
      obj.setRotationFromMatrix(m);
      const r = layers.topRadius(s.layer) + 0.04;
      obj.position.set(
        c[s.tile * 3] * r - camWorld.x,
        c[s.tile * 3 + 1] * r - camWorld.y,
        c[s.tile * 3 + 2] * r - camWorld.z,
      );
      obj.visible = true;
      this.applyState(obj, s, timeSec, shelter);
    }
  }

  updateSnapPreview(preview: StructureSnapPreview | null, geo: Goldberg, layers: Layers, camWorld: { x: number; y: number; z: number }, timeSec = 0): void {
    this.lastSnapPreview = preview ? { ...preview } : null;
    if (!preview?.active) {
      this.snapPreviewGroup.visible = false;
      delete this.snapPreviewGroup.userData.snapPreview;
      return;
    }
    const cacheKey = `${preview.item}:${preview.socket?.role ?? preview.socketRole ?? 'none'}`;
    if (!this.snapPreviewObject || this.snapPreviewItem !== preview.item || this.snapPreviewCacheKey !== cacheKey) {
      this.snapPreviewGroup.clear();
      this.snapPreviewObject = this.makeSnapPreviewObject(preview.item);
      this.snapPreviewItem = preview.item;
      this.snapPreviewCacheKey = cacheKey;
      this.snapPreviewGroup.add(this.snapPreviewObject);
    }
    const ok = preview.ok;
    this.snapPreviewGroup.visible = true;
    this.snapPreviewGroup.userData.snapPreview = {
      ...preview,
      socketRole: preview.socket?.role ?? preview.socketRole ?? null,
      socketCollider: preview.socket?.collider ?? null,
    };
    const frame = geo.frameOf(preview.tile);
    const vX = new THREE.Vector3();
    const vY = new THREE.Vector3();
    const vZ = new THREE.Vector3();
    const m = makeSurfaceBasisFromYaw(frame, preview.yaw, new THREE.Matrix4(), vX, vY, vZ);
    this.snapPreviewGroup.setRotationFromMatrix(m);
    const c = geo.centers;
    const r = layers.topRadius(preview.layer) + 0.07;
    this.snapPreviewGroup.position.set(
      c[preview.tile * 3] * r - camWorld.x,
      c[preview.tile * 3 + 1] * r - camWorld.y,
      c[preview.tile * 3 + 2] * r - camWorld.z,
    );
    const breathe = 1 + Math.sin(timeSec * 3.1) * 0.025;
    this.snapPreviewGroup.scale.setScalar(breathe);
    this.snapPreviewGroup.traverse((child) => {
      const meshChild = child as THREE.Mesh;
      if (!meshChild.isMesh) return;
      const name = child.name;
      if (name === 'snapPreviewBlockerA' || name === 'snapPreviewBlockerB') {
        child.visible = !ok;
        meshChild.material = materials.snapPreviewRingBlocked;
      } else if (name === 'snapPreviewFootprint' || name === 'snapPreviewFaceTick') {
        child.visible = true;
        meshChild.material = ok ? materials.snapPreviewRingOk : materials.snapPreviewRingBlocked;
      } else {
        child.visible = true;
        meshChild.material = ok ? materials.snapPreviewOk : materials.snapPreviewBlocked;
      }
    });
  }

  private makeSnapPreviewObject(item: StructureSave['item']): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = 'snapPreview';
    wrapper.userData.structureReadabilityRole = 'snap preview placement ghost';
    const footprint = role(mesh(torus, materials.snapPreviewRingOk, [0, 0.04, 0], [0.95, 0.95, 0.95], 'snapPreviewFootprint'), 'snap footprint ring');
    footprint.rotation.x = Math.PI / 2;
    const faceTick = role(mesh(box, materials.snapPreviewRingOk, [0, 0.08, -0.55], [0.18, 0.035, 0.22], 'snapPreviewFaceTick'), 'snap facing tick');
    const blockerA = role(mesh(box, materials.snapPreviewRingBlocked, [0, 0.16, 0], [1.14, 0.04, 0.07], 'snapPreviewBlockerA'), 'blocked snap crossbar');
    const blockerB = role(mesh(box, materials.snapPreviewRingBlocked, [0, 0.17, 0], [0.07, 0.04, 1.14], 'snapPreviewBlockerB'), 'blocked snap crossbar');
    blockerA.rotation.y = Math.PI / 4;
    blockerB.rotation.y = Math.PI / 4;
    blockerA.visible = false;
    blockerB.visible = false;
    const ghost = FACTORIES[item]();
    ghost.name = `snapPreviewGhost-${item}`;
    ghost.scale.setScalar(0.92);
    ghost.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.name = child.name ? `snapPreviewGhost-${child.name}` : 'snapPreviewGhostPart';
        child.userData.structureReadabilityRole = 'snap preview prop silhouette';
      }
    });
    wrapper.add(footprint, faceTick);
    wrapper.add(ghost, blockerA, blockerB);
    return wrapper;
  }

  private applyState(obj: THREE.Group, structure: StructureSave, timeSec: number, shelter: ShelterReport): void {
    const lit = structure.state?.lit === true;
    const home = structure.state?.home === true;
    const shelterLocal = shelter.tiles.includes(structure.tile);
    const shelterProtected = shelter.protected && shelterLocal;
    const stored = Object.values(structure.state?.storage ?? {}).some((count) => (count ?? 0) > 0);
    const water = Math.max(0, Math.min(4, Math.trunc(structure.state?.water ?? 0)));
    const provisions = Math.max(0, Math.min(6, Math.trunc(structure.state?.provisions ?? 0)));
    const preserves = Math.max(0, Math.trunc(structure.state?.preserves ?? 0));
    const forecastReads = Math.max(0, Math.trunc(structure.state?.forecastReads ?? 0));
    const forecastKind = structure.state?.forecastKind;
    const trapSet = structure.state?.trapSetDay !== undefined;
    const trapBaited = structure.state?.trapBaited === true;
    const trapChecks = Math.max(0, Math.trunc(structure.state?.trapChecks ?? 0));
    const netSet = structure.state?.netSetDay !== undefined;
    const netChecks = Math.max(0, Math.trunc(structure.state?.netChecks ?? 0));
    obj.traverse((child) => {
      if (child.name === 'flameCore' || child.name === 'lanternGlow') child.visible = lit;
      if (child.name === 'hearthWarmthHalo') {
        child.visible = lit;
        const protectedScale = shelterProtected ? 1.32 : 1.05;
        const breathe = 1 + Math.sin(timeSec * 1.6 + structure.id) * 0.045;
        child.scale.set(protectedScale * breathe, protectedScale * breathe, protectedScale * breathe);
      }
      if (child.name.startsWith('smokePuff')) {
        const i = Number(child.name.replace('smokePuff', '')) || 0;
        child.visible = lit;
        child.position.y = 1.1 + i * 1.45;
        child.position.x = Math.sin(timeSec * 0.7 + structure.id * 1.9 + i * 1.4) * (0.1 + i * 0.09);
        child.position.z = Math.cos(timeSec * 0.53 + structure.id * 1.3 + i * 1.1) * (0.1 + i * 0.07);
        const breathe = 1 + Math.sin(timeSec * 0.9 + i) * 0.06;
        child.scale.set((0.55 + i * 0.34) * breathe, (0.34 + i * 0.18) * breathe, (0.55 + i * 0.34) * breathe);
      }
      if (child.name === 'homeMarker') child.visible = home;
      if (child.name === 'homeComfortRing') {
        child.visible = home && shelter.functional;
        const base = shelter.comfortTier === 'ready' ? 1.52 : 1.34;
        const pulse = 1 + Math.sin(timeSec * 1.15 + structure.id) * 0.035;
        child.scale.set(base * pulse, base * pulse, base * pulse);
      }
      if (child.name.startsWith('waystoneGlyph-')) {
        const mark = structure.state?.waystone ?? 'survey';
        child.visible = child.name === `waystoneGlyph-${mark}`;
      }
      if (child.name === 'frontLatch') child.scale.set(stored ? 1.25 : 1, stored ? 1.25 : 1, 1);
      if (child.name === 'rainCisternWater') {
        child.visible = water > 0;
        const fill = water / 4;
        child.position.y = 0.62 + fill * 0.18;
        child.scale.set(0.34 + fill * 0.1, 0.025, 0.34 + fill * 0.1);
      }
      if (child.name.startsWith('rainCisternRing')) {
        const i = Number(child.name.replace('rainCisternRing', '')) || 0;
        child.visible = water > 0;
        const pulse = (Math.sin(timeSec * 1.6 + structure.id + i * 1.9) + 1) * 0.5;
        const base = 0.18 + i * 0.09 + pulse * 0.05;
        child.scale.set(base, 0.01, base);
      }
      if (child.name === 'rootCellarHatch') {
        child.rotation.z = provisions > 0 ? -0.34 : -0.18;
      }
      if (child.name === 'rootCellarCoolGlow') {
        child.visible = provisions > 0;
        const pulse = 1 + Math.sin(timeSec * 1.4 + structure.id) * 0.08;
        child.scale.set(0.16 * pulse, 0.07 * pulse, 0.16 * pulse);
      }
      if (child.name === 'rootCellarProvisionBundle') {
        const index = child.parent ? child.parent.children.filter((c) => c.name === 'rootCellarProvisionBundle').indexOf(child) : 0;
        child.visible = provisions > index;
      }
      if (child.name === 'fishTrapBait') child.visible = trapSet && trapBaited;
      if (child.name === 'fishTrapFish') child.visible = trapChecks > 0 && !trapSet;
      if (child.name === 'fishTrapFloat' || child.name === 'fishTrapTether') child.visible = trapSet;
      if (child.name.startsWith('fishTrapSoakRing')) {
        const i = Number(child.name.replace('fishTrapSoakRing', '')) || 0;
        child.visible = trapSet;
        const pulse = (Math.sin(timeSec * 1.3 + structure.id + i * 1.7) + 1) * 0.5;
        const base = 0.26 + i * 0.12 + pulse * 0.06;
        child.scale.set(base, 0.01, base);
      }
      if (child.name === 'shoreNetFish' || child.name === 'shoreNetScrap') child.visible = netChecks > 0 && !netSet;
      if (child.name === 'shoreNetStrand') {
        child.rotation.z = child.position.x * 0.24 + Math.sin(timeSec * 1.1 + structure.id + child.position.x * 8) * (netSet ? 0.08 : 0.025);
      }
      if (child.name === 'shoreNetFloat') {
        child.position.y = 0.92 + (netSet ? Math.sin(timeSec * 1.4 + structure.id + child.position.x * 3) * 0.035 : 0);
      }
      if (child.name.startsWith('shoreNetSoakRing')) {
        const i = Number(child.name.replace('shoreNetSoakRing', '')) || 0;
        child.visible = netSet;
        const pulse = (Math.sin(timeSec * 1.45 + structure.id + i * 1.6) + 1) * 0.5;
        child.scale.set(0.3 + i * 0.13 + pulse * 0.07, 0.01, 0.2 + i * 0.09 + pulse * 0.04);
      }
      if (child.name.startsWith('dryingFood')) child.visible = preserves > 0;
      if (child.name === 'weatherVaneNeedle') {
        child.rotation.y = timeSec * (forecastKind === 'storm' ? 2.4 : 0.75) + structure.id * 0.61;
      }
      if (child.name.startsWith('weatherVaneRibbon')) {
        const i = Number(child.name.replace('weatherVaneRibbon', '')) || 0;
        child.visible = forecastReads > 0;
        child.rotation.z = -0.35 + i * 0.16 + Math.sin(timeSec * 2.3 + structure.id + i) * 0.16;
        const flutter = 1 + Math.sin(timeSec * 3.2 + i * 1.7) * 0.08;
        child.scale.y = (0.34 - i * 0.05) * flutter;
      }
      if (child.name === 'weatherVaneStormGlow') {
        const stormy = forecastReads > 0 && (forecastKind === 'storm' || forecastKind === 'cold' || forecastKind === 'soaked');
        child.visible = stormy;
        const pulse = 1 + Math.sin(timeSec * 4 + structure.id) * 0.14;
        child.scale.set(0.22 * pulse, 0.08 * pulse, 0.22 * pulse);
      }
    });
  }

  stats(): {
    groups: number;
    meshes: number;
    homeComfortSignals: number;
    homeComfort: {
      visibleWarmthMeshes: number;
      visibleLightMeshes: number;
      visibleHomeMarkers: number;
      visibleSmokePuffs: number;
      litCampfires: number;
    };
    snapPreview: {
      active: boolean;
      ok: boolean;
      mode: StructureSnapPreview['mode'] | null;
      item: StructureSave['item'] | null;
      tile: number | null;
      layer: number | null;
      blocker: string | null;
      socketRole: StructureSocketSpec['role'] | string | null;
      socketCollider: StructureSocketSpec['collider'] | null;
      meshes: number;
      readabilityRoles: number;
      meshNames: string[];
      visibleReadabilityRoles: string[];
    };
  } {
    let meshes = 0;
    let homeComfortSignals = 0;
    const homeComfort = {
      visibleWarmthMeshes: 0,
      visibleLightMeshes: 0,
      visibleHomeMarkers: 0,
      visibleSmokePuffs: 0,
      litCampfires: 0,
    };
    let snapPreviewMeshes = 0;
    const snapPreviewRoles = new Set<string>();
    const snapPreviewVisibleRoles = new Set<string>();
    const snapPreviewMeshNames = new Set<string>();
    for (const obj of this.objects.values()) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshes++;
        if (child.visible && (child.name === 'homeComfortRing' || child.name === 'hearthWarmthHalo')) {
          homeComfortSignals++;
        }
        if (child.visible && (child.name === 'flameCore' || child.name === 'hearthWarmthHalo')) homeComfort.visibleWarmthMeshes++;
        if (child.visible && child.name === 'homeComfortRing') homeComfort.visibleLightMeshes++;
        if (child.visible && child.name === 'homeMarker') homeComfort.visibleHomeMarkers++;
        if (child.visible && child.name.startsWith('smokePuff')) homeComfort.visibleSmokePuffs++;
        if (child.visible && child.name === 'flameCore') homeComfort.litCampfires++;
      });
    }
    if (this.snapPreviewGroup.visible) {
      this.snapPreviewGroup.traverse((child) => {
        const visible = child.visible;
        if ((child as THREE.Mesh).isMesh && visible) {
          snapPreviewMeshes++;
          if (child.name) snapPreviewMeshNames.add(child.name);
        }
        if (typeof child.userData.structureReadabilityRole === 'string') {
          snapPreviewRoles.add(child.userData.structureReadabilityRole);
          if (visible) snapPreviewVisibleRoles.add(child.userData.structureReadabilityRole);
        }
      });
    }
    const snapPreviewSocket = this.lastSnapPreview?.socket;
    const snapPreviewItem = this.lastSnapPreview?.item ?? null;
    return {
      groups: this.objects.size,
      meshes,
      homeComfortSignals,
      homeComfort,
      snapPreview: {
        active: this.snapPreviewGroup.visible,
        ok: this.lastSnapPreview?.ok ?? false,
        mode: this.lastSnapPreview?.mode ?? null,
        item: snapPreviewItem,
        tile: this.lastSnapPreview?.tile ?? null,
        layer: this.lastSnapPreview?.layer ?? null,
        blocker: this.lastSnapPreview?.blocker ?? null,
        socketRole: snapPreviewSocket?.role ?? this.lastSnapPreview?.socketRole ?? null,
        socketCollider: snapPreviewSocket?.collider ?? null,
        meshes: snapPreviewMeshes,
        readabilityRoles: snapPreviewRoles.size,
        meshNames: [...snapPreviewMeshNames].sort(),
        visibleReadabilityRoles: [...snapPreviewVisibleRoles].sort(),
      },
    };
  }
}
