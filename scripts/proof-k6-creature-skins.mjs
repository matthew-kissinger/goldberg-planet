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
const outDir = path.join(root, 'output', 'playwright', 'k6-creature-skins');
const requestedPort = Number(process.env.PROOF_PORT || 0);

const creatureSlugByKind = {
  mossPuff: 'creature-moss-puff',
  shellSkitter: 'creature-shell-skitter',
  reedbackGrazer: 'creature-reedback-grazer',
  caveBlinker: 'creature-cave-blinker',
  brambleback: 'creature-brambleback',
  caveBelljaw: 'creature-cave-belljaw',
  screeSnapper: 'creature-scree-snapper',
  stormBurr: 'creature-storm-burr',
  tideLurker: 'creature-tide-lurker',
};

const harmlessKinds = new Set(['mossPuff', 'shellSkitter', 'reedbackGrazer', 'caveBlinker']);
const requiredCreatureSlugs = Object.values(creatureSlugByKind);
const expectedClipMetadata = {
  'creature-moss-puff': { idle: { durationSec: 3, channels: 6 }, walk: { durationSec: 1.6, channels: 10 } },
  'creature-brambleback': { idle: { durationSec: 2, channels: 4 }, walk: { durationSec: 0.8, channels: 8 } },
  'creature-shell-skitter': { idle: { durationSec: 2, channels: 8 }, walk: { durationSec: 0.8, channels: 13 } },
  'creature-reedback-grazer': { idle: { durationSec: 2, channels: 3 }, walk: { durationSec: 1.2, channels: 8 } },
  'creature-cave-belljaw': { idle: { durationSec: 2, channels: 5 }, walk: { durationSec: 1.2, channels: 8 } },
  'creature-cave-blinker': { idle: { durationSec: 3, channels: 8 }, walk: { durationSec: 1.2, channels: 10 } },
  'creature-scree-snapper': { idle: { durationSec: 3, channels: 5 }, walk: { durationSec: 1.2, channels: 8 } },
  'creature-storm-burr': { idle: { durationSec: 1.6, channels: 6 }, walk: { durationSec: 0.8, channels: 8 } },
  'creature-tide-lurker': { idle: { durationSec: 3, channels: 9 }, walk: { durationSec: 1.6, channels: 9 } },
};

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
    probe.width = 32;
    probe.height = 32;
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
    return { ok: opaque > 24 && colors.size > 4, samples: opaque, unique: colors.size };
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
    return !!world?.debugSpawnAtNativeLifeKind
      && !!world?.nativeLife
      && !!world?.tendNativeLife
      && !!world?.wardNativeHazard
      && !!world?.giveItem
      && !!world?.setZoom
      && typeof window.render_game_to_text === 'function';
  }, null, { timeout: 45000 });
  await page.evaluate(() => {
    window.__world.giveItem('stoneBlade', 4);
    window.__world.giveItem('stoneHatchet', 4);
    window.__world.giveItem('lantern', 2);
    window.__world.giveItem('echoLantern', 2);
    window.__world.giveItem('reedBow', 2);
    window.__world.giveItem('whistlingArrow', 12);
    window.__world.giveItem('stormCloak', 2);
    window.__world.setZoom(0);
  });
  await page.waitForTimeout(700);
}

async function waitForCreatureSkin(page, slug, timeout = 60000) {
  await page.waitForFunction((targetSlug) => {
    const renderer = window.__world?.nativeLife?.().renderer;
    if (!renderer) return false;
    const bySlug = renderer.kilnCreatureSkinsBySlug?.[targetSlug];
    return !!bySlug
      && (bySlug.loaded ?? 0) > 0
      && (bySlug.pending ?? 0) === 0
      && (bySlug.fallback ?? 0) === 0
      && (renderer.kilnCreatureSkinFallbacks ?? 0) === 0;
  }, slug, { timeout });
}

async function setZoomAndWait(page, zoomExp) {
  await page.evaluate((value) => window.__world.setZoom(value), zoomExp);
  await page.waitForTimeout(650);
}

function assertClipMetadata(slug, fit) {
  const expected = expectedClipMetadata[slug];
  if (!expected) throw new Error(`${slug}: missing expected clip metadata in proof`);
  const byName = Object.fromEntries((fit?.animationClips ?? []).map((clip) => [clip.name, clip]));
  for (const [name, wanted] of Object.entries(expected)) {
    const actual = byName[name];
    if (!actual) throw new Error(`${slug}: missing ${name} animation metadata ${JSON.stringify(fit)}`);
    if (Math.abs(Number(actual.durationSec) - wanted.durationSec) > 0.02) {
      throw new Error(`${slug}: ${name} duration drifted ${actual.durationSec}; expected ${wanted.durationSec}`);
    }
    if (Number(actual.channels) !== wanted.channels) {
      throw new Error(`${slug}: ${name} channels drifted ${actual.channels}; expected ${wanted.channels}`);
    }
  }
}

function assertRendererPolicies(renderer, label, requiredVisibleSlug = null, options = {}) {
  if (!renderer || typeof renderer !== 'object') throw new Error(`${label}: missing native-life renderer diagnostics`);
  if ((renderer.kilnCreatureSkinFallbacks ?? 0) !== 0) throw new Error(`${label}: creature GLB fallback triggered ${renderer.kilnCreatureSkinFallbacks}`);
  if ((renderer.kilnCreatureSkinsPending ?? 0) !== 0) throw new Error(`${label}: creature GLBs still pending ${renderer.kilnCreatureSkinsPending}`);
  if ((renderer.activeMixers ?? 999) > 8) throw new Error(`${label}: active mixer budget exceeded ${renderer.activeMixers}`);
  if (options.requireOverlays !== false && (renderer.telegraphRoles ?? 0) < 1) throw new Error(`${label}: expected code-owned telegraph/reward overlays to remain visible`);

  const slugsToCheck = options.requireAllFits
    ? requiredCreatureSlugs
    : requiredVisibleSlug
    ? [requiredVisibleSlug]
    : [];
  for (const slug of slugsToCheck) {
    const fit = renderer.kilnCreatureSkinFits?.[slug];
    if (!fit) throw new Error(`${label}: missing fit diagnostics for ${slug}`);
    if (fit.animationPolicy !== 'mixer-near-freeze-far') throw new Error(`${label}: ${slug} animation policy drifted ${JSON.stringify(fit)}`);
    if (fit.activeMixerRadius !== 90 || fit.lowRateMixerRadius !== 135 || fit.frozenMixerRadius !== 180) {
      throw new Error(`${label}: ${slug} mixer radii drifted ${JSON.stringify(fit)}`);
    }
    if (!String(fit.sourceUrl ?? '').includes(`/assets/kiln/models/${slug}.glb`)) {
      throw new Error(`${label}: ${slug} source URL is not a committed model path ${JSON.stringify(fit)}`);
    }
    assertClipMetadata(slug, fit);
  }

  if (requiredVisibleSlug) {
    const bySlug = renderer.kilnCreatureSkinsBySlug?.[requiredVisibleSlug];
    if ((bySlug?.loaded ?? 0) <= 0 || (bySlug?.glbVisible ?? 0) <= 0) {
      throw new Error(`${label}: ${requiredVisibleSlug} is not visible as a GLB skin ${JSON.stringify(bySlug)}`);
    }
  }
}

async function assertDistanceBands(page, slug) {
  await setZoomAndWait(page, 0);
  await waitForActiveCreatureSkin(page, slug);

  await setZoomAndWait(page, 0.51);
  await page.waitForFunction((targetSlug) => {
    const bySlug = window.__world?.nativeLife?.().renderer?.kilnCreatureSkinsBySlug?.[targetSlug];
    return (bySlug?.lowRateMixers ?? 0) > 0 && (bySlug?.glbVisible ?? 0) > 0;
  }, slug, { timeout: 15000 });

  await setZoomAndWait(page, 0.62);
  await page.waitForFunction((targetSlug) => {
    const bySlug = window.__world?.nativeLife?.().renderer?.kilnCreatureSkinsBySlug?.[targetSlug];
    return (bySlug?.hidden ?? 0) > 0 && (bySlug?.glbVisible ?? 0) === 0;
  }, slug, { timeout: 15000 });

  await setZoomAndWait(page, 0);
  await waitForActiveCreatureSkin(page, slug);
}

async function waitForActiveCreatureSkin(page, slug) {
  await page.waitForFunction((targetSlug) => {
    const bySlug = window.__world?.nativeLife?.().renderer?.kilnCreatureSkinsBySlug?.[targetSlug];
    return (bySlug?.activeMixers ?? 0) > 0 && (bySlug?.glbVisible ?? 0) > 0;
  }, slug, { timeout: 15000 });
}

async function visitCreatureKind(page, kind, distanceBandProof = false) {
  const slug = creatureSlugByKind[kind];
  const spawned = await page.evaluate((targetKind) => window.__world.debugSpawnAtNativeLifeKind(targetKind), kind);
  if (!spawned?.ok) throw new Error(`failed to spawn at ${kind} native creature ${JSON.stringify(spawned)}`);
  await waitForCreatureSkin(page, slug);
  await setZoomAndWait(page, 0);
  if (distanceBandProof) await assertDistanceBands(page, slug);
  else await waitForActiveCreatureSkin(page, slug);
  const beforeAction = await page.evaluate(() => window.__world.nativeLife());
  const acted = harmlessKinds.has(kind)
    ? await page.evaluate(() => window.__world.tendNativeLife())
    : await page.evaluate(() => window.__world.wardNativeHazard());
  if (acted !== true) throw new Error(`${kind}: expected gameplay action to be handled`);
  await page.waitForTimeout(300);
  const afterAction = await page.evaluate(() => window.__world.nativeLife());
  assertRendererPolicies(afterAction.renderer, `visit ${kind}`, slug, { requireOverlays: !harmlessKinds.has(kind) });
  return { kind, slug, spawned, beforeAction, acted, afterAction };
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
  const visits = [];
  let distanceBandProofDone = false;
  for (const kind of Object.keys(creatureSlugByKind)) {
    visits.push(await visitCreatureKind(page, kind, !distanceBandProofDone));
    distanceBandProofDone = true;
  }
  const screenshot = path.join(outDir, `${name}-k6-creature-skins.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const pixelProbe = await canvasPixelProbe(page);
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  const finalDiagnostics = await page.evaluate(() => ({
    nativeLife: window.__world.nativeLife(),
    resourceDrops: window.__world.resourceDrops(),
    textLength: window.render_game_to_text().length,
  }));
  await page.close();

  assertRendererPolicies(finalDiagnostics.nativeLife.renderer, name, null, { requireAllFits: true, requireOverlays: true });

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${name}: missing successful Kiln manifest response`);
  for (const slug of requiredCreatureSlugs) {
    if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${name}: missing successful ${slug}.glb response`);
  }
  if (generatedRequests.length > 0) throw new Error(`${name}: runtime requested raw generated Kiln assets ${JSON.stringify(generatedRequests)}`);
  if ((!pixelProbe.ok && !screenshotProbe.ok) || screenshotBuffer.length < 1024) throw new Error(`${name}: pixel proof failed ${JSON.stringify({ canvas: pixelProbe, screenshot: screenshotProbe, screenshotBytes: screenshotBuffer.length })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    name,
    viewport,
    screenshot,
    visits,
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
    requiredCreatureSlugs,
    mixerPolicy: 'active <=90wu, low-rate <=135wu, frozen <=180wu, hidden beyond 180wu',
    activeMixerBudget: '<=8 active native-life mixers in proof view',
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({
    ok: proof.ok,
    generatedAt: proof.generatedAt,
    requiredCreatureSlugs,
    results: results.map((result) => ({
      name: result.name,
      screenshot: result.screenshot,
      mixerCounts: {
        active: result.finalDiagnostics.nativeLife.renderer.activeMixers,
        lowRate: result.finalDiagnostics.nativeLife.renderer.lowRateMixers,
        frozen: result.finalDiagnostics.nativeLife.renderer.frozenMixers,
        hidden: result.finalDiagnostics.nativeLife.renderer.hiddenCreatureSkins,
      },
      glbVisible: result.finalDiagnostics.nativeLife.renderer.kilnCreatureGlbVisible,
      fallbacks: result.finalDiagnostics.nativeLife.renderer.kilnCreatureSkinFallbacks,
      generatedRequests: result.kilnAssets.generatedRequests.length,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
      pixelProbe: result.pixelProbe,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
