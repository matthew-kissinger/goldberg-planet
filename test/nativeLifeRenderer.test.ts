import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { NativeLifeRenderer } from '../src/render/nativeLife';
import type { NativeCreatureKind, NativeCreatureSite, NativeCreatureTemperament } from '../src/sim/nativeLife';

function site(kind: NativeCreatureKind, id: number, temperament: NativeCreatureTemperament): NativeCreatureSite {
  return {
    id,
    kind,
    tile: id,
    slot: id % 4,
    label: kind,
    detail: `${kind} renderer fixture`,
    temperament,
    reward: { item: kind === 'tideLurker' ? 'rawFish' : kind === 'caveBelljaw' ? 'glowCrystal' : kind === 'screeSnapper' ? 'rock' : 'reeds', count: 1, label: 'fixture reward' },
    tended: false,
    warded: false,
    hint: 'renderer fixture hint',
    pressure: temperament === 'harmless' ? undefined : { stamina: 1, exposure: 1, interval: 2, radiusRings: 1, label: `${kind} pressure` },
    combat: kind === 'screeSnapper' || kind === 'stormBurr' || kind === 'tideLurker'
      ? { telegraph: 'fixture telegraph', weakness: 'fixture weakness', result: 'fixture result' }
      : undefined,
  };
}

function telegraphRolesForKind(renderer: NativeLifeRenderer, kind: NativeCreatureKind): Set<string> {
  const roles = new Set<string>();
  for (const child of renderer.group.children) {
    if (!child.name.startsWith(`native-${kind}-`)) continue;
    child.traverse((part) => {
      const role = part.userData.nativeTelegraphRole;
      if (typeof role === 'string') roles.add(role);
    });
  }
  return roles;
}

function meshNamesForKind(renderer: NativeLifeRenderer, kind: NativeCreatureKind): Set<string> {
  const names = new Set<string>();
  for (const child of renderer.group.children) {
    if (!child.name.startsWith(`native-${kind}-`)) continue;
    child.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) names.add(part.name);
    });
  }
  return names;
}

describe('native life renderer asset readability', () => {
  it('exposes distinct silhouettes and telegraph roles for planet-native hazards', () => {
    const scene = new THREE.Scene();
    const renderer = new NativeLifeRenderer(scene);
    renderer.setSites([
      site('mossPuff', 1, 'harmless'),
      site('shellSkitter', 2, 'harmless'),
      site('reedbackGrazer', 3, 'harmless'),
      site('caveBlinker', 4, 'harmless'),
      site('brambleback', 5, 'territorial'),
      site('caveBelljaw', 6, 'territorial'),
      site('screeSnapper', 7, 'combative'),
      site('stormBurr', 8, 'territorial'),
      site('tideLurker', 9, 'territorial'),
    ]);
    const stats = renderer.stats();

    expect(stats.groups).toBe(9);
    expect(stats.kinds).toBe(9);
    expect(stats.silhouettes).toBe(9);
    expect(stats.hazards).toBe(5);
    expect(stats.telegraphRoles).toBeGreaterThanOrEqual(11);
    expect(stats.telegraphMeshes).toBeGreaterThanOrEqual(20);

    expect([...telegraphRolesForKind(renderer, 'brambleback')]).toEqual(expect.arrayContaining(['bristle crowding ring']));
    expect([...telegraphRolesForKind(renderer, 'caveBelljaw')]).toEqual(expect.arrayContaining(['hinged cave jaw lift', 'glow clap warning ring']));
    expect([...telegraphRolesForKind(renderer, 'screeSnapper')]).toEqual(expect.arrayContaining(['lifting scree jaw plates', 'mining-noise snap ring']));
    expect([...telegraphRolesForKind(renderer, 'stormBurr')]).toEqual(expect.arrayContaining(['flattening storm quills', 'directional gust arc']));
    expect([...telegraphRolesForKind(renderer, 'tideLurker')]).toEqual(expect.arrayContaining(['rising tide eye bulbs', 'cupped water splash arc']));
    expect([...telegraphRolesForKind(renderer, 'caveBlinker')]).toEqual(expect.arrayContaining(['blink rhythm focus ring']));

    expect([...meshNamesForKind(renderer, 'brambleback')]).toEqual(expect.arrayContaining(['brambleQuill', 'brambleHorn']));
    expect([...meshNamesForKind(renderer, 'caveBelljaw')]).toEqual(expect.arrayContaining(['belljawUpperShell', 'belljawGlowTongue']));
    expect([...meshNamesForKind(renderer, 'screeSnapper')]).toEqual(expect.arrayContaining(['snapperJawPlate', 'snapperBackShard']));
    expect([...meshNamesForKind(renderer, 'stormBurr')]).toEqual(expect.arrayContaining(['stormBurrQuill', 'stormBurrWindArc']));
    expect([...meshNamesForKind(renderer, 'tideLurker')]).toEqual(expect.arrayContaining(['tideLurkerEyeBulb', 'tideLurkerSplashArc']));
  });
});
