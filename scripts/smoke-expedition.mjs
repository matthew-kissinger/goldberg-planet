/** Real input + delivered-rig qualification. Disposable world; NOT a performance benchmark.
 * node scripts/smoke-expedition.mjs http://127.0.0.1:5199 [gpu|gl] [run-label]
 */
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const origin = process.argv[2] ?? 'http://127.0.0.1:5199';
const backend = process.argv[3] ?? 'gpu';
const runLabel = (process.argv[4] ?? new Date().toISOString()).replace(/[^a-z0-9-]/gi,'-');
const folder = resolve(`output/expedition-smoke-${backend}-${runLabel}`);
await mkdir(folder, { recursive: true });
const checks = [], errors = [], warnings = [], captures = [], notes = [];
const wait = ms => new Promise(done => setTimeout(done, ms));
const check = (label, ok, detail) => { checks.push({ label, ok: !!ok, detail }); if (!ok) process.exitCode = 1; };
const quantiles = values => {
  const data = values.filter(Number.isFinite).sort((a,b) => a-b);
  const q = p => data.length ? data[Math.min(data.length-1, Math.floor((data.length-1)*p))] : null;
  return { count: data.length, median: q(.5), p95: q(.95), p99: q(.99), max: q(1) };
};
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] });
let page, recorder, samples = [], faunaSamples = [], metadata, footMetrics;
try {
  page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); if (message.type() === 'warn') warnings.push(message.text()); });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${origin}/?m=192&nosave=1&mute=1&clouds=0&seed=journal-ui-smoke${backend === 'gl' ? '&gpu=gl' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.character.rig && !document.getElementById('splash'), { timeout: 120000 });
  await page.waitForFunction(() => window.__game.player.grounded, { timeout: 15000 });
  metadata = await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text());
    delete state.performance; // This instrumented recording is not a timing capture.
    return { state, userAgent: navigator.userAgent };
  });
  metadata.browser = await browser.version();
  await page.evaluate(() => {
    const game = window.__game;
    // Use the game's supported drag-look fallback, keeping real DOM key/mouse input.
    game.controls.input.lockUnavailable = true;
    const originalPose = game.character.poseModifier;
    const probe = window.__expeditionProbe = { stage: 'idle', samples: [], faunaSamples: [], frontCamera: false, faunaCamera: null, originalPose };
    game.character.setPoseModifier(context => {
      originalPose?.(context);
      const active = game.solarSystem.activePlanet, p = game.player;
      const ik = game.footIk.stats();
      const feet = context.rig.legs.map((leg, i) => {
        const sole = leg.ankle.localToWorld(leg.soleOffset.clone());
        sole.x += context.camWorld.x; sole.y += context.camWorld.y; sole.z += context.camWorld.z;
        const r = sole.length(), tile = game.geo.tileOf(sole.x, sole.y, sole.z);
        const layer = active.columns.groundLayerBelow(tile, r + .72);
        const groundR = active.layers.topRadius(layer), normal = sole.clone().normalize();
        const up = sole.clone().set(0,1,0).transformDirection(leg.ankle.matrixWorld);
        const state = game.footIk.feet[i];
        const hip=leg.hip.getWorldPosition(sole.clone()),knee=leg.knee.getWorldPosition(sole.clone()),ankle=leg.ankle.getWorldPosition(sole.clone());
        const chainLength=hip.distanceTo(knee)+knee.distanceTo(ankle),targetDistance=hip.distanceTo(state.target);
        return { side: leg.side, sole: sole.toArray(), normal: normal.toArray(), supportRadius: groundR,
          surfaceError: r-groundR, anchorError: state.planted ? sole.distanceTo(state.anchor) : null,
          chainLength,targetDistance,reachExcess:Math.max(0,targetDistance-chainLength),
          normalAngle: Math.acos(Math.max(-1,Math.min(1,up.dot(normal))))*180/Math.PI,
          stance: context.contactWeights[i], solverWeight: ik.weights[i], planted: state.planted };
      });
      if(probe.samples.length < 10000) probe.samples.push({ t: performance.now(), stage: probe.stage,
        planet: active.config.id, clip: game.character.stats().activeClip, mode: p.mode, grounded: p.grounded,
        position: [p.px,p.py,p.pz], camera: [context.camWorld.x,context.camWorld.y,context.camWorld.z],
        speed: Math.hypot(p.vx,p.vy,p.vz), stepSmooth: p.stepSmooth, phase: context.gaitPhase,
        pelvisY: context.rig.pelvis.position.y, contactWorldMatches: game.footIk.worldId === active.columns, ik, feet });
      if (probe.faunaCamera && probe.faunaSamples.length < 2000) {
        const c = game.wildlife.population.residents.find(c => c.id === probe.faunaCamera);
        if (c) probe.faunaSamples.push({ t: performance.now(), id: c.id, species: c.species, behavior: c.behavior,
          phase: c.phase, speed: c.speed, position: c.position.toArray(), contacts: game.wildlife.contacts().filter(foot => foot.id === c.id) });
      }
    });
    // Diagnostic front camera changes only this render, never player heading/physics.
    const render = game.renderer.render;
    game.renderer.render = function(scene, camera) {
      if (!probe.frontCamera && !probe.faunaCamera) return render.call(this, scene, camera);
      const position = camera.position.clone(), quaternion = camera.quaternion.clone(), up = camera.up.clone();
      const p = game.player, base = game.character.group.position;
      const radial = base.clone().set(p.px,p.py,p.pz).normalize();
      const ahead = base.clone().set(p.fwdX,p.fwdY,p.fwdZ);
      if (probe.faunaCamera) {
        const c = game.wildlife.population.residents.find(c => c.id === probe.faunaCamera);
        const target = c.position.clone().sub(base.clone().set(game.rig.world.x,game.rig.world.y,game.rig.world.z));
        radial.copy(c.position).normalize(); ahead.copy(c.forward);
        const side = radial.clone().cross(ahead).normalize();
        camera.position.copy(target).addScaledVector(side,3.2).addScaledVector(radial,1.5).addScaledVector(ahead,2.1);
        camera.up.copy(radial); camera.lookAt(target.addScaledVector(radial,.72));
      } else {
        camera.position.copy(base).addScaledVector(radial,1.15).addScaledVector(ahead,3.4);
        camera.up.copy(radial); camera.lookAt(base.clone().addScaledVector(radial,1.05));
      }
      camera.updateMatrixWorld(true);
      try { return render.call(this,scene,camera); }
      finally { camera.position.copy(position); camera.quaternion.copy(quaternion); camera.up.copy(up); camera.updateMatrixWorld(true); }
    };
  });
  const stage = name => page.evaluate(value => { window.__expeditionProbe.stage = value; }, name);
  const shot = async (name, label = 'real gameplay camera') => {
    const path = resolve(folder, `${name}.png`); await page.screenshot({ path }); captures.push({ name, path, label });
  };
  const snap = () => page.evaluate(() => {
    const g=window.__game,p=g.player,r=g.character.rig;
    return { position:[p.px,p.py,p.pz], camera:Object.values(g.rig.world), health:p.health,hunger:p.hunger,
      pelvisY:r.pelvis.position.y, clip:g.character.stats().activeClip, ik:g.footIk.stats(),
      feet:r.legs.map(l=>{const v=l.ankle.localToWorld(l.soleOffset.clone());return [v.x+g.rig.world.x,v.y+g.rig.world.y,v.z+g.rig.world.z];}) };
  });
  const distance = (a,b) => Math.hypot(...a.map((value,i)=>value-b[i]));
  await wait(500); await shot('idle-behind');
  await page.evaluate(()=>window.__expeditionProbe.frontCamera=true); await wait(150);
  await shot('idle-front','diagnostic front camera; player position and heading unchanged');
  await page.evaluate(()=>window.__expeditionProbe.frontCamera=false);
  try { recorder = await page.screencast({ path:resolve(folder,'locomotion.webm'),fps:20,quality:32,ffmpegPath:process.env.FFMPEG_PATH??'ffmpeg' }); }
  catch(error) { notes.push(`Video unavailable; screenshots retained: ${String(error)}`); }
  await page.focus('canvas'); await stage('walk');
  const walkStart=await snap(); await page.keyboard.down('w'); await wait(2200); await shot('walk-midpose'); await wait(2800); await page.keyboard.up('w');
  const walkEnd=await snap(); check('Real W advances explorer',distance(walkStart.position,walkEnd.position)>7,{distance:distance(walkStart.position,walkEnd.position)});
  await stage('sprint'); await page.keyboard.down('Shift');await page.keyboard.down('w');await wait(2300);await shot('sprint-midpose');await page.keyboard.up('w');await page.keyboard.up('Shift');
  await wait(400); await stage('jump');await page.keyboard.press('Space',{delay:80});await wait(220);await shot('jump-airborne');await wait(1500);
  if(recorder){await recorder.stop();recorder=null;captures.push({name:'locomotion',path:resolve(folder,'locomotion.webm'),label:'real W / Shift+W / Space; recording is not a performance benchmark'});}
  await page.waitForFunction(()=>window.__game.player.grounded,{timeout:10000});await wait(250);

  await stage('camera-origin');const cameraBefore=await snap();
  await page.mouse.move(720,600);await page.mouse.wheel({deltaY:340});await wait(800);
  const wheelAfter=await snap();
  check('Pure wheel origin shift preserves planted feet',distance(cameraBefore.camera,wheelAfter.camera)>.5&&Math.max(...cameraBefore.feet.map((p,i)=>distance(p,wheelAfter.feet[i])))<.01,{cameraShift:distance(cameraBefore.camera,wheelAfter.camera),footDrift:cameraBefore.feet.map((p,i)=>distance(p,wheelAfter.feet[i]))});
  await page.mouse.move(720,500);await page.mouse.down({button:'right'});await page.mouse.move(870,500,{steps:12});await page.mouse.up({button:'right'});await wait(500);
  const cameraAfter=await snap();
  check('Wheel/drag changes floating origin while standing',distance(cameraBefore.camera,cameraAfter.camera)>.5&&distance(cameraBefore.position,cameraAfter.position)<.01,{cameraShift:distance(cameraBefore.camera,cameraAfter.camera),playerShift:distance(cameraBefore.position,cameraAfter.position)});
  check('Standing turn keeps planted feet within 2cm',Math.max(...wheelAfter.feet.map((p,i)=>distance(p,cameraAfter.feet[i])))<.02,{drift:wheelAfter.feet.map((p,i)=>distance(p,cameraAfter.feet[i]))});
  await page.mouse.wheel({deltaY:-340});await wait(500);

  await stage('menu-paused');await page.click('[data-action="guide"]');await wait(100);const pausedBefore=await snap();
  await page.keyboard.down('w');await wait(900);await page.keyboard.up('w');const pausedAfter=await snap();
  check('Menu pauses movement and survival',distance(pausedBefore.position,pausedAfter.position)<1e-8&&pausedBefore.health===pausedAfter.health&&pausedBefore.hunger===pausedAfter.hunger,{before:pausedBefore,after:pausedAfter});
  check('Paused authored pose/IK correction does not accumulate',Math.abs(pausedBefore.pelvisY-pausedAfter.pelvisY)<1e-7&&Math.max(...pausedBefore.feet.map((p,i)=>distance(p,pausedAfter.feet[i])))<.002,{pelvisDelta:pausedAfter.pelvisY-pausedBefore.pelvisY,footDrift:pausedBefore.feet.map((p,i)=>distance(p,pausedAfter.feet[i]))});
  await page.keyboard.press('Escape');await page.focus('canvas');

  const route = await page.evaluate(()=>{
    const g=window.__game,active=g.solarSystem.activePlanet,route=g.expedition.route;
    const h=t=>active.layers.topRadius(active.columns.topLayerOf(t));
    const step=route.slice(0,-1).map((tile,i)=>({tile,next:route[i+1],rise:h(route[i+1])-h(tile)})).find(p=>p.rise>.1&&p.rise<=.72);
    return{home:active.config.id,spawn:g.expedition.spawnTile,grove:route[Math.floor(route.length*.75)],step};
  });
  const relocate=async(tile,next)=>{
    await page.evaluate(({tile,next})=>{const g=window.__game,p=g.player;p.spawnAt(tile);p.mode='walk';p.vx=p.vy=p.vz=0;
      if(next!==undefined){const c=g.geo.centers,n=next*3,r=p.radius();p.fwdX=c[n]*r-p.px;p.fwdY=c[n+1]*r-p.py;p.fwdZ=c[n+2]*r-p.pz;p.reorthonormalize();}
      g.rig.snapTo(p);g.footIk.reset();}, {tile,next});
    await page.waitForFunction(()=>window.__game.player.grounded,{timeout:10000});await wait(600);
  };
  notes.push('Step and grove starts below use explicitly labelled diagnostic relocation; subsequent W movement is real input, not evidence of walking the entire route.');
  check('Route includes an authored traversable step',!!route.step,route.step);
  if(route.step){
    await stage('step-relocation');await relocate(route.step.tile,route.step.next);
    try { recorder=await page.screencast({path:resolve(folder,'tile-step.webm'),fps:20,quality:32,ffmpegPath:process.env.FFMPEG_PATH??'ffmpeg'}); } catch(error){notes.push(String(error));}
    await stage('step-walk');await page.focus('canvas');await page.keyboard.down('w');
    try{await page.waitForFunction(()=>window.__game.player.stepSmooth>.025,{timeout:5000});await shot('step-contact','real W across a step after labelled diagnostic relocation');}
    catch(error){check('Step transition was actually reached',false,String(error));}
    await wait(1800);await page.keyboard.up('w');
    if(recorder){await recorder.stop();recorder=null;captures.push({name:'tile-step',path:resolve(folder,'tile-step.webm'),label:'real W ascent after diagnostic relocation; actual delivered avatar/IK'});}
  }
  await stage('grove-relocation');await relocate(route.grove);await shot('grove','diagnostic relocation to the composed route grove');

  const wolf = await page.evaluate(()=>{
    const g=window.__game,sun=g.scene.children.find(node=>node.isDirectionalLight),direction=sun.position.clone().sub(sun.target.position).normalize();
    return g.wildlife.population.residents.filter(c=>c.species==='duskprowler'&&c.hp>0)
      .sort((a,b)=>b.position.clone().normalize().dot(direction)-a.position.clone().normalize().dot(direction))[0]?.id;
  });
  check('A resident wolf body plan exists on Aurelia',!!wolf,wolf);
  if(wolf){
    await stage('wolf-stalk');
    await page.evaluate(id=>{const g=window.__game,p=g.player,c=g.wildlife.population.residents.find(c=>c.id===id);
      const point=c.position.clone().addScaledVector(c.forward,9),tile=g.geo.tileOf(point.x,point.y,point.z);
      p.spawnAt(tile);p.mode='walk';p.vx=p.vy=p.vz=0;g.rig.snapTo(p);g.footIk.reset();window.__expeditionProbe.faunaCamera=id;
    },wolf);
    await wait(700);
    try { recorder=await page.screencast({path:resolve(folder,'duskprowler-gait.webm'),fps:20,quality:32,ffmpegPath:process.env.FFMPEG_PATH??'ffmpeg'}); } catch(error){notes.push(String(error));}
    await wait(1300);await shot('duskprowler-stalk','diagnostic close camera and player relocation; resident wolf behavior and articulated runtime rig');
    await stage('wolf-flee');await page.evaluate(id=>{const c=window.__game.wildlife.population.residents.find(c=>c.id===id);c.behavior='flee';c.timer=5;},wolf);
    await wait(1400);await shot('duskprowler-flee','explicit diagnostic flee state; runtime gait/contact update');await wait(1300);
    if(recorder){await recorder.stop();recorder=null;captures.push({name:'duskprowler-gait',path:resolve(folder,'duskprowler-gait.webm'),label:'resident stalking then labelled diagnostic flee; close camera only'});}
    await page.evaluate(()=>window.__expeditionProbe.faunaCamera=null);
    faunaSamples=await page.evaluate(()=>window.__expeditionProbe.faunaSamples);
    const contacts=faunaSamples.flatMap(s=>s.contacts).filter(f=>f.planted);
    check('Wolf runtime gait advances with planted contacts',faunaSamples.some(s=>s.speed>2)&&contacts.length>30,{frames:faunaSamples.length,contactErrors:quantiles(contacts.map(f=>f.error)),behaviors:[...new Set(faunaSamples.map(s=>s.behavior))]});
    check('Wolf planted contact p95 < 0.03m',contacts.length>30&&quantiles(contacts.map(f=>f.error)).p95<.03,quantiles(contacts.map(f=>f.error)));
    await relocate(route.spawn);
  }

  notes.push('Survival destination keys now set courses rather than teleporting. Planet handoff below is a diagnostic direct SolarSystem request; gameplay travel/menu policy is qualified separately.');
  await stage('warp-out');await page.evaluate(()=>{const g=window.__game;g.solarSystem.warpToPlanet(g.solarSystem.planets[1].config.id,g.player,0,false);});
  await page.waitForFunction(home=>window.__game.solarSystem.travelState.pending||window.__game.solarSystem.activePlanet.config.id!==home,{timeout:15000},route.home);
  await page.evaluate(()=>window.__game.solarSystem.whenTravelSettled());await wait(350);
  const destination=await page.evaluate(()=>window.__game.solarSystem.activePlanet.config.id);
  check('Diagnostic handoff completes asynchronous travel',destination!==route.home,{destination});
  await stage('warp-return');await page.evaluate(({home,tile})=>window.__game.solarSystem.warpToPlanet(home,window.__game.player,tile,false),{home:route.home,tile:route.spawn});
  await page.waitForFunction(home=>window.__game.solarSystem.travelState.pending||window.__game.solarSystem.activePlanet.config.id===home,{timeout:15000},route.home);
  await page.evaluate(()=>window.__game.solarSystem.whenTravelSettled());await page.waitForFunction(home=>window.__game.solarSystem.activePlanet.config.id===home&&!window.__game.solarSystem.travelState.pending,{timeout:15000},route.home);await wait(400);
  await stage('skiff');
  // Disposable inventory grant is setup only; actual E action crafts/boards the skiff.
  await page.evaluate(()=>window.__game.loop.inventory.wood=Math.max(12,window.__game.loop.inventory.wood??0));
  await page.keyboard.press('e',{delay:60});await wait(800);await shot('skiff','real E boarding after labelled disposable timber grant');
  const flight=await page.evaluate(()=>({mode:window.__game.player.mode,stats:window.__game.character.stats(),seated:window.__game.character.rig.root.visible,skiff:window.__game.character.group.getObjectByName('fieldSkiff').visible}));
  check('Skiff uses the real seated explorer clip',flight.mode==='plane'&&flight.stats.activeClip==='plane'&&flight.seated&&flight.skiff,flight);
  samples=await page.evaluate(()=>window.__expeditionProbe.samples);
  const actions=new Set(samples.map(s=>s.clip));
  check('Idle/walk/sprint/jump clips actually engaged',['idle','move','sprint','jump'].every(a=>actions.has(a)),[...actions]);
  check('Jump includes airborne player state',samples.some(s=>s.stage==='jump'&&!s.grounded&&s.clip==='jump'));
  const firstForeign=samples.find(s=>s.planet!==route.home);
  check('Planet handoff binds contacts to the destination world',!!firstForeign&&firstForeign.contactWorldMatches&&firstForeign.feet.every(f=>distance(f.sole,firstForeign.position)<2.5),firstForeign);
  footMetrics={};
  for(const name of ['walk','sprint','step-walk','menu-paused']){
    const stageSamples=samples.filter(s=>s.stage===name);
    const expectedClip=name==='sprint'?'sprint':name==='menu-paused'?'idle':'move';
    const clipFrames=stageSamples.filter(s=>s.clip===expectedClip);
    const contacts=clipFrames.filter(s=>s.grounded&&s.ik.grounded).flatMap(s=>s.feet).filter(f=>f.planted&&f.stance>=.8&&f.solverWeight>=.8);
    footMetrics[name]={frames:stageSamples.length,expectedClip,expectedClipFrames:clipFrames.length,actualClips:[...new Set(stageSamples.map(s=>s.clip))],qualifiedContacts:contacts.length,
      anchorError:quantiles(contacts.map(f=>f.anchorError)),absoluteSurfaceError:quantiles(contacts.map(f=>Math.abs(f.surfaceError))),normalAngleDegrees:quantiles(contacts.map(f=>f.normalAngle)),
      allGroundedSurfaceError:quantiles(stageSamples.filter(s=>s.grounded).flatMap(s=>s.feet).map(f=>Math.abs(f.surfaceError)))};
  }
  for(const name of ['walk','sprint','step-walk']){
    const metrics=footMetrics[name];
    check(`${name}: actual clip provides enough measured contacts`,metrics.qualifiedContacts>=30,{expectedClip:metrics.expectedClip,expectedClipFrames:metrics.expectedClipFrames,qualifiedContacts:metrics.qualifiedContacts,actualClips:metrics.actualClips});
    check(`${name}: planted-foot anchor error p95 < 0.12m`,metrics.anchorError.p95!==null&&metrics.anchorError.p95<.12,metrics.anchorError);
    check(`${name}: planted-foot surface error p95 < 0.12m`,metrics.absoluteSurfaceError.p95!==null&&metrics.absoluteSurfaceError.p95<.12,metrics.absoluteSurfaceError);
  }
  check('No browser errors',errors.length===0,errors);
}catch(error){check('Run completed',false,String(error));}
finally{
  if(recorder)await recorder.stop().catch(error=>notes.push(String(error)));
  if(page&&!samples.length)samples=await page.evaluate(()=>window.__expeditionProbe?.samples??[]).catch(()=>[]);
  await browser.close();
  const report={scope:'Functional and visible-motion evidence only; recording/instrumentation overhead means no performance comparison.',backend,metadata,checks,footMetrics,captures,notes,errors,warnings};
  await writeFile(resolve(folder,'checks.json'),JSON.stringify(report,null,2));
  await writeFile(resolve(folder,'samples.json'),JSON.stringify(samples));
  await writeFile(resolve(folder,'fauna-samples.json'),JSON.stringify(faunaSamples));
  console.log(JSON.stringify({backend,passed:checks.filter(c=>c.ok).length,failed:checks.filter(c=>!c.ok),footMetrics,captures,notes,errors,warnings},null,2));
}
