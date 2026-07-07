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
const outDir = path.join(root, 'output', 'playwright', 'kiln-asset-viewer');
const requestedPort = Number(process.env.PROOF_PORT || 0);

const baseFamilySlugs = {
  structures: ['waystone', 'door-kit', 'window-frame', 'roof-bundle'],
  drops: ['drop-wood-logs', 'drop-ore-chunk'],
  nodes: [
    'node-hearth-coal',
    'node-rain-reed',
    'node-salt-shell',
    'node-lantern-shard',
    'node-root-pod',
    'node-red-nodule',
    'node-snow-bloom',
    'node-glass-shard',
    'node-storm-amber',
    'node-reed-kelp',
    'node-bell-crystal',
    'node-horizon-shard',
  ],
  trees: ['tree-pine', 'tree-broadleaf', 'tree-dead-snag', 'tree-shrub'],
  creatures: [
    'creature-moss-puff',
    'creature-shell-skitter',
    'creature-reedback-grazer',
    'creature-cave-blinker',
    'creature-brambleback',
    'creature-cave-belljaw',
    'creature-scree-snapper',
    'creature-storm-burr',
    'creature-tide-lurker',
  ],
  fish: [
    'fish-shore-minnow',
    'fish-storm-runner',
    'fish-cave-shimmer',
    'creature-driftjelly',
    'fish-reed-fry',
  ],
  birds: [
    'bird-sky-kite',
    'bird-shore-gull',
    'bird-forest-flutter',
    'bird-storm-finch',
  ],
};

let familySlugs = { ...baseFamilySlugs };

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

function proofUrl(port, family, slug = null) {
  const base = process.env.PROOF_URL || `http://127.0.0.1:${port}/`;
  const url = new URL(base);
  url.searchParams.set('assetViewer', 'kiln');
  if (family) url.searchParams.set('family', family);
  if (slug) url.searchParams.set('slug', slug);
  url.searchParams.set('gpu', 'gl');
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

function assertViewerState(label, state, expected) {
  if (!state?.ready) throw new Error(`${label}: viewer did not report ready state`);
  const records = state.records ?? [];
  if (records.length !== expected.length) throw new Error(`${label}: expected ${expected.length} records, got ${records.length}`);
  if (state.coordinateSystem?.hexFlatToFlatWorldUnits !== 5.6) throw new Error(`${label}: missing 5.6wu hex alignment frame`);
  for (const slug of expected) {
    const record = records.find((entry) => entry.slug === slug);
    if (!record) throw new Error(`${label}: missing ${slug} in viewer state`);
    if (record.status !== 'loaded') throw new Error(`${label}: ${slug} failed to load ${JSON.stringify(record)}`);
    if (!String(record.sourceUrl ?? '').includes(`/assets/kiln/models/${slug}.glb`)) {
      throw new Error(`${label}: ${slug} is not using committed model URL ${JSON.stringify(record)}`);
    }
    if ((record.socketScale ?? 0) <= 0 || (record.meshCount ?? 0) <= 0) throw new Error(`${label}: ${slug} has invalid fit metrics ${JSON.stringify(record)}`);
    if (record.hexFlatToFlatWorldUnits !== 5.6 || !record.socketRole || !record.socketGrid) {
      throw new Error(`${label}: ${slug} missing socket diagnostics ${JSON.stringify(record)}`);
    }
    if (record.placementFrame?.up !== '+Y local planet normal' || record.placementFrame?.pivot !== 'center-xz-bottom-y') {
      throw new Error(`${label}: ${slug} missing placement-frame contract ${JSON.stringify(record)}`);
    }
    if (!record.orientation?.policy || !record.orientation?.sourceUpAxis || !Array.isArray(record.orientation?.axisCorrection)) {
      throw new Error(`${label}: ${slug} missing orientation diagnostics ${JSON.stringify(record)}`);
    }
    if (slug.startsWith('tree-') && slug !== 'tree-shrub') {
      if (record.orientation.policy !== 'longest-axis-to-y') throw new Error(`${label}: ${slug} missing tree upright policy ${JSON.stringify(record)}`);
      const oriented = record.orientedSourceBboxSize ?? [];
      if ((oriented[1] ?? 0) < Math.max(oriented[0] ?? 0, oriented[2] ?? 0) * 0.8) {
        throw new Error(`${label}: ${slug} still appears side-loaded after normalization ${JSON.stringify(record)}`);
      }
    }
  }
}

async function runFamily(browser, port, family) {
  const page = await browser.newPage({ viewport: { width: family === 'ready' ? 1920 : family === 'nodes' || family === 'creatures' ? 1600 : 1440, height: family === 'ready' ? 1400 : 980 } });
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

  await page.goto(proofUrl(port, family), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__assetViewer?.ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(700);
  const state = await page.evaluate(() => window.__assetViewer);
  const expected = familySlugs[family];
  assertViewerState(family, state, expected);
  const screenshot = path.join(outDir, `${family}-alignment.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  await page.close();

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${family}: missing successful manifest response`);
  for (const slug of expected) {
    if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${family}: missing successful ${slug}.glb response`);
  }
  if (generatedRequests.length > 0) throw new Error(`${family}: runtime requested raw generated assets ${JSON.stringify(generatedRequests)}`);
  if (!screenshotProbe.ok || screenshotBuffer.length < 1024) throw new Error(`${family}: screenshot pixel proof failed ${JSON.stringify(screenshotProbe)}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${family}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    family,
    screenshot,
    state,
    screenshotProbe,
    kilnAssets: { requests: kilnAssetRequests, responses: kilnAssetResponses, generatedRequests },
    consoleErrors,
    pageErrors,
  };
}

async function runSlug(browser, port, slug) {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 } });
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

  await page.goto(proofUrl(port, null, slug), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__assetViewer?.ready === true, null, { timeout: 90000 });
  await page.waitForTimeout(550);
  const state = await page.evaluate(() => window.__assetViewer);
  assertViewerState(`asset ${slug}`, state, [slug]);
  const screenshot = path.join(outDir, 'assets', `${slug}.png`);
  const screenshotBuffer = await page.screenshot({ path: screenshot, fullPage: true });
  const screenshotProbe = pngPixelProbe(screenshotBuffer);
  await page.close();

  const responsesOk = (suffix) => kilnAssetResponses.some((asset) => asset.url.includes(suffix) && asset.status >= 200 && asset.status < 300);
  const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
  if (!responsesOk('/assets/kiln/ASSET_MANIFEST.json')) throw new Error(`${slug}: missing successful manifest response`);
  if (!responsesOk(`/assets/kiln/models/${slug}.glb`)) throw new Error(`${slug}: missing successful ${slug}.glb response`);
  if (generatedRequests.length > 0) throw new Error(`${slug}: runtime requested raw generated assets ${JSON.stringify(generatedRequests)}`);
  if (!screenshotProbe.ok || screenshotBuffer.length < 1024) throw new Error(`${slug}: screenshot pixel proof failed ${JSON.stringify(screenshotProbe)}`);
  if (consoleErrors.length || pageErrors.length) throw new Error(`${slug}: browser errors ${JSON.stringify({ consoleErrors, pageErrors })}`);

  return {
    slug,
    screenshot,
    state,
    screenshotProbe,
    kilnAssets: { requests: kilnAssetRequests, responses: kilnAssetResponses, generatedRequests },
    consoleErrors,
    pageErrors,
  };
}

const manifest = JSON.parse(await fs.readFile(path.join(root, 'public', 'assets', 'kiln', 'ASSET_MANIFEST.json'), 'utf8'));
const readySlugs = (manifest.assets ?? [])
  .filter((asset) => asset.status === 'ready' && asset.file)
  .map((asset) => asset.slug);
const adoptedSlugs = [...new Set(Object.values(baseFamilySlugs).flat())];
familySlugs = {
  ...baseFamilySlugs,
  adopted: adoptedSlugs,
  ready: readySlugs,
};

await fs.mkdir(path.join(outDir, 'assets'), { recursive: true });
const { chromium } = loadPlaywright();
const port = await getFreePort();
const server = startServer(port);
try {
  await waitForServer(proofUrl(port, 'trees'));
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const results = [];
  const assetResults = [];
  try {
    for (const family of Object.keys(familySlugs)) results.push(await runFamily(browser, port, family));
    for (const slug of readySlugs) assetResults.push(await runSlug(browser, port, slug));
  } finally {
    await browser.close();
  }
  const proof = {
    ok: true,
    generatedAt: new Date().toISOString(),
    families: Object.keys(familySlugs),
    readyAssetCount: readySlugs.length,
    viewerUrl: '/?assetViewer=kiln&family=ready',
    slugUrl: '/?assetViewer=kiln&slug=tree-pine',
    results,
    assetResults,
  };
  await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({
    ok: proof.ok,
    generatedAt: proof.generatedAt,
    readyAssetCount: proof.readyAssetCount,
    results: results.map((result) => ({
      family: result.family,
      screenshot: result.screenshot,
      records: result.state.records.length,
      generatedRequests: result.kilnAssets.generatedRequests.length,
      consoleErrors: result.consoleErrors.length,
      pageErrors: result.pageErrors.length,
      screenshotProbe: result.screenshotProbe,
    })),
    assetScreenshots: assetResults.map((result) => ({
      slug: result.slug,
      screenshot: result.screenshot,
      warnings: result.state.records[0]?.warnings ?? [],
      screenshotProbe: result.screenshotProbe,
    })),
  }, null, 2));
} finally {
  await stopServer(server);
}
