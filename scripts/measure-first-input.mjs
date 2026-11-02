import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const folder=resolve(process.argv[2]??'output/performance/first-input');
const profile=process.argv.includes('--profile');
await mkdir(folder,{recursive:true});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
  const page=await browser.newPage();await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
    window.__inputEvidence={events:[],frames:[],tasks:[],active:false}; let previous=0;
    addEventListener('keydown',event=>window.__inputEvidence.events.push({key:event.key,start:performance.now()}),true);
    new PerformanceObserver(list=>{if(window.__inputEvidence.active)for(const e of list.getEntries())window.__inputEvidence.tasks.push({start:e.startTime,duration:e.duration});}).observe({type:'longtask'});
    requestAnimationFrame(function frame(now){if(window.__inputEvidence.active&&previous)window.__inputEvidence.frames.push(now-previous);previous=now;requestAnimationFrame(frame);});
  });
  await page.goto('http://127.0.0.1:5199/?mode=creative&mute=1&nosave=1&seed=journal-ui-smoke');
  await page.waitForFunction(()=>window.__game&&!document.getElementById('splash'),{timeout:120000});
  await wait(2000);
  const client=await page.createCDPSession();
  if(profile){await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:500});await client.send('Profiler.start');}
  await page.evaluate(()=>{window.__inputEvidence.active=true;});
  await page.keyboard.down('w');await wait(1000);await page.keyboard.up('w');await wait(300);
  await page.keyboard.down('w');await wait(1000);await page.keyboard.up('w');
  if(profile){const result=await client.send('Profiler.stop');await writeFile(resolve(folder,'first-key.cpuprofile'),JSON.stringify(result.profile));}
  const result=await page.evaluate(()=>{const data=window.__inputEvidence;data.active=false;return{...data,bundle:[...document.scripts].map(s=>s.src).find(s=>s.includes('/assets/index-'))};});
  await writeFile(resolve(folder,'results.json'),JSON.stringify({...result,profile},null,2));
  console.log(JSON.stringify({folder,profile,events:result.events,tasks:result.tasks,maxFrame:Math.max(...result.frames),over50:result.frames.filter(f=>f>50).length}));
}finally{await browser.close();}
