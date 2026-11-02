/** Exact regression for the resident/territory that exposed a28cm foot drag.
 * Diagnostic close camera, relocation and explicit flee transition; not timing evidence. */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const origin = process.argv[2] ?? 'http://127.0.0.1:5199';
const folder = resolve(`output/fauna-reversal-${process.argv[3] ?? 'corrected'}`);
await mkdir(folder, { recursive: true });
const wait = ms => new Promise(done => setTimeout(done, ms));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] });
const errors = [], warnings = [], checks = []; let page, recorder, report;
try {
  page = await browser.newPage(); await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warn') warnings.push(message.text()); });
  await page.goto(`${origin}/?m=192&nosave=1&mute=1&clouds=0&seed=journal-ui-smoke`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.character.rig && !document.getElementById('splash'), { timeout: 120000 });
  await page.evaluate(() => {
    const g = window.__game, fauna = g.wildlife, p = g.player;
    const id = 'cairnback-ridge:duskprowler:0', c = fauna.population.residents.find(c => c.id === id);
    if (!c) throw new Error(`Missing exact regression resident ${id}`);
    const target = c.position.clone().addScaledVector(c.forward, 9), tile = g.geo.tileOf(target.x, target.y, target.z);
    p.spawnAt(tile); p.mode = 'walk'; p.vx = p.vy = p.vz = 0; g.rig.snapTo(p); g.footIk.reset();
    const probe = window.__faunaReversal = { id, stage: 'stalk', samples: [], reviewFill: false };
    const update = fauna.update, previous = c.forward.clone();
    fauna.update = function(...args) {
      previous.copy(c.forward); const damage = update.apply(this, args);
      probe.samples.push({ t: performance.now(), dt: args[0], stage: probe.stage, behavior: c.behavior,
        headingChange: previous.angleTo(c.forward), speed: c.speed, turnRate: c.turnRate, phase: c.phase,
        position: c.position.toArray(), forward: c.forward.toArray(), contacts: this.contacts().filter(f => f.id === id) });
      return damage;
    };
    const render = g.renderer.render, ambient = g.scene.children.find(node => node.isAmbientLight);
    g.renderer.render = function(scene, camera) {
      const oldPosition = camera.position.clone(), oldQuaternion = camera.quaternion.clone(), oldUp = camera.up.clone(), oldFill = ambient.intensity;
      const target = c.position.clone().sub(c.position.clone().set(g.rig.world.x, g.rig.world.y, g.rig.world.z));
      const radial = c.position.clone().normalize(), ahead = c.forward.clone(), side = radial.clone().cross(ahead).normalize();
      camera.position.copy(target).addScaledVector(side, 3.2).addScaledVector(radial, 1.5).addScaledVector(ahead, 2.1);
      camera.up.copy(radial); camera.lookAt(target.addScaledVector(radial, .72)); camera.updateMatrixWorld(true);
      // Existing ambient light only; no extra shader/light variant is created.
      if (probe.reviewFill) ambient.intensity = .85;
      try { return render.call(this, scene, camera); }
      finally { ambient.intensity = oldFill; camera.position.copy(oldPosition); camera.quaternion.copy(oldQuaternion); camera.up.copy(oldUp); camera.updateMatrixWorld(true); }
    };
  });
  await wait(1700); await page.screenshot({ path: resolve(folder, 'ridge-original-light.png') });
  await page.evaluate(() => window.__faunaReversal.reviewFill = true);
  await wait(250); await page.screenshot({ path: resolve(folder, 'ridge-stalk-review-fill.png') });
  try { recorder = await page.screencast({ path: resolve(folder, 'ridge-reversal.webm'), fps: 24, quality: 32, ffmpegPath: process.env.FFMPEG_PATH ?? 'ffmpeg' }); } catch(error) { warnings.push(String(error)); }
  await wait(400);
  await page.evaluate(() => {
    const probe = window.__faunaReversal, c = window.__game.wildlife.population.residents.find(c => c.id === probe.id);
    probe.stage = 'flee-reversal'; c.behavior = 'flee'; c.timer = 5;
  });
  await wait(1100); await page.screenshot({ path: resolve(folder, 'ridge-turn-review-fill.png') });
  await wait(1600); await page.screenshot({ path: resolve(folder, 'ridge-flee-review-fill.png') });
  await wait(600);
  if (recorder) { await recorder.stop(); recorder = null; }
  const data = await page.evaluate(() => ({ samples: window.__faunaReversal.samples,
    bundle: [...document.scripts].find(s => s.type === 'module')?.src, stats: window.__game.wildlife.stats(),
    renderer: JSON.parse(window.render_game_to_text()).renderer }));
  const contacts = data.samples.flatMap(s => s.contacts).filter(c => c.planted), error = contacts.map(c => c.error).sort((a,b)=>a-b);
  const maximum = Math.max(...error), p95 = error[Math.floor(error.length * .95)];
  const turns = data.samples.filter(s => s.dt > 0 && s.stage === 'flee-reversal').map(s => s.headingChange / s.dt);
  checks.push({ label: 'Exact original resident has enough contacts', ok: contacts.length > 100, count: contacts.length });
  checks.push({ label: 'Maximum planted contact error below3cm', ok: maximum < .03, maximum, p95 });
  checks.push({ label: 'Heading changes continuously through reversal', ok: Math.max(...turns) < 2.3, maxRadiansPerSecond: Math.max(...turns) });
  checks.push({ label: 'Actual stalk and flee states/speeds observed', ok: data.samples.some(s=>s.behavior==='stalk'&&s.speed>.5)&&data.samples.some(s=>s.behavior==='flee'&&s.speed>2) });
  checks.push({ label: 'No browser errors', ok: errors.length === 0, errors });
  report = { scope: 'Exact ridge-resident contact regression. Diagnostic player relocation/camera/flee state. Original-light still retained; other named review captures boost existing ambient fill for anatomy visibility. No performance claims.',
    bundle: data.bundle, browser: await browser.version(), checks, stats: data.stats, errors, warnings };
  await writeFile(resolve(folder, 'samples.json'), JSON.stringify(data.samples));
} catch(error) { checks.push({ label: 'Run completed', ok: false, error: String(error) }); }
finally {
  if (recorder) await recorder.stop().catch(()=>{}); await browser.close();
  report ??= { checks, errors, warnings }; await writeFile(resolve(folder, 'checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); if (checks.some(c=>!c.ok)) process.exitCode = 1;
}
