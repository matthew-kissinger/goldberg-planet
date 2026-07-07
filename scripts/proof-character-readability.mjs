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
const outDir = path.join(root, 'output', 'playwright', 'soft-facet-wayfarer-readability');
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

function proofUrl(port, options = {}) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('nosave', '1');
  url.searchParams.set('resetSave', '1');
  url.searchParams.set('creative', '1');
  url.searchParams.set('mute', '1');
  if (options.touch) url.searchParams.set('touch', '1');
  if (options.gpu) url.searchParams.set('gpu', options.gpu);
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

function pngPixelProbe(buffer, crop = null) {
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
  const buckets = { coat: 0, cream: 0, rust: 0, face: 0, cyan: 0, dark: 0 };
  let samples = 0;
  let src = 0;
  const bounds = crop ?? { x0: 0, y0: 0, x1: width, y1: height };
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
    if (y < bounds.y0 || y >= bounds.y1) {
      prev.set(row);
      continue;
    }
    const stepX = Math.max(1, Math.floor((bounds.x1 - bounds.x0) / 42));
    for (let x = bounds.x0; x < bounds.x1; x += stepX) {
      const i = x * channels;
      const alpha = channels === 4 ? row[i + 3] : 255;
      if (alpha <= 20) continue;
      const r = row[i], g = row[i + 1], b = row[i + 2];
      samples += 1;
      colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
      if (g > 105 && b > 90 && r < 145) buckets.coat += 1;
      if (r > 185 && g > 160 && b > 105) buckets.cream += 1;
      if (r > 130 && g > 50 && g < 120 && b < 90) buckets.rust += 1;
      if (r > 180 && g > 120 && b > 70 && b < 135) buckets.face += 1;
      if (g > 145 && b > 135 && r < 140) buckets.cyan += 1;
      if (r < 75 && g < 85 && b < 95) buckets.dark += 1;
    }
    prev.set(row);
  }
  const paletteHits = Object.values(buckets).filter((count) => count > 0).length;
  return { ok: samples > 32 && colors.size > 10, width, height, samples, unique: colors.size, buckets, paletteHits };
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

const scenarios = [
  { id: 'base', action: 'discover', held: 'horizonChart', duration: 2.2 },
  { id: 'chop', action: 'chop', held: 'stoneHatchet', duration: 2.2 },
  { id: 'mine', action: 'mine', held: 'echoPick', duration: 2.2 },
  { id: 'build', action: 'build', held: 'caveAnchor', duration: 2.2 },
  { id: 'fish', action: 'fish', held: 'fishingRod', duration: 2.2 },
  { id: 'ward', action: 'ward', held: 'stoneBlade', duration: 2.2 },
  { id: 'shoot', action: 'shoot', held: 'reedBow', duration: 2.2 },
  { id: 'brace', action: 'brace', held: 'stormCloak', duration: 2.2 },
  { id: 'pickup', action: 'pickup', held: 'glowCrystal', duration: 2.2 },
  { id: 'plane', action: 'plane', held: 'planeFrame', duration: 1.4, plane: true },
];

async function seedCharacterKit(page) {
  return page.evaluate(() => {
    const world = window.__world;
    if (!world?.giveItem || !world?.setZoom || !world?.triggerCharacterAction || !world?.characterRenderer) {
      throw new Error('missing character proof hooks');
    }
    for (const item of [
      'packFrame',
      'stormCloak',
      'echoAxe',
      'echoPick',
      'stoneHatchet',
      'stoneBlade',
      'fishingRod',
      'reedBow',
      'whistlingArrow',
      'horizonChart',
      'weatherVane',
      'caveAnchor',
      'bedroll',
      'chest',
      'campfire',
      'workbench',
      'waystone',
      'planeFrame',
      'glowCrystal',
    ]) {
      world.giveItem(item, item === 'whistlingArrow' ? 8 : 1);
    }
    if (world.grantPlane) world.grantPlane();
    world.setZoom(0.16);
    return {
      renderer: world.characterRenderer(),
      stats: world.stats(),
      text: JSON.parse(window.render_game_to_text()),
    };
  });
}

async function runScenario(page, profileName, scenario) {
  return page.evaluate(async (scenario) => {
    const world = window.__world;
    if (scenario.plane) {
      if (typeof world.player.enterPlane === 'function') world.player.enterPlane();
      else world.player.mode = 'plane';
    } else {
      world.player.mode = 'walk';
    }
    world.triggerCharacterAction(scenario.action, scenario.held, scenario.duration);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const text = JSON.parse(window.render_game_to_text());
    return {
      scenario,
      textCharacter: text.character,
      textIntent: text.characterIntent,
      textRenderer: text.characterRenderer,
      worldCharacter: world.characterState(),
      worldIntent: world.characterIntent(),
      worldRenderer: world.characterRenderer(),
      stats: world.stats(),
    };
  }, scenario).then((result) => {
    const { id, action, held } = scenario;
    const intent = result.worldIntent;
    const rendered = result.worldCharacter;
    const renderer = result.worldRenderer;
    if (intent.action !== action) throw new Error(`${profileName}/${id}: intent action ${intent.action} !== ${action}`);
    if (intent.held !== held) throw new Error(`${profileName}/${id}: intent held ${intent.held} !== ${held}`);
    if (rendered.action !== action) throw new Error(`${profileName}/${id}: rendered action ${rendered.action} !== ${action}`);
    if (renderer.heldProp !== (held === 'hands' ? 'hands' : held)) throw new Error(`${profileName}/${id}: renderer held ${renderer.heldProp} !== ${held}`);
    if (!renderer.normalDistanceReady) throw new Error(`${profileName}/${id}: character renderer not normal-distance ready ${JSON.stringify(renderer)}`);
    if (renderer.silhouetteParts < 28 || renderer.propSockets.length < 3) throw new Error(`${profileName}/${id}: weak silhouette/socket stats ${JSON.stringify(renderer)}`);
    if (!renderer.backPropsVisible.includes('packFrame') || (held !== 'stormCloak' && !renderer.backPropsVisible.includes('stormCloak'))) {
      throw new Error(`${profileName}/${id}: missing stowed pack/cloak props ${JSON.stringify(renderer.backPropsVisible)}`);
    }
    if (scenario.plane && result.stats.mode !== 'plane') throw new Error(`${profileName}/${id}: plane mode did not stick`);
    if (!scenario.plane && result.stats.zoom < 1.35) throw new Error(`${profileName}/${id}: zoom too close for character proof ${result.stats.zoom}`);
    return result;
  });
}

async function runProfile(browser, port, profile) {
  const page = await browser.newPage({ viewport: profile.viewport });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  const url = proofUrl(port, profile);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__world && typeof window.render_game_to_text === 'function', null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const seeded = await seedCharacterKit(page);
  await page.waitForFunction(() => window.__world?.stats?.().zoom > 1.35, null, { timeout: 10000 });
  const scenarioResults = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await runScenario(page, profile.name, scenario));
    await page.waitForTimeout(80);
  }
  scenarioResults.push(await runScenario(page, profile.name, {
    id: 'avatar-readability-frame',
    action: 'discover',
    held: 'horizonChart',
    duration: 2.2,
  }));
  await page.waitForTimeout(120);
  const canvasProbe = await canvasPixelProbe(page);
  const screenshot = path.join(outDir, `${profile.name}-wayfarer.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  const cropProbe = pngPixelProbe(screenshotBuffer, {
    x0: Math.floor(profile.viewport.width * 0.22),
    x1: Math.floor(profile.viewport.width * 0.78),
    y0: Math.floor(profile.viewport.height * 0.32),
    y1: Math.floor(profile.viewport.height * 0.9),
  });
  await page.close();

  if (!canvasProbe.ok && !screenshotProbe.ok) throw new Error(`${profile.name}: pixel probe failed ${JSON.stringify({ canvasProbe, screenshotProbe })}`);
  if (!cropProbe.ok || cropProbe.paletteHits < 3) throw new Error(`${profile.name}: avatar crop lacks palette/readability variance ${JSON.stringify(cropProbe)}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${profile.name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  const lastRenderer = scenarioResults.at(-1)?.worldRenderer ?? seeded.renderer;
  if (lastRenderer.actionPoseCoverage < 18) throw new Error(`${profile.name}: missing action pose coverage ${JSON.stringify(lastRenderer)}`);

  return {
    name: profile.name,
    url,
    viewport: profile.viewport,
    seeded,
    scenarioResults,
    screenshot,
    pixelProbe: { canvas: canvasProbe, screenshot: screenshotProbe, avatarCrop: cropProbe },
    consoleErrors,
    pageErrors,
  };
}

const profiles = [
  { name: 'desktop-keyboard', viewport: { width: 1440, height: 900 } },
  { name: 'laptop-keyboard', viewport: { width: 1366, height: 720 } },
  { name: 'tablet-touch', viewport: { width: 820, height: 1180, isMobile: true, hasTouch: true }, touch: true },
  { name: 'phone-touch', viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, touch: true },
  { name: 'desktop-gamepad', viewport: { width: 1280, height: 720 }, gamepad: true },
  { name: 'desktop-webgl-fallback', viewport: { width: 1440, height: 900 }, gpu: 'gl' },
].filter((profile) => !profileFilter || profile.name.includes(profileFilter));

if (profiles.length === 0) throw new Error(`No character readability profile matched PROOF_PROFILE=${profileFilter}`);

await fs.mkdir(outDir, { recursive: true });
const port = await getFreePort();
const server = startServer(port);
try {
  const initialUrl = proofUrl(port, profiles[0]);
  await waitForServer(initialUrl);
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const results = [];
  try {
    for (const profile of profiles) results.push(await runProfile(browser, port, profile));
  } finally {
    await browser.close();
  }
  const proof = {
    ok: true,
    generatedAt: new Date().toISOString(),
    results,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(`Soft-Facet Wayfarer readability proof passed for ${results.length} profile(s): ${path.join(outDir, 'proof.json')}`);
} finally {
  await stopServer(server);
}
