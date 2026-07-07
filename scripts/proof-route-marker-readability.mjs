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
const outDir = path.join(root, 'output', 'playwright', 'route-marker-readability');
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

function proofUrl(port) {
  return process.env.PROOF_URL || `http://127.0.0.1:${port}/?nosave=1&resetSave=1&creative=1`;
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
        opaque++;
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
  const signature = buffer.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return { ok: false, reason: 'not a png', samples: 0, unique: 0 };
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
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
        return { ok: false, reason: `unsupported png format ${bitDepth}/${colorType}`, samples: 0, unique: 0 };
      }
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
    if (y % Math.max(1, Math.floor(height / 32)) === 0) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 32))) {
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

async function seedRouteMarkers(page) {
  return page.evaluate(() => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.nearbyTiles || !world?.placeStructure) {
      throw new Error('missing route-marker proof hooks');
    }
    const empty = JSON.parse(world.save.export());
    empty.structures = [];
    empty.craftedItems = { ...empty.craftedItems, waystone: 8, caveAnchor: 4 };
    if (!world.save.import(JSON.stringify(empty))) throw new Error('failed to reset proof save');

    const tiles = world.nearbyTiles(3).filter((tile) => tile !== empty.player.tile);
    const plan = ['waystone', 'waystone', 'waystone', 'waystone', 'waystone', 'caveAnchor', 'caveAnchor', 'caveAnchor'];
    const placed = [];
    for (const item of plan) {
      let ok = false;
      while (tiles.length > 0 && !ok) {
        const tile = tiles.shift();
        ok = world.placeStructure(item, tile);
        if (ok) placed.push({ item, tile });
      }
      if (!ok) throw new Error(`failed to place ${item}`);
    }

    const save = JSON.parse(world.save.export());
    const marks = ['survey', 'home', 'cave', 'shore', 'forage'];
    const anchors = [
      { anchorUses: 1, anchorKind: 'arch', anchorLabel: 'proof land arch', anchorDepth: 4, anchorDistance: 1, anchorFlooded: false, anchorSpring: false, anchorClearance: 3, anchorTile: placed[5].tile },
      { anchorUses: 1, anchorKind: 'dryCave', anchorLabel: 'proof dry cave', anchorDepth: 12.75, anchorDistance: 1, anchorFlooded: false, anchorSpring: true, anchorClearance: 4, anchorTile: placed[6].tile },
      { anchorUses: 1, anchorKind: 'seaCave', anchorLabel: 'proof sea cave', anchorDepth: 8.5, anchorDistance: 2, anchorFlooded: true, anchorSpring: false, anchorClearance: 3, anchorTile: placed[7].tile },
    ];
    let w = 0;
    let a = 0;
    for (const structure of save.structures) {
      if (structure.item === 'waystone') structure.state = { waystone: marks[w++], markerUses: 1 };
      if (structure.item === 'caveAnchor') structure.state = anchors[a++];
    }
    if (!world.save.import(JSON.stringify(save))) throw new Error('failed to import proof marker state');

    const text = JSON.parse(window.render_game_to_text());
    return {
      placed,
      textStructures: text.structures,
      worldStructures: world.structures(),
      navigation: world.navigation(),
    };
  });
}

async function runViewport(browser, targetUrl, name, viewport) {
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
  const seeded = await seedRouteMarkers(page);
  await page.waitForTimeout(900);
  const canvasProbe = await canvasPixelProbe(page);
  const screenshot = path.join(outDir, `${name}-route-markers.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  await page.close();

  const renderer = seeded.textStructures?.renderer;
  const routeSilhouettes = renderer?.routeSilhouettes ?? 0;
  const routeReadabilityRoles = renderer?.routeReadabilityRoles ?? 0;
  const waystones = seeded.navigation?.waystones?.length ?? 0;
  const caveAnchors = seeded.navigation?.caveAnchors?.length ?? 0;
  if (routeSilhouettes < 2) throw new Error(`${name}: expected at least 2 route marker silhouettes, got ${routeSilhouettes}`);
  if (routeReadabilityRoles < 18) throw new Error(`${name}: expected at least 18 marker roles, got ${routeReadabilityRoles}`);
  if (waystones < 1 || caveAnchors < 1) throw new Error(`${name}: missing route readback waystones/caveAnchors`);
  if (!canvasProbe.ok && !screenshotProbe.ok) throw new Error(`${name}: pixel probe failed ${JSON.stringify({ canvasProbe, screenshotProbe })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    name,
    viewport,
    screenshot,
    renderer,
    waystones,
    caveAnchors,
    pixelProbe: { canvas: canvasProbe, screenshot: screenshotProbe },
    consoleErrors,
    pageErrors,
  };
}

await fs.mkdir(outDir, { recursive: true });
const port = await getFreePort();
const url = proofUrl(port);
const server = startServer(port);
try {
  await waitForServer(url);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const results = [];
  try {
    results.push(await runViewport(browser, url, 'desktop', { width: 1440, height: 900 }));
    results.push(await runViewport(browser, url, 'phone', { width: 390, height: 844, isMobile: true, hasTouch: true }));
  } finally {
    await browser.close();
  }
  const proof = {
    ok: true,
    url,
    generatedAt: new Date().toISOString(),
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await stopServer(server);
}
