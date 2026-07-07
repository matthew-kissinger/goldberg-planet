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
const outDir = path.join(root, 'output', 'playwright', 'd2-threshold-spaces');
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
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    return { ok: false, reason: 'not a png', samples: 0, unique: 0 };
  }
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
        return { ok: false, reason: `unsupported png ${bitDepth}/${colorType}`, samples: 0, unique: 0 };
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
    if (y % Math.max(1, Math.floor(height / 30)) === 0) {
      for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 30))) {
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

async function seedD2HearthSpace(page) {
  return page.evaluate(async () => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.openThresholdTerrain) {
      throw new Error('missing D2 hearth proof hooks');
    }
    const sites = world.landmarks().sites;
    const hearth = sites.find((site) => site.kind === 'hearthNiche');
    if (!hearth) throw new Error('missing hearth site');
    const empty = JSON.parse(world.save.export());
    const importSave = (patch) => {
      const next = {
        ...empty,
        structures: patch.structures ?? [],
        craftedItems: { ...(patch.craftedItems ?? {}) },
        progression: {
          ...(empty.progression ?? {}),
          routePlan: null,
          thresholdChamberObservations: [],
          siteCompletions: [],
          ...(patch.progression ?? {}),
        },
        survival: { stamina: 84, exposure: 12, mealsEaten: 0, collapseCount: 0, trailFocus: 0, ...(patch.survival ?? {}) },
        time: { day: 12, minute: 10 * 60, ...(patch.time ?? {}) },
      };
      if (!world.save.import(JSON.stringify(next))) throw new Error('failed to import proof save');
    };
    importSave({
      craftedItems: {},
      progression: {
        pentagons: [hearth.originTile],
        siteCompletions: [hearth.tile],
      },
    });
    world.spawnAtPentagon(hearth.landmark.index);
    const hearthTerrain = world.openThresholdTerrain(hearth.tile);
    const hearthAfter = {
      text: JSON.parse(window.render_game_to_text()),
      navigation: world.navigation(),
      landmarks: world.landmarks(),
      thresholdChambers: world.thresholdChambers(),
    };
    return { hearth, hearthTerrain, hearthAfter };
  });
}

async function seedD2BellSpace(page) {
  return page.evaluate(async () => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.completeSiteWork || !world?.inspectThresholdChamber) {
      throw new Error('missing D2 bell proof hooks');
    }
    const sites = world.landmarks().sites;
    const bell = sites.find((site) => site.kind === 'bellCave');
    if (!bell) throw new Error('missing bell site');
    const empty = JSON.parse(world.save.export());
    const importSave = (patch) => {
      const next = {
        ...empty,
        structures: patch.structures ?? [],
        craftedItems: { ...(patch.craftedItems ?? {}) },
        progression: {
          ...(empty.progression ?? {}),
          routePlan: null,
          thresholdChamberObservations: [],
          siteCompletions: [],
          ...(patch.progression ?? {}),
        },
        survival: { stamina: 84, exposure: 12, mealsEaten: 0, collapseCount: 0, trailFocus: 0, ...(patch.survival ?? {}) },
        time: { day: 12, minute: 10 * 60, ...(patch.time ?? {}) },
      };
      if (!world.save.import(JSON.stringify(next))) throw new Error('failed to import proof save');
    };

    importSave({
      craftedItems: { echoLantern: 1 },
      progression: {
        pentagons: [bell.originTile],
        siteCompletions: [],
      },
    });
    world.spawnAtPentagon(bell.landmark.index);
    const playerTile = world.player.tile;
    const candidates = [bell.tile];
    const seen = new Set(candidates);
    for (let i = 0; i < candidates.length && candidates.length < 12; i += 1) {
      const tile = candidates[i];
      const degree = world.geo.degreeOf(tile);
      for (let k = 0; k < degree && candidates.length < 12; k += 1) {
        const next = world.geo.neighbor(tile, k);
        if (seen.has(next) || next === playerTile) continue;
        seen.add(next);
        candidates.push(next);
      }
    }
    const before = new Set(world.structures().items.map((structure) => structure.id));
    let anchor = null;
    for (const tile of candidates) {
      if (!world.placeStructure('caveAnchor', tile)) continue;
      anchor = world.structures().items.find((structure) => !before.has(structure.id));
      if (anchor) break;
    }
    if (!anchor) throw new Error('failed to place bell cave anchor');
    const anchored = JSON.parse(world.save.export());
    const savedAnchor = anchored.structures.find((structure) => structure.id === anchor.id);
    savedAnchor.state = { anchorKind: 'dryCave', anchorTile: anchor.tile, anchorDepth: 18.5, anchorClearance: 5, anchorUses: 1 };
    if (!world.save.import(JSON.stringify(anchored))) throw new Error('failed to import anchored proof save');

    const bellReady = world.siteWork(bell.tile);
    const bellCompletion = world.completeSiteWork(bell.tile);
    const bellBeforeRead = {
      text: JSON.parse(window.render_game_to_text()),
      navigation: world.navigation(),
      landmarks: world.landmarks(),
      thresholdChambers: world.thresholdChambers(),
    };
    const bellRead = world.inspectThresholdChamber();
    const bellAfterRead = {
      text: JSON.parse(window.render_game_to_text()),
      navigation: world.navigation(),
      landmarks: world.landmarks(),
      thresholdChambers: world.thresholdChambers(),
    };
    return { bell, bellReady, bellCompletion, bellBeforeRead, bellRead, bellAfterRead };
  });
}

function assertD2(result, name) {
  if (!result.hearth?.hearthTerrain?.ok) throw new Error(`${name}: hearth terrain did not open`);
  if ((result.hearth.hearthTerrain.changedCells ?? 0) < 20 || result.hearth.hearthTerrain.tileSpan !== 5 || result.hearth.hearthTerrain.role !== 'underpass') {
    throw new Error(`${name}: hearth underpass too small ${JSON.stringify(result.hearth.hearthTerrain)}`);
  }
  if (!result.bell?.bellReady?.ready) throw new Error(`${name}: bell site was not ready ${JSON.stringify(result.bell?.bellReady)}`);
  if (!result.bell.bellCompletion?.ok || !result.bell.bellCompletion?.terrain?.ok) {
    throw new Error(`${name}: bell site did not complete terrain ${JSON.stringify(result.bell.bellCompletion)}`);
  }
  const terrain = result.bell.bellCompletion.terrain;
  if ((terrain.changedCells ?? 0) < 24 || terrain.tileSpan !== 4 || terrain.carveDepthCells !== 6 || terrain.role !== 'chamber') {
    throw new Error(`${name}: bell chamber too small ${JSON.stringify(terrain)}`);
  }
  const beforePin = result.bell.bellBeforeRead.navigation?.slate?.pins?.find((pin) => pin.id === 'thresholdChamber');
  if (!beforePin || !String(beforePin.detail ?? '').includes('+2 glow crystals')) {
    throw new Error(`${name}: bell threshold chamber missing from Route Slate ${JSON.stringify(result.bell.bellBeforeRead.navigation?.slate?.pins ?? [])}`);
  }
  if (!result.bell.bellRead?.ok || (result.bell.bellRead.after?.observed ?? 0) <= (result.bell.bellRead.before?.observed ?? 0)) {
    throw new Error(`${name}: bell threshold chamber was not observed ${JSON.stringify(result.bell.bellRead)}`);
  }
  const glowAfter = result.bell.bellAfterRead.text?.inventory?.crafted?.glowCrystal ?? 0;
  if (glowAfter < 2) throw new Error(`${name}: bell threshold reward missing ${glowAfter}`);
  const afterNext = result.bell.bellAfterRead.text?.journal?.state?.next?.map((entry) => entry.label) ?? [];
  if (afterNext.includes('Read the threshold')) throw new Error(`${name}: journal still asks to read observed bell chamber`);
}

async function runViewport(browser, targetUrl, name, viewport, options = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: options.touch ? 2 : 1,
    isMobile: !!options.touch,
    hasTouch: !!options.touch,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const hearth = await seedD2HearthSpace(page);
  await page.waitForTimeout(900);
  const hearthScreenshot = path.join(outDir, `${name}-hearth-underpass.png`);
  const hearthScreenshotProbe = pngPixelProbe(await page.screenshot({ path: hearthScreenshot, fullPage: true }));
  if (!hearthScreenshotProbe.ok) throw new Error(`${name}: hearth screenshot pixel probe failed ${JSON.stringify(hearthScreenshotProbe)}`);
  const bell = await seedD2BellSpace(page);
  await page.waitForTimeout(900);
  const seeded = { hearth, bell };
  assertD2(seeded, name);
  const bellScreenshot = path.join(outDir, `${name}-bell-chamber.png`);
  const bellScreenshotProbe = pngPixelProbe(await page.screenshot({ path: bellScreenshot, fullPage: true }));
  if (!bellScreenshotProbe.ok) throw new Error(`${name}: bell screenshot pixel probe failed ${JSON.stringify(bellScreenshotProbe)}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  return {
    name,
    viewport,
    touch: !!options.touch,
    hearthScreenshot,
    bellScreenshot,
    hearthTerrain: seeded.hearth.hearthTerrain,
    bellTerrain: seeded.bell.bellCompletion.terrain,
    bellRead: seeded.bell.bellRead,
    glowCrystal: seeded.bell.bellAfterRead.text?.inventory?.crafted?.glowCrystal ?? 0,
    hearthScreenshotProbe,
    bellScreenshotProbe,
    consoleErrors,
    pageErrors,
  };
}

await fs.mkdir(outDir, { recursive: true });
const port = await getFreePort();
const targetUrl = proofUrl(port, false);
const touchUrl = proofUrl(port, true);
const server = startServer(port);
try {
  await waitForServer(targetUrl);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const results = [];
  try {
    results.push(await runViewport(browser, targetUrl, 'desktop', { width: 1440, height: 900 }));
    results.push(await runViewport(browser, touchUrl, 'phone-touch', { width: 390, height: 844 }, { touch: true }));
  } finally {
    await browser.close();
  }
  const proof = {
    ok: true,
    targetUrl,
    touchUrl,
    generatedAt: new Date().toISOString(),
    results: results.map((result) => ({
      ...result,
      hearthScreenshot: path.relative(root, result.hearthScreenshot),
      bellScreenshot: path.relative(root, result.bellScreenshot),
    })),
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    proof: path.relative(root, path.join(outDir, 'proof.json')),
    profiles: proof.results.map((result) => ({
      name: result.name,
      hearthScreenshot: result.hearthScreenshot,
      bellScreenshot: result.bellScreenshot,
      hearthCells: result.hearthTerrain.changedCells,
      hearthTiles: result.hearthTerrain.changedTiles.length,
      bellCells: result.bellTerrain.changedCells,
      bellTiles: result.bellTerrain.changedTiles.length,
      bellObserved: result.bellRead.after.observed,
      glowCrystal: result.glowCrystal,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
