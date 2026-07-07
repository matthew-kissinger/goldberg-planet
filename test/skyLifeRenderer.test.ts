import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { SkyLifeRenderer, kilnBirdSkinForSite } from '../src/render/skyLife';
import type {
  BirdSkinProvider,
  KilnBirdKind,
  KilnBirdSkinSlug,
  KilnBirdSkinTemplate,
} from '../src/render/kilnAssets';
import type { SkyLifeKind, SkyLifeSite } from '../src/sim/skyLife';
import { buildLayers, WATER_SURFACE } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

const KIND_BY_SLUG: Record<KilnBirdSkinSlug, KilnBirdKind> = {
  'bird-sky-kite': 'sky',
  'bird-shore-gull': 'shore',
  'bird-forest-flutter': 'forest',
  'bird-storm-finch': 'storm',
};

function template(slug: KilnBirdSkinSlug): KilnBirdSkinTemplate {
  const root = new THREE.Group();
  root.name = `fake-template-${slug}`;
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.28),
    new THREE.MeshStandardMaterial({ color: 0xb6d7ff }),
  ));
  const clipNames = ['idle', 'flap', 'glide', 'turn'];
  return {
    slug,
    kind: KIND_BY_SLUG[slug],
    manifest: {
      slug,
      status: 'ready',
      file: `models/${slug}.glb`,
      geometry: { materialCount: 1, meshCount: 1 },
      animations: clipNames.map((name) => ({ name, channels: 2, durationSec: 1 })),
    },
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    template: root,
    clips: clipNames.map((name) => new THREE.AnimationClip(name, 1, [])),
    fit: {
      slug,
      kind: KIND_BY_SLUG[slug],
      socketRole: 'sky-life-body',
      sourceBboxSize: [0.42, 0.16, 0.28],
      runtimeSourceBboxSize: [0.42, 0.16, 0.28],
      normalizedBboxSize: [0.86, 0.33, 0.57],
      normalizePolicy: 'center-xyz-fit-span-preserve-y-up',
      orientation: { policy: 'preserve-y-up', sourceUpAxis: 'y', axisCorrection: [0, 0, 0] },
      animationPolicy: 'single-animated-anchors-plus-point-flock-near-freeze-far',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      materialCount: 1,
      animationClips: clipNames.map((name) => ({ name, channels: 2, durationSec: 1 })),
      activeMixerRadius: 150,
      lowRateMixerRadius: 230,
      frozenMixerRadius: 330,
      acceptanceNote: 'fake bird template',
    },
  };
}

class FakeBirdSkins implements BirdSkinProvider {
  readonly requested: KilnBirdSkinSlug[] = [];

  async createBirdSkinTemplate(slug: KilnBirdSkinSlug): Promise<KilnBirdSkinTemplate | null> {
    this.requested.push(slug);
    return template(slug);
  }
}

function site(kind: SkyLifeKind, tile = 4): SkyLifeSite {
  return {
    id: tile * 100 + (kind === 'storm' ? 1 : kind === 'shore' ? 2 : kind === 'forest' ? 3 : 4),
    tile,
    kind,
    label: `${kind} birds`,
    intensity: 0.75,
    weatherKind: kind === 'storm' ? 'storm' : 'clear',
    weatherLabel: kind === 'storm' ? 'storm front' : 'clear',
    ring: 1,
  };
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fixtureWorld() {
  const geo = new Goldberg(8);
  const layers = buildLayers();
  const terrain = new Terrain('sky-life-renderer');
  const columns = new Columns(geo, layers, terrain);
  return { geo, layers, columns };
}

function cameraAtTile(geo: Goldberg, tile: number, offset = 0): { x: number; y: number; z: number } {
  const c = geo.centers;
  return {
    x: c[tile * 3] * (WATER_SURFACE + 14) + offset,
    y: c[tile * 3 + 1] * (WATER_SURFACE + 14),
    z: c[tile * 3 + 2] * (WATER_SURFACE + 14),
  };
}

describe('sky-life renderer', () => {
  it('maps ambient site kinds to approved bird bodies', () => {
    expect(kilnBirdSkinForSite(site('sky'))).toBe('bird-sky-kite');
    expect(kilnBirdSkinForSite(site('shore'))).toBe('bird-shore-gull');
    expect(kilnBirdSkinForSite(site('forest'))).toBe('bird-forest-flutter');
    expect(kilnBirdSkinForSite(site('storm'))).toBe('bird-storm-finch');
  });

  it('loads GLB bird anchors, point flocks, and distance-gates mixer work', async () => {
    const scene = new THREE.Scene();
    const provider = new FakeBirdSkins();
    const renderer = new SkyLifeRenderer(scene, provider);
    const { geo, layers, columns } = fixtureWorld();
    const sites = [site('sky', 4), site('shore', 5), site('forest', 6), site('storm', 7)];

    renderer.update(sites, geo, layers, columns, cameraAtTile(geo, 4), 1.2);
    await flushSkinPromises();
    renderer.update(sites, geo, layers, columns, cameraAtTile(geo, 4), 1.5);
    const near = renderer.stats();

    expect(provider.requested).toEqual(['bird-sky-kite', 'bird-shore-gull', 'bird-forest-flutter', 'bird-storm-finch']);
    expect(near.active).toBe(1);
    expect(near.kilnBirdSkinsLoaded).toBe(4);
    expect(near.kilnBirdSkinFallbacks).toBe(0);
    expect(near.glbBirds).toBeGreaterThanOrEqual(5);
    expect(near.glbBirdsVisible).toBeGreaterThan(0);
    expect(near.pointFlockSprites).toBeGreaterThan(0);
    expect(near.kilnBirdSkinsBySlug['bird-sky-kite']).toMatchObject({
      loaded: 1,
      clips: ['idle', 'flap', 'glide', 'turn'],
    });
    expect(near.kilnBirdSkinFits['bird-sky-kite']).toMatchObject({
      animationPolicy: 'single-animated-anchors-plus-point-flock-near-freeze-far',
      activeMixerRadius: 150,
      lowRateMixerRadius: 230,
      frozenMixerRadius: 330,
    });

    renderer.update(sites, geo, layers, columns, cameraAtTile(geo, 4, 190), 1.8);
    const low = renderer.stats();
    expect(low.activeMixers).toBe(0);
    expect(low.lowRateMixers).toBeGreaterThan(0);

    renderer.update(sites, geo, layers, columns, cameraAtTile(geo, 4, 430), 2.1);
    const hidden = renderer.stats();
    expect(hidden.active).toBe(0);
    expect(hidden.glbBirdsVisible).toBe(0);
    expect(hidden.pointFlockSprites).toBe(0);
  });
});
