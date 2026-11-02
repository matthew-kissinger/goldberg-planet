/** Shared, editable plant modules. The same tree parts drive live instances,
 * felling and picking; no alternate export silhouette or per-tree GLB is involved. */
import * as THREE from 'three/webgpu';
import type { TreeParams } from '../world/trees';
import { treeTangentFrame } from '../world/trees';
import type { AureliaTreeSpecies } from '../world/aurelia';
import { GROWTH_SPECIES, type WorldGrowthSpecies } from '../world/growthSpecies';
import { HABITAT_FORWARD, habitatDirection } from '../world/expeditionHabitat';
import { GeometryKit } from './campKit';

export type TreePartShape = 'stem' | 'crown' | 'spire' | 'crystal' | 'succulent' | 'frond' | 'parasol' | 'fan' | 'gill';
export type PlantModule = 'fern' | 'reed' | 'grass' | 'drygrass' | 'rosette' | 'bell' | 'spike' | 'shrub'
  | 'mineralChips' | 'crystalSpray' | 'riftGlass' | 'thornTuft' | 'desertRosette' | 'seedPods'
  | 'frostLichen' | 'iceNeedles' | 'snowBell' | 'sulfurRosette' | 'ashReed' | 'emberPolyps'
  | 'glowMoss' | 'sporeCups' | 'fanMold';
export type EmitTreePart = (
  shape: TreePartShape, paint: number, x: number, y: number, z: number,
  sx: number, sy: number, sz: number, qx: number, qy: number, qz: number, qw: number,
) => void;

export interface TreeFamily {
  bark: number;
  leaves: readonly [number, number, number];
  branches: number;
  crown: 'umbrella' | 'column' | 'clusters' | 'tiers' | 'scrub';
}
/** Palette, branch count and crown assembly are independently editable modules. */
export const AURELIA_TREE_KIT: Readonly<Record<AureliaTreeSpecies, TreeFamily>> = {
  umbrella: { bark: 0x77624d, leaves: [0x648650, 0x829b5b, 0x9baa68], branches: 5, crown: 'umbrella' },
  cypress: { bark: 0x776d55, leaves: [0x447a6c, 0x5b9180, 0x7caa8d], branches: 4, crown: 'column' },
  birch: { bark: 0xd5d0b4, leaves: [0x8b9f51, 0xaab86e, 0xc5c780], branches: 4, crown: 'clusters' },
  pine: { bark: 0x786154, leaves: [0x486e60, 0x5d8370, 0x79947b], branches: 5, crown: 'tiers' },
  scrub: { bark: 0x8b7254, leaves: [0x8f9764, 0xa3a470, 0xb8ae78], branches: 3, crown: 'scrub' },
};
export const PLANT_COLORS: Readonly<Record<PlantModule, number>> = {
  fern: 0x789e61, reed: 0x8b9b63, grass: 0xa3b574, drygrass: 0xc3aa73,
  rosette: 0xe4c678, bell: 0xb1a7cb, spike: 0xddd6ab, shrub: 0x829774,
  mineralChips: 0x7d8495, crystalSpray: 0x9d9abe, riftGlass: 0x7e94a3,
  thornTuft: 0x85915b, desertRosette: 0x8f9d68, seedPods: 0xb69058,
  frostLichen: 0x9bc4bb, iceNeedles: 0xb3dce3, snowBell: 0xc6d9df,
  sulfurRosette: 0xd1b766, ashReed: 0x87736b, emberPolyps: 0xc18c63,
  glowMoss: 0x80c3ad, sporeCups: 0xa7c4b5, fanMold: 0x8cbdc0,
};
export const WORLD_GROWTH_COLORS: Readonly<Record<WorldGrowthSpecies, readonly [number, number, number]>> = {
  crystalFan: [0x777b91, 0xa3a7c2, 0xc2bfda], mineralSpire: [0x657485, 0x8b9dad, 0xbcc9d4],
  cactus: [0x758553, 0x8fa46a, 0xd2a975], yucca: [0x887257, 0x85975b, 0xb4b67d], desertPalm: [0x98785a, 0x879c5c, 0xb3bb75],
  frostwillow: [0x879fa4, 0xb0d0d1, 0xd5e5e2], iceFan: [0x9ab8c4, 0xbad9e0, 0xdce9e9],
  charCoral: [0x4e4746, 0x74635a, 0xd2a367], heatStalk: [0x746557, 0xa58b62, 0xd5b46c],
  fungalParasol: [0x9da594, 0x718fb0, 0xb1d2c3], sporeFan: [0x7e9694, 0x83b8aa, 0xc0ddc0],
};
/** Export adapters can expose these attachment points and parameter ranges in a
 * visual authoring tool without changing the runtime's geometry contract. */
export const VEGETATION_MODULES = Object.freeze({
  stem: { label: 'Tapered branch', ports: { root: [0, -0.5, 0], tip: [0, 0.5, 0] }, parameters: ['length', 'radius', 'barkColor'] },
  crown: { label: 'Leaf lobe', ports: { branch: [0, -1, 0] }, parameters: ['width', 'height', 'depth', 'leafColor', 'windPhase'] },
  spire: { label: 'Needle tier', ports: { branch: [0, -0.5, 0] }, parameters: ['width', 'height', 'leafColor', 'windPhase'] },
  crystal: { label: 'Faceted mineral', ports: { root: [0, -0.5, 0], tip: [0, 0.5, 0] }, parameters: ['width', 'height', 'depth', 'mineralColor'] },
  succulent: { label: 'Ribbed water stem', ports: { root: [0, -0.5, 0], tip: [0, 0.5, 0] }, parameters: ['radius', 'height', 'stemColor'] },
  frond: { label: 'Arched solid frond', ports: { root: [0, 0, 0], tip: [0, 1, -0.35] }, parameters: ['length', 'width', 'leafColor', 'windPhase'] },
  parasol: { label: 'Fungal umbrella', ports: { stem: [0, 0, 0] }, parameters: ['spread', 'height', 'capColor'] },
  fan: { label: 'Radial fan', ports: { root: [0, 0, 0] }, parameters: ['width', 'height', 'depth', 'fanColor'] },
  gill: { label: 'Parasol gills', ports: { stem: [0, 0, 0] }, parameters: ['spread', 'depth', 'gillColor'] },
  understory: { label: 'Rooted plant', ports: { root: [0, 0, 0] }, parameters: ['module', 'height', 'spread', 'leafColor', 'flowerColor', 'windPhase'] },
});

function stem(emit: EmitTreePart, paint: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): void {
  growthBeam(emit, 'stem', paint, ax, ay, az, bx, by, bz, radius, radius);
}
const growthBasis = new THREE.Matrix4(), growthX = new THREE.Vector3(), growthY = new THREE.Vector3(), growthZ = new THREE.Vector3(), growthQuat = new THREE.Quaternion();
function growthBeam(emit: EmitTreePart, shape: TreePartShape, paint: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, width: number, depth: number, rooted = false, roll = 0): void {
  const dx = bx - ax, dy = by - ay, dz = bz - az, length = Math.hypot(dx, dy, dz);
  if (length < 0.00001) return;
  const inv = 1 / length, qx = dz * inv, qz = -dx * inv, qw = 1 + dy * inv, ql = Math.hypot(qx, qz, qw);
  growthQuat.set(ql > 0.00001 ? qx / ql : 1, 0, ql > 0.00001 ? qz / ql : 0, ql > 0.00001 ? qw / ql : 0);
  if (shape === 'frond') {
    growthY.set(dx * inv, dy * inv, dz * inv);
    growthZ.set(0, 1, 0).addScaledVector(growthY, -growthY.y);
    if (growthZ.lengthSq() < 0.00001) growthZ.set(0, 0, 1);
    growthZ.normalize(); growthX.crossVectors(growthY, growthZ).normalize();
    growthQuat.setFromRotationMatrix(growthBasis.makeBasis(growthX, growthY, growthZ));
  } else if (roll) {
    const sn = Math.sin(roll / 2), cs = Math.cos(roll / 2), x = growthQuat.x, z = growthQuat.z, w = growthQuat.w;
    growthQuat.set(x * cs - z * sn, w * sn, x * sn + z * cs, w * cs);
  }
  emit(shape, paint, rooted ? ax : (ax + bx) * 0.5, rooted ? ay : (ay + by) * 0.5, rooted ? az : (az + bz) * 0.5, width, length, depth,
    growthQuat.x, growthQuat.y, growthQuat.z, growthQuat.w);
}

export function treeWindWeight(params: TreeParams): number { return params.growth ? GROWTH_SPECIES[params.growth.species].wind : 1; }
export function treeCutColor(params: TreeParams): number {
  if (params.growth) return WORLD_GROWTH_COLORS[params.growth.species][0];
  return params.aurelia?.age && params.aurelia.age > 0.9 ? 0x9b9077 : AURELIA_TREE_KIT[params.aurelia?.species ?? 'umbrella'].bark;
}

/** Distinct assemblies share elementary modules, not one recolored canopy. */
export function visitWorldGrowthParts(params: TreeParams, simple: boolean, emit: EmitTreePart): void {
  const meta = params.growth!;
  const [base, color, tip] = WORLD_GROWTH_COLORS[meta.species], dead = meta.age > 0.9;
  const h = params.trunk, c = params.canopy, s = params.spread, g = params.girth;
  const phase = (meta.seed >>> 0) / 4294967296 * Math.PI * 2;
  const part = (shape: TreePartShape, paint: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) => emit(shape, paint, x, y, z, sx, sy, sz, 0, 0, 0, 1);
  if (meta.species === 'crystalFan' || meta.species === 'mineralSpire') {
    const tower = meta.species === 'mineralSpire';
    part('crystal', base, 0, (h + c) * 0.5, 0, tower ? g : g * 0.9, h + c, tower ? g * 0.8 : g * 0.55);
    const n = simple ? 2 : tower ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n, reach = s * (tower ? 0.6 : 0.9);
      growthBeam(emit, 'crystal', i % 2 ? color : tip, Math.cos(a) * g * 0.3, 0.05, Math.sin(a) * g * 0.3,
        Math.cos(a) * reach, h + c * (0.48 + (i % 3) * 0.12), Math.sin(a) * reach, g * (tower ? 0.55 : 0.8), g * 0.38);
    }
  } else if (meta.species === 'cactus') {
    part('succulent', dead ? 0x9c8c6b : base, 0, (h + c) * 0.5, 0, g, h + c, g);
    const n = simple ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n, x = Math.cos(a) * s * 0.7, z = Math.sin(a) * s * 0.7, y = h * (0.55 + (i % 2) * 0.15);
      growthBeam(emit, 'succulent', dead ? 0x9c8c6b : color, 0, y, 0, x, y + 0.3, z, g * 0.65, g * 0.65);
      growthBeam(emit, 'succulent', dead ? 0x9c8c6b : color, x, y, z, x, h + c * (0.3 + i * 0.16), z, g * 0.6, g * 0.6);
      if (!simple && !dead) part('parasol', tip, x, h + c * (0.3 + i * 0.16), z, g * 0.7, g * 0.5, g * 0.7);
    }
  } else if (meta.species === 'yucca' || meta.species === 'desertPalm') {
    const palm = meta.species === 'desertPalm', bx = palm ? s * 0.13 : s * 0.06;
    growthBeam(emit, 'stem', base, 0, 0, 0, bx * 0.3, h * 0.55, 0, g, g);
    growthBeam(emit, 'stem', base, bx * 0.3, h * 0.52, 0, bx, h, 0, g * 0.7, g * 0.7);
    const n = simple ? 4 : palm ? 8 : 7;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n, reach = s * (0.75 + (i % 2) * 0.2);
      growthBeam(emit, 'frond', dead ? 0xb2a06c : i % 2 ? color : tip, bx, h, 0,
        bx + Math.cos(a) * reach, h + c * (dead ? -0.35 : palm ? 0.24 : 0.45 + (i % 2) * 0.2), Math.sin(a) * reach,
        s * (palm ? 0.24 : 0.18), palm ? c * 1.6 : 0.55, true);
    }
  } else if (meta.species === 'frostwillow') {
    const bend = s * 0.38;
    growthBeam(emit, 'stem', base, 0, 0, 0, bend * 0.3, h * 0.6, 0, g, g);
    growthBeam(emit, 'stem', base, bend * 0.3, h * 0.58, 0, bend, h, 0, g * 0.6, g * 0.6);
    const n = simple ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n, x = bend + Math.cos(a) * s * 0.6, z = Math.sin(a) * s * 0.6;
      if (!simple) growthBeam(emit, 'stem', base, bend * 0.8, h * 0.85, 0, x, h + c * 0.35, z, g * 0.25, g * 0.25);
      if (!dead) growthBeam(emit, 'frond', i % 2 ? color : tip, x, h + c * 0.35, z,
        x + Math.cos(a) * s * 0.3, h - c * 0.5, z + Math.sin(a) * s * 0.3, s * 0.2, 0.5, true);
    }
  } else if (meta.species === 'iceFan') {
    part('crystal', base, 0, c * 0.32, 0, g, c * 0.64, g);
    const n = simple ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n;
      growthBeam(emit, 'fan', i % 2 ? color : tip, 0, h * 0.3, 0, Math.cos(a) * s * 0.35, h + c * (0.72 + (i % 2) * 0.25), Math.sin(a) * s * 0.35,
        s * 0.75, 0.45, true, a);
    }
  } else if (meta.species === 'charCoral') {
    growthBeam(emit, 'stem', base, 0, 0, 0, 0, h + c * 0.35, 0, g, g);
    const n = simple ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n, x = Math.cos(a) * s * 0.65, z = Math.sin(a) * s * 0.65, y = h * (0.65 + (i % 2) * 0.15);
      growthBeam(emit, 'stem', base, 0, y, 0, x, h + c * 0.32, z, g * 0.6, g * 0.6);
      growthBeam(emit, 'stem', dead ? 0x8d8176 : color, x, h + c * 0.3, z, x * 1.08, h + c * (0.7 + (i % 2) * 0.22), z * 1.08, g * 0.34, g * 0.34);
      if (!dead) part('crystal', tip, x * 1.08, h + c * (0.73 + (i % 2) * 0.22), z * 1.08, g * 0.28, g * 0.75, g * 0.28);
    }
  } else if (meta.species === 'heatStalk') {
    const n = simple ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / 3, x = Math.cos(a) * s * 0.45, z = Math.sin(a) * s * 0.45, top = h + c * (0.5 + i * 0.15);
      growthBeam(emit, 'succulent', base, x * 0.4, 0, z * 0.4, x, top, z, g * 0.6, g * 0.6);
      if (!dead) part('parasol', i % 2 ? color : tip, x, top, z, s * 0.46, c * 0.42, s * 0.46);
    }
  } else if (meta.species === 'fungalParasol') {
    growthBeam(emit, 'succulent', base, 0, 0, 0, s * 0.12, h, 0, g, g);
    const n = simple ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI, scale = i === 0 ? 1 : 0.42, x = i === 0 ? s * 0.12 : Math.cos(a) * s * 0.65, z = i === 0 ? 0 : Math.sin(a) * s * 0.65;
      const y = h * (i === 0 ? 1 : 0.55 + i * 0.12);
      if (i > 0) growthBeam(emit, 'succulent', base, 0, y * 0.6, 0, x, y, z, g * 0.45, g * 0.45);
      // The stem ends inside the cap's closed underside, including small caps.
      const capY = y - c * 0.045 * scale;
      part('parasol', dead ? 0x8e9296 : i % 2 ? tip : color, x, capY, z, s * scale, c * (dead ? 0.7 : 2.1) * scale, s * scale);
      if (!simple) part('gill', dead ? 0x9da596 : tip, x, capY, z, s * scale, c * (dead ? 0.7 : 2.1) * scale, s * scale);
    }
  } else {
    growthBeam(emit, 'succulent', base, 0, 0, 0, 0, h, 0, g, g);
    const n = simple ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n;
      growthBeam(emit, 'fan', dead ? 0x8d9a94 : i % 2 ? color : tip, 0, h * 0.65, 0,
        Math.cos(a) * s * 0.35, h + c * (0.65 + (i % 2) * 0.25), Math.sin(a) * s * 0.35, s * 0.7, 0.8, true, a);
    }
  }
}

export function visitVegetationTreeParts(params: TreeParams, simple: boolean, emit: EmitTreePart): void {
  if (params.growth) visitWorldGrowthParts(params, simple, emit);
  else visitAureliaTreeParts(params, simple, emit);
}

/** LOD removes crown lobes and branchlets, never changes the base or tree dimensions. */
export function visitAureliaTreeParts(params: TreeParams, simple: boolean, emit: EmitTreePart, familyOverride?: TreeFamily): void {
  const meta = params.aurelia;
  const species = meta?.species ?? 'umbrella', family = familyOverride ?? AURELIA_TREE_KIT[species];
  const h = params.trunk, c = params.canopy, s = params.spread, g = params.girth;
  const dead = (meta?.age ?? 0.5) > 0.9, young = (meta?.age ?? 0.5) < 0.25;
  const bark = dead ? 0x9b9077 : family.bark;
  const phase = ((meta?.seed ?? 0) >>> 0) / 4294967296 * Math.PI * 2;
  // Continuous central trunk keeps the interactive stem at its authoritative axis.
  stem(emit, bark, 0, 0, 0, 0, h + c * (dead ? 0.62 : 0.35), 0, g);
  const count = simple ? 0 : young ? Math.min(3, family.branches) : family.branches;
  for (let i = 0; i < count; i++) {
    const a = phase + i * Math.PI * 2 / count;
    const reach = s * (species === 'pine' ? 0.63 : 0.57);
    const y = h * (0.68 + (i % 3) * 0.1);
    stem(emit, bark, 0, y, 0, Math.cos(a) * reach, h + c * (0.18 + (i % 2) * 0.11), Math.sin(a) * reach, g * 0.31);
    if (dead && i % 2 === 0) stem(emit, bark, Math.cos(a) * reach, h + c * 0.18, Math.sin(a) * reach,
      Math.cos(a + 0.3) * reach * 1.16, h + c * 0.39, Math.sin(a + 0.3) * reach * 1.16, g * 0.14);
  }
  if (dead) return;
  const crown = (shape: TreePartShape, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number) =>
    emit(shape, family.leaves[i % 3], x, y, z, sx, sy, sz, 0, 0, 0, 1);
  if (family.crown === 'tiers') {
    const tiers = simple ? 2 : 4;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      crown('spire', i, 0, h + c * (0.15 + t * 0.68), 0, s * (1 - t * 0.76), c * (simple ? 0.68 : 0.43), s * (1 - t * 0.76));
    }
  } else if (family.crown === 'column') {
    crown('crown', 1, 0, h + c * 0.45, 0, s * 0.7, c * 0.55, s * 0.7);
    if (!simple) for (let i = 0; i < 4; i++) {
      const a = phase + i * Math.PI * 0.5;
      crown('crown', i, Math.cos(a) * s * 0.55, h + c * 0.12, Math.sin(a) * s * 0.55, s * 0.43, c * 0.48, s * 0.43);
    }
  } else if (family.crown === 'clusters') {
    crown('crown', 2, 0, h + c * 0.64, 0, s * 0.66, c * 0.4, s * 0.62);
    const n = simple ? 2 : 4;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n;
      crown('crown', i, Math.cos(a) * s * 0.43, h + c * (0.2 + (i % 2) * 0.17), Math.sin(a) * s * 0.43, s * 0.61, c * 0.4, s * 0.58);
    }
  } else {
    const flat = family.crown === 'umbrella';
    crown('crown', 1, 0, h + c * 0.62, 0, s * 0.61, c * 0.38, s * 0.59);
    const n = simple ? 3 : young ? 3 : flat ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const a = phase + i * Math.PI * 2 / n;
      crown('crown', i, Math.cos(a) * s * 0.53, h + c * (0.29 + (i % 3) * 0.08), Math.sin(a) * s * 0.53,
        s * 0.49, c * (flat ? 0.31 : 0.39), s * 0.48);
    }
  }
}

export function treePartGeometry(shape: TreePartShape): THREE.BufferGeometry {
  if (shape === 'stem') return new THREE.CylinderGeometry(0.72, 1, 1, 7, 1);
  if (shape === 'spire') return new THREE.ConeGeometry(1, 1, 7, 1);
  if (shape === 'crystal') {
    const indexed = new THREE.LatheGeometry([new THREE.Vector2(0, -0.5), new THREE.Vector2(0.9, -0.5), new THREE.Vector2(1, 0.2), new THREE.Vector2(0, 0.5)], 5);
    const source = indexed.toNonIndexed(), p = source.getAttribute('position'), points: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    // Lathe's axis quads contain collapsed triangles. Drop them before flat
    // normals so exported modules have no zero-length normals at either pole.
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1).sub(a); c.fromBufferAttribute(p, i + 2).sub(a);
      if (b.cross(c).lengthSq() > 1e-12) for (let j = 0; j < 3; j++) points.push(p.getX(i + j), p.getY(i + j), p.getZ(i + j));
    }
    indexed.dispose(); source.dispose();
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals(); return geometry;
  }
  if (shape === 'succulent') return new THREE.CapsuleGeometry(1, 1, 2, 7).scale(1, 1 / 3, 1);
  if (shape === 'parasol') return new THREE.LatheGeometry([[0, 0.02], [0.5, -0.06], [0.94, -0.08], [1, 0], [0.7, 0.23], [0.3, 0.42], [0, 0.38]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  if (shape === 'gill') {
    const kit = new GeometryKit();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      kit.beam(0xffffff, [Math.cos(a) * 0.13, -0.02, Math.sin(a) * 0.13], [Math.cos(a) * 0.91, -0.08, Math.sin(a) * 0.91], 0.012, 3);
    }
    const geometry = kit.finish(); geometry.deleteAttribute('color'); return geometry;
  }
  if (shape === 'fan' || shape === 'frond') {
    const points: number[] = [], tri = (a: number[], b: number[], c: number[]) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) > 0.000001) points.push(...a, ...b, ...c);
    };
    if (shape === 'frond') {
      const sections = [[0, 0, 0], [0.65, 0.3, 0.07], [1, 0.62, 0.02], [0, 1, -0.35]];
      const rings = sections.map(([width, y, z]) => [[-width, y, z], [0, y, z + (width ? 0.045 : 0)], [width, y, z], [0, y, z - (width ? 0.025 : 0)]]);
      for (let i = 1; i < rings.length; i++) for (let j = 0; j < 4; j++) {
        const a = rings[i - 1][j], b = rings[i - 1][(j + 1) % 4], c = rings[i][(j + 1) % 4], d = rings[i][j];
        tri(a, b, c); tri(a, c, d);
      }
    } else {
      const front = [0, 0, 0.035], back = [0, 0, -0.035];
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 10, b = (i + 1) * Math.PI / 10;
        const af = [Math.cos(a), Math.sin(a), i % 2 ? 0.025 : 0.07], bf = [Math.cos(b), Math.sin(b), i % 2 ? 0.07 : 0.025];
        const ab = [af[0], af[1], -0.035], bb = [bf[0], bf[1], -0.035];
        tri(front, af, bf); tri(back, bb, ab); tri(af, ab, bb); tri(af, bb, bf);
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
  }
  return new THREE.IcosahedronGeometry(1, 1);
}

const frame = new Float64Array(6), up = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3();
const rotation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), unitScale = new THREE.Vector3(1, 1, 1), basePosition = new THREE.Vector3();
const basis = new THREE.Matrix4(), localY = new THREE.Vector3(0, 1, 0);
/** Full shared placement contract, including transported authored headings. */
export function aureliaTreeMatrix(params: TreeParams, ux: number, uy: number, uz: number, ground: number, target: THREE.Matrix4): THREE.Matrix4 {
  if (params.habitat) {
    [ux, uy, uz] = habitatDirection(params.habitat.x, params.habitat.z, params.planetRadius ?? ground);
    ground += 0.025;
  }
  up.set(ux, uy, uz); treeTangentFrame(ux, uy, uz, frame);
  basePosition.set(ux * ground + frame[0] * params.offA + frame[3] * params.offB,
    uy * ground + frame[1] * params.offA + frame[4] * params.offB,
    uz * ground + frame[2] * params.offA + frame[5] * params.offB);
  if (params.habitat) forward.set(...HABITAT_FORWARD);
  else forward.set(frame[3], frame[4], frame[5]);
  forward.addScaledVector(up, -forward.dot(up)).normalize();
  right.crossVectors(up, forward).normalize(); forward.crossVectors(right, up).normalize();
  rotation.setFromRotationMatrix(basis.makeBasis(right, up, forward));
  if (params.habitat) rotation.multiply(yaw.setFromAxisAngle(localY, params.habitat.yaw));
  return target.compose(basePosition, rotation, unitScale);
}

/** Clip one convex root module at the cut and close its exposed underside. This
 * runs only when felling; living instances retain the unmodified shared module. */
function clipCutModule(source: THREE.BufferGeometry): THREE.BufferGeometry {
  source.computeBoundingBox();
  if (source.boundingBox!.min.y >= 0) return source;
  const p = source.getAttribute('position'), n = source.getAttribute('normal'), c = source.getAttribute('color');
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], boundary: number[][] = [];
  const append = (vertex: number[]) => { positions.push(...vertex.slice(0, 3)); normals.push(...vertex.slice(3, 6)); colors.push(...vertex.slice(6, 9)); };
  for (let i = 0; i < p.count; i += 3) {
    const triangle = [0, 1, 2].map(j => [p.getX(i + j), p.getY(i + j), p.getZ(i + j), n.getX(i + j), n.getY(i + j), n.getZ(i + j), c.getX(i + j), c.getY(i + j), c.getZ(i + j)]);
    const polygon: number[][] = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j], b = triangle[(j + 1) % 3], insideA = a[1] >= 0, insideB = b[1] >= 0;
      if (insideA) polygon.push(a);
      if (insideA !== insideB) {
        const t = -a[1] / (b[1] - a[1]), edge = a.map((value, k) => value + (b[k] - value) * t); edge[1] = 0;
        polygon.push(edge);
        if (!boundary.some(v => Math.abs(v[0] - edge[0]) + Math.abs(v[2] - edge[2]) < 0.00001)) boundary.push(edge);
      }
    }
    for (let j = 1; j < polygon.length - 1; j++) { append(polygon[0]); append(polygon[j]); append(polygon[j + 1]); }
  }
  if (boundary.length >= 3) {
    const center = [0, 0, 0, 0, -1, 0, boundary[0][6], boundary[0][7], boundary[0][8]];
    for (const v of boundary) { center[0] += v[0] / boundary.length; center[2] += v[2] / boundary.length; }
    boundary.sort((a, b) => Math.atan2(a[2] - center[2], a[0] - center[0]) - Math.atan2(b[2] - center[2], b[0] - center[0]));
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i].slice(), b = boundary[(i + 1) % boundary.length].slice();
      a.splice(3, 3, 0, -1, 0); b.splice(3, 3, 0, -1, 0);
      append(center); append(a); append(b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  source.dispose(); return geometry;
}

/** One-off merged version for a felled tree; runtime uses the same emitter as instances. */
export function bakeAureliaTree(params: TreeParams, stumpHeight = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [], matrix = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), color = new THREE.Color();
  visitVegetationTreeParts(params, false, (shape, paint, x, y, z, sx, sy, sz, qx, qy, qz, qw) => {
    const cut = !params.growth && stumpHeight > 0 && shape === 'stem' && x === 0 && z === 0 && qx === 0 && qz === 0;
    const indexed = cut ? new THREE.CylinderGeometry(0.72, 1 - 0.28 * stumpHeight / sy, 1, 7, 1) : treePartGeometry(shape);
    let geometry = indexed.index ? indexed.toNonIndexed() : indexed;
    if (geometry !== indexed) indexed.dispose();
    matrix.compose(p.set(x, y - stumpHeight + (cut ? stumpHeight * 0.5 : 0), z), q.set(qx, qy, qz, qw), s.set(sx, sy - (cut ? stumpHeight : 0), sz));
    geometry.applyMatrix4(matrix); color.setHex(paint).multiplyScalar(params.tint);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = color.r; colors[i + 1] = color.g; colors[i + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (params.growth && stumpHeight > 0) geometry = clipCutModule(geometry);
    parts.push(geometry);
  });
  const geometry = new THREE.BufferGeometry(), length = parts.reduce((n, part) => n + part.getAttribute('position').array.length, 0);
  for (const name of ['position', 'normal', 'color']) {
    const values = new Float32Array(length); let offset = 0;
    for (const part of parts) { const attr = part.getAttribute(name); values.set(attr.array, offset); offset += attr.array.length; }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
  }
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}

// CPU-only reusable prototypes for exact undeformed-part triangle picking. These
// three small buffers never enter a renderer or grow with explored world size.
const pickShapes = new Map<TreePartShape, THREE.BufferGeometry>();
const pickBase = new THREE.Matrix4(), pickPart = new THREE.Matrix4(), pickWorld = new THREE.Matrix4(), pickInverse = new THREE.Matrix4();
const pickPosition = new THREE.Vector3(), pickScale = new THREE.Vector3(), pickRotation = new THREE.Quaternion();
const pickRay = new THREE.Ray(), sourceRay = new THREE.Ray(), va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), hit = new THREE.Vector3();

/** Returns ray distance to the same branch/crown triangles used by the live kit.
 * Only the tiny shader leaf flutter is excluded from the interaction shape. */
export function pickAureliaTree(params: TreeParams, ux: number, uy: number, uz: number, ground: number,
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDistance: number): number | null {
  aureliaTreeMatrix(params, ux, uy, uz, ground, pickBase);
  sourceRay.origin.set(ox, oy, oz); sourceRay.direction.set(dx, dy, dz);
  let nearest = Infinity;
  visitVegetationTreeParts(params, false, (shape, _paint, x, y, z, sx, sy, sz, qx, qy, qz, qw) => {
    let geometry = pickShapes.get(shape);
    if (!geometry) { geometry = treePartGeometry(shape); geometry.computeBoundingSphere(); pickShapes.set(shape, geometry); }
    pickPart.compose(pickPosition.set(x, y, z), pickRotation.set(qx, qy, qz, qw), pickScale.set(sx, sy, sz));
    pickWorld.multiplyMatrices(pickBase, pickPart); pickInverse.copy(pickWorld).invert();
    pickRay.copy(sourceRay).applyMatrix4(pickInverse);
    if (!pickRay.intersectsSphere(geometry.boundingSphere!)) return;
    const points = geometry.getAttribute('position'), indices = geometry.index, count = indices?.count ?? points.count;
    for (let i = 0; i < count; i += 3) {
      va.fromBufferAttribute(points, indices ? indices.getX(i) : i);
      vb.fromBufferAttribute(points, indices ? indices.getX(i + 1) : i + 1);
      vc.fromBufferAttribute(points, indices ? indices.getX(i + 2) : i + 2);
      if (!pickRay.intersectTriangle(va, vb, vc, true, hit)) continue;
      hit.applyMatrix4(pickWorld).sub(sourceRay.origin);
      const distance = hit.dot(sourceRay.direction);
      if (distance >= 0 && distance <= maxDistance && distance < nearest) nearest = distance;
    }
  });
  return Number.isFinite(nearest) ? nearest : null;
}

/** Closed folded blades, leaflets and three separate flower modules. Opaque,
 * front-sided geometry avoids cutout texture edges and alpha overdraw. */
export function plantModuleGeometry(kind: PlantModule, options: { leafColor?: number; flowerColor?: number; height?: number; spread?: number } = {}): THREE.BufferGeometry {
  const kit = new GeometryKit();
  const leaf = (a: [number, number, number], b: [number, number, number], width: number, angle: number, paint: number) => {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
    const left = [mx + Math.cos(angle) * width, my - 0.025, mz + Math.sin(angle) * width];
    const right = [mx - Math.cos(angle) * width, my - 0.025, mz - Math.sin(angle) * width];
    const ridge = [mx, my + 0.055, mz], positions: number[] = [];
    for (const tri of [[a, left, ridge], [left, b, ridge], [b, right, ridge], [right, a, ridge], [a, b, left], [a, right, b]]) positions.push(...tri[0], ...tri[1], ...tri[2]);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals(); kit.add(geometry, paint);
  };
  const flower = kind === 'rosette' || kind === 'bell' || kind === 'spike';
  const green = (flower ? options.flowerColor : options.leafColor) ?? PLANT_COLORS[kind];
  const leafGreen = options.leafColor ?? 0x80935c;
  const smallParasol = () => new THREE.LatheGeometry([[0, 0.02], [0.7, -0.08], [1, 0], [0.7, 0.2], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  if (kind === 'mineralChips' || kind === 'crystalSpray' || kind === 'riftGlass') {
    const n = kind === 'mineralChips' ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, r = 0.12 + (i % 3) * 0.12;
      if (kind === 'riftGlass') kit.add(treePartGeometry('fan'), i % 2 ? green : 0xa4acbe, [Math.cos(a) * r, 0, Math.sin(a) * r], [0.26, 0.38 + i * 0.1, 0.35], [0.12, a, 0.18]);
      else kit.add(treePartGeometry('crystal'), i % 2 ? green : 0xa1a4b5, [Math.cos(a) * r, kind === 'mineralChips' ? 0.08 : 0.2 + i * 0.08, Math.sin(a) * r],
        kind === 'mineralChips' ? [0.26, 0.16, 0.19] : [0.11, 0.45 + i * 0.16, 0.09], [kind === 'mineralChips' ? 0.3 : 0.1, a, (i - 2) * 0.13]);
    }
  } else if (kind === 'thornTuft') {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.39996, x = Math.cos(a) * 0.18, z = Math.sin(a) * 0.18;
      kit.cylinder(green, [x, 0.18 + i * 0.05, z], 0.08, 0.12, 0.4 + i * 0.1, 6);
      for (let j = 0; j < 3; j++) kit.beam(0xd1ba8c, [x, 0.1 + j * 0.12, z], [x + Math.cos(a) * 0.23, 0.2 + j * 0.12, z + Math.sin(a) * 0.23], 0.012, 3);
    }
  } else if (kind === 'desertRosette' || kind === 'sulfurRosette') {
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      kit.add(treePartGeometry('frond'), i % 2 ? green : kind === 'desertRosette' ? 0xb0b27a : 0xb89c59, [0, 0.025, 0], [0.13, kind === 'desertRosette' ? 0.86 : 0.54, 0.32], [0, a, -1.05]);
    }
    if (kind === 'sulfurRosette') kit.crown(0x85704b, [0, 0.13, 0], [0.15, 0.17, 0.15]);
  } else if (kind === 'seedPods') {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39996, x = Math.cos(a) * 0.23, z = Math.sin(a) * 0.23, y = 0.45 + i * 0.08;
      kit.beam(0x8c7854, [0, 0, 0], [x, y, z], 0.02, 4);
      kit.add(treePartGeometry('crystal'), green, [x, y, z], [0.1, 0.2, 0.08], [0.25, a, 0]);
    }
  } else if (kind === 'frostLichen' || kind === 'glowMoss') {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.39996, x = Math.cos(a) * (0.16 + i * 0.06), z = Math.sin(a) * (0.16 + i * 0.06);
      kit.crown(i % 2 ? green : kind === 'glowMoss' ? 0xb4d4ae : 0xc3d7ca, [x, 0.055, z], [0.23, 0.085 + (i % 2) * 0.035, 0.2]);
      if (kind === 'glowMoss' && i % 2 === 0) kit.crown(0xd4d9b5, [x, 0.23, z], [0.045, 0.17, 0.045]);
    }
  } else if (kind === 'iceNeedles') {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.39996;
      kit.add(treePartGeometry('crystal'), i % 2 ? green : 0xd6e6e4, [Math.cos(a) * 0.2, 0.22 + (i % 3) * 0.08, Math.sin(a) * 0.2], [0.045, 0.5 + (i % 3) * 0.16, 0.04], [0.15, a, 0.16]);
    }
  } else if (kind === 'snowBell') {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1, x = Math.cos(a) * 0.16, z = Math.sin(a) * 0.16, y = 0.28 + (i % 2) * 0.15;
      kit.beam(0x8eaaa2, [0, 0.015, 0], [x, y, z], 0.016, 4);
      kit.add(smallParasol(), green, [x, y, z], [0.15, 0.25, 0.15], [0, a, Math.PI]);
    }
  } else if (kind === 'ashReed') {
    for (let i = 0; i < 5; i++) {
      const a = i * 2.39996, x = Math.cos(a) * 0.2, z = Math.sin(a) * 0.2, y = 0.55 + (i % 3) * 0.21;
      kit.beam(green, [x * 0.4, 0, z * 0.4], [x, y, z], 0.023, 5);
      kit.add(treePartGeometry('fan'), 0xb4a080, [x, y * 0.72, z], [0.09, 0.27, 0.5], [0.2, a, 0.4]);
    }
  } else if (kind === 'emberPolyps' || kind === 'sporeCups') {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39996, x = Math.cos(a) * 0.24, z = Math.sin(a) * 0.24, h = 0.19 + (i % 3) * 0.1;
      kit.cylinder(kind === 'emberPolyps' ? 0x78685d : 0x809a9a, [x, h * 0.5, z], 0.09, 0.06, h, 6);
      kit.add(smallParasol(), green, [x, h, z], [0.17, 0.2, 0.17], [0, a, kind === 'sporeCups' ? Math.PI : 0]);
      kit.crown(kind === 'emberPolyps' ? 0xe3ba7f : 0xd3e3c3, [x, h + 0.02, z], [0.06, 0.025, 0.06]);
    }
  } else if (kind === 'fanMold') {
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39996;
      kit.add(treePartGeometry('fan'), i % 2 ? green : 0xb1c8c5, [Math.cos(a) * 0.18, 0.035, Math.sin(a) * 0.18], [0.29, 0.32 + i * 0.06, 0.4], [0.2, a, 0.24]);
    }
  } else if (kind === 'fern') {
    for (let f = 0; f < 5; f++) {
      const a = f * Math.PI * 0.4, dx = Math.cos(a), dz = Math.sin(a);
      for (let j = 1; j <= 4; j++) {
        const t = j / 5, y = Math.sin(t * Math.PI * 0.8) * 0.62, reach = t * 0.9, span = 0.25 * (1 - t) + 0.07;
        for (const side of [-1, 1]) leaf([dx * reach, y, dz * reach], [dx * (reach + 0.14) - dz * span * side, y - 0.07, dz * (reach + 0.14) + dx * span * side], 0.085, a, j % 2 ? green : 0x91ad6a);
      }
    }
  } else if (kind === 'grass' || kind === 'drygrass' || kind === 'reed') {
    for (let i = 0; i < 7; i++) {
      const a = i * 2.39996, h = (kind === 'reed' ? 1.6 : kind === 'drygrass' ? 0.75 : 0.62) * (0.7 + (i % 3) * 0.13);
      const reach = kind === 'reed' ? 0.2 : 0.48;
      leaf([Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06], [Math.cos(a) * reach, h, Math.sin(a) * reach], kind === 'reed' ? 0.045 : 0.055, a + Math.PI / 2, green);
      if ((kind === 'reed' || kind === 'drygrass') && i % 2 === 0) kit.crown(kind === 'reed' ? 0x887656 : 0xd3bf91, [Math.cos(a) * reach, h, Math.sin(a) * reach], [0.055, kind === 'reed' ? 0.2 : 0.09, 0.055]);
    }
  } else if (kind === 'shrub') {
    for (let i = 0; i < 3; i++) {
      const a = i * 2.39996, x = Math.cos(a) * 0.27, z = Math.sin(a) * 0.27;
      kit.beam(0x887657, [0, 0, 0], [x, 0.55, z], 0.04, 5);
      kit.crown(i % 2 ? 0x9ea87a : green, [x, 0.62, z], [0.43, 0.4, 0.4]);
      kit.crown(0xb98a70, [x + 0.17, 0.64, z + 0.2], [0.045, 0.045, 0.045]);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      leaf([0, 0.03, 0], [Math.cos(a) * 0.34, 0.11, Math.sin(a) * 0.34], 0.09, a + Math.PI / 2, leafGreen);
    }
    const h = kind === 'spike' ? 0.95 : kind === 'bell' ? 0.68 : 0.38;
    kit.beam(leafGreen, [0, 0.04, 0], [0, h, 0], 0.018, 5);
    if (kind === 'rosette') {
      kit.crown(0x927443, [0, h + 0.01, 0], [0.09, 0.055, 0.09]);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        leaf([0, h, 0], [Math.cos(a) * 0.27, h + 0.055, Math.sin(a) * 0.27], 0.09, a + Math.PI / 2, green);
      }
    } else if (kind === 'bell') {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.17, y = h - i * 0.11;
        kit.beam(leafGreen, [0, y - 0.04, 0], [x, y + 0.1, 0], 0.013, 5);
        kit.cylinder(green, [x, y - 0.02, 0], 0.04, 0.13, 0.2, 6);
        kit.cylinder(0xead9ad, [x, y - 0.125, 0], 0.095, 0.095, 0.012, 6);
      }
    } else for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      kit.crown(i % 2 ? green : 0xc1b88e, [Math.cos(a) * 0.075, h - i * 0.085, Math.sin(a) * 0.075], [0.11, 0.08, 0.1]);
    }
  }
  const geometry = kit.finish();
  geometry.scale(options.spread ?? 1, options.height ?? 1, options.spread ?? 1);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); return geometry;
}
