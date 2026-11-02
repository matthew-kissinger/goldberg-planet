// Sequential, disposable M192 comparison against ONE unchanged production build.
// Usage: node scripts/compare-render-pipelines.mjs http://127.0.0.1:5199
// Experimental meshlet mode must be deliberately present in that evaluation build.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:5199';
const output = resolve('output/meshlet-evaluation');
await mkdir(output, { recursive: true });
const report = { scope: 'Sequential headless production comparison; deterministic camera/player traversal replay, not input qualification', origin, seed: 'GP192-01', m: 192, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 }, cases: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
for (const pipeline of ['standard', 'meshlets']) {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const result = { pipeline, errors: [], warnings: [], errorCount: 0, warningCount: 0, stages: [] };
  const caseStart = performance.now();
  const remaining = () => Math.max(1, 60000 - (performance.now() - caseStart));
  try {
    const page = await browser.newPage();
    await page.setViewport(report.viewport);
    const record = (kind, message) => {
      const key = kind === 'error' ? 'errors' : 'warnings';
      result[kind === 'error' ? 'errorCount' : 'warningCount']++;
      const text = message.slice(0, 3000);
      if (result[key].length < 12 && !result[key].includes(text)) result[key].push(text);
    };
    page.on('pageerror', error => record('error', String(error)));
    page.on('console', message => { if (message.type() === 'error') record('error', message.text()); if (message.type() === 'warn') record('warn', message.text()); });
    const system = await browser.target().createCDPSession();
    result.gpu = (await system.send('SystemInfo.getInfo')).gpu;
    result.browser = await browser.version();
    await page.evaluateOnNewDocument(() => {
      window.__pipelineSamples = { frames: [], tasks: [], submits: [], pumps: [], gpuRender: [], gpuCompute: [] };
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__pipelineSamples.tasks.push(entry.duration); }).observe({ type: 'longtask', buffered: true });
      let previous = 0;
      const frame = t => { if (previous) window.__pipelineSamples.frames.push(t - previous); previous = t; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    });
    const start = performance.now();
    await page.goto(`${origin}/?nosave=1&mute=1&seed=GP192-01&m=192&debug=1&profilegpu=1${pipeline === 'meshlets' ? '&meshlets=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!window.__game, { timeout: Math.min(45000, remaining()) });
    await page.evaluate(() => {
      const g = window.__game, renderer = g.renderer;
      const render = renderer.render;
      renderer.render = function(...args) {
        const start = performance.now();
        try { return render.apply(this, args); }
        finally { window.__pipelineSamples.submits.push(performance.now() - start); }
      };
      const pump = g.streamer.pump;
      g.streamer.pump = function(...args) {
        const start = performance.now();
        try { return pump.apply(this, args); }
        finally { window.__pipelineSamples.pumps.push(performance.now() - start); }
      };
      window.__timestampSupported = renderer.hasFeature('timestamp-query') && renderer.backend.trackTimestamp;
      let busy = false;
      window.__gpuTimer = setInterval(async () => {
        if (busy || !window.__timestampSupported) return;
        busy = true;
        try {
          const render = await renderer.resolveTimestampsAsync('render');
          const compute = await renderer.resolveTimestampsAsync('compute');
          if (Number.isFinite(render) && render > 0) window.__pipelineSamples.gpuRender.push(render);
          if (Number.isFinite(compute) && compute > 0) window.__pipelineSamples.gpuCompute.push(compute);
        } finally { busy = false; }
      }, 100);
    });
    await page.waitForFunction(() => !document.getElementById('splash'), { timeout: remaining() });
    result.bootMs = performance.now() - start;
    const capture = async (name, duration, action) => {
      if (duration > remaining()) throw new Error('Case exceeded the 60-second comparison budget');
      if (name !== 'boot') await page.evaluate(() => { window.__pipelineSamples = { frames: [], tasks: [], submits: [], pumps: [], gpuRender: [], gpuCompute: [] }; });
      if (action) await action();
      if (duration) await wait(duration);
      const data = await page.evaluate(() => {
        const summary = values => { const a = [...values].sort((a, b) => a - b); const q = p => a[Math.max(0, Math.ceil(a.length * p) - 1)] ?? null; return { n: a.length, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: a.filter(v => v > 50).length }; };
        return { samples: Object.fromEntries(Object.entries(window.__pipelineSamples).map(([key, values]) => [key, summary(values)])), timestampSupported: window.__timestampSupported, game: JSON.parse(window.render_game_to_text()) };
      });
      result.stages.push({ name, ...data });
      await page.screenshot({ path: resolve(output, `${pipeline}-${name}.png`) });
      console.log(JSON.stringify({ pipeline, stage: name, frames: data.samples.frames, submit: data.samples.submits, gpuRender: data.samples.gpuRender, gpuCompute: data.samples.gpuCompute, errors: result.errorCount }));
      if (result.errorCount > 0) throw new Error('Renderer validation failed; stop case because incomplete draws invalidate performance comparison');
    };
    await capture('boot', 0);
    if (result.stages[0].game.drawingPipeline !== pipeline) throw new Error(`Requested ${pipeline} but actual pipeline is ${result.stages[0].game.drawingPipeline}; no comparison made`);
    await capture('settle', 4000);
    await capture('idle', 5000);
    await capture('route', 22000, () => page.evaluate(() => {
      const g = window.__game, p = g.player, route = g.habitat.recipe.route, centers = g.geo.centers;
      const points = route.map(tile => [centers[tile * 3], centers[tile * 3 + 1], centers[tile * 3 + 2]]);
      const cumulative = [0];
      for (let i = 1; i < points.length; i++) cumulative.push(cumulative.at(-1) + Math.hypot(...points[i].map((v, j) => (v - points[i - 1][j]) * 900)));
      const total = cumulative.at(-1), start = performance.now();
      const original = p.update;
      p.update = function(...args) {
        original.apply(this, args);
        const elapsed = Math.min(1, (performance.now() - start) / 21000), target = total * elapsed;
        let i = 1; while (i < cumulative.length - 1 && cumulative[i] < target) i++;
        const mix = Math.max(0, Math.min(1, (target - cumulative[i - 1]) / (cumulative[i] - cumulative[i - 1])));
        const a = points[i - 1], b = points[i];
        let x = a[0] * (1 - mix) + b[0] * mix, y = a[1] * (1 - mix) + b[1] * mix, z = a[2] * (1 - mix) + b[2] * mix;
        const inv = 1 / Math.hypot(x, y, z); x *= inv; y *= inv; z *= inv;
        const planet = g.solarSystem.activePlanet, tile = g.geo.tileOf(x, y, z), radius = planet.layers.topRadius(planet.columns.topLayerOf(tile)) + .05;
        this.px = x * radius; this.py = y * radius; this.pz = z * radius; this.tile = tile;
        this.fwdX = b[0] - a[0]; this.fwdY = b[1] - a[1]; this.fwdZ = b[2] - a[2]; this.reorthonormalize();
        this.vx = this.fwdX * 7.5; this.vy = this.fwdY * 7.5; this.vz = this.fwdZ * 7.5; this.grounded = true;
      };
      window.__stopReplay = () => { p.update = original; p.vx = 0; p.vy = 0; p.vz = 0; };
    }));
    await page.evaluate(() => window.__stopReplay());
    await capture('edit', 3000, () => page.evaluate(() => {
      const g = window.__game, columns = g.solarSystem.activePlanet.columns, tile = g.player.tile;
      columns.mine(tile, columns.topLayerOf(tile)); g.streamer.rebuildTile(tile);
    }));
  } catch (error) { result.failure = String(error); console.log(JSON.stringify({ pipeline, failure: result.failure, errors: result.errors.slice(-3) })); }
  finally { await browser.close(); }
  result.validRendering = result.errorCount === 0 && !result.failure;
  report.cases.push(result);
  await writeFile(resolve(output, 'pipeline-comparison.json'), JSON.stringify(report, null, 2));
}
console.log('Comparison closed both browsers; results: output/meshlet-evaluation/pipeline-comparison.json');
