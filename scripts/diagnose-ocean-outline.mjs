/** Diagnostic isolation only: frozen camera/scene and labelled layer visibility toggles. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const output = resolve(process.argv[2] ?? 'output/ocean-outline-isolation');
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const report = { method: 'Native travel; diagnostic fixed260m camera and frozen render loop; layer toggles, no performance claims.', errors: [], warnings: [], stages: [] };
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', e => report.errors.push(String(e))); page.on('console', m => { if (m.type() === 'warn') report.warnings.push(m.text()); if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('http://127.0.0.1:5199/?mode=creative&mute=1&nosave=1&m=192&seed=GP192-01');
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120000 });
  report.bundle = await page.evaluate(() => [...document.scripts].map(s => s.src).find(s => s.includes('/assets/index-')));
  await page.locator('[data-action="guide"]').click(); await page.locator('[data-tab="planets"]').click(); await page.locator('[data-planet="planet-4"]').click();
  await page.waitForFunction(() => __game.solarSystem.activePlanet.config.id === 'planet-4' && !__game.solarSystem.travelState.pending);
  await page.evaluate(() => { const r = __game.rig; r.zoomExp = r.zoomExpTarget = Math.log(260 / 2.4) / Math.log(4200 / 2.4); });
  await new Promise(r => setTimeout(r, 2200));
  await page.evaluate(() => { const g = __game; g.renderer.setAnimationLoop(null); window.__outline = { ocean: g.solarSystem.bindings.ocean, far: g.solarSystem.bindings.farSphere.mesh,
    fine: [...g.streamer.resident.values()].map(r => r.mesh).filter(Boolean), camera: g.rig.camera };
    window.__outline.originalPositionNode = __outline.ocean.material.positionNode;
  });
  for (const stage of ['all', 'only-ocean', 'plain-ocean']) {
    const data = await page.evaluate(async stage => {
      const g = __game, d = __outline;
      d.far.visible = stage !== 'no-far'; d.fine.forEach(m => m.visible = stage !== 'no-fine');
      d.ocean.visible = stage !== 'no-ocean';
      g.solarSystem.bindings.sky.atmo.visible = stage !== 'no-sky';
      if (g.solarSystem.bindings.sky.clouds) g.solarSystem.bindings.sky.clouds.visible = stage !== 'no-sky';
      const position = stage === 'no-wave' ? null : d.originalPositionNode;
      if (d.ocean.material.positionNode !== position) { d.ocean.material.positionNode = position; d.ocean.material.needsUpdate = true; }
      if (stage !== 'all') g.scene.children.forEach(o => o.visible = o === d.ocean || !!o.isLight);
      if (stage === 'plain-ocean') d.ocean.material = new d.ocean.material.constructor({ color: 0xb76b44, roughness: 1 });
      g.renderer.render(g.scene, d.camera);
      return { stage, dist: g.rig.dist, origin: g.rig.world, player: [g.player.px, g.player.py, g.player.pz] };
    }, stage);
    await new Promise(r => setTimeout(r, 150));
    await page.screenshot({ path: resolve(output, `${stage}.png`) }); report.stages.push(data);
  }
  if (process.argv.includes('--review-orbit')) {
    await page.reload();
    await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120000 });
    await page.screenshot({ path: resolve(output, 'aurelia-ground.png') });
    await page.locator('[data-action="guide"]').click(); await page.locator('[data-tab="planets"]').click(); await page.locator('[data-planet="planet-2"]').click();
    await page.waitForFunction(() => __game.solarSystem.activePlanet.config.id === 'planet-2' && !__game.solarSystem.travelState.pending);
    await page.evaluate(() => { const r = __game.rig; r.zoomExp = r.zoomExpTarget = Math.log(3500 / 2.4) / Math.log(4200 / 2.4); });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: resolve(output, 'khoros-orbit.png') });
  }
} finally { await browser.close(); await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ output, errors: report.errors, warnings: report.warnings, closed: true }));
