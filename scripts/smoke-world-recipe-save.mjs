/** Disposable-profile integration proof for the actual main.ts save migration.
 * Fixtures use the current, unchanged Aurelia v2 topology; no user save is read. */
import puppeteer from 'puppeteer-core';
import { mkdir,writeFile } from 'node:fs/promises';

const origin=process.argv[2]??'http://127.0.0.1:5199';
const seed='world-recipe-migration-smoke',baseKey=`goldberg-planet:v4:m48:${seed}`;
const oldKey=`${baseKey}:aurelia-v2:survival`,newKey=`${baseKey}:worlds-v3:survival`,creativeKey=`${baseKey}:worlds-v3:creative`;
const output=new URL('../output/world-recipe-save-smoke/',import.meta.url);await mkdir(output,{recursive:true});
const report={origin,seed,scope:'Native main boot/reload migration in an isolated temporary Chrome profile; fixture saves only, no existing user data or performance claim.',bundles:[],checks:[],errors:[],warnings:[]};
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run']});
const check=(label,ok,detail)=>{report.checks.push({label,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)throw new Error(label);};
try {
  const page=await browser.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>report.errors.push(String(error)));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warn')report.warnings.push(message.text());});
  await page.setViewport({width:1280,height:720,deviceScaleFactor:1});
  const url=new URL(origin);url.search=`?m=48&mode=survival&mute=1&clouds=0&nosave=1&seed=${seed}`;
  const ready=async mode=>{
    await page.waitForFunction(mode=>window.__game?.gameMode===mode&&!document.getElementById('splash'),{timeout:120000},mode);
    report.bundles.push(await page.$$eval('script[src]',elements=>elements.map(e=>new URL(e.src).pathname)));
  };
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await ready('survival');
  const fixture=await page.evaluate(({seed,oldKey})=>{
    const game=__game,home=game.solarSystem.planets[0],foreign=game.solarSystem.planets[1];
    const treeTiles=game.expedition.trees.map(tree=>tree.tile).filter(tile=>home.trees.hasTree(tile)).slice(0,3);
    if(treeTiles.length<3)throw new Error('Fixture needs three known live home trees');
    const editTile=23,editLayer=home.columns.topLayerOf(editTile);
    if(!home.columns.mine(editTile,editLayer))throw new Error('Fixture home mining failed');
    home.trees.chopped.add(treeTiles[0]);home.trees.chopProgress.set(treeTiles[1],1);
    home.columns.seededEcoTiles.add(24);
    const foreignTop=foreign.columns.topLayerOf(25);foreign.columns.mine(25,foreignTop);
    foreign.trees.chopped.add(26);foreign.columns.seededEcoTiles.add(27);
    game.structureStore.place({id:'fixture-home-camp',planetId:home.config.id,kind:'campfire',anchorTile:game.expedition.spawnTile,
      offsetEast:8,offsetNorth:0,groundRadius:home.layers.topRadius(home.columns.topLayerOf(game.expedition.spawnTile))});
    game.structureStore.place({id:'fixture-old-foreign-camp',planetId:foreign.config.id,kind:'workbench',anchorTile:25,
      groundRadius:foreign.layers.topRadius(foreignTop)});
    const delta=planet=>({choppedTrees:[...planet.trees.chopped],treeChopProgress:[...planet.trees.chopProgress].map(([tile,progress])=>({tile,progress})),
      columnEdits:planet.columns.exportEdits(),seededEcoTiles:[...planet.columns.seededEcoTiles],drops:[]});
    const appearance={version:1,outfit:'reed',hair:'braid',headgear:'hat',pack:'satchel',skin:'deep',hairColor:'silver',stature:1.02};
    const inventory={wood:43,stone:12,orbital_thruster:1,cooked_meat:2};
    const homeFauna=game.faunaByPlanet.get(home.config.id).exportState();
    homeFauna.residents[0].observed=true;homeFauna.residents[0].familiarity=.35;
    const source={version:4,seed,frequency:48,savedAt:1,mode:'survival',activePlanetId:foreign.config.id,
      player:{px:foreign.config.radius+70,py:2,pz:3,vx:111,vy:22,vz:-33,fwdX:0,fwdY:1,fwdZ:0,pitch:.5,mode:'fly',tile:25,throttle:200,holdAGL:70,planeSpeed:220},
      inventory,planeCrafted:true,choppedTrees:[26],treeChopProgress:[],drops:[],appearance,
      structures:game.structureStore.exportAll(),journal:{version:1,visitedSites:['shore-camp']},
      planetDeltas:{'planet-0':delta(home),'planet-1':delta(foreign)},faunaByPlanet:{'planet-0':homeFauna}};
    const raw=JSON.stringify(source);localStorage.setItem(oldKey,raw);
    return {raw,source,treeTiles,editTile,editLayer,homeAnimalId:homeFauna.residents[0].id};
  },{seed,oldKey});
  url.searchParams.delete('nosave');
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await ready('survival');
  const homeState=await page.evaluate(fixture=>{
    const game=__game,home=game.solarSystem.planets[0],p=game.player,spawn=game.expedition.spawnTile,c=game.geo.centers,r=home.layers.topRadius(home.columns.topLayerOf(spawn));
    const animal=game.wildlife.exportState().residents.find(c=>c.id===fixture.homeAnimalId);
    return {planet:game.solarSystem.activePlanet.config.id,mode:p.mode,speed:Math.hypot(p.vx,p.vy,p.vz),
      distanceToSpawn:Math.hypot(p.px-c[spawn*3]*r,p.py-c[spawn*3+1]*r,p.pz-c[spawn*3+2]*r),
      inventory:game.loop.inventory,appearance:game.character.getAppearance(),structures:game.structureStore.exportAll().map(s=>s.id),
      edits:home.columns.exportEdits(),chopped:home.trees.chopped.has(fixture.treeTiles[0]),partial:home.trees.chopProgress.get(fixture.treeTiles[1]),
      seeded:home.columns.seededEcoTiles.has(24),animal:{observed:animal.observed,familiarity:animal.familiarity}};
  },fixture);
  check('Foreign old save relocates safely to Aurelia on actual boot',homeState.planet==='planet-0'&&homeState.mode==='walk'&&homeState.speed<2&&homeState.distanceToSpawn<2,homeState);
  check('Aurelia edits, trees, camp, kit, appearance and fauna survive carry-forward',
    JSON.stringify(homeState.inventory)===JSON.stringify(fixture.source.inventory)&&JSON.stringify(homeState.appearance)===JSON.stringify(fixture.source.appearance)&&
    JSON.stringify(homeState.edits)===JSON.stringify(fixture.source.planetDeltas['planet-0'].columnEdits)&&homeState.chopped&&homeState.partial===1&&homeState.seeded&&
    homeState.structures.length===1&&homeState.structures[0]==='fixture-home-camp'&&homeState.animal.observed&&homeState.animal.familiarity===.35);
  await page.waitForFunction(key=>!!localStorage.getItem(key),{},newKey);
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),newKey);
  const foreignSaved=Object.entries(saved.planetDeltas).filter(([id])=>id!=='planet-0');
  check('New worlds-v3 autosave excludes incompatible foreign edits and structures',saved.version===4&&saved.mode==='survival'&&saved.activePlanetId==='planet-0'&&
    foreignSaved.every(([,d])=>!d.columnEdits.length&&!d.choppedTrees.length&&!d.treeChopProgress.length&&!d.seededEcoTiles.length&&!d.drops.length)&&
    saved.structures.every(s=>s.planetId==='planet-0'),{key:newKey,foreignWorlds:foreignSaved.length});
  check('Original v2 JSON remains byte-for-byte unchanged',await page.evaluate(({oldKey,raw})=>localStorage.getItem(oldKey)===raw,{oldKey,raw:fixture.raw}));
  // Change current progress; beforeunload must save it and the next normal boot
  // must prefer worlds-v3 over the still-present old migration source.
  await page.evaluate(tile=>{__game.loop.inventory.wood=77;__game.solarSystem.activePlanet.trees.chopped.add(tile);},fixture.treeTiles[2]);
  await page.reload({waitUntil:'domcontentloaded',timeout:60000});await ready('survival');
  check('Normal reload keeps newer progress instead of reimporting v2',await page.evaluate(tile=>__game.loop.inventory.wood===77&&__game.solarSystem.activePlanet.trees.chopped.has(tile),fixture.treeTiles[2]));
  url.searchParams.set('mode','creative');
  await page.goto(url.href,{waitUntil:'domcontentloaded',timeout:60000});await ready('creative');
  await page.waitForFunction(key=>!!localStorage.getItem(key),{},creativeKey);
  const separate=await page.evaluate(({newKey,creativeKey,oldKey,raw})=>({mode:__game.gameMode,wood:__game.loop.inventory.wood,camps:__game.structureStore.byId.size,
    outfit:__game.character.getAppearance().outfit,survivalWood:JSON.parse(localStorage.getItem(newKey)).inventory.wood,
    creativeMode:JSON.parse(localStorage.getItem(creativeKey)).mode,originalUnchanged:localStorage.getItem(oldKey)===raw}),{newKey,creativeKey,oldKey,raw:fixture.raw});
  check('Creative remains a separate save and leaves Survival and original v2 intact',separate.mode==='creative'&&separate.wood===999&&separate.camps===0&&
    separate.outfit==='field'&&separate.survivalWood===77&&separate.creativeMode==='creative'&&separate.originalUnchanged,separate);
  if(report.errors.length||report.warnings.length)throw new Error('Browser errors or warnings');
}catch(error){process.exitCode=1;report.failure=String(error);report.stack=error.stack;}
finally{await browser.close();await writeFile(new URL('checks.json',output),JSON.stringify(report,null,2),'utf8');console.log(JSON.stringify(report,null,2));}
