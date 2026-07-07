import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { LandmarkRenderer } from '../src/render/landmarks';
import type {
  KilnLandmarkSkinSlug,
  KilnLandmarkSkinTemplate,
  LandmarkSkinProvider,
} from '../src/render/kilnAssets';
import { pentagonTileIds } from '../src/sim/landmarks';

const LANDMARK_SLUGS: readonly KilnLandmarkSkinSlug[] = [
  'shrine-first-hearth',
  'shrine-rainward-gate',
  'shrine-salt-mirror',
  'shrine-high-lantern',
  'shrine-root-vault',
  'shrine-red-cairn',
  'shrine-snow-dial',
  'shrine-glass-shoal',
  'shrine-storm-seat',
  'shrine-reed-crown',
  'shrine-deep-bell',
  'shrine-last-horizon',
];

function visibleNameCount(renderer: LandmarkRenderer, name: string): number {
  let count = 0;
  renderer.group.traverse((child) => {
    if (child.name === name && child.visible) count += 1;
  });
  return count;
}

function namedObject(renderer: LandmarkRenderer, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  renderer.group.traverse((child) => {
    if (child.name === name) found = child;
  });
  return found;
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fakeTemplate(slug: KilnLandmarkSkinSlug): KilnLandmarkSkinTemplate {
  const root = new THREE.Group();
  root.name = `fake-landmark-template-${slug}`;
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({ color: 0x8f7a58 }),
  ));
  return {
    slug,
    kind: 'hearthNiche',
    manifest: {
      slug,
      status: 'ready',
      file: `models/${slug}.glb`,
      geometry: { materialCount: 1, meshCount: 1 },
    },
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    template: root,
    fit: {
      slug,
      kind: 'hearthNiche',
      socketRole: 'pentagon-landmark-shell',
      sourceBboxSize: [2, 2, 2],
      runtimeSourceBboxSize: [2, 2, 2],
      normalizedBboxSize: [2, 2, 2],
      normalizePolicy: 'center-xz-bottom-y-fit-footprint-height',
      orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
      animationPolicy: 'static-shell-with-procedural-threshold-overlays',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      materialCount: 1,
      targetFootprint: 4.6,
      targetHeight: 4.2,
      hiddenGlbNames: [],
      acceptanceNote: 'fake shrine shell',
    },
  };
}

class FakeLandmarkSkins implements LandmarkSkinProvider {
  readonly requested: KilnLandmarkSkinSlug[] = [];

  async createLandmarkSkinTemplate(slug: KilnLandmarkSkinSlug): Promise<KilnLandmarkSkinTemplate | null> {
    this.requested.push(slug);
    return fakeTemplate(slug);
  }
}

class FailingLandmarkSkins implements LandmarkSkinProvider {
  async createLandmarkSkinTemplate(): Promise<KilnLandmarkSkinTemplate | null> {
    return null;
  }
}

describe('landmark renderer asset readability', () => {
  it('builds terrain-first threshold assets with named readability roles', () => {
    const geo = new Goldberg(8);
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, pentagonTileIds(geo));
    const stats = renderer.stats();

    expect(stats.thresholds).toBe(12);
    expect(stats.thresholdMeshes).toBeGreaterThan(40);
    expect(stats.thresholdAssetRoles).toBeGreaterThanOrEqual(12);

    const names = new Set<string>();
    scene.traverse((child) => { if (child.name.startsWith('threshold')) names.add(child.name); });
    expect([...names]).toEqual(expect.arrayContaining([
      'thresholdHearthLintel',
      'thresholdTideRib',
      'thresholdScreeCutWall',
      'thresholdHorizonVane',
    ]));
  });

  it('skins all pentagon landmarks with approved shrine GLBs while preserving live overlays', async () => {
    const geo = new Goldberg(8);
    const scene = new THREE.Scene();
    const provider = new FakeLandmarkSkins();
    const renderer = new LandmarkRenderer(scene, pentagonTileIds(geo), provider);

    await flushSkinPromises();
    const stats = renderer.stats();

    expect(provider.requested).toEqual(LANDMARK_SLUGS);
    expect(stats.kilnLandmarkSkinsLoaded).toBe(12);
    expect(stats.kilnLandmarkSkinFallbacks).toBe(0);
    expect(stats.kilnLandmarkGlbMeshesVisible).toBe(12);
    expect(stats.proceduralLandmarkShellPartsVisible).toBe(0);
    expect(stats.proceduralLandmarkOverlaysVisible).toBeGreaterThanOrEqual(24);
    expect(stats.proceduralThresholdPartsVisible).toBeGreaterThan(40);
    expect(stats.thresholdMeshes).toBeGreaterThan(40);
    expect(visibleNameCount(renderer, 'landscapeApron')).toBe(12);
    expect(visibleNameCount(renderer, 'thresholdHearthLintel')).toBeGreaterThan(0);
    expect(visibleNameCount(renderer, 'thresholdTideRib')).toBeGreaterThan(0);
    expect(visibleNameCount(renderer, 'domainHalo')).toBe(12);
    expect(visibleNameCount(renderer, 'quietCore')).toBe(12);
    expect(namedObject(renderer, 'awakenedOrb')).toBeTruthy();
    expect(namedObject(renderer, 'signalBeam')).toBeTruthy();
    for (const slug of LANDMARK_SLUGS) {
      expect(namedObject(renderer, `kiln-landmark-skin-${slug}`)).toBeTruthy();
      expect(stats.kilnLandmarkSkinsBySlug[slug]).toMatchObject({ loaded: 1, pending: 0, fallback: 0 });
      expect(stats.kilnLandmarkSkinFits[slug]).toMatchObject({
        socketRole: 'pentagon-landmark-shell',
        animationPolicy: 'static-shell-with-procedural-threshold-overlays',
      });
    }
  });

  it('keeps procedural landmark shells visible when shrine skins fall back', async () => {
    const geo = new Goldberg(8);
    const scene = new THREE.Scene();
    const renderer = new LandmarkRenderer(scene, pentagonTileIds(geo), new FailingLandmarkSkins());

    await flushSkinPromises();
    const stats = renderer.stats();

    expect(stats.kilnLandmarkSkinsLoaded).toBe(0);
    expect(stats.kilnLandmarkSkinFallbacks).toBe(12);
    expect(stats.kilnLandmarkGlbMeshesVisible).toBe(0);
    expect(stats.proceduralLandmarkShellPartsVisible).toBeGreaterThan(40);
    expect(visibleNameCount(renderer, 'landscapeApron')).toBe(12);
    expect(visibleNameCount(renderer, 'thresholdHearthLintel')).toBeGreaterThan(0);
    expect(visibleNameCount(renderer, 'domainHalo')).toBe(12);
  });
});
