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
const outDir = path.join(root, 'output', 'playwright', 'k9-fishing-cues');
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

async function readText(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function pressUseInput(page) {
  await page.evaluate(() => window.__world.injectGamepad({ active: true, use: true }, 3));
  await page.waitForTimeout(250);
}

async function setupShoreCue(page, hasRod) {
  const setup = await page.evaluate((rod) => {
    window.__world.debugClearFishVisualScenario();
    const scenario = window.__world.debugSetLiveFishScenario('fish-shore-minnow');
    const nativeInteractions = [];
    for (let i = 0; i < 6; i += 1) {
      const diag = window.__world.nativeLife?.();
      const site = diag?.sites?.[0];
      if (!site) break;
      const before = diag.visible ?? 0;
      nativeInteractions.push(window.__world.debugInteractNativeLife?.(site.id));
      const after = window.__world.nativeLife?.().visible ?? 0;
      if (after >= before) break;
    }
    const collectedDrops = window.__world.debugCollectDrops?.(3);
    const baitSet = window.__world.debugSetItem('bait', 1);
    const rodSet = window.__world.debugSetItem('fishingRod', rod ? 1 : 0);
    const rawSet = window.__world.debugSetItem('rawFish', 0);
    return { scenario, nativeInteractions, nativeLife: window.__world.nativeLife?.(), collectedDrops, baitSet, rodSet, rawSet, cue: window.__world.fishingCue(), text: JSON.parse(window.render_game_to_text()) };
  }, hasRod);
  if (!setup.scenario?.ok) throw new Error(`Unable to set shore fish scenario: ${JSON.stringify(setup)}`);
  if (setup.scenario.mappedSlug !== 'fish-shore-minnow') throw new Error(`Scenario mapped to ${setup.scenario.mappedSlug}`);
  if (!setup.baitSet?.ok || !setup.rodSet?.ok || !setup.rawSet?.ok) throw new Error(`Unable to set cue inventory: ${JSON.stringify(setup)}`);

  await page.evaluate((tile) => {
    window.__world.setZoom?.(0.48);
    window.__world.debugAimAtTile?.(tile);
  }, setup.scenario.visualTile ?? setup.scenario.site?.tile ?? setup.scenario.tile);

  await page.waitForFunction((rod) => {
    const cue = window.__world?.fishingCue?.();
    const text = JSON.parse(window.render_game_to_text());
    const vitals = document.querySelector('#vitals')?.textContent ?? '';
    const renderer = window.__world?.fishVisuals?.().renderer;
    return cue?.showInVitals === true
      && cue.hasRod === rod
      && text.inventory?.food?.fishingCue?.hud === cue.hud
      && vitals.includes(cue.hud)
      && renderer?.slug === 'fish-shore-minnow'
      && (renderer?.active ?? 0) === 1
      && (renderer?.glbAnchorsVisible ?? 0) > 0
      && (renderer?.nearBoidSprites ?? 0) > 0
      && (renderer?.swimPathBeads ?? 0) > 0
      && (renderer?.kilnFishSkinsPending ?? 0) === 0
      && (renderer?.kilnFishSkinFallbacks ?? 0) === 0;
  }, hasRod, { timeout: 70000 });

  await page.waitForTimeout(300);
  return {
    setup,
    beforeText: await readText(page),
    vitals: await page.locator('#vitals').textContent(),
  };
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
    const consoleErrors = [];
    const pageErrors = [];
    const kilnRequests = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        consoleErrors.push(text);
        console.error(`[browser:${msg.type()}] ${text}`);
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err instanceof Error ? err.message : String(err)));
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/assets/kiln/')) kilnRequests.push(url);
    });

    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const world = window.__world;
      return !!world?.debugSetLiveFishScenario
        && !!world?.debugSetItem
        && !!world?.fishingCue
        && !!world?.fishVisuals
        && typeof window.render_game_to_text === 'function';
    }, null, { timeout: 45000 });

    const success = await setupShoreCue(page, true);
    const cue = success.beforeText.inventory.food.fishingCue;
    if (cue.hud !== 'R cast: baited shore nibble · +2 raw fish · bait ready') {
      throw new Error(`Unexpected success cue: ${JSON.stringify(cue)}`);
    }
    const beforeRawFish = success.beforeText.inventory.food.rawFish ?? 0;
    await pressUseInput(page);
    await page.waitForTimeout(700);
    const successAfter = await readText(page);
    const successToast = await page.locator('#msg').textContent();
    if (!(
      (successAfter.inventory?.food?.rawFish ?? 0) > beforeRawFish
      && String(successAfter.inventory?.food?.lastAction ?? '').includes('fish:shore:caught raw fish')
      && successToast?.includes('caught raw fish')
      && successToast.includes('cook at a lit campfire')
    )) {
      throw new Error(`Success cue input did not resolve as a fish cast: ${JSON.stringify({
        beforeRawFish,
        afterFood: successAfter.inventory?.food,
        toast: successToast,
        panels: successAfter.panels,
        controls: successAfter.inventory?.controls,
      })}`);
    }
    const successShot = path.join(outDir, 'shore-cast-cue.png');
    await page.screenshot({ path: successShot, fullPage: false });

    const noRod = await setupShoreCue(page, false);
    const noRodCue = noRod.beforeText.inventory.food.fishingCue;
    if (noRodCue.hud !== 'craft fishing rod to cast' || noRodCue.failureReason !== 'no rod') {
      throw new Error(`Unexpected no-rod cue: ${JSON.stringify(noRodCue)}`);
    }
    await pressUseInput(page);
    await page.waitForTimeout(700);
    const noRodAfter = await readText(page);
    const noRodToast = await page.locator('#msg').textContent();
    if (!(
      noRodAfter.inventory?.food?.lastAction === 'fish:no rod'
      && (noRodAfter.inventory?.food?.rawFish ?? 0) === 0
      && noRodToast?.includes('Craft fishing rod to cast here')
    )) {
      throw new Error(`No-rod cue input did not resolve as a fishing setup denial: ${JSON.stringify({
        afterFood: noRodAfter.inventory?.food,
        toast: noRodToast,
        panels: noRodAfter.panels,
        controls: noRodAfter.inventory?.controls,
      })}`);
    }
    const noRodShot = path.join(outDir, 'shore-no-rod-cue.png');
    await page.screenshot({ path: noRodShot, fullPage: false });

    const committedRequests = kilnRequests.filter((url) => url.includes('/assets/kiln/models/fish-shore-minnow.glb'));
    const generatedRequests = kilnRequests.filter((url) => url.includes('/generated/'));
    if (committedRequests.length < 1) throw new Error('No committed fish-shore-minnow GLB request recorded');
    if (generatedRequests.length > 0) throw new Error(`Generated asset request leaked: ${JSON.stringify(generatedRequests)}`);
    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`K9 fishing cue proof had browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`);
    }

    const proof = {
      ok: true,
      success: {
        before: success.beforeText.inventory.food.fishingCue,
        after: successAfter.inventory.food,
        vitals: success.vitals,
        toast: successToast,
        screenshot: successShot,
      },
      noRod: {
        before: noRod.beforeText.inventory.food.fishingCue,
        after: noRodAfter.inventory.food,
        vitals: noRod.vitals,
        toast: noRodToast,
        screenshot: noRodShot,
      },
      committedRequests,
      generatedRequests,
      consoleErrors,
      pageErrors,
      note: 'K9.2 proves fishing cues through the normal HUD vitals, render_game_to_text, __world.fishingCue, player use input via the accepted synthetic gamepad path, toast feedback, inventory/lastAction readback, and committed GLB provenance.',
    };
    await fs.writeFile(path.join(outDir, 'proof.json'), JSON.stringify(proof, null, 2));
    console.log(JSON.stringify({
      ok: true,
      successCue: proof.success.before.hud,
      noRodCue: proof.noRod.before.hud,
      successToast,
      noRodToast,
      screenshots: [successShot, noRodShot],
      committedRequests: committedRequests.length,
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
