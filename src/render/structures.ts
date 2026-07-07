import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { StructureSave } from '../sim/structures';

type PropFactory = () => THREE.Group;

function mat(color: number, roughness = 0.85, metalness = 0.02, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive === 0 ? 0 : 0.7 });
}

const materials = {
  wood: mat(0x9a6434),
  darkWood: mat(0x5b3a22),
  stone: mat(0x7b7f84),
  soil: mat(0x5a3824),
  compost: mat(0x4b3a20, 0.95, 0.01),
  compostGreen: mat(0x76a45e, 0.72, 0.02),
  water: mat(0x5faed2, 0.26, 0.04, 0x287aa6),
  leaf: mat(0x4f8d45),
  berry: mat(0xb64263),
  reed: mat(0x7da65f),
  reedTip: mat(0xb7c66e),
  cloth: mat(0x7199bd),
  warm: mat(0xff8a3d, 0.6, 0, 0xff5b18),
  metal: mat(0xa4a9ad, 0.55, 0.2),
  glass: mat(0x9fd3df, 0.18, 0.02),
  rope: mat(0xc9a56d),
  gold: mat(0xf0be5a, 0.48, 0.15, 0xf0a020),
  route: mat(0x87a9d6, 0.42, 0.08, 0x4b83d1),
  cave: mat(0x70d6d1, 0.36, 0.08, 0x2bcac3),
  shore: mat(0x5faed2, 0.4, 0.05, 0x287aa6),
  fish: mat(0x8bb7c8, 0.72, 0.02),
  ration: mat(0xb89458, 0.78, 0.02),
  weather: mat(0x9fb8c2, 0.5, 0.16),
  weatherRibbon: mat(0x87a9d6, 0.62, 0.03, 0x3f6fa5),
  storm: mat(0x82c7ff, 0.28, 0.04, 0x4aa8ff),
  cellar: mat(0x7b6a8f, 0.5, 0.08, 0x3a3354),
  cellarGlow: mat(0x8bd0b0, 0.32, 0.03, 0x48cfa2),
  anchorGlow: mat(0x70d6d1, 0.28, 0.04, 0x2bcac3),
  anchorArch: mat(0xd6c08a, 0.62, 0.04),
  anchorFlood: mat(0x5faed2, 0.34, 0.04, 0x287aa6),
  forage: mat(0x7db35f, 0.58, 0.03, 0x4f8d45),
  home: mat(0xf0be5a, 0.45, 0.12, 0xf0a020),
  smoke: new THREE.MeshStandardMaterial({ color: 0x9aa3a7, roughness: 1, metalness: 0, transparent: true, opacity: 0.46, depthWrite: false }),
};

const box = new THREE.BoxGeometry(1, 1, 1);
const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const cyl12 = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
const sphere8 = new THREE.SphereGeometry(0.5, 8, 6);

function mesh(geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh {
  const m = new THREE.Mesh(geom, material);
  m.name = name;
  m.position.set(...pos);
  m.scale.set(...scale);
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
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
  g.add(mesh(box, materials.cloth, [0, 0.12, 0], [1.25, 0.12, 0.62], 'sleepMat'));
  const roll = mesh(cyl12, materials.cloth, [-0.48, 0.24, 0], [0.18, 0.62, 0.18], 'rolledBlanket');
  roll.rotation.x = Math.PI / 2;
  g.add(roll);
  g.add(mesh(box, materials.darkWood, [0.38, 0.17, 0], [0.18, 0.08, 0.58], 'strap'));
  g.add(mesh(cone8, materials.gold, [0.5, 0.34, 0], [0.08, 0.2, 0.08], 'homeMarker'));
  return g;
}

function makeCropPlot(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-crop-plot';
  g.add(mesh(box, materials.darkWood, [0, 0.08, 0], [1.35, 0.14, 0.9], 'woodFrame'));
  g.add(mesh(box, materials.soil, [0, 0.18, 0], [1.1, 0.08, 0.66], 'tilledSoil'));
  for (const x of [-0.35, 0, 0.35]) {
    for (const z of [-0.18, 0.18]) {
      const sprout = mesh(cone8, materials.leaf, [x, 0.36, z], [0.06, 0.22, 0.06], 'sprout');
      sprout.rotation.z = 0.35;
      g.add(sprout);
      g.add(mesh(sphere8, materials.berry, [x + 0.04, 0.47, z + 0.02], [0.055, 0.055, 0.055], 'berryCluster'));
    }
  }
  for (const x of [-0.42, -0.18, 0.08, 0.32]) {
    const stalk = mesh(cyl8, materials.reed, [x, 0.46, 0.02], [0.025, 0.72, 0.025], 'reedStalk');
    stalk.rotation.z = x * 0.4;
    g.add(stalk);
    const tip = mesh(cone8, materials.reedTip, [x + 0.03, 0.88, 0.02], [0.055, 0.18, 0.055], 'reedTip');
    tip.rotation.z = x * 0.25;
    g.add(tip);
  }
  return g;
}

function makeCompostBin(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-compost-bin';
  g.add(mesh(box, materials.soil, [0, 0.08, 0], [0.88, 0.12, 0.7], 'compostBinBase'));
  for (const x of [-0.45, 0.45]) {
    for (const z of [-0.35, 0.35]) g.add(post('compostBinPost', x, z, 0.65));
  }
  for (let i = 0; i < 3; i++) {
    const y = 0.22 + i * 0.16;
    g.add(mesh(box, materials.wood, [0, y, -0.38], [1.02, 0.08, 0.06], 'compostBinSlat'));
    g.add(mesh(box, materials.wood, [0, y, 0.38], [1.02, 0.08, 0.06], 'compostBinSlat'));
    g.add(mesh(box, materials.wood, [-0.51, y, 0], [0.06, 0.08, 0.72], 'compostBinSideSlat'));
    g.add(mesh(box, materials.wood, [0.51, y, 0], [0.06, 0.08, 0.72], 'compostBinSideSlat'));
  }
  g.add(mesh(box, materials.compost, [0, 0.34, 0], [0.72, 0.22, 0.52], 'compostBinHeap'));
  for (let i = 0; i < 5; i++) {
    const scrap = mesh(box, i % 2 === 0 ? materials.compostGreen : materials.berry, [-0.24 + i * 0.12, 0.5 + (i % 2) * 0.035, -0.08 + (i % 3) * 0.08], [0.12, 0.035, 0.08], 'compostBinScrap');
    scrap.rotation.y = i * 0.7;
    scrap.rotation.z = (i - 2) * 0.12;
    g.add(scrap);
  }
  for (let i = 0; i < 3; i++) {
    const steam = mesh(sphere8, materials.smoke, [-0.16 + i * 0.16, 0.82 + i * 0.18, 0.02], [0.12, 0.08, 0.12], `compostBinSteam${i}`);
    steam.visible = false;
    g.add(steam);
  }
  g.add(mesh(box, materials.darkWood, [0, 0.64, -0.42], [0.8, 0.08, 0.08], 'compostBinFrontLip'));
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

function makeCaveAnchor(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-cave-anchor';
  g.add(mesh(cyl8, materials.stone, [0, 0.1, 0], [0.42, 0.18, 0.42], 'caveAnchorStoneBase'));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const stone = mesh(cyl8, materials.stone, [Math.cos(a) * 0.28, 0.22, Math.sin(a) * 0.22], [0.12, 0.18 + (i % 2) * 0.05, 0.1], 'caveAnchorCairnStone');
    stone.rotation.y = a;
    g.add(stone);
  }
  const postA = mesh(box, materials.darkWood, [-0.18, 0.52, 0], [0.08, 0.8, 0.08], 'caveAnchorPost');
  postA.rotation.z = -0.18;
  const postB = mesh(box, materials.darkWood, [0.2, 0.5, 0], [0.08, 0.72, 0.08], 'caveAnchorPost');
  postB.rotation.z = 0.24;
  g.add(postA, postB);
  const ropeRail = mesh(cyl8, materials.rope, [0, 0.78, 0], [0.035, 0.62, 0.035], 'caveAnchorRopeRail');
  ropeRail.rotation.z = Math.PI / 2;
  g.add(ropeRail);
  for (let i = 0; i < 3; i++) {
    const coil = mesh(cyl12, materials.rope, [0, 0.26 + i * 0.018, -0.3], [0.3 - i * 0.055, 0.018, 0.3 - i * 0.055], `caveAnchorRopePulse${i}`);
    g.add(coil);
  }
  const crystal = mesh(cone8, materials.anchorGlow, [0, 0.98, 0], [0.14, 0.36, 0.14], 'caveAnchorGlow');
  crystal.rotation.z = 0.18;
  g.add(crystal);
  const archA = mesh(box, materials.anchorArch, [-0.13, 1.04, 0.11], [0.07, 0.34, 0.06], 'caveAnchorGlyph-arch');
  const archB = mesh(box, materials.anchorArch, [0.13, 1.04, 0.11], [0.07, 0.34, 0.06], 'caveAnchorGlyph-arch');
  const archTop = mesh(box, materials.anchorArch, [0, 1.21, 0.11], [0.33, 0.06, 0.06], 'caveAnchorGlyph-arch');
  g.add(archA, archB, archTop);
  g.add(mesh(cone8, materials.cave, [0, 1.12, 0.1], [0.1, 0.22, 0.1], 'caveAnchorGlyph-dryCave'));
  g.add(mesh(box, materials.anchorFlood, [0, 1.08, 0.11], [0.34, 0.055, 0.09], 'caveAnchorGlyph-seaCave'));
  g.add(mesh(box, materials.anchorFlood, [0, 0.44, -0.36], [0.54, 0.04, 0.1], 'caveAnchorFloodMark'));
  return g;
}

function makeDoorKit(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-door-kit';
  g.add(post('leftJamb', -0.36, 0, 1.55));
  g.add(post('rightJamb', 0.36, 0, 1.55));
  g.add(mesh(box, materials.darkWood, [0, 1.42, 0], [0.9, 0.12, 0.12], 'lintel'));
  g.add(mesh(box, materials.wood, [0, 0.72, 0.035], [0.58, 1.16, 0.08], 'doorSlab'));
  g.add(mesh(cyl8, materials.metal, [0.2, 0.74, 0.1], [0.04, 0.06, 0.04], 'knob'));
  return g;
}

function makeWindowFrame(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-window-frame';
  g.add(mesh(box, materials.darkWood, [0, 0.92, 0], [0.9, 0.08, 0.08], 'topRail'));
  g.add(mesh(box, materials.darkWood, [0, 0.34, 0], [0.9, 0.08, 0.08], 'bottomRail'));
  g.add(post('leftRail', -0.42, 0, 0.7));
  g.add(post('rightRail', 0.42, 0, 0.7));
  g.add(mesh(box, materials.glass, [0, 0.62, 0.02], [0.62, 0.4, 0.03], 'glassPane'));
  return g;
}

function makeRoofBundle(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'structure-roof-bundle';
  const left = mesh(box, materials.darkWood, [-0.32, 0.5, 0], [0.82, 0.1, 1.0], 'leftRoofPlane');
  left.rotation.z = -0.45;
  const right = mesh(box, materials.darkWood, [0.32, 0.5, 0], [0.82, 0.1, 1.0], 'rightRoofPlane');
  right.rotation.z = 0.45;
  g.add(left, right);
  g.add(mesh(box, materials.wood, [0, 0.82, 0], [1.0, 0.09, 0.12], 'ridgeBeam'));
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
  g.add(mesh(cyl8, materials.stone, [0, 0.18, 0], [0.34, 0.34, 0.34], 'waystoneBase'));
  g.add(mesh(box, materials.stone, [0, 0.52, 0], [0.34, 0.58, 0.22], 'waystoneCore'));
  g.add(mesh(cone8, materials.route, [0, 0.96, 0], [0.18, 0.34, 0.18], 'waystoneGlyph-survey'));
  g.add(mesh(sphere8, materials.home, [0, 0.97, 0], [0.17, 0.17, 0.17], 'waystoneGlyph-home'));
  g.add(mesh(cone8, materials.cave, [0, 0.97, 0], [0.15, 0.28, 0.15], 'waystoneGlyph-cave'));
  g.add(mesh(box, materials.shore, [0, 0.95, 0], [0.3, 0.08, 0.18], 'waystoneGlyph-shore'));
  const leaf = mesh(cone8, materials.forage, [0, 0.98, 0], [0.12, 0.24, 0.12], 'waystoneGlyph-forage');
  leaf.rotation.z = 0.55;
  g.add(leaf);
  g.add(mesh(box, materials.darkWood, [0, 0.58, -0.13], [0.42, 0.06, 0.04], 'waystoneBand'));
  return g;
}

const FACTORIES: Record<StructureSave['item'], PropFactory> = {
  workbench: makeWorkbench,
  campfire: makeCampfire,
  chest: makeChest,
  bedroll: makeBedroll,
  cropPlot: makeCropPlot,
  compostBin: makeCompostBin,
  rainCistern: makeRainCistern,
  rootCellar: makeRootCellar,
  caveAnchor: makeCaveAnchor,
  doorKit: makeDoorKit,
  windowFrame: makeWindowFrame,
  roofBundle: makeRoofBundle,
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
  private readonly objects = new Map<number, THREE.Group>();

  constructor(scene: THREE.Scene) {
    this.group.name = 'placed-structures';
    scene.add(this.group);
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
    for (const s of structures) {
      const obj = this.objects.get(s.id);
      if (!obj) continue;
      const frame = geo.frameOf(s.tile);
      const ca = Math.cos(s.yaw), sa = Math.sin(s.yaw);
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
      const r = layers.topRadius(s.layer) + 0.04;
      obj.position.set(
        c[s.tile * 3] * r - camWorld.x,
        c[s.tile * 3 + 1] * r - camWorld.y,
        c[s.tile * 3 + 2] * r - camWorld.z,
      );
      obj.visible = true;
      this.applyState(obj, s, timeSec);
    }
  }

  private applyState(obj: THREE.Group, structure: StructureSave, timeSec: number): void {
    const lit = structure.state?.lit === true;
    const home = structure.state?.home === true;
    const stored = Object.values(structure.state?.storage ?? {}).some((count) => (count ?? 0) > 0);
    const growth = Math.max(0, Math.min(3, Math.trunc(structure.state?.growth ?? 0)));
    const crop = structure.state?.crop ?? 'berries';
    const fertility = Math.max(0, Math.min(3, Math.trunc(structure.state?.fertility ?? 0)));
    const composts = Math.max(0, Math.trunc(structure.state?.composts ?? 0));
    const water = Math.max(0, Math.min(4, Math.trunc(structure.state?.water ?? 0)));
    const provisions = Math.max(0, Math.min(6, Math.trunc(structure.state?.provisions ?? 0)));
    const preserves = Math.max(0, Math.trunc(structure.state?.preserves ?? 0));
    const forecastReads = Math.max(0, Math.trunc(structure.state?.forecastReads ?? 0));
    const forecastKind = structure.state?.forecastKind;
    const anchorUses = Math.max(0, Math.trunc(structure.state?.anchorUses ?? 0));
    const anchorKind = structure.state?.anchorKind;
    const trapSet = structure.state?.trapSetDay !== undefined;
    const trapBaited = structure.state?.trapBaited === true;
    const trapChecks = Math.max(0, Math.trunc(structure.state?.trapChecks ?? 0));
    const netSet = structure.state?.netSetDay !== undefined;
    const netChecks = Math.max(0, Math.trunc(structure.state?.netChecks ?? 0));
    obj.traverse((child) => {
      if (child.name === 'flameCore' || child.name === 'lanternGlow') child.visible = lit;
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
      if (child.name.startsWith('waystoneGlyph-')) {
        const mark = structure.state?.waystone ?? 'survey';
        child.visible = child.name === `waystoneGlyph-${mark}`;
      }
      if (child.name === 'frontLatch') child.scale.set(stored ? 1.25 : 1, stored ? 1.25 : 1, 1);
      if (child.name === 'sprout') {
        child.visible = crop === 'berries' && growth > 0;
        child.scale.y = 0.08 + growth * 0.08 + fertility * 0.025;
      }
      if (child.name === 'berryCluster') {
        child.visible = crop === 'berries' && growth >= 3;
        const fertileScale = 1 + fertility * 0.12;
        child.scale.set(0.055 * fertileScale, 0.055 * fertileScale, 0.055 * fertileScale);
      }
      if (child.name === 'reedStalk') {
        child.visible = crop === 'reeds' && growth > 0;
        const sway = Math.sin(timeSec * 1.2 + structure.id + child.position.x * 7) * 0.08;
        child.rotation.z = child.position.x * 0.4 + sway;
        child.scale.y = 0.28 + growth * 0.16 + fertility * 0.04;
      }
      if (child.name === 'reedTip') {
        child.visible = crop === 'reeds' && growth >= 2;
        child.position.y = 0.58 + growth * 0.1 + fertility * 0.035;
      }
      if (child.name === 'compostBinHeap' || child.name === 'compostBinScrap') child.visible = composts > 0;
      if (child.name.startsWith('compostBinSteam')) {
        const i = Number(child.name.replace('compostBinSteam', '')) || 0;
        child.visible = composts > 0;
        child.position.y = 0.82 + i * 0.18 + Math.sin(timeSec * 0.8 + structure.id + i) * 0.035;
        child.position.x = -0.16 + i * 0.16 + Math.sin(timeSec * 1.1 + i) * 0.035;
      }
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
      if (child.name.startsWith('caveAnchorGlyph-')) {
        child.visible = anchorUses > 0 && child.name === `caveAnchorGlyph-${anchorKind ?? 'arch'}`;
      }
      if (child.name === 'caveAnchorGlow') {
        child.visible = anchorUses > 0;
        const pulse = 1 + Math.sin(timeSec * 1.7 + structure.id) * 0.12;
        child.scale.set(0.14 * pulse, 0.36 * pulse, 0.14 * pulse);
      }
      if (child.name.startsWith('caveAnchorRopePulse')) {
        const i = Number(child.name.replace('caveAnchorRopePulse', '')) || 0;
        child.visible = anchorUses > 0;
        const pulse = 1 + Math.sin(timeSec * 1.2 + structure.id + i) * 0.05;
        const base = 0.3 - i * 0.055;
        child.scale.set(base * pulse, 0.018, base * pulse);
      }
      if (child.name === 'caveAnchorFloodMark') child.visible = anchorUses > 0 && structure.state?.anchorFlooded === true;
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

  stats(): { groups: number; meshes: number } {
    let meshes = 0;
    for (const obj of this.objects.values()) obj.traverse((child) => { if ((child as THREE.Mesh).isMesh) meshes++; });
    return { groups: this.objects.size, meshes };
  }
}
