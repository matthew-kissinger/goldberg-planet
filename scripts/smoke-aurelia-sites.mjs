/** Six-site production scene review. Disposable browser, no save writes.
 * Short captures identify regressions; they do not qualify sustained frame gates. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:5199', output = resolve(process.argv[3]?.startsWith('--') ? 'output/aurelia-sites' : process.argv[3] ?? 'output/aurelia-sites');
const screenshots = !process.argv.includes('--no-screenshots');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const report = { origin, seed: 'journal-ui-smoke', m: 192, screenshots, measurement: 'Explicit active windows; rAF baseline reset per stage; capture stopped before screenshots; two unmeasured rAFs between stages.', viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, errors: [], warnings: [], stages: [] };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const page = await browser.newPage(); await page.setViewport(report.viewport);
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); if (m.type() === 'warn') report.warnings.push(m.text()); });
  report.browser = await browser.version();
  report.gpu = (await (await browser.target().createCDPSession()).send('SystemInfo.getInfo')).gpu;
  await page.evaluateOnNewDocument(() => {
    window.__siteSamples = { frames: [], longTasks: [], habitatMs: [], renderMs: [] };
    window.__siteCaptureActive = true; window.__siteStageStart = performance.now();
    let previous = 0;
    window.__beginSiteSamples = () => {
      window.__siteSamples = { frames: [], longTasks: [], habitatMs: [], renderMs: [] };
      previous = 0; window.__siteStageStart = performance.now(); window.__siteCaptureActive = true;
    };
    new PerformanceObserver(list => { for (const item of list.getEntries()) {
      if (window.__siteCaptureActive && item.startTime >= window.__siteStageStart) window.__siteSamples.longTasks.push(item.duration);
    } }).observe({ type: 'longtask', buffered: true });
    const frame = now => {
      if (window.__siteCaptureActive) { if (previous) window.__siteSamples.frames.push(now - previous); previous = now; }
      else previous = 0;
      requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
    let game;
    Object.defineProperty(window, '__game', { configurable: true, get: () => game, set: value => {
      game = value;
      const update = game.habitat.update, render = game.renderer.render;
      game.habitat.update = function(...args) { const t = performance.now(); try { return update.apply(this, args); } finally { if (window.__siteCaptureActive) window.__siteSamples.habitatMs.push(performance.now() - t); } };
      game.renderer.render = function(...args) { const t = performance.now(); try { return render.apply(this, args); } finally { if (window.__siteCaptureActive) window.__siteSamples.renderMs.push(performance.now() - t); } };
    } });
  });
  const boot = performance.now();
  await page.goto(`${origin}/?m=192&nosave=1&mute=1&mode=creative&seed=${report.seed}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120000 });
  const baseline = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await baseline(); // The first displayed frames remain part of cold startup.
  report.bootMs = performance.now() - boot;
  report.bundle = await page.evaluate(() => [...document.scripts].map(script => script.src).find(src => src.includes('/assets/index-')));
  const sites = await page.evaluate(() => window.__game.sites.map(({ id, name, biome }) => ({ id, name, biome })));
  const capture = async (site, phase) => {
    const state = await page.evaluate(() => {
      window.__siteCaptureActive = false;
      const summary = a => { const sorted = [...a].sort((a, b) => a - b), q = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null; return { n: sorted.length, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: sorted.filter(v => v > 50).length }; };
      return { samples: Object.fromEntries(Object.entries(window.__siteSamples).map(([name, samples]) => [name, summary(samples)])), state: JSON.parse(window.render_game_to_text()) };
    });
    report.stages.push({ ...site, phase, ...state });
    console.log(JSON.stringify({ site: site.id, phase, frames: state.samples.frames, habitat: state.state.habitat, draws: state.state.performance.drawCalls, triangles: state.state.performance.triangles, errors: report.errors.length }));
    await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  };
  await capture(sites[0], 'boot');
  if (report.errors.length) throw new Error('Startup emitted renderer errors');
  for (const site of sites) {
    await baseline();
    await page.evaluate(id => { window.__beginSiteSamples(); window.__game.hud.onSiteSelect(id); }, site.id);
    await wait(2500);
    await page.waitForFunction(() => !window.__game.habitat.stats().pending, { timeout: 10000 });
    await capture(site, 'arrival');
    if (screenshots) await page.screenshot({ path: resolve(output, `${site.id}.png`) });
    await baseline();
    await page.evaluate(() => window.__beginSiteSamples());
    await page.keyboard.down('w'); await wait(2000); await page.keyboard.up('w');
    await capture(site, 'walk');
    if (screenshots) await page.screenshot({ path: resolve(output, `${site.id}-walk.png`) });
    if (report.errors.length) throw new Error('Renderer validation failed');
  }
  report.passed = report.errors.length === 0 && report.warnings.length === 0;
} catch (error) { report.failure = String(error); report.passed = false; process.exitCode = 1; }
finally { await browser.close(); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, passed: report.passed, errors: report.errors, warnings: report.warnings, failure: report.failure }));
