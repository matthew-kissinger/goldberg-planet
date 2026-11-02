import { describe, expect, it } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildLayers } from '../src/world/layers';
import { Terrain } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { Trees } from '../src/world/trees';
import { Player } from '../src/player/player';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import {
  SAVE_VERSION,
  applyChoppedTrees,
  applyPlanetDeltaSave,
  applyPlayerSave,
  applyTreeChopProgress,
  captureWorldSave,
  parseWorldSaveJson,
  saveSlotKey,
  serializeTreeChopProgress,
} from '../src/sim/save';

describe('save boundary', () => {
  const geo = new Goldberg(8);
  const layers = buildLayers();

  function world(seed = 'save-cycle'): { trees: Trees; player: Player } {
    const terrain = new Terrain(seed);
    const columns = new Columns(geo, layers, terrain);
    const trees = new Trees(geo, columns, terrain, seed);
    const player = new Player(geo, layers, columns);
    player.spawnAt(100);
    return { trees, player };
  }

  it('preserves Survival vitals on reload while accepting older saves without them', () => {
    const a = world();
    Object.assign(a.player, { health: 37, hunger: 21, suitShield: 9 });
    const saved = captureWorldSave({ seed: 'save-cycle', frequency: geo.m, player: a.player, trees: a.trees, inventory: {}, planeCrafted: false });
    const parsed = parseWorldSaveJson(JSON.stringify(saved))!;
    const b = world();
    expect(applyPlayerSave(b.player, parsed.player, geo.count)).toBe(true);
    expect([b.player.health,b.player.hunger,b.player.suitShield]).toEqual([37,21,9]);
    delete parsed.player.health; delete parsed.player.hunger; delete parsed.player.suitShield;
    const legacy = world();
    const defaults = [legacy.player.health,legacy.player.hunger,legacy.player.suitShield];
    expect(applyPlayerSave(legacy.player, parsed.player, geo.count)).toBe(true);
    expect([legacy.player.health,legacy.player.hunger,legacy.player.suitShield]).toEqual(defaults);
  });

  it('round-trips chopped trees, chop progress, inventory, drops, plane unlock, and player state', () => {
    const a = world();
    let treeTile = -1;
    let partialTreeTile = -1;
    for (let id = 0; id < geo.count; id++) {
      if (!a.trees.hasTree(id)) continue;
      if (treeTile < 0) treeTile = id;
      else { partialTreeTile = id; break; }
    }
    expect(treeTile).toBeGreaterThanOrEqual(0);
    expect(partialTreeTile).toBeGreaterThanOrEqual(0);
    expect(a.trees.chop(treeTile)).toBe(true);
    expect(a.trees.strike(partialTreeTile, 1.5).felled).toBe(false);

    a.player.px += 3.2;
    a.player.py += 1.1;
    a.player.vx = 2;
    a.player.vy = -0.5;
    a.player.fwdX = 0.4;
    a.player.fwdY = 0.2;
    a.player.fwdZ = 0.9;
    a.player.mode = 'plane';
    a.player.throttle = 63;
    a.player.holdAGL = 44;
    a.player.planeSpeed = 58;
    a.player.reorthonormalize();

    const drop = { id: 7, item: 'wood' as const, count: 2, tile: partialTreeTile, offsetA: 0.1, offsetB: -0.2, groundRadius: 903.75, age: 0.5 };
    const save = captureWorldSave({
      seed: 'save-cycle',
      frequency: geo.m,
      player: a.player,
      trees: a.trees,
      inventory: { wood: 4, planeFrame: 1 },
      drops: [drop],
      planeCrafted: true,
      savedAt: 123,
    });
    const parsed = parseWorldSaveJson(JSON.stringify(save));
    expect(parsed).not.toBeNull();

    const b = world();
    applyChoppedTrees(b.trees, parsed!.choppedTrees, geo.count);
    applyTreeChopProgress(b.trees, parsed!.treeChopProgress, geo.count);
    expect(applyPlayerSave(b.player, parsed!.player, geo.count)).toBe(true);

    expect(b.trees.chopped.has(treeTile)).toBe(true);
    expect(b.trees.hasTree(treeTile)).toBe(false);
    expect(b.trees.chopProgress.get(partialTreeTile)).toBe(1.5);
    expect(parsed!.drops).toEqual([drop]);
    expect(parsed!.inventory).toEqual({ wood: 4, planeFrame: 1 });
    expect(parsed!.planeCrafted).toBe(true);
    expect(b.player.mode).toBe('plane');
    expect(b.player.throttle).toBe(63);
    expect(b.player.holdAGL).toBe(44);
    expect(b.player.planeSpeed).toBe(58);
    expect(b.player.radius()).toBeCloseTo(a.player.radius(), 8);
  });

  it('restores planted-tree damage after seeds and terrain edits on Aurelia and worlds-v3', () => {
    const configs = buildSolarSystemConfigs('saved-planted-damage');
    for (const index of [0, 1]) {
      const config = configs[index], planetLayers = buildLayers(config);
      const fresh = () => {
        const terrain = new Terrain(config), columns = new Columns(geo, planetLayers, terrain);
        const trees = new Trees(geo, columns, terrain, config.seed);
        return { columns, trees, player: new Player(geo, planetLayers, columns), drops: [] };
      };
      const source = fresh(), planted: number[] = [];
      for (let tile = 0; tile < geo.count && planted.length < 3; tile++) {
        if (source.trees.hasTree(tile)) continue;
        source.columns.seedEcosystem(tile, false);
        if (source.trees.hasTree(tile)) planted.push(tile);
      }
      expect(planted).toHaveLength(3);
      source.player.spawnAt(planted[0]);
      expect(source.trees.strike(planted[0], 1.5).felled).toBe(false);
      expect(source.trees.chop(planted[1])).toBe(true);
      expect(source.columns.mine(planted[2], source.columns.topLayerOf(planted[2]))).toBe(true);
      const saved = captureWorldSave({ seed: config.seed, frequency: geo.m, player: source.player,
        trees: source.trees, inventory: {}, planeCrafted: false, planetDeltas: { [config.id]: {
          choppedTrees: [...source.trees.chopped], treeChopProgress: [
            ...serializeTreeChopProgress(source.trees),
            // A stale damage record must not resurrect a tree whose ground was mined.
            { tile: planted[2], progress: 1 },
          ], columnEdits: source.columns.exportEdits(), seededEcoTiles: [...source.columns.seededEcoTiles], drops: [],
        } } });
      const parsed = parseWorldSaveJson(JSON.stringify(saved))!;
      const restored = fresh();
      expect(restored.trees.hasTree(planted[0])).toBe(false);
      applyPlanetDeltaSave(restored, parsed.planetDeltas![config.id], geo.count);
      expect(restored.trees.hasTree(planted[0])).toBe(true);
      expect(restored.trees.chopProgress.get(planted[0])).toBe(1.5);
      expect(restored.trees.hasTree(planted[1])).toBe(false);
      expect(restored.trees.chopped.has(planted[1])).toBe(true);
      expect(restored.columns.editOf(planted[2])).toBeDefined();
      expect(restored.trees.hasTree(planted[2])).toBe(false);
      expect(restored.trees.chopProgress.has(planted[2])).toBe(false);
    }
  });

  it('rejects malformed and older saves', () => {
    const { player, trees } = world('save-order');
    const good = captureWorldSave({ seed: 's', frequency: geo.m, player, trees, inventory: {}, planeCrafted: false, savedAt: 1 });
    expect(parseWorldSaveJson(JSON.stringify(good))).not.toBeNull();
    expect(parseWorldSaveJson('not json')).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, version: SAVE_VERSION - 1 }))).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, choppedTrees: ['x'] }))).toBeNull();
    expect(parseWorldSaveJson(JSON.stringify({ ...good, player: { ...good.player, mode: 'swim' } }))).toBeNull();
  });

  it('drops unknown items from a saved inventory instead of rejecting the save', () => {
    const { player, trees } = world('save-items');
    const save = captureWorldSave({ seed: 's', frequency: geo.m, player, trees, inventory: { wood: 3 }, planeCrafted: false, savedAt: 1 });
    const parsed = parseWorldSaveJson(JSON.stringify({ ...save, inventory: { wood: 3, rock: 9, berries: 2 } }));
    expect(parsed!.inventory).toEqual({ wood: 3 });
  });

  it('keys save slots by version, frequency, and escaped seed', () => {
    expect(saveSlotKey('A B', 8)).toBe(`goldberg-planet:v${SAVE_VERSION}:m8:A%20B`);
  });

  it('round-trips optional mode, journal, appearance and fauna without retaining live object references', () => {
    const { player, trees } = world();
    const journal = { version: 1 as const, visited: ['shore-camp'], observedSpecies: ['grazer'] };
    const appearance = { version: 1 as const, outfit: 'moss', stature: 0.98 };
    const fauna = { version: 1 as const, seed: 'save-cycle', residents: [{ id: 'grazer-1', hp: 0, familiarity: 0.7, observed: true, feedCount: 2, feedCooldown: 18,
      position: [901, 0, 0] as [number, number, number], forward: [0, 0, 1] as [number, number, number] }] };
    const captured = captureWorldSave({ seed: 'save-cycle', frequency: geo.m, player, trees, inventory: {}, planeCrafted: false,
      mode: 'creative', journal, appearance, faunaByPlanet: { 'planet-0': fauna } });
    journal.visited.push('elsewhere'); appearance.stature = 1.05; fauna.residents[0].hp = 50;
    const parsed = parseWorldSaveJson(JSON.stringify(captured))!;
    expect(parsed.mode).toBe('creative');
    expect(parsed.journal).toEqual({ version: 1, visited: ['shore-camp'], observedSpecies: ['grazer'] });
    expect(parsed.appearance).toEqual({ version: 1, outfit: 'moss', stature: 0.98 });
    expect(parsed.faunaByPlanet!['planet-0'].residents[0]).toMatchObject({ hp: 0, familiarity: 0.7, feedCooldown: 18 });
  });

  it('drops malformed optional state while preserving a valid core save and older optional-free saves', () => {
    const { player, trees } = world();
    const captured = captureWorldSave({ seed: 'save-cycle', frequency: geo.m, player, trees, inventory: {}, planeCrafted: false });
    expect(parseWorldSaveJson(JSON.stringify(captured))).toEqual(captured);
    const parsed = parseWorldSaveJson(JSON.stringify({ ...captured, mode: 'godmode', journal: { version: 9 }, appearance: ['bad'],
      faunaByPlanet: { 'planet-0': { version: 1, seed: 'save-cycle', residents: [{ id: 'bad', hp: 'full' }] } } }))!;
    expect(parsed.mode).toBeUndefined(); expect(parsed.journal).toBeUndefined(); expect(parsed.appearance).toBeUndefined();
    expect(parsed.faunaByPlanet!['planet-0'].residents).toEqual([]);
    const invalid = captureWorldSave({ seed: 'save-cycle', frequency: geo.m, player, trees, inventory: {}, planeCrafted: false,
      appearance: { version: 1, stature: Infinity } });
    expect(invalid.appearance).toBeUndefined();
  });
});
