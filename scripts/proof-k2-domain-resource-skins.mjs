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
const outDir = path.join(root, 'output', 'playwright', 'k2-domain-resource-skins');
const requestedPort = Number(process.env.PROOF_PORT || 0);
const requiredNodeSlugs = [
  'node-hearth-coal',
  'node-rain-reed',
  'node-salt-shell',
  'node-lantern-shard',
  'node-root-pod',
  'node-red-nodule',
  'node-snow-bloom',
  'node-glass-shard',
  'node-storm-amber',
  'node-reed-kelp',
  'node-bell-crystal',
  'node-horizon-shard',
];

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
    return !!world?.debugRevealDomainResources
      && !!world?.debugSpawnAtDomainResource
      && !!world?.domainResources
      && !!world?.save?.export
      && !!world?.save?.import
      && typeof window.render_game_to_text === 'function';
  }, null, { timeout: 45000 });
  await page.waitForTimeout(600);
}

async function seedDomainResourceProof(page) {
  return page.evaluate(() => {
    const world = window.__world;
    const save = JSON.parse(world.save.export());
    save.progression = {
      ...(save.progression ?? {}),
      pentagons: [],
      domainHarvests: [],
    };
    if (!world.save.import(JSON.stringify(save))) throw new Error('failed to reset K2 proof save');
    const revealed = world.debugRevealDomainResources(12);
    const spawn = world.debugSpawnAtDomainResource('lanternShard') ?? world.debugSpawnAtDomainResource();
    return {
      revealed,
      spawn,
      diagnostics: world.domainResources(),
      text: window.render_game_to_text(),
    };
  });
}

function assertDomainRenderer(renderer, label) {
  if (!renderer || typeof renderer !== 'object') throw new Error(`${label}: missing domain renderer diagnostics`);
  if ((renderer.kinds ?? 0) < 12) throw new Error(`${label}: expected 12 resource kinds, got ${renderer.kinds}`);
  if ((renderer.silhouettes ?? 0) < 12) throw new Error(`${label}: expected 12 silhouettes, got ${renderer.silhouettes}`);
  if ((renderer.kilnSkinsLoaded ?? 0) < 36) throw new Error(`${label}: expected all 36 revealed nodes to use Kiln bodies, got ${renderer.kilnSkinsLoaded}`);
  if ((renderer.kilnSkinsPending ?? 0) !== 0) throw new Error(`${label}: Kiln domain skins still pending ${renderer.kilnSkinsPending}`);
  if ((renderer.kilnSkinFallbacks ?? 0) !== 0) throw new Error(`${label}: Kiln domain skin fallback triggered ${renderer.kilnSkinFallbacks}`);
  if ((renderer.batchedInstances ?? 0) < 36) throw new Error(`${label}: expected at least 36 batched node instances ${JSON.stringify(renderer)}`);
  if ((renderer.instancedDrawCalls ?? 999) > 40) throw new Error(`${label}: draw-call budget exceeded; expected <= 40 material-batched calls, got ${renderer.instancedDrawCalls}`);

  for (const slug of requiredNodeSlugs) {
    const bySlug = renderer.kilnSkinsBySlug?.[slug];
    if (!bySlug?.loaded || !bySlug?.instancedMeshes || !bySlug?.batchedInstances) {
      throw new Error(`${label}: ${slug} did not load into an instanced batch ${JSON.stringify(bySlug)}`);
    }
    if ((bySlug.pending ?? 0) !== 0 || (bySlug.fallback ?? 0) !== 0) {
      throw new Error(`${label}: ${slug} has pending/fallback state ${JSON.stringify(bySlug)}`);
    }
    const fit = renderer.kilnSkinFits?.[slug];
    if (fit?.batchingPolicy !== 'instanced-merged-by-material' || fit?.animationPolicy !== 'matrix-pulse-only') {
      throw new Error(`${label}: ${slug} policy drifted ${JSON.stringify(fit)}`);
    }
    if (!String(fit?.sourceUrl ?? '').includes(`/assets/kiln/models/${slug}.glb`)) {
      throw new Error(`${label}: ${slug} source URL is not a committed model path ${JSON.stringify(fit)}`);
    }
  }
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
  const seeded = await seedDomainResourceProof(page);
  await page.waitForFunction((slugs) => {
    const renderer = window.__world?.domainResources?.().renderer;
    if (!renderer || (renderer.kilnSkinsLoaded ?? 0) < 36 || (renderer.kilnSkinsPending ?? 1) !== 0 || (renderer.kilnSkinFallbacks ?? 1) !== 0 || (renderer.batchedInstances ?? 0) < 36) return false;
    return slugs.every((slug) => {
      const entry = renderer.kilnSkinsBySlug?.[slug];
      return entry && entry.loaded > 0 && entry.instancedMeshes > 0 && entry.batchedInstances > 0;
    });
  }, requiredNodeSlugs, { timeout: 30000 });
  await page.waitForTimeout(800);

  const beforeScreenshot = await page.evaluate(() => ({
    domainResources: window.__world.domainResources(),
    text: window.render_game_to_text(),
  }));
  const screenshot = path.join(outDir, `${name}-k2-domain-resource-skins.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const pixelProbe = await canvasPixelProbe(page);
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  await page.close();

  assertDomainRenderer(beforeScreenshot.domainResources.renderer, name);

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${name}: missing successful Kiln manifest response`);
  for (const slug of requiredNodeSlugs) {
    if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${name}: missing successful ${slug}.glb response`);
  }
  if (generatedRequests.length > 0) throw new Error(`${name}: runtime requested raw generated Kiln assets ${JSON.stringify(generatedRequests)}`);
  if ((!pixelProbe.ok && !screenshotProbe.ok) || screenshotBuffer.length < 1024) throw new Error(`${name}: pixel proof failed ${JSON.stringify({ canvas: pixelProbe, screenshot: screenshotProbe })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    name,
    viewport,
    screenshot,
    seeded,
    beforeScreenshot,
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
    requiredNodeSlugs,
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await stopServer(server);
}
