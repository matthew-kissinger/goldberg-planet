import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.resolve(root, process.env.KILN_ASSET_PACK_DIR || path.join('public', 'assets', 'kiln', 'generated'));
const catalogPath = path.join(root, 'tools', 'kiln', 'assets-catalog.json');
const outputDir = path.join(root, 'output', 'kiln');
const proofPath = path.join(outputDir, 'kiln-asset-pack-proof.json');

const KiB = 1024;
const MiB = KiB * KiB;
const SOFT_MAX_GLB_BYTES = 512 * KiB;
const SOFT_MAX_TOTAL_BYTES = 16 * MiB;
const SOFT_MAX_TRIS = 8000;
const SOFT_MAX_DRAWS = 96;
const REQUIRED_PALETTE_ID = 'sphere-planet';

const failures = [];
const warnings = [];

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${rel(file)} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function scanSensitiveBytes(file, bytes) {
  const text = bytes.toString('utf8');
  const checks = [
    ['Kiln PAT', /ks_live_[A-Za-z0-9_-]{12,}/],
    ['Bearer token', /Authorization:\s*Bearer/i],
    ['HTTP URL', /https?:\/\//i],
    ['presigned URL marker', /(X-Amz-|Signature=|CloudFront-Key-Pair-Id=|download-url)/i],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) fail(`${rel(file)} contains ${label}; generated runtime assets must not carry secrets or presigned URLs`);
  }
}

function parseDrawCount(summary) {
  const match = String(summary ?? '').match(/(\d+)\s*draws/i);
  return match ? Number(match[1]) : 0;
}

function loadCatalog() {
  if (!existsSync(catalogPath)) return { found: false, entries: new Map(), doneCount: 0 };
  const data = readJson(catalogPath);
  const entries = new Map();
  let doneCount = 0;
  for (const entry of data?.assets ?? []) {
    if (!entry?.slug) continue;
    entries.set(entry.slug, entry);
    if (entry.done) doneCount += 1;
  }
  return {
    found: true,
    entries,
    doneCount,
    model: data?.model ?? null,
    palette: data?.palette ?? null,
  };
}

function validateGlb(file) {
  if (!existsSync(file)) {
    fail(`${rel(file)} is missing`);
    return null;
  }
  const bytes = readFileSync(file);
  scanSensitiveBytes(file, bytes);
  if (bytes.length < 12) {
    fail(`${rel(file)} is too small to be a GLB`);
    return null;
  }
  const magic = bytes.toString('ascii', 0, 4);
  const version = bytes.readUInt32LE(4);
  const declaredLength = bytes.readUInt32LE(8);
  if (magic !== 'glTF') fail(`${rel(file)} has GLB magic ${JSON.stringify(magic)} instead of glTF`);
  if (version !== 2) fail(`${rel(file)} is GLB version ${version}; expected 2`);
  if (declaredLength !== bytes.length) fail(`${rel(file)} declares ${declaredLength} bytes but is ${bytes.length} bytes`);
  return {
    bytes: bytes.length,
    kib: Number((bytes.length / KiB).toFixed(1)),
    version,
    declaredLength,
  };
}

function validateAsset(dir, catalog) {
  const slug = path.basename(dir);
  const jsonPath = path.join(dir, 'asset.json');
  const glbPath = path.join(dir, 'model.glb');
  if (!existsSync(jsonPath)) fail(`${rel(jsonPath)} is missing`);
  const glb = validateGlb(glbPath);
  const meta = existsSync(jsonPath) ? readJson(jsonPath) : null;
  if (existsSync(jsonPath)) scanSensitiveBytes(jsonPath, Buffer.from(readFileSync(jsonPath, 'utf8'), 'utf8'));

  const quality = meta?.quality ?? {};
  const instanceability = quality.instanceability ?? {};
  const tris = Number(quality.tris ?? 0);
  const draws = parseDrawCount(instanceability.summary);
  const grade = String(instanceability.grade ?? 'unknown');
  const prompt = String(meta?.prompt ?? '');
  const catalogEntry = catalog.entries.get(slug);

  if (!meta?.assetId) fail(`${rel(jsonPath)} has no assetId`);
  if (meta?.status !== 'ok') fail(`${rel(jsonPath)} status is ${JSON.stringify(meta?.status)}; expected "ok"`);
  if (!prompt) fail(`${rel(jsonPath)} has no prompt`);
  if (!meta?.category) fail(`${rel(jsonPath)} has no category`);
  if (!meta?.modelId) fail(`${rel(jsonPath)} has no modelId`);
  if (meta?.palette?.paletteId !== REQUIRED_PALETTE_ID) {
    fail(`${rel(jsonPath)} paletteId is ${JSON.stringify(meta?.palette?.paletteId)}; expected ${REQUIRED_PALETTE_ID}`);
  }
  if (quality.optimizedPalette?.mode !== 'palette') {
    warn(`${rel(jsonPath)} does not report palette optimization mode`);
  }
  if (catalog.found && !catalogEntry) warn(`${slug} is present in generated assets but not listed in tools/kiln/assets-catalog.json`);
  if (catalogEntry && catalogEntry.done !== true) warn(`${slug} is generated but catalog entry is not marked done`);
  if (glb && glb.bytes > SOFT_MAX_GLB_BYTES) warn(`${rel(glbPath)} is ${glb.kib} KiB, above the ${SOFT_MAX_GLB_BYTES / KiB} KiB soft runtime budget`);
  if (tris > SOFT_MAX_TRIS) warn(`${slug} has ${tris} tris, above the ${SOFT_MAX_TRIS} soft runtime budget`);
  if (draws > SOFT_MAX_DRAWS) warn(`${slug} reports ${draws} draws, above the ${SOFT_MAX_DRAWS} soft runtime budget`);
  if (grade === 'C' || grade === 'D' || grade === 'F') warn(`${slug} has instanceability grade ${grade}`);

  return {
    slug,
    assetId: meta?.assetId ?? null,
    category: meta?.category ?? 'unknown',
    role: quality.role ?? catalogEntry?.role ?? 'unknown',
    catalogRole: catalogEntry?.role ?? null,
    tier: catalogEntry?.tier ?? null,
    footprint: catalogEntry?.footprint ?? null,
    status: meta?.status ?? 'unknown',
    modelId: meta?.modelId ?? null,
    colorPolicy: meta?.colorPolicy ?? null,
    paletteId: meta?.palette?.paletteId ?? null,
    tris,
    draws,
    grade,
    materialsBefore: Number(quality.optimizedPalette?.materialsBefore ?? 0),
    materialsAfter: Number(quality.optimizedPalette?.materialsAfter ?? 0),
    glbBytes: glb?.bytes ?? 0,
    glbKiB: glb?.kib ?? 0,
    tags: Array.isArray(meta?.tags) ? meta.tags : [],
    promptExcerpt: prompt.length > 180 ? `${prompt.slice(0, 177)}...` : prompt,
    catalogMatched: !!catalogEntry,
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = String(item[key] ?? 'unknown');
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function makeRuntimeCandidates(assets) {
  const desirable = new Set([
    'bedroll',
    'campfire',
    'cave-anchor',
    'cave-mouth-arch',
    'cave-mouth-dry',
    'cave-mouth-sea',
    'chest',
    'crop-plot',
    'door-kit',
    'fish-trap',
    'shore-net',
    'waystone',
    'window-frame',
    'workbench',
    'creature-moss-puff',
    'creature-reedback-grazer',
    'creature-shell-skitter',
    'creature-scree-snapper',
  ]);
  return assets
    .filter((asset) => desirable.has(asset.slug))
    .map((asset) => ({
      slug: asset.slug,
      reason: asset.slug.startsWith('creature-')
        ? 'native-life readability candidate'
        : asset.slug.includes('cave')
          ? 'cave/route readability candidate'
          : 'survival-loop prop candidate',
      needsBeforeRuntime: [
        asset.draws > SOFT_MAX_DRAWS ? 'reduce draw calls/material splits' : null,
        asset.tris > SOFT_MAX_TRIS ? 'simplify geometry or add LOD' : null,
        asset.grade === 'C' ? 'improve instanceability grade' : null,
        'blind screenshot naming test at normal play distance',
        'runtime GLTFLoader manifest with scale, pivot, and collision proxy',
      ].filter(Boolean),
    }));
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const required = process.env.KILN_ASSET_PACK_REQUIRED === '1';
  if (!existsSync(assetRoot)) {
    const proof = {
      generatedAt: new Date().toISOString(),
      assetRoot: rel(assetRoot),
      skipped: true,
      reason: 'local Kiln generated asset pack is absent',
      required,
    };
    writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
    if (required) throw new Error(`Kiln asset pack is required but ${rel(assetRoot)} is absent`);
    console.log(`Kiln asset pack absent; wrote skipped proof to ${rel(proofPath)}`);
    return;
  }

  const catalog = loadCatalog();
  if (!catalog.found) {
    warn('tools/kiln/assets-catalog.json is absent; catalog parity and done-flag checks were skipped');
  }
  const dirs = readdirSync(assetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(assetRoot, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  if (dirs.length === 0) fail(`${rel(assetRoot)} contains no asset directories`);

  const assets = dirs.map((dir) => validateAsset(dir, catalog));
  const totalGlbBytes = assets.reduce((sum, asset) => sum + asset.glbBytes, 0);
  if (totalGlbBytes > SOFT_MAX_TOTAL_BYTES) {
    warn(`generated GLBs total ${(totalGlbBytes / MiB).toFixed(2)} MiB, above the ${(SOFT_MAX_TOTAL_BYTES / MiB).toFixed(2)} MiB soft pack budget`);
  }

  const proof = {
    generatedAt: new Date().toISOString(),
    assetRoot: rel(assetRoot),
    catalog: {
      path: existsSync(catalogPath) ? rel(catalogPath) : null,
      found: catalog.found,
      doneCount: catalog.doneCount,
      model: catalog.model ?? null,
      palette: catalog.palette ?? null,
    },
    decision: {
      status: failures.length === 0 ? 'quarantined-pass' : 'failed',
      runtimeImport: 'deferred',
      rationale: 'The local generated pack passed integrity/safety checks, but generated GLBs stay quarantined until screenshot readability, scale/pivot, collision, and GLTFLoader manifest gates are added.',
    },
    totals: {
      assets: assets.length,
      glbs: assets.filter((asset) => asset.glbBytes > 0).length,
      glbBytes: totalGlbBytes,
      glbMiB: Number((totalGlbBytes / MiB).toFixed(2)),
      largestGlbKiB: assets.reduce((max, asset) => Math.max(max, asset.glbKiB), 0),
      categories: countBy(assets, 'category'),
      roles: countBy(assets, 'role'),
      grades: countBy(assets, 'grade'),
    },
    budgets: {
      softMaxGlbKiB: SOFT_MAX_GLB_BYTES / KiB,
      softMaxTotalMiB: SOFT_MAX_TOTAL_BYTES / MiB,
      softMaxTris: SOFT_MAX_TRIS,
      softMaxDraws: SOFT_MAX_DRAWS,
    },
    warnings,
    failures,
    runtimeCandidates: makeRuntimeCandidates(assets),
    assets,
  };

  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(`Kiln asset pack proof wrote ${rel(proofPath)}`);
  console.log(`${assets.length} assets, ${proof.totals.glbMiB} MiB GLB total, ${warnings.length} warnings, ${failures.length} failures`);
  if (failures.length > 0) {
    throw new Error(`Kiln asset pack proof failed with ${failures.length} issue(s); see ${rel(proofPath)}`);
  }
}

main();
