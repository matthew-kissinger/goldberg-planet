import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

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
const outDir = path.join(root, 'output', 'playwright', 'panel-ownership');
const requestedPort = Number(process.env.PROOF_PORT || 0);

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
      row[x] = filter === 0 ? value
        : filter === 1 ? (value + left) & 255
        : filter === 2 ? (value + up) & 255
        : filter === 3 ? (value + Math.floor((left + up) / 2)) & 255
        : filter === 4 ? (value + paeth(left, up, upLeft)) & 255
        : value;
    }
    if (y % Math.max(1, Math.floor(height / 28)) === 0) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 28))) {
        const i = x * channels;
        if (channels === 3 || row[i + 3] > 20) {
          samples++;
          colors.add(`${row[i] >> 4},${row[i + 1] >> 4},${row[i + 2] >> 4}`);
        }
      }
    }
    prev.set(row);
  }
  return { ok: samples > 16 && colors.size > 8, width, height, samples, unique: colors.size };
}

async function textState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function assertPanel(page, expected, label) {
  const state = await textState(page);
  if (state.panels?.activePanel !== expected) throw new Error(`${label}: expected active panel ${expected}, got ${state.panels?.activePanel}`);
  if (state.panels?.worldInputBlocked !== true) throw new Error(`${label}: expected world input blocked`);
  const visible = await page.evaluate(() => ['crafting', 'route', 'journal', 'storage'].filter((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hide') && getComputedStyle(el).display !== 'none';
  }));
  const expectedId = expected === 'routeSlate' ? 'route' : expected;
  if (visible.length !== 1 || visible[0] !== expectedId) throw new Error(`${label}: expected only ${expectedId} visible, got ${visible.join(',') || 'none'}`);
  const rect = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, innerWidth, innerHeight };
  }, expectedId);
  if (!rect || rect.width < 40 || rect.height < 40) throw new Error(`${label}: missing usable panel rect`);
  if (rect.left < -1 || rect.top < -1 || rect.right > rect.innerWidth + 1 || rect.bottom > rect.innerHeight + 1) {
    throw new Error(`${label}: panel rect outside viewport ${JSON.stringify(rect)}`);
  }
  return { state, visible, rect };
}

async function screenshot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  const buffer = await page.screenshot({ path: file, fullPage: true });
  const probe = pngPixelProbe(buffer);
  if (!probe.ok) throw new Error(`${name}: screenshot pixel probe failed ${JSON.stringify(probe)}`);
  return { file, probe };
}

async function blockWorldKeys(page, label) {
  const before = await textState(page);
  await page.keyboard.down('w');
  await page.keyboard.down(' ');
  await page.waitForTimeout(500);
  await page.keyboard.up(' ');
  await page.keyboard.up('w');
  const after = await textState(page);
  if (after.player.tile !== before.player.tile) throw new Error(`${label}: player tile changed from ${before.player.tile} to ${after.player.tile}`);
  if (after.mode !== before.mode) throw new Error(`${label}: mode changed from ${before.mode} to ${after.mode}`);
  if ((after.player.speed ?? 0) > 0.1) throw new Error(`${label}: player speed leaked through panel (${after.player.speed})`);
  return { before: before.player, after: after.player };
}

async function seedChest(page) {
  return page.evaluate(() => {
    const world = window.__world;
    if (!world?.nearbyTiles || !world?.placeStructure || !world?.openChest) throw new Error('missing chest proof hooks');
    const tiles = world.nearbyTiles(2).filter((tile) => tile !== world.player.tile);
    for (const tile of tiles) {
      if (world.placeStructure('chest', tile)) {
        if (!world.openChest()) throw new Error('placed chest did not open');
        return { tile, storage: world.storage() };
      }
    }
    throw new Error('failed to place proof chest');
  });
}

async function runKeyboardProfile(browser, targetUrl, name, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.keyboard.press('b');
  await page.waitForTimeout(250);
  const crafting = await assertPanel(page, 'crafting', `${name} crafting`);
  const craftingBlock = await blockWorldKeys(page, `${name} crafting`);
  const craftingShot = await screenshot(page, `${name}-crafting-owner`);

  await page.keyboard.press('m');
  await page.waitForTimeout(350);
  const route = await assertPanel(page, 'routeSlate', `${name} route`);
  const routeBlock = await blockWorldKeys(page, `${name} route`);
  const routeShot = await screenshot(page, `${name}-route-owner`);

  await page.keyboard.press('j');
  await page.waitForTimeout(350);
  const journal = await assertPanel(page, 'journal', `${name} journal`);
  const journalBlock = await blockWorldKeys(page, `${name} journal`);
  const journalShot = await screenshot(page, `${name}-journal-owner`);

  const storageSeed = await seedChest(page);
  await page.waitForTimeout(350);
  const storage = await assertPanel(page, 'storage', `${name} storage`);
  const storageBlock = await blockWorldKeys(page, `${name} storage`);
  const storageShot = await screenshot(page, `${name}-storage-owner`);

  const pointerLock = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return document.pointerLockElement ? document.pointerLockElement.id || document.pointerLockElement.tagName : null;
  });
  if (pointerLock !== null) throw new Error(`${name}: panel click left pointer lock active on ${pointerLock}`);

  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  return {
    name,
    viewport,
    ux: crafting.state.panels,
    crafting,
    route,
    journal,
    storage,
    storageSeed,
    blocked: { craftingBlock, routeBlock, journalBlock, storageBlock },
    screenshots: [craftingShot, routeShot, journalShot, storageShot],
    consoleErrors,
    pageErrors,
  };
}

async function runTouchProfile(browser, targetUrl, name, viewport) {
  const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.tap('#btn-craft');
  await page.waitForTimeout(300);
  const crafting = await assertPanel(page, 'crafting', `${name} crafting`);
  const craftingShot = await screenshot(page, `${name}-touch-crafting-owner`);

  await page.tap('#btn-route');
  await page.waitForTimeout(350);
  const route = await assertPanel(page, 'routeSlate', `${name} route`);
  const routeBlock = await blockWorldKeys(page, `${name} route`);
  const routeShot = await screenshot(page, `${name}-touch-route-owner`);

  const storageSeed = await seedChest(page);
  await page.waitForTimeout(350);
  const storage = await assertPanel(page, 'storage', `${name} storage`);
  const storageBlock = await blockWorldKeys(page, `${name} storage`);
  const storageShot = await screenshot(page, `${name}-touch-storage-owner`);

  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  return {
    name,
    viewport,
    ux: route.state.inventory.controls.ux,
    crafting,
    route,
    storage,
    storageSeed,
    blocked: { routeBlock, storageBlock },
    screenshots: [craftingShot, routeShot, storageShot],
    consoleErrors,
    pageErrors,
  };
}

async function runGamepadProfile(browser, targetUrl) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  await page.evaluate(() => window.__world.injectGamepad({ craft: true }, 2));
  await page.waitForTimeout(350);
  const crafting = await assertPanel(page, 'crafting', 'gamepad crafting');
  await page.evaluate(() => window.__world.injectGamepad({ menuDown: true, confirm: true, moveY: 1, jump: true }, 4));
  await page.waitForTimeout(500);
  const craftingAfter = await textState(page);
  if (craftingAfter.panels?.activePanel !== 'crafting') throw new Error('gamepad crafting panel lost ownership');
  const craftingShot = await screenshot(page, 'gamepad-crafting-owner');

  await page.evaluate(() => window.__world.injectGamepad({ cancel: true }, 2));
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__world.injectGamepad({ chart: true }, 2));
  await page.waitForTimeout(350);
  const route = await assertPanel(page, 'routeSlate', 'gamepad route');
  await page.evaluate(() => window.__world.injectGamepad({ menuDown: true, moveY: 1, jump: true }, 4));
  await page.waitForTimeout(500);
  const routeAfter = await textState(page);
  if (routeAfter.panels?.activePanel !== 'routeSlate') throw new Error('gamepad route panel lost ownership');
  const routeShot = await screenshot(page, 'gamepad-route-owner');

  await seedChest(page);
  await page.waitForTimeout(350);
  const storage = await assertPanel(page, 'storage', 'gamepad storage');
  await page.evaluate(() => window.__world.injectGamepad({ menuDown: true, confirm: true, moveY: 1, jump: true }, 4));
  await page.waitForTimeout(500);
  const storageAfter = await textState(page);
  if (storageAfter.panels?.activePanel !== 'storage') throw new Error('gamepad storage panel lost ownership');
  const storageShot = await screenshot(page, 'gamepad-storage-owner');

  if (consoleErrors.length || pageErrors.length) throw new Error(`gamepad: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  return {
    name: 'gamepad',
    ux: storageAfter.inventory.controls.ux,
    crafting,
    route,
    storage,
    screenshots: [craftingShot, routeShot, storageShot],
    consoleErrors,
    pageErrors,
  };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const server = startServer(port);
  const targetUrl = proofUrl(port, false);
  const touchUrl = proofUrl(port, true);
  try {
    await waitForServer(targetUrl);
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    const results = [];
    results.push(await runKeyboardProfile(browser, targetUrl, 'pc', { width: 1440, height: 900 }));
    results.push(await runKeyboardProfile(browser, targetUrl, 'laptop', { width: 1366, height: 720 }));
    results.push(await runTouchProfile(browser, touchUrl, 'tablet', { width: 820, height: 1180 }));
    results.push(await runTouchProfile(browser, touchUrl, 'phone', { width: 390, height: 844 }));
    results.push(await runGamepadProfile(browser, targetUrl));
    await browser.close();

    const proof = {
      generatedAt: new Date().toISOString(),
      targetUrl,
      touchUrl,
      results: results.map((result) => ({
        name: result.name,
        viewport: result.viewport,
        ux: result.ux,
        storageSeed: result.storageSeed,
        screenshots: result.screenshots.map((shot) => ({ file: path.relative(root, shot.file), probe: shot.probe })),
        panels: {
          crafting: result.crafting?.state?.panels,
          route: result.route?.state?.panels,
          journal: result.journal?.state?.panels,
          storage: result.storage?.state?.panels,
        },
        blocked: result.blocked,
        consoleErrors: result.consoleErrors,
        pageErrors: result.pageErrors,
      })),
    };
    await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify(proof, null, 2));
  } finally {
    await stopServer(server);
  }
}

main().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
