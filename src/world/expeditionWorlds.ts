/** Five complete spherical expedition recipes. A small fixed noise budget and
 * precomputed impact centres replace the legacy octave/Voronoi hot paths. All
 * methods sample unit directions without allocating, and share one cached sample. */
import { createNoise3D, type NoiseFunction3D } from 'simplex-noise';
import { hashString, mulberry32 } from '../util/prng';
import type { PlanetArchetype, PlanetConfig } from './planetConfig';

export type WorldBiome = 'regolith' | 'crater' | 'rift' | 'mesa' | 'dune' | 'oasis'
  | 'ice_shelf' | 'fjord' | 'spire' | 'basalt' | 'caldera' | 'ash_refuge'
  | 'fungal_forest' | 'lagoon' | 'atoll';
export interface WorldSite { id: string; name: string; biome: WorldBiome; direction: [number, number, number]; description: string }
type Kind = Exclude<PlanetArchetype, 'terran'>;
interface SiteDef { id: string; name: string; biome: WorldBiome; height: number; description: string }
const DEFINITIONS: Record<Kind, readonly SiteDef[]> = {
  shattered: [
    { id: 'vespera-quiet-basin', name: 'Quiet Basin', biome: 'regolith', height: 12, description: 'An open silver plain inside the old impact field, with dark crater rims on the horizon.' },
    { id: 'vespera-ringfall', name: 'Ringfall Basin', biome: 'crater', height: 5, description: 'Follow a gentle breach into the layered bowl of an ancient impact.' },
    { id: 'vespera-glass-rift', name: 'Glass Rift', biome: 'rift', height: 9, description: 'A long fractured seam crosses the moon; pale crystal fans mark its shoulders.' },
  ],
  canyon: [
    { id: 'khoros-windcut', name: 'Windcut Terrace', biome: 'mesa', height: 25, description: 'A broad red-rock bench opens toward eroded mesas and dry winding canyons.' },
    { id: 'khoros-singing-dunes', name: 'Singing Dunes', biome: 'dune', height: -4, description: 'Warm sand gathers below the mesas, leaving sheltered paths between long dune backs.' },
    { id: 'khoros-jade-oasis', name: 'Jade Oasis', biome: 'oasis', height: -14, description: 'A low sheltered terrace borders green water and the sparse shade of an oasis.' },
  ],
  cryo: [
    { id: 'nivara-blue-shelf', name: 'Blue Shelf', biome: 'ice_shelf', height: 8, description: 'A broad snow-covered shelf looks over dark brine channels and distant blue ice.' },
    { id: 'nivara-stillwater', name: 'Stillwater Fjord', biome: 'fjord', height: 4, description: 'A quiet landing shelf follows the edge of a drowned glacial valley.' },
    { id: 'nivara-crown-spires', name: 'Crown Spires', biome: 'spire', height: 31, description: 'A sheltered high bench leads between wind-cut ice towers and glacial domes.' },
  ],
  volcanic: [
    { id: 'pyraxis-cinder-step', name: 'Cinder Step', biome: 'basalt', height: 17, description: 'Cool basalt terraces offer a clear foothold above the slow lava channels.' },
    { id: 'pyraxis-ember-ring', name: 'Ember Ring', biome: 'caldera', height: 12, description: 'A broad break in the caldera rim overlooks layered flows and a molten basin.' },
    { id: 'pyraxis-ash-garden', name: 'Ash Garden', biome: 'ash_refuge', height: 8, description: 'A pale ash terrace shelters heat-adapted growth between the darker lava ridges.' },
  ],
  biolum: [
    { id: 'mycelia-lantern-grove', name: 'Lantern Grove', biome: 'fungal_forest', height: 13, description: 'A dry mycelial terrace winds through tall fungal crowns beside luminous water.' },
    { id: 'mycelia-mirror-lagoon', name: 'Mirror Lagoon', biome: 'lagoon', height: 3.5, description: 'Low pearl shelves circle a sheltered lagoon, with wet fringes and spore gardens.' },
    { id: 'mycelia-pearl-ring', name: 'Pearl Ring', biome: 'atoll', height: 6, description: 'A broad coral-colored rim separates the open sea from the inner lagoon.' },
  ],
};
const FIRST: Record<Kind, readonly [number, number, number]> = {
  shattered: [.70,.55,.45], canyon: [.30,.72,.63], cryo: [.78,.35,.52], volcanic: [.50,.72,.47], biolum: [.38,.40,.83],
};
const CLIMATE: Record<WorldBiome, readonly [number,number]> = {
  regolith:[.02,.035],crater:[.02,.13],rift:[.02,.32],mesa:[.19,.11],dune:[.09,.045],oasis:[.79,.64],
  ice_shelf:[.36,.11],fjord:[.72,.19],spire:[.36,.05],basalt:[.055,.07],caldera:[.055,.025],ash_refuge:[.28,.36],
  fungal_forest:[.75,.91],lagoon:[.94,.16],atoll:[.81,.48],
};
const siteCache = new WeakMap<PlanetConfig, readonly WorldSite[]>();
const smooth = (value: number): number => { const t = Math.max(0, Math.min(1, value)); return t*t*(3-2*t); };
const clamp = (value: number): number => Math.max(0, Math.min(1, value));
function shelf(value: number, height: number): number {
  const level = Math.floor(value / height), fraction = value / height - level;
  return height * (level + smooth((fraction - .24) / .76));
}

export function worldSites(config: PlanetConfig): readonly WorldSite[] {
  if (config.expeditionRecipe !== 'worlds-v3' || config.archetype === 'terran') return [];
  const cached = siteCache.get(config); if (cached) return cached;
  const random = mulberry32(hashString(`${config.seed}:sites-v3`)), base = FIRST[config.archetype];
  const up = [base[0] + (random()-.5)*.10, base[1] + (random()-.5)*.10, base[2] + (random()-.5)*.10];
  const inv = 1/Math.hypot(...up); for (let i=0;i<3;i++) up[i] *= inv;
  const el = Math.hypot(up[0],up[2]), east = [up[2]/el,0,-up[0]/el];
  const north = [up[1]*east[2], up[2]*east[0]-up[0]*east[2], -up[1]*east[0]];
  const result = DEFINITIONS[config.archetype].map((site, index): WorldSite => {
    const polar = [0,1.68,2.68][index], bearing = [.1,1.1,4.2][index] + (random()-.5)*.3;
    const c = Math.cos(polar), a = Math.sin(polar)*Math.cos(bearing), b = Math.sin(polar)*Math.sin(bearing);
    const direction: [number,number,number] = [up[0]*c+east[0]*a+north[0]*b,up[1]*c+east[1]*a+north[1]*b,up[2]*c+east[2]*a+north[2]*b];
    const length = Math.hypot(...direction); for(let i=0;i<3;i++) direction[i] /= length;
    return { id:site.id,name:site.name,biome:site.biome,direction,description:site.description };
  });
  siteCache.set(config,result); return result;
}

export class ExpeditionWorld {
  private readonly n1: NoiseFunction3D; private readonly n2: NoiseFunction3D; private readonly n3: NoiseFunction3D;
  private readonly anchors = new Float64Array(9);
  /** x,y,z, inverse squared angular radius, depth, rim height; six fixed centres. */
  private readonly impacts = new Float64Array(36);
  private readonly axis = new Float64Array(3);
  private readonly kind: Kind;
  private readonly innerDot: number; private readonly outerDot: number;
  private readonly clearingInner: number; private readonly clearingOuter: number;
  private cacheX = Infinity; private cacheY = Infinity; private cacheZ = Infinity;
  private height = 0; private moisture = 0; private forest = 0; private clearing = 0;
  private biome: WorldBiome = 'regolith';

  constructor(readonly config: PlanetConfig) {
    if(config.archetype === 'terran') throw new Error('Aurelia uses its own world recipe');
    this.kind = config.archetype;
    const seed = hashString(`${config.seed}:worlds-v3`), random = mulberry32(seed);
    this.n1=createNoise3D(mulberry32(seed^0x6a09e667)); this.n2=createNoise3D(mulberry32(seed^0xbb67ae85)); this.n3=createNoise3D(mulberry32(seed^0x3c6ef372));
    for(const [i,site] of worldSites(config).entries()) this.anchors.set(site.direction,i*3);
    const ax=random()*2-1, ay=random()*2-1, az=random()*2-1, inv=1/Math.hypot(ax,ay,az);
    this.axis.set([ax*inv,ay*inv,az*inv]);
    for(let i=0;i<6;i++) {
      const y=1-2*(i+.5)/6, r=Math.sqrt(1-y*y), a=i*2.399963229728653+random()*.8;
      const radius=config.radius*(.16+random()*.12);
      this.impacts.set([Math.cos(a)*r,y,Math.sin(a)*r,2*config.radius*config.radius/(radius*radius),14+random()*14,5+random()*7],i*6);
    }
    const radius2=2*config.radius*config.radius;
    this.innerDot=1-42*42/radius2; this.outerDot=1-155*155/radius2;
    this.clearingInner=1-15*15/radius2; this.clearingOuter=1-29*29/radius2;
  }
  heightAt(x:number,y:number,z:number):number {this.sample(x,y,z);return this.height;}
  moistureAt(x:number,y:number,z:number):number {this.sample(x,y,z);return this.moisture;}
  forestAt(x:number,y:number,z:number):number {this.sample(x,y,z);return this.forest;}
  biomeAt(x:number,y:number,z:number):WorldBiome {this.sample(x,y,z);return this.biome;}
  clearingAt(x:number,y:number,z:number):number {this.sample(x,y,z);return this.clearing;}

  private sample(x:number,y:number,z:number):void {
    if(x===this.cacheX&&y===this.cacheY&&z===this.cacheZ)return;
    this.cacheX=x;this.cacheY=y;this.cacheZ=z;
    const a=this.n1(x*1.35,y*1.35,z*1.35), b=this.n2(x*3.6+8,y*3.6-3,z*3.6+11);
    const c=this.n3(x*8.2-4,y*8.2+13,z*8.2-6), cluster=this.n2(x*21+31,y*21-9,z*21+6);
    let nearest=-1,region=0;
    for(let i=0;i<3;i++) {const dot=x*this.anchors[i*3]+y*this.anchors[i*3+1]+z*this.anchors[i*3+2];if(dot>nearest){nearest=dot;region=i;}}
    let impact=0,impactMask=0;
    if(this.kind==='shattered'||this.kind==='volcanic') for(let i=0;i<6;i++) {
      const j=i*6,q=(1-x*this.impacts[j]-y*this.impacts[j+1]-z*this.impacts[j+2])*this.impacts[j+3];
      if(q<1.6) {const bowl=1-smooth(q),rim=1-smooth(Math.abs(q-1)/.6);impact+=-this.impacts[j+4]*bowl+this.impacts[j+5]*rim;impactMask=Math.max(impactMask,bowl);}
    }
    const water=this.config.waterSurfaceOffset;
    let h=0,m=0,f=0,biome:WorldBiome='regolith';
    switch(this.kind) {
      case 'shattered': {
        const seam=1-smooth(Math.abs(x*this.axis[0]+y*this.axis[1]+z*this.axis[2]+b*.035)/.11);
        h=10+a*10+b*3+c*.65+impact-seam*12;
        biome=seam>.45?'rift':impactMask>.14?'crater':'regolith';
        m=.02;f=biome==='rift'?.32:biome==='crater'?.13:.035;break;
      }
      case 'canyon': {
        const plateau=smooth((a+.28)/.72),channel=1-smooth(Math.abs(b+a*.12)/.16);
        const dune=Math.sin(x*31+z*19+b*4)*1.8+c*.8;
        h=-13+shelf(plateau*58,9)-channel*15+dune*(1-plateau*.7);
        biome=h<water+6?'oasis':plateau>.53?'mesa':'dune';
        m=biome==='oasis'?.79:biome==='mesa'?.19:.09;f=biome==='oasis'?.64:biome==='mesa'?.11:.045;break;
      }
      case 'cryo': {
        const land=smooth((a+.18)/.58),fjord=1-smooth(Math.abs(b+a*.1)/.18);
        const ridge=1-Math.abs(c),r2=ridge*ridge,spires=r2*r2*r2*r2*18*smooth((b+.05)/.55);
        h=-19+land*48+Math.abs(b)*9+spires-fjord*20*land+c*.6;
        biome=h<water+5?'fjord':h>29?'spire':'ice_shelf';
        m=biome==='fjord'?.72:.36;f=biome==='fjord'?.19:biome==='ice_shelf'?.11:.05;break;
      }
      case 'volcanic': {
        const land=smooth((a+.12)/.6);
        h=-18+land*45+shelf((b+1)*7,4)*land+impact+c*.65;
        biome=impactMask>.14||h<water+2?'caldera':b<-.16&&h<29?'ash_refuge':'basalt';
        m=biome==='ash_refuge'?.28:.055;f=biome==='ash_refuge'?.36:biome==='basalt'?.07:.025;break;
      }
      case 'biolum': {
        const rim=1-smooth(Math.abs(a-.07)/.43),terrace=shelf((b+1)*7,4);
        h=-18+rim*(31+terrace*.65)+c*.65;
        biome=h<water+4?'lagoon':h>11?'fungal_forest':'atoll';
        m=biome==='lagoon'?.94:biome==='atoll'?.81:.75;f=biome==='fungal_forest'?.91:biome==='atoll'?.48:.16;break;
      }
    }
    // A landing approach is an eroded/settled part of its global field: broad
    // 155m transitions, a 42m camp shelf, no separate local terrain generator.
    const approach=smooth((nearest-this.outerDot)/(this.innerDot-this.outerDot));
    const site=DEFINITIONS[this.kind][region];
    h+=(site.height+c*.12-h)*approach;
    const climate=CLIMATE[site.biome];
    m+=(climate[0]-m)*approach;f+=(climate[1]-f)*approach;
    if(nearest>this.innerDot-(1-this.innerDot)*1.2) biome=site.biome;
    this.clearing=smooth((nearest-this.clearingOuter)/(this.clearingInner-this.clearingOuter));
    this.height=Math.max(this.config.heightMin+1,Math.min(this.config.heightMax-2,h));
    this.moisture=clamp(m+c*.04);
    this.forest=clamp(f*smooth((cluster+.55)/1.1)*(1-this.clearing));
    if(this.config.ocean.hasOcean&&h<water+1)this.forest=0;
    this.biome=biome;
  }
}
