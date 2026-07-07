import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
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
const outDir = path.join(root, 'output', 'playwright', 'k11-sky-life');
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

async function waitForLoaded(page, slugs, label) {
  await page.waitForFunction((expected) => {
    const proof = window.__world?.skyLife?.();
    const renderer = proof?.renderer;
    const bySlug = renderer?.kilnBirdSkinsBySlug ?? {};
    return expected.every((slug) => (bySlug[slug]?.loaded ?? 0) > 0)
      && (renderer?.pointFlockSprites ?? 0) > 0
      && (renderer?.fallbackVisible ?? 0) === 0
      && (renderer?.kilnBirdSkinFallbacks ?? 0) === 0;
  }, slugs, { timeout: 70000 });
  return page.evaluate((stepLabel) => ({
    label: stepLabel,
    skyLife: window.__world.skyLife(),
    text: JSON.parse(window.render_game_to_text()),
    kiln: window.__world.stats().kilnAssets,
  }), label);
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
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
    const consoleErrors = [];
    const pageErrors = [];
    const kilnAssetRequests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/assets/kiln/')) kilnAssetRequests.push(url);
    });

    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const world = window.__world;
      return !!world?.skyLife
        && !!world?.setWeather
        && !!world?.setTime
        && !!world?.debugSpawnAtSkyLifeKind
        && typeof window.render_game_to_text === 'function';
    }, null, { timeout: 45000 });

    await page.evaluate(() => {
      window.__world.setTime({ day: 0, minute: 720 });
    });
    const highSky = await waitForLoaded(page, ['bird-sky-kite'], 'high-sky default');

    const shoreSetup = await page.evaluate(() => {
      const spawned = window.__world.debugSpawnAtSkyLifeKind('shore');
      for (let i = 0; i <= 24; i += 1) {
        window.__world.setWeather({ phase: i / 24 });
        const kinds = window.__world.skyLife().sites.map((site) => site.kind);
        if (kinds.includes('shore') && kinds.includes('storm')) return { spawned, phase: i / 24, kinds };
      }
      return { spawned, phase: null, kinds: window.__world.skyLife().sites.map((site) => site.kind) };
    });
    if (!shoreSetup.spawned?.ok || !shoreSetup.kinds.includes('shore')) {
      throw new Error(`Unable to set up shore sky-life context: ${JSON.stringify(shoreSetup)}`);
    }
    const shoreSlugs = shoreSetup.kinds.includes('storm')
      ? ['bird-shore-gull', 'bird-storm-finch']
      : ['bird-shore-gull'];
    const shoreStorm = await waitForLoaded(page, shoreSlugs, 'shore and weather birds');

    const forestSetup = await page.evaluate(() => {
      const result = window.__world.debugSpawnAtSkyLifeKind('forest');
      return { result, kinds: window.__world.skyLife().sites.map((site) => site.kind) };
    });
    if (!forestSetup.result?.ok || !forestSetup.kinds.includes('forest')) {
      throw new Error(`Unable to set up forest sky-life context: ${JSON.stringify(forestSetup)}`);
    }
    const forest = await waitForLoaded(page, ['bird-forest-flutter'], 'forest birds');

    await page.waitForTimeout(500);
    const screenshot = path.join(outDir, 'sky-life.png');
    await page.screenshot({ path: screenshot, fullPage: false });
    const generatedRequests = kilnAssetRequests.filter((url) => url.includes('/assets/kiln/generated/'));
    if (generatedRequests.length > 0) throw new Error(`Sky-life requested raw generated assets: ${JSON.stringify(generatedRequests)}`);
    if (consoleErrors.length || pageErrors.length) throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);

    const proof = {
      ok: true,
      screenshot,
      highSky,
      shoreSetup,
      shoreStorm,
      forestSetup,
      forest,
      kilnAssetRequests,
    };
    await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
    const loadedSlugs = new Set([
      ...Object.entries(highSky.skyLife.renderer.kilnBirdSkinsBySlug).filter(([, row]) => row.loaded > 0).map(([slug]) => slug),
      ...Object.entries(shoreStorm.skyLife.renderer.kilnBirdSkinsBySlug).filter(([, row]) => row.loaded > 0).map(([slug]) => slug),
      ...Object.entries(forest.skyLife.renderer.kilnBirdSkinsBySlug).filter(([, row]) => row.loaded > 0).map(([slug]) => slug),
    ]);
    console.log(JSON.stringify({
      ok: true,
      loadedSlugs: [...loadedSlugs].sort(),
      screenshot,
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
