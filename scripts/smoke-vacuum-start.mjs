/** Saved-on-vacuum startup regression in a disposable Chrome profile.
 * Native Creative buttons visit Vespera, confirm autosave, reload there, then
 * return to Aurelia. No screenshots, CPU profiles, or existing user saves.
 * node scripts/smoke-vacuum-start.mjs [origin] [output-directory] [--gl]
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cpus, platform, release } from 'node:os';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5199');
const output = resolve(process.argv[3] ?? 'output/vacuum-start-smoke');
url.search = '?m=192&seed=GP192-01&mode=creative&mute=1';
if (process.argv.includes('--gl')) url.searchParams.set('gpu', 'gl');
const saveKey = 'goldberg-planet:v4:m192:GP192-01:worlds-v3:creative';
const executablePath = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const report = {
  url: url.href, startedAt: new Date().toISOString(),
  method: 'One isolated temporary profile. Native planet buttons; verify real Vespera autosave before normal reload. Return window begins in the capture phase of the native Aurelia click and continues until 3 seconds after travel settles. Continuous rAF and Long Tasks only, no screenshots/profiler/GPU timer. Bounded readiness regression, not a general performance gate.',
  environment: { node: process.version, platform: platform(), release: release(), cpu: cpus()[0]?.model,
    executablePath, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 } },
  bundles: [], checks: [], errors: [], warnings: [],
};
let browser, page, phase = 'launch';
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const check = (label, ok, detail) => {
  report.checks.push({ label, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) throw new Error(label);
};
const summary = values => {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const at = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? 0;
  return { n: sorted.length, p50: at(.5), p95: at(.95), p99: at(.99), max: at(1), over50: sorted.filter(n => n > 50).length };
};
try {
  await mkdir(output, { recursive: true });
  browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: 120000,
    args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  report.environment.browser = await browser.version();
  const system = await browser.target().createCDPSession();
  try { report.environment.gpu = (await system.send('SystemInfo.getInfo')).gpu; } finally { await system.detach(); }
  page = await browser.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(60000);
  await page.setViewport(report.environment.viewport);
  page.on('pageerror', error => report.errors.push({ phase, source: 'page', message: String(error) }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ phase, source: 'console', message: message.text() });
    if (message.type() === 'warn') report.warnings.push({ phase, message: message.text() });
  });
  await page.evaluateOnNewDocument(() => {
    let raf = 0, previous = 0, armed = false, capture = null;
    const unhandled = [];
    const snapshot = () => {
      const g = window.__game;
      return { planet: g.solarSystem.activePlanet.config.id, mode: g.player.mode,
        streaming: g.streamer.stats(), vegetation: g.habitat.stats(), fauna: g.wildlife.stats(),
        travel: { ...g.solarSystem.travelState } };
    };
    const tasks = entries => {
      if (!capture || capture.endMs) return;
      for (const entry of entries) if (entry.startTime + entry.duration >= capture.startMs) {
        capture.longTasks.push({ startMs: entry.startTime, duration: entry.duration });
      }
    };
    let observer;
    try { observer = new PerformanceObserver(list => tasks(list.getEntries())); observer.observe({ type: 'longtask' }); } catch { /* Report support explicitly. */ }
    const tick = now => {
      if (capture && !capture.endMs) {
        if (previous) capture.frameIntervalsMs.push(now - previous);
        const g = window.__game;
        if (g?.solarSystem.activePlanet.config.id === 'planet-0' && !g.solarSystem.travelState.pending) {
          if (capture.settledMs === null) { capture.settledMs = performance.now(); capture.atSettled = snapshot(); }
          if (capture.faunaReadyMs === null) {
            const fauna = g.wildlife.stats();
            if (g.wildlife.group.visible && fauna.occupied > 0 && fauna.draws > 0) {
              capture.faunaReadyMs = performance.now(); capture.firstFauna = fauna;
            }
          }
        }
      }
      previous = now; raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const click = event => {
      if (!armed || !event.target?.closest?.('[data-planet="planet-0"]')) return;
      observer?.takeRecords(); armed = false;
      capture = { startMs: performance.now(), settledMs: null, faunaReadyMs: null,
        observerSupported: !!observer, before: snapshot(), frameIntervalsMs: [], longTasks: [] };
      previous = 0;
    };
    const rejection = event => unhandled.push(String(event.reason));
    document.addEventListener('click', click, true); addEventListener('unhandledrejection', rejection);
    window.__vacuumStart = {
      snapshot, arm() { armed = true; },
      done() { return !!capture?.settledMs && performance.now() >= capture.settledMs + 3000; },
      finish() {
        if (!capture) throw new Error('Native home click did not start capture');
        tasks(observer?.takeRecords() ?? []); capture.endMs = performance.now();
        return { ...capture, after: snapshot(), unhandled: [...unhandled] };
      },
      dispose() { cancelAnimationFrame(raf); observer?.disconnect(); document.removeEventListener('click', click, true); removeEventListener('unhandledrejection', rejection); },
    };
  });
  const ready = async () => {
    await page.waitForFunction(() => window.__game?.gameMode === 'creative' && !document.getElementById('splash'), { timeout: 120000 });
    report.bundles.push(await page.$$eval('script[src]', nodes => nodes.map(node => new URL(node.src).pathname)));
  };
  const steady = async () => {
    await page.waitForFunction(() => !__game.solarSystem.travelState.pending && __game.streamer.stats().queued === 0 && !__game.habitat.stats().pending, { timeout: 60000 });
    await pause(1000);
  };
  const guide = async () => {
    if (!await page.evaluate(() => __game.hud.isMenuOpen())) await page.locator('[data-action="guide"]').click();
    await page.locator('[data-tab="planets"]').click();
  };
  phase = 'fresh-home';
  const firstBoot = performance.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded' }); await ready(); await steady();
  report.firstBootMs = performance.now() - firstBoot;
  phase = 'visit-and-save-vespera';
  await guide(); await page.locator('[data-planet="planet-1"]:not(:disabled)').click();
  await page.waitForFunction(() => __game.solarSystem.activePlanet.config.id === 'planet-1' && !__game.solarSystem.travelState.pending, { timeout: 60000 });
  await steady();
  // Await the real dirty/heartbeat autosave, then trigger the real beforeunload
  // writer through reload. Never synthesize a WorldSave or call internal writers.
  await page.waitForFunction(key => {
    const value = localStorage.getItem(key); if (!value) return false;
    const saved = JSON.parse(value); return saved.activePlanetId === 'planet-1' && saved.mode === 'creative';
  }, {}, saveKey);
  report.saved = await page.evaluate(key => { const saved = JSON.parse(localStorage.getItem(key)); return {
    key, version: saved.version, savedAt: saved.savedAt, planet: saved.activePlanetId, mode: saved.mode,
    faunaResidents: saved.faunaByPlanet?.['planet-1']?.residents.length,
  }; }, saveKey);
  check('Actual autosave records Vespera with no native fauna', report.saved.planet === 'planet-1' && report.saved.faunaResidents === 0, report.saved);
  phase = 'reload-on-vespera';
  const reload = performance.now();
  await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await steady();
  report.reloadMs = performance.now() - reload;
  report.onReload = await page.evaluate(() => __vacuumStart.snapshot());
  check('Normal reload starts walking on Vespera with no fauna pools', report.onReload.planet === 'planet-1' && report.onReload.mode === 'walk' &&
    report.onReload.fauna.pooledSlots === 0 && report.onReload.fauna.occupied === 0, report.onReload);
  phase = 'first-home-after-vacuum-start';
  await guide(); await page.waitForSelector('[data-planet="planet-0"]:not(:disabled)');
  await page.evaluate(() => __vacuumStart.arm());
  await page.locator('[data-planet="planet-0"]:not(:disabled)').click();
  await page.waitForFunction(() => __vacuumStart.done(), { timeout: 60000 });
  const capture = await page.evaluate(() => __vacuumStart.finish());
  report.return = { ...capture, frames: summary(capture.frameIntervalsMs), longTaskSummary: summary(capture.longTasks.map(task => task.duration)),
    timeToSettledMs: capture.settledMs - capture.startMs, timeToFaunaMs: capture.faunaReadyMs === null ? null : capture.faunaReadyMs - capture.startMs };
  check('Native home visit settles and renders live Aurelia fauna', capture.after.planet === 'planet-0' && capture.after.mode === 'walk' &&
    !capture.after.travel.pending && !capture.after.travel.error && capture.faunaReadyMs !== null && capture.after.fauna.occupied > 0 && capture.after.fauna.draws > 0,
    { fauna: capture.after.fauna, travel: capture.after.travel, frames: report.return.frames, timeToFaunaMs: report.return.timeToFaunaMs });
  check('No shader/page errors, warnings or unhandled rejections', !report.errors.length && !report.warnings.length && !capture.unhandled.length,
    { errors: report.errors, warnings: report.warnings, unhandled: capture.unhandled });
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = String(error); report.stack = error.stack; process.exitCode = 1;
} finally {
  if (page && !page.isClosed()) await page.evaluate(() => window.__vacuumStart?.dispose()).catch(() => {});
  await browser?.close(); report.completedAt = new Date().toISOString();
  await mkdir(output, { recursive: true }); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, frames: report.return?.frames,
    timeToFaunaMs: report.return?.timeToFaunaMs, errors: report.errors, warnings: report.warnings, failure: report.failure }));
}
