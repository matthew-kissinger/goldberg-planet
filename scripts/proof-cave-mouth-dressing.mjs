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
const outDir = path.join(root, 'output', 'playwright', 'cave-mouth-dressing');
const requestedPort = Number(process.env.PROOF_PORT || 0);
const TARGETS = ['dryCave', 'seaCave', 'arch'];
const TARGET_SLUGS = {
  dryCave: 'cave-mouth-dry',
  seaCave: 'cave-mouth-sea',
  arch: 'cave-mouth-arch',
};

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

async function waitForWorld(page) {
  await page.waitForFunction(() => {
    const world = window.__world;
    return !!world?.debugSpawnBesideNaturalFeature
      && !!world?.caveMouths
      && typeof window.render_game_to_text === 'function';
  }, null, { timeout: 45000 });
  await page.waitForTimeout(700);
}

function assertDressing(diag, target, label) {
  const slug = TARGET_SLUGS[target];
  const renderer = diag?.renderer;
  if (!renderer) throw new Error(`${label}: missing cave-mouth renderer diagnostics`);
  if (renderer.visualPolicy !== 'glb-skin-over-carved-void') {
    throw new Error(`${label}: wrong visual policy ${JSON.stringify(renderer)}`);
  }
  if ((renderer.standingMarkers ?? -1) !== 0) throw new Error(`${label}: standing marker geometry leaked ${JSON.stringify(renderer)}`);
  if ((renderer.kilnCaveMouthGlbVisible ?? 0) <= 0) throw new Error(`${label}: no visible cave-mouth GLB skins ${JSON.stringify(renderer)}`);
  if ((renderer.kilnCaveMouthSkinsBySlug?.[slug] ?? 0) <= 0) throw new Error(`${label}: target ${slug} GLB skin not attached ${JSON.stringify(renderer)}`);
  if ((renderer.kilnCaveMouthSkinsPending ?? 0) !== 0) throw new Error(`${label}: cave-mouth GLB skins still pending ${JSON.stringify(renderer)}`);
  if ((renderer.proceduralFallbackVisible ?? 0) !== 0) throw new Error(`${label}: procedural cave-mouth fallback still visible after GLB load ${JSON.stringify(renderer)}`);
  const matching = diag.mouths?.filter((mouth) => mouth.kind === target) ?? [];
  if (!matching.length) throw new Error(`${label}: no ${target} cave-mouth signal near proof spawn ${JSON.stringify(diag?.mouths ?? [])}`);
  if (target !== 'arch' && !matching.some((mouth) => mouth.ready === true)) {
    throw new Error(`${label}: ${target} cave mouth should be route-ready ${JSON.stringify(matching)}`);
  }
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
  const requests = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/assets/kiln/')) requests.push(url);
  });
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForWorld(page);

  const targets = [];
  for (const target of TARGETS) {
    const seeded = await page.evaluate((kind) => {
      const world = window.__world;
      const feature = world.debugSpawnBesideNaturalFeature(kind);
      return {
        feature,
        player: {
          tile: world.player?.tile ?? null,
          mode: world.player?.mode ?? null,
          submerged: world.player?.submerged ?? null,
        },
      };
    }, target);
    if (!seeded?.feature) throw new Error(`${name}: failed to spawn at natural feature ${target}`);
    await page.waitForFunction(({ kind, slug }) => {
      const diag = window.__world.caveMouths();
      const renderer = diag?.renderer;
      return (diag?.mouths?.some((mouth) => mouth.kind === kind) ?? false)
        && (renderer?.kilnCaveMouthSkinsBySlug?.[slug] ?? 0) > 0
        && (renderer?.kilnCaveMouthSkinsPending ?? 0) === 0;
    }, { kind: target, slug: TARGET_SLUGS[target] }, { timeout: 45000 });
    await page.waitForTimeout(250);
    const diag = await page.evaluate(() => window.__world.caveMouths());
    assertDressing(diag, target, `${name}/${target}`);
    const screenshot = path.join(outDir, `${name}-${target}-cave-mouth-dressing.png`);
    const screenshotProbe = pngPixelProbe(await page.screenshot({ path: screenshot, fullPage: true }));
    if (!screenshotProbe.ok) throw new Error(`${name}/${target}: screenshot pixel probe failed ${JSON.stringify(screenshotProbe)}`);
    targets.push({ target, seeded, diagnostics: diag, screenshot, pixelProbe: screenshotProbe });
  }

  const generatedRequests = requests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (generatedRequests.length) throw new Error(`${name}: generated asset requests leaked ${JSON.stringify(generatedRequests)}`);
  for (const slug of Object.values(TARGET_SLUGS)) {
    if (!requests.some((url) => url.includes(`/assets/kiln/models/${slug}.glb`))) {
      throw new Error(`${name}: missing committed cave-mouth GLB request for ${slug}`);
    }
  }
  if (consoleErrors.length || pageErrors.length) throw new Error(`${name}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);
  await context.close();
  return { name, viewport, touch: !!options.touch, targets, kilnRequests: requests, generatedRequests, consoleErrors, pageErrors };
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const port = await getFreePort();
  const server = startServer(port);
  try {
    await waitForServer(process.env.PROOF_URL || `http://127.0.0.1:${port}/`);
    const { chromium } = loadPlaywright();
    const browser = await chromium.launch({ headless: true });
    try {
      const results = [
        await runViewport(browser, proofUrl(port), 'desktop', { width: 1440, height: 900 }),
        await runViewport(browser, proofUrl(port, true), 'phone', { width: 390, height: 844 }, { touch: true }),
      ];
      const proof = { ok: true, generatedAt: new Date().toISOString(), results };
      await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
      console.log(JSON.stringify(proof, null, 2));
    } finally {
      await browser.close();
    }
  } finally {
    await stopServer(server);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
