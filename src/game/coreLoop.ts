/**
 * The game's one loop: chop trees (staged hits) -> wood drops -> walk over them to pick
 * up -> craft the plane frame from wood -> board and fly. Owns the inventory, the loose
 * drops and the character's action pose; the frame loop feeds it input and time.
 */

import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { Trees } from '../world/trees';
import type { Streamer } from '../world/streamer';
import type { Player } from '../player/player';
import type { Hud, CraftingRecipeView } from '../demo/hud';
import type { GameAudio } from '../audio/gameAudio';
import type { ResourceDropRenderer } from '../render/resourceDrops';
import {
  ITEM_DEFS,
  PLANE_WOOD_COST,
  RECIPES,
  addItem,
  craftRecipe,
  itemCount,
  recipeStatus,
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
  lastPickup = '';
  private nextDropId: number;
  private action: { action: CharacterAction; held: CharacterPropId; started: number; duration: number } = {
    action: 'idle', held: 'hands', started: 0, duration: 0,
  };

  constructor(private readonly d: CoreLoopDeps, state: CoreLoopState) {
    this.inventory = state.inventory;
    this.planeCrafted = state.planeCrafted || itemCount(state.inventory, 'planeFrame') > 0;
    this.drops = this.backfillGroundRadius(state.drops);
    this.nextDropId = nextResourceDropId(this.drops);
    d.drops.setDrops(this.drops);
  }

  get wood(): number {
    return itemCount(this.inventory, 'wood');
  }

  /** World-space radius of the ground at a tile right now; cached on a drop once at spawn. */
  private groundRadiusAt(tile: number): number {
    const { layers, columns } = this.d;
    return layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
  }

  private backfillGroundRadius(drops: readonly ResourceDropSave[]): ResourceDropSave[] {
    return drops.map((drop) => (drop.groundRadius > 0 ? drop : { ...drop, groundRadius: this.groundRadiusAt(drop.tile) }));
  }

  private pose(action: CharacterAction, held: CharacterPropId, duration: number): void {
    this.action = { action, held, started: performance.now() / 1000, duration };
  }

  /** One hit on a tree. Returns false if there is no live tree there. */
  strikeTree(tile: number): boolean {
    const { trees, streamer, hud, audio } = this.d;
    if (!trees.hasTree(tile)) return false;
    const result = trees.strike(tile);
    if (!result.hit) return false;
    this.pose('chop', 'hands', CHOP_COOLDOWN + 0.28);
    streamer.rebuildTile(tile);
    audio.playEvent('gatherSoft');
    if (result.felled) {
      const spawned = spawnTreeWoodDrops(tile, this.nextDropId, this.groundRadiusAt(tile), WOOD_PER_TREE);
      this.nextDropId = spawned.nextId;
      this.drops = [...this.drops, ...spawned.drops];
      this.d.drops.setDrops(this.drops);
      hud.flash(`tree felled · ${WOOD_PER_TREE} wood dropped`, 2.6);
    } else {
      const remaining = Math.max(1, Math.ceil(result.remaining));
      hud.flash(`tree cracking · ${remaining} more hit${remaining === 1 ? '' : 's'}`, 1.7);
    }
    this.d.changed();
    return true;
  }

  /** Age drops, despawn stale ones, and collect the ready ones around the player. */
  tickDrops(dt: number): void {
    if (this.drops.length === 0) return;
    const { geo, player } = this.d;
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
    const [primary] = [...totals.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = [...totals.values()].reduce((sum, n) => sum + n, 0);
    this.lastPickup = `picked up ${total} ${ITEM_DEFS[primary].name.toLowerCase()}`;
    this.pose('pickup', primary, 0.64);
    this.d.audio.playEvent('gatherSoft');
    const wood = totals.get('wood') ?? 0;
    if (wood > 0 && !this.planeCrafted) {
      if (this.wood >= PLANE_WOOD_COST) this.d.hud.flash(enoughWoodHint(this.d.device(), this.wood), 4);
      else {
        const treesLeft = Math.ceil((PLANE_WOOD_COST - this.wood) / WOOD_PER_TREE);
        this.d.hud.flash(`picked up +${wood} wood · ${this.wood}/${PLANE_WOOD_COST} for plane · ${treesLeft} tree${treesLeft === 1 ? '' : 's'} left`, 3);
      }
      return;
    }
    this.d.hud.flash(this.lastPickup, 2.4);
  }

  craftingRows(): CraftingRecipeView[] {
    return RECIPES.map((recipe) => {
      const status = recipeStatus(recipe, this.inventory);
      const built = recipe.result === 'planeFrame' && this.planeCrafted;
      return {
        id: recipe.id,
        name: recipe.name,
        description: built ? `Plane built. ${planeKeyLabel(this.d.device())} boards or stows it.` : recipe.description,
        canCraft: status.canCraft && !built,
        requirements: status.requirements.map((req) => ({ name: req.name, need: req.need, have: req.have })),
      };
    });
  }

  craft(recipeId: string): boolean {
    const { hud, audio } = this.d;
    if (recipeId === 'plane_frame' && this.planeCrafted) {
      audio.playEvent('uiDeny');
      hud.flash(`plane already crafted · ${planeKeyLabel(this.d.device())} boards`, 2.5);
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
    hud.flash(`crafted ${result.recipe.name.toLowerCase()} · ${planeKeyLabel(this.d.device())} boards`, 4);
    audio.playEvent('craftConfirm');
    this.pose('craft', result.recipe.result, 0.65);
    this.d.changed();
    return true;
  }

  /** E / plane button: stow if flying, else craft-if-needed and board. */
  planeButton(): void {
    const { player, hud, audio } = this.d;
    if (player.mode === 'plane') {
      player.exitPlane();
      audio.playEvent('uiConfirm');
      hud.flash('plane stowed', 2);
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
      hud.flash("can't take off from water", 2.5);
      return;
    }
    audio.playEvent('structurePlace');
    hud.flash(boardedHint(this.d.device(), justCrafted), justCrafted ? 6 : 3);
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
      held: this.wood > 0 ? 'wood' : 'hands',
      actionT: 0,
      actionDuration: 0,
    };
  }
}
