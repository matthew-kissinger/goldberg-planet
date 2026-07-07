import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { SeasonAfterglowRenderer } from '../src/render/seasonAfterglow';
import type { StrangerSeasonAfterglow } from '../src/sim/eventSeasons';

function meshNames(renderer: SeasonAfterglowRenderer): Set<string> {
  const names = new Set<string>();
  renderer.group.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) names.add(part.name);
  });
  return names;
}

function fixture(read = false): StrangerSeasonAfterglow {
  return {
    id: 42,
    key: '0:0:42',
    tile: 42,
    label: 'orange fall line afterglow',
    detail: 'fall claimed + 3/3 notes resolved at emberfall crater',
    note: 'the fall and three murmurs hold one remembered path',
    routeHint: 'read the crater echo before the window fades',
    read,
    focusMinutes: 420,
    stamina: 12,
    exposureRelief: 8,
  };
}

describe('season afterglow renderer asset readability', () => {
  it('uses a low chord-ring, memory shells, and focus beam instead of a shard gate', () => {
    const scene = new THREE.Scene();
    const renderer = new SeasonAfterglowRenderer(scene);
    renderer.setAfterglow(fixture());

    expect(renderer.stats()).toMatchObject({ groups: 1, active: 1 });
    expect(renderer.stats().meshes).toBeGreaterThanOrEqual(18);
    expect([...meshNames(renderer)]).toEqual(expect.arrayContaining([
      'afterglowReadingRing',
      'afterglowChordMark',
      'afterglowChordPost',
      'afterglowMemoryShell',
      'afterglowChordHeart',
      'afterglowFocusBeam',
      'afterglowMote0',
    ]));

    renderer.setAfterglow(fixture(true));
    expect(renderer.stats()).toMatchObject({ groups: 0, active: 0 });
  });
});
