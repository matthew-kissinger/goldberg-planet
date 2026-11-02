/** Native five-world/region playtest. Timed windows never contain screenshots.
 * Use --no-screenshots for the final timing pass, --gl for backend parity. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5199');
const output = resolve(process.argv[3] ?? 'output/worlds-v3');
const screenshots = !process.argv.includes('--no-screenshots');
const selectedPlanets = process.argv.find(arg => arg.startsWith('--planets='))?.slice(10).split(',') ?? ['planet-1', 'planet-2', 'planet-3', 'planet-4', 'planet-5'];
if (selectedPlanets.some(id => !/^planet-[1-5]$/.test(id))) throw new Error('Unknown planet in --planets');
url.search = '?mode=creative&mute=1&nosave=1&m=192&seed=GP192-01';
if (process.argv.includes('--gl')) url.searchParams.set('gpu', 'gl');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true,
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const report = { url: url.href, startedAt: new Date().toISOString(), screenshots, viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  method: 'Native Worlds and Regions buttons; 2.5s arrivals, 8s Shift+W surface traverses, and 2s W region walks. Active rAF/longtask recording resets per window; screenshots outside recording. Startup separately recorded. Bounded playtest, not GPU timer or sustained performance certification.',
  errors: [], warnings: [], checks: [], stages: [] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (name, ok, detail) => { report.checks.push({ name, ok, detail }); if (!ok) throw new Error(name); };
const write = () => writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
try {
  const page = await browser.newPage(); page.setDefaultTimeout(60_000); await page.setViewport(report.viewport);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warn') report.warnings.push(message.text()); });
  report.browser = await browser.version();
  const system = await browser.target().createCDPSession(); report.gpu = (await system.send('SystemInfo.getInfo')).gpu; await system.detach();
  await page.evaluateOnNewDocument(() => {
    let active = true, start = performance.now(), previous = 0, frames = [], tasks = [];
    const observer = new PerformanceObserver(list => { if (active) for (const e of list.getEntries()) if (e.startTime >= start) tasks.push(e.duration); });
    observer.observe({ type: 'longtask', buffered: true });
    const tick = now => { if (active && previous) frames.push(now - previous); previous = active ? now : 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    const summary = values => { const a = values.toSorted((a, b) => a - b), q = p => a[Math.max(0, Math.ceil(a.length * p) - 1)] ?? 0;
      return { n: a.length, p50: q(.5), p95: q(.95), p99: q(.99), max: q(1), over50: a.filter(n => n > 50).length }; };
    window.__worldCapture = {
      begin() { observer.takeRecords(); start = performance.now(); previous = 0; frames = []; tasks = []; active = true; },
      end() { for (const e of observer.takeRecords()) if (e.startTime >= start) tasks.push(e.duration); active = false;
        const g = window.__game, p = g.player;
        return { frames: summary(frames), longTasks: summary(tasks), position: [p.px, p.py, p.pz], state: JSON.parse(window.render_game_to_text()) }; },
    };
  });
  const boot = performance.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120_000 });
  const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await frames(); report.bootMs = performance.now() - boot;
  report.startup = await page.evaluate(() => window.__worldCapture.end());
  if (screenshots) await page.screenshot({ path: resolve(output, 'aurelia-home.png') });
  report.bundle = await page.evaluate(() => [...document.scripts].map(script => script.src).find(src => src.includes('/assets/index-')));
  const guide = async tab => { if (!await page.evaluate(() => __game.hud.isMenuOpen())) await page.locator('[data-action="guide"]').click(); await page.locator(`[data-tab="${tab}"]`).click(); };
  const finish = async (planet, site, phase) => {
    const capture = await page.evaluate(() => __worldCapture.end());
    report.stages.push({ planet, site, phase, ...capture });
    console.log(JSON.stringify({ planet, site, phase, frames: capture.frames, vegetation: capture.state.habitat, draws: capture.state.performance.drawCalls }));
    await write(); return capture;
  };
  for (const planet of selectedPlanets) {
    await guide('planets');
    await page.waitForSelector(`[data-planet="${planet}"]:not(:disabled)`);
    await frames(); await page.evaluate(() => __worldCapture.begin());
    await page.locator(`[data-planet="${planet}"]`).click();
    await page.waitForFunction(id => __game.solarSystem.activePlanet.config.id === id && !__game.solarSystem.travelState.pending, {}, planet);
    await pause(2500);
    await page.waitForFunction(() => !__game.habitat.stats().pending);
    const arrival = await finish(planet, 'default', 'planet-arrival');
    check(`${planet}: safe walking arrival on rebuilt recipe`, arrival.state.recipe === 'worlds-v3' && arrival.state.mode === 'walk' && arrival.state.altitudeAGL >= -.1 && arrival.state.altitudeAGL < 1.5, arrival.state.altitudeAGL);
    check(`${planet}: resident vegetation active within fixed budgets`, arrival.state.habitat.active && arrival.state.habitat.trees <= 320 && arrival.state.habitat.plants <= 600, arrival.state.habitat);
    await frames(); await page.evaluate(() => __worldCapture.begin());
    await page.keyboard.down('Shift'); await page.keyboard.down('w'); await pause(8000);
    await page.keyboard.up('w'); await page.keyboard.up('Shift');
    const traverse = await finish(planet, 'default', 'surface-traverse');
    const traversed = Math.hypot(...traverse.position.map((n, i) => n - arrival.position[i]));
    check(`${planet}: traverse out of the landing clearing`, traversed > 25 && traverse.state.mode === 'walk' && traverse.state.altitudeAGL >= -.1, { metres: traversed, altitudeAGL: traverse.state.altitudeAGL });
    if (screenshots) await page.screenshot({ path: resolve(output, `${planet}-traverse.png`) });
    const sites = await page.evaluate(() => __game.sites.map(({ id, name, biome }) => ({ id, name, biome })));
    check(`${planet}: three named regions`, sites.length === 3, sites);
    for (const site of sites) {
      await guide('aurelia');
      check(`${planet}/${site.id}: current world Regions button exists`, await page.locator(`[data-site="${site.id}"]`).wait() !== null);
      await frames(); await page.evaluate(() => __worldCapture.begin());
      await page.locator(`[data-site="${site.id}"]`).click(); await pause(2500);
      await page.waitForFunction(() => !__game.habitat.stats().pending);
      const initial = await finish(planet, site.id, 'region-arrival');
      if (screenshots) await page.screenshot({ path: resolve(output, `${site.id}.png`) });
      await frames(); await page.evaluate(() => __worldCapture.begin());
      await page.keyboard.down('w'); await pause(2000); await page.keyboard.up('w');
      const walked = await finish(planet, site.id, 'walk');
      const distance = Math.hypot(...walked.position.map((n, i) => n - initial.position[i]));
      check(`${planet}/${site.id}: walk away from landing clearing`, distance > 2 && walked.state.mode === 'walk' && walked.state.altitudeAGL > -.1, { distance, altitudeAGL: walked.state.altitudeAGL });
      check(`${planet}/${site.id}: region discovery recorded`, walked.state.journal.includes(site.id), walked.state.journal);
      if (screenshots) await page.screenshot({ path: resolve(output, `${site.id}-walk.png`) });
      check(`${planet}/${site.id}: clean renderer`, !report.errors.length && !report.warnings.length, { errors: report.errors, warnings: report.warnings });
    }
    if (screenshots) {
      // Review the natural daylight landing from coast height and orbit. These
      // camera/capture operations stay outside the measured arrival/walk windows.
      await guide('aurelia'); await page.locator(`[data-site="${sites[0].id}"]`).click(); await pause(1000);
      const zoomToward = async (target, outward) => {
        for (let attempt = 0; attempt < 22; attempt++) {
          const distance = await page.evaluate(() => __game.rig.dist);
          if (outward ? distance > target : distance < target) return;
          await page.mouse.wheel({ deltaY: outward ? 250 : -250 }); await pause(100);
        }
        throw new Error(`Camera did not reach ${target}m`);
      };
      await page.mouse.move(950, 450); await zoomToward(110, true);
      await page.waitForFunction(() => __game.rig.dist > 95); await pause(500);
      await page.screenshot({ path: resolve(output, `${planet}-landscape.png`) });
      await zoomToward(3300, true);
      await page.waitForFunction(() => __game.rig.dist > 3000); await pause(500);
      const orbital = await page.evaluate(() => ({ detailed: __game.streamer.detailedRendering,
        drawn: __game.streamer.renderedKeys().size, farTriangles: __game.solarSystem.bindings.farSphere.mesh.geometry.drawRange.count / 3,
        expected: __game.solarSystem.bindings.farSphere.triangles }));
      check(`${planet}: complete orbital surface without detailed overlap`, !orbital.detailed && orbital.drawn === 0 && orbital.farTriangles === orbital.expected, orbital);
      await page.screenshot({ path: resolve(output, `${planet}-orbit.png`) });
      await zoomToward(6, false);
      await page.waitForFunction(() => __game.rig.dist < 7 && __game.streamer.detailedRendering);
    }
  }
  check('No local save writes in isolated playtest', await page.evaluate(() => localStorage.length === 0));
  report.passed = true;
} catch (error) { report.failure = String(error); report.passed = false; process.exitCode = 1; }
finally { await browser.close(); report.completedAt = new Date().toISOString(); await write(); }
console.log(JSON.stringify({ output, passed: report.passed, checks: report.checks.length, errors: report.errors, warnings: report.warnings, failure: report.failure }));
