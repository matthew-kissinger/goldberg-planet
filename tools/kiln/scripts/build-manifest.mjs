// Build a provenance manifest for the Kiln-generated asset drop so the codebase agent
// can analyze geometry / animation / dimensions and wire each asset in correctly.
//
// Reads assets-catalog.json + every generated GLB (+ its asset.json) and emits:
//   public/assets/kiln/ASSET_MANIFEST.json   (machine-readable, one record per asset)
// Bounds, triangle/mesh/node/material counts, and animation clip durations are parsed
// straight from the GLB JSON chunk (accessor min/max) — no binary decode needed.
//
// Usage (from tools/kiln/):  node scripts/build-manifest.mjs

import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = JSON.parse(readFileSync(resolve(HERE, '../assets-catalog.json'), 'utf8'));
const GEN = resolve(HERE, '../../../public/assets/kiln/generated');
const OUT = resolve(HERE, '../../../public/assets/kiln/ASSET_MANIFEST.json');

// Hex tile reference so the agent can scale GLB-local extents to world units.
const HEX_FLAT_TO_FLAT = 5.6;

// Best-effort pointers to the procedural code each asset supersedes. These are ownership
// hints for runtime wiring, not permission to delete the procedural fallback.
const REPLACES = {
  workbench: 'src/render/structures.ts makeWorkbench()',
  chest: 'src/render/structures.ts makeChest()',
  campfire: 'src/render/structures.ts makeCampfire()',
  'door-kit': 'src/render/structures.ts makeDoorKit() as decorative skin inside code-authored build socket',
  'window-frame': 'src/render/structures.ts makeWindowFrame() as decorative skin inside code-authored build socket',
  'dock-segment': 'src/render/structures.ts makeDockSegment() as decorative skin inside code-authored build socket',
  'roof-bundle': 'src/render/structures.ts roof/house-kit procedural panel placeholder as decorative skin inside code-authored build socket',
  bedroll: 'src/render/structures.ts makeBedroll()',
  'crop-plot': 'src/render/structures.ts makeCropPlot()',
  'compost-bin': 'src/render/structures.ts makeCompostBin() as decorative skin inside code-authored utility socket',
  'rain-cistern': 'src/render/structures.ts makeRainCistern()',
  'root-cellar': 'src/render/structures.ts makeRootCellar() as decorative skin inside code-authored utility socket',
  'cave-anchor': 'src/render/structures.ts makeCaveAnchor() with route glyph overlays retained',
  'fish-trap': 'src/render/structures.ts makeFishTrap()',
  'shore-net': 'src/render/structures.ts makeShoreNet()',
  'drying-rack': 'src/render/structures.ts makeDryingRack()',
  'weather-vane': 'src/render/structures.ts makeWeatherVane() with spinning needle overlay retained',
  'lantern-post': 'src/render/structures.ts makeLantern()',
  waystone: 'src/render/structures.ts makeWaystone() with attuned route glyph overlays retained',
  'cave-mouth-arch': 'src/render/caveMouths.ts makeMouth() [arch] as GLB skin over carved cave signal',
  'cave-mouth-dry': 'src/render/caveMouths.ts makeMouth() [dryCave] as GLB skin over carved cave signal',
  'cave-mouth-sea': 'src/render/caveMouths.ts makeMouth() [seaCave] as GLB skin over carved cave signal',
};

function replacementFor(a) {
  if (REPLACES[a.slug]) return REPLACES[a.slug];
  if (a.slug.startsWith('shrine-')) return `src/render/landmarks.ts makeLandmark() / ${a.title} domain landmark shell`;
  if (a.slug.startsWith('node-')) return `src/render/domainResources.ts ${a.slug.replace(/^node-/, '')} resource silhouette`;
  if (a.slug.startsWith('fish-') || a.slug === 'creature-driftjelly') return `src/render/fishSchools.ts ${a.title} singleton fish-school body`;
  if (a.slug.startsWith('bird-')) return `future SkyLifeRenderer ${a.title} singleton bird/flock body`;
  if (a.slug.startsWith('creature-')) return `src/render/nativeLife.ts ${a.title} node-transform replacement candidate`;
  if (a.slug.startsWith('tree-')) return `src/world/trees.ts + src/render/mesher.ts emitTree() / ${a.title} instanced scatter replacement candidate`;
  if (a.slug.startsWith('crater-')) return `src/render/skyfall.ts ${a.title} crater shell`;
  if (a.slug.startsWith('drop-')) return `src/render/resourceDrops.ts ${a.title} drop group`;
  return undefined;
}

function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glTF binary');
  let off = 12, json = null;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) { json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8')); break; }
    off += 8 + len;
  }
  if (!json) throw new Error('no JSON chunk');
  return json;
}

function geometryOf(json) {
  const acc = json.accessors ?? [];
  let tris = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      if (p.indices != null && acc[p.indices]) tris += acc[p.indices].count / 3;
      const posIdx = p.attributes?.POSITION;
      const pos = posIdx != null ? acc[posIdx] : null;
      if (pos?.min && pos?.max) {
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], pos.min[i]); max[i] = Math.max(max[i], pos.max[i]); }
      }
    }
  }
  const size = min[0] === Infinity ? null : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    triangles: Math.round(tris),
    meshCount: (json.meshes ?? []).length,
    nodeCount: (json.nodes ?? []).length,
    materialCount: (json.materials ?? []).length,
    hasSkin: (json.skins ?? []).length > 0,
    bboxLocal: size ? { min: min.map(r), max: max.map(r), size: size.map(r) } : null,
  };
}

function animationsOf(json) {
  const acc = json.accessors ?? [];
  return (json.animations ?? []).map((a) => {
    let dur = 0;
    for (const s of a.samplers ?? []) {
      const inp = acc[s.input];
      if (inp?.max?.[0] != null) dur = Math.max(dur, inp.max[0]);
    }
    return { name: a.name ?? '(unnamed)', channels: (a.channels ?? []).length, durationSec: r(dur) };
  });
}

const r = (n) => (n == null ? n : Math.round(n * 1000) / 1000);

const records = [];
let ready = 0, unused = 0, missing = 0;

for (const a of CATALOG.assets) {
  const dir = resolve(GEN, a.slug);
  const glbPath = resolve(dir, 'model.glb');
  const rec = {
    slug: a.slug, title: a.title, category: a.category, role: a.role,
    tier: a.tier ?? 'standard', footprint: a.footprint,
    status: a.unused ? 'unused' : 'ready',
    unusedReason: a.unused ? unusedReason(a.slug) : undefined,
    replaces: replacementFor(a),
    prompt: a.prompt,
  };
  if (!existsSync(glbPath)) { rec.file = null; rec.note = 'no GLB generated'; missing++; records.push(rec); continue; }
  const buf = readFileSync(glbPath);
  const json = parseGlb(buf);
  const g = geometryOf(json);
  const anims = animationsOf(json);
  rec.file = `generated/${a.slug}/model.glb`;
  rec.bytes = statSync(glbPath).size;
  rec.geometry = g;
  rec.animations = anims;
  rec.animationPlayback = anims.length
    ? (g.hasSkin ? 'skinned — bind skeleton' : 'node-transform clips — drive with THREE.AnimationMixer by clip name (no skeleton)')
    : 'static';
  // palette from asset.json if present
  const aj = resolve(dir, 'asset.json');
  if (existsSync(aj)) {
    try { const j = JSON.parse(readFileSync(aj, 'utf8')); rec.paletteId = j.palette?.paletteId; rec.kilnTris = j.quality?.tris; rec.instanceability = j.quality?.instanceability?.grade; } catch {}
  }
  if (a.unused) unused++; else ready++;
  records.push(rec);
}

function unusedReason(slug) {
  if (slug === 'roof-bundle') return 'Text-to-3D repeatedly hallucinated a whole house from the word "roof". Procedural plank panels are cleaner. (Revisit if the wedge version passes review.)';
  return 'Left to existing procedural geometry — Kiln fights this shape.';
}

const manifest = {
  generatedFrom: 'tools/kiln (Kiln Studio /v1, google:gemini-3.5-flash)',
  palette: { id: CATALOG.palette, note: 'optimizedPalette:true snaps GLB colors to the saved sphere-planet 10-slot palette' },
  hexReference: { flatToFlatWorldUnits: HEX_FLAT_TO_FLAT, note: 'bboxLocal.size is in raw GLB units, unscaled and transforms NOT baked — rescale per asset so footprint matches its hex tile(s).' },
  counts: { total: records.length, ready, unused, missing },
  wiringNotes: [
    'Animations are node-transform clips (hasSkin:false) — matches the game\'s procedural-by-mesh-name convention. Play with AnimationMixer using the listed clip names (idle, walk).',
    'bboxLocal is local-space and does not bake node transforms; treat as an approximate extent, verify in-engine and scale to hex.',
    'Orientation is not guaranteed — some assets need a 90-degree axis fix. See ORIENTATION_LEDGER.json if present (from the review viewer).',
    'This is an iterative drop: analyze geometry/animation/size before wiring, adjust per asset. Not every asset is final.',
  ],
  assets: records,
};

writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`assets: ${records.length}  ready: ${ready}  unused: ${unused}  missing: ${missing}`);
