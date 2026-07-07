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
const outDir = path.join(root, 'output', 'playwright', 'e4-ecology-route');
const requestedPort = Number(process.env.PROOF_PORT || 0);
const profileFilter = process.env.PROOF_PROFILE || '';

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
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src++];
    for (let x = 0; x < stride; x += 1) {
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
          samples += 1;
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

function foodCheck(plan) {
  const check = plan?.checks?.find((entry) => entry.id === 'food');
  if (!check) throw new Error(`missing food check in ${JSON.stringify(plan)}`);
  return check;
}

async function seedEcologyRoute(page) {
  return page.evaluate(() => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.spawnAtPentagon || !world?.navigation || !world?.landmarks || !world?.nearbyTiles) {
      throw new Error('missing E4 ecology proof hooks');
    }

    world.spawnAtPentagon(0);
    const spawned = JSON.parse(world.save.export());
    const landmarks = world.landmarks().items;
    const pentagons = landmarks.map((landmark) => Math.trunc(landmark.tile)).filter((tile) => Number.isFinite(tile));
    if (pentagons.length < 2) throw new Error('missing pentagon sites for route proof');

    let targetIndex = -1;
    let targetSignal = null;
    const targetAttempts = [];
    for (let index = 0; index < landmarks.length; index += 1) {
      const trial = JSON.parse(JSON.stringify(spawned));
      trial.progression = {
        ...(trial.progression ?? {}),
        pentagons: pentagons.filter((_, i) => i !== index),
        routePlan: null,
      };
      trial.structures = [];
      trial.craftedItems = { horizonChart: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 };
      trial.planeCrafted = true;
      trial.survival = { stamina: 92, exposure: 4, mealsEaten: 0, collapseCount: 0, trailFocus: 0 };
      trial.time = { day: 6, minute: 800 };
      trial.weather = { phase: 0.2, storm: 0 };
      if (!world.save.import(JSON.stringify(trial))) throw new Error(`failed to import target trial ${index}`);
      const nav = world.navigation();
      targetAttempts.push({
        index,
        tile: pentagons[index],
        signal: nav.signal ? {
          name: nav.signal.target.name,
          tile: nav.signal.target.tile,
          distanceM: Math.round(nav.signal.distanceM),
          distanceLabel: nav.signal.distanceLabel,
        } : null,
        range: nav.plan?.range ?? null,
        missing: nav.plan?.missing ?? [],
      });
      if (nav.signal && nav.plan?.range !== 'near' && (!targetSignal || nav.signal.distanceM > targetSignal.distanceM)) {
        targetIndex = index;
        targetSignal = nav.signal;
      }
    }
    if (targetIndex < 0 || !targetSignal) throw new Error(`could not find non-near route target ${JSON.stringify(targetAttempts)}`);
    const routeFood = { cookedFish: 1 };

    world.spawnAtPentagon(0);
    const homeTile = world.player.tile;
    const ring = world.nearbyTiles(2).filter((tile) => tile !== homeTile);
    const pickTile = (offset) => ring[offset % ring.length] ?? homeTile;
    const baseStructures = [
      { id: 1, item: 'bedroll', tile: homeTile, layer: 4, yaw: 0, state: { home: true } },
      { id: 2, item: 'roofBundle', tile: pickTile(0), layer: 4, yaw: 0 },
      { id: 3, item: 'roofBundle', tile: pickTile(1), layer: 4, yaw: 0 },
      { id: 4, item: 'doorKit', tile: pickTile(2), layer: 4, yaw: 0 },
      { id: 5, item: 'campfire', tile: pickTile(3), layer: 4, yaw: 0, state: { lit: true } },
      { id: 6, item: 'workbench', tile: pickTile(4), layer: 4, yaw: 0 },
      { id: 7, item: 'chest', tile: pickTile(5), layer: 4, yaw: 0 },
    ];

    const readyTrapState = { trapSetDay: 6, trapSetMinute: 560, trapBaited: true, trapChecks: 0 };
    const readyNetState = { netSetDay: 6, netSetMinute: 560, netChecks: 0 };
    const soakingTrapState = { trapSetDay: 6, trapSetMinute: 790, trapBaited: true, trapChecks: 0 };
    const soakingNetState = { netSetDay: 6, netSetMinute: 790, netChecks: 0 };

    const saveFor = ({ ready, offRouteTile = null, routeGear = true }) => {
      const save = JSON.parse(JSON.stringify(spawned));
      save.player = JSON.parse(world.save.export()).player;
      save.progression = {
        ...(save.progression ?? {}),
        pentagons: pentagons.filter((_, i) => i !== targetIndex),
        routePlan: null,
      };
      save.craftedItems = { ...routeFood, horizonChart: 1, stonePick: 1, stoneAxe: 1, echoLantern: 1 };
      save.planeCrafted = true;
      save.survival = { stamina: 92, exposure: 4, mealsEaten: 0, collapseCount: 0, trailFocus: 0 };
      save.time = { day: 6, minute: 800 };
      save.weather = { phase: 0.2, storm: 0 };
      save.structures = [...baseStructures];
      if (routeGear) {
        save.structures.push(
        {
          id: 8,
          item: 'fishTrap',
          tile: pickTile(6),
          layer: 4,
          yaw: 0.2,
          state: ready ? readyTrapState : soakingTrapState,
        },
        {
          id: 9,
          item: 'shoreNet',
          tile: pickTile(7),
          layer: 4,
          yaw: 0.4,
          state: ready ? readyNetState : soakingNetState,
        },
        );
      }
      if (Number.isFinite(offRouteTile)) {
        save.structures.push(
          { id: 10, item: 'fishTrap', tile: Math.trunc(offRouteTile), layer: 4, yaw: 0.6, state: readyTrapState },
          { id: 11, item: 'shoreNet', tile: Math.trunc(offRouteTile), layer: 4, yaw: 0.9, state: readyNetState },
        );
      }
      return save;
    };

    const sample = (label) => {
      const nav = world.navigation();
      const journal = world.journal();
      const structures = world.structures();
      const text = JSON.parse(window.render_game_to_text());
      return {
        label,
        signal: nav.signal,
        plan: nav.plan,
        foodCheck: nav.plan.checks.find((check) => check.id === 'food'),
        slate: nav.slate,
        journal: journal.state,
        structures,
        text,
      };
    };

    const findOffRouteTile = () => {
      const totalTiles = Math.max(0, Math.trunc(world.geo?.count ?? 0));
      const stride = Math.max(1, Math.floor(totalTiles / 180));
      const candidates = [
        ...pentagons,
        ...Array.from({ length: Math.min(220, totalTiles) }, (_, index) => (index * stride) % Math.max(1, totalTiles)),
      ];
      const seen = new Set();
      for (const tile of candidates) {
        const t = Math.max(0, Math.min(Math.max(0, totalTiles - 1), Math.trunc(tile)));
        if (seen.has(t) || t === homeTile || t === targetSignal.target.tile) continue;
        seen.add(t);
        const offRouteSave = saveFor({ ready: true, routeGear: false, offRouteTile: t });
        if (!world.save.import(JSON.stringify(offRouteSave))) continue;
        const nav = world.navigation();
        const food = nav.plan?.checks?.find((check) => check.id === 'food')?.detail ?? '';
        if (nav.plan?.missing?.includes('packed food') && food.includes('off-route')) return t;
      }
      return null;
    };

    const offRouteTile = findOffRouteTile();
    if (!Number.isFinite(offRouteTile)) throw new Error('could not find an off-route waterline staging tile');

    const offRouteSave = saveFor({ ready: true, routeGear: false, offRouteTile });
    if (!world.save.import(JSON.stringify(offRouteSave))) throw new Error('failed to import off-route waterline save');
    const offRoute = sample('off-route');

    const unreadySave = saveFor({ ready: false });
    if (!world.save.import(JSON.stringify(unreadySave))) throw new Error('failed to import unready waterline save');
    const unready = sample('unready');
    const readySave = saveFor({ ready: true, offRouteTile });
    if (!world.save.import(JSON.stringify(readySave))) throw new Error('failed to import ready waterline save');
    const ready = sample('ready');

    return { targetIndex, targetName: targetSignal.target.name, offRouteTile, offRoute, unready, ready };
  });
}

function assertEcologyRoute(result, name) {
  if (result.unready.plan.range === 'near') throw new Error(`${name}: unready route is too near for expedition prep`);
  if (result.ready.plan.range === 'near') throw new Error(`${name}: ready route is too near for expedition prep`);
  const offRouteFood = foodCheck(result.offRoute.plan);
  const unreadyFood = foodCheck(result.unready.plan);
  const readyFood = foodCheck(result.ready.plan);
  if (offRouteFood.ready) throw new Error(`${name}: off-route food check unexpectedly ready: ${offRouteFood.detail}`);
  if (!result.offRoute.plan.missing.includes('packed food')) throw new Error(`${name}: off-route plan does not miss packed food`);
  if (!offRouteFood.detail.includes('off-route')) throw new Error(`${name}: off-route food detail lacks ignored gear: ${offRouteFood.detail}`);
  if (unreadyFood.ready) throw new Error(`${name}: unready food check unexpectedly ready: ${unreadyFood.detail}`);
  if (!result.unready.plan.missing.includes('packed food')) throw new Error(`${name}: unready plan does not miss packed food`);
  if (!readyFood.ready) throw new Error(`${name}: ready food check did not become ready: ${readyFood.detail}`);
  if (result.ready.plan.missing.includes('packed food')) throw new Error(`${name}: ready plan still misses packed food`);
  if (!readyFood.detail.includes('waterline')) throw new Error(`${name}: ready food detail lacks waterline resupply: ${readyFood.detail}`);
  if (!readyFood.detail.includes('off-route')) throw new Error(`${name}: ready food detail does not preserve ignored off-route gear: ${readyFood.detail}`);
  const trapsReady = result.ready.structures.fishTraps.filter((trap) => trap.ready).length;
  const netsReady = result.ready.structures.shoreNets.filter((net) => net.ready).length;
  if (trapsReady < 1 || netsReady < 1) throw new Error(`${name}: ready structure diagnostics missing trap/net readiness`);
  if (!JSON.stringify(result.ready.text).includes('waterline')) throw new Error(`${name}: render_game_to_text lacks waterline proof`);
}

async function openVisibleRouteSlate(page, name, options = {}) {
  if (options.touch) await page.tap('#btn-route');
  else if (options.gamepad) {
    await page.evaluate(() => window.__world?.injectGamepad?.({ active: true, chart: true }, 3));
    await page.waitForTimeout(250);
  }
  else {
    await page.evaluate(() => window.focus());
    await page.keyboard.press('m');
  }
  try {
    await page.waitForFunction(() => {
      const route = document.getElementById('route');
      return route && !route.classList.contains('hide') && route.textContent?.includes('waterline');
    }, null, { timeout: 5000 });
  } catch (err) {
    const state = await page.$eval('#route', (el) => ({
      hidden: el.classList.contains('hide'),
      text: el.textContent || '',
    }));
    const nav = await page.evaluate(() => window.__world?.navigation?.());
    throw new Error(`${name}: Route Slate did not visibly show waterline ${JSON.stringify({ state, nav })}`);
  }
  const routeText = await page.$eval('#route', (el) => el.textContent || '');
  if (!routeText.includes('waterline')) throw new Error(`${name}: visible Route Slate missing waterline detail: ${routeText}`);
  if (!routeText.includes('expedition ready')) throw new Error(`${name}: visible Route Slate missing expedition-ready target row: ${routeText}`);
  return routeText;
}

async function runViewport(browser, url, name, viewport, options = {}) {
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
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const result = await seedEcologyRoute(page);
  assertEcologyRoute(result, name);
  const routeText = await openVisibleRouteSlate(page, name, options);
  await page.waitForTimeout(600);
  const canvasProbe = await canvasPixelProbe(page);
  const ui = await page.evaluate(() => {
    const rectFor = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    return {
      ux: window.__world?.controls?.()?.ux ?? null,
      panels: window.__world?.controls?.()?.panels ?? null,
      routeRect: rectFor('route'),
      touchButtons: {
        route: rectFor('btn-route'),
        craft: rectFor('btn-craft'),
        use: rectFor('btn-use'),
      },
    };
  });
  const screenshot = path.join(outDir, `${name}.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  if (!canvasProbe.ok && !screenshotProbe.ok) throw new Error(`${name}: pixel probe failed ${JSON.stringify({ canvasProbe, screenshotProbe })}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await page.close();
  await context.close();
  return {
    name,
    viewport,
    touch: !!options.touch,
    screenshot,
    targetName: result.targetName,
    offRouteTile: result.offRouteTile,
    targetDistance: result.ready.signal.distanceLabel,
    offRouteFood: result.offRoute.foodCheck.detail,
    unreadyFood: result.unready.foodCheck.detail,
    readyFood: result.ready.foodCheck.detail,
    readyPrepLabel: result.ready.plan.prepLabel,
    routeText,
    ui,
    trapReady: result.ready.structures.fishTraps.filter((trap) => trap.ready).length,
    netReady: result.ready.structures.shoreNets.filter((net) => net.ready).length,
    pixelProbe: { canvas: canvasProbe, screenshot: screenshotProbe },
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
    const profiles = [
      { name: 'desktop', url: targetUrl, viewport: { width: 1440, height: 900 }, options: {} },
      { name: 'laptop', url: targetUrl, viewport: { width: 1366, height: 720 }, options: {} },
      { name: 'tablet-touch', url: touchUrl, viewport: { width: 820, height: 1180 }, options: { touch: true } },
      { name: 'phone-touch', url: touchUrl, viewport: { width: 390, height: 844 }, options: { touch: true } },
      { name: 'gamepad', url: targetUrl, viewport: { width: 1440, height: 900 }, options: { gamepad: true } },
    ].filter((profile) => !profileFilter || profile.name === profileFilter);
    if (profiles.length === 0) throw new Error(`No E4 ecology route profile matched PROOF_PROFILE=${profileFilter}`);
    for (const profile of profiles) {
      results.push(await runViewport(browser, profile.url, profile.name, profile.viewport, profile.options));
    }
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
  const proofPath = path.join(outDir, 'proof.json');
  await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    proof: path.relative(root, proofPath),
    profiles: proof.results.map((result) => ({
      name: result.name,
      screenshot: result.screenshot,
      target: `${result.targetName} ${result.targetDistance}`,
      offRouteFood: result.offRouteFood,
      unreadyFood: result.unreadyFood,
      readyFood: result.readyFood,
      readyPrepLabel: result.readyPrepLabel,
      trapReady: result.trapReady,
      netReady: result.netReady,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
