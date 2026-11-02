/** Labelled GL layer isolation at the native landscape zoom; not a timing test. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] ?? 'output/lava-horizon-isolation');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const report = { method: 'Native travel and landscape zoom. Camera/render loop then frozen; each diagnostic toggle restores the original scene before applying.', errors: [], warnings: [], stages: [] };
const pause = ms => new Promise(r => setTimeout(r, ms));
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => report.errors.push(String(e))); page.on('console', m => { if (m.type() === 'warn') report.warnings.push(m.text()); if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5199/?mode=creative&mute=1&nosave=1&m=192&seed=GP192-01&gpu=gl');
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120000 });
  report.bundle = await page.evaluate(() => [...document.scripts].map(s => s.src).find(s => s.includes('/assets/index-')));
  await page.locator('[data-action="guide"]').click(); await page.locator('[data-tab="planets"]').click(); await page.locator('[data-planet="planet-4"]').click();
  await page.waitForFunction(() => __game.solarSystem.activePlanet.config.id === 'planet-4' && !__game.solarSystem.travelState.pending);
  // The all-world review returns to first person between planets.
  await page.evaluate(() => { const r = __game.rig; r.zoomExp = r.zoomExpTarget = 0; }); await pause(1000);
  await page.mouse.move(950, 450);
  for (let i = 0; i < 22; i++) {
    if (await page.evaluate(() => __game.rig.dist > 110)) break;
    await page.mouse.wheel({ deltaY: 250 }); await pause(100);
  }
  await pause(500);
  await page.evaluate(() => {
    const g = __game, b = g.solarSystem.bindings;
    g.renderer.setAnimationLoop(null);
    window.__horizon = { ocean: b.ocean, far: b.farSphere.mesh, sky: b.sky, camera: g.rig.camera,
      visibility: g.scene.children.map(o => [o, o.visible]), material: b.ocean.material };
  });
  for (const stage of ['all', 'no-clouds', 'no-atmosphere', 'no-sky', 'no-far', 'ocean-depth-write', 'plain-ocean', 'only-ocean']) {
    const data = await page.evaluate(stage => {
      const g = __game, d = __horizon;
      d.visibility.forEach(([o, visible]) => o.visible = visible);
      d.ocean.material = d.material; d.material.depthWrite = false;
      if (stage === 'no-clouds' || stage === 'no-sky') d.sky.clouds.visible = false;
      if (stage === 'no-atmosphere' || stage === 'no-sky') d.sky.atmo.visible = false;
      if (stage === 'no-far') d.far.visible = false;
      if (stage === 'ocean-depth-write') d.material.depthWrite = true;
      if (stage === 'plain-ocean') d.ocean.material = new d.material.constructor({ color: 0xb76b44, roughness: 1, transparent: true, depthWrite: false });
      if (stage === 'only-ocean') g.scene.children.forEach(o => o.visible = o === d.ocean || !!o.isLight);
      // Match the late-route cloud phase without waiting two minutes. This is
      // a diagnostic clock override, never a frame/performance measurement.
      g.renderer._nodes.nodeFrame.time = 120;
      g.renderer._nodes.nodeFrame.lastTime = performance.now();
      g.renderer.render(g.scene, d.camera);
      return { stage, renderer: JSON.parse(render_game_to_text()).renderer, distance: g.rig.dist, origin: g.rig.world, player: [g.player.px, g.player.py, g.player.pz] };
    }, stage);
    await pause(100); await page.screenshot({ path: resolve(output, `${stage}.png`) }); report.stages.push(data);
  }
} finally { await browser.close(); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, errors: report.errors, warnings: report.warnings, closed: true }));
