import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kilnRoot = path.resolve(root, process.env.KILN_ASSET_ROOT || path.join('public', 'assets', 'kiln'));
const manifestPath = path.join(kilnRoot, 'ASSET_MANIFEST.json');
const modelsRoot = path.join(kilnRoot, 'models');
const generatedRoot = path.resolve(root, process.env.KILN_ASSET_PACK_DIR || path.join('public', 'assets', 'kiln', 'generated'));
const catalogPath = path.join(root, 'tools', 'kiln', 'assets-catalog.json');
const outputDir = path.join(root, 'output', 'kiln');
const proofPath = path.join(outputDir, 'kiln-asset-pack-proof.json');

const KiB = 1024;
const MiB = KiB * KiB;
const SOFT_MAX_GLB_BYTES = 512 * KiB;
const SOFT_MAX_TOTAL_BYTES = 16 * MiB;
const SOFT_MAX_TRIS = 8000;
const SOFT_MAX_MESHES = 80;
const REQUIRED_PALETTE_ID = 'sphere-planet';
const AQUATIC_SINGLETON_SLUGS = new Set([
  'fish-shore-minnow',
  'fish-storm-runner',
  'fish-cave-shimmer',
  'creature-driftjelly',
  'fish-reed-fry',
]);
const SKY_SINGLETON_SLUGS = new Set([
  'bird-sky-kite',
  'bird-shore-gull',
  'bird-forest-flutter',
  'bird-storm-finch',
]);
const mode = process.env.KILN_ASSET_STAGE || (existsSync(manifestPath) ? 'promoted' : 'generated');

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

function trackedForbiddenPaths() {
  const result = spawnSync('git', [
    'ls-files',
    '--',
    'public/assets/kiln/generated',
    'tools/kiln/generated',
    'tools/kiln/.env.local',
    'tools/kiln/dogfood-output',
    'tools/kiln/*.tgz',
  ], { cwd: root, encoding: 'utf8' });
  if (result.error) {
    warn(`git ls-files unavailable; skipped tracked raw-drop hygiene check: ${result.error.message}`);
    return [];
  }
  if (result.status !== 0) {
    warn(`git ls-files failed; skipped tracked raw-drop hygiene check: ${(result.stderr || '').trim() || `exit ${result.status}`}`);
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .map((file) => file.replaceAll('\\', '/').trim())
    .filter(Boolean)
    .filter((file) => file.startsWith('public/assets/kiln/generated/')
      || file.startsWith('tools/kiln/generated/')
      || file === 'tools/kiln/.env.local'
      || file.startsWith('tools/kiln/dogfood-output/')
      || /^tools\/kiln\/[^/]+\.tgz$/.test(file));
}

function validateGitHygiene() {
  const tracked = trackedForbiddenPaths();
  for (const file of tracked) {
    fail(`${file} is tracked; raw Kiln drops, live tokens, dogfood outputs, and local package tarballs must stay out of commits`);
  }
  return {
    checked: true,
    trackedForbidden: tracked,
  };
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${rel(file)} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function scanSecretBytes(file, bytes) {
  const text = bytes.toString('utf8');
  const checks = [
    ['Kiln PAT', /ks_live_[A-Za-z0-9_-]{12,}/],
    ['Bearer token', /Authorization:\s*Bearer\s+[A-Za-z0-9._-]{12,}/i],
    ['AWS signature', /(X-Amz-Signature=|CloudFront-Signature=|CloudFront-Key-Pair-Id=)/i],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) fail(`${rel(file)} contains ${label}; runtime asset drops must not carry secrets or presigned URLs`);
  }
}

function parseGlb(file) {
  if (!existsSync(file)) {
    fail(`${rel(file)} is missing`);
    return null;
  }
  const bytes = readFileSync(file);
  scanSecretBytes(file, bytes);
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

  let json = null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > bytes.length) {
      fail(`${rel(file)} has a GLB chunk that exceeds the file length`);
      break;
    }
    if (chunkType === 0x4e4f534a) {
      try {
        json = JSON.parse(bytes.slice(start, end).toString('utf8'));
      } catch (err) {
        fail(`${rel(file)} has invalid GLB JSON chunk: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }
    offset = end;
  }
  if (!json) fail(`${rel(file)} has no JSON chunk`);
  return {
    file: rel(file),
    bytes: bytes.length,
    kib: Number((bytes.length / KiB).toFixed(1)),
    version,
    declaredLength,
    json,
  };
}

function geometryOf(json) {
  const accessors = json?.accessors ?? [];
  let triangles = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json?.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.indices != null && accessors[primitive.indices]) triangles += accessors[primitive.indices].count / 3;
      const posIdx = primitive.attributes?.POSITION;
      const pos = posIdx != null ? accessors[posIdx] : null;
      if (pos?.min && pos?.max) {
        for (let i = 0; i < 3; i += 1) {
          min[i] = Math.min(min[i], pos.min[i]);
          max[i] = Math.max(max[i], pos.max[i]);
        }
      }
    }
  }
  const size = min[0] === Infinity ? null : [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return {
    triangles: Math.round(triangles),
    meshCount: (json?.meshes ?? []).length,
    nodeCount: (json?.nodes ?? []).length,
    materialCount: (json?.materials ?? []).length,
    hasSkin: (json?.skins ?? []).length > 0,
    bboxLocal: size ? { size: size.map(round3) } : null,
  };
}

function animationsOf(json) {
  const accessors = json?.accessors ?? [];
  return (json?.animations ?? []).map((animation) => {
    let duration = 0;
    for (const sampler of animation.samplers ?? []) {
      const input = accessors[sampler.input];
      if (input?.max?.[0] != null) duration = Math.max(duration, input.max[0]);
    }
    return {
      name: animation.name ?? '(unnamed)',
      channels: (animation.channels ?? []).length,
      durationSec: round3(duration),
    };
  });
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = String(item[key] ?? 'unknown');
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function safeJoinUnder(base, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath)) return null;
  const target = path.resolve(base, relativePath);
  const relation = path.relative(base, target);
  if (relation === '' || relation.startsWith('..') || path.isAbsolute(relation)) return null;
  return target;
}

function compareGeometry(slug, manifestGeometry, glbGeometry) {
  if (!manifestGeometry || !glbGeometry) return;
  if (Number(manifestGeometry.triangles ?? 0) !== glbGeometry.triangles) {
    fail(`${slug} manifest triangles ${manifestGeometry.triangles} do not match GLB triangles ${glbGeometry.triangles}`);
  }
  for (const key of ['meshCount', 'nodeCount', 'materialCount', 'hasSkin']) {
    if (manifestGeometry[key] !== glbGeometry[key]) {
      fail(`${slug} manifest geometry.${key} ${manifestGeometry[key]} does not match GLB ${glbGeometry[key]}`);
    }
  }
}

function compareAnimations(slug, manifestAnimations, glbAnimations) {
  const manifest = manifestAnimations ?? [];
  if (manifest.length !== glbAnimations.length) {
    fail(`${slug} manifest lists ${manifest.length} animation(s), GLB has ${glbAnimations.length}`);
    return;
  }
  for (let i = 0; i < manifest.length; i += 1) {
    const expected = manifest[i];
    const actual = glbAnimations[i];
    if (expected.name !== actual.name) fail(`${slug} animation ${i} name ${actual.name} does not match manifest ${expected.name}`);
    if (expected.channels !== actual.channels) fail(`${slug} animation ${expected.name} channel count ${actual.channels} does not match manifest ${expected.channels}`);
    if (Math.abs(Number(expected.durationSec ?? 0) - actual.durationSec) > 0.01) {
      fail(`${slug} animation ${expected.name} duration ${actual.durationSec}s does not match manifest ${expected.durationSec}s`);
    }
  }
}

function decisionFor(asset, glbSummary) {
  if (asset.status === 'unused') {
    return { slug: asset.slug, state: 'rejected', reason: asset.unusedReason || 'manifest marks this asset unused' };
  }
  const blockers = [];
  if (asset.modularKit) blockers.push('modular kit proportions must be normalized to the build grid before snapping/assembly');
  if (asset.category === 'character' && !AQUATIC_SINGLETON_SLUGS.has(asset.slug) && !SKY_SINGLETON_SLUGS.has(asset.slug)) blockers.push('node-transform idle/walk clips need AnimationMixer proof in game');
  if (asset.slug?.startsWith('tree-')) blockers.push('trees need an instanced scatter/LOD layer before replacement');
  if (asset.slug?.startsWith('shrine-')) blockers.push('shrine/landmark scale and route readability need blind screenshot proof');
  if (asset.slug?.startsWith('crater-')) blockers.push('crater assets need skyfall placement and collision/scale proof');
  if (glbSummary?.meshCount > SOFT_MAX_MESHES) blockers.push(`mesh count ${glbSummary.meshCount} is above the ${SOFT_MAX_MESHES} soft repetition budget`);
  if (asset.instanceability === 'C') blockers.push('instanceability grade C needs explicit runtime acceptance or regeneration');
  if (blockers.length > 0) return { slug: asset.slug, state: 'deferred', reason: blockers.join('; ') };
  if (AQUATIC_SINGLETON_SLUGS.has(asset.slug)) {
    return {
      slug: asset.slug,
      state: 'accepted-candidate',
      reason: 'accepted aquatic singleton; runtime proof owns fish-school selection, forward-axis normalization, point-school rendering, and distance-gated AnimationMixer playback',
    };
  }
  if (SKY_SINGLETON_SLUGS.has(asset.slug)) {
    return {
      slug: asset.slug,
      state: 'accepted-candidate',
      reason: 'accepted sky-life singleton; runtime proof owns sky-life selection, flock point rendering, altitude/pathing, and distance-gated AnimationMixer playback',
    };
  }
  return {
    slug: asset.slug,
    state: 'accepted-candidate',
    reason: 'ready static asset with no manifest-level wiring blocker; still requires in-engine scale/orientation and blind screenshot proof before replacing procedural art',
  };
}

function validatePromotedAssets() {
  const manifest = readJson(manifestPath);
  if (!manifest) return { kind: 'promoted', assets: [], readiness: { accepted: [], deferred: [], rejected: [] } };
  scanSecretBytes(manifestPath, Buffer.from(JSON.stringify(manifest), 'utf8'));

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (!Array.isArray(manifest.assets)) fail(`${rel(manifestPath)} must contain an assets array`);
  if (manifest.palette?.id !== REQUIRED_PALETTE_ID) fail(`${rel(manifestPath)} palette.id is ${JSON.stringify(manifest.palette?.id)}; expected ${REQUIRED_PALETTE_ID}`);

  const slugs = new Set();
  const readyAssets = assets.filter((asset) => asset.status === 'ready');
  const unusedAssets = assets.filter((asset) => asset.status === 'unused');
  const missingAssets = assets.filter((asset) => asset.status === 'missing');
  if (manifest.counts?.total !== assets.length) fail(`manifest counts.total ${manifest.counts?.total} does not match assets length ${assets.length}`);
  if (manifest.counts?.ready !== readyAssets.length) fail(`manifest counts.ready ${manifest.counts?.ready} does not match ready assets ${readyAssets.length}`);
  if (manifest.counts?.unused !== unusedAssets.length) fail(`manifest counts.unused ${manifest.counts?.unused} does not match unused assets ${unusedAssets.length}`);
  if ((manifest.counts?.missing ?? 0) !== missingAssets.length) fail(`manifest counts.missing ${manifest.counts?.missing} does not match missing assets ${missingAssets.length}`);

  const modelFiles = existsSync(modelsRoot)
    ? readdirSync(modelsRoot).filter((name) => name.toLowerCase().endsWith('.glb')).sort((a, b) => a.localeCompare(b))
    : [];
  if (!existsSync(modelsRoot)) fail(`${rel(modelsRoot)} is missing`);

  const expectedModelFiles = new Set(readyAssets.map((asset) => `${asset.slug}.glb`));
  for (const file of modelFiles) {
    if (!expectedModelFiles.has(file)) fail(`${rel(path.join(modelsRoot, file))} is not referenced by a ready manifest asset`);
  }
  for (const asset of readyAssets) {
    if (!modelFiles.includes(`${asset.slug}.glb`)) fail(`${asset.slug} is ready but models/${asset.slug}.glb is missing`);
  }

  const summaries = [];
  const readiness = { accepted: [], deferred: [], rejected: [] };
  for (const asset of assets) {
    if (!asset.slug) {
      fail('manifest asset is missing slug');
      continue;
    }
    if (slugs.has(asset.slug)) fail(`manifest has duplicate slug ${asset.slug}`);
    slugs.add(asset.slug);
    if (!['ready', 'unused', 'missing'].includes(asset.status)) fail(`${asset.slug} has unsupported status ${JSON.stringify(asset.status)}`);
    if (asset.status === 'unused') {
      if (asset.file !== null) fail(`${asset.slug} is unused but file is ${JSON.stringify(asset.file)}; expected null`);
      if (!asset.unusedReason) fail(`${asset.slug} is unused but has no unusedReason`);
      if (existsSync(path.join(modelsRoot, `${asset.slug}.glb`))) fail(`${asset.slug} is unused but has a promoted model file`);
    }
    if (asset.slug.startsWith('cave-mouth-') && asset.status !== 'unused') {
      fail(`${asset.slug} should stay unused because carved cave mouths are already the stronger runtime asset`);
    }
    if (asset.modularKit && !asset.wiringRisk) fail(`${asset.slug} is modularKit but has no wiringRisk note`);
    if (asset.replaces == null && asset.status === 'ready') warn(`${asset.slug} has no replaces pointer; verify the procedural owner before wiring`);

    let glbSummary = null;
    if (asset.status === 'ready') {
      if (asset.file !== `models/${asset.slug}.glb`) fail(`${asset.slug} file is ${JSON.stringify(asset.file)}; expected models/${asset.slug}.glb`);
      if (asset.paletteId !== REQUIRED_PALETTE_ID) fail(`${asset.slug} paletteId is ${JSON.stringify(asset.paletteId)}; expected ${REQUIRED_PALETTE_ID}`);
      const file = safeJoinUnder(kilnRoot, asset.file);
      if (!file) {
        fail(`${asset.slug} has unsafe file path ${JSON.stringify(asset.file)}`);
      } else {
        const glb = parseGlb(file);
        const geometry = geometryOf(glb?.json);
        const animations = animationsOf(glb?.json);
        if (glb && Number(asset.bytes ?? 0) !== glb.bytes) fail(`${asset.slug} manifest bytes ${asset.bytes} do not match file bytes ${glb.bytes}`);
        compareGeometry(asset.slug, asset.geometry, geometry);
        compareAnimations(asset.slug, asset.animations, animations);
        if (geometry.hasSkin) fail(`${asset.slug} has skin data; drop 1 expects node-transform or static assets only`);
        if (asset.category === 'character') {
          const names = new Set(animations.map((clip) => clip.name));
          if (AQUATIC_SINGLETON_SLUGS.has(asset.slug)) {
            if (!names.has('idle') || (!names.has('swim') && !names.has('pulse'))) {
              fail(`${asset.slug} aquatic character asset must include idle plus swim or pulse clips`);
            }
          } else if (SKY_SINGLETON_SLUGS.has(asset.slug)) {
            if (!names.has('idle') || (!names.has('flap') && !names.has('glide'))) {
              fail(`${asset.slug} sky-life character asset must include idle plus flap or glide clips`);
            }
          } else if (!names.has('idle') || !names.has('walk')) {
            fail(`${asset.slug} character asset must include idle and walk clips`);
          }
          if (!String(asset.animationPlayback ?? '').includes('AnimationMixer')) {
            fail(`${asset.slug} character asset must document AnimationMixer playback`);
          }
        }
        if (glb?.bytes > SOFT_MAX_GLB_BYTES) warn(`${asset.slug} is ${glb.kib} KiB, above the ${SOFT_MAX_GLB_BYTES / KiB} KiB soft per-file budget`);
        if (geometry.triangles > SOFT_MAX_TRIS) warn(`${asset.slug} has ${geometry.triangles} triangles, above the ${SOFT_MAX_TRIS} soft runtime budget`);
        if (geometry.meshCount > SOFT_MAX_MESHES) warn(`${asset.slug} has ${geometry.meshCount} meshes, above the ${SOFT_MAX_MESHES} soft repetition budget`);
        if (asset.instanceability === 'C') warn(`${asset.slug} has instanceability grade C`);
        glbSummary = { ...geometry, bytes: glb?.bytes ?? 0, kib: glb?.kib ?? 0, animations };
      }
    }
    const decision = decisionFor(asset, glbSummary);
    readiness[decision.state === 'accepted-candidate' ? 'accepted' : decision.state === 'deferred' ? 'deferred' : 'rejected'].push(decision);
    summaries.push({
      slug: asset.slug,
      title: asset.title ?? asset.slug,
      status: asset.status,
      file: asset.file ?? null,
      category: asset.category ?? null,
      role: asset.role ?? null,
      modularKit: !!asset.modularKit,
      wiringRisk: asset.wiringRisk ?? null,
      replaces: asset.replaces ?? null,
      bytes: asset.bytes ?? glbSummary?.bytes ?? 0,
      triangles: asset.geometry?.triangles ?? glbSummary?.triangles ?? 0,
      meshCount: asset.geometry?.meshCount ?? glbSummary?.meshCount ?? 0,
      materialCount: asset.geometry?.materialCount ?? glbSummary?.materialCount ?? 0,
      hasSkin: asset.geometry?.hasSkin ?? glbSummary?.hasSkin ?? false,
      bboxLocalSize: asset.geometry?.bboxLocal?.size ?? glbSummary?.bboxLocal?.size ?? null,
      animations: asset.animations ?? glbSummary?.animations ?? [],
      instanceability: asset.instanceability ?? 'unknown',
      decision,
    });
  }

  const totalModelBytes = summaries.filter((asset) => asset.status === 'ready').reduce((sum, asset) => sum + Number(asset.bytes ?? 0), 0);
  if (totalModelBytes > SOFT_MAX_TOTAL_BYTES) {
    warn(`promoted GLBs total ${(totalModelBytes / MiB).toFixed(2)} MiB, above the ${(SOFT_MAX_TOTAL_BYTES / MiB).toFixed(2)} MiB soft pack budget`);
  }

  return {
    kind: 'promoted',
    sourceOfTruth: rel(manifestPath),
    modelRoot: rel(modelsRoot),
    counts: {
      total: assets.length,
      ready: readyAssets.length,
      unused: unusedAssets.length,
      missing: missingAssets.length,
      modelFiles: modelFiles.length,
      modelBytes: totalModelBytes,
      modelMiB: Number((totalModelBytes / MiB).toFixed(2)),
      categories: countBy(summaries, 'category'),
      roles: countBy(summaries, 'role'),
      statuses: countBy(summaries, 'status'),
      curatedAccepted: readyAssets.length,
      runtimeReadiness: {
        pilotCandidates: readiness.accepted.length,
        deferred: readiness.deferred.length,
        rejected: readiness.rejected.length,
      },
      decisions: {
        accepted: readiness.accepted.length,
        deferred: readiness.deferred.length,
        rejected: readiness.rejected.length,
      },
    },
    readiness,
    assets: summaries,
  };
}

function validateGeneratedQuarantine() {
  if (!existsSync(generatedRoot)) {
    return { kind: 'generated', skipped: true, reason: 'local generated quarantine is absent', assetRoot: rel(generatedRoot) };
  }
  const catalog = existsSync(catalogPath) ? readJson(catalogPath) : null;
  const catalogSlugs = new Set((catalog?.assets ?? []).map((asset) => asset.slug).filter(Boolean));
  const dirs = readdirSync(generatedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(generatedRoot, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const assets = [];
  for (const dir of dirs) {
    const slug = path.basename(dir);
    const jsonPath = path.join(dir, 'asset.json');
    const glbPath = path.join(dir, 'model.glb');
    const glb = parseGlb(glbPath);
    const meta = existsSync(jsonPath) ? readJson(jsonPath) : null;
    if (existsSync(jsonPath)) scanSecretBytes(jsonPath, Buffer.from(readFileSync(jsonPath, 'utf8'), 'utf8'));
    if (meta?.status !== 'ok') fail(`${rel(jsonPath)} status is ${JSON.stringify(meta?.status)}; expected ok`);
    if (meta?.palette?.paletteId !== REQUIRED_PALETTE_ID) fail(`${rel(jsonPath)} paletteId is ${JSON.stringify(meta?.palette?.paletteId)}; expected ${REQUIRED_PALETTE_ID}`);
    if (catalog && !catalogSlugs.has(slug)) warn(`${slug} is present in generated quarantine but not in tools/kiln/assets-catalog.json`);
    assets.push({
      slug,
      file: rel(glbPath),
      bytes: glb?.bytes ?? 0,
      paletteId: meta?.palette?.paletteId ?? null,
      category: meta?.category ?? 'unknown',
      grade: meta?.quality?.instanceability?.grade ?? 'unknown',
    });
  }
  return {
    kind: 'generated',
    assetRoot: rel(generatedRoot),
    catalogFound: !!catalog,
    counts: {
      assets: assets.length,
      glbs: assets.filter((asset) => asset.bytes > 0).length,
      totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
      totalMiB: Number((assets.reduce((sum, asset) => sum + asset.bytes, 0) / MiB).toFixed(2)),
    },
    assets,
  };
}

function main() {
  mkdirSync(outputDir, { recursive: true });
  const promotedAvailable = existsSync(manifestPath);
  const proof = {
    generatedAt: new Date().toISOString(),
    mode,
    decision: {
      status: 'pending',
      sourceOfTruth: promotedAvailable ? rel(manifestPath) : rel(generatedRoot),
      runtimeImport: promotedAvailable ? 'candidate-gated' : 'deferred',
      promoteOrder: 'validate generated quarantine, promote ready assets with tools/kiln/scripts/promote.mjs, then validate promoted manifest/models before runtime wiring',
    },
    budgets: {
      softMaxGlbKiB: SOFT_MAX_GLB_BYTES / KiB,
      softMaxTotalMiB: SOFT_MAX_TOTAL_BYTES / MiB,
      softMaxTris: SOFT_MAX_TRIS,
      softMaxMeshes: SOFT_MAX_MESHES,
    },
    promoted: null,
    generated: null,
    gitHygiene: null,
    warnings,
    failures,
  };

  proof.gitHygiene = validateGitHygiene();
  if (mode === 'generated') {
    proof.generated = validateGeneratedQuarantine();
    proof.decision.status = failures.length === 0 ? 'generated-quarantine-pass' : 'failed';
  } else {
    proof.promoted = validatePromotedAssets();
    proof.generated = validateGeneratedQuarantine();
    proof.decision.status = failures.length === 0 ? 'promoted-pass' : 'failed';
  }

  writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  if (proof.promoted) {
    console.log(`Kiln promoted asset proof wrote ${rel(proofPath)}`);
    console.log(`${proof.promoted.counts.curatedAccepted} curated assets accepted, ${proof.promoted.counts.modelMiB} MiB, ${proof.promoted.counts.runtimeReadiness.pilotCandidates} runtime pilot candidates, ${proof.promoted.counts.runtimeReadiness.deferred} deferred, ${proof.promoted.counts.runtimeReadiness.rejected} rejected, ${warnings.length} warnings, ${failures.length} failures`);
  } else if (proof.generated?.skipped) {
    console.log(`Kiln generated quarantine absent; wrote skipped proof to ${rel(proofPath)}`);
  } else {
    console.log(`Kiln generated quarantine proof wrote ${rel(proofPath)}`);
    console.log(`${proof.generated?.counts.assets ?? 0} generated assets, ${proof.generated?.counts.totalMiB ?? 0} MiB, ${warnings.length} warnings, ${failures.length} failures`);
  }
  if (failures.length > 0) {
    throw new Error(`Kiln asset proof failed with ${failures.length} issue(s); see ${rel(proofPath)}`);
  }
}

main();
