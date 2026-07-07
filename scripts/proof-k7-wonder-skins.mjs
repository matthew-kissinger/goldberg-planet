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
const outDir = path.join(root, 'output', 'playwright', 'k7-wonder-skins');
const requestedPort = Number(process.env.PROOF_PORT || 0);

const TARGETS = [
  { kind: 'emberFall', slug: 'crater-emberfall' },
  { kind: 'glassRain', slug: 'crater-glassrain' },
  { kind: 'starBloom', slug: 'crater-starbloom' },
];

const LANDMARK_TARGETS = [
  { index: 0, slug: 'shrine-first-hearth' },
  { index: 1, slug: 'shrine-rainward-gate' },
  { index: 2, slug: 'shrine-salt-mirror' },
  { index: 3, slug: 'shrine-high-lantern' },
  { index: 4, slug: 'shrine-root-vault' },
  { index: 5, slug: 'shrine-red-cairn' },
  { index: 6, slug: 'shrine-snow-dial' },
  { index: 7, slug: 'shrine-glass-shoal' },
  { index: 8, slug: 'shrine-storm-seat' },
  { index: 9, slug: 'shrine-reed-crown' },
  { index: 10, slug: 'shrine-deep-bell' },
  { index: 11, slug: 'shrine-last-horizon' },
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

function proofUrl(port) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('nosave', '1');
  url.searchParams.set('resetSave', '1');
  url.searchParams.set('creative', '1');
  url.searchParams.set('mute', '1');
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

async function setSkyfallKind(page, kind) {
  const setup = await page.evaluate((targetKind) => {
    const world = window.__world;
    for (let day = 0; day < 80; day += 1) {
      for (let windowIndex = 0; windowIndex < 4; windowIndex += 1) {
        const minute = windowIndex * 360 + 18;
        world.setTime({ day, minute });
        const current = world.landmarks().skyfall.current;
        if (current?.kind === targetKind) {
          const spawned = world.spawnAtSkyfall();
          return { ok: true, time: { day, minute }, current, spawned };
        }
      }
    }
    return { ok: false, current: world.landmarks().skyfall.current };
  }, kind);
  if (!setup?.ok) throw new Error(`Unable to find skyfall kind ${kind}: ${JSON.stringify(setup)}`);
  return setup;
}

async function waitForCraterSkin(page, slug) {
  await page.waitForFunction((targetSlug) => {
    const renderer = window.__world?.landmarks?.().skyfall?.renderer;
    const row = renderer?.kilnSkyfallSkinsBySlug?.[targetSlug];
    return (row?.loaded ?? 0) > 0
      && (row?.fallback ?? 0) === 0
      && (renderer?.kilnSkyfallSkinFallbacks ?? 0) === 0
      && (renderer?.kilnSkyfallGlbMeshesVisible ?? 0) > 0
      && (renderer?.proceduralCraterPartsVisible ?? 1) === 0;
  }, slug, { timeout: 60000 });
  return page.evaluate((targetSlug) => ({
    skyfall: window.__world.landmarks().skyfall,
    text: JSON.parse(window.render_game_to_text()),
    kiln: window.__world.stats?.().kilnAssets ?? null,
    slug: targetSlug,
  }), slug);
}

async function seedLandmarkProgression(page) {
  return page.evaluate(() => {
    const world = window.__world;
    if (!world?.save?.export || !world?.save?.import || !world?.landmarks || !world?.spawnAtPentagon) {
      throw new Error('missing K7 shrine proof hooks');
    }
    const save = JSON.parse(world.save.export());
    const tiles = world.landmarks().items.map((landmark) => landmark.tile);
    save.progression = {
      ...(save.progression ?? {}),
      pentagons: tiles,
      siteCompletions: tiles,
    };
    if (!world.save.import(JSON.stringify(save))) throw new Error('failed to import shrine proof progression');
    return { tiles, landmarks: world.landmarks() };
  });
}

async function waitForLandmarkSkin(page, slug, index) {
  await page.evaluate((targetIndex) => {
    window.__world.spawnAtPentagon(targetIndex, 8.5);
  }, index);
  await page.waitForFunction((targetSlug) => {
    const renderer = window.__world?.landmarks?.().renderer;
    const row = renderer?.kilnLandmarkSkinsBySlug?.[targetSlug];
    return (row?.loaded ?? 0) === 1
      && (row?.fallback ?? 0) === 0
      && (renderer?.kilnLandmarkSkinFallbacks ?? 0) === 0
      && (renderer?.kilnLandmarkGlbMeshesVisible ?? 0) >= 12
      && (renderer?.proceduralLandmarkShellPartsVisible ?? 1) === 0
      && (renderer?.proceduralLandmarkOverlaysVisible ?? 0) >= 24
      && (renderer?.proceduralThresholdPartsVisible ?? 0) > 40
      && (renderer?.surfaceBasisDeterminantMin ?? 0) > 0.995
      && (renderer?.surfaceUpDotMin ?? 0) > 0.995;
  }, slug, { timeout: 90000 });
  return page.evaluate((targetSlug) => ({
    landmarks: window.__world.landmarks(),
    text: JSON.parse(window.render_game_to_text()),
    kiln: window.__world.stats?.().kilnAssets ?? null,
    slug: targetSlug,
  }), slug);
}

async function main() {
  const { chromium } = loadPlaywright();
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const server = startServer(port);
  const target = proofUrl(port);
  let browser;
  try {
    await waitForServer(target);
    browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
    const page = await browser.newPage({ viewport: { width: 1360, height: 840 } });
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

    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const world = window.__world;
      return !!world?.setTime
        && !!world?.spawnAtSkyfall
        && !!world?.landmarks
        && typeof window.render_game_to_text === 'function';
    }, null, { timeout: 45000 });

    const runs = [];
    for (const targetSkin of TARGETS) {
      const setup = await setSkyfallKind(page, targetSkin.kind);
      const proof = await waitForCraterSkin(page, targetSkin.slug);
      await page.waitForTimeout(250);
      const screenshot = path.join(outDir, `${targetSkin.slug}.png`);
      const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: false });
      const pixelProbe = await canvasPixelProbe(page);
      const screenshotProbe = pngPixelProbe(screenshotBuffer);
      if (!pixelProbe.ok && !screenshotProbe.ok) {
        throw new Error(`${targetSkin.slug}: pixel probe failed ${JSON.stringify({ pixelProbe, screenshotProbe })}`);
      }
      runs.push({ ...targetSkin, setup, proof, screenshot, pixelProbe: { canvas: pixelProbe, screenshot: screenshotProbe } });
    }

    const landmarkSetup = await seedLandmarkProgression(page);
    const landmarkRuns = [];
    for (const targetSkin of LANDMARK_TARGETS) {
      const proof = await waitForLandmarkSkin(page, targetSkin.slug, targetSkin.index);
      await page.waitForTimeout(250);
      const screenshot = path.join(outDir, `${targetSkin.slug}.png`);
      const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: false });
      const pixelProbe = await canvasPixelProbe(page);
      const screenshotProbe = pngPixelProbe(screenshotBuffer);
      if (!pixelProbe.ok && !screenshotProbe.ok) {
        throw new Error(`${targetSkin.slug}: pixel probe failed ${JSON.stringify({ pixelProbe, screenshotProbe })}`);
      }
      landmarkRuns.push({ ...targetSkin, proof, screenshot, pixelProbe: { canvas: pixelProbe, screenshot: screenshotProbe } });
    }

    const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
    if (generatedRequests.length > 0) throw new Error(`K7 proof requested raw generated assets: ${JSON.stringify(generatedRequests)}`);
    for (const targetSkin of [...TARGETS, ...LANDMARK_TARGETS]) {
      const ok = kilnAssetResponses.some((asset) => asset.url.includes(`/assets/kiln/models/${targetSkin.slug}.glb`) && asset.status >= 200 && asset.status < 300);
      if (!ok) throw new Error(`Missing successful ${targetSkin.slug}.glb response`);
    }
    if (consoleErrors.length || pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);

    const proof = {
      ok: true,
      url: target,
      generatedAt: new Date().toISOString(),
      runs,
      landmarkSetup,
      landmarkRuns,
      kilnAssetRequests,
      kilnAssetResponses,
      generatedRequests,
      consoleErrors,
      pageErrors,
    };
    await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({
      ok: true,
      craterSlugs: TARGETS.map((entry) => entry.slug),
      landmarkSlugs: LANDMARK_TARGETS.map((entry) => entry.slug),
      screenshots: [...runs, ...landmarkRuns].map((entry) => entry.screenshot),
      generatedRequests: generatedRequests.length,
      consoleErrors: consoleErrors.length,
      pageErrors: pageErrors.length,
    }, null, 2));
  } finally {
    if (browser) await browser.close();
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
