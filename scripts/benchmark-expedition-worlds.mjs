/** CPU field comparison only; does not measure rendering, streaming or FPS. */
import { createServer } from 'vite';
import { mkdir,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';
import { cpus,platform,release,totalmem } from 'node:os';
const output=resolve(process.argv[2]??'output/performance/expedition-worlds-sampler.json');
const server=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom',logLevel:'error'});
try {
  const {Terrain}=await server.ssrLoadModule('/src/world/terrain.ts');
  const {buildSolarSystemConfigs}=await server.ssrLoadModule('/src/world/planetConfig.ts');
  const {worldSites}=await server.ssrLoadModule('/src/world/expeditionWorlds.ts');
  const count=50000,dirs=new Float64Array(count*3);
  for(let i=0;i<count;i++){const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),a=i*2.399963229728653;dirs.set([Math.cos(a)*r,y,Math.sin(a)*r],i*3);}
  const measure=terrain=>{let checksum=0;const start=performance.now();for(let i=0;i<count;i++){
    const x=dirs[i*3],y=dirs[i*3+1],z=dirs[i*3+2],h=terrain.heightAt(x,y,z);
    checksum+=h+terrain.surfaceMaterial(h,x,y,z)+terrain.moistureAt(x,y,z)+terrain.forestAt(x,y,z);
  }return{elapsedMs:performance.now()-start,checksum};};
  const worlds=[];
  for(const config of buildSolarSystemConfigs('GP192-01').slice(1)){
    const current=new Terrain(config),legacy=new Terrain({...config,expeditionRecipe:undefined,layerH:1.25});
    measure(current);measure(legacy);
    const runs=[];for(let i=0;i<3;i++)runs.push({current:measure(current),legacy:measure(legacy)});
    const biomes={},materials={},heights=[];let water=0;
    for(let i=0;i<count;i++){
      const x=dirs[i*3],y=dirs[i*3+1],z=dirs[i*3+2],h=current.heightAt(x,y,z),b=current.expeditionWorld.biomeAt(x,y,z),m=current.surfaceMaterial(h,x,y,z);
      biomes[b]=(biomes[b]??0)+1;materials[m]=(materials[m]??0)+1;heights.push(h);if(h<config.waterSurfaceOffset)water++;
    }
    heights.sort((a,b)=>a-b);
    worlds.push({name:config.name,archetype:config.archetype,seed:config.seed,recipe:config.expeditionRecipe,runs,biomes,materials,waterFraction:water/count,
      height:{min:heights[0],median:heights[count/2],max:heights.at(-1)},sites:worldSites(config).map(site=>({...site,height:current.heightAt(...site.direction),moisture:current.moistureAt(...site.direction),biome:current.expeditionWorld.biomeAt(...site.direction)}))});
  }
  const report={measuredAt:new Date().toISOString(),scope:'CPU height + surface material + moisture + forest at identical 50000 global directions per pass. Legacy means same config without recipe. Concurrent agent work may affect times; not an isolated frame-rate benchmark.',
    environment:{node:process.version,platform:platform(),release:release(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem()},count,worlds};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2),'utf8');
  console.log(JSON.stringify({output,worlds:worlds.map(w=>({name:w.name,runs:w.runs,biomes:w.biomes,waterFraction:w.waterFraction,height:w.height}))},null,2));
}finally{await server.close();}
