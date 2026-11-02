/** Aurelia's complete spherical landscape. The starter composition is one local
 * part of this recipe; every other direction uses this same global generator.
 * Sampling is allocation-free and memoized for consecutive terrain/material/flora
 * queries at the same direction. No fine topology or per-tile map is constructed. */
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { hashString, mulberry32 } from '../util/prng';
import type { PlanetConfig } from './planetConfig';
import {
  expeditionHeight, habitatDirection, habitatPathDistance, habitatShoreX,
  habitatX, habitatZ, HABITAT_UP, HABITAT_EAST, HABITAT_FORWARD,
} from './expeditionHabitat';

export type AureliaBiome = 'coast' | 'meadow' | 'woodland' | 'wetland' | 'highland' | 'dryland';
export type AureliaTreeSpecies = 'umbrella' | 'cypress' | 'birch' | 'pine' | 'scrub';
export interface AureliaSite {
  id: string;
  name: string;
  biome: AureliaBiome;
  direction: [number, number, number];
  description: string;
}
const BIOMES: readonly AureliaBiome[] = ['coast', 'meadow', 'woodland', 'wetland', 'highland', 'dryland'];
const HEIGHTS = [7, 12, 19, 3.2, 46, 22];
const MOISTURE = [0.58, 0.52, 0.83, 0.94, 0.4, 0.15];
const FOREST = [0.16, 0.34, 0.94, 0.68, 0.46, 0.25];
const siteCache = new WeakMap<PlanetConfig, readonly AureliaSite[]>();
const clamp01 = (n: number): number => n < 0 ? 0 : n > 1 ? 1 : n;
const smooth = (n: number): number => { const t = clamp01(n); return t * t * (3 - 2 * t); };

/** Stable destinations, all with a walkable land clearing and a distinct habitat.
 * Bearings and distances span both hemispheres; only the starter uses its chart. */
export function aureliaSites(config: PlanetConfig): readonly AureliaSite[] {
  const previous = siteCache.get(config); if (previous) return previous;
  const names = ['Shore Camp', 'Windseed Downs', 'Rainbough Basin', 'Reedwater Reach', 'Cairnback Ridge', 'Ochre Steps'];
  const ids = ['shore-camp', 'windseed-downs', 'rainbough-basin', 'reedwater-reach', 'cairnback-ridge', 'ochre-steps'];
  const descriptions = [
    'A sheltered arrival above a pale beach, with a clear path into the umbrella grove.',
    'Open flower meadows and birch copses surround a low stone gathering circle.',
    'Old umbrella crowns shelter fern glades beneath a rain-dark woodland arch.',
    'Cypress hummocks and shallow reed channels lead to a dry waterside refuge.',
    'A broad, climbable pine ridge opens onto a ring of weathered summit cairns.',
    'Warm limestone shelves, scrub and ochre grass surround an old wayfinding terrace.',
  ];
  const angles = [0, 0.64, 1.23, 1.82, 2.28, 2.72];
  const bearings = [0, 2.65, 4.55, 0.75, 3.05, 5.25];
  const result: AureliaSite[] = [];
  for (let i = 0; i < names.length; i++) {
    let direction: [number, number, number];
    if (i === 0) direction = habitatDirection(-10, -44, config.radius);
    else {
      const c = Math.cos(angles[i]), s = Math.sin(angles[i]), a = Math.cos(bearings[i]) * s, b = Math.sin(bearings[i]) * s;
      direction = [
        HABITAT_UP[0] * c + HABITAT_EAST[0] * a + HABITAT_FORWARD[0] * b,
        HABITAT_UP[1] * c + HABITAT_EAST[1] * a + HABITAT_FORWARD[1] * b,
        HABITAT_UP[2] * c + HABITAT_EAST[2] * a + HABITAT_FORWARD[2] * b,
      ];
      const inv = 1 / Math.hypot(...direction); direction[0] *= inv; direction[1] *= inv; direction[2] *= inv;
    }
    result.push({ id: ids[i], name: names[i], biome: BIOMES[i], direction, description: descriptions[i] });
  }
  siteCache.set(config, result); return result;
}

export class AureliaWorld {
  private readonly n1: NoiseFunction3D;
  private readonly n2: NoiseFunction3D;
  private readonly n3: NoiseFunction3D;
  private readonly anchors = new Float64Array(18);
  private cacheX = Infinity;
  private cacheY = Infinity;
  private cacheZ = Infinity;
  private height = 0;
  private moisture = 0;
  private forest = 0;
  private biome: AureliaBiome = 'coast';

  constructor(readonly config: PlanetConfig) {
    const seed = hashString(`${config.seed}:aurelia-v2`);
    this.n1 = createNoise3D(mulberry32(seed ^ 0x42c91a67));
    this.n2 = createNoise3D(mulberry32(seed ^ 0x73a1d927));
    this.n3 = createNoise3D(mulberry32(seed ^ 0x19e5c4b3));
    const sites = aureliaSites(config);
    for (let i = 0; i < sites.length; i++) this.anchors.set(sites[i].direction, i * 3);
  }

  heightAt(x: number, y: number, z: number): number { this.sample(x, y, z); return this.height; }
  moistureAt(x: number, y: number, z: number): number { this.sample(x, y, z); return this.moisture; }
  forestAt(x: number, y: number, z: number): number { this.sample(x, y, z); return this.forest; }
  biomeAt(x: number, y: number, z: number): AureliaBiome { this.sample(x, y, z); return this.biome; }

  /** Plants avoid central landmark clearings independently of landscape height. */
  clearingAt(x: number, y: number, z: number): number {
    let nearest = -1;
    for (let i = 0; i < 6; i++) nearest = Math.max(nearest, x * this.anchors[i * 3] + y * this.anchors[i * 3 + 1] + z * this.anchors[i * 3 + 2]);
    // Radius-scaled 17m clearing with a soft 15m edge; no acos/sqrt in the hot path.
    const near = 1 - 17 * 17 / (2 * this.config.radius * this.config.radius);
    const far = 1 - 32 * 32 / (2 * this.config.radius * this.config.radius);
    return smooth((nearest - far) / (near - far));
  }

  private sample(x: number, y: number, z: number): void {
    if (x === this.cacheX && y === this.cacheY && z === this.cacheZ) return;
    this.cacheX = x; this.cacheY = y; this.cacheZ = z;
    let nearest = -1, region = 0, weightSum = 0, elevation = 0, humidity = 0, canopy = 0;
    for (let i = 0; i < 6; i++) {
      const dot = x * this.anchors[i * 3] + y * this.anchors[i * 3 + 1] + z * this.anchors[i * 3 + 2];
      if (dot > nearest) { nearest = dot; region = i; }
      const w = Math.max(0, (dot + 1) * 0.5), w2 = w * w, w4 = w2 * w2, weight = w4 * w4 * w4;
      weightSum += weight; elevation += weight * HEIGHTS[i]; humidity += weight * MOISTURE[i]; canopy += weight * FOREST[i];
    }
    elevation /= weightSum; humidity /= weightSum; canopy /= weightSum;
    const continents = this.n1(x * 1.15, y * 1.15, z * 1.15);
    const shelves = this.n2(x * 2.4 + 11, y * 2.4 - 7, z * 2.4 + 3);
    const hills = this.n3(x * 5.5 - 2, y * 5.5 + 8, z * 5.5 + 5);
    const clusters = this.n2(x * 18 + 21, y * 18 - 13, z * 18 + 6);
    const glades = this.n3(x * 39 - 8, y * 39 + 4, z * 39 - 19);
    let continental = continents * 0.7 + shelves * 0.16 + 0.12;
    const homeDot = x * HABITAT_UP[0] + y * HABITAT_UP[1] + z * HABITAT_UP[2];
    const eastDot = x * HABITAT_EAST[0] + y * HABITAT_EAST[1] + z * HABITAT_EAST[2];
    // The starter beach continues into an open bay instead of ending at a patch boundary.
    const bay = smooth((homeDot - 0.84) / 0.14);
    const bayField = (0.032 - eastDot) * 2.4;
    continental += (bayField - continental) * bay;
    const land = smooth((continental + 0.25) / 0.58);
    let height = -24 + (24 + elevation) * land + hills * 3.2 * land;
    // Broad, gentle land approaches surround each named destination. The inner
    // 45m is flat enough for a camp; the 220m blend never creates a cliff rim.
    if (region !== 0) {
      const outer = 1 - 220 * 220 / (2 * this.config.radius * this.config.radius);
      const inner = 1 - 45 * 45 / (2 * this.config.radius * this.config.radius);
      const terrace = smooth((nearest - outer) / (inner - outer));
      height += (HEIGHTS[region] + hills * 0.25 - height) * terrace;
    }
    const hx = homeDot > 0.8 ? habitatX(x, y, z, this.config.radius) : Infinity;
    const hz = homeDot > 0.8 ? habitatZ(x, y, z, this.config.radius) : Infinity;
    height = expeditionHeight(hx, hz, height);
    let biome = height < 3.8 ? 'coast' as const : BIOMES[region];
    if (region === 0 && height >= 3.8) biome = 'meadow';
    if (homeDot > 0.975 && hx * hx + hz * hz < 205 * 205) {
      biome = height < 5.2 || habitatShoreX(hz) - hx < 13 ? 'coast' : hz > 32 && hx < 16 ? 'woodland' : 'meadow';
      humidity = biome === 'woodland' ? 0.77 : 0.56;
      canopy = biome === 'woodland' ? 0.9 : 0.25;
    }
    // Wetland's land hummocks and channels stay in one ecological region.
    if (region === 3 && height > 0.4) biome = 'wetland';
    const clearing = this.clearingAt(x, y, z);
    let forest = canopy * smooth((clusters + 0.55) / 1.05) * (0.48 + smooth((glades + 0.32) / 0.8) * 0.52);
    forest *= 1 - clearing;
    if (height < 1.4) forest = 0;
    if (Number.isFinite(hx) && hx * hx + hz * hz < 205 * 205 && habitatPathDistance(hx, hz) < 7.5) forest = 0;
    this.height = Math.max(-35, Math.min(80, height));
    this.moisture = clamp01(humidity + hills * 0.09 + (1 - land) * 0.08);
    this.forest = clamp01(forest);
    this.biome = biome;
  }
}
