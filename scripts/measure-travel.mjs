/** Bounded travel measurements, each in a fresh Chrome process and temporary profile.
 * node scripts/measure-travel.mjs [origin=http://127.0.0.1:5199/] [count=5] [label=travel]
 * Baseline example: node scripts/measure-travel.mjs http://127.0.0.1:5201/ 1 travel-baseline
 * CHROME_PATH / PUPPETEER_EXECUTABLE_PATH, TRAVEL_OUTPUT and TRAVEL_TIMEOUT_MS are optional.
 * Keep the served production build unchanged. Do not run another GPU capture concurrently.
 * rAF intervals are presentation scheduling evidence, not GPU timer measurements.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { cpus, platform, release, arch, totalmem } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5199/');
const count = Number(process.argv[3] ?? 5);
const label = process.argv[4] ?? 'travel';
const allWorlds = process.argv.includes('--all-worlds');
const travelStages = allWorlds
  ? [1, 2, 3, 4, 5].map(id => [`coldPlanet${id}`, `planet-${id}`, 2500])
    .concat([4, 3, 2, 1, 0].map(id => [`cachedPlanet${id}`, `planet-${id}`, 1500]))
  : [['coldArrival', 'planet-1', 2000], ['cachedReturn', 'planet-0', 1000]];
const timeout = Number(process.env.TRAVEL_TIMEOUT_MS ?? 180_000);
if (!Number.isInteger(count) || count < 1 || count > 30) throw new Error('Run count must be an integer from 1 to 30');
if (!Number.isFinite(timeout) || timeout < 10_000) throw new Error('TRAVEL_TIMEOUT_MS must be at least 10000');
for (const [key, value] of Object.entries({ nosave: '1', mute: '1', m: '192', seed: 'GP192-01', mode: 'creative' })) url.searchParams.set(key, value);
for (const key of ['room', 'ws', 'reset', 'debug']) url.searchParams.delete(key);
const output = resolve(process.env.TRAVEL_OUTPUT ?? `output/performance/${label}/results.json`);
const executablePath = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : undefined,
].find(path => path && existsSync(path));
if (!executablePath) throw new Error('Chrome not found; set CHROME_PATH');
const launchArgs = ['--no-first-run', '--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim(); } catch { return null; } };
const report = {
  label, allWorlds, startedAt: new Date().toISOString(), requestedRuns: count, url: url.href,
  methodology: {
    freshBrowserPerRun: true, saveDisabled: true, topologyM: 192, seed: 'GP192-01',
    initialSteadyQueueMs: 1000, coldPostReadyHoldMs: allWorlds ? 2500 : 2000, cachedPostReadyHoldMs: allWorlds ? 1500 : 1000,
    streamingDrainBetweenWindows: true, screenshots: false, cpuProfiler: false, gpuTimer: false,
    notes: 'Each window starts at an animation frame immediately before the warp callback. Long tasks overlap-filter to the window. Raw rAF intervals include preparation, ready swap and the post-ready hold. These are bounded runs, not a general performance gate.',
  },
  environment: {
    node: process.version, platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, memoryBytes: totalmem(), executablePath, launchArgs,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    workingTreeHead: git('rev-parse', 'HEAD'), workingTreeStatus: git('status', '--short'),
    scriptSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
    sourceNote: 'Git metadata describes the workspace, not necessarily the served build; per-run resource paths identify the actual loaded bundles.',
  },
  runs: [],
};

function summary(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  const at = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return { n: sorted.length, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: sorted.at(-1) ?? 0, over50: sorted.filter(value => value > 50).length };
}
function stageSummaries() {
  return Object.fromEntries(travelStages.map(([name]) => {
    const stages = report.runs.flatMap(run => run[name] ? [run[name]] : []);
    return [name, {
      completedRuns: stages.length,
      inputCallbackMs: summary(stages.map(stage => stage.inputCallbackMs)),
      preparationMs: summary(stages.map(stage => stage.travel?.preparationMs)),
      maxSliceMs: summary(stages.map(stage => stage.travel?.maxSliceMs)),
      commitMs: summary(stages.map(stage => stage.travel?.commitMs)),
      frameP95Ms: summary(stages.map(stage => stage.frames.p95)),
      frameP99Ms: summary(stages.map(stage => stage.frames.p99)),
      frameMaxMs: summary(stages.map(stage => stage.frames.max)),
      frameOver50: summary(stages.map(stage => stage.frames.over50)),
    }];
  }));
}
async function save() {
  report.completedAt = new Date().toISOString(); report.aggregate = stageSummaries();
  await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2));
}

for (let index = 0; index < count; index++) {
  const run = { index: index + 1, startedAt: new Date().toISOString(), status: 'running', errors: [], warnings: [], requestFailures: [], httpErrors: [] };
  report.runs.push(run);
  let browser, page, phase = 'boot';
  try {
    browser = await puppeteer.launch({ executablePath, headless: true, protocolTimeout: timeout, args: launchArgs });
    run.browser = await browser.version();
    const system = await browser.target().createCDPSession();
    try { run.gpu = (await system.send('SystemInfo.getInfo')).gpu; } finally { await system.detach(); }
    page = await browser.newPage();
    page.setDefaultTimeout(timeout); page.setDefaultNavigationTimeout(timeout);
    await page.setViewport(report.environment.viewport);
    page.on('pageerror', error => run.errors.push({ phase, source: 'page', message: String(error) }));
    page.on('console', message => {
      if (message.type() === 'error') run.errors.push({ phase, source: 'console', message: message.text() });
      if (message.type() === 'warn') run.warnings.push({ phase, message: message.text() });
    });
    page.on('requestfailed', request => run.requestFailures.push({ phase, url: request.url(), error: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) run.httpErrors.push({ phase, url: response.url(), status: response.status() }); });
    await page.evaluateOnNewDocument(() => {
      const state = { active: null, previousFrame: 0, raf: 0, timers: new Set(), unhandled: [], steadySince: 0, observerSupported: false };
      const receiveTasks = entries => {
        if (!state.active) return;
        for (const entry of entries) if (entry.startTime + entry.duration >= state.active.startMs) {
          state.active.longTasks.push({ startMs: entry.startTime, duration: entry.duration, name: entry.name });
        }
      };
      let observer;
      try {
        observer = new PerformanceObserver(list => receiveTasks(list.getEntries()));
        observer.observe({ type: 'longtask', buffered: false }); state.observerSupported = true;
      } catch { /* The report exposes missing Long Tasks support. */ }
      const tick = timestamp => {
        if (state.active && state.previousFrame > 0) state.active.frameIntervalsMs.push(timestamp - state.previousFrame);
        state.previousFrame = timestamp; state.raf = requestAnimationFrame(tick);
      };
      state.raf = requestAnimationFrame(tick);
      const unhandled = event => state.unhandled.push(String(event.reason));
      addEventListener('unhandledrejection', unhandled);
      const wait = milliseconds => new Promise(resolve => {
        const timer = setTimeout(() => { state.timers.delete(timer); resolve(); }, milliseconds);
        state.timers.add(timer);
      });
      const within = (promise, milliseconds) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { state.timers.delete(timer); reject(new Error('Travel did not settle before the measurement timeout')); }, milliseconds);
        state.timers.add(timer);
        Promise.resolve(promise).then(value => { clearTimeout(timer); state.timers.delete(timer); resolve(value); }, error => { clearTimeout(timer); state.timers.delete(timer); reject(error); });
      });
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
      const snapshot = () => {
        const g = globalThis.__game;
        return {
          activePlanet: g.solarSystem.activePlanet.config.id,
          streaming: g.streamer.stats(),
          vegetation: g.habitat.stats(),
          travel: g.solarSystem.travelState ? { ...g.solarSystem.travelState } : null,
        };
      };
      globalThis.__travelMeasure = {
        state, snapshot,
        async measure(name, target, holdMs, timeoutMs) {
          const frameTime = await nextFrame();
          observer?.takeRecords();
          const window = { name, startMs: performance.now(), firstFrameTimestamp: frameTime, frameIntervalsMs: [], longTasks: [], before: snapshot() };
          state.previousFrame = frameTime; state.active = window;
          const g = globalThis.__game, inputStart = performance.now();
          g.triggerPlanetWarp(target);
          const accepted = g.solarSystem.travelState.targetId === target;
          window.inputCallbackMs = performance.now() - inputStart;
          window.afterInput = snapshot();
          if (!accepted) throw new Error(`Warp rejected: ${target}`);
          const settled = g.solarSystem.whenTravelSettled
            ? await within(g.solarSystem.whenTravelSettled(), timeoutMs)
            : true;
          if (!settled) throw new Error(`Travel failed: ${g.solarSystem.travelState?.error ?? target}`);
          window.readyMs = performance.now(); window.atReady = snapshot();
          if (window.atReady.activePlanet !== target) throw new Error(`Unexpected active planet: ${window.atReady.activePlanet}`);
          window.travel = window.atReady.travel;
          await wait(holdMs); await nextFrame();
          receiveTasks(observer?.takeRecords() ?? []);
          window.endMs = performance.now(); window.after = snapshot();
          state.active = null;
          window.elapsedMs = window.endMs - window.startMs;
          window.readyLatencyMs = window.readyMs - window.startMs;
          window.longTasks = window.longTasks.filter(entry => entry.startTime < window.endMs);
          return window;
        },
        dispose() {
          state.active = null; cancelAnimationFrame(state.raf); observer?.disconnect();
          for (const timer of state.timers) clearTimeout(timer);
          state.timers.clear(); removeEventListener('unhandledrejection', unhandled);
        },
      };
    });
    const bootStart = performance.now();
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!globalThis.__game && !document.getElementById('splash'), { timeout, polling: 100 });
    run.bootMs = performance.now() - bootStart;
    const waitSteady = async () => {
      await page.evaluate(() => { globalThis.__travelMeasure.state.steadySince = 0; });
      await page.waitForFunction(() => {
        const state = globalThis.__travelMeasure.state, s = globalThis.__game.streamer.stats();
        if (s.queued !== 0 || (s.pending ?? 0) !== 0 || (s.ready ?? 0) !== 0) { state.steadySince = 0; return false; }
        if (!state.steadySince) state.steadySince = performance.now();
        return performance.now() - state.steadySince >= 1000;
      }, { timeout, polling: 100 });
    };
    phase = 'warmup'; await waitSteady();
    run.initial = await page.evaluate(() => ({
      ...globalThis.__travelMeasure.snapshot(),
      hardwareConcurrency: navigator.hardwareConcurrency,
      longTasksSupported: globalThis.__travelMeasure.state.observerSupported,
      localStorageEntries: localStorage.length,
      renderer: JSON.parse(globalThis.render_game_to_text()).renderer,
      asyncTravelApi: typeof globalThis.__game.solarSystem.whenTravelSettled === 'function',
      resources: performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname).filter(path => /\.(?:js|glb|wasm)$/.test(path)),
    }));
    if (run.initial.localStorageEntries !== 0) throw new Error('Temporary browser profile unexpectedly has saved state');
    if (run.initial.activePlanet !== 'planet-0') throw new Error('Fresh run did not start on planet-0');
    for (const [name, target, holdMs] of travelStages) {
      phase = name;
      const stage = await page.evaluate((name, target, holdMs, timeoutMs) => globalThis.__travelMeasure.measure(name, target, holdMs, timeoutMs), name, target, holdMs, timeout);
      stage.frames = summary(stage.frameIntervalsMs);
      stage.tasks = summary(stage.longTasks.map(task => task.duration));
      run[name] = stage;
      console.log(JSON.stringify({ run: index + 1, stage: name, inputCallbackMs: stage.inputCallbackMs, readyLatencyMs: stage.readyLatencyMs, travel: stage.travel, frames: stage.frames, streaming: stage.after.streaming }));
      if (name !== travelStages.at(-1)[0]) { phase = 'betweenWindows'; await waitSteady(); }
    }
    phase = 'cleanup';
    run.unhandledRejections = await page.evaluate(() => globalThis.__travelMeasure.state.unhandled);
    run.localStorageEntriesAfter = await page.evaluate(() => localStorage.length);
    if (run.localStorageEntriesAfter !== 0) throw new Error('Measurement wrote local storage');
    run.status = run.errors.length || run.unhandledRejections.length || run.requestFailures.length || run.httpErrors.length ? 'failed' : 'passed';
  } catch (error) {
    run.status = 'failed'; run.failure = String(error);
    console.error(`Travel run ${index + 1} failed: ${error}`);
  } finally {
    if (page && !page.isClosed()) await page.evaluate(() => globalThis.__travelMeasure?.dispose()).catch(() => {});
    if (browser) await browser.close();
    run.closedAt = new Date().toISOString(); await save();
  }
}
report.status = report.runs.every(run => run.status === 'passed') ? 'passed' : 'failed';
await save();
console.log(JSON.stringify({ status: report.status, output, runs: report.runs.length, browserClosed: true, aggregate: report.aggregate }));
if (report.status !== 'passed') process.exitCode = 1;
