import { Color, type BufferGeometry, type Object3D, type SkinnedMesh } from 'three/webgpu';

/** Portable module IDs survive save/load and can be extended by the offline author. */
export interface ExplorerAppearance {
  version: 1;
  outfit: 'field' | 'reed' | 'ochre' | 'night';
  hair: 'short' | 'bun' | 'braid';
  headgear: 'none' | 'hat' | 'hood';
  pack: 'pack' | 'satchel' | 'none';
  skin: 'warm' | 'deep' | 'light';
  hairColor: 'brown' | 'black' | 'silver' | 'copper';
  stature: number;
}
export const DEFAULT_APPEARANCE: ExplorerAppearance = { version: 1, outfit: 'field', hair: 'bun', headgear: 'none', pack: 'pack', skin: 'warm', hairColor: 'brown', stature: 1 };
const allowed = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => values.includes(value as T) ? value as T : fallback;
export function normalizeAppearance(value: unknown): ExplorerAppearance {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<ExplorerAppearance>;
  return { version: 1, outfit: allowed(v.outfit, ['field','reed','ochre','night'], 'field'),
    hair: allowed(v.hair, ['short','bun','braid'], 'bun'), headgear: allowed(v.headgear, ['none','hat','hood'], 'none'),
    pack: allowed(v.pack, ['pack','satchel','none'], 'pack'), skin: allowed(v.skin, ['warm','deep','light'], 'warm'),
    hairColor: allowed(v.hairColor, ['brown','black','silver','copper'], 'brown'),
    stature: Number.isFinite(v.stature) ? Math.max(.94, Math.min(1.06, v.stature!)) : 1 };
}
const BASE = [0xb8b496,0xe5ddc5,0x657451,0x3c4939,0xb98b3c,0xd4aa56,0x69553e,0x363e39,0x34352f,0xc98f68,0xc78166,0x3f2d26,0x594033,0x242924,0xf2e6cf,0x9a9e8a];
const CLOTH = { field: [0xb8b496,0x657451,0x3c4939,0xb98b3c], reed: [0x8b9e8f,0x415d56,0x2d403b,0xc29c60], ochre: [0xc0a071,0x956444,0x513c32,0xd0b681], night: [0x7d8794,0x434f68,0x2c3548,0xb5a27b] };

/** Recolor only on configuration changes; no per-frame mesh construction or material variants. */
export function applyExplorerAppearance(root: Object3D, appearance: ExplorerAppearance, owned: Set<BufferGeometry>): void {
  root.scale.setScalar(appearance.stature);
  const palette = BASE.slice(), cloth = CLOTH[appearance.outfit];
  [palette[0],palette[2],palette[3],palette[4]] = cloth;
  palette[9] = { warm:0xc98f68, deep:0x76503d, light:0xe4b793 }[appearance.skin];
  palette[10] = new Color(palette[9]).multiplyScalar(.86).getHex();
  palette[11] = { brown:0x3f2d26,black:0x282a2b,silver:0xb2b1a6,copper:0x8c4d2c }[appearance.hairColor];
  palette[12] = new Color(palette[11]).multiplyScalar(1.3).getHex();
  const colors = palette.map(v => new Color(v));
  root.traverse(object => {
    const module = object.name.startsWith('explorerModule_') ? object.name.slice(15) : '';
    if (module) object.visible = (appearance.headgear !== 'hood' && (module === 'hair' || module === appearance.hair))
      || module === appearance.pack || module === appearance.headgear;
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    if (!owned.has(mesh.geometry)) { mesh.geometry = mesh.geometry.clone(); owned.add(mesh.geometry); }
    const slots = mesh.geometry.getAttribute('_palette'), attribute = mesh.geometry.getAttribute('color');
    if (!slots || !attribute) return;
    for (let i=0;i<attribute.count;i++) { const c = colors[slots.getX(i)]; if(c) attribute.setXYZ(i,c.r,c.g,c.b); }
    attribute.needsUpdate = true;
  });
}
