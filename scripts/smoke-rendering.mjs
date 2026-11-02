// Verify the same production scene on WebGPU and the WebGL fallback.
// Disposable no-save browser; screenshots are for manual surface inspection.
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:5199';
const folder = resolve('output/rendering-smoke');
await mkdir(folder, { recursive: true });
const results = [];
for (const backend of ['gpu', 'gl']) {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  const errors = [], warnings = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(m.text());
      if (m.type() === 'warn') warnings.push(m.text());
    });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.goto(`${origin}/?m=192&nosave=1&mute=1&clouds=0&seed=journal-ui-smoke${backend === 'gl' ? '&gpu=gl' : ''}`);
    await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120000 });
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).performance.drawCalls > 0);
    const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
    const counters = state.performance;
    if (!(counters.triangles > 0 && counters.geometries > 0)) throw new Error('Invalid completed-frame renderer counters');
    await page.screenshot({ path: resolve(folder, `${backend}-world.png`) });
    const scales = [];
    await page.mouse.move(900, 450);
    for (const [name, delta, minimum] of [['coast', 900, 95], ['high', 700, 1050], ['orbit', 500, 4000]]) {
      await page.mouse.wheel({ deltaY: delta });
      await page.waitForFunction(distance => window.__game.rig.dist > distance, {}, minimum);
      await new Promise(resolve => setTimeout(resolve, 350));
      await page.screenshot({ path: resolve(folder, `${backend}-${name}.png`) });
      scales.push(await page.evaluate(name => ({ name, cameraDistance: window.__game.rig.dist,
        farTriangles: window.__game.solarSystem.bindings.farSphere.mesh.geometry.drawRange.count / 3,
        detailedRendering: window.__game.streamer.detailedRendering,
        residentChunks: window.__game.streamer.residentKeys().size,
        renderedChunks: window.__game.streamer.renderedKeys().size,
        draws: JSON.parse(window.render_game_to_text()).performance.drawCalls }), name));
    }
    const orbital = scales.at(-1);
    if (orbital.detailedRendering || orbital.renderedChunks !== 0 || orbital.residentChunks === 0) {
      throw new Error('Orbital camera must hide details while retaining gameplay residency');
    }
    if (orbital.farTriangles !== await page.evaluate(() => window.__game.solarSystem.bindings.farSphere.triangles)) {
      throw new Error('Orbital surface coverage is incomplete');
    }
    await page.mouse.wheel({ deltaY: -1990 });
    await page.waitForFunction(() => window.__game.rig.dist < 6);
    if (!await page.evaluate(() => window.__game.streamer.detailedRendering && window.__game.streamer.renderedKeys().size > 0)) {
      throw new Error('Returning to ground view did not restore detailed terrain');
    }
    await page.click('[data-action="guide"]');
    await page.click('[data-tab="planets"]');
    await page.screenshot({ path: resolve(folder, `${backend}-atlas.png`) });
    if (errors.length || warnings.length) throw new Error('Renderer emitted errors or warnings');
    results.push({ backend, passed: true, counters: { drawCalls: counters.drawCalls, triangles: counters.triangles, geometries: counters.geometries }, scales, errors, warnings });
  } catch (error) {
    process.exitCode = 1;
    results.push({ backend, passed: false, error: String(error), errors, warnings });
  } finally {
    await browser.close();
  }
}
await writeFile(resolve(folder, 'results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
