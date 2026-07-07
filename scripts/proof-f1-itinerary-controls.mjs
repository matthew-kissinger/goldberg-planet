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
const outDir = path.join(root, 'output', 'playwright', 'f1-itinerary-controls');
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
        opaque += 1;
        colors.add(`${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`);
      }
    }
    return { ok: opaque > 16 && colors.size > 3, samples: opaque, unique: colors.size };
  });
}

async function waitFrames(page, frames = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let left = Math.max(1, Math.trunc(count));
    const step = () => {
      left -= 1;
      if (left <= 0) resolve(null);
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }), frames);
}

async function routePlan(page) {
  return page.evaluate(() => window.__world?.routePlan?.());
}

function labels(plan) {
  return plan?.saved?.legs?.map((leg) => leg.label) ?? [];
}

async function seedItinerary(page) {
  return page.evaluate(async () => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.landmarks || !world?.routePlan || !world?.spawnAtPentagon) {
      throw new Error('missing route itinerary proof hooks');
    }
    const afterFrames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    world.spawnAtPentagon(0);
    await afterFrames();

    const save = JSON.parse(world.save.export());
    const originTile = Math.max(0, Math.trunc(world.player?.tile ?? 0));
    const landmarkTiles = (world.landmarks().items ?? [])
      .map((landmark, index) => ({ tile: Math.trunc(landmark.tile), name: String(landmark.name || 'Horizon Gate'), index }))
      .filter((entry) => Number.isFinite(entry.tile) && entry.tile >= 0 && entry.tile !== originTile && entry.index > 0 && entry.name !== 'First Hearth');
    const nearby = (world.nearbyTiles?.(5) ?? [])
      .map((tile) => Math.trunc(tile))
      .filter((tile) => Number.isFinite(tile) && tile >= 0 && tile !== originTile)
      .map((tile) => ({ tile, name: `near route ${tile}` }));
    const picked = [];
    const seen = new Set();
    for (const entry of [...landmarkTiles, ...nearby]) {
      if (seen.has(entry.tile)) continue;
      seen.add(entry.tile);
      picked.push(entry);
      if (picked.length >= 3) break;
    }
    if (picked.length < 3) throw new Error(`could not pick three route legs from ${JSON.stringify({ originTile, landmarkTiles, nearby })}`);

    const names = ['North Gate', 'glass-rain shoal', 'cave waystone'];
    const details = ['horizon chart target', 'pale shard halo · 42m left', 'attuned cave bearing'];
    const kinds = ['target', 'skyfall', 'waystone'];
    const legs = picked.map((entry, index) => ({
      targetTile: entry.tile,
      sourceKind: kinds[index],
      label: names[index] ?? entry.name,
      detail: details[index] ?? 'planned route stop',
      originTile,
      setDay: 7,
      setMinute: 720,
    }));

    save.progression = {
      ...(save.progression ?? {}),
      routePlan: { ...legs[0], legs },
    };
    save.craftedItems = {
      ...(save.craftedItems ?? {}),
      horizonChart: 1,
      stonePick: 1,
      stoneAxe: 1,
      echoLantern: 1,
    };
    save.planeCrafted = true;
    save.survival = { ...(save.survival ?? {}), stamina: 90, exposure: 3, mealsEaten: 0, collapseCount: 0, trailFocus: 0 };
    save.time = { day: 7, minute: 720 };
    save.weather = { phase: 0.18, storm: 0 };
    if (!world.save.import(JSON.stringify(save))) throw new Error('failed to import seeded itinerary save');
    await afterFrames();
    return world.routePlan();
  });
}

async function routePanelRect(page, label) {
  const rect = await page.evaluate(() => {
    const el = document.getElementById('route');
    if (!el || el.classList.contains('hide')) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, innerWidth, innerHeight, text: el.innerText };
  });
  if (!rect || rect.width < 120 || rect.height < 120) throw new Error(`${label}: route panel missing or too small ${JSON.stringify(rect)}`);
  if (rect.left < -1 || rect.top < -1 || rect.right > rect.innerWidth + 1 || rect.bottom > rect.innerHeight + 1) {
    throw new Error(`${label}: route panel outside viewport ${JSON.stringify(rect)}`);
  }
  return rect;
}

async function screenshot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  const buffer = await page.screenshot({ path: file, fullPage: true });
  const probe = pngPixelProbe(buffer);
  if (!probe.ok) throw new Error(`${name}: screenshot pixel probe failed ${JSON.stringify(probe)}`);
  return { file, probe };
}

async function canvasScreenshotProbe(page, name) {
  const rect = await page.evaluate(() => {
    const el = document.querySelector('canvas');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.max(1, r.width), height: Math.max(1, r.height) };
  });
  if (!rect || rect.width < 40 || rect.height < 40) throw new Error(`${name}: missing usable canvas rect ${JSON.stringify(rect)}`);
  const file = path.join(outDir, `${name}-canvas.png`);
  const buffer = await page.screenshot({ path: file, clip: rect });
  const probe = pngPixelProbe(buffer);
  if (!probe.ok) throw new Error(`${name}: canvas screenshot probe failed ${JSON.stringify(probe)}`);
  return { file, rect, probe };
}

async function openRoute(page, profile) {
  if (profile.touch) await page.tap('#btn-route');
  else if (profile.gamepad) await page.evaluate(() => window.__world.injectGamepad({ chart: true }, 2));
  else await page.keyboard.press('m');
  await waitFrames(page, 4);
}

async function triggerLater(page, profile) {
  if (profile.touch) await page.tap('button[data-route-action="later"]');
  else if (profile.gamepad) await page.evaluate(() => window.__world.injectGamepad({ menuRight: true }, 2));
  else await page.keyboard.press('ArrowRight');
  await waitFrames(page, 4);
}

async function triggerDrop(page, profile) {
  if (profile.touch) await page.tap('button[data-route-action="drop"]');
  else if (profile.gamepad) await page.evaluate(() => window.__world.injectGamepad({ menuLeft: true }, 2));
  else await page.keyboard.press('ArrowLeft');
  await waitFrames(page, 4);
}

async function runProfile(browser, baseUrl, profile) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    isMobile: !!profile.touch,
    hasTouch: !!profile.touch,
    deviceScaleFactor: profile.touch ? 2 : 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto(proofUrl(new URL(baseUrl).port, profile.touch), { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__world?.routePlan && !!window.render_game_to_text, null, { timeout: 45000 });
  const seeded = await seedItinerary(page);
  const initialLabels = labels(seeded);
  if (initialLabels.join('|') !== 'North Gate|glass-rain shoal|cave waystone') {
    throw new Error(`${profile.name}: unexpected initial labels ${initialLabels.join('|')}`);
  }

  await openRoute(page, profile);
  const openRect = await routePanelRect(page, `${profile.name} open`);
  if (!openRect.text.includes('later') || !openRect.text.includes('drop')) {
    throw new Error(`${profile.name}: route panel missing stop/actions: ${openRect.text}`);
  }

  await triggerLater(page, profile);
  const afterLater = await routePlan(page);
  const laterLabels = labels(afterLater);
  if (laterLabels.join('|') !== 'glass-rain shoal|cave waystone|North Gate') {
    throw new Error(`${profile.name}: later labels wrong ${laterLabels.join('|')}`);
  }
  if (afterLater?.signal?.label !== 'glass-rain shoal') throw new Error(`${profile.name}: active signal did not advance after later`);

  await triggerDrop(page, profile);
  const afterDrop = await routePlan(page);
  const dropLabels = labels(afterDrop);
  if (dropLabels.join('|') !== 'cave waystone|North Gate') {
    throw new Error(`${profile.name}: drop labels wrong ${dropLabels.join('|')}`);
  }
  if (afterDrop?.signal?.label !== 'cave waystone') throw new Error(`${profile.name}: active signal did not advance after drop`);
  const finalRect = await routePanelRect(page, `${profile.name} final`);
  if (!finalRect.text.includes('later') || !finalRect.text.includes('drop') || !finalRect.text.includes('clear')) {
    throw new Error(`${profile.name}: final route panel missing itinerary actions ${finalRect.text}`);
  }

  await page.waitForTimeout(500);
  await waitFrames(page, 4);
  const canvasDirect = await canvasPixelProbe(page);
  const canvas = await canvasScreenshotProbe(page, profile.name);
  const shot = await screenshot(page, profile.name);
  if (consoleErrors.length || pageErrors.length) {
    throw new Error(`${profile.name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  }
  await context.close();
  return {
    profile: profile.name,
    viewport: profile.viewport,
    input: profile.touch ? 'touch' : profile.gamepad ? 'gamepad' : 'keyboard',
    initialLabels,
    laterLabels,
    dropLabels,
    lastAction: afterDrop?.signal?.message ?? null,
    routeRect: finalRect,
    canvas,
    canvasDirect,
    screenshot: shot,
    consoleErrors,
    pageErrors,
  };
}

async function main() {
  const { chromium } = loadPlaywright();
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const baseUrl = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const server = startServer(port);
  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch({ headless: true });
    const profiles = [
      { name: 'desktop-keyboard', viewport: { width: 1440, height: 900 } },
      { name: 'laptop-keyboard', viewport: { width: 1366, height: 720 } },
      { name: 'tablet-touch', viewport: { width: 820, height: 1180 }, touch: true },
      { name: 'phone-touch', viewport: { width: 390, height: 844 }, touch: true },
      { name: 'desktop-gamepad', viewport: { width: 1280, height: 720 }, gamepad: true },
    ].filter((profile) => !profileFilter || profile.name.includes(profileFilter));
    if (profiles.length === 0) throw new Error(`No profiles matched PROOF_PROFILE=${profileFilter}`);
    const results = [];
    for (const profile of profiles) results.push(await runProfile(browser, baseUrl, profile));
    await browser.close();
    const proof = {
      ok: true,
      generatedAt: new Date().toISOString(),
      baseUrl,
      profiles: results,
    };
    const proofFile = path.join(outDir, 'proof.json');
    await fs.writeFile(proofFile, `${JSON.stringify(proof, null, 2)}\n`);
    console.log(`F1 itinerary controls proof passed for ${results.length} profile(s): ${proofFile}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
