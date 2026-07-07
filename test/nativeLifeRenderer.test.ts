import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { NativeLifeRenderer } from '../src/render/nativeLife';
import type {
  CreatureSkinProvider,
  KilnCreatureSkinSlug,
  KilnCreatureSkinTemplate,
} from '../src/render/kilnAssets';
import type { NativeCreatureKind, NativeCreatureSite, NativeCreatureTemperament } from '../src/sim/nativeLife';
import { buildLayers } from '../src/world/layers';
import { Columns } from '../src/world/columns';
import { Terrain } from '../src/world/terrain';

const KILN_SLUG_BY_KIND: Record<NativeCreatureKind, KilnCreatureSkinSlug> = {
  mossPuff: 'creature-moss-puff',
  brambleback: 'creature-brambleback',
  shellSkitter: 'creature-shell-skitter',
  reedbackGrazer: 'creature-reedback-grazer',
  caveBelljaw: 'creature-cave-belljaw',
  caveBlinker: 'creature-cave-blinker',
  screeSnapper: 'creature-scree-snapper',
  stormBurr: 'creature-storm-burr',
  tideLurker: 'creature-tide-lurker',
};

const KIND_BY_KILN_SLUG = Object.fromEntries(
  Object.entries(KILN_SLUG_BY_KIND).map(([kind, slug]) => [slug, kind as NativeCreatureKind]),
) as Record<KilnCreatureSkinSlug, NativeCreatureKind>;

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

function template(slug: KilnCreatureSkinSlug): KilnCreatureSkinTemplate {
  const kind = KIND_BY_KILN_SLUG[slug];
  const root = new THREE.Group();
  root.name = `fake-template-${slug}`;
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.6, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x8cc06c }),
  ));
  return {
    slug,
    kind,
    manifest: {
      slug,
      status: 'ready',
      file: `models/${slug}.glb`,
      geometry: { materialCount: 1, meshCount: 1 },
      animations: [
        { name: 'idle', channels: 2, durationSec: 1.2 },
        { name: 'walk', channels: 4, durationSec: 0.8 },
      ],
    },
    sourceUrl: `/assets/kiln/models/${slug}.glb`,
    template: root,
    clips: [
      new THREE.AnimationClip('idle', 1.2, []),
      new THREE.AnimationClip('walk', 0.8, []),
    ],
    fit: {
      slug,
      kind,
      socketRole: 'native-creature-body',
      sourceBboxSize: [0.4, 0.6, 0.4],
      runtimeSourceBboxSize: [0.4, 0.6, 0.4],
      normalizedBboxSize: [0.4, 0.6, 0.4],
      normalizePolicy: 'center-xz-bottom-y-fit-height',
      animationPolicy: 'mixer-near-freeze-far',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      sourceMeshCount: 1,
      materialCount: 1,
      animationClips: [
        { name: 'idle', channels: 2, durationSec: 1.2 },
        { name: 'walk', channels: 4, durationSec: 0.8 },
      ],
      activeMixerRadius: 90,
      lowRateMixerRadius: 135,
      frozenMixerRadius: 180,
      acceptanceNote: 'fake creature template',
    },
  };
}

class FakeCreatureSkins implements CreatureSkinProvider {
  readonly requested: KilnCreatureSkinSlug[] = [];

  async createCreatureSkinTemplate(slug: KilnCreatureSkinSlug): Promise<KilnCreatureSkinTemplate | null> {
    this.requested.push(slug);
    return template(slug);
  }
}

async function flushSkinPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function fixtureWorld() {
  const geo = new Goldberg(8);
  const layers = buildLayers();
  const terrain = new Terrain('native-life-renderer');
  const columns = new Columns(geo, layers, terrain);
  return { geo, layers, columns };
}

function cameraAtTile(geo: Goldberg, layers: ReturnType<typeof buildLayers>, columns: Columns, tile: number): { x: number; y: number; z: number } {
  const c = geo.centers;
  const radius = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
  return {
    x: c[tile * 3] * radius,
    y: c[tile * 3 + 1] * radius,
    z: c[tile * 3 + 2] * radius,
  };
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

  it('loads approved Kiln creature bodies and distance-gates AnimationMixer playback', async () => {
    const scene = new THREE.Scene();
    const provider = new FakeCreatureSkins();
    const renderer = new NativeLifeRenderer(scene, provider);
    const sites = [
      site('mossPuff', 1, 'harmless'),
      site('shellSkitter', 2, 'harmless'),
      site('reedbackGrazer', 3, 'harmless'),
      site('caveBlinker', 4, 'harmless'),
      site('brambleback', 5, 'territorial'),
      site('caveBelljaw', 6, 'territorial'),
      site('screeSnapper', 7, 'combative'),
      site('stormBurr', 8, 'territorial'),
      site('tideLurker', 9, 'territorial'),
    ];
    const { geo, layers, columns } = fixtureWorld();

    renderer.setSites(sites);
    await flushSkinPromises();
    renderer.setSites(sites);
    renderer.update(sites, geo, layers, columns, { x: 0, y: 0, z: 0 }, 1.4);
    const farStats = renderer.stats();

    expect(new Set(provider.requested)).toEqual(new Set(Object.values(KILN_SLUG_BY_KIND)));
    expect(farStats.kilnCreatureSkinsLoaded).toBe(9);
    expect(farStats.kilnCreatureSkinsPending).toBe(0);
    expect(farStats.kilnCreatureSkinFallbacks).toBe(0);
    expect(farStats.activeMixers).toBe(0);
    expect(farStats.hiddenCreatureSkins).toBe(9);
    expect(farStats.kilnCreatureGlbVisible).toBe(0);
    expect(farStats.proceduralCreatureFallbackVisible).toBe(0);
    expect(farStats.kilnCreatureSkinsBySlug['creature-brambleback']).toMatchObject({
      loaded: 1,
      glbVisible: 0,
      clips: ['idle', 'walk'],
    });
    expect(farStats.kilnCreatureSkinFits['creature-tide-lurker']).toMatchObject({
      animationPolicy: 'mixer-near-freeze-far',
      activeMixerRadius: 90,
      lowRateMixerRadius: 135,
      frozenMixerRadius: 180,
    });

    const nearSite = sites[0];
    renderer.setSites([nearSite]);
    await flushSkinPromises();
    renderer.update([nearSite], geo, layers, columns, cameraAtTile(geo, layers, columns, nearSite.tile), 1.6);
    const nearStats = renderer.stats();

    expect(nearStats.kilnCreatureSkinsLoaded).toBe(1);
    expect(nearStats.activeMixers).toBe(1);
    expect(nearStats.hiddenCreatureSkins).toBe(0);
    expect(nearStats.kilnCreatureGlbVisible).toBe(1);
    expect(nearStats.kilnCreatureSkinsBySlug['creature-moss-puff']).toMatchObject({ loaded: 1, activeMixers: 1, glbVisible: 1 });

    const cam = cameraAtTile(geo, layers, columns, nearSite.tile);
    renderer.update([nearSite], geo, layers, columns, { x: cam.x + 112, y: cam.y, z: cam.z }, 1.9);
    const lowRateStats = renderer.stats();
    expect(lowRateStats.activeMixers).toBe(0);
    expect(lowRateStats.lowRateMixers).toBe(1);
  });
});
