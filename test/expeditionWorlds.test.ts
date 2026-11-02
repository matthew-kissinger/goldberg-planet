import { describe, expect, it, vi } from 'vitest';
import { Goldberg } from '../src/geo/goldberg';
import { buildSolarSystemConfigs, makeDefaultPlanetConfig } from '../src/world/planetConfig';
import { ExpeditionWorld, worldSites } from '../src/world/expeditionWorlds';
import { Terrain, MAT } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { Trees } from '../src/world/trees';
import { createMeshWorkerHandler } from '../src/world/meshWorker';
import { enumerateChunks,chunkKeyOfTile } from '../src/world/chunks';
import { buildChunkMesh } from '../src/render/mesher';

function direction(i:number,count:number):[number,number,number] {
  const y=1-2*(i+.5)/count,r=Math.sqrt(1-y*y),angle=i*2.399963229728653;
  return [Math.cos(angle)*r,y,Math.sin(angle)*r];
}
const configs=buildSolarSystemConfigs('GP192-01').slice(1);
const legacyMethods=['heightShattered','heightCanyon','heightCryo','heightVolcanic','heightBiolum'];

describe('five whole-sphere expedition worlds',()=>{
  it.each(configs.map((config,index)=>({config,index})))('$config.name covers its globe with distinct bounded habitats without legacy fallback',({config,index})=>{
    const terrain=new Terrain(config), world=terrain.expeditionWorld!, biomes=new Map<string,number>();
    const spy=vi.spyOn(terrain as unknown as Record<string,(x:number,y:number,z:number)=>number>,legacyMethods[index]).mockImplementation(()=>{throw new Error('legacy fallback');});
    let water=0,land=0,min=Infinity,max=-Infinity;
    for(let i=0;i<4096;i++) {
      const d=direction(i,4096),h=terrain.heightAt(...d),m=terrain.moistureAt(...d),f=terrain.forestAt(...d),b=world.biomeAt(...d);
      min=Math.min(min,h);max=Math.max(max,h);biomes.set(b,(biomes.get(b)??0)+1);
      expect(h).toBeGreaterThan(config.heightMin);expect(h).toBeLessThan(config.heightMax);
      expect(m).toBeGreaterThanOrEqual(0);expect(m).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0);expect(f).toBeLessThanOrEqual(1);
      if(h<config.waterSurfaceOffset)water++;else land++;
    }
    expect([...biomes.keys()].sort()).toEqual(worldSites(config).map(site=>site.biome).sort());
    for(const count of biomes.values())expect(count).toBeGreaterThan(35);
    expect(max-min).toBeGreaterThan(23);expect(land).toBeGreaterThan(1200);
    if(config.ocean.hasOcean)expect(water).toBeGreaterThan(180);else expect(water).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each(configs)('$name has three stable land sites, a daylight arrival, and walkable camp approaches',config=>{
    const world=new ExpeditionWorld(config),sites=worldSites(config),layers=buildLayers(config);
    expect(sites).toBe(worldSites(config));expect(sites).toHaveLength(3);
    const arrival=sites[0].direction;expect(arrival[0]*.62+arrival[1]*.55+arrival[2]*.56).toBeGreaterThan(.8);
    expect(sites.some(site=>site.direction[1]<0)).toBe(true);
    for(const site of sites) {
      const [x,y,z]=site.direction, el=Math.hypot(x,z),tx=z/el,tz=-x/el;
      expect(Math.hypot(x,y,z)).toBeCloseTo(1,12);expect(world.biomeAt(x,y,z)).toBe(site.biome);
      expect(world.heightAt(x,y,z)).toBeGreaterThan(config.waterSurfaceOffset+2);
      expect(world.clearingAt(x,y,z)).toBe(1);
      for(let bearing=0;bearing<8;bearing++) {
        const co=Math.cos(bearing*Math.PI/4),si=Math.sin(bearing*Math.PI/4);
        const ax=tx*co+y*tz*si,ay=(z*tx-x*tz)*si,az=tz*co-y*tx*si;
        let previous=0;
        for(let metres=-35;metres<=35;metres+=2.5) {
          const px=x*config.radius+ax*metres,py=y*config.radius+ay*metres,pz=z*config.radius+az*metres,inv=1/Math.hypot(px,py,pz);
          const h=world.heightAt(px*inv,py*inv,pz*inv),top=layers.topRadius(layers.layerOfRadius(config.radius+h));
          expect(h,site.name).toBeGreaterThan(config.waterSurfaceOffset+2);
          if(metres>-35)expect(Math.abs(top-previous),site.name).toBeLessThanOrEqual(.6250001);
          previous=top;
        }
      }
    }
  });

  it('round-trips worker config exactly, changes with seed and keeps globally unique site IDs',()=>{
    const ids=new Set<string>();
    for(const config of configs) {
      const a=new Terrain(config),b=new Terrain(JSON.parse(JSON.stringify(config))),other=new Terrain({...config,seed:`${config.seed}:changed`});let changed=0;
      expect(worldSites(b.config)).toEqual(worldSites(config));
      for(const site of worldSites(config)){expect(ids.has(site.id)).toBe(false);ids.add(site.id);}
      for(let i=0;i<256;i++) {
        const d=direction(i,256),h=a.heightAt(...d);
        expect(b.heightAt(...d)).toBe(h);expect(b.moistureAt(...d)).toBe(a.moistureAt(...d));expect(b.forestAt(...d)).toBe(a.forestAt(...d));
        expect(b.expeditionWorld!.biomeAt(...d)).toBe(a.expeditionWorld!.biomeAt(...d));expect(b.surfaceMaterial(h,...d)).toBe(a.surfaceMaterial(h,...d));
        if(other.heightAt(...d)!==h)changed++;
      }
      expect(changed).toBeGreaterThan(240);
    }
  });

  it('uses actual liquid offsets for shore material and removes legacy column features only in new recipes',()=>{
    const geo=new Goldberg(8);
    for(const config of configs) {
      const terrain=new Terrain({...config,hasFloatingIslands:true}),layers=buildLayers(config),columns=new Columns(geo,layers,terrain);
      expect(config.layerH).toBe(.625);expect(config.hasFloatingIslands).toBe(false);expect(config.hasFlowingRivers).toBe(false);
      for(let tile=0;tile<12;tile++) {
        const d=geo.centers.subarray(tile*3,tile*3+3);
        expect(columns.heightOf(tile)).toBeCloseTo(terrain.heightAt(d[0],d[1],d[2]),4);
        expect(columns.pentagonWonderOf(tile)).toMatchObject({heightDelta:0,ringLevel:-1,updraftAccel:0});expect(columns.skyIslandRange(tile)).toBeNull();
      }
      if(config.ocean.hasOcean) {
        const sea=config.waterSurfaceOffset;
        expect(terrain.surfaceMaterial(sea-3)).toBe(config.archetype==='volcanic'?MAT.BASALT:MAT.SEABED);
        expect(terrain.surfaceMaterial(sea+.5)).toBe(config.archetype==='volcanic'?MAT.MAGMA:config.archetype==='cryo'?MAT.ICE:MAT.SAND);
      }
      const legacy=new Terrain({...config,expeditionRecipe:undefined,layerH:1.25,hasFloatingIslands:true});
      expect(legacy.expeditionWorld).toBeNull();expect(worldSites(legacy.config)).toEqual([]);
      const legacyColumns=new Columns(geo,buildLayers(legacy.config),legacy);
      expect(legacyColumns.pentagonWonderOf(0).ringLevel).toBe(0);
    }
    const classic=new Terrain(makeDefaultPlanetConfig('classic'));
    expect(classic.aurelia).toBeNull();expect(classic.expeditionWorld).toBeNull();expect(classic.config.layerH).toBe(1.25);
    const aurelia=new Terrain(buildSolarSystemConfigs('GP192-01')[0]);expect(aurelia.aurelia).not.toBeNull();expect(aurelia.expeditionWorld).toBeNull();
  });

  it.each(['GP192-01','field-expedition','another-system'])('keeps primary and secondary materials reachable in the %s world fields',seed=>{
    for(const config of buildSolarSystemConfigs(seed).slice(1)) {
      const terrain=new Terrain(config),counts=new Map<number,number>();let woodyLand=0;
      for(let i=0;i<4096;i++) {
        const d=direction(i,4096),h=terrain.heightAt(...d),mat=terrain.surfaceMaterial(h,...d);
        counts.set(mat,(counts.get(mat)??0)+1);
        if(h>config.waterSurfaceOffset+1&&terrain.forestAt(...d)>.05)woodyLand++;
      }
      const required=config.archetype==='shattered'?[MAT.CRYSTAL,MAT.ROCK]:config.archetype==='canyon'?[MAT.TERRACOTTA]:
        config.archetype==='cryo'?[MAT.ICE,MAT.CRYSTAL]:config.archetype==='volcanic'?[MAT.MAGMA,MAT.BASALT]:[MAT.MYCELIUM,MAT.CRYSTAL];
      for(const material of required)expect(counts.get(material)??0,`${config.name} material ${material}`).toBeGreaterThan(3);
      if(config.survival.secondaryResource==='wood')expect(woodyLand,config.name).toBeGreaterThan(100);
    }
  });

  it.each(configs)('$name creates byte-identical worker geometry after mining and ecosystem edits',config=>{
    const geo=new Goldberg(8),layers=buildLayers(config),terrain=new Terrain(config),columns=new Columns(geo,layers,terrain),trees=new Trees(geo,columns,terrain,config.seed);
    const tile=geo.tileOf(...worldSites(config)[0].direction),chunk=enumerateChunks(geo).get(chunkKeyOfTile(geo,tile))!;
    columns.mine(tile,columns.topLayerOf(tile));columns.seedEcosystem(chunk.tiles[0],false);trees.chopped.add(chunk.tiles[1]);
    const handler=createMeshWorkerHandler();
    handler({type:'init_planet',planetId:config.id,m:geo.m,config:JSON.parse(JSON.stringify(config)),edits:columns.exportEdits(),seededEcoTiles:[...columns.seededEcoTiles],choppedTrees:[...trees.chopped]});
    const worker=handler({type:'build_chunk',reqId:1,planetId:config.id,chunkKey:chunk.key})!.mesh!,direct=buildChunkMesh(chunk,geo,layers,columns,trees)!;
    expect(worker.triangles).toBe(direct.triangles);expect(worker.anchor).toEqual(direct.anchor);
    for(const attr of ['positions','normals','colors','packedMat'] as const)expect(Buffer.from(worker[attr].buffer).equals(Buffer.from(direct[attr].buffer)),attr).toBe(true);
  });
});
