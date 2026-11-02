import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three/webgpu';
import { Character } from '../src/render/character';
import { DEFAULT_APPEARANCE, normalizeAppearance } from '../src/render/explorerKit';
import { explorerFixture } from './explorerFixture';

describe('delivered modular explorer', () => {
  it('binds every authored module to the same articulated bones with valid palette/weights', async () => {
    const character = new Character(new THREE.Scene(), await explorerFixture()); await character.ready;
    const skins: THREE.SkinnedMesh[] = [];
    character.group.traverse(node => { if ((node as THREE.SkinnedMesh).isSkinnedMesh) skins.push(node as THREE.SkinnedMesh); });
    expect(skins).toHaveLength(8);
    expect(skins.filter(skin => skin.name.startsWith('explorerModule_')).map(s => s.name.slice(15)).sort())
      .toEqual(['braid', 'bun', 'hair', 'hat', 'hood', 'pack', 'satchel']);
    for (const skin of skins) {
      expect(skin.skeleton.bones).toEqual(character.rig!.skin.skeleton.bones);
      const slots = skin.geometry.getAttribute('_palette'), weights = skin.geometry.getAttribute('skinWeight'), indices = skin.geometry.getAttribute('skinIndex');
      expect(slots.count).toBe(weights.count);
      for (let i = 0; i < weights.count; i++) {
        let sum = 0;
        for (let lane = 0; lane < 4; lane++) {
          const w = weights.getComponent(i, lane); sum += w;
          expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1);
          expect(indices.getComponent(i, lane)).toBeLessThan(17);
        }
        expect(sum).toBeCloseTo(1, 5);
        expect(slots.getX(i)).toBeGreaterThanOrEqual(0); expect(slots.getX(i)).toBeLessThan(16);
      }
    }
    const disposals = [...new Set(skins.map(skin => skin.skeleton))].map(skeleton => vi.spyOn(skeleton, 'dispose'));
    character.dispose(); character.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('switches real modules and recolors owned attributes without mutating the cached source', async () => {
    const asset = await explorerFixture(), source = asset.scene.getObjectByName('explorerSkin') as THREE.SkinnedMesh;
    const original = source.geometry.getAttribute('color').array.slice();
    const character = new Character(new THREE.Scene(), asset); await character.ready;
    character.setAppearance({ ...DEFAULT_APPEARANCE, outfit: 'night', skin: 'deep', hair: 'braid', headgear: 'hat', pack: 'satchel', stature: 1.06 });
    const visible: string[] = [];
    character.rig!.root.traverse(node => { if (node.name.startsWith('explorerModule_') && node.visible) visible.push(node.name.slice(15)); });
    expect(visible.sort()).toEqual(['braid', 'hair', 'hat', 'satchel']);
    expect(character.rig!.root.scale.y).toBe(1.06);
    expect(character.rig!.skin.geometry.getAttribute('color').array).not.toEqual(original);
    expect(source.geometry.getAttribute('color').array).toEqual(original);
    character.setAppearance({ ...DEFAULT_APPEARANCE, hair: 'braid', headgear: 'hood' });
    expect(character.group.getObjectByName('explorerModule_hood')!.visible).toBe(true);
    expect(character.group.getObjectByName('explorerModule_hair')!.visible).toBe(false);
    expect(character.group.getObjectByName('explorerModule_braid')!.visible).toBe(false);
    expect(character.group.getObjectByName('explorerModule_bun')!.visible).toBe(false);
    const geometry = character.rig!.skin.geometry;
    character.setAppearance(DEFAULT_APPEARANCE);
    expect(character.rig!.skin.geometry).toBe(geometry);
    expect(normalizeAppearance({ stature: Infinity, outfit: 'invalid', hair: 'invalid' })).toMatchObject({ stature: 1, outfit: 'field', hair: 'bun' });
    character.dispose();
  });
});
