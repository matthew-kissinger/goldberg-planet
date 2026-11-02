import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Native browser controls with disposable localStorage. Fixture supplies avoid
// spending the smoke test gathering; station placement/crafting use actual UI.
const origin = process.argv[2] ?? 'http://127.0.0.1:5199';
const out = new URL('../output/expedition-ui-worlds-v3/', import.meta.url);
await fs.mkdir(out, { recursive: true });
const checks = [], errors = [], warnings = [], bundles = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (label, ok, detail) => {
  checks.push({ label, ok, detail });
  if (!ok) throw new Error(`${label}: ${JSON.stringify(detail)}`);
};
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-first-run'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warn') warnings.push(message.text());
  });
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const url = new URL(origin);
  url.search = '?m=192&mute=1&clouds=0&mode=survival&seed=expedition-ui-smoke';
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const ready = async mode => {
    await page.waitForFunction(expected => window.__game?.gameMode === expected && !document.getElementById('splash'), { timeout: 120_000 }, mode);
    bundles.push({ mode, bundle: await page.evaluate(() => [...document.scripts].map(script => script.src).find(src => src.includes('/assets/index-'))) });
    await wait(350);
  };
  const guide = async tab => {
    if (!await page.evaluate(() => __game.hud.isMenuOpen())) await page.click('[data-action="guide"]');
    await page.click(`[data-tab="${tab}"]`);
  };
  const satchel = async tab => {
    if (!await page.evaluate(() => document.body.classList.contains('crafting-open'))) {
      if (await page.evaluate(() => __game.hud.isMenuOpen())) await page.click('[data-action="close-menu"]');
      await page.click('[data-action="satchel"]');
    }
    await page.click(`[data-craft-tab="${tab}"]`);
  };
  const place = async kind => {
    await satchel('camp');
    const before = await page.evaluate(() => __game.structureStore.byId.size);
    await page.click(`[data-structure="${kind}"]`);
    check(`${kind}: plan selection does not place`, await page.evaluate(n => __game.structureStore.byId.size === n, before));
    await page.waitForSelector('#build-strip.show', { visible: true });
    await page.focus('#build-strip'); await page.keyboard.press('Enter');
    await page.waitForFunction(n => __game.structureStore.byId.size === n + 1, {}, before);
    // Stand on the actual station tile to make the distance requirement stable.
    await page.evaluate(kind => {
      const station = [...__game.structureStore.byId.values()].find(s => s.kind === kind);
      __game.player.spawnAt(station.anchorTile);
    }, kind);
    await wait(100);
  };
  const make = async id => {
    await satchel('make');
    await page.waitForFunction(id => !document.querySelector(`[data-recipe="${id}"]`)?.disabled, {}, id);
    await page.focus(`[data-recipe="${id}"]`); await page.keyboard.press('Enter');
  };
  await ready('survival');
  check('Survival begins without supplied equipment', await page.evaluate(() => !__game.player.hasOrbitalThruster && !__game.loop.planeCrafted));
  await guide('notes');
  check('Field notes explain exact campfire and reachable Starfarer costs', await page.$eval('#game-menu', e => /3 Wood \+ 2 Stone/.test(e.textContent) && /8 Wood \+ 4 Stone \+ 2 Iron Ingots/.test(e.textContent)));
  await page.click('[data-tab="planets"]');
  await page.screenshot({ path: fileURLToPath(new URL('worlds-desktop.png', out)) });
  const firstPlanet = await page.evaluate(() => __game.solarSystem.activePlanet.config.id);
  await page.click('#planet-bar [data-planet]:not(:disabled)');
  await wait(200);
  check('Survival world selection sets course without teleport', await page.evaluate(id => __game.solarSystem.activePlanet.config.id === id && !__game.solarSystem.travelState.pending, firstPlanet));
  await guide('aurelia');
  check('Aurelia lists all six regions', await page.$$eval('[data-site]', elements => elements.length === 6));
  const beforeSite = await page.evaluate(() => [__game.player.px, __game.player.py, __game.player.pz]);
  await page.click('[data-site="rainbough-basin"]');
  await page.waitForFunction(() => /Rainbough/i.test(document.querySelector('#objective-card').textContent));
  const siteRoute = await page.evaluate(before => ({ moved: Math.hypot(__game.player.px - before[0], __game.player.py - before[1], __game.player.pz - before[2]), title: document.querySelector('#objective-card').textContent }), beforeSite);
  check('Survival region selection adds route without teleport', siteRoute.moved < 1 && /Rainbough/i.test(siteRoute.title), siteRoute);
  await page.evaluate(() => Object.assign(__game.loop.inventory, { wood: 80, stone: 50, raw_meat: 2, iron_ore: 2, fiber: 3 }));
  await satchel('make');
  check('Raw meat cannot cook without a placed Campfire', await page.$eval('[data-recipe="roast_meat"]', e => e.disabled));
  await place('campfire');
  await make('roast_meat');
  check('Placed Campfire enables cooking and spends ingredients', await page.evaluate(() => __game.loop.inventory.cooked_meat === 1 && __game.loop.inventory.raw_meat === 1 && __game.loop.inventory.wood === 76));
  await place('furnace');
  await make('smelt_iron'); await make('smelt_iron');
  check('Actual Furnace smelts the two ingots', await page.evaluate(() => __game.loop.inventory.iron_ingot === 2));
  await place('workbench'); await make('orbital_thruster');
  check('Actual Workbench completes Starfarer before skiff', await page.evaluate(() => __game.player.hasOrbitalThruster && __game.loop.planeCrafted && !__game.loop.inventory.planeFrame && !__game.loop.inventory.iron_ingot));
  await page.waitForFunction(() => document.querySelector('#hotbar').textContent.includes('Starfarer'));
  check('Packed vehicle names the crafted Starfarer', !await page.$eval('#hotbar', e => e.textContent.includes('Skiff')));
  await page.click('[data-action="close-craft"]');
  await page.keyboard.press('e'); await wait(100);
  check('Directly crafted Starfarer boards without a skiff purchase', await page.evaluate(() => __game.player.mode === 'plane'));
  await page.keyboard.press('e');
  await guide('aurelia');
  const animalId = await page.evaluate(() => {
    const population = __game.wildlife.population;
    const resident = population.residents.find(c => c.species === 'mantleback' && c.hp > 0);
    const p = __game.player;
    p.px = resident.position.x + resident.forward.x * 5;
    p.py = resident.position.y + resident.forward.y * 5;
    p.pz = resident.position.z + resident.forward.z * 5;
    p.vx = p.vy = p.vz = 0;
    population.update(0, p, true);
    return __game.wildlife.nearbyObservation(p).id;
  });
  await page.waitForSelector('[data-action="observe"]:not(:disabled)');
  await page.click('[data-action="observe"]');
  check('Observe records nearby wildlife through native UI', await page.evaluate(id => __game.wildlife.exportState().residents.find(c => c.id === id).observed, animalId));
  await page.waitForSelector('[data-action="feed"]:not(:disabled)');
  await page.click('[data-action="feed"]');
  check('Feed consumes Survival fiber and builds familiarity', await page.evaluate(id => {
    const animal = __game.wildlife.exportState().residents.find(c => c.id === id);
    return animal.feedCount === 1 && animal.familiarity === .35 && __game.loop.inventory.fiber === 2;
  }, animalId));
  await page.waitForFunction(() => document.querySelector('[data-action="feed"]')?.disabled);
  check('Feed cooldown disables repeated offering', true);
  await guide('explorer');
  for (const [key, value] of [['outfit','reed'], ['hair','braid'], ['headgear','hood'], ['pack','satchel'], ['skin','deep'], ['hairColor','silver']]) {
    await page.click(`[data-appearance-key="${key}"][data-appearance-value="${value}"]`);
  }
  await page.focus('#explorer-stature'); await page.keyboard.press('ArrowRight');
  check('Explorer native controls apply and keep range focus', await page.evaluate(() => {
    const a = __game.character.getAppearance();
    return a.outfit === 'reed' && a.hair === 'braid' && a.headgear === 'hood' && a.pack === 'satchel' && a.skin === 'deep' && a.hairColor === 'silver' && a.stature === 1.01 && document.activeElement.id === 'explorer-stature';
  }));
  await page.screenshot({ path: fileURLToPath(new URL('explorer-desktop.png', out)) });
  const survival = await page.evaluate(() => ({ inventory: { ...__game.loop.inventory }, structures: __game.structureStore.byId.size, appearance: __game.character.getAppearance() }));
  await page.evaluate(() => Object.assign(__game.player, { health: 47, hunger: 29, suitShield: 17 }));
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60_000 }), page.click('[data-game-mode="creative"]')]);
  await ready('creative');
  check('Mode switch opens separately supplied Creative world', await page.evaluate(() => __game.loop.creative && __game.player.hasOrbitalThruster && __game.player.suitTier === 3 && __game.loop.inventory.wood === 999 && __game.structureStore.byId.size === 0 && __game.character.getAppearance().outfit === 'field'));
  const creativeStock = await page.evaluate(() => ({ ...__game.loop.inventory }));
  await place('campfire'); await make('roast_meat');
  check('Creative builds and crafts without spending supplies', await page.evaluate(stock => JSON.stringify(__game.loop.inventory) === JSON.stringify(stock), creativeStock));
  await page.click('[data-action="close-craft"]'); await guide('aurelia');
  await page.click('[data-site="reedwater-reach"]'); await wait(350);
  check('Creative region Visit reaches wetland landmark', await page.evaluate(() => {
    const site = __game.sites.find(s => s.id === 'reedwater-reach'), up = __game.player.up();
    return up[0]*site.direction[0]+up[1]*site.direction[1]+up[2]*site.direction[2] > .9999;
  }));
  await guide('planets'); await page.click('#planet-bar [data-planet]:not(:disabled)');
  await page.waitForFunction(id => __game.solarSystem.activePlanet.config.id !== id && !__game.solarSystem.travelState.pending, { timeout: 120_000 }, firstPlanet);
  check('Creative world Visit travels freely', true);
  await guide('explorer');
  await page.click('[data-appearance-key="outfit"][data-appearance-value="night"]');
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.waitForFunction(() => window.__game && !document.getElementById('splash'), { timeout: 120_000 });
  await guide('explorer');
  const portrait = await page.$eval('#game-menu .journal-card', e => { const r=e.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}; });
  check('Explorer portrait panel fits viewport', portrait.left >= 0 && portrait.top >= 0 && portrait.right <= portrait.width && portrait.bottom <= portrait.height, portrait);
  await page.tap('[data-appearance-key="hair"][data-appearance-value="short"]');
  check('Touch appearance control applies', await page.evaluate(() => __game.character.getAppearance().hair === 'short'));
  await page.screenshot({ path: fileURLToPath(new URL('explorer-portrait.png', out)) });
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60_000 }), page.click('[data-game-mode="survival"]')]);
  await ready('survival');
  const restored = await page.evaluate(() => ({ inventory: { ...__game.loop.inventory }, structures: __game.structureStore.byId.size, appearance: __game.character.getAppearance() }));
  check('Returning to Survival restores its inventory, camp and appearance', JSON.stringify(restored) === JSON.stringify(survival), { expected: survival, actual: restored });
  // Allow the normal camp regeneration during the ready hold; a reset to full
  // vitals still fails each bounded range.
  const restoredVitals=await page.evaluate(()=>({health:__game.player.health,hunger:__game.player.hunger,shield:__game.player.suitShield}));
  check('Mode reload preserves Survival health, hunger and suit charge', restoredVitals.health>=47&&restoredVitals.health<55&&Math.abs(restoredVitals.hunger-29)<1&&restoredVitals.shield>=17&&restoredVitals.shield<35,restoredVitals);
  check('Survival animal observation and relationship survive mode switch', await page.evaluate(id => {
    const animal = __game.wildlife.exportState().residents.find(c => c.id === id);
    return animal.observed && animal.feedCount === 1 && animal.familiarity === .35 && animal.feedCooldown > 0;
  }, animalId));
  const slots = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('expedition-ui-smoke')).map(key => ({ key, mode: JSON.parse(localStorage[key]).mode })));
  check('Survival and Creative persist into separate localStorage slots', slots.some(s => s.mode === 'survival' && s.key.endsWith(':survival')) && slots.some(s => s.mode === 'creative' && s.key.endsWith(':creative')), slots);
  check('No browser errors or warnings', errors.length === 0 && warnings.length === 0, { errors, warnings });
} catch (error) {
  process.exitCode = 1; checks.push({ label: 'run completed', ok: false, error: String(error), stack: error.stack });
} finally {
  await browser.close();
  const result = { scope: 'Native UI smoke with fixture materials and station-distance positioning; fresh disposable browser profile, no existing user saves, not a performance measurement.', origin, bundles, checks, errors, warnings };
  await fs.writeFile(new URL('checks.json', out), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
}
