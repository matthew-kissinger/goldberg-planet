/**
 * Core Gameplay Loop (Survival, Hunting, Campfire Cooking, Hex-Plot Crafting & Spacefaring):
 *  - Chop multi-tree groves with whole-tree felling physics (`FallingTreeRenderer`)
 *  - Hunt Hex-Horn Stags & fend off Ridge-Stalker Wolves for Raw Venison, Beast Hide & Bone
 *  - Build 7-Slot Hex Plot Stations: Campfire & Spit, Timber Workbench, Stone Smelting Furnace,
 *    Ironbound Storage Chest, Starfarer Launch Pad, and Biodome Oasis Seeder
 *  - Cook Raw Venison -> Roasted Meat (`cooked_meat`, press C/T to eat for +35 Hunger & Health regen)
 *  - Craft the Twin-Rotor "Sky-Hopper" Skiff (`planeFrame`) and "Starfarer" Interplanetary Starship (`orbital_thruster`)
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { TreeParams, Trees } from '../world/trees';
import type { Streamer } from '../world/streamer';
import type { Player } from '../player/player';
import type { Hud, CraftingRecipeView } from '../demo/hud';
import type { GameAudio } from '../audio/gameAudio';
import type { ResourceDropRenderer } from '../render/resourceDrops';
import { MAT, type MaterialId } from '../world/terrain';
import {
  ITEM_DEFS,
  PLANE_WOOD_COST,
  RECIPES,
  addItem,
  craftRecipe,
  itemCount,
  recipeStatus,
  spendItem,
  type Inventory,
  type ItemId,
} from '../sim/crafting';
import {
  ageResourceDrops,
  collectReadyResourceDrops,
  despawnAgedResourceDrops,
  nextResourceDropId,
  spawnTreeWoodDrops,
  type ResourceDropSave,
} from '../sim/resourceDrops';
import {
  STRUCTURE_DEFS,
  StructureStore,
  type PlacedStructure,
  type StructureKind,
} from '../sim/persistence';
import { characterActionForLocomotion, type CharacterAction, type CharacterPropId, type CharacterVisualState } from '../sim/equipment';
import { boardedHint, enoughWoodHint, needWoodHint, planeKeyLabel, type HintDevice } from './hints';

export const WOOD_PER_TREE = 6;
/** seconds between strikes while chop is held */
export const CHOP_COOLDOWN = 0.17;

export interface CoreLoopDeps {
  geo: Goldberg;
  layers: Layers;
  columns: Columns;
  trees: Trees;
  streamer: Streamer;
  player: Player;
  hud: Hud;
  audio: GameAudio;
  drops: ResourceDropRenderer;
  device: () => HintDevice;
  /** something the save cares about changed */
  changed: () => void;
  structures?: StructureStore;
  activePlanetId?: () => string;
  onStructurePlaced?: (s: PlacedStructure) => void;
  onColumnEdited?: (planetId: string, tile: number, layer: number, action: 'mine' | 'place', mat?: MaterialId) => void;
  onTreeStruck?: (planetId: string, tile: number, felled: boolean, groveTrees?: TreeParams[], groundRadius?: number) => void;
}

export interface CoreLoopState {
  inventory: Inventory;
  planeCrafted: boolean;
  drops: ResourceDropSave[];
}

export class CoreLoop {
  inventory: Inventory;
  planeCrafted: boolean;
  drops: ResourceDropSave[];
  readonly structures: StructureStore;
  selectedStructureKind: StructureKind = 'campfire';
  placementYaw = 0;
  lastPickup = '';
  private nextDropId: number;
  private action: { action: CharacterAction; held: CharacterPropId; started: number; duration: number } = {
    action: 'idle', held: 'hands', started: 0, duration: 0,
  };

  constructor(private readonly d: CoreLoopDeps, state: CoreLoopState) {
    this.inventory = state.inventory;
    this.planeCrafted = state.planeCrafted || itemCount(state.inventory, 'planeFrame') > 0;
    this.structures = d.structures ?? new StructureStore();
    this.drops = this.backfillGroundRadius(state.drops);
    this.nextDropId = nextResourceDropId(this.drops);
    d.drops.setDrops(this.drops);
    this.syncPlayerTechUpgrades();
  }

  get wood(): number {
    return itemCount(this.inventory, 'wood');
  }

  get currentPlanetId(): string {
    return this.d.activePlanetId ? this.d.activePlanetId() : 'planet-0';
  }

  /** Rebind active planet references when the player travels between worlds. */
  rebindPlanet(layers: Layers, columns: Columns, trees: Trees, planetDrops: ResourceDropSave[]): void {
    this.d.layers = layers;
    this.d.columns = columns;
    this.d.trees = trees;
    this.drops = this.backfillGroundRadius(planetDrops);
    this.nextDropId = nextResourceDropId(this.drops);
    this.d.drops.setDrops(this.drops);
  }

  syncPlayerTechUpgrades(): void {
    const { player } = this.d;
    const hasThruster = itemCount(this.inventory, 'orbital_thruster') > 0;
    const hasThermal = itemCount(this.inventory, 'thermal_hull') > 0;
    player.hasOrbitalThruster = hasThruster;
    player.suitTier = hasThermal ? 3 : hasThruster ? 1 : 0;
  }

  /** World-space radius of the ground at a tile right now; cached on a drop once at spawn. */
  private groundRadiusAt(tile: number): number {
    const { layers, columns } = this.d;
    return layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
  }

  private backfillGroundRadius(drops: readonly ResourceDropSave[]): ResourceDropSave[] {
    return drops.map((drop) => (drop.groundRadius > 0 ? drop : { ...drop, groundRadius: this.groundRadiusAt(drop.tile) }));
  }

  pose(action: CharacterAction, held: CharacterPropId, duration: number): void {
    this.action = { action, held, started: performance.now() / 1000, duration };
  }

  private preferredHeldTool(): CharacterPropId {
    if (itemCount(this.inventory, 'hatchet') > 0) return 'hatchet';
    if (itemCount(this.inventory, 'spear') > 0) return 'spear';
    if (itemCount(this.inventory, 'pickaxe') > 0) return 'pickaxe';
    if (this.wood > 0) return 'wood';
    return 'hands';
  }

  /** One hit on a tree/flora. Returns false if there is no live tree there. */
  strikeTree(tile: number): boolean {
    const { trees, columns, streamer, hud, audio } = this.d;
    if (!trees.hasTree(tile)) return false;
    const groveBefore = typeof trees.groveTreesFor === 'function' ? trees.groveTreesFor(tile) : [trees.paramsFor(tile)];
    const rG = this.groundRadiusAt(tile);
    const hasHatchet = itemCount(this.inventory, 'hatchet') > 0;
    const result = trees.strike(tile, hasHatchet ? 2 : 1);
    if (!result.hit) return false;
    this.pose('chop', hasHatchet ? 'hatchet' : 'hands', CHOP_COOLDOWN + 0.28);
    streamer.rebuildTile(tile);
    audio.playEvent('gatherSoft');
    this.d.onTreeStruck?.(this.currentPlanetId, tile, result.felled, groveBefore, rG);
    if (result.felled) {
      const floraKind = groveBefore[0]?.kind ?? 'conifer';
      const bonusItem: ItemId | null =
        floraKind === 'crystal_spire'
          ? 'crystal'
          : floraKind === 'fungal'
            ? 'mycelium_spore'
            : columns.terrain.archetype === 'canyon'
              ? 'alloy_ore'
              : null;
      const spawned = spawnTreeWoodDrops(tile, this.nextDropId, rG, WOOD_PER_TREE);
      this.nextDropId = spawned.nextId;
      this.drops = [...this.drops, ...spawned.drops];
      // Also grant 1 Plant Fiber or Flint Shard from forest undergrowth
      addItem(this.inventory, 'fiber', 1);
      if (bonusItem) {
        addItem(this.inventory, bonusItem, 2);
      }
      this.d.drops.setDrops(this.drops);
      hud.flash(
        bonusItem
          ? `timber! +${WOOD_PER_TREE} wood, +1 fiber & +2 ${ITEM_DEFS[bonusItem].name.toLowerCase()}`
          : `timber! tree felled · ${WOOD_PER_TREE} wood logs dropped`,
        2.6,
      );
    } else {
      const remaining = Math.max(1, Math.ceil(result.remaining));
      hud.flash(`chopping trunk · ${remaining} more strike${remaining === 1 ? '' : 's'}`, 1.7);
    }
    this.d.changed();
    return true;
  }

  /** Mine a terrain column cell (awards biome mineral, flint, or iron ore & rebuilds tile + border neighbors). */
  mineCell(tile: number, layer: number): boolean {
    const { columns, streamer, hud, audio } = this.d;
    const mat = columns.materialAt(tile, layer);
    if (!columns.mine(tile, layer)) return false;
    const hasPick = itemCount(this.inventory, 'pickaxe') > 0;
    this.pose('chop', hasPick ? 'pickaxe' : 'hands', 0.35);
    streamer.rebuildTile(tile, true);
    audio.playEvent('gatherSoft');

    const mult = hasPick ? 2 : 1;
    let harvested: ItemId = 'stone';
    if (mat === MAT.CRYSTAL) harvested = 'crystal';
    else if (mat === MAT.MAGMA) harvested = 'magma_core';
    else if (mat === MAT.ICE) harvested = columns.terrain.archetype === 'cryo' ? 'cryo_core' : 'stone';
    else if (mat === MAT.MYCELIUM) harvested = 'mycelium_spore';
    else if (mat === MAT.TERRACOTTA || mat === MAT.BASALT) {
      harvested = columns.terrain.archetype === 'canyon' || columns.terrain.archetype === 'volcanic' ? 'alloy_ore' : 'iron_ore';
    } else if (mat === MAT.WOOD) {
      harvested = 'wood';
    }
    addItem(this.inventory, harvested, mult);
    if (harvested === 'stone') {
      addItem(this.inventory, 'flint', 1);
      addItem(this.inventory, 'iron_ore', 1);
      hud.flash(`mined +${mult} ferric stone, +1 flint & +1 iron ore`, 2.0);
    } else {
      hud.flash(`mined +${mult} ${ITEM_DEFS[harvested].name.toLowerCase()}`, 1.8);
    }
    this.d.onColumnEdited?.(this.currentPlanetId, tile, layer, 'mine');
    this.d.changed();
    return true;
  }

  /** Eat Roasted Meat (`cooked_meat`) or Raw Venison (`raw_meat`) to restore Hunger & trigger Health regeneration. */
  consumeFood(): boolean {
    const { player, hud, audio } = this.d;
    if (spendItem(this.inventory, 'cooked_meat', 1)) {
      player.eatFood(35, 16);
      this.pose('pickup', 'cooked_meat', 0.55);
      audio.playEvent('craftConfirm');
      hud.flash(`ate roasted meat · hunger ${Math.round(player.hunger)}% · well-fed health regen active!`, 3.0);
      this.d.changed();
      return true;
    }
    if (spendItem(this.inventory, 'raw_meat', 1)) {
      player.eatFood(15, 5);
      this.pose('pickup', 'hands', 0.45);
      audio.playEvent('gatherSoft');
      hud.flash(`ate raw venison (+15% hunger — roast at a Campfire for +35% & healing!)`, 2.8);
      this.d.changed();
      return true;
    }
    audio.playEvent('uiDeny');
    hud.flash('no meat in inventory — hunt a Hex-Horn Stag and roast venison at a Campfire!', 2.6);
    return false;
  }

  /** Place a voxel cell in `columns`. */
  placeCell(tile: number, layer: number, mat: MaterialId = MAT.BUILT): boolean {
    const { columns, streamer, audio } = this.d;
    if (!columns.place(tile, layer, mat)) return false;
    streamer.rebuildTile(tile, true);
    audio.playEvent('structurePlace');
    this.d.onColumnEdited?.(this.currentPlanetId, tile, layer, 'place', mat);
    this.d.changed();
    return true;
  }

  /**
   * Place a survival station or launch pad on the current planet's 7-slot hex plot.
   */
  placeStructure(
    kind: StructureKind,
    anchorTile: number,
    offsetEast?: number,
    offsetNorth?: number,
    yaw = this.placementYaw,
    targetPlanetId?: string,
  ): PlacedStructure | null {
    const { columns, streamer, hud, audio } = this.d;
    const groundRadius = this.groundRadiusAt(anchorTile);
    const res = this.structures.buildWithInventory(this.inventory, {
      planetId: this.currentPlanetId,
      kind,
      anchorTile,
      offsetEast,
      offsetNorth,
      groundRadius,
      yaw,
      targetPlanetId,
    });
    if (!res.ok || !res.structure) {
      audio.playEvent('uiDeny');
      hud.flash(`need ${res.missingText ?? 'resources'} to build ${STRUCTURE_DEFS[kind].shortName}`, 2.8);
      return null;
    }

    if (kind === 'eco_dome') {
      const seeded = columns.seedEcosystem(anchorTile, true);
      for (const t of seeded) streamer.rebuildTile(t, false);
      hud.flash(`planted Eco-Dome · living biome seeded across ${seeded.length} hexes!`, 3.5);
    } else {
      const slotNum = (res.structure.subSlot ?? 0) + 1;
      hud.flash(`built ${STRUCTURE_DEFS[kind].name} on hex plot slot #${slotNum}`, 3.0);
    }

    audio.playEvent('structurePlace');
    this.d.onStructurePlaced?.(res.structure);
    this.d.changed();
    return res.structure;
  }

  /** Deploy an Ecosystem Seed Pod directly onto `tile` to connect ecosystems across worlds. */
  deployEcoPod(tile: number): boolean {
    const { columns, streamer, hud, audio } = this.d;
    if (!spendItem(this.inventory, 'eco_pod', 1)) {
      audio.playEvent('uiDeny');
      hud.flash('no Ecosystem Seed Pod in inventory (craft or synthesize one)', 2.8);
      return false;
    }
    const seeded = columns.seedEcosystem(tile, true);
    for (const t of seeded) streamer.rebuildTile(t, false);
    audio.playEvent('craftConfirm');
    hud.flash(`ecosystem seeded · ${seeded.length} hexes transformed into a living oasis!`, 3.4);
    this.d.changed();
    return true;
  }

  /** Age drops, despawn stale ones, collect ready drops, and collect nearby structure outputs. */
  tickDrops(dt: number): void {
    const { geo, player } = this.d;
    const planetId = this.currentPlanetId;

    // Update player safe warmth/shield aura status from placed Campfires, Furnaces, Launch Pads, etc.
    player.inSafeAura = this.structures.isInsideSafeAura(geo, planetId, player.px, player.py, player.pz);

    const structCollected = this.structures.collectNearby(
      geo,
      planetId,
      player.px,
      player.py,
      player.pz,
      this.inventory,
    );
    if (structCollected.length > 0) {
      const first = structCollected[0]!;
      const total = structCollected.reduce((acc, c) => acc + c.count, 0);
      this.d.audio.playEvent('gatherSoft');
      this.d.hud.flash(`collected +${total} ${ITEM_DEFS[first.item].name.toLowerCase()}`, 2.4);
      this.d.changed();
    }

    if (this.drops.length === 0) return;
    const despawn = despawnAgedResourceDrops(ageResourceDrops(this.drops, dt));
    const near = new Set<number>([player.tile]);
    for (let k = 0; k < geo.degreeOf(player.tile); k++) near.add(geo.neighbor(player.tile, k));
    const result = collectReadyResourceDrops(despawn.remaining, near);
    this.drops = result.remaining;
    if (despawn.despawned.length > 0 || result.collected.length > 0) {
      this.d.drops.setDrops(this.drops);
      this.d.changed();
    }
    if (result.collected.length > 0) this.collect(result.collected);
  }

  private collect(collected: readonly ResourceDropSave[]): void {
    const totals = new Map<ItemId, number>();
    for (const drop of collected) {
      addItem(this.inventory, drop.item, drop.count);
      totals.set(drop.item, (totals.get(drop.item) ?? 0) + drop.count);
    }
    const [primary] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]!;
    const total = [...totals.values()].reduce((sum, n) => sum + n, 0);
    this.lastPickup = `picked up ${total} ${ITEM_DEFS[primary].name.toLowerCase()}`;
    this.pose('pickup', primary, 0.64);
    this.d.audio.playEvent('gatherSoft');
    const wood = totals.get('wood') ?? 0;
    if (wood > 0 && !this.planeCrafted) {
      if (this.wood >= PLANE_WOOD_COST) this.d.hud.flash(enoughWoodHint(this.d.device(), this.wood), 4);
      else {
        const treesLeft = Math.ceil((PLANE_WOOD_COST - this.wood) / WOOD_PER_TREE);
        this.d.hud.flash(`picked up +${wood} wood · ${this.wood}/${PLANE_WOOD_COST} for Sky-Hopper · ${treesLeft} tree${treesLeft === 1 ? '' : 's'} left`, 3);
      }
      return;
    }
    this.d.hud.flash(this.lastPickup, 2.4);
  }

  craftingRows(): CraftingRecipeView[] {
    return RECIPES.map((recipe) => {
      const status = recipeStatus(recipe, this.inventory);
      const built =
        (recipe.result === 'planeFrame' && this.planeCrafted) ||
        (recipe.result === 'orbital_thruster' && itemCount(this.inventory, 'orbital_thruster') > 0) ||
        (recipe.result === 'thermal_hull' && itemCount(this.inventory, 'thermal_hull') > 0);
      return {
        id: recipe.id,
        name: recipe.name,
        description:
          recipe.result === 'planeFrame' && built
            ? `Sky-Hopper Skiff ready. ${planeKeyLabel(this.d.device())} boards or stows it.`
            : built
              ? `${recipe.name} unlocked.`
              : recipe.description,
        canCraft: status.canCraft && !built,
        requirements: status.requirements.map((req) => ({ name: req.name, need: req.need, have: req.have })),
      };
    });
  }

  craft(recipeId: string): boolean {
    const { hud, audio } = this.d;
    if (recipeId === 'plane_frame' && this.planeCrafted) {
      audio.playEvent('uiDeny');
      hud.flash(`Sky-Hopper already built · ${planeKeyLabel(this.d.device())} boards`, 2.5);
      return false;
    }
    const result = craftRecipe(recipeId, this.inventory);
    if (!result.ok || !result.recipe) {
      audio.playEvent('uiDeny');
      hud.flash(result.missing.length > 0
        ? `missing ${result.missing.map((m) => `${m.name} ${m.have}/${m.need}`).join(' · ')}`
        : 'recipe unavailable', 3);
      return false;
    }
    if (result.recipe.result === 'planeFrame') this.planeCrafted = true;
    this.syncPlayerTechUpgrades();
    hud.flash(`crafted ${result.recipe.name.toLowerCase()}`, 4);
    audio.playEvent('craftConfirm');
    this.pose('craft', result.recipe.result, 0.65);
    this.d.changed();
    return true;
  }

  /** E / vehicle button: stow if flying, else craft-if-needed and board Sky-Hopper or Starfarer Starship. */
  planeButton(): void {
    const { player, hud, audio } = this.d;
    if (player.mode === 'plane') {
      player.exitPlane();
      audio.playEvent('uiConfirm');
      hud.flash(player.hasOrbitalThruster ? 'Starfarer Starship landed & stowed' : 'Sky-Hopper Skiff landed', 2);
      return;
    }
    const justCrafted = !this.planeCrafted;
    if (justCrafted) {
      if (this.wood < PLANE_WOOD_COST) {
        audio.playEvent('uiDeny');
        hud.flash(needWoodHint(this.d.device(), this.wood), 4);
        return;
      }
      craftRecipe('plane_frame', this.inventory);
      this.planeCrafted = true;
      audio.playEvent('craftConfirm');
      this.d.changed();
    }
    if (!player.enterPlane()) {
      audio.playEvent('uiDeny');
      hud.flash("can't launch from deep water", 2.5);
      return;
    }
    audio.playEvent('structurePlace');
    hud.flash(
      player.hasOrbitalThruster
        ? 'boarded Starfarer Interplanetary Starship · pitch up past 260m AGL for orbital cruise!'
        : boardedHint(this.d.device(), justCrafted),
      justCrafted ? 6 : 3,
    );
  }

  characterVisualState(): CharacterVisualState {
    const { player } = this.d;
    const now = performance.now() / 1000;
    const t = Math.max(0, now - this.action.started);
    if (this.action.action !== 'idle' && t < this.action.duration) {
      return { action: this.action.action, held: this.action.held, actionT: t, actionDuration: this.action.duration };
    }
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    return {
      action: characterActionForLocomotion({
        mode: player.mode,
        speed,
        grounded: player.grounded,
        submerged: player.submerged,
        sprinting: player.mode === 'walk' && player.grounded && speed > 7.2,
      }),
      held: this.preferredHeldTool(),
      actionT: 0,
      actionDuration: 0,
    };
  }
}
