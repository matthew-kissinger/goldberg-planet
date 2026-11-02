import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5199');
url.search = '?m=48&mode=creative&nosave=1&mute=1&clouds=0&seed=navigation-regression';
const output = new URL('../output/navigation-worlds-v3/', import.meta.url);
await mkdir(output, { recursive: true });
const report = { url: url.href, scope: 'Native browser navigation controls with injected initial movement states and controlled preparation latency; diagnostic SOI drop-state fixture; no saves or performance claim.', checks: [], errors: [], warnings: [] };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] });
let page;
const check = (label, ok, detail) => { report.checks.push({ label, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) throw new Error(label); };
try {
  page = await browser.newPage(); page.setDefaultTimeout(20_000);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); if (message.type() === 'warn') report.warnings.push(message.text()); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120_000 });
  report.bundle = await page.evaluate(() => [...document.scripts].map(script => script.src).find(src => src.includes('/assets/index-')));
  const guide = async tab => {
    if (!await page.evaluate(() => __game.hud.isMenuOpen())) await page.locator('[data-action="guide"]').click();
    await page.locator(`[data-tab="${tab}"]`).click();
  };
  const settled = async id => page.waitForFunction(expected => __game.solarSystem.activePlanet.config.id === expected && !__game.solarSystem.travelState.pending, { timeout: 20_000 }, id);
  const selectPlanet = async id => {
    await guide('planets');
    // Planet UI refreshes every 250ms; wait until the old Here button is enabled.
    await page.waitForSelector(`[data-planet="${id}"]:not(:disabled)`);
    await page.locator(`[data-planet="${id}"]`).click();
  };
  const visit = async id => { await selectPlanet(id); await settled(id); };
  const state = async () => page.evaluate(() => ({ mode: __game.player.mode, speed: Math.hypot(__game.player.vx,__game.player.vy,__game.player.vz), cruise: __game.player.inSpaceCruise, planet: __game.solarSystem.activePlanet.config.id, tile: __game.player.tile }));
  for (const mode of ['plane', 'fly']) {
    await guide('aurelia');
    await page.evaluate(mode => Object.assign(__game.player, { mode, vx: 800, vy: -400, vz: 150, inSpaceCruise: true }), mode);
    await page.locator('[data-site="windseed-downs"]').click();
    await guide('aurelia');
    const arrival = await state();
    check(`Local region Visit clears ${mode} movement`, arrival.mode === 'walk' && arrival.speed < 1 && !arrival.cruise, arrival);
  }
  await page.evaluate(() => Object.assign(__game.player, { mode: 'plane', vx: 900, vy: 500, vz: -300, planeSpeed: 1200, inSpaceCruise: true }));
  await visit('planet-1'); await guide('planets');
  const planetArrival = await state();
  check('Planet Visit arrives walking at rest', planetArrival.mode === 'walk' && planetArrival.speed < 1 && !planetArrival.cruise, planetArrival);
  await visit('planet-0');

  // Hold a requested preparation until the subsequent native UI action is made.
  // This makes cancellation deterministic rather than racing a fast machine.
  const holdPreparation = async id => page.evaluate(id => {
    const system = __game.solarSystem, far = system.bindings.farSphere, terrain = system.planetById.get(id).terrain;
    const originalHas = far.hasPreparedTerrain, originalPrepare = far.prepareTerrain;
    let release; const held = new Promise(resolve => { release = resolve; });
    far.hasPreparedTerrain = function (candidate, ...args) { return candidate === terrain ? false : originalHas.call(this, candidate, ...args); };
    far.prepareTerrain = async function (candidate, ...args) {
      if (candidate === terrain) await held;
      return originalPrepare.call(this, candidate, ...args);
    };
    window.__navigationGate = { release() { far.hasPreparedTerrain = originalHas; far.prepareTerrain = originalPrepare; release(); } };
  }, id);
  await holdPreparation('planet-2');
  await selectPlanet('planet-2');
  await page.waitForFunction(() => __game.solarSystem.travelState.pending);
  await page.evaluate(() => { __navigationGate.oldCompletion = __game.solarSystem.whenTravelSettled(); });
  await guide('aurelia'); await page.locator('[data-site="shore-camp"]').click();
  const canceled = await page.evaluate(async () => { __navigationGate.release(); return await __navigationGate.oldCompletion; });
  await guide('aurelia');
  const homeArrival = await state();
  check('Same-home region Visit cancels outbound preparation', !canceled && homeArrival.planet === 'planet-0' && homeArrival.mode === 'walk' && !await page.evaluate(() => __game.solarSystem.travelState.pending), homeArrival);

  await visit('planet-1');
  await guide('aurelia');
  // The HUD refreshes every 250ms. Await its current-world content just as the
  // native region playtest does, rather than asserting within the prior tick.
  await page.waitForSelector('[data-site="vespera-quiet-basin"]', { timeout: 1000 });
  check('Regions follows the active world', await page.$('[data-site="vespera-quiet-basin"]') !== null && await page.$('[data-site="shore-camp"]') === null);
  await page.locator('[data-site="vespera-glass-rift"]').click();
  await guide('aurelia');
  check('Off-world region Visit remains on that world', (await state()).planet === 'planet-1' && (await state()).mode === 'walk');
  await holdPreparation('planet-0');
  await selectPlanet('planet-0');
  await page.waitForFunction(() => __game.solarSystem.travelState.pending);
  await page.evaluate(() => { __navigationGate.oldCompletion = __game.solarSystem.whenTravelSettled(); });
  await selectPlanet('planet-3');
  const stale = await page.evaluate(async () => { __navigationGate.release(); return await __navigationGate.oldCompletion; });
  await settled('planet-3'); await guide('planets');
  const latestArrival = await state();
  check('Superseded home-world request cannot land later', !stale && latestArrival.planet === 'planet-3' && latestArrival.mode === 'walk', latestArrival);

  const dropEvidence = await page.evaluate(async () => {
    const { solarSystem: system, player, loop } = __game;
    const source = system.activePlanet, target = system.planetById.get('planet-1'), sourceTile = player.tile;
    source.drops = [{ id: 899, item: 'wood', count: 1, tile: sourceTile, offsetA: 0, offsetB: 0, groundRadius: source.config.radius, age: 0 }];
    loop.drops = [{ id: 900, item: 'wood', count: 4, tile: sourceTile, offsetA: 0, offsetB: 0, groundRadius: source.config.radius, age: 0 }];
    // Move into the destination frame's SOI, then exercise the same change
    // listener as a natural crossing without waiting for a flight playthrough.
    player.px = target.config.solarPosition[0] - source.config.solarPosition[0];
    player.py = target.config.solarPosition[1] - source.config.solarPosition[1] + target.config.radius + 100;
    player.pz = target.config.solarPosition[2] - source.config.solarPosition[2];
    system.handoffToPlanet(target.config.id, player); await system.whenTravelSettled();
    const retained = source.drops.map(d => ({ id: d.id, count: d.count }));
    system.warpToPlanet(source.config.id, player, sourceTile, false); await system.whenTravelSettled();
    return { retained, restored: loop.drops.map(d => ({ id: d.id, count: d.count })) };
  });
  check('SOI change preserves the latest replaced drop array on return', JSON.stringify(dropEvidence.retained) === '[{"id":900,"count":4}]' && JSON.stringify(dropEvidence.restored) === '[{"id":900,"count":4}]', dropEvidence);
  if (report.errors.length || report.warnings.length) throw new Error('Browser reported errors or warnings');
} catch (error) {
  process.exitCode = 1; report.failure = String(error);
} finally {
  if (page && !page.isClosed()) await page.evaluate(() => window.__navigationGate?.release()).catch(() => {});
  await browser.close();
  await writeFile(new URL('checks.json', output), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
}
