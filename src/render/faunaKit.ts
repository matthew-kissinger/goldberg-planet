/** Editable creature authoring kit. These are deliberately authored profiles and
 * appendage modules, not runtime DNA assembly or stretched legacy wildlife parts.
 * Geometry is built once and instanced; joints/contacts belong to the runtime. */
import * as THREE from 'three';
import type { AureliaSpecies } from '../world/aureliaFauna';

export interface FaunaLegRecipe {
  hip: readonly [number, number, number]; upper: number; lower: number;
  radius: number; foot: readonly [number, number, number]; phase: number; bend: 1 | -1;
}
export interface FaunaRecipe {
  species: AureliaSpecies;
  bodyPlan: 'quadruped' | 'wader' | 'glider' | 'fish';
  palette: { coat: number; mantle: number; accent: number; dark: number };
  head: readonly [number, number, number]; tail: readonly [number, number, number];
  legs: readonly FaunaLegRecipe[];
  stride: number; clearance: number;
  ears: 'spade' | 'round' | 'crest' | 'none'; horns: 'hook' | 'none'; tailShape: 'brush' | 'fork' | 'fin' | 'short';
}
const quadLegs = (height: number, width: number, front: number, back: number, radius: number): FaunaLegRecipe[] =>
  [-1, 1].flatMap((side, i) => [
    { hip: [side * width, height, front] as const, upper: height * .57, lower: height * .59,
      radius, foot: [radius * 1.3, .065, radius * 1.8] as const, phase: i * .5, bend: -1 as const },
    { hip: [side * width, height * .92, back] as const, upper: height * .54, lower: height * .55,
      radius: radius * .85, foot: [radius * 1.2, .065, radius * 1.7] as const, phase: .5 - i * .5, bend: 1 as const },
  ]);
export const FAUNA_RECIPES: Record<AureliaSpecies, FaunaRecipe> = {
  mantleback: { species: 'mantleback', bodyPlan: 'quadruped', palette: { coat: 0x776a48, mantle: 0xe3d5b1, accent: 0xa88c4c, dark: 0x393a2c },
    head: [0, .8, -.84], tail: [0, .82, .8], legs: quadLegs(.83, .25, -.47, .49, .095), stride: .62, clearance: .18,
    ears: 'round', horns: 'none', tailShape: 'short' },
  reedrunner: { species: 'reedrunner', bodyPlan: 'wader', palette: { coat: 0x9caa99, mantle: 0xe5debc, accent: 0xbc8840, dark: 0x414d42 },
    head: [0, 1.72, -.42], tail: [0, 1.22, .4], stride: .55, clearance: .23,
    legs: [-1, 1].map((s, i) => ({ hip: [s * .12, 1.05, 0], upper: .57, lower: .59, radius: .031,
      foot: [.09, .035, .19], phase: i * .5, bend: 1 })), ears: 'crest', horns: 'none', tailShape: 'short' },
  ridgehook: { species: 'ridgehook', bodyPlan: 'quadruped', palette: { coat: 0x8a765f, mantle: 0xcebe9b, accent: 0x655f48, dark: 0x37352f },
    head: [0, 1.57, -.65], tail: [0, 1.03, .64], legs: quadLegs(1.12, .2, -.39, .4, .068), stride: .7, clearance: .23,
    ears: 'spade', horns: 'hook', tailShape: 'short' },
  sailwing: { species: 'sailwing', bodyPlan: 'glider', palette: { coat: 0x697d7b, mantle: 0xd6d5b8, accent: 0xbf9254, dark: 0x343e40 },
    head: [0, .4, -.44], tail: [0, .3, .48], legs: [], stride: .62, clearance: .1,
    ears: 'none', horns: 'none', tailShape: 'fork' },
  duskprowler: { species: 'duskprowler', bodyPlan: 'quadruped', palette: { coat: 0x7c7265, mantle: 0xb5a58a, accent: 0x514b42, dark: 0x292a29 },
    head: [0, .98, -.68], tail: [0, .83, .67], legs: quadLegs(.78, .17, -.43, .42, .058), stride: .62, clearance: .17,
    ears: 'spade', horns: 'none', tailShape: 'brush' },
  ribbonfin: { species: 'ribbonfin', bodyPlan: 'fish', palette: { coat: 0x73908a, mantle: 0xc8d6bb, accent: 0xc49954, dark: 0x384f4e },
    head: [0, .15, -.44], tail: [0, .14, .56], legs: [], stride: .62, clearance: .1,
    ears: 'none', horns: 'none', tailShape: 'fin' },
};

type Point = readonly [number, number, number];
type Profile = readonly [number, number, number, number?, number?];
/** Closed cross-section loft; every end is capped and normals are authored by
 * the surface topology. Vertex colors keep all solid parts on one material. */
class Surface {
  private readonly p: number[] = []; private readonly c: number[] = []; private readonly indices: number[] = [];
  loft(rows: readonly Profile[], color: number, segments = 12): this {
    const start = this.p.length / 3, rgb = new THREE.Color(color);
    for (const [y, rx, rz, x = 0, z = 0] of rows) for (let j = 0; j < segments; j++) {
      const a = j / segments * Math.PI * 2;
      this.p.push(x + Math.cos(a) * Math.max(.001, rx), y, z + Math.sin(a) * Math.max(.001, rz));
      this.c.push(rgb.r, rgb.g, rgb.b);
    }
    for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < segments; j++) {
      const a = start + i * segments + j, b = start + i * segments + (j + 1) % segments;
      this.indices.push(a, a + segments, b, b, a + segments, b + segments);
    }
    for (let j = 1; j < segments - 1; j++) {
      this.indices.push(start, start + j, start + j + 1);
      const end = start + (rows.length - 1) * segments;
      this.indices.push(end, end + j + 1, end + j);
    }
    return this;
  }
  oval(center: Point, radii: Point, color: number, rows = 7): this {
    const profile: Profile[] = [];
    for (let i = 0; i <= rows; i++) {
      const a = i / rows * Math.PI, width = Math.sin(a);
      profile.push([center[1] - Math.cos(a) * radii[1], width * radii[0], width * radii[2], center[0], center[2]]);
    }
    return this.loft(profile, color);
  }
  tube(path: readonly Point[], radii: readonly number[], color: number): this {
    const start = this.p.length / 3, rgb = new THREE.Color(color), n = 8;
    const tangent = new THREE.Vector3(), x = new THREE.Vector3(), z = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < path.length; i++) {
      a.fromArray(path[Math.max(0, i - 1)]); b.fromArray(path[Math.min(path.length - 1, i + 1)]);
      tangent.subVectors(b, a).normalize(); x.set(Math.abs(tangent.y) > .9 ? 1 : 0, Math.abs(tangent.y) > .9 ? 0 : 1, 0).cross(tangent).normalize(); z.crossVectors(tangent, x);
      for (let j = 0; j < n; j++) {
        const angle = j / n * Math.PI * 2, r = radii[i];
        this.p.push(path[i][0] + r * (x.x * Math.cos(angle) + z.x * Math.sin(angle)),
          path[i][1] + r * (x.y * Math.cos(angle) + z.y * Math.sin(angle)),
          path[i][2] + r * (x.z * Math.cos(angle) + z.z * Math.sin(angle)));
        this.c.push(rgb.r, rgb.g, rgb.b);
      }
    }
    for (let i = 0; i < path.length - 1; i++) for (let j = 0; j < n; j++) {
      const a = start + i * n + j, b = start + i * n + (j + 1) % n;
      this.indices.push(a, b, a + n, b, b + n, a + n);
    }
    for (let j = 1; j < n - 1; j++) {
      this.indices.push(start, start + j + 1, start + j);
      const end = start + (path.length - 1) * n; this.indices.push(end, end + j, end + j + 1);
    }
    return this;
  }
  /** A thin closed membrane, with a folded ridge instead of alpha planes. */
  membrane(outline: readonly Point[], color: number, ridge: Point): this {
    const start = this.p.length / 3, rgb = new THREE.Color(color);
    for (const point of [...outline, ridge, [ridge[0], ridge[1] - .035, ridge[2]] as Point]) {
      this.p.push(...point); this.c.push(rgb.r, rgb.g, rgb.b);
    }
    const top = start + outline.length, bottom = top + 1;
    for (let i = 0; i < outline.length; i++) {
      const a = start + i, b = start + (i + 1) % outline.length;
      this.indices.push(a, top, b, a, b, bottom);
    }
    return this;
  }
  finish(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.indices);
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}
export interface FaunaKitParts { body: THREE.BufferGeometry; head: THREE.BufferGeometry; tail: THREE.BufferGeometry; wing?: THREE.BufferGeometry }
export interface FaunaKit {
  species: Record<AureliaSpecies, FaunaKitParts>;
  limb: THREE.BufferGeometry; foot: THREE.BufferGeometry; material: THREE.MeshStandardMaterial;
  dispose(): void;
}

function parts(recipe: FaunaRecipe): FaunaKitParts {
  const { coat, mantle, accent, dark } = recipe.palette;
  const body = new Surface(), head = new Surface(), tail = new Surface();
  let wing: THREE.BufferGeometry | undefined;
  if (recipe.species === 'mantleback') {
    body.loft([[.62, .2, .56], [.82, .39, .76], [1.05, .44, .68], [1.28, .3, .5], [1.35, .09, .2]], coat)
      .loft([[1.01, .42, .61], [1.2, .37, .57], [1.32, .25, .43], [1.36, .04, .17]], mantle)
      .oval([0, .91, -.69], [.23, .25, .36], coat);
    head.loft([[-.18, .1, .17, 0, -.1], [-.07, .19, .27, 0, -.12], [.13, .2, .21], [.24, .08, .09]], mantle)
      .oval([0, -.05, -.29], [.16, .1, .12], dark);
    tail.tube([[0, 0, 0], [0, -.08, .15], [0, -.26, .2]], [.07, .055, .025], coat);
  } else if (recipe.species === 'ridgehook') {
    body.loft([[.85, .12, .39], [1.02, .25, .59], [1.25, .29, .59, 0, -.08], [1.43, .19, .38, 0, -.19], [1.47, .06, .15, 0, -.25]], coat)
      .tube([[0, 1.17, -.36], [0, 1.4, -.48], [0, 1.59, -.6]], [.24, .2, .12], mantle);
    head.oval([0, .02, -.04], [.14, .2, .22], mantle).oval([0, -.1, -.22], [.1, .08, .14], dark)
      .tube([[0, -.12, -.03], [0, -.32, -.03]], [.08, .005], coat);
    tail.tube([[0, 0, 0], [0, -.06, .17], [0, -.18, .19]], [.055, .05, .005], mantle);
  } else if (recipe.species === 'duskprowler') {
    body.loft([[.6, .14, .43], [.78, .24, .62], [.97, .21, .57, 0, -.09], [1.11, .08, .25, 0, -.22]], coat)
      .loft([[.72, .16, .19, 0, -.47], [.93, .29, .28, 0, -.43], [1.17, .2, .19, 0, -.47], [1.24, .05, .06, 0, -.49]], accent)
      .oval([0, .67, -.47], [.13, .22, .12], mantle);
    head.oval([0, .04, -.035], [.17, .2, .21], coat)
      .loft([[-.09, .1, .18, 0, -.19], [.025, .12, .24, 0, -.16], [.1, .11, .14, 0, -.13]], mantle)
      .oval([0, .015, -.37], [.075, .055, .05], dark);
    tail.tube([[0, 0, 0], [0, -.08, .19], [0, -.22, .39], [0, -.27, .62], [0, -.2, .75]], [.1, .15, .17, .12, .005], coat);
  } else if (recipe.species === 'reedrunner') {
    body.oval([0, 1.14, .09], [.23, .3, .43], coat)
      .oval([0, 1.19, .15], [.24, .2, .37], mantle)
      .tube([[0, 1.14, -.2], [0, 1.35, -.22], [0, 1.51, -.32], [0, 1.7, -.4]], [.14, .105, .065, .08], mantle)
      .membrane([[-.06, 1.55, -.3], [0, 1.12, -.31], [.06, 1.55, -.3]], accent, [0, 1.36, -.42]);
    head.oval([0, .02, 0], [.095, .13, .14], coat)
      .tube([[0, .015, -.1], [0, -.015, -.32], [0, -.055, -.49]], [.06, .037, .002], dark);
    tail.tube([[0, 0, 0], [0, .08, .22], [0, .14, .36]], [.1, .07, .002], dark);
  } else if (recipe.species === 'sailwing') {
    body.oval([0, .32, .02], [.2, .16, .47], mantle).oval([0, .42, .12], [.19, .09, .37], coat);
    head.oval([0, 0, 0], [.12, .13, .15], mantle).tube([[0, 0, -.08], [0, -.025, -.3]], [.075, .002], dark);
    tail.membrane([[-.07, 0, 0], [-.28, 0, .55], [0, .015, .34], [.28, 0, .55], [.07, 0, 0]], accent, [0, .06, .18]);
    wing = new Surface().membrane([[0, 0, -.23], [.43, .06, -.35], [1.14, -.02, -.05], [.9, -.04, .35], [.4, 0, .25], [0, 0, .17]], coat, [.46, .11, -.03])
      .membrane([[.43, .065, -.34], [1.14, -.015, -.05], [.9, -.035, .34], [.72, .045, .04]], accent, [.87, .065, .02]).finish();
  } else {
    body.loft([[-.15, .04, .25], [0, .15, .52], [.21, .18, .55], [.42, .11, .31], [.47, .01, .12]], coat)
      .oval([0, .02, -.06], [.135, .16, .39], mantle)
      .membrane([[0, .4, -.25], [0, .69, .05], [0, .39, .35]], accent, [.025, .48, .08]);
    head.oval([0, .04, -.02], [.14, .18, .16], mantle).oval([0, -.02, -.15], [.065, .045, .04], dark);
    tail.membrane([[0, -.04, 0], [0, -.29, .35], [0, .1, .24], [0, .42, .35], [0, .15, 0]], accent, [.035, .07, .17]);
    wing = new Surface().membrane([[0, 0, -.16], [.43, -.08, .24], [.16, -.1, .39], [0, 0, .12]], accent, [.17, -.02, .12]).finish();
  }
  for (const side of [-1, 1]) {
    const x = recipe.bodyPlan === 'wader' ? .082 : recipe.bodyPlan === 'fish' ? .128 : .128;
    head.oval([side * x, .07, -.105], [.027, .029, .031], dark, 5)
      .oval([side * (x + .009), .079, -.123], [.009, .009, .009], 0xf4ecd7, 4);
    if (recipe.ears === 'spade') head.loft([[.12, .06, .075, side * .13, .01], [.29, .075, .055, side * .17, .02], [.43, .003, .003, side * .2, .01]], coat, 8)
      .loft([[.2, .035, .012, side * .17, -.038], [.34, .003, .003, side * .19, -.025]], accent, 8);
    if (recipe.ears === 'round') head.oval([side * .235, .15, .02], [.11, .07, .07], coat, 5);
    if (recipe.horns === 'hook') head.tube([[side * .09, .18, .03], [side * .17, .4, .05], [side * .2, .59, .2], [side * .16, .6, .36], [side * .11, .44, .36]], [.068, .056, .043, .03, .002], dark);
    if (recipe.ears === 'crest') head.tube([[side * .04, .09, .04], [side * .1, .26, .1], [side * .16, .31, .17]], [.035, .025, .001], accent);
  }
  return { body: body.finish(), head: head.finish(), tail: tail.finish(), wing };
}

export function buildFaunaKit(): FaunaKit {
  const species = Object.fromEntries(Object.values(FAUNA_RECIPES).map(recipe => [recipe.species, parts(recipe)])) as Record<AureliaSpecies, FaunaKitParts>;
  const limb = new Surface().loft([[-.5, .66, .7], [-.38, .82, .8], [.12, 1, .9], [.4, .84, .8], [.5, .58, .65]], 0xffffff, 8).finish();
  const foot = new Surface().loft([[-.5, .75, .78, 0, -.12], [0, 1, 1, 0, -.08], [.5, .7, .72]], 0xffffff, 8).finish();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, metalness: 0 });
  const geometry = new Set<THREE.BufferGeometry>([limb, foot]);
  for (const part of Object.values(species)) for (const g of Object.values(part)) if (g) geometry.add(g);
  return { species, limb, foot, material, dispose() { for (const g of geometry) g.dispose(); material.dispose(); } };
}

let sharedKit: FaunaKit | undefined, references = 0;
export function acquireFaunaKit(): FaunaKit { references++; return sharedKit ??= buildFaunaKit(); }
export function releaseFaunaKit(): void {
  if (references > 0 && --references === 0) { sharedKit?.dispose(); sharedKit = undefined; }
}
