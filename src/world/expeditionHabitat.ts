/** Aurelia's first expedition: a composed shoreline, open trail, and sheltered grove.
 * Pure sphere-local recipe, shared by terrain workers, interaction and instanced art.
 * Distances are metres, not tile IDs, so the composition survives topology resolution.
 */
import type { Goldberg } from '../geo/goldberg';
import type { PlanetConfig } from './planetConfig';
import { hashString, mulberry32 } from '../util/prng';

export const EXPEDITION_RECIPE = 'aurelia-v2' as const;
export const HABITAT_INTERIOR_RADIUS = 205;
export const HABITAT_BLEND_RADIUS = 320;
export const HABITAT_SPAWN = { x: -10, z: -44 };
export const HABITAT_LANDMARK = { x: 12, z: 124 };
const ny = 0.52, nx = 0.72, nz = Math.sqrt(1 - nx * nx - ny * ny);
export const HABITAT_UP = [nx, ny, nz] as const;
const el = Math.hypot(nx, nz);
export const HABITAT_EAST = [nz / el, 0, -nx / el] as const;
export const HABITAT_FORWARD = [nx * ny / el, -el, nz * ny / el] as const;

export function hasExpeditionHabitat(config: PlanetConfig): boolean {
  return config.expeditionRecipe === EXPEDITION_RECIPE || config.expeditionRecipe === 'aurelia-v1';
}

/** Gnomonic chart with a hemisphere guard; no coordinate allocation in hot paths. */
export function habitatX(x: number, y: number, z: number, radius: number): number {
  const d = x * nx + y * ny + z * nz;
  return d > 0.8 ? (x * HABITAT_EAST[0] + z * HABITAT_EAST[2]) * radius / d : Infinity;
}
export function habitatZ(x: number, y: number, z: number, radius: number): number {
  const d = x * nx + y * ny + z * nz;
  return d > 0.8 ? (x * HABITAT_FORWARD[0] + y * HABITAT_FORWARD[1] + z * HABITAT_FORWARD[2]) * radius / d : Infinity;
}
export function habitatDirection(x: number, z: number, radius: number): [number, number, number] {
  const a = nx * radius + HABITAT_EAST[0] * x + HABITAT_FORWARD[0] * z;
  const b = ny * radius + HABITAT_FORWARD[1] * z;
  const c = nz * radius + HABITAT_EAST[2] * x + HABITAT_FORWARD[2] * z;
  const inv = 1 / Math.hypot(a, b, c);
  return [a * inv, b * inv, c * inv];
}
export function isExpeditionInterior(config: PlanetConfig, x: number, y: number, z: number): boolean {
  if (!hasExpeditionHabitat(config)) return false;
  const a = habitatX(x, y, z, config.radius), b = habitatZ(x, y, z, config.radius);
  return a * a + b * b < HABITAT_INTERIOR_RADIUS * HABITAT_INTERIOR_RADIUS;
}
export function habitatPathX(z: number): number {
  // The grove opens into a final gentle bend through the arch, rather than ending beside it.
  const bend = smooth((z - 95) / 30);
  return (-6 + 6 * Math.sin(z / 45)) * (1 - bend) + HABITAT_LANDMARK.x * bend;
}
export function habitatShoreX(z: number): number { return 28 + 8 * Math.sin(z / 52); }
export function habitatPathDistance(x: number, z: number): number {
  if (z < -65) return Math.hypot(x - habitatPathX(-65), z + 65);
  if (z > 125) return Math.hypot(x - habitatPathX(125), z - 125);
  return Math.abs(x - habitatPathX(z));
}
function smooth(t: number): number { const s = Math.max(0, Math.min(1, t)); return s * s * (3 - 2 * s); }
export function expeditionHeight(x: number, z: number, original: number): number {
  const distance = Math.hypot(x, z);
  if (distance >= HABITAT_BLEND_RADIUS) return original;
  const inland = habitatShoreX(z) - x;
  const coast = inland > 0 ? 0.5 + inland * 0.105 : 0.5 + inland * 0.22;
  const hills = smooth((inland - 35) / 70) * (3 + 4 * Math.sin(z / 57) * Math.sin(x / 64));
  const trail = 4 + Math.max(-15, Math.min(175, z + 44)) * 0.012;
  const pathInfluence = 1 - smooth((habitatPathDistance(x, z) - 5) / 12);
  const composed = (coast + hills) * (1 - pathInfluence) + trail * pathInfluence;
  const blend = smooth((distance - HABITAT_INTERIOR_RADIUS) / (HABITAT_BLEND_RADIUS - HABITAT_INTERIOR_RADIUS));
  return composed * (1 - blend) + original * blend;
}

export type HabitatCommunity = 'shore' | 'grove';
export interface HabitatTree { tile: number; x: number; z: number; scale: number; yaw: number; community: HabitatCommunity }
export interface HabitatPlant { x: number; z: number; scale: number; yaw: number; kind: 'fern' | 'grass' | 'reed' | 'flower'; community: HabitatCommunity }
export interface ExpeditionHabitat {
  spawnTile: number;
  heading: readonly [number, number, number];
  treeByTile: ReadonlyMap<number, HabitatTree>;
  trees: readonly HabitatTree[];
  plants: readonly HabitatPlant[];
  route: readonly number[];
}
const cache = new WeakMap<Goldberg, Map<string, ExpeditionHabitat>>();

/** A few authored cluster anchors plus seeded variation; never independent global scatter. */
export function createExpeditionHabitat(geo: Goldberg, config: PlanetConfig): ExpeditionHabitat | null {
  if (!hasExpeditionHabitat(config)) return null;
  const key = `${config.seed}:${config.radius}:${config.expeditionRecipe}`;
  let entries = cache.get(geo);
  if (!entries) { entries = new Map(); cache.set(geo, entries); }
  const cached = entries.get(key);
  if (cached) return cached;
  const random = mulberry32(hashString(`${config.seed}:shore-grove-v1`));
  const treeByTile = new Map<number, HabitatTree>();
  const trees: HabitatTree[] = [];
  const clusters = [
    [-28, -28], [-35, -6], [-24, 18], [13, 31],
    [-26, 48], [-45, 57], [-62, 74], [-32, 78], [-16, 97],
    [12, 87], [-48, 109], [-70, 118], [-83, 47], [-61, 14],
    [-97, 87], [-93, 126], [-23, 135], [14, 140], [-64, -25],
  ];
  for (let i = 0; i < clusters.length; i++) {
    const x = clusters[i][0] + (random() - 0.5) * 4;
    const z = clusters[i][1] + (random() - 0.5) * 4;
    const d = habitatDirection(x, z, config.radius);
    const tile = geo.tileOf(...d);
    if (treeByTile.has(tile)) continue;
    // Snap the trunk to the tile so the core picker and column removal agree exactly.
    const c = geo.centers, o = tile * 3;
    const sx = habitatX(c[o], c[o + 1], c[o + 2], config.radius);
    const sz = habitatZ(c[o], c[o + 1], c[o + 2], config.radius);
    if (habitatPathDistance(sx, sz) < 8) continue;
    const tree: HabitatTree = { tile, x: sx, z: sz, scale: 0.9 + random() * 0.45, yaw: random() * Math.PI * 2, community: z < 40 ? 'shore' : 'grove' };
    trees.push(tree); treeByTile.set(tile, tree);
  }
  const plants: HabitatPlant[] = [];
  // Shore hummocks: airy grass/flowers, reeds specifically at the wet edge.
  const patches: [number, number, HabitatCommunity][] = [
    [-22, -40, 'shore'], [8, -23, 'shore'], [-23, 5, 'shore'], [17, 15, 'shore'],
    [23, 49, 'shore'], [29, 70, 'shore'], [-20, 44, 'grove'], [-43, 65, 'grove'],
    [-21, 84, 'grove'], [-52, 102, 'grove'], [-73, 78, 'grove'], [-36, 123, 'grove'],
  ];
  for (const [cx, cz, community] of patches) {
    const count = community === 'grove' ? 34 : 28;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * 12;
      const x = cx + Math.cos(angle) * r, z = cz + Math.sin(angle) * r;
      const shore = habitatShoreX(z) - x;
      if (habitatPathDistance(x, z) < 4.5 || shore < -1) continue;
      const kind = shore < 5 ? 'reed' : community === 'grove' ? (random() < 0.74 ? 'fern' : 'flower') : (random() < 0.77 ? 'grass' : 'flower');
      plants.push({ x, z, kind, scale: 0.65 + random() * 0.7, yaw: random() * Math.PI * 2, community });
    }
  }
  const route: number[] = [];
  for (let z = HABITAT_SPAWN.z; z <= 124; z += 2) {
    const d = habitatDirection(habitatPathX(z), z, config.radius);
    const tile = geo.tileOf(...d);
    if (route[route.length - 1] !== tile) route.push(tile);
  }
  const spawn = habitatDirection(HABITAT_SPAWN.x, HABITAT_SPAWN.z, config.radius);
  const result: ExpeditionHabitat = { spawnTile: geo.tileOf(...spawn), heading: HABITAT_FORWARD, treeByTile, trees, plants, route };
  entries.set(key, result);
  return result;
}
