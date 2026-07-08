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
const outDir = path.join(root, 'output', 'playwright', 'k10-resource-drop-skins');
const requestedPort = Number(process.env.PROOF_PORT || 0);

const expectedDropSkins = [
  'drop-wood-logs',
  'drop-ore-chunk',
  'drop-dirt-clod',
  'drop-sand-pile',
  'drop-snow-clump',
  'drop-glow-crystal',
  'drop-raw-fish',
  'drop-kelp-reeds',
  'drop-compost-pellet',
  'drop-cave-mushroom',
  'drop-creature-fiber',
  'node-root-pod',
];

const dropSpawnPlan = [
  { item: 'wood', source: 'tree', skin: 'drop-wood-logs' },
  { item: 'rock', source: 'mine', skin: 'drop-ore-chunk' },
  { item: 'dirt', source: 'mine', skin: 'drop-dirt-clod' },
  { item: 'sand', source: 'mine', skin: 'drop-sand-pile' },
  { item: 'snow', source: 'mine', skin: 'drop-snow-clump' },
  { item: 'glowCrystal', source: 'mine', skin: 'drop-glow-crystal' },
  { item: 'rawFish', source: 'debug', skin: 'drop-raw-fish' },
  { item: 'kelp', source: 'debug', skin: 'drop-kelp-reeds' },
  { item: 'reeds', source: 'debug', skin: 'drop-kelp-reeds' },
  { item: 'reeds', source: 'creature', skin: 'drop-creature-fiber' },
  { item: 'seeds', source: 'creature', skin: 'node-root-pod' },
  { item: 'compost', source: 'creature', skin: 'drop-compost-pellet' },
  { item: 'caveMushroom', source: 'creature', skin: 'drop-cave-mushroom' },
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
    probe.width = 24;
    probe.height = 24;
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
    return { ok: opaque > 16 && colors.size > 3, samples: opaque, unique: colors.size };
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
  for (let y = 0; y < height; y++) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x++) {
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
    return !!world?.debugSpawnWoodDrops
      && !!world?.debugSpawnResourceDrops
      && !!world?.debugCollectDrops
      && !!world?.resourceDrops
      && !!world?.save?.export
      && !!world?.save?.import
      && typeof window.render_game_to_text === 'function';
  }, null, { timeout: 45000 });
  await page.waitForTimeout(600);
}

async function seedDropProof(page) {
  return page.evaluate((plan) => {
    const world = window.__world;
    const save = JSON.parse(world.save.export());
    save.drops = [];
    save.inventory = Array.isArray(save.inventory) ? save.inventory.map(() => 0) : save.inventory;
    save.craftedItems = {};
    if (!world.save.import(JSON.stringify(save))) throw new Error('failed to reset K10 proof save');
    const tile = world.player?.tile ?? save.player?.tile ?? 0;
    const spawned = plan.map((entry) => {
      const result = world.debugSpawnResourceDrops(entry.item, 1, tile, entry.source);
      return { ...entry, ok: result.ok, drops: result.drops ?? [], diagnostics: result.diagnostics };
    });
    const saved = JSON.parse(world.save.export());
    return {
      tile,
      spawned,
      baselineSave: saved,
      diagnostics: world.resourceDrops(),
    };
  }, dropSpawnPlan);
}

function assertDropRenderer(renderer, label) {
  if (!renderer || typeof renderer !== 'object') throw new Error(`${label}: missing drop renderer diagnostics`);
  if ((renderer.kilnSkinsLoaded ?? 0) < dropSpawnPlan.length) throw new Error(`${label}: expected at least ${dropSpawnPlan.length} loaded Kiln drop-skin instances, got ${renderer.kilnSkinsLoaded}`);
  if ((renderer.kilnSkinsPending ?? 0) !== 0) throw new Error(`${label}: Kiln drop skins still pending ${renderer.kilnSkinsPending}`);
  if ((renderer.kilnSkinFallbacks ?? 0) !== 0) throw new Error(`${label}: Kiln drop skin fallback triggered ${renderer.kilnSkinFallbacks}`);
  if ((renderer.batchedInstances ?? 0) < dropSpawnPlan.length) throw new Error(`${label}: expected batched instances for spawned pickup drops ${JSON.stringify(renderer)}`);
  if ((renderer.instancedDrawCalls ?? 999) > 32) throw new Error(`${label}: draw-call budget exceeded; expected <= 32 material-batched draw calls, got ${renderer.instancedDrawCalls}`);

  for (const slug of expectedDropSkins) {
    const skin = renderer.kilnDropSkinsBySlug?.[slug];
    if (!skin?.loaded || !skin?.instancedMeshes) throw new Error(`${label}: ${slug} GLB skin did not load into an instanced batch`);
    const fit = renderer.kilnSkinFits?.[slug];
    if (fit?.batchingPolicy !== 'instanced-merged-by-material') throw new Error(`${label}: ${slug} batching policy drifted ${JSON.stringify(fit)}`);
    if (fit?.animationPolicy !== 'matrix-bob-only') throw new Error(`${label}: ${slug} pickup animation policy drifted ${JSON.stringify(fit)}`);
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
  const seeded = await seedDropProof(page);
  await page.waitForFunction((expectedCount) => {
    const renderer = window.__world?.resourceDrops?.().renderer;
    return renderer
      && (renderer.kilnSkinsLoaded ?? 0) >= expectedCount
      && (renderer.kilnSkinsPending ?? 1) === 0
      && (renderer.kilnSkinFallbacks ?? 1) === 0
      && (renderer.batchedInstances ?? 0) >= expectedCount;
  }, dropSpawnPlan.length, { timeout: 20000 });
  await page.waitForTimeout(500);

  const beforeCollect = await page.evaluate(() => ({
    drops: window.__world.resourceDrops(),
    save: JSON.parse(window.__world.save.export()),
  }));
  const screenshot = path.join(outDir, `${name}-k10-resource-drop-skins.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const pixelProbe = await canvasPixelProbe(page);
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  const collected = await page.evaluate(() => {
    const beforeStats = window.__world.stats?.();
    const result = window.__world.debugCollectDrops(1.4);
    const afterStats = window.__world.stats?.();
    return {
      before: { wood: beforeStats?.wood ?? 0, rock: beforeStats?.rock ?? 0 },
      result: { wood: result.wood, rock: result.rock, drops: result.drops, inventory: result.inventory },
      after: { wood: afterStats?.wood ?? 0, rock: afterStats?.rock ?? 0 },
      drops: window.__world.resourceDrops(),
      save: JSON.parse(window.__world.save.export()),
    };
  });
  await page.waitForTimeout(250);
  const afterCollect = await page.evaluate(() => ({
    drops: window.__world.resourceDrops(),
    save: JSON.parse(window.__world.save.export()),
  }));
  await page.close();

  assertDropRenderer(beforeCollect.drops.renderer, name);

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${name}: missing successful Kiln manifest response`);
  for (const slug of expectedDropSkins) {
    if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${name}: missing successful ${slug}.glb response`);
  }
  if (generatedRequests.length > 0) throw new Error(`${name}: runtime requested raw generated Kiln assets ${JSON.stringify(generatedRequests)}`);
  if (!pixelProbe.ok && !screenshotProbe.ok) throw new Error(`${name}: pixel probe failed ${JSON.stringify({ canvas: pixelProbe, screenshot: screenshotProbe })}`);
  if ((afterCollect.drops.count ?? 1) !== 0) throw new Error(`${name}: spawned drops did not collect cleanly ${JSON.stringify(afterCollect.drops)}`);
  const materialInventory = afterCollect.save?.inventory ?? [];
  const craftedItems = afterCollect.save?.craftedItems ?? {};
  const collectedCounts = {
    dirt: materialInventory[0] ?? 0,
    rock: materialInventory[1] ?? 0,
    sand: materialInventory[2] ?? 0,
    snow: materialInventory[3] ?? 0,
    wood: materialInventory[4] ?? 0,
    glowCrystal: craftedItems.glowCrystal ?? 0,
    rawFish: craftedItems.rawFish ?? 0,
    kelp: craftedItems.kelp ?? 0,
    reeds: craftedItems.reeds ?? 0,
    seeds: craftedItems.seeds ?? 0,
    compost: craftedItems.compost ?? 0,
    caveMushroom: craftedItems.caveMushroom ?? 0,
  };
  for (const item of ['wood', 'rock', 'dirt', 'sand', 'snow', 'glowCrystal', 'rawFish', 'kelp', 'reeds', 'seeds', 'compost', 'caveMushroom']) {
    if ((collectedCounts[item] ?? 0) <= 0) throw new Error(`${name}: ${item} did not collect into inventory ${JSON.stringify(collectedCounts)}`);
  }
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    name,
    viewport,
    screenshot,
    seeded,
    beforeCollect: { drops: beforeCollect.drops, save: beforeCollect.save },
    afterCollect: { drops: afterCollect.drops, save: afterCollect.save, collectedCounts },
    collection: collected,
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
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await stopServer(server);
}
