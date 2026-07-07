import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { CaveMouthRenderer } from '../src/render/caveMouths';
import type { CaveMouthSkinProvider, KilnCaveMouthSkinSlug, KilnCaveMouthSkinTemplate } from '../src/render/kilnAssets';
import { caveMouthSignals, nearestCaveMouthSignal, type CaveMouthColumns } from '../src/sim/caveMouths';
import type { NaturalVoidKind } from '../src/world/caves';

function columnsWith(samples: Record<number, { kind: NaturalVoidKind; start: number; end: number; depth: number; flooded?: boolean; spring?: boolean }>): CaveMouthColumns {
  return {
    topLayerOf: () => 4,
    naturalVoidAt: (tile, layer) => {
      const sample = samples[tile];
      if (!sample || layer < sample.start || layer > sample.end) return null;
      return {
        kind: sample.kind,
        depth: sample.depth,
        flooded: sample.flooded === true,
        spring: sample.spring === true,
      };
    },
  };
}

function fakeSkin(slug: KilnCaveMouthSkinSlug, kind: NaturalVoidKind): KilnCaveMouthSkinTemplate {
  const template = new THREE.Group();
  template.name = `fake-template-${slug}`;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  body.name = `fake-glb-body-${slug}`;
  template.add(body);
  const fit = {
    slug,
    kind,
    socketRole: 'cave-mouth-dressing' as const,
    sourceBboxSize: [1, 1, 1],
    runtimeSourceBboxSize: [1, 1, 1],
    orientedSourceBboxSize: [1, 1, 1],
    normalizedBboxSize: [1, 1, 1],
    normalizePolicy: 'center-xz-bottom-y-fit-footprint-height' as const,
    orientation: {
      policy: 'preserve-y-up-x-front-to-z' as const,
      sourceUpAxis: 'y' as const,
      sourceForwardAxis: '+x' as const,
      axisCorrection: [0, -1.570796, 0] as [number, number, number],
    },
    animationPolicy: 'static-glb-with-procedural-route-overlays' as const,
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    sourceMeshCount: 1,
    materialCount: 1,
    targetFootprint: 2,
    targetHeight: 1,
    acceptanceNote: 'test cave mouth skin',
  };
  return {
    slug,
    kind,
    manifest: { slug, status: 'ready', file: `models/${slug}.glb` },
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    template,
    fit,
  };
}

function fakeSkinProvider(): CaveMouthSkinProvider {
  return {
    createCaveMouthSkinTemplate: async (slug) => fakeSkin(slug, slug === 'cave-mouth-arch' ? 'arch' : slug === 'cave-mouth-sea' ? 'seaCave' : 'dryCave'),
  };
}

describe('Hearth and Horizon cave mouth signals', () => {
  it('turns real natural void clearance into routeable cave mouth signals', () => {
    const signals = caveMouthSignals(columnsWith({
      2: { kind: 'arch', start: 7, end: 9, depth: 3.4 },
      3: { kind: 'dryCave', start: 8, end: 12, depth: 13.2 },
      4: { kind: 'seaCave', start: 6, end: 8, depth: 5.1, flooded: true },
    }), [
      { tile: 2, ring: 1 },
      { tile: 3, ring: 1 },
      { tile: 4, ring: 2 },
    ]);

    expect(signals.map((signal) => signal.label)).toEqual(['dry cave mouth', 'land arch', 'sea-cave mouth']);
    expect(signals[0]).toMatchObject({
      tile: 3,
      kind: 'dryCave',
      ring: 1,
      clearance: 5,
      ready: true,
      routeHint: 'dry cave entrance for crystals, mushrooms, and darkness pressure',
    });
    expect(signals[2].detail).toContain('flooded');
  });

  it('surfaces sealed spring pockets as distinct dry cave route hints', () => {
    const signals = caveMouthSignals(columnsWith({
      7: { kind: 'dryCave', start: 8, end: 11, depth: 14.4, spring: true },
    }), [{ tile: 7, ring: 0 }]);

    expect(signals[0]).toMatchObject({
      tile: 7,
      kind: 'dryCave',
      label: 'spring cave mouth',
      spring: true,
      routeHint: 'sealed freshwater seep for inland cisterns and cave camps',
    });
    expect(signals[0].detail).toContain('spring seep');
  });

  it('ignores tiny cracks and returns the nearest ranked mouth', () => {
    const signals = caveMouthSignals(columnsWith({
      5: { kind: 'dryCave', start: 6, end: 6, depth: 14 },
      6: { kind: 'seaCave', start: 8, end: 10, depth: 7, flooded: true },
    }), [
      { tile: 5, ring: 0 },
      { tile: 6, ring: 2 },
    ]);

    expect(signals).toHaveLength(1);
    expect(nearestCaveMouthSignal(signals)).toMatchObject({ tile: 6, label: 'sea-cave mouth' });
    expect(nearestCaveMouthSignal([])).toBeNull();
  });

  it('keeps carved cave overlays as a fallback, not collectible-looking cairns', () => {
    const scene = new THREE.Scene();
    const renderer = new CaveMouthRenderer(scene);
    const mouths = caveMouthSignals(columnsWith({
      2: { kind: 'arch', start: 7, end: 9, depth: 3.4 },
      3: { kind: 'dryCave', start: 8, end: 12, depth: 13.2, spring: true },
      4: { kind: 'seaCave', start: 6, end: 8, depth: 5.1, flooded: true },
    }), [
      { tile: 2, ring: 1 },
      { tile: 3, ring: 1 },
      { tile: 4, ring: 2 },
    ]);

    renderer.setMouths(mouths);
    const names = new Set<string>();
    const roles = new Set<string>();
    renderer.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) names.add(part.name);
      if (typeof part.userData.caveMouthDressingRole === 'string') roles.add(part.userData.caveMouthDressingRole);
    });

    expect([...names]).toEqual(expect.arrayContaining([
      'mouthTerrainCut',
      'mouthTerrainLip',
      'mouthRecessShadow',
      'mouthRouteGlyph',
      'mouthTideLine',
      'mouthSpringSeep',
      'mouthTerrainArchRib',
    ]));
    expect(names.has('mouthCairnStone')).toBe(false);
    expect(names.has('mouthGlow')).toBe(false);
    expect(names.has('mouthGlyph')).toBe(false);
    expect([...roles]).toEqual(expect.arrayContaining([
      'shadowed carved void',
      'terrain lip',
      'recess into carved terrain',
      'low dry-cave route glyph',
      'low tide line',
    ]));
    expect(renderer.stats()).toMatchObject({
      groups: 3,
      terrainDressing: 3,
      standingMarkers: 0,
      visualPolicy: 'glb-skin-over-carved-void',
      kilnCaveMouthGlbs: ['cave-mouth-arch', 'cave-mouth-dry', 'cave-mouth-sea'],
      kilnCaveMouthSkinsLoaded: 0,
      kilnCaveMouthSkinFallbacks: 3,
    });
  });

  it('wires cave-mouth GLB skins over the carved cave signals', async () => {
    const scene = new THREE.Scene();
    const renderer = new CaveMouthRenderer(scene, fakeSkinProvider());
    const mouths = caveMouthSignals(columnsWith({
      2: { kind: 'arch', start: 7, end: 9, depth: 3.4 },
      3: { kind: 'dryCave', start: 8, end: 12, depth: 13.2, spring: true },
      4: { kind: 'seaCave', start: 6, end: 8, depth: 5.1, flooded: true },
    }), [
      { tile: 2, ring: 1 },
      { tile: 3, ring: 1 },
      { tile: 4, ring: 2 },
    ]);

    renderer.setMouths(mouths);
    await Promise.resolve();
    await Promise.resolve();

    const names = new Set<string>();
    renderer.group.traverse((part) => names.add(part.name));

    expect([...names]).toEqual(expect.arrayContaining([
      'kiln-cave-mouth-skin-cave-mouth-arch',
      'kiln-cave-mouth-skin-cave-mouth-dry',
      'kiln-cave-mouth-skin-cave-mouth-sea',
      'mouthRouteGlyph',
      'mouthTideLine',
      'mouthSpringSeep',
    ]));
    expect(renderer.stats()).toMatchObject({
      groups: 3,
      visualPolicy: 'glb-skin-over-carved-void',
      kilnCaveMouthSkinsLoaded: 3,
      kilnCaveMouthSkinsPending: 0,
      kilnCaveMouthSkinFallbacks: 0,
      kilnCaveMouthGlbVisible: 3,
      proceduralFallbackVisible: 0,
      kilnCaveMouthSkinsBySlug: {
        'cave-mouth-arch': 1,
        'cave-mouth-dry': 1,
        'cave-mouth-sea': 1,
      },
    });
  });
});
