import { describe,expect,it } from 'vitest';
import { Scene,Vector3 } from 'three';
import { AureliaFaunaPopulation,faunaEnvironmentFor,faunaZones,type FaunaSurface,type FaunaZone } from '../src/world/aureliaFauna';
import { buildSolarSystemConfigs } from '../src/world/planetConfig';
import { Goldberg } from '../src/geo/goldberg';
import { Terrain } from '../src/world/terrain';
import { Columns } from '../src/world/columns';
import { buildLayers } from '../src/world/layers';
import { AureliaFauna } from '../src/render/aureliaFauna';

function plain(radius=100):FaunaSurface {
  return {radius:100,waterRadius:98,sample(_d,out){out.radius=radius;out.biome='coast';out.tile=0;}};
}
const zone:FaunaZone={id:'shore',direction:[0,1,0],species:'reedrunner'};

describe('fauna environmental eligibility',()=>{
  it('leaves Aurelia and unversioned populations unchanged while disabling new vacuum fauna',()=>{
    const configs=buildSolarSystemConfigs('habitable');
    const original=new AureliaFaunaPopulation('same',plain(),faunaZones([]));
    const aurelia=new AureliaFaunaPopulation('same',{...plain(),...faunaEnvironmentFor(configs[0])},faunaZones([]));
    expect(aurelia.exportState()).toEqual(original.exportState());
    expect(faunaEnvironmentFor({...configs[1],expeditionRecipe:undefined}).nativeFauna).toBe(true);
    const vacuum=new AureliaFaunaPopulation('same',{...plain(),...faunaEnvironmentFor(configs[1])},faunaZones([zone]));
    expect(vacuum.residents).toHaveLength(0);expect(vacuum.update(.1,{px:0,py:100,pz:0})).toBe(0);
    expect(vacuum.active).toHaveLength(0);
  });

  it('never creates fish or shallow-wading land residents on molten surface, including explicit zones',()=>{
    const environment=faunaEnvironmentFor(buildSolarSystemConfigs('molten')[4]);
    const fish=new AureliaFaunaPopulation('fish',plain(94),faunaZones([]));
    expect(fish.residents.length).toBeGreaterThan(0);
    for(const height of [94,97.8,98.1]) {
      const molten={...plain(height),...environment};
      expect(new AureliaFaunaPopulation('molten',molten,faunaZones([])).residents).toHaveLength(0);
      expect(new AureliaFaunaPopulation('molten',molten,[zone,{...zone,id:'fish',species:'ribbonfin'}]).residents).toHaveLength(0);
    }
    const refuge=new AureliaFaunaPopulation('molten',{...plain(100),...environment},[zone]);
    expect(refuge.residents.length).toBeGreaterThan(0);
    expect(refuge.residents.every(c=>c.species!=='ribbonfin'&&c.position.length()>98.2)).toBe(true);
  });

  it('rejects movement and restored positions across a shallow molten boundary',()=>{
    let shore=0, split=false;
    const environment=faunaEnvironmentFor(buildSolarSystemConfigs('molten')[4]);
    const surface:FaunaSurface={radius:100,waterRadius:100,...environment,sample(d,out){
      out.radius=split&&d.x/d.length()>shore?99.9:100.3;out.biome='coast';out.tile=0;
    }};
    const population=new AureliaFaunaPopulation('boundary',surface,[zone]),c=population.residents[0];
    for(const other of population.residents.slice(1))other.hp=0;
    // A .4m downward step is allowed for waders in ordinary water. Molten
    // terrain must reject it independently of the normal step/wading rules.
    const up=c.position.clone().normalize(),heading=new Vector3(1,0,0).addScaledVector(up,-up.x).normalize();
    c.forward.copy(heading);c.headingTarget.copy(heading);c.behavior='forage';c.timer=100;c.speed=1;
    shore=up.x+.00005;split=true;
    const before=c.position.clone(),player={px:before.x+20,py:before.y,pz:before.z};
    population.update(.05,player);
    expect(c.position.toArray()).toEqual(before.toArray());expect(c.speed).toBe(0);
    const saved=population.exportState(),entry=saved.residents.find(r=>r.id===c.id)!;
    entry.position=before.clone().addScaledVector(heading,2).normalize().multiplyScalar(99.9).toArray() as [number,number,number];
    population.importState(saved);
    expect(c.position.toArray()).toEqual(before.toArray());
    for(let i=0;i<100;i++){c.timer=0;population.update(.1,player);expect(c.behavior).not.toBe('drink');}
  });

  it('wires the actual new moon and volcanic renderer surfaces to those population rules',()=>{
    const geo=new Goldberg(24),configs=buildSolarSystemConfigs('GP192-01');
    for(const index of [1,4]) {
      const config=configs[index],terrain=new Terrain(config),layers=buildLayers(config),columns=new Columns(geo,layers,terrain);
      const fauna=new AureliaFauna(new Scene(),geo,columns,terrain);
      try {
        if(index===1){expect(fauna.population.residents).toHaveLength(0);expect(fauna.group.children).toHaveLength(0);}
        else {
          expect(fauna.population.residents.length).toBeGreaterThan(0);
          expect(fauna.population.residents.every(c=>c.species!=='ribbonfin'&&c.position.length()>=layers.waterSurface+.2)).toBe(true);
        }
      }finally{fauna.dispose();}
    }
  });
});
