/**
 * Out-of-Core 7-Slot Hex Plot Structure Persistence & Survival Station Store.
 *
 * Structures are anchored in planet-local spherical coordinates:
 *   `(planetId, anchorTile, offsetEast, offsetNorth, groundRadius, yaw, subSlot)`
 *
 * Each `~5.6 m` Goldberg hex (`inradius = 2.55 m`) is divided into a 7-Slot Hex Plot:
 *  - Slot 0: Center (`0, 0`)
 *  - Slots 1..6: Ring at `r = 1.50 m` (`60°` intervals)
 * Because each survival station has a footprint radius `<= 0.85 m`, up to 7 stations
 * (Campfire, Workbench, Stone Furnace, Storage Chest, etc.) fit inside a single flat hex
 * top cap (`1.50 + 0.85 = 2.35 m < 2.55 m` inradius) without ever overhanging cliff steps!
 */

import type { Goldberg } from '../geo/goldberg';
import { ITEM_DEFS, addItem, spendItem, type Inventory, type ItemId } from './crafting';
import { evaluatePentagonWonder, queryTileResourceYield } from '../world/planetRecipe';
import type { PlanetConfig } from '../world/planetConfig';
import type { MaterialId } from '../world/terrain';

export type StructureKind =
  | 'campfire'
  | 'workbench'
  | 'furnace'
  | 'storage_chest'
  | 'landing_pad'
  | 'eco_dome'
  | 'solar_relay'
  | 'extractor'
  | 'synthesizer'
  | 'mass_driver';

export interface StructureDef {
  kind: StructureKind;
  name: string;
  shortName: string;
  cost: Partial<Record<ItemId, number>>;
  powerKw: number;
  safeAuraRadius: number;   // meters; > 0 warms/shields player and boosts health regen
  storageCap: number;
  description: string;
}

export const CONDUIT_LINK_RANGE = 42;

/**
 * 7-Slot Hex Plot offsets `(eastMeters, northMeters)` inside a `5.6 m` hex (`inradius = 2.55 m`).
 */
export function hexSubSlotOffset(subSlot: number): [number, number] {
  const s = ((Math.trunc(subSlot) % 7) + 7) % 7;
  if (s === 0) return [0, 0];
  const angle = ((s - 1) * Math.PI) / 3;
  const r = 1.48;
  return [Math.cos(angle) * r, Math.sin(angle) * r];
}

export const STRUCTURE_DEFS: Record<StructureKind, StructureDef> = {
  campfire: {
    kind: 'campfire',
    name: 'Campfire & Cooking Spit',
    shortName: 'Campfire',
    cost: { wood: 3, stone: 2 },
    powerKw: 10,
    safeAuraRadius: 16,
    storageCap: 12,
    description: 'Stone-ring campfire with a wooden cooking spit. Roasts Raw Venison and regenerates Health nearby.',
  },
  workbench: {
    kind: 'workbench',
    name: 'Timber Crafting Workbench',
    shortName: 'Workbench',
    cost: { wood: 5, stone: 2 },
    powerKw: 0,
    safeAuraRadius: 10,
    storageCap: 16,
    description: 'Heavy timber workbench with vice, saw, and anvil. Unlocks Pickaxes and the Sky-Hopper Rotor-Skiff.',
  },
  furnace: {
    kind: 'furnace',
    name: 'Stone Smelting Furnace',
    shortName: 'Stone Furnace',
    cost: { stone: 6, wood: 2 },
    powerKw: 15,
    safeAuraRadius: 14,
    storageCap: 24,
    description: 'Kiln-fired stone smelter with chimney & glowing hearth. Smelts Iron Ore into Ingots and refines Crystals.',
  },
  storage_chest: {
    kind: 'storage_chest',
    name: 'Ironbound Storage Chest',
    shortName: 'Storage Chest',
    cost: { wood: 4, stone: 1 },
    powerKw: 0,
    safeAuraRadius: 0,
    storageCap: 64,
    description: 'Iron-banded timber chest anchored to a hex plot sub-slot for storing survival supplies.',
  },
  landing_pad: {
    kind: 'landing_pad',
    name: 'Starfarer Launch Pad & Beacon',
    shortName: 'Launch Pad',
    cost: { wood: 8, stone: 6 },
    powerKw: 20,
    safeAuraRadius: 32,
    storageCap: 48,
    description: 'Hexagonal starship launch deck with an orbital light-pillar visible from deep space.',
  },
  eco_dome: {
    kind: 'eco_dome',
    name: 'Biodome Ecosystem Seeder',
    shortName: 'Eco-Dome',
    cost: { eco_pod: 1, crystal: 2 },
    powerKw: 15,
    safeAuraRadius: 36,
    storageCap: 24,
    description: 'Terraforms surrounding barren hexes into a living forest grove and cultivates Bio-Spores.',
  },
  // Legacy automation kinds kept for save/test/network backward compatibility
  solar_relay: {
    kind: 'solar_relay',
    name: 'Solar & Shield Relay',
    shortName: 'Solar Relay',
    cost: { wood: 4, stone: 2 },
    powerKw: 25,
    safeAuraRadius: 24,
    storageCap: 0,
    description: 'Powers nearby structures within 42m and projects a 24m breathable thermal shield dome.',
  },
  extractor: {
    kind: 'extractor',
    name: 'Biome Auto-Extractor',
    shortName: 'Extractor',
    cost: { wood: 6, stone: 4 },
    powerKw: -10,
    safeAuraRadius: 0,
    storageCap: 32,
    description: 'Automatically harvests the tile biome resource (2.5x speed on the 12 Pentagon Wonders).',
  },
  synthesizer: {
    kind: 'synthesizer',
    name: 'Harmonic Synthesizer',
    shortName: 'Synthesizer',
    cost: { stone: 6, crystal: 3 },
    powerKw: -15,
    safeAuraRadius: 12,
    storageCap: 24,
    description: 'Pulls raw ore/crystals from linked Extractors and refines Crystal Cells or Eco-Pods.',
  },
  mass_driver: {
    kind: 'mass_driver',
    name: 'Interplanetary Mass Driver',
    shortName: 'Mass Driver',
    cost: { alloy_ore: 4, crystal_cell: 2 },
    powerKw: -20,
    safeAuraRadius: 16,
    storageCap: 40,
    description: 'Pulls refined items from local structures and beams them across space to other planets.',
  },
};

/** Primary player-buildable survival & spacefaring stations shown in the HUD build bar. */
export const STRUCTURE_KINDS: readonly StructureKind[] = [
  'campfire',
  'workbench',
  'furnace',
  'storage_chest',
  'landing_pad',
  'eco_dome',
] as const;

export interface PlacedStructure {
  id: string;
  planetId: string;
  kind: StructureKind;
  anchorTile: number;
  subSlot?: number;
  offsetEast: number;
  offsetNorth: number;
  groundRadius: number;
  yaw: number;
  builtAt: number;
  lastTickAt: number;
  outputItem?: ItemId;
  storedCount: number;
  fractionalProgress: number;
  targetPlanetId?: string;
}

export interface ConduitLink {
  fromId: string;
  toId: string;
  planetId: string;
  fromPos: [number, number, number];
  toPos: [number, number, number];
}

export interface PlanetGridSummary {
  planetId: string;
  structureCount: number;
  powerGeneratedKw: number;
  powerConsumedKw: number;
  powerEfficiency: number;
  totalStoredItems: number;
  links: ConduitLink[];
}

/**
 * Compute exact f64 planet-centered 3D position `[x, y, z]` and unit surface normal `[ux, uy, uz]`
 * for a structure without needing any hex chunk mesh to be resident.
 *
 * Notice that `up` is kept as the tile's exact hex-cap normal `f.normal` when `offsetEast`/`offsetNorth`
 * are within the hex plot (`<= 2.5 m`) so stations on a hex sub-slot sit 100% perpendicular to the flat
 * hex top cap and never tilt!
 */
export function structureWorldPosition(
  geo: Goldberg,
  s: Pick<PlacedStructure, 'anchorTile' | 'offsetEast' | 'offsetNorth' | 'groundRadius'>,
): { pos: [number, number, number]; up: [number, number, number]; east: [number, number, number]; north: [number, number, number] } {
  const tile = Math.max(0, Math.min(geo.count - 1, Math.trunc(s.anchorTile)));
  const f = geo.frameOf(tile);
  const ux = f.normal[0], uy = f.normal[1], uz = f.normal[2];
  const ex = f.east[0], ey = f.east[1], ez = f.east[2];
  const nx = f.north[0], ny = f.north[1], nz = f.north[2];

  const offsetDist = Math.hypot(s.offsetEast, s.offsetNorth);
  if (offsetDist <= 2.55) {
    // Inside the flat hex top cap: keep `up` strictly aligned with the hex normal `u`
    // and place the base right on the flat hex cap plane (`u * groundRadius + east * offE + north * offN`)
    const px = ux * s.groundRadius + ex * s.offsetEast + nx * s.offsetNorth;
    const py = uy * s.groundRadius + ey * s.offsetEast + ny * s.offsetNorth;
    const pz = uz * s.groundRadius + ez * s.offsetEast + nz * s.offsetNorth;
    return {
      pos: [px, py, pz],
      up: [ux, uy, uz],
      east: [ex, ey, ez],
      north: [nx, ny, nz],
    };
  }

  // Farther offset (e.g. test offsets > 2.55m): project onto sphere at `groundRadius`
  const rawX = ux * s.groundRadius + ex * s.offsetEast + nx * s.offsetNorth;
  const rawY = uy * s.groundRadius + ey * s.offsetEast + ny * s.offsetNorth;
  const rawZ = uz * s.groundRadius + ez * s.offsetEast + nz * s.offsetNorth;
  const len = Math.hypot(rawX, rawY, rawZ) || 1;
  const nux = rawX / len, nuy = rawY / len, nuz = rawZ / len;

  return {
    pos: [nux * s.groundRadius, nuy * s.groundRadius, nuz * s.groundRadius],
    up: [nux, nuy, nuz],
    east: [ex, ey, ez],
    north: [nx, ny, nz],
  };
}

/**
 * Out-of-Core Persistent Structure Store & Survival Station Manager.
 */
export class StructureStore {
  readonly byId = new Map<string, PlacedStructure>();
  private seq = 1;
  simTimeSec = 0;

  /** List all structures on a specific planet (or all planets if omitted). */
  list(planetId?: string): PlacedStructure[] {
    const out: PlacedStructure[] = [];
    for (const s of this.byId.values()) {
      if (!planetId || s.planetId === planetId) out.push(s);
    }
    return out;
  }

  /** Find the next available sub-slot `0..6` on `(planetId, anchorTile)`. */
  nextFreeSubSlot(planetId: string, anchorTile: number): number {
    const used = new Set<number>();
    for (const s of this.byId.values()) {
      if (s.planetId === planetId && s.anchorTile === anchorTile) {
        used.add(s.subSlot ?? 0);
      }
    }
    for (let slot = 0; slot < 7; slot++) {
      if (!used.has(slot)) return slot;
    }
    return this.list(planetId).length % 7;
  }

  /** Check if the player is within `radiusMeters` of a station of `kind` on `planetId`. */
  isNearStation(
    geo: Goldberg,
    planetId: string,
    kind: StructureKind,
    px: number,
    py: number,
    pz: number,
    radiusMeters = 10,
  ): boolean {
    for (const s of this.byId.values()) {
      if (s.planetId !== planetId || s.kind !== kind) continue;
      const { pos } = structureWorldPosition(geo, s);
      if (Math.hypot(pos[0] - px, pos[1] - py, pos[2] - pz) <= radiusMeters) return true;
    }
    return false;
  }

  /** Check if the player's inventory can afford `kind`. */
  canAfford(kind: StructureKind, inventory: Inventory): boolean {
    const def = STRUCTURE_DEFS[kind];
    for (const [item, need] of Object.entries(def.cost) as [ItemId, number][]) {
      if ((inventory[item] ?? 0) < need) return false;
    }
    return true;
  }

  /** Spend building cost from `inventory` and place a new structure on the hex plot. */
  buildWithInventory(
    inventory: Inventory,
    params: {
      planetId: string;
      kind: StructureKind;
      anchorTile: number;
      subSlot?: number;
      offsetEast?: number;
      offsetNorth?: number;
      groundRadius: number;
      yaw?: number;
      outputItem?: ItemId;
      targetPlanetId?: string;
    },
  ): { ok: boolean; structure?: PlacedStructure; missingText?: string } {
    const def = STRUCTURE_DEFS[params.kind];
    if (!this.canAfford(params.kind, inventory)) {
      const missing = (Object.entries(def.cost) as [ItemId, number][])
        .filter(([item, need]) => (inventory[item] ?? 0) < need)
        .map(([item, need]) => `${ITEM_DEFS[item].name} ${inventory[item] ?? 0}/${need}`)
        .join(' · ');
      return { ok: false, missingText: missing };
    }
    for (const [item, need] of Object.entries(def.cost) as [ItemId, number][]) {
      spendItem(inventory, item, need);
    }
    const structure = this.place(params);
    return { ok: true, structure };
  }

  /** Place a structure directly (used by local placement, save restore, and multiplayer sync). */
  place(params: {
    id?: string;
    planetId: string;
    kind: StructureKind;
    anchorTile: number;
    subSlot?: number;
    offsetEast?: number;
    offsetNorth?: number;
    groundRadius: number;
    yaw?: number;
    builtAt?: number;
    lastTickAt?: number;
    outputItem?: ItemId;
    storedCount?: number;
    fractionalProgress?: number;
    targetPlanetId?: string;
  }): PlacedStructure {
    const id = params.id ?? `struct-${this.seq++}-${Math.random().toString(36).slice(2, 7)}`;
    const tile = Math.trunc(params.anchorTile);
    const fullHexKind = params.kind === 'landing_pad' || params.kind === 'eco_dome';
    const hasExplicitOffset = params.offsetEast !== undefined || params.offsetNorth !== undefined;
    const subSlot = params.subSlot ?? (fullHexKind || hasExplicitOffset ? 0 : this.nextFreeSubSlot(params.planetId, tile));
    const [slotE, slotN] = !hasExplicitOffset && !fullHexKind ? hexSubSlotOffset(subSlot) : [params.offsetEast ?? 0, params.offsetNorth ?? 0];

    const s: PlacedStructure = {
      id,
      planetId: params.planetId,
      kind: params.kind,
      anchorTile: tile,
      subSlot,
      offsetEast: slotE,
      offsetNorth: slotN,
      groundRadius: params.groundRadius,
      yaw: params.yaw ?? 0,
      builtAt: params.builtAt ?? Date.now(),
      lastTickAt: params.lastTickAt ?? this.simTimeSec,
      outputItem: params.outputItem,
      storedCount: Math.max(0, Math.trunc(params.storedCount ?? 0)),
      fractionalProgress: params.fractionalProgress ?? 0,
      targetPlanetId: params.targetPlanetId,
    };
    this.byId.set(id, s);
    return s;
  }

  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  /**
   * Collect any stored output items from structures within `collectRadiusMeters` of `(px, py, pz)`
   * on `planetId` into `inventory`.
   */
  collectNearby(
    geo: Goldberg,
    planetId: string,
    px: number,
    py: number,
    pz: number,
    inventory: Inventory,
    collectRadiusMeters = 7.5,
  ): Array<{ structureId: string; item: ItemId; count: number }> {
    const collected: Array<{ structureId: string; item: ItemId; count: number }> = [];
    for (const s of this.byId.values()) {
      if (s.planetId !== planetId || s.storedCount <= 0 || !s.outputItem) continue;
      const { pos } = structureWorldPosition(geo, s);
      const dist = Math.hypot(pos[0] - px, pos[1] - py, pos[2] - pz);
      if (dist <= collectRadiusMeters) {
        const amount = s.storedCount;
        const item = s.outputItem;
        s.storedCount = 0;
        addItem(inventory, item, amount);
        collected.push({ structureId: s.id, item, count: amount });
      }
    }
    return collected;
  }

  /**
   * Check whether `(px, py, pz)` on `planetId` sits inside the protective warmth/survival aura
   * of any placed structure (`campfire`, `furnace`, `landing_pad`, `eco_dome`, `solar_relay`).
   */
  isInsideSafeAura(geo: Goldberg, planetId: string, px: number, py: number, pz: number): boolean {
    for (const s of this.byId.values()) {
      if (s.planetId !== planetId) continue;
      const aura = STRUCTURE_DEFS[s.kind]?.safeAuraRadius ?? 0;
      if (aura <= 0) continue;
      const { pos } = structureWorldPosition(geo, s);
      if (Math.hypot(pos[0] - px, pos[1] - py, pos[2] - pz) <= aura) return true;
    }
    return false;
  }

  /**
   * Compute station summary for `planetId`.
   * Note: Conduit lines are only generated between legacy industrial grid nodes (`solar_relay`,
   * `extractor`, `synthesizer`, `mass_driver`) so survival campfires/workbenches never draw cyan wires.
   */
  analyzePlanetGrid(geo: Goldberg, planetConfig: PlanetConfig): PlanetGridSummary {
    const list = this.list(planetConfig.id);
    const positions = new Map<string, [number, number, number]>();
    let powerGen = 0;
    let powerUse = 0;
    let totalStored = 0;

    for (const s of list) {
      const { pos } = structureWorldPosition(geo, s);
      positions.set(s.id, pos);
      const def = STRUCTURE_DEFS[s.kind];
      const wonder = evaluatePentagonWonder(geo, s.anchorTile, planetConfig.pentagonWonder);
      if (def.powerKw > 0) {
        powerGen += def.powerKw * wonder.automationMultiplier;
      } else if (def.powerKw < 0) {
        powerUse += Math.abs(def.powerKw);
      }
      totalStored += s.storedCount;
    }

    const isConduitKind = (k: StructureKind): boolean =>
      k === 'solar_relay' || k === 'extractor' || k === 'synthesizer' || k === 'mass_driver';

    const links: ConduitLink[] = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      if (!isConduitKind(a.kind)) continue;
      const pa = positions.get(a.id)!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        if (!isConduitKind(b.kind)) continue;
        const pb = positions.get(b.id)!;
        const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
        if (d <= CONDUIT_LINK_RANGE) {
          links.push({
            fromId: a.id,
            toId: b.id,
            planetId: planetConfig.id,
            fromPos: pa,
            toPos: pb,
          });
        }
      }
    }

    const powerEfficiency =
      powerUse === 0
        ? 1.0
        : powerGen >= powerUse
          ? 1.6
          : 0.65 + 0.95 * (powerGen / powerUse);

    return {
      planetId: planetConfig.id,
      structureCount: list.length,
      powerGeneratedKw: Math.round(powerGen),
      powerConsumedKw: Math.round(powerUse),
      powerEfficiency,
      totalStoredItems: totalStored,
      links,
    };
  }

  /**
   * Advance out-of-core station processing across ALL planets in the solar system by `dt` seconds.
   */
  tickAutomation(
    dt: number,
    geo: Goldberg,
    planetConfigs: ReadonlyMap<string, PlanetConfig>,
    surfaceMatLookup?: (planetId: string, tile: number) => MaterialId,
  ): void {
    if (dt <= 0) return;
    this.simTimeSec += dt;

    for (const [planetId, cfg] of planetConfigs.entries()) {
      const structs = this.list(planetId);
      if (structs.length === 0) continue;

      const grid = this.analyzePlanetGrid(geo, cfg);
      const eff = grid.powerEfficiency;

      for (const s of structs) {
        const cap = STRUCTURE_DEFS[s.kind].storageCap;
        if (s.kind === 'extractor') {
          const mat = surfaceMatLookup ? surfaceMatLookup(planetId, s.anchorTile) : 2;
          const yieldInfo = queryTileResourceYield(geo, cfg, s.anchorTile, mat);
          s.outputItem = yieldInfo.resource;
          if (s.storedCount < cap) {
            const ratePerSec = (yieldInfo.unitsPerMinute / 60) * eff;
            s.fractionalProgress += ratePerSec * dt;
            if (s.fractionalProgress >= 1) {
              const produced = Math.floor(s.fractionalProgress);
              s.fractionalProgress -= produced;
              s.storedCount = Math.min(cap, s.storedCount + produced);
            }
          }
        } else if (s.kind === 'eco_dome') {
          s.outputItem = 'mycelium_spore';
          if (s.storedCount < cap) {
            s.fractionalProgress += 0.25 * eff * dt;
            if (s.fractionalProgress >= 1) {
              const produced = Math.floor(s.fractionalProgress);
              s.fractionalProgress -= produced;
              s.storedCount = Math.min(cap, s.storedCount + produced);
            }
          }
        }
        s.lastTickAt = this.simTimeSec;
      }

      for (const s of structs) {
        if (s.kind !== 'synthesizer') continue;
        const cap = STRUCTURE_DEFS.synthesizer.storageCap;
        if (s.storedCount >= cap) continue;
        const posS = structureWorldPosition(geo, s).pos;

        const linkedInputs = structs.filter((other) => {
          if (other.id === s.id || other.storedCount < 2) return false;
          if (other.kind !== 'extractor' && other.kind !== 'eco_dome') return false;
          const posO = structureWorldPosition(geo, other).pos;
          return Math.hypot(posS[0] - posO[0], posS[1] - posO[1], posS[2] - posO[2]) <= CONDUIT_LINK_RANGE;
        });

        if (linkedInputs.length > 0) {
          s.fractionalProgress += 0.35 * eff * dt;
          if (s.fractionalProgress >= 1) {
            s.fractionalProgress -= 1;
            const donor = linkedInputs[0]!;
            donor.storedCount = Math.max(0, donor.storedCount - 2);
            const makeEco = donor.outputItem === 'mycelium_spore';
            s.outputItem = makeEco ? 'eco_pod' : 'crystal_cell';
            s.storedCount = Math.min(cap, s.storedCount + 1);
          }
        }
      }

      for (const s of structs) {
        if (s.kind !== 'mass_driver') continue;
        const posM = structureWorldPosition(geo, s).pos;
        const cap = STRUCTURE_DEFS.mass_driver.storageCap;

        const hasSynthesizer = structs.some((st) => st.kind === 'synthesizer');
        if (s.storedCount < cap) {
          for (const other of structs) {
            if (other.id === s.id || other.storedCount <= 0 || !other.outputItem) continue;
            if (other.kind !== 'extractor' && other.kind !== 'synthesizer' && other.kind !== 'eco_dome') continue;
            const reserve = hasSynthesizer && other.kind !== 'synthesizer' ? 2 : 0;
            const avail = other.storedCount - reserve;
            if (avail <= 0) continue;
            const posO = structureWorldPosition(geo, other).pos;
            if (Math.hypot(posM[0] - posO[0], posM[1] - posO[1], posM[2] - posO[2]) <= CONDUIT_LINK_RANGE) {
              if (!s.outputItem || s.outputItem === other.outputItem || s.storedCount === 0) {
                s.outputItem = other.outputItem;
                const transfer = Math.min(cap - s.storedCount, avail);
                s.storedCount += transfer;
                other.storedCount -= transfer;
                break;
              }
            }
          }
        }

        if (s.storedCount > 0 && s.outputItem) {
          const targetPlanet = s.targetPlanetId ?? 'planet-0';
          if (targetPlanet !== planetId) {
            const receivers = this.list(targetPlanet).filter(
              (r) =>
                (r.kind === 'landing_pad' || r.kind === 'mass_driver') &&
                r.storedCount < STRUCTURE_DEFS[r.kind].storageCap &&
                (!r.outputItem || r.outputItem === s.outputItem || r.storedCount === 0),
            );
            if (receivers.length > 0) {
              const recv = receivers[0]!;
              const maxTransfer = STRUCTURE_DEFS[recv.kind].storageCap - recv.storedCount;
              const moved = Math.min(s.storedCount, maxTransfer);
              if (moved > 0) {
                recv.outputItem = s.outputItem;
                recv.storedCount += moved;
                s.storedCount -= moved;
              }
            }
          }
        }
      }
    }
  }

  exportAll(): PlacedStructure[] {
    return [...this.byId.values()].map((s) => ({ ...s }));
  }

  importAll(list: readonly PlacedStructure[]): void {
    this.byId.clear();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      if (!(raw.kind in STRUCTURE_DEFS)) continue;
      this.place(raw);
    }
  }
}
