import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to resolve Playwright. Install it or set NODE_PATH to a local node_modules containing playwright. ${message}`);
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'output', 'playwright', 'k5-tree-skins');
const requestedPort = Number(process.env.PROOF_PORT || 0);
const treeSlugByKind = {
  pine: 'tree-pine',
  broadleaf: 'tree-broadleaf',
  deadSnag: 'tree-dead-snag',
  shrub: 'tree-shrub',
};
const requiredTreeSlugs = Object.values(treeSlugByKind);

async function getFreePort() {
  if (requestedPort > 0) return requestedPort;
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(targetUrl, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(targetUrl, (res) => {
        res.resume();
        resolve((res.statusCode ?? 500) < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

function proofUrl(port, touch = false) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('nosave', '1');
  url.searchParams.set('resetSave', '1');
  url.searchParams.set('creative', '1');
  url.searchParams.set('mute', '1');
  if (touch) url.searchParams.set('touch', '1');
  return url.toString();
}

function startServer(port) {
  if (process.env.PROOF_URL) return null;
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npm, ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    env: { ...process.env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function stopServer(child) {
  if (!child) return;
  if (process.platform === 'win32' && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      killer.on('error', () => {
        child.kill();
        resolve();
      });
      killer.on('close', resolve);
    });
    return;
  }
  child.kill('SIGTERM');
}

async function canvasPixelProbe(page) {
  return page.evaluate(() => {
    const source = document.querySelector('canvas');
    if (!source) return { ok: false, reason: 'missing canvas', samples: 0, unique: 0 };
    const probe = document.createElement('canvas');
    probe.width = 28;
    probe.height = 28;
    const ctx = probe.getContext('2d');
    if (!ctx) return { ok: false, reason: 'missing 2d context', samples: 0, unique: 0 };
    ctx.drawImage(source, 0, 0, probe.width, probe.height);
    const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
    const colors = new Set();
    let opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 20) {
        opaque += 1;
        colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      }
    }
    return { ok: opaque > 20 && colors.size > 4, samples: opaque, unique: colors.size };
  });
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function pngPixelProbe(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return { ok: false, reason: 'not a png', samples: 0, unique: 0 };
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return { ok: false, reason: `unsupported png ${bitDepth}/${colorType}`, samples: 0, unique: 0 };
    } else if (type === 'IDAT') {
      chunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const prev = Buffer.alloc(stride);
  const row = Buffer.alloc(stride);
  const colors = new Set();
  let samples = 0;
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      const value = raw[src++];
      row[x] = (value + (
        filter === 0 ? 0
        : filter === 1 ? left
        : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2)
        : paeth(left, up, upLeft)
      )) & 255;
    }
    if (y % Math.max(1, Math.floor(height / 24)) === 0) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
        const i = x * channels;
        const a = channels === 4 ? row[i + 3] : 255;
        if (a > 8) {
          colors.add(`${row[i]},${row[i + 1]},${row[i + 2]}`);
          samples += 1;
        }
      }
    }
    prev.set(row);
  }
  return { ok: colors.size >= 12 && samples > 40, samples, unique: colors.size, width, height };
}

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const world = window.__world;
    return !!world?.debugSpawnAtTreeKind
      && !!world?.debugStrikeTree
      && !!world?.debugCollectDrops
      && !!world?.treeAssets
      && !!world?.resourceDrops
      && typeof window.render_game_to_text === 'function';
  }, null, { timeout: 45000 });
  await page.waitForTimeout(700);
}

async function waitForTreeRenderer(page, slug, timeout = 60000) {
  await page.waitForFunction((targetSlug) => {
    const renderer = window.__world?.treeAssets?.().renderer;
    if (!renderer) return false;
    if (!renderer.readyForProceduralReplacement || renderer.proceduralFallbackActive || !renderer.renderEnabled) return false;
    if ((renderer.kilnTreeSkinsPending ?? 1) !== 0 || (renderer.kilnTreeSkinFallbacks ?? 1) !== 0) return false;
    if ((renderer.instancedDrawCalls ?? 999) > 16) return false;
    if (targetSlug) {
      const bySlug = renderer.kilnTreeSkinsBySlug?.[targetSlug];
      return !!bySlug && (bySlug.batchedInstances ?? 0) > 0 && (bySlug.instancedMeshes ?? 0) > 0;
    }
    return (renderer.batchedInstances ?? 0) > 0;
  }, slug, { timeout });
}

function assertTreeRenderer(renderer, label, requiredVisibleSlug = null) {
  if (!renderer || typeof renderer !== 'object') throw new Error(`${label}: missing tree renderer diagnostics`);
  if (!renderer.readyForProceduralReplacement) throw new Error(`${label}: tree skins are not ready for procedural replacement`);
  if (renderer.proceduralFallbackActive) throw new Error(`${label}: procedural chunk trees still active after tree GLBs loaded`);
  if (!renderer.renderEnabled) throw new Error(`${label}: Kiln tree renderer is not visible`);
  if ((renderer.kilnTreeSkinsPending ?? 0) !== 0) throw new Error(`${label}: Kiln tree skins still pending ${renderer.kilnTreeSkinsPending}`);
  if ((renderer.kilnTreeSkinFallbacks ?? 0) !== 0) throw new Error(`${label}: Kiln tree skin fallback triggered ${renderer.kilnTreeSkinFallbacks}`);
  if ((renderer.batchedInstances ?? 0) <= 0) throw new Error(`${label}: expected visible batched tree instances`);
  if ((renderer.instancedDrawCalls ?? 999) > 16) throw new Error(`${label}: draw-call budget exceeded; expected <=16 instanced draws, got ${renderer.instancedDrawCalls}`);
  if ((renderer.animationLodDistance ?? 0) !== 96) throw new Error(`${label}: animation LOD distance drifted ${renderer.animationLodDistance}`);

  for (const slug of requiredTreeSlugs) {
    const bySlug = renderer.kilnTreeSkinsBySlug?.[slug];
    if (!bySlug?.instancedMeshes) throw new Error(`${label}: ${slug} did not create an instanced batch ${JSON.stringify(bySlug)}`);
    if ((bySlug.pending ?? 0) !== 0 || (bySlug.fallback ?? 0) !== 0) throw new Error(`${label}: ${slug} has pending/fallback state ${JSON.stringify(bySlug)}`);
    const fit = renderer.kilnTreeSkinFits?.[slug];
    if (fit?.batchingPolicy !== 'instanced-merged-by-material' || fit?.animationPolicy !== 'matrix-sway-near-and-damage-only') {
      throw new Error(`${label}: ${slug} policy drifted ${JSON.stringify(fit)}`);
    }
    if (!String(fit?.sourceUrl ?? '').includes(`/assets/kiln/models/${slug}.glb`)) {
      throw new Error(`${label}: ${slug} source URL is not a committed model path ${JSON.stringify(fit)}`);
    }
  }

  if (requiredVisibleSlug) {
    const bySlug = renderer.kilnTreeSkinsBySlug?.[requiredVisibleSlug];
    if ((bySlug?.batchedInstances ?? 0) <= 0) throw new Error(`${label}: ${requiredVisibleSlug} was not visible in the resident tree batch`);
  }
}

async function visitTreeKind(page, kind) {
  const slug = treeSlugByKind[kind];
  const spawned = await page.evaluate((targetKind) => window.__world.debugSpawnAtTreeKind(targetKind), kind);
  if (!spawned?.ok) throw new Error(`failed to spawn at ${kind} tree ${JSON.stringify(spawned)}`);
  await waitForTreeRenderer(page, slug);
  await page.waitForTimeout(350);
  const diagnostics = await page.evaluate(() => ({
    treeAssets: window.__world.treeAssets(),
    pick: window.__world.debugPick?.(),
    textLength: window.render_game_to_text().length,
  }));
  assertTreeRenderer(diagnostics.treeAssets.renderer, `visit ${kind}`, slug);
  return { kind, slug, spawned, diagnostics };
}

async function chopTreeProof(page) {
  const spawned = await page.evaluate(() => window.__world.debugSpawnAtTreeKind('pine'));
  if (!spawned?.ok) throw new Error(`failed to spawn at pine for chop proof ${JSON.stringify(spawned)}`);
  await waitForTreeRenderer(page, treeSlugByKind.pine);
  const before = await page.evaluate(() => ({
    treeAssets: window.__world.treeAssets(),
    drops: window.__world.resourceDrops(),
    inventory: { wood: window.__world.stats?.().wood ?? 0 },
  }));
  const strikes = [];
  for (let i = 0; i < 8; i += 1) {
    const strike = await page.evaluate((tile) => window.__world.debugStrikeTree(tile), spawned.treeTile);
    strikes.push(strike);
    if (strike?.result?.felled) break;
    await page.waitForTimeout(120);
  }
  if (!strikes.some((strike) => strike?.result?.felled)) throw new Error(`pine did not fell within proof strike budget ${JSON.stringify(strikes)}`);
  await page.waitForFunction((tile) => {
    const drops = window.__world?.resourceDrops?.();
    return window.__world?.trees?.hasTree?.(tile) === false && (drops?.wood ?? 0) > 0;
  }, spawned.treeTile, { timeout: 15000 });
  const afterFell = await page.evaluate(() => ({
    treeAssets: window.__world.treeAssets(),
    drops: window.__world.resourceDrops(),
    inventory: { wood: window.__world.stats?.().wood ?? 0 },
  }));
  const collected = await page.evaluate(() => window.__world.debugCollectDrops(1.4));
  const afterCollect = await page.evaluate(() => ({
    treeAssets: window.__world.treeAssets(),
    drops: window.__world.resourceDrops(),
    inventory: { wood: window.__world.stats?.().wood ?? 0 },
  }));
  if ((afterFell.drops?.wood ?? 0) <= 0) throw new Error(`felled tree did not spawn wood drops ${JSON.stringify(afterFell)}`);
  if ((afterCollect.inventory?.wood ?? 0) <= before.inventory.wood) throw new Error(`wood pickup did not increase inventory ${JSON.stringify({ before, collected, afterCollect })}`);
  assertTreeRenderer(afterCollect.treeAssets.renderer, 'after chop');
  return { spawned, before, strikes, afterFell, collected, afterCollect };
}

async function runViewport(browser, targetUrl, name, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  const kilnAssetRequests = [];
  const kilnAssetResponses = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/assets/kiln/')) kilnAssetRequests.push(url);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (url.includes('/assets/kiln/')) kilnAssetResponses.push({ url, status: response.status() });
  });

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForWorld(page);
  await waitForTreeRenderer(page, null);
  const visits = [];
  for (const kind of Object.keys(treeSlugByKind)) visits.push(await visitTreeKind(page, kind));
  const chop = await chopTreeProof(page);
  const screenshot = path.join(outDir, `${name}-k5-tree-skins.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const pixelProbe = await canvasPixelProbe(page);
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  const finalDiagnostics = await page.evaluate(() => ({
    treeAssets: window.__world.treeAssets(),
    resourceDrops: window.__world.resourceDrops(),
    textLength: window.render_game_to_text().length,
  }));
  await page.close();

  assertTreeRenderer(finalDiagnostics.treeAssets.renderer, name);

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${name}: missing successful Kiln manifest response`);
  for (const slug of requiredTreeSlugs) {
    if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${name}: missing successful ${slug}.glb response`);
  }
  if (generatedRequests.length > 0) throw new Error(`${name}: runtime requested raw generated Kiln assets ${JSON.stringify(generatedRequests)}`);
  if ((!pixelProbe.ok && !screenshotProbe.ok) || screenshotBuffer.length < 1024) throw new Error(`${name}: pixel proof failed ${JSON.stringify({ canvas: pixelProbe, screenshot: screenshotProbe })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    name,
    viewport,
    screenshot,
    visits,
    chop,
    finalDiagnostics,
    kilnAssets: {
      requests: kilnAssetRequests,
      responses: kilnAssetResponses,
      generatedRequests,
    },
    pixelProbe: { canvas: pixelProbe, screenshot: screenshotProbe },
    consoleErrors,
    pageErrors,
  };
}

await fs.mkdir(outDir, { recursive: true });
const port = await getFreePort();
const server = startServer(port);
try {
  await waitForServer(proofUrl(port));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const results = [];
  try {
    results.push(await runViewport(browser, proofUrl(port), 'desktop', { width: 1440, height: 900 }));
    results.push(await runViewport(browser, proofUrl(port, true), 'phone', { width: 390, height: 844, isMobile: true, hasTouch: true }));
  } finally {
    await browser.close();
  }
  const proof = {
    ok: true,
    generatedAt: new Date().toISOString(),
    requiredTreeSlugs,
    drawCallBudget: '<=16 instanced tree draws after material batching',
    animationLod: 'cosmetic sway only inside 96 world units; damage feedback remains matrix-driven',
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({
    ok: proof.ok,
    generatedAt: proof.generatedAt,
    requiredTreeSlugs,
    results: results.map((result) => ({
      name: result.name,
      screenshot: result.screenshot,
      finalTrees: result.finalDiagnostics.treeAssets.renderer.currentTrees,
      instancedDrawCalls: result.finalDiagnostics.treeAssets.renderer.instancedDrawCalls,
      generatedRequests: result.kilnAssets.generatedRequests.length,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
      screenshotProbe: result.pixelProbe.screenshot,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
