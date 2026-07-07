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
const outDir = path.join(root, 'output', 'playwright', 'hearth-contract');
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

async function seedHearthContract(page, activateGamepad = false) {
  return page.evaluate(async (useGamepad) => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.placeStructure || !world?.useStructure || !world?.landmarks) {
      throw new Error('missing hearth-contract proof hooks');
    }
    const initialSites = world.landmarks().sites;
    const hearthIndex = initialSites.findIndex((site) => site.kind === 'hearthNiche');
    const initialHearth = initialSites[hearthIndex >= 0 ? hearthIndex : 0];
    if (!initialHearth) throw new Error('missing hearth expedition site');

    const empty = JSON.parse(world.save.export());
    empty.structures = [];
    empty.craftedItems = {
      ...empty.craftedItems,
      bedroll: 2,
      roofBundle: 4,
      doorKit: 2,
      campfire: 2,
      workbench: 2,
      chest: 2,
      rootCellar: 2,
      windowFrame: 1,
      weatherVane: 1,
      cropPlot: 1,
      rainCistern: 1,
      trailRation: 2,
    };
    empty.progression = {
      ...(empty.progression ?? {}),
      pentagons: [initialHearth.originTile],
      siteCompletions: [],
      routePlan: null,
    };
    empty.survival = { stamina: 42, exposure: 46, mealsEaten: 0, collapseCount: 0, trailFocus: 0 };
    empty.time = { day: 8, minute: 23 * 60 };
    if (!world.save.import(JSON.stringify(empty))) throw new Error('failed to reset proof save');
    world.spawnAtPentagon(hearthIndex >= 0 ? hearthIndex : 0);
    if (useGamepad) world.injectGamepad({ use: true }, 2);

    const playerTile = world.player.tile;
    const used = new Set([playerTile]);
    const hearthSite = world.landmarks().sites[hearthIndex >= 0 ? hearthIndex : 0];
    if (!hearthSite?.discovered) throw new Error('hearth site was not marked discovered');
    const allStructures = () => world.structures().items;
    const rawNeighborsOf = (tile, rings = 1) => {
      const seen = new Set([tile]);
      const queue = [{ tile, ring: 0 }];
      for (let i = 0; i < queue.length; i += 1) {
        const entry = queue[i];
        if (entry.ring >= rings) continue;
        const degree = world.geo.degreeOf(entry.tile);
        for (let k = 0; k < degree; k += 1) {
          const next = world.geo.neighbor(entry.tile, k);
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push({ tile: next, ring: entry.ring + 1 });
        }
      }
      return [...seen];
    };
    const neighborsOf = (tile, rings = 1) => rawNeighborsOf(tile, rings).filter((tile) => tile !== playerTile);
    const place = (item, candidates) => {
      for (const tile of candidates) {
        if (used.has(tile)) continue;
        const before = new Set(allStructures().map((s) => s.id));
        if (!world.placeStructure(item, tile)) continue;
        const placed = allStructures().find((s) => !before.has(s.id));
        if (!placed) throw new Error(`placed ${item} but could not find it`);
        used.add(tile);
        return placed;
      }
      throw new Error(`failed to place ${item}; candidates=${JSON.stringify(candidates.map((tile) => ({ tile, degree: world.geo.degreeOf(tile), used: used.has(tile), player: tile === playerTile })))} structures=${JSON.stringify(allStructures().map((s) => ({ id: s.id, item: s.item, tile: s.tile })))}`);
    };
    const snapshot = (label) => ({
      label,
      text: JSON.parse(window.render_game_to_text()),
      stats: world.stats(),
      structures: world.structures(),
      navigation: world.navigation(),
      landmarks: world.landmarks(),
      journal: world.journal(),
      siteWork: world.siteWork(hearthSite.tile),
      siteThreshold: world.siteThreshold(hearthSite.tile),
      thresholdTerrain: world.thresholdTerrain(),
    });

    const incomplete = snapshot('incomplete');

    const siteRing = neighborsOf(hearthSite.tile, 1);
    const bedrollTile = siteRing.find((tile) => world.geo.degreeOf(tile) >= 6 && !rawNeighborsOf(tile, 1).includes(playerTile))
      ?? siteRing.find((tile) => world.geo.degreeOf(tile) >= 6)
      ?? siteRing.find((tile) => !rawNeighborsOf(tile, 1).includes(playerTile))
      ?? siteRing[0];
    const bedroll = place('bedroll', [bedrollTile, ...siteRing].filter((tile, index, all) => all.indexOf(tile) === index));
    const local = neighborsOf(bedroll.tile, 1);
    const support = neighborsOf(bedroll.tile, 2);
    const placed = { bedroll };
    for (const item of ['roofBundle', 'roofBundle', 'doorKit', 'campfire', 'workbench', 'chest']) {
      const structure = place(item, local);
      placed[`${item}-${structure.id}`] = structure;
      if (item === 'campfire' && !world.useStructure(structure.id)) throw new Error('failed to light campfire');
    }
    if (!world.useStructure(bedroll.id)) throw new Error('failed to claim home bedroll');
    const ready = snapshot('ready');
    const completion = world.completeSiteWork(hearthSite.tile);
    if (!completion?.ok) throw new Error(`failed to complete hearth site: ${completion?.message ?? 'no result'}`);
    const complete = snapshot('complete');

    placed.rootCellar = place('rootCellar', support);
    if (!world.useStructure(placed.rootCellar.id)) throw new Error('failed to cache root cellar provision');
    placed.windowFrame = place('windowFrame', support);
    placed.weatherVane = place('weatherVane', support);
    placed.cropPlot = place('cropPlot', support);
    placed.rainCistern = place('rainCistern', support);

    const provisioned = snapshot('provisioned');
    if (!world.useStructure(bedroll.id)) throw new Error('failed to rest at functional home');
    await new Promise((resolve) => setTimeout(resolve, 600));
    const rested = snapshot('rested');
    return { site: hearthSite, placed, completion, transitions: { incomplete, ready, complete, provisioned, rested } };
  }, activateGamepad);
}

function assertHearthContract(result, name) {
  const { incomplete, ready, complete, provisioned, rested } = result.transitions;
  const missing = incomplete.siteWork?.missing?.map((req) => req.label) ?? [];
  if (!missing.includes('claimed bedroll') || !missing.includes('lit campfire') || !missing.includes('material chest')) {
    throw new Error(`${name}: incomplete site did not report concrete missing requirements ${JSON.stringify(missing)}`);
  }
  if (ready.siteWork?.ready !== true || ready.siteWork?.completed !== false) {
    throw new Error(`${name}: hearth site not ready after building home ${ready.siteWork?.detail ?? 'no detail'}`);
  }
  const readyPin = ready.navigation?.slate?.pins?.find((pin) => pin.id === 'site') ?? ready.navigation?.slate?.primary;
  if (!readyPin || !String(readyPin.detail ?? '').includes('ready to complete')) {
    throw new Error(`${name}: Route Slate did not expose ready site work`);
  }
  const readyNext = ready.journal?.state?.next?.map((entry) => entry.label) ?? [];
  if (!readyNext.includes('Finish site work')) {
    throw new Error(`${name}: Hearth Journal did not ask to finish ready site work ${JSON.stringify(readyNext)}`);
  }
  if (complete.siteWork?.completed !== true || complete.siteThreshold?.open !== true) {
    throw new Error(`${name}: site completion did not open threshold ${JSON.stringify({ siteWork: complete.siteWork, threshold: complete.siteThreshold })}`);
  }
  if (!String(result.completion?.message ?? '').includes('hearth niche complete')) {
    throw new Error(`${name}: unexpected completion message ${result.completion?.message}`);
  }
  if ((result.completion?.terrain?.changedCells ?? 0) <= 0) {
    throw new Error(`${name}: threshold terrain did not open ${JSON.stringify(result.completion?.terrain ?? complete.thresholdTerrain ?? null)}`);
  }
  const completePin = complete.navigation?.slate?.pins?.find((pin) => pin.id === 'site') ?? complete.navigation?.slate?.primary;
  if (!completePin || !String(completePin.detail ?? '').includes('opened: hearth arch')) {
    throw new Error(`${name}: Route Slate did not expose opened hearth arch`);
  }
  const beforeHome = provisioned.stats.home;
  const afterHome = rested.stats.home;
  const afterText = rested.text;
  const shelter = afterHome.shelter;
  if (!beforeHome.functional || !afterHome.functional) throw new Error(`${name}: functional home not recognized`);
  if (afterHome.label !== 'shelter alive') throw new Error(`${name}: expected shelter alive, got ${afterHome.label}`);
  if (!shelter?.protected || !shelter?.functional) throw new Error(`${name}: shelter protection/function missing ${JSON.stringify(shelter)}`);
  if (shelter.roofPieces < 2 || !shelter.hasDoor || !shelter.hasWarmth || !shelter.hasStation || !shelter.hasStorage) {
    throw new Error(`${name}: shelter parts incomplete ${JSON.stringify(shelter)}`);
  }
  if ((beforeHome.shelter?.cellarProvisions ?? 0) < 1) throw new Error(`${name}: root cellar was not provisioned before rest`);
  if ((afterText.inventory?.survival?.state?.trailFocus ?? afterText.inventory?.survival?.trailFocus ?? 0) <= 0
    && (afterText.inventory?.survival?.lastAction ?? '').includes('trail focus') === false) {
    throw new Error(`${name}: rest did not grant trail focus`);
  }
  const lastSurvival = afterText.inventory?.survival?.lastAction ?? rested.stats.survival?.lastAction ?? '';
  if (!String(lastSurvival).includes('hearth supper')) throw new Error(`${name}: expected hearth supper action, got ${lastSurvival}`);
  if (!rested.navigation?.hearthBeacon) throw new Error(`${name}: hearth beacon missing after functional home`);
  if ((afterText.structures?.renderer?.groups ?? 0) < 8) throw new Error(`${name}: expected visible home structures`);
  const restedNext = rested.journal?.state?.next?.map((entry) => entry.label) ?? [];
  if (restedNext.includes('Finish the hearth')) throw new Error(`${name}: journal still thinks hearth is unfinished`);
}

async function runViewport(browser, targetUrl, name, viewport, options = {}) {
  const page = await browser.newPage({ viewport, isMobile: !!options.touch, hasTouch: !!options.touch });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const seeded = await seedHearthContract(page, !!options.gamepad);
  await page.waitForTimeout(900);
  assertHearthContract(seeded, name);

  const screenshot = path.join(outDir, `${name}-hearth-contract.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  const canvasProbe = await canvasPixelProbe(page);
  if (!screenshotProbe.ok && !canvasProbe.ok) throw new Error(`${name}: pixel probe failed ${JSON.stringify({ screenshotProbe, canvasProbe })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  return {
    name,
    viewport,
    touch: !!options.touch,
    gamepad: !!options.gamepad,
    screenshot,
    pixelProbe: { screenshot: screenshotProbe, canvas: canvasProbe },
    site: seeded.site,
    completion: seeded.completion,
    transitions: {
      incomplete: {
        missing: seeded.transitions.incomplete.siteWork?.missing?.map((req) => req.label) ?? [],
        journalNext: seeded.transitions.incomplete.journal?.state?.next ?? [],
        slatePrimary: seeded.transitions.incomplete.navigation?.slate?.primary ?? null,
      },
      ready: {
        detail: seeded.transitions.ready.siteWork?.detail ?? '',
        journalNext: seeded.transitions.ready.journal?.state?.next ?? [],
        slatePrimary: seeded.transitions.ready.navigation?.slate?.primary ?? null,
      },
      complete: {
        detail: seeded.transitions.complete.siteWork?.detail ?? '',
        threshold: seeded.transitions.complete.siteThreshold,
        thresholdTerrain: seeded.transitions.complete.thresholdTerrain,
        journalNext: seeded.transitions.complete.journal?.state?.next ?? [],
        slatePrimary: seeded.transitions.complete.navigation?.slate?.primary ?? null,
      },
      rested: {
        home: seeded.transitions.rested.stats.home,
        survival: seeded.transitions.rested.text.inventory.survival,
        navigation: seeded.transitions.rested.navigation,
        structures: seeded.transitions.rested.text.structures,
        journalNext: seeded.transitions.rested.journal?.state?.next ?? [],
      },
    },
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
    results.push(await runViewport(browser, targetUrl, 'laptop', { width: 1366, height: 720 }));
    results.push(await runViewport(browser, touchUrl, 'tablet-touch', { width: 820, height: 1180 }, { touch: true }));
    results.push(await runViewport(browser, touchUrl, 'phone-touch', { width: 390, height: 844 }, { touch: true }));
    results.push(await runViewport(browser, targetUrl, 'gamepad', { width: 1440, height: 900 }, { gamepad: true }));
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
      screenshot: path.relative(root, result.screenshot),
    })),
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    proof: path.relative(root, path.join(outDir, 'proof.json')),
    profiles: proof.results.map((result) => ({
      name: result.name,
      screenshot: result.screenshot,
      terrainCells: result.completion?.terrain?.changedCells ?? 0,
      journalReady: result.transitions.ready.journalNext.map((entry) => entry.label),
      home: result.transitions.rested.home.label,
      trailFocus: result.transitions.rested.survival?.state?.trailFocus ?? result.transitions.rested.survival?.trailFocus ?? 0,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
