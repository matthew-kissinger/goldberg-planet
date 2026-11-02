/**
 * Disposable native-browser smoke for asynchronous mesh lifecycle correctness.
 * Run after a stable build/server is ready:
 *   node scripts/smoke-streaming.mjs http://127.0.0.1:5199/
 * CHROME_PATH/PUPPETEER_EXECUTABLE_PATH, SMOKE_URL, SMOKE_TIMEOUT_MS and SMOKE_OUTPUT override defaults.
 * Uses diagnostic game APIs, not keyboard/mouse playthrough. Does not measure production FPS.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const url = new URL(process.argv[2] ?? process.env.SMOKE_URL ?? 'http://127.0.0.1:5196/');
url.searchParams.set('nosave', '1');
url.searchParams.set('mute', '1');
if (!url.searchParams.has('m')) url.searchParams.set('m', '48');
// Never join a live co-op room or clear any save slot during this local smoke.
for (const param of ['room', 'ws', 'reset']) url.searchParams.delete(param);
const timeout = Number(process.env.SMOKE_TIMEOUT_MS ?? 60_000);
const output = resolve(process.env.SMOKE_OUTPUT ?? 'output/performance/streaming-smoke.json');
const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : undefined,
].find(path => path && existsSync(path));
const report = {
  measuredAt: new Date().toISOString(),
  purpose: 'Native Worker lifecycle smoke using diagnostic game APIs in an isolated temporary browser profile',
  url: url.href,
  environment: { node: process.version, executablePath },
  cases: [], pageErrors: [], consoleErrors: [], consoleWarnings: [], requestFailures: [], httpErrors: [],
};
let browser;
let page;
let failure;
const check = (condition, message) => { if (!condition) throw new Error(message); };
const runCase = async (name, operation) => {
  const start = performance.now();
  try {
    const evidence = await operation();
    report.cases.push({ name, status: 'passed', elapsedMs: performance.now() - start, evidence });
  } catch (error) {
    report.cases.push({ name, status: 'failed', elapsedMs: performance.now() - start, error: String(error) });
    throw error;
  }
};

try {
  check(executablePath, 'Chrome executable not found; set CHROME_PATH or PUPPETEER_EXECUTABLE_PATH');
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    protocolTimeout: timeout,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  report.environment.browser = await browser.version();
  page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
    else if (message.type() === 'warn') report.consoleWarnings.push(message.text());
  });
  page.on('requestfailed', request => report.requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }));
  page.on('response', response => {
    if (response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() });
  });
  await page.evaluateOnNewDocument(() => {
    globalThis.__streamingSmoke = { unhandledRejections: [] };
    addEventListener('unhandledrejection', event => globalThis.__streamingSmoke.unhandledRejections.push(String(event.reason)));
  });
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!globalThis.__game && !document.getElementById('splash'), { timeout, polling: 50 });
  await page.waitForFunction(() => {
    const s = globalThis.__game.streamer.stats();
    return s.queued === 0 && s.pending === 0 && s.ready === 0;
  }, { timeout, polling: 50 });
  report.initial = await page.evaluate(() => ({
    state: JSON.parse(globalThis.render_game_to_text()),
    localStorageEntries: localStorage.length,
    hardwareConcurrency: navigator.hardwareConcurrency,
    workerCount: globalThis.__game.streamer.workerPool.workers.length,
  }));
  check(report.initial.state.performance.streaming.threaded, 'Native mesh workers must be active before these cases');
  check(report.initial.localStorageEntries === 0, 'Disposable browser profile unexpectedly contains saved state');

  await runCase('async tree damage and fell replacement', async () => {
    const first = await page.evaluate(() => {
      const g = globalThis.__game;
      const active = g.solarSystem.activePlanet;
      let chosen;
      for (const [key, resident] of g.streamer.resident) {
        if (!resident.mesh) continue;
        const tile = resident.info.tiles.find(id => active.trees.hasTree(id));
        if (tile !== undefined) { chosen = { key, tile, resident }; break; }
      }
      if (!chosen) throw new Error('No live tree exists in resident terrain');
      const { key, tile, resident } = chosen;
      const beforeUuid = resident.mesh.uuid;
      const workerSamples = g.streamer.workerBuildSamples.length;
      const start = performance.now();
      const hit = g.loop.strikeTree(tile);
      return {
        key, tile, beforeUuid, workerSamples, initialTriangles: resident.triangles,
        hit, callbackMs: performance.now() - start,
        sameMeshImmediately: g.streamer.resident.get(key)?.mesh?.uuid === beforeUuid,
      };
    });
    check(first.hit && first.sameMeshImmediately, 'A tree hit must schedule work while retaining the current chunk mesh');
    await page.waitForFunction(({ key, beforeUuid, workerSamples }) => {
      const s = globalThis.__game.streamer;
      return s.resident.get(key)?.mesh?.uuid !== beforeUuid && s.workerBuildSamples.length > workerSamples;
    }, { timeout, polling: 25 }, first);

    const fell = await page.evaluate(({ key, tile }) => {
      const g = globalThis.__game;
      const active = g.solarSystem.activePlanet;
      const previousUuid = g.streamer.resident.get(key).mesh.uuid;
      const dropsBefore = g.loop.drops.length;
      const workerSamples = g.streamer.workerBuildSamples.length;
      // Put an intermediate damaged-tree mesh in flight, then invalidate it by felling
      // before a worker completion can be handled on the main thread.
      const secondHit = g.loop.strikeTree(tile);
      g.streamer.pump(50, 1);
      const pendingBeforeFell = g.streamer.stats().pending;
      let extraHits = 0;
      while (!active.trees.chopped.has(tile) && extraHits < 4) {
        if (!g.loop.strikeTree(tile)) break;
        extraHits++;
      }
      return {
        previousUuid, secondHit, pendingBeforeFell, extraHits, workerSamples,
        felled: active.trees.chopped.has(tile),
        dropCountBefore: dropsBefore, dropCountAfter: g.loop.drops.length,
        sameMeshImmediately: g.streamer.resident.get(key)?.mesh?.uuid === previousUuid,
      };
    }, first);
    check(fell.secondHit && fell.felled && fell.sameMeshImmediately, 'Felling must retain the existing mesh until its replacement arrives');
    check(fell.pendingBeforeFell > 0, 'An intermediate damage result must be in flight when felling invalidates it');
    check(fell.dropCountAfter > fell.dropCountBefore, 'Felling did not create resource drops');
    await page.waitForFunction(({ key, previousUuid, workerSamples }) => {
      const g = globalThis.__game, s = g.streamer.stats();
      return s.queued === 0 && s.pending === 0 && s.ready === 0 &&
        g.streamer.resident.get(key)?.mesh?.uuid !== previousUuid &&
        g.streamer.workerBuildSamples.length > workerSamples;
    }, { timeout, polling: 25 }, { key: first.key, ...fell });
    const final = await page.evaluate(({ key, tile }) => {
      const g = globalThis.__game;
      return { triangles: g.streamer.resident.get(key)?.triangles, felled: g.solarSystem.activePlanet.trees.chopped.has(tile), streaming: g.streamer.stats() };
    }, first);
    check(final.felled && final.triangles < first.initialTriangles, 'Latest worker mesh must remove the felled tree geometry');
    return { first, fell, final };
  });

  await runCase('rapid destination changes reject stale preparation and mesh results', async () => {
    const transitions = await page.evaluate(async () => {
      const g = globalThis.__game;
      const homeId = g.solarSystem.activePlanet.config.id;
      const samples = [], completions = [];
      for (const planet of g.solarSystem.planets.slice(1, 4)) {
        if (!g.solarSystem.warpToPlanet(planet.config.id, g.player, 0, false)) throw new Error('Warp failed');
        completions.push(g.solarSystem.whenTravelSettled());
        samples.push({ requestedId: planet.config.id, activeId: g.solarSystem.activePlanet.config.id, travel: g.solarSystem.travelState });
      }
      const settled = await Promise.all(completions);
      const reachedId = g.solarSystem.activePlanet.config.id;
      // Dispatch new-world chunks, then immediately return to a cached world. These
      // generation-stale meshes must never attach after the ready return swap.
      g.streamer.refreshDesired(...g.player.up(), g.player.altitudeAGL());
      g.streamer.pump(50, 2);
      const beforeReturn = g.streamer.stats();
      if (!g.solarSystem.warpToPlanet(homeId, g.player, 0, false)) throw new Error('Cached return failed');
      if (!await g.solarSystem.whenTravelSettled()) throw new Error('Cached return did not settle');
      g.streamer.refreshDesired(...g.player.up(), g.player.altitudeAGL());
      g.streamer.pump(50, 2);
      return { samples, settled, reachedId, beforeReturn, homeId, afterReturn: g.streamer.stats(), concurrency: g.streamer.workerPool.concurrency };
    });
    check(transitions.settled.join(',') === 'false,false,true', 'Superseded destination preparation committed or failed to settle');
    check(transitions.samples.every(t => t.activeId === transitions.homeId && t.travel.pending), 'Unprepared travel changed the active world');
    check(transitions.reachedId === transitions.samples.at(-1).requestedId, 'Newest destination failed to become active');
    check(transitions.beforeReturn.pending > 0, 'Return must have old-world jobs in flight to exercise stale-generation protection');
    check(transitions.afterReturn.pending + transitions.afterReturn.ready <= transitions.concurrency, 'Return exceeded worker backpressure');
    await page.waitForFunction(() => {
      const s = globalThis.__game.streamer.stats();
      return s.resident > 0 && s.queued === 0 && s.pending === 0 && s.ready === 0;
    }, { timeout, polling: 25 });
    const final = await page.evaluate(() => {
      const g = globalThis.__game;
      const active = g.solarSystem.activePlanet.config;
      let meshCount = 0, maxRadiusError = 0;
      for (const resident of g.streamer.resident.values()) {
        if (!resident.mesh) continue;
        meshCount++;
        maxRadiusError = Math.max(maxRadiusError, Math.abs(Math.hypot(...resident.mesh.userData.anchor) - active.radius));
      }
      return { activePlanetId: active.id, radius: active.radius, meshCount, maxRadiusError, streaming: g.streamer.stats(), travel: g.solarSystem.travelState };
    });
    check(final.activePlanetId === transitions.homeId && final.meshCount > 0 && final.maxRadiusError < 1e-6,
      'A mesh from a previous planet survived the final warp');
    return { transitions, final };
  });

  await runCase('native worker failure settles requests and rebuilds via fallback', async () => {
    const before = await page.evaluate(() => {
      const g = globalThis.__game;
      const pool = g.streamer.workerPool;
      const entry = [...g.streamer.resident].find(([, resident]) => resident.mesh);
      if (!entry || !pool.workers[0]) throw new Error('No resident mesh or native worker available');
      const [key, resident] = entry;
      const hashGeometry = geometry => {
        let hash = 2166136261;
        for (const name of ['position', 'normal', 'color', 'packedMat']) {
          const attr = geometry.getAttribute(name);
          const bytes = new Uint8Array(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
          for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
        }
        return hash;
      };
      const beforeHash = hashGeometry(resident.mesh.geometry);
      const beforeUuid = resident.mesh.uuid;
      // Intentional fault in this disposable browser ONLY. An invalid configuration
      // makes the native worker return worker_error through its real message channel.
      pool.workers[0].postMessage({ type: 'init_planet', planetId: 'qa-invalid-config', m: g.geo.m, config: null });
      g.streamer.rebuildTile(resident.info.tiles[0]);
      g.streamer.pump(50, 1);
      return { key, beforeUuid, beforeHash, pendingAtInjection: g.streamer.stats().pending };
    });
    check(before.pendingAtInjection > 0, 'A job must be pending when the native fault is delivered');
    await page.waitForFunction(({ key, beforeUuid }) => {
      const g = globalThis.__game, s = g.streamer.stats();
      return !s.threaded && s.pending === 0 && s.ready === 0 && s.queued === 0 &&
        !!g.streamer.resident.get(key)?.mesh && g.streamer.resident.get(key).mesh.uuid !== beforeUuid;
    }, { timeout, polling: 25 }, before);
    const after = await page.evaluate(({ key }) => {
      const g = globalThis.__game;
      const geometry = g.streamer.resident.get(key).mesh.geometry;
      let hash = 2166136261;
      for (const name of ['position', 'normal', 'color', 'packedMat']) {
        const attr = geometry.getAttribute(name);
        const bytes = new Uint8Array(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
        for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
      }
      return { geometryHash: hash, failure: g.streamer.workerPool.failure, streaming: g.streamer.stats(), workersRemaining: g.streamer.workerPool.workers.length };
    }, before);
    check(after.failure && after.workersRemaining === 0, 'Worker failure did not terminate the native pool');
    check(after.geometryHash === before.beforeHash, 'Synchronous fallback changed geometry relative to the worker build');
    return { before, after };
  });

  report.final = await page.evaluate(() => ({
    state: JSON.parse(globalThis.render_game_to_text()),
    localStorageEntries: localStorage.length,
    unhandledRejections: globalThis.__streamingSmoke.unhandledRejections,
  }));
  check(report.final.localStorageEntries === 0, 'Smoke unexpectedly wrote saved game state');
  check(report.pageErrors.length === 0, `Uncaught browser errors: ${report.pageErrors.join('; ')}`);
  check(report.final.unhandledRejections.length === 0, `Unhandled promise rejections: ${report.final.unhandledRejections.join('; ')}`);
  check(report.consoleErrors.length === 0, `Browser console errors: ${report.consoleErrors.join('; ')}`);
  report.status = 'passed';
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = error instanceof Error ? error.stack : String(error);
  if (page && !page.isClosed()) {
    try {
      report.failureState = await page.evaluate(() => ({
        splash: document.getElementById('splashmsg')?.textContent,
        state: typeof globalThis.render_game_to_text === 'function' ? JSON.parse(globalThis.render_game_to_text()) : null,
        unhandledRejections: globalThis.__streamingSmoke?.unhandledRejections,
      }));
    } catch (captureError) { report.failureCaptureError = String(captureError); }
  }
} finally {
  if (browser) await browser.close().catch(error => { report.closeError = String(error); });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, output, cases: report.cases.map(({ name, status }) => ({ name, status })), error: failure ? String(failure) : undefined }, null, 2));
  if (failure) process.exitCode = 1;
}
