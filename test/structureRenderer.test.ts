import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { Goldberg } from '../src/geo/goldberg';
import { StructureRenderer } from '../src/render/structures';
import type { KilnStructureSkinSlug, StructureSkinProvider } from '../src/render/kilnAssets';
import { structureSocketSpec, type StructureSave, type StructureSocketSpec } from '../src/sim/structures';
import { buildLayers } from '../src/world/layers';

function meshNames(renderer: StructureRenderer): Set<string> {
  const names = new Set<string>();
  renderer.group.traverse((part) => {
    if ((part as THREE.Mesh).isMesh) names.add(part.name);
  });
  return names;
}

function readabilityRoles(renderer: StructureRenderer): Set<string> {
  const roles = new Set<string>();
  renderer.group.traverse((part) => {
    const role = part.userData.structureReadabilityRole;
    if (typeof role === 'string') roles.add(role);
  });
  return roles;
}

function namedObject(renderer: StructureRenderer, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  renderer.group.traverse((part) => {
    if (part.name === name) found = part;
  });
  return found;
}

function previewObject(renderer: StructureRenderer, name: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  renderer.snapPreviewGroup.traverse((part) => {
    if (part.name === name) found = part;
  });
  return found;
}

async function flushAsyncSkinLoads(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

class FakeKilnAssets implements StructureSkinProvider {
  async createStructureSkin(slug: KilnStructureSkinSlug) {
    const object = new THREE.Group();
    object.name = `kiln-skin-${slug}`;
    object.userData.kilnAssetSlug = slug;
    object.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
    const fit = {
      slug,
      item: slug === 'door-kit' ? 'doorKit' : slug === 'window-frame' ? 'windowFrame' : slug === 'roof-bundle' ? 'roofBundle' : 'waystone',
      socketRole: slug === 'door-kit' ? 'wall-opening' : slug === 'window-frame' ? 'wall-light' : slug === 'roof-bundle' ? 'roof-cap' : 'route-marker',
      sourceBboxSize: [1, 1, 1],
      fittedBboxSize: [1, 1, 1],
      scale: 1,
      position: [0, 0, 0] as const,
      rotation: [0, 0, 0] as const,
      loadBearing: 'code-socket' as const,
      glbPolicy: 'decorative-skin-after-normalization' as const,
      instanceability: slug === 'window-frame' ? 'C' : 'B',
      modularKit: slug !== 'waystone',
      acceptanceNote: 'fake normalized decorative skin',
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
    };
    object.userData.kilnSkinFit = fit;
    const hideProceduralNames: Record<KilnStructureSkinSlug, string[]> = {
      waystone: ['waystoneBase', 'waystoneCore', 'waystoneBand'],
      'door-kit': ['leftJamb', 'rightJamb', 'lintel', 'doorSlab', 'knob'],
      'window-frame': ['topRail', 'bottomRail', 'leftRail', 'rightRail', 'glassPane'],
      'roof-bundle': ['leftRoofPlane', 'rightRoofPlane', 'ridgeBeam'],
    };
    return {
      slug,
      object,
      manifest: { slug, status: 'ready' as const, file: `models/${slug}.glb` },
      sourceUrl: `/assets/kiln/models/${slug}.glb`,
      hideProceduralNames: hideProceduralNames[slug],
      fit,
    };
  }

  snapshot() {
    return {
      enabled: ['waystone', 'door-kit', 'window-frame', 'roof-bundle'] as KilnStructureSkinSlug[],
      manifestUrl: '/assets/kiln/ASSET_MANIFEST.json',
      modelRequests: [],
      manifestLoaded: true,
      loaded: ['waystone', 'door-kit', 'window-frame', 'roof-bundle'] as KilnStructureSkinSlug[],
      failed: [],
      structureSkins: {},
    };
  }
}

const HOUSE_PREVIEW_SOCKETS: Record<'doorKit' | 'windowFrame' | 'roofBundle', StructureSocketSpec> = {
  doorKit: {
    item: 'doorKit',
    name: 'Door kit',
    role: 'wall-opening',
    modularKit: true,
    gridWidth: 1,
    gridDepth: 0.22,
    height: 1.9,
    openingWidth: 0.72,
    openingHeight: 1.55,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face'],
    visualScale: 'test',
    loadBearing: 'code-socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  windowFrame: {
    item: 'windowFrame',
    name: 'Window frame',
    role: 'wall-light',
    modularKit: true,
    gridWidth: 0.92,
    gridDepth: 0.18,
    height: 1.45,
    openingWidth: 0.58,
    openingHeight: 0.52,
    pivot: 'wall-center',
    collider: 'thin-wall',
    snap: ['front edge on hex face'],
    visualScale: 'test',
    loadBearing: 'code-socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
  roofBundle: {
    item: 'roofBundle',
    name: 'Roof bundle',
    role: 'roof-cap',
    modularKit: true,
    gridWidth: 1.12,
    gridDepth: 1.12,
    height: 0.62,
    pivot: 'center',
    collider: 'roof-shell',
    snap: ['centered over one occupied shelter hex'],
    visualScale: 'test',
    loadBearing: 'code-socket',
    glbPolicy: 'decorative-skin-after-normalization',
  },
};

class FailingKilnAssets implements StructureSkinProvider {
  async createStructureSkin() {
    return null;
  }
}

describe('structure renderer asset readability', () => {
  it('gives cave anchors and waystones distinct route-marker glyph roles', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'waystone', tile: 1, layer: 100, yaw: 0, state: { waystone: 'survey', markerUses: 1 } },
      { id: 2, item: 'waystone', tile: 2, layer: 100, yaw: 0, state: { waystone: 'home', markerUses: 1 } },
      { id: 3, item: 'waystone', tile: 3, layer: 100, yaw: 0, state: { waystone: 'cave', markerUses: 1 } },
      { id: 4, item: 'waystone', tile: 4, layer: 100, yaw: 0, state: { waystone: 'shore', markerUses: 1 } },
      { id: 5, item: 'waystone', tile: 5, layer: 100, yaw: 0, state: { waystone: 'forage', markerUses: 1 } },
      { id: 6, item: 'caveAnchor', tile: 6, layer: 100, yaw: 0, state: { anchorUses: 1, anchorKind: 'arch', anchorFlooded: false, anchorSpring: false } },
      { id: 7, item: 'caveAnchor', tile: 7, layer: 100, yaw: 0, state: { anchorUses: 1, anchorKind: 'dryCave', anchorFlooded: false, anchorSpring: true } },
      { id: 8, item: 'caveAnchor', tile: 8, layer: 100, yaw: 0, state: { anchorUses: 1, anchorKind: 'seaCave', anchorFlooded: true, anchorSpring: false } },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);
    const stats = renderer.stats();

    expect(stats.groups).toBe(8);
    expect(stats.routeSilhouettes).toBe(2);
    expect(stats.routeReadabilityRoles).toBeGreaterThanOrEqual(18);
    expect([...meshNames(renderer)]).toEqual(expect.arrayContaining([
      'waystoneGlyph-survey',
      'waystoneGlyph-home',
      'waystoneGlyph-cave',
      'waystoneGlyph-shore',
      'waystoneGlyph-forage',
      'caveAnchorGlyph-arch',
      'caveAnchorGlyph-dryCave',
      'caveAnchorGlyph-seaCave',
      'caveAnchorSpringMark',
      'caveAnchorFloodMark',
    ]));
    expect([...readabilityRoles(renderer)]).toEqual(expect.arrayContaining([
      'survey bearing needle',
      'home roof chevron',
      'cave arch lintel',
      'shore wave bar',
      'forage leaf sprout',
      'walk-under arch glyph',
      'dark dry-cave mouth glyph',
      'sea-cave waterline glyph',
      'freshwater spring bead',
      'set-anchor flood marker',
      'coiled return rope',
    ]));
  });

  it('skins waystones with Kiln GLB bodies while preserving attuned glyph overlays', async () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene, new FakeKilnAssets());
    const structures: StructureSave[] = [
      { id: 1, item: 'waystone', tile: 1, layer: 100, yaw: 0, state: { waystone: 'home', markerUses: 1 } },
    ];

    renderer.setStructures(structures);
    await flushAsyncSkinLoads();
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);

    expect(namedObject(renderer, 'kiln-skin-waystone')).toBeTruthy();
    expect(namedObject(renderer, 'waystoneBase')?.visible).toBe(false);
    expect(namedObject(renderer, 'waystoneCore')?.visible).toBe(false);
    expect(namedObject(renderer, 'waystoneBand')?.visible).toBe(false);
    expect(namedObject(renderer, 'waystoneGlyph-home')?.visible).toBe(true);
    expect(namedObject(renderer, 'waystoneGlyph-survey')?.visible).toBe(false);
    expect(renderer.stats().kilnSkinsLoaded).toBe(1);
    expect(renderer.stats().kilnSkinFallbacks).toBe(0);
    expect(renderer.stats().kilnSkinsBySlug.waystone).toMatchObject({ loaded: 1, pending: 0, fallback: 0 });
  });

  it('skins modular house-kit sockets with Kiln GLBs while preserving functional shelter overlays', async () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene, new FakeKilnAssets());
    const homeTile = Array.from({ length: geo.count }, (_, tile) => tile).find((tile) => geo.degreeOf(tile) >= 6);
    if (homeTile === undefined) throw new Error('test Goldberg lacks a six-neighbor home tile');
    const local = Array.from({ length: geo.degreeOf(homeTile) }, (_, edge) => geo.neighbor(homeTile, edge));
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: homeTile, layer: 100, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: local[0], layer: 100, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: local[1], layer: 100, yaw: 0 },
      { id: 4, item: 'doorKit', tile: local[2], layer: 100, yaw: 0 },
      { id: 5, item: 'campfire', tile: local[3], layer: 100, yaw: 0, state: { lit: true } },
      { id: 6, item: 'workbench', tile: local[4], layer: 100, yaw: 0 },
      { id: 7, item: 'chest', tile: local[5], layer: 100, yaw: 0 },
      { id: 8, item: 'windowFrame', tile: homeTile, layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    await flushAsyncSkinLoads();
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);
    const stats = renderer.stats();

    expect(namedObject(renderer, 'kiln-skin-door-kit')).toBeTruthy();
    expect(namedObject(renderer, 'kiln-skin-window-frame')).toBeTruthy();
    expect(namedObject(renderer, 'kiln-skin-roof-bundle')).toBeTruthy();
    expect(namedObject(renderer, 'leftJamb')?.visible).toBe(false);
    expect(namedObject(renderer, 'glassPane')?.visible).toBe(false);
    expect(namedObject(renderer, 'leftRoofPlane')?.visible).toBe(false);
    expect(namedObject(renderer, 'windowWarmLight')?.visible).toBe(true);
    expect(namedObject(renderer, 'roofShelterGlow')?.visible).toBe(true);
    expect(stats.kilnSkinsLoaded).toBe(4);
    expect(stats.kilnSkinFallbacks).toBe(0);
    expect(stats.kilnSkinsBySlug['door-kit']).toMatchObject({ loaded: 1, pending: 0, fallback: 0 });
    expect(stats.kilnSkinsBySlug['window-frame']).toMatchObject({ loaded: 1, pending: 0, fallback: 0 });
    expect(stats.kilnSkinsBySlug['roof-bundle']).toMatchObject({ loaded: 2, pending: 0, fallback: 0 });
    expect(stats.kilnSkinFits['window-frame']).toMatchObject({
      item: 'windowFrame',
      socketRole: 'wall-light',
      glbPolicy: 'decorative-skin-after-normalization',
      instanceability: 'C',
    });
  });

  it('keeps procedural house-kit silhouettes visible when Kiln skin loading falls back', async () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene, new FailingKilnAssets());
    const structures: StructureSave[] = [
      { id: 1, item: 'doorKit', tile: 1, layer: 100, yaw: 0 },
      { id: 2, item: 'windowFrame', tile: 2, layer: 100, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: 3, layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    await flushAsyncSkinLoads();
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 0.5);
    const stats = renderer.stats();

    expect(namedObject(renderer, 'kiln-skin-door-kit')).toBeNull();
    expect(namedObject(renderer, 'leftJamb')?.visible).toBe(true);
    expect(namedObject(renderer, 'glassPane')?.visible).toBe(true);
    expect(namedObject(renderer, 'leftRoofPlane')?.visible).toBe(true);
    expect(stats.kilnSkinsLoaded).toBe(0);
    expect(stats.kilnSkinFallbacks).toBe(3);
    expect(stats.kilnSkinsBySlug['door-kit']).toMatchObject({ loaded: 0, pending: 0, fallback: 1 });
    expect(stats.kilnSkinsBySlug['window-frame']).toMatchObject({ loaded: 0, pending: 0, fallback: 1 });
    expect(stats.kilnSkinsBySlug['roof-bundle']).toMatchObject({ loaded: 0, pending: 0, fallback: 1 });
  });

  it('renders functional shelter warmth and comfort signals from the room report', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const homeTile = Array.from({ length: geo.count }, (_, tile) => tile).find((tile) => geo.degreeOf(tile) >= 6);
    if (homeTile === undefined) throw new Error('test Goldberg lacks a six-neighbor home tile');
    const local = Array.from({ length: geo.degreeOf(homeTile) }, (_, edge) => geo.neighbor(homeTile, edge));
    const structures: StructureSave[] = [
      { id: 1, item: 'bedroll', tile: homeTile, layer: 100, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: local[0], layer: 100, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: local[1], layer: 100, yaw: 0 },
      { id: 4, item: 'doorKit', tile: local[2], layer: 100, yaw: 0 },
      { id: 5, item: 'campfire', tile: local[3], layer: 100, yaw: 0, state: { lit: true } },
      { id: 6, item: 'workbench', tile: local[4], layer: 100, yaw: 0 },
      { id: 7, item: 'chest', tile: local[5], layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1.25);
    const stats = renderer.stats();

    expect(namedObject(renderer, 'homeComfortRing')?.visible).toBe(true);
    expect(namedObject(renderer, 'hearthWarmthHalo')?.visible).toBe(true);
    expect(namedObject(renderer, 'roofShelterGlow')?.visible).toBe(true);
    expect(stats.homeComfortSignals).toBeGreaterThanOrEqual(4);
    expect(stats.shelterReadabilityRoles).toBeGreaterThanOrEqual(3);
    expect(stats.homeComfort).toMatchObject({
      visibleWarmthMeshes: 4,
      visibleLightMeshes: 1,
      visibleHomeMarkers: 1,
      visibleSmokePuffs: 6,
      litCampfires: 1,
      litLanterns: 0,
    });
    expect([...readabilityRoles(renderer)]).toEqual(expect.arrayContaining([
      'functional shelter comfort ring',
      'warmth radius from lit shelter fire',
      'roof coverage shelter glow',
    ]));
  });

  it('renders procedural wall-shell pieces with distinct foundation, wall, rail, corner, and roof roles', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'floorFoundation', tile: 1, layer: 100, yaw: 0 },
      { id: 2, item: 'wallPanel', tile: 2, layer: 100, yaw: Math.PI / 3 },
      { id: 3, item: 'wallHalfRail', tile: 3, layer: 100, yaw: Math.PI * 2 / 3 },
      { id: 4, item: 'wallDoorPanel', tile: 4, layer: 100, yaw: 0 },
      { id: 5, item: 'wallWindowPanel', tile: 5, layer: 100, yaw: 0 },
      { id: 6, item: 'wallCorner', tile: 6, layer: 100, yaw: 0 },
      { id: 7, item: 'roofJoin', tile: 7, layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1.5);
    const stats = renderer.stats();

    expect(stats.wallShell).toMatchObject({
      foundations: 1,
      fullWalls: 1,
      halfRails: 1,
      doorPanels: 1,
      windowPanels: 1,
      corners: 1,
      roofJoins: 1,
    });
    expect(stats.wallShellReadabilityRoles).toBeGreaterThanOrEqual(14);
    expect(stats.wallShellSignals).toBeGreaterThanOrEqual(14);
    expect([...meshNames(renderer)]).toEqual(expect.arrayContaining([
      'foundationFootprint',
      'foundationLevelBand',
      'wallPanelFace',
      'wallPanelTopCap',
      'halfRailRun',
      'halfRailOpenGap',
      'wallDoorPanelLeftFace',
      'wallDoorPanelLintel',
      'wallWindowPanelGlass',
      'wallCornerPost',
      'roofJoinRidge',
    ]));
    expect(stats.wallShell.visibleRoles).toEqual(expect.arrayContaining([
      'floor foundation level footprint',
      'full wall panel shelter boundary',
      'wall shell top cap under roof join',
      'half rail porch guard',
      'half rail open weather gap',
      'wall-door panel shelter boundary',
      'wall-window panel shelter boundary',
      'wall corner shelter boundary',
      'roof join ridge shelter cap',
    ]));
  });

  it('reports same-tile wall-shell edge sockets for stacked building pieces', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'floorFoundation', tile: 1, layer: 100, yaw: 0 },
      { id: 2, item: 'wallPanel', tile: 1, layer: 100, yaw: 0 },
      { id: 3, item: 'wallWindowPanel', tile: 1, layer: 100, yaw: Math.PI / 3 },
      { id: 4, item: 'wallCorner', tile: 1, layer: 100, yaw: Math.PI * 2 / 3 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1.5);
    const stats = renderer.stats();

    expect(stats.wallShell.sameTileEdgeStacks).toBe(1);
    expect(stats.wallShell.edgeSockets).toEqual(expect.arrayContaining([
      '1:edge:0',
      '1:edge:1',
      '1:edge:2',
      '1:edge:3',
    ]));
  });

  it('renders valid and blocked snap previews without adding saved structure groups', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const structures: StructureSave[] = [
      { id: 1, item: 'doorKit', tile: 1, layer: 100, yaw: 0 },
    ];

    renderer.setStructures(structures);
    renderer.update(structures, geo, layers, { x: 0, y: 0, z: 0 }, 1);
    renderer.updateSnapPreview({
      active: true,
      mode: 'place',
      ok: true,
      item: 'windowFrame',
      tile: 2,
      layer: 100,
      yaw: Math.PI / 3,
      turn: 1,
      message: 'Window frame can snap here',
      blocker: null,
      blockers: [],
      socket: HOUSE_PREVIEW_SOCKETS.windowFrame,
    }, geo, layers, { x: 0, y: 0, z: 0 }, 1.1);

    expect(renderer.stats()).toMatchObject({
      groups: 1,
      snapPreview: {
        active: true,
        ok: true,
        mode: 'place',
        item: 'windowFrame',
        tile: 2,
        blocker: null,
      },
    });
    expect(renderer.stats().snapPreview.meshes).toBeGreaterThan(2);
    expect(renderer.stats().snapPreview.readabilityRoles).toBeGreaterThanOrEqual(3);
    expect(previewObject(renderer, 'snapPreviewFootprint')?.visible).toBe(true);
    expect(previewObject(renderer, 'snapPreviewBlockerA')?.visible).toBe(false);

    renderer.updateSnapPreview({
      active: true,
      mode: 'relocate',
      ok: false,
      item: 'doorKit',
      id: 1,
      tile: 1,
      layer: 100,
      yaw: 0,
      turn: 0,
      fromTile: 1,
      fromLayer: 100,
      message: 'door kit already on that snap hex',
      blocker: 'same snap target',
      blockers: ['same snap target'],
      socket: HOUSE_PREVIEW_SOCKETS.doorKit,
    }, geo, layers, { x: 0, y: 0, z: 0 }, 1.2);

    expect(renderer.stats()).toMatchObject({
      groups: 1,
      snapPreview: {
        active: true,
        ok: false,
        mode: 'relocate',
        item: 'doorKit',
        tile: 1,
        blocker: 'same snap target',
      },
    });
    expect(previewObject(renderer, 'snapPreviewBlockerA')?.visible).toBe(true);
    expect(previewObject(renderer, 'snapPreviewBlockerB')?.visible).toBe(true);

    renderer.updateSnapPreview(null, geo, layers, { x: 0, y: 0, z: 0 }, 1.3);
    expect(renderer.stats().snapPreview.active).toBe(false);
    expect(renderer.stats().groups).toBe(1);
  });

  it('exposes socket-specific snap preview silhouettes for house-kit pieces', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const cases: Array<{
      item: 'doorKit' | 'windowFrame' | 'roofBundle';
      role: StructureSocketSpec['role'];
      collider: StructureSocketSpec['collider'];
      silhouette: string;
      meshNames: string[];
      roles: string[];
    }> = [
      {
        item: 'doorKit',
        role: 'wall-opening',
        collider: 'thin-wall',
        silhouette: 'door-opening-preview',
        meshNames: ['snapPreviewDoorLeftJamb', 'snapPreviewDoorRightJamb', 'snapPreviewDoorLintel'],
        roles: ['snap preview door opening', 'snap preview door lintel'],
      },
      {
        item: 'windowFrame',
        role: 'wall-light',
        collider: 'thin-wall',
        silhouette: 'window-light-preview',
        meshNames: ['snapPreviewWindowGlassPane', 'snapPreviewWindowSill', 'snapPreviewWindowCenterMullion'],
        roles: ['snap preview window light', 'snap preview window sill', 'snap preview window centered opening'],
      },
      {
        item: 'roofBundle',
        role: 'roof-cap',
        collider: 'roof-shell',
        silhouette: 'roof-cap-preview',
        meshNames: ['snapPreviewRoofRidgeBeam', 'snapPreviewRoofLeftEave', 'snapPreviewRoofCapPlane'],
        roles: ['snap preview roof cap', 'snap preview roof eave', 'snap preview roof cap coverage'],
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      renderer.updateSnapPreview({
        active: true,
        mode: 'place',
        ok: true,
        item: testCase.item,
        tile: index + 2,
        layer: 100,
        yaw: index * Math.PI / 3,
        turn: index,
        message: `${testCase.item} can snap here`,
        blocker: null,
        blockers: [],
        socket: HOUSE_PREVIEW_SOCKETS[testCase.item],
      }, geo, layers, { x: 0, y: 0, z: 0 }, 1 + index);

      const stats = renderer.stats().snapPreview;
      expect(stats).toMatchObject({
        active: true,
        ok: true,
        mode: 'place',
        item: testCase.item,
        socketRole: testCase.role,
        socketCollider: testCase.collider,
        silhouette: testCase.silhouette,
      });
      expect(stats.meshNames).toEqual(expect.arrayContaining(testCase.meshNames));
      expect(stats.visibleReadabilityRoles).toEqual(expect.arrayContaining(testCase.roles));
      expect(stats.visibleReadabilityRoles).not.toContain('blocked snap crossbar');
      expect(stats.meshes).toBeGreaterThanOrEqual(testCase.meshNames.length + 3);
    }
  });

  it('exposes socket-specific snap preview silhouettes for wall-shell pieces', () => {
    const scene = new THREE.Scene();
    const geo = new Goldberg(8);
    const layers = buildLayers();
    const renderer = new StructureRenderer(scene);
    const cases: Array<{
      item: 'floorFoundation' | 'wallPanel' | 'wallDoorPanel' | 'wallWindowPanel' | 'wallCorner' | 'wallHalfRail' | 'roofJoin';
      role: StructureSocketSpec['role'];
      collider: StructureSocketSpec['collider'];
      silhouette: string;
      meshNames: string[];
      roles: string[];
    }> = [
      {
        item: 'floorFoundation',
        role: 'foundation',
        collider: 'hex-cell',
        silhouette: 'foundation-pad-preview',
        meshNames: ['snapPreviewFoundationPad', 'snapPreviewFoundationLevelBand', 'snapPreviewFoundationCenterMark'],
        roles: ['snap preview floor foundation', 'snap preview leveled floor socket', 'snap preview floor center mark'],
      },
      {
        item: 'wallPanel',
        role: 'wall-panel',
        collider: 'thin-wall',
        silhouette: 'wall-panel-preview',
        meshNames: ['snapPreviewWallPanelFace', 'snapPreviewWallPanelLeftPost', 'snapPreviewWallPanelTopCap'],
        roles: ['snap preview full wall boundary', 'snap preview full wall post', 'snap preview wall top cap'],
      },
      {
        item: 'wallDoorPanel',
        role: 'wall-opening',
        collider: 'thin-wall',
        silhouette: 'wall-door-panel-preview',
        meshNames: ['snapPreviewWallDoorLeftWall', 'snapPreviewWallDoorLeftJamb', 'snapPreviewWallDoorLintel'],
        roles: ['snap preview wall door shelter boundary', 'snap preview integrated door opening', 'snap preview wall door lintel'],
      },
      {
        item: 'wallWindowPanel',
        role: 'wall-light',
        collider: 'thin-wall',
        silhouette: 'wall-window-panel-preview',
        meshNames: ['snapPreviewWallWindowFace', 'snapPreviewWallWindowPane', 'snapPreviewWallWindowMullion'],
        roles: ['snap preview wall window shelter boundary', 'snap preview wall window light opening', 'snap preview wall window centered opening'],
      },
      {
        item: 'wallCorner',
        role: 'wall-corner',
        collider: 'thin-wall',
        silhouette: 'wall-corner-preview',
        meshNames: ['snapPreviewWallCornerPost', 'snapPreviewWallCornerLeftWing', 'snapPreviewWallCornerCap'],
        roles: ['snap preview wall corner shelter boundary', 'snap preview wall corner wing', 'snap preview wall shell corner cap'],
      },
      {
        item: 'wallHalfRail',
        role: 'half-rail',
        collider: 'thin-wall',
        silhouette: 'half-rail-preview',
        meshNames: ['snapPreviewHalfRailLeftPost', 'snapPreviewHalfRailRun', 'snapPreviewHalfRailOpenGap'],
        roles: ['snap preview half rail post', 'snap preview porch rail', 'snap preview open weather gap'],
      },
      {
        item: 'roofJoin',
        role: 'roof-join',
        collider: 'roof-shell',
        silhouette: 'roof-join-preview',
        meshNames: ['snapPreviewRoofJoinRidge', 'snapPreviewRoofJoinLeftBracket', 'snapPreviewRoofJoinCoverage'],
        roles: ['snap preview roof join ridge', 'snap preview roof join bracket', 'snap preview roof join coverage'],
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      renderer.updateSnapPreview({
        active: true,
        mode: 'place',
        ok: true,
        item: testCase.item,
        tile: index + 2,
        layer: 100,
        yaw: index * Math.PI / 3,
        turn: index,
        message: `${testCase.item} can snap here`,
        blocker: null,
        blockers: [],
        socket: structureSocketSpec(testCase.item),
      }, geo, layers, { x: 0, y: 0, z: 0 }, 2 + index);

      const stats = renderer.stats().snapPreview;
      expect(stats).toMatchObject({
        active: true,
        ok: true,
        mode: 'place',
        item: testCase.item,
        socketRole: testCase.role,
        socketCollider: testCase.collider,
        silhouette: testCase.silhouette,
      });
      expect(stats.meshNames).toEqual(expect.arrayContaining(testCase.meshNames));
      expect(stats.visibleReadabilityRoles).toEqual(expect.arrayContaining(testCase.roles));
    }
  });
});
