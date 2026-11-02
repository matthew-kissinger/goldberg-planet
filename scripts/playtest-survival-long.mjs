import puppeteer from 'puppeteer-core';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const out=process.env.SURVIVAL_OUTPUT??'output/survival-long'; await mkdir(out,{recursive:true});
const launchOnly=process.argv.includes('--launch-only');
const report={startedAt:new Date().toISOString(),scope:'Automated Survival with steering assistance; real world physics, SOI transitions, mined/collected resources and recipe costs. Actions call gameplay methods at checked nearby tiles. No inventory grants, god mode, warps or position changes.',checks:[],stages:[],errors:[],warnings:[]};
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage(); await page.setViewport({width:1440,height:900});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=async()=>{await writeFile(`${out}/results.json`,JSON.stringify(report,null,2));if(!page.isClosed())await writeFile(`${out}/checkpoint.json`,JSON.stringify(await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage[k]])))));};
const check=(name,ok,detail)=>{report.checks.push({name,ok,detail}); console.log(JSON.stringify({name,ok,detail}));if(!ok)throw Error(name);};
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());if(m.type()==='warn')report.warnings.push(m.text());});
try{
 if(process.argv.includes('--resume')){const storage=JSON.parse(await readFile(process.env.SURVIVAL_CHECKPOINT??`${out}/checkpoint.json`,'utf8'));await page.evaluateOnNewDocument(storage=>{for(const [k,v]of Object.entries(storage))localStorage.setItem(k,v);},storage);}
 await page.goto(`${process.env.SURVIVAL_ORIGIN??'http://127.0.0.1:5199'}/?mode=survival&mute=1&m=192&seed=survival-long-01`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__game&&!document.getElementById('splash'),{timeout:120000});
 report.bundle=await page.evaluate(()=>[...document.scripts].map(s=>s.src).find(s=>s.includes('/assets/index-')));
 if(process.argv.includes('--render-diagnostics'))await page.evaluate(()=>{
   const r=__game.renderer;window.__renderOutliers=[];let depth=0,totals={};
   const wrap=(o,key,label=key)=>{if(typeof o?.[key]!=='function')return;const f=o[key].bind(o);o[key]=(...a)=>{const t=performance.now(),v=f(...a);totals[label]=(totals[label]??0)+performance.now()-t;return v;};};
   for(const key of Object.getOwnPropertyNames(Object.getPrototypeOf(r.backend)))if(key!=='constructor'&&typeof Object.getOwnPropertyDescriptor(Object.getPrototypeOf(r.backend),key)?.value==='function')wrap(r.backend,key,`backend.${key}`);
   for(const key of ['_renderScene','_renderObjects','_renderObjectDirect'])wrap(r,key);
   for(const [o,name,keys]of [[r.drawingPipeline,'drawing',['project','finishRenderList']],[r._nodes,'nodes',['updateBefore','updateForRender','updateAfter']],[r._bindings,'bindings',['updateForRender','updateSharedForRender']],[r._geometries,'geometry',['updateForRender']],[r._pipelines,'pipelines',['updateForRender','getForRender']]])for(const key of keys)wrap(o,key,`${name}.${key}`);
   const render=r.render.bind(r);r.render=(...a)=>{const root=depth===0;if(root)totals={};depth++;const t=performance.now(),v=render(...a),ms=performance.now()-t;depth--;if(root&&ms>20)__renderOutliers.push({time:performance.now(),ms,totals:{...totals},altitude:__game.player.altitudeAGL()});return v;};
 });
 if(process.argv.includes('--backend-diagnostics'))await page.evaluate(()=>{
   window.__slowBackend=[];const backend=__game.renderer.backend;
   const wrap=(object,key)=>{if(typeof object?.[key]!=='function')return;const original=object[key].bind(object);object[key]=(...args)=>{const t=performance.now(),result=original(...args),ms=performance.now()-t;if(ms>5)__slowBackend.push({key,ms,time:performance.now(),altitude:__game.player.altitudeAGL(),planet:__game.solarSystem.activePlanet.config.id,name:args[0]?.object?.name,bytes:args[0]?.array?.byteLength});return result;};};
   for(const key of ['finishRender','beginRender','draw','updateAttribute','createAttribute','updateBindings','createBindings','copyFramebufferToTexture','copyTextureToTexture','updateTexture','createTexture','beginCompute','finishCompute','compute','createRenderPipeline'])wrap(backend,key);
   for(const key of ['createBuffer','createBindGroup','createCommandEncoder'])wrap(backend.device,key);wrap(backend.device.queue,'submit');
 });
 if(process.argv.includes('--upload-diagnostics'))await page.evaluate(()=>{
   window.__uploadFrames=[];let bytes=0,blockingMs=0,calls=0;
   const queue=__game.renderer.backend.device.queue,write=queue.writeBuffer.bind(queue);
   queue.writeBuffer=(...args)=>{const start=performance.now();const result=write(...args);blockingMs+=performance.now()-start;bytes+=args[4]===undefined?args[2].byteLength:args[4]*(args[2].BYTES_PER_ELEMENT??1);calls++;return result;};
   function tick(t){if(bytes>2000000||blockingMs>5)__uploadFrames.push({t,bytes,blockingMs,calls,residents:__game.streamer.resident.size,detailed:__game.streamer.detailedRendering,altitude:__game.player.altitudeAGL()});bytes=0;blockingMs=0;calls=0;requestAnimationFrame(tick);}requestAnimationFrame(tick);
 });
 if(process.argv.includes('--pipeline-diagnostics'))await page.evaluate(()=>{
   window.__latePipelines=[];
   const backend=__game.renderer.backend;
   for(const method of ['createRenderPipeline','createComputePipeline']){
     const original=backend[method].bind(backend);
     backend[method]=(...args)=>{const start=performance.now(),result=original(...args);__latePipelines.push({method,ms:performance.now()-start,time:performance.now(),material:args[0]?.material?.name,object:args[0]?.object?.name,asynchronous:Array.isArray(args[1])});return result;};
   }
 });
 await page.evaluate(()=>{
  const g=__game,old=g.controls.read.bind(g.controls);window.__pilot={target:null,flight:false,climb:false,walk:false};
  g.controls.read=(dt,blocked)=>{const i=old(dt,blocked),a=__pilot,p=g.player;if(blocked)return i;
   if(a.huntId){const animal=g.wildlife.population.residents.find(c=>c.id===a.huntId);if(animal)a.target=animal.position.toArray();}
   if(a.orbitSite){const u=p.up(),site=a.orbitSite,angle=Math.acos(Math.max(-1,Math.min(1,u.reduce((s,v,k)=>s+v*site[k],0)))),f=angle>.18?Math.min(1,.3/angle):1,d=u.map((v,k)=>v*(1-f)+site[k]*f),l=Math.hypot(...d),cfg=g.solarSystem.activePlanet.config;a.target=d.map(v=>v/l*(cfg.radius+Math.max(cfg.karmanAGL+400,650)));}if(a.target){const d=a.target.map((v,k)=>v-[p.px,p.py,p.pz][k]),len=Math.hypot(...d),u=p.up(),dot=d.reduce((s,v,k)=>s+v*u[k],0)/len;
    [p.fwdX,p.fwdY,p.fwdZ]=d;p.reorthonormalize();p.pitch=a.flight?Math.asin(Math.max(-.95,Math.min(.95,dot))):0;
    if(a.walk){i.forward=len>5?1:0;i.jump=len>8;}
    if(a.flight){const desired=Math.min(350,Math.max(20,len*.15));i.forward=p.throttle>desired?-1:1;i.sprint=false; if(!p.inSpaceCruise)i.down=!a.climb&&len<700;}
   }
   if(a.climb){if(p.mode!=='plane'&&p.submerged<.3)g.loop.planeButton();i.jump=true;i.forward=1;p.pitch=.8;}return i;};
  let active=false,previous=0,frames=[],tasks=[];const ob=new PerformanceObserver(l=>{if(active)tasks.push(...l.getEntries().map(e=>e.duration));});ob.observe({type:'longtask'});
  function tick(t){if(active&&previous)frames.push(t-previous);previous=active?t:0;requestAnimationFrame(tick);}requestAnimationFrame(tick);
  const summary=a=>{a.sort((a,b)=>a-b);return {n:a.length,p95:a[Math.floor(a.length*.95)]??0,p99:a[Math.floor(a.length*.99)]??0,max:a.at(-1)??0,over50:a.filter(v=>v>50).length};};
  window.__capture={begin(){ob.takeRecords();frames=[];tasks=[];previous=0;active=true;},end(){active=false;return {frames:summary(frames),longTasks:summary(tasks),state:JSON.parse(render_game_to_text())};}};
 });
 const begin=()=>page.evaluate(()=>__capture.begin());const end=async name=>{const s=await page.evaluate(()=>__capture.end());report.stages.push({name,...s});await save();console.log(JSON.stringify({stage:name,frames:s.frames,planet:s.state.planet}));};
 if(!await page.evaluate(()=>__game.player.hasOrbitalThruster)){check('Survival starts without tools or supplied wood',await page.evaluate(()=>!__game.player.creative&&!__game.player.hasOrbitalThruster&&!__game.loop.inventory.wood));
 await begin();
 // Gather from nearby native trees. Steering changes heading, never position.
 for(let n=0;n<6;n++){
  const tile=await page.evaluate(()=>{const g=__game,p=g.player,c=g.geo.centers,world=g.solarSystem.activePlanet;let best=-1,bestD=Infinity;const candidates=[p.tile],seen=new Set(candidates);for(let q=0;q<candidates.length&&candidates.length<2048;q++)for(let k=0;k<g.geo.degreeOf(candidates[q]);k++){const t=g.geo.neighbor(candidates[q],k);if(!seen.has(t)){seen.add(t);candidates.push(t);}}for(const t of candidates){if(!world.trees.hasTree(t))continue;const r=world.columns.layers.topRadius(world.columns.topLayerOf(t)),d=Math.hypot(c[t*3]*r-p.px,c[t*3+1]*r-p.py,c[t*3+2]*r-p.pz);if(d<bestD){best=t;bestD=d;}}const r=world.columns.layers.topRadius(world.columns.topLayerOf(best));__pilot.target=[c[best*3]*r,c[best*3+1]*r,c[best*3+2]*r];__pilot.walk=true;return best;});
  await page.waitForFunction(()=>{const p=__game.player;return Math.hypot(...__pilot.target.map((v,k)=>v-[p.px,p.py,p.pz][k]))<8;},{timeout:90000});
  await page.evaluate(()=>__pilot.walk=false);
  for(let hit=0;hit<4;hit++){await page.evaluate(t=>__game.loop.strikeTree(t),tile);await sleep(450);}
  await sleep(900);
 }
 check('Gathered timber through drops without grants',await page.evaluate(()=>(__game.loop.inventory.wood??0)>=30),await page.evaluate(()=>({...__game.loop.inventory})));
 // Actual neighboring columns: dig down to ferric stone, retain ordinary costs.
 for(let j=0;j<6;j++)for(let k=0;k<3;k++){await page.evaluate(j=>{const g=__game,w=g.solarSystem.activePlanet,t=g.geo.neighbor(g.player.tile,j);g.loop.mineCell(t,w.columns.groundLayerBelow(t,w.layers.bounds[0]));},j);await sleep(200);}
 check('Mining supplies stone and iron for progression',await page.evaluate(()=>__game.loop.inventory.stone>=14&&__game.loop.inventory.iron_ore>=2),await page.evaluate(()=>({...__game.loop.inventory})));
 for(const kind of ['campfire','furnace','workbench'])check(`Place ${kind} with gathered materials`,await page.evaluate(kind=>!!__game.loop.placeStructure(kind,__game.player.tile),kind));
 for(const id of ['smelt_iron','smelt_iron','orbital_thruster','hunting_spear'])check(`Craft ${id} through actual station policy`,await page.evaluate(id=>__game.loop.craft(id),id));
 check('Starfarer earned before leaving Aurelia',await page.evaluate(()=>__game.player.hasOrbitalThruster&&__game.loop.planeCrafted));
 await end('gather-and-craft');}
 // Surface dwell/real walking on each world, then physical cruise to the next.
 const currentId=await page.evaluate(()=>Number(__game.solarSystem.activePlanet.config.id.slice(-1)));
 const destination=process.argv.find(a=>a.startsWith('--destination='))?.split('=')[1];
 const route=launchOnly?[destination?Number(destination.replace('planet-','')):currentId]:[currentId,...[0,1,2,3,4,5].filter(id=>id!==currentId),currentId];
 for(const [routeIndex,id] of route.entries()){
  if(launchOnly||routeIndex>0||!await page.evaluate(()=>__game.player.grounded)){
   let profiler;
   if(process.argv.includes('--trace-launch')){await page.tracing.start({path:`${out}/launch-trace.json`,categories:['devtools.timeline','v8','blink.user_timing','toplevel']});await sleep(1000);report.instrumented=true;}
   if(process.argv.includes('--profile-launch')){profiler=await page.createCDPSession();await profiler.send('Profiler.enable');await profiler.send('Profiler.start');report.instrumented=true;}
   await begin();
   await page.evaluate(id=>{const g=__game;if(g.player.mode!=='plane')g.loop.planeButton();__pilot.walk=false;__pilot.flight=false;__pilot.climb=true;},id);
   await page.waitForFunction(()=>__game.player.inSpaceCruise,{timeout:90000});
   await page.evaluate(id=>{const g=__game,s=g.solarSystem.activePlanet.config,t=g.solarSystem.planetById.get(`planet-${id}`).config;__pilot.climb=false;__pilot.flight=true;__pilot.target=t.solarPosition.map((v,k)=>v-s.solarPosition[k]);},id);
   await page.waitForFunction(id=>__game.solarSystem.activePlanet.config.id===`planet-${id}`&&!__game.solarSystem.travelState.pending,{timeout:120000},id);
   await page.evaluate(()=>{const g=__game;__pilot.orbitSite=g.sites[0].direction;});
   await page.waitForFunction(()=>{const u=__game.player.up();return u.reduce((s,v,k)=>s+v*__pilot.orbitSite[k],0)>Math.cos(.15);},{timeout:240000});
   await page.evaluate(()=>{const g=__game,w=g.solarSystem.activePlanet,t=g.geo.tileOf(...g.sites[0].direction),r=w.layers.topRadius(w.columns.topLayerOf(t));__pilot.orbitSite=null;__pilot.target=g.sites[0].direction.map(v=>v*r);});
   await page.waitForFunction(()=>__game.player.altitudeAGL()<45,{timeout:120000});
   await page.evaluate(()=>{__pilot.flight=false;if(__game.player.mode==='plane')__game.loop.planeButton();});
   await page.waitForFunction(()=>__game.player.grounded,{timeout:60000});await end(`physical-flight-to-${id}`);
   if(profiler){const{profile}=await profiler.send('Profiler.stop');await writeFile(`${out}/launch.cpuprofile`,JSON.stringify(profile));await profiler.detach();}
   if(process.argv.includes('--trace-launch'))await page.tracing.stop();
  }
  if(launchOnly)break;
  if(id===0 && await page.evaluate(()=>(__game.loop.inventory.cooked_meat??0)<4)) {
    await begin();
    for(let hunt=0;hunt<3;hunt++) {
      const animalId=await page.evaluate(()=>{const g=__game,p=g.player;const animal=g.wildlife.population.residents.filter(c=>c.hp>0&&['mantleback','reedrunner','ridgehook'].includes(c.species)).sort((a,b)=>Math.hypot(a.position.x-p.px,a.position.y-p.py,a.position.z-p.pz)-Math.hypot(b.position.x-p.px,b.position.y-p.py,b.position.z-p.pz))[0];__pilot.huntId=animal.id;__pilot.walk=true;return animal.id;});
      let killed=false;
      for(let attempt=0;attempt<200&&!killed;attempt++) {
        killed=await page.evaluate(id=>{const g=__game,p=g.player,c=g.wildlife.population.residents.find(c=>c.id===id),d=c.position.clone().sub({x:p.px,y:p.py,z:p.pz});if(d.length()>7.8)return false;d.normalize();const result=g.wildlife.strikeNearest(p.px,p.py,p.pz,d.x,d.y,d.z,2,7.8);if(result.killed){for(const loot of result.drops)g.loop.inventory[loot.item]=(g.loop.inventory[loot.item]??0)+loot.count;return true;}return false;},animalId);
        await sleep(450);
      }
      check('Earn meat from a nearby live animal',killed);
      await page.evaluate(()=>{__pilot.huntId=null;__pilot.walk=false;});
    }
    check('Build cooking fire from remaining gathered resources',await page.evaluate(()=>!!__game.loop.placeStructure('campfire',__game.player.tile)));
    for(let meal=0;meal<6;meal++)check('Cook earned meat at the new fire',await page.evaluate(()=>__game.loop.craft('roast_meat')));
    await end('hunt-and-cook');
  }
  await begin(); await page.evaluate(()=>{__pilot.target=null;__pilot.walk=false;if(__game.player.hunger<70)__game.loop.consumeFood();});
  await page.keyboard.down('w'); await page.keyboard.down('Space'); await sleep(15000); await page.keyboard.up('Space'); await page.keyboard.up('w');await sleep(45000);
  const state=await page.evaluate(()=>({id:__game.solarSystem.activePlanet.config.id,health:__game.player.health,hunger:__game.player.hunger,shield:__game.player.suitShield,inventory:{...__game.loop.inventory}}));
  check(`Alive after world ${id} walk/dwell`,state.health>0&&state.id===`planet-${id}`,state); await end(`world-${id}-minute`);
  await save();
 }
 check('No renderer errors/warnings',!report.errors.length&&!report.warnings.length,{errors:report.errors,warnings:report.warnings});report.passed=true;
}catch(e){report.passed=false;report.failure=String(e);console.log(report.failure);}
finally{if(!page.isClosed()){report.latePipelines=await page.evaluate(()=>window.__latePipelines??[]).catch(()=>[]);report.uploadFrames=await page.evaluate(()=>window.__uploadFrames??[]).catch(()=>[]);report.slowBackend=await page.evaluate(()=>window.__slowBackend??[]).catch(()=>[]);report.renderOutliers=await page.evaluate(()=>window.__renderOutliers??[]).catch(()=>[]);}await save().catch(()=>{});await browser.close();report.completedAt=new Date().toISOString();await save();}
if(!report.passed)process.exitCode=1;
