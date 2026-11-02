import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// node scripts/profile-game.mjs LABEL PORT [gpu|gl]
// Run against an unchanged server/build; HMR invalidates a capture.
const label = process.argv[2] ?? 'baseline';
const port = process.argv[3] ?? '5197';
const backend = process.argv[4] ?? 'gpu';
const folder = pathToFileURL(resolve('output/performance', `${label}-${backend}`) + '/');
await mkdir(folder, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--window-size=1280,720', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0,1500)); });
const client = await page.createCDPSession();
const system = await browser.target().createCDPSession();
const gpu = await system.send('SystemInfo.getInfo');
await page.evaluateOnNewDocument(() => {
  window.__samples = { frames: [], tasks: [], calls: {}, stage: 'boot' };
  new PerformanceObserver(list => { for (const e of list.getEntries()) window.__samples.tasks.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  let prev = 0;
  const frame = t => { if (prev) window.__samples.frames.push(t-prev); prev=t; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
});
try {
  const started = performance.now();
  await page.goto(`http://127.0.0.1:${port}/?nosave=1&mute=1&seed=GP192-01&m=192&debug=1${backend === 'gl' ? '&gpu=gl' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!window.__game && !document.getElementById('splash'), { timeout: 180000 });
  const bootMs = performance.now() - started;
  console.log('boot ready', label, backend);
  await page.evaluate(() => {
    for (const [objName, methods] of Object.entries({ streamer: ['pump','refreshDesired','updateTransforms','rebuildTile'], wildlife: ['update'], waterfalls: ['update'], solarSystem: ['update','warpToPlanet'], structureStore: ['tickAutomation','analyzePlanetGrid'], rig: ['update'], player: ['update'], loop: ['tickDrops'] })) {
      const obj = window.__game[objName];
      for (const name of methods) {
        const old = obj[name];
        obj[name] = function(...args) { const t=performance.now(); try { return old.apply(this,args); } finally { (window.__samples.calls[`${objName}.${name}`] ??= []).push(performance.now()-t); } };
      }
    }
  });
  const results = [];
  const capture = async (name, duration, action) => {
    await page.evaluate(n => { window.__samples = { frames: [], tasks: [], calls: {}, stage: n }; }, name);
    await client.send('Profiler.enable');
    await client.send('Profiler.start');
    if (action) await action();
    await new Promise(r => setTimeout(r,duration));
    const { profile } = await client.send('Profiler.stop');
    await writeFile(new URL(`${name}.cpuprofile`, folder), JSON.stringify(profile));
    const data = await page.evaluate(() => {
      const summary = a => { a.sort((a,b)=>a-b); return { n:a.length, p50:a[Math.floor(a.length*.5)]??0, p95:a[Math.floor(a.length*.95)]??0, p99:a[Math.floor(a.length*.99)]??0, max:a.at(-1)??0, total:a.reduce((a,b)=>a+b,0), over50:a.filter(v=>v>50).length }; };
      return { stage:window.__samples.stage, frames:summary(window.__samples.frames), tasks:summary(window.__samples.tasks), calls:Object.fromEntries(Object.entries(window.__samples.calls).map(([k,v])=>[k,summary(v)])), streamer:window.__game.streamer.stats(), travel:window.__game.solarSystem.travelState, game:JSON.parse(window.render_game_to_text()) };
    });
    results.push(data);
    await page.screenshot({ path: new URL(`${name}.png`, folder).pathname.replace(/^\/([A-Za-z]:)/,'$1') });
    console.log(JSON.stringify({stage:name, frames:data.frames, pump:data.calls['streamer.pump'], streamer:data.streamer}));
  };
  await capture('settle', 5000);
  await capture('idle', 10000);
  await capture('walk', 10000, async()=> { await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); });
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  await capture('orbit', 6000, ()=>page.evaluate(()=>{const r=window.__game.rig; r.zoomExpTarget=1; r.zoomExp=1;}));
  // Preparation remains inside the capture; the post-action hold begins after ready swap.
  // Older synchronous builds have no completion API and retain their original route.
  const warp = id => page.evaluate(async id => {
    const g = window.__game;
    if (!g.solarSystem.warpToPlanet(id, g.player, 0, false)) throw new Error('Warp rejected');
    if (g.solarSystem.whenTravelSettled && !await g.solarSystem.whenTravelSettled()) throw new Error('Travel preparation failed');
  }, id);
  await capture('travel', 6000, ()=>warp('planet-1'));
  await capture('return', 6000, ()=>warp('planet-0'));
  await writeFile(new URL('results.json', folder), JSON.stringify({label,backend,bootMs,browser:await browser.version(),gpu:gpu.gpu, viewport:{width:1280,height:720,dpr:1}, errors,results},null,2));
  console.log(JSON.stringify({done:label,backend,errors}));
} finally { await browser.close(); }
