/**
 * Offline expedition asset authoring. Run: node scripts/build-explorer.mjs
 * Metres; +Y up, -Z forward. Geometry, weights and clips are authored here,
 * exported once, and never constructed by the game loop. No external art/maps.
 */
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// GLTFExporter uses FileReader for its binary result even without textures.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(value => { this.result = value; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(value => { this.result = `data:${blob.type};base64,${Buffer.from(value).toString('base64')}`; this.onloadend?.(); }); }
};

const palette = {
  ivory: 0xb8b496, cream: 0xe5ddc5, moss: 0x657451, deepMoss: 0x3c4939,
  ochre: 0xb98b3c, gold: 0xd4aa56, leather: 0x69553e, dark: 0x363e39,
  sole: 0x34352f, skin: 0xc98f68, blush: 0xc78166, hair: 0x3f2d26,
  hairLight: 0x594033, eye: 0x242924, white: 0xf2e6cf, metal: 0x9a9e8a,
};
const colors = Object.fromEntries(Object.entries(palette).map(([key, value]) => [key, new T.Color(value)]));
const paletteKeys = Object.keys(palette);
const EXPLORER_SCALE = 1.13;
const material = new T.MeshStandardMaterial({ name: 'Expedition dyed canvas', color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0 });
const boneDefs = [
  ['Hips', null, [0, .95, 0]], ['Spine', 'Hips', [0, 1.12, 0]], ['Chest', 'Spine', [0, 1.32, 0]],
  ['Neck', 'Chest', [0, 1.47, 0]], ['Head', 'Neck', [0, 1.61, 0]],
  ['LeftUpperArm', 'Chest', [-.275, 1.36, 0]], ['LeftForearm', 'LeftUpperArm', [-.31, 1.085, -.012]], ['LeftHand', 'LeftForearm', [-.325, .855, -.025]],
  ['RightUpperArm', 'Chest', [.275, 1.36, 0]], ['RightForearm', 'RightUpperArm', [.31, 1.085, -.012]], ['RightHand', 'RightForearm', [.325, .855, -.025]],
  ['LeftUpperLeg', 'Hips', [-.145, .95, 0]], ['LeftLowerLeg', 'LeftUpperLeg', [-.145, .53, -.025]], ['LeftFoot', 'LeftLowerLeg', [-.145, .12, 0]],
  ['RightUpperLeg', 'Hips', [.145, .95, 0]], ['RightLowerLeg', 'RightUpperLeg', [.145, .53, -.025]], ['RightFoot', 'RightLowerLeg', [.145, .12, 0]],
];
const boneMap = new Map();
const absolute = new Map(boneDefs.map(([name, , p]) => [name, new T.Vector3(...p)]));
for (const [name, parent, p] of boneDefs) {
  const bone = new T.Bone(); bone.name = `explorer${name}`;
  bone.position.copy(new T.Vector3(...p));
  if (parent) { bone.position.sub(absolute.get(parent)); boneMap.get(parent).add(bone); }
  boneMap.set(name, bone);
}
const bones = [...boneMap.values()];
const bi = name => bones.indexOf(boneMap.get(name));
const weight = name => [[bi(name), 1]];
const mix = (a, b, blend) => [[bi(a), 1 - blend], [bi(b), blend]];

class Surface {
  p = []; c = []; slots = []; joints = []; weights = []; indices = [];
  vertex(x, y, z, color, skin = [[0, 1]]) {
    const i = this.p.length / 3;
    this.p.push(x, y, z);
    const c = typeof color === 'string' ? colors[color] : color;
    this.c.push(c.r, c.g, c.b);
    this.slots.push(typeof color === 'string' ? paletteKeys.indexOf(color) : -1);
    for (let lane = 0; lane < 4; lane++) {
      const influence = skin[lane]?.[1] ?? 0;
      this.joints.push(influence > 0 ? skin[lane][0] : 0);
      this.weights.push(influence);
    }
    return i;
  }
  triangle(a, b, c) { this.indices.push(a, b, c); }
  /** Shaped elliptical cross sections, with a soft-square exponent for cloth/gear. */
  loft(rows, color, skin, segments = 16, exponent = 1) {
    const base = this.p.length / 3;
    for (let j = 0; j < rows.length; j++) {
      const [y, rx, rz, x = 0, z = 0] = rows[j];
      for (let k = 0; k < segments; k++) {
        const a = k / segments * Math.PI * 2;
        const cc = Math.cos(a), ss = Math.sin(a);
        this.vertex(x + rx * Math.sign(cc) * Math.abs(cc) ** exponent, y, z + rz * Math.sign(ss) * Math.abs(ss) ** exponent,
          typeof color === 'function' ? color(y, k) : color, typeof skin === 'function' ? skin(y) : skin);
      }
      if (j) for (let k = 0; k < segments; k++) {
        const a = base + (j - 1) * segments + k, b = base + (j - 1) * segments + (k + 1) % segments;
        const c = base + j * segments + k, d = base + j * segments + (k + 1) % segments;
        this.triangle(a, c, b); this.triangle(b, c, d);
      }
    }
    for (const [j, flip] of [[0, true], [rows.length - 1, false]]) {
      const [y, , , x = 0, z = 0] = rows[j];
      const middle = this.vertex(x, y, z, typeof color === 'function' ? color(y, 0) : color, typeof skin === 'function' ? skin(y) : skin);
      for (let k = 0; k < segments; k++) {
        const a = base + j * segments + k, b = base + j * segments + (k + 1) % segments;
        this.triangle(middle, flip ? a : b, flip ? b : a);
      }
    }
  }
  geometry(geometry, color, skin, transform = new T.Matrix4()) {
    geometry.applyMatrix4(transform);
    const offset = this.p.length / 3, pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) this.vertex(pos.getX(i), pos.getY(i), pos.getZ(i), color, skin);
    const idx = geometry.index;
    for (let i = 0; i < (idx?.count ?? pos.count); i += 3) this.triangle(offset + (idx?.getX(i) ?? i), offset + (idx?.getX(i + 1) ?? i + 1), offset + (idx?.getX(i + 2) ?? i + 2));
    geometry.dispose();
  }
  oval(center, scale, color, skin, rotation = [0, 0, 0], segments = 16) {
    const matrix = new T.Matrix4().compose(new T.Vector3(...center), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...scale));
    this.geometry(new T.SphereGeometry(1, segments, 10), color, skin, matrix);
  }
  bar(a, b, radius, color, skin, segments = 10) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b), direction = end.clone().sub(start);
    const matrix = new T.Matrix4().compose(start.add(end).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), direction.clone().normalize()), new T.Vector3(1, 1, 1));
    this.geometry(new T.CylinderGeometry(radius, radius, direction.length(), segments), color, skin, matrix);
  }
  box(center, size, color, skin, rotation = [0, 0, 0]) {
    const matrix = new T.Matrix4().compose(new T.Vector3(...center), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(...size));
    this.geometry(new T.BoxGeometry(1, 1, 1), color, skin, matrix);
  }
  finish(skinned = false) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    geometry.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    geometry.setAttribute('_palette', new T.Float32BufferAttribute(this.slots, 1));
    geometry.setIndex(this.indices);
    if (skinned) {
      geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(this.joints, 4));
      geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(this.weights, 4));
    }
    geometry.computeVertexNormals();
    // Sphere pole/seam duplicates can be unused by the index and retain zero
    // normals after merging. Give these unused vertices a valid unit normal.
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const x = normals.getX(i), y = normals.getY(i), z = normals.getZ(i);
      if (x*x+y*y+z*z < 1e-12) normals.setXYZ(i,0,1,0);
    }
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

const skin = new Surface();
const hair = new Surface(), bun = new Surface(), braid = new Surface(), pack = new Surface(), satchel = new Surface(), hat = new Surface(), hood = new Surface();
const torsoWeights = y => y < 1.1 ? mix('Hips', 'Spine', T.MathUtils.clamp((y - .94) / .16, 0, 1)) : mix('Spine', 'Chest', T.MathUtils.clamp((y - 1.1) / .22, 0, 1));
skin.loft([[.87,.17,.13],[.96,.195,.145],[1.06,.18,.13],[1.17,.205,.145],[1.3,.225,.155],[1.37,.255,.14],[1.43,.17,.115]], 'ivory', torsoWeights, 20, .85);
// Reinforced shoulder yoke and collar, deliberately broad enough to read from behind.
skin.loft([[1.325,.231,.16],[1.37,.26,.145],[1.425,.172,.12]], 'moss', weight('Chest'), 20, .85);
skin.loft([[1.425,.135,.105],[1.46,.145,.115],[1.49,.12,.10]], 'deepMoss', weight('Neck'), 20);
skin.loft([[1.455,.143,.113],[1.475,.14,.112]], 'moss', weight('Neck'), 20);
// Front zipper, placket, useful pouches; all are part of the same draw.
skin.box([0,1.18,-.147],[.013,.39,.012],'leather',weight('Spine'));
skin.box([.09,1.275,-.16],[.105,.065,.012],'cream',weight('Chest'));
skin.box([.09,1.286,-.17],[.071,.009,.008],'ochre',weight('Chest'));
skin.loft([[.94,.2,.15],[.99,.2,.15]],'leather',weight('Hips'),20,.85);
skin.box([0,.965,-.157],[.075,.04,.018],'metal',weight('Hips'));
for (const sign of [-1, 1]) {
  const label = sign < 0 ? 'Left' : 'Right';
  const upper = `${label}UpperLeg`, lower = `${label}LowerLeg`, foot = `${label}Foot`;
  const legWeights = y => mix(upper, lower, T.MathUtils.clamp((.61-y)/.16,0,1));
  const x = sign * .145;
  skin.loft([[.13,.074,.076,x],[.25,.081,.085,x],[.43,.098,.092,x,-.016],[.51,.105,.105,x,-.025],[.59,.104,.105,x,-.018],[.75,.125,.13,x],[.9,.133,.13,x],[.965,.125,.125,x]],'ivory',legWeights,16,.85);
  skin.loft([[.135,.077,.081,x],[.21,.081,.084,x]],'dark',weight(lower),16);
  skin.oval([x,.535,-.112],[.091,.115,.034],'dark',mix(upper,lower,.48));
  skin.oval([x,.54,-.136],[.069,.086,.012],'leather',mix(upper,lower,.48));
  // Canvas thigh pocket sits on the outside/front, rather than floating armor.
  skin.loft([[.68,.05,.022,x+sign*.068,-.105],[.79,.064,.025,x+sign*.068,-.109],[.82,.055,.022,x+sign*.068,-.107]],'moss',weight(upper),12,.45);
  skin.box([x+sign*.068,.797,-.135],[.088,.018,.01],'deepMoss',weight(upper));
  // Anatomical boot: heel, shaft, projecting toe and separate dark outsole.
  skin.loft([[.025,.105,.165,x,-.054],[.065,.112,.17,x,-.057],[.105,.105,.148,x,-.045],[.16,.087,.089,x,.005],[.23,.081,.085,x,.005]],'leather',weight(foot),16,.6);
  skin.loft([[.012,.106,.17,x,-.055],[.045,.115,.174,x,-.055]],'sole',weight(foot),16,.55);
  skin.oval([x,.082,-.17],[.098,.045,.077],'ochre',weight(foot));
  skin.box([x,.175,-.083],[.1,.032,.014],'moss',weight(foot));
  for (const y of [.112,.139]) skin.box([x,y,-.096],[.08,.009,.01],'ivory',weight(foot));

  const arm = `${label}UpperArm`, forearm = `${label}Forearm`, hand = `${label}Hand`;
  const armWeights = y => mix(arm, forearm, T.MathUtils.clamp((1.15-y)/.135,0,1));
  skin.loft([[.89,.057,.06,sign*.325,-.024],[.98,.068,.068,sign*.32,-.02],[1.065,.075,.078,sign*.31,-.012],[1.12,.077,.08,sign*.305,-.007],[1.23,.086,.085,sign*.29],[1.33,.098,.09,sign*.275],[1.39,.077,.08,sign*.258]],'ivory',armWeights,16);
  skin.loft([[.91,.065,.067,sign*.324,-.024],[.96,.073,.073,sign*.321,-.022],[1.0,.077,.075,sign*.318,-.018]],'dark',weight(forearm),16);
  skin.oval([sign*.32,1.325,-.058],[.055,.075,.035],'moss',weight(arm));
  // Gloved palm and thumb, attached to articulated wrist.
  skin.oval([sign*.331,.817,-.026],[.057,.085,.052],'dark',weight(hand));
  skin.oval([sign*.285,.833,-.057],[.024,.043,.024],'leather',weight(hand),[.25,0,sign*.25]);
  skin.box([sign*.333,.847,-.073],[.068,.025,.014],'moss',weight(hand));
  skin.loft([[.86,.062,.063,sign*.325,-.025],[.89,.062,.063,sign*.325,-.025]],'moss',weight(hand),16);
  // Shoulder straps follow chest and terminate at the waist.
  skin.bar([sign*.16,1.4,-.09],[sign*.125,1.05,-.155],.022,'leather',weight('Chest'),8);
  skin.box([sign*.138,1.19,-.177],[.047,.06,.015],'metal',weight('Chest'));
  skin.box([sign*.138,1.19,-.188],[.025,.038,.008],'dark',weight('Chest'));
  skin.loft([[.83,.055,.06,sign*.235],[.94,.064,.063,sign*.235]],'ochre',weight('Hips'),12,.5);
}
skin.loft([[1.46,.066,.064],[1.59,.072,.065]], 'skin', weight('Neck'), 16);
// Warm, open face; fitted hair cap, swept locks and bun instead of a visor/helmet.
skin.oval([0,1.645,-.015],[.126,.16,.115],'skin',weight('Head'),[0,0,0],24);
skin.oval([0,1.59,-.068],[.083,.072,.078],'skin',weight('Head'));
skin.oval([0,1.637,-.124],[.021,.028,.033],'skin',weight('Head'));
for (const sign of [-1,1]) {
  skin.oval([sign*.048,1.666,-.12],[.027,.014,.008],'white',weight('Head'));
  skin.oval([sign*.048,1.666,-.127],[.011,.011,.005],'eye',weight('Head'));
  skin.oval([sign*.045,1.67,-.131],[.0035,.0035,.002],'white',weight('Head'),[0,0,0],8);
  skin.bar([sign*.027,1.691,-.119],[sign*.071,1.69,-.108],.0055,'hair',weight('Head'),6);
  skin.oval([sign*.079,1.628,-.101],[.02,.01,.0035],'blush',weight('Head'));
  skin.oval([sign*.121,1.655,.005],[.023,.041,.028],'skin',weight('Head'));
  hair.oval([sign*.132,1.687,.017],[.023,.06,.075],'hair',weight('Head'));
}
skin.oval([0,1.599,-.136],[.029,.005,.004],'hairLight',weight('Head'));
hair.loft([[1.7,.124,.11,0,.014],[1.75,.135,.12,0,.012],[1.8,.104,.097,0,.015],[1.822,.05,.05,0,.015],[1.828,.005,.005,0,.015]],'hair',weight('Head'),24);
hair.oval([-.083,1.724,-.08],[.045,.10,.044],'hairLight',weight('Head'),[0,0,-.6]);
hair.oval([.064,1.749,-.076],[.07,.058,.04],'hair',weight('Head'),[0,0,-.45]);
bun.oval([-.112,1.751,.13],[.089,.093,.083],'hair',weight('Head'));
bun.oval([-.12,1.77,.153],[.06,.055,.061],'hairLight',weight('Head'));
// Slim communications band, moss ear cups, no emissive cyan accessories.
for (let i=0;i<12;i++) {
  const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
  skin.bar([Math.cos(a)*.15,1.655+Math.sin(a)*.175,.025],[Math.cos(b)*.15,1.655+Math.sin(b)*.175,.025],.014,'ivory',weight('Head'),6);
}
for(const sign of [-1,1]) {
  skin.oval([sign*.15,1.655,.025],[.021,.044,.045],'metal',weight('Head'));
  skin.oval([sign*.169,1.655,.025],[.012,.032,.032],'moss',weight('Head'));
}
// Ochre canvas pack with a curved flap, two straps, side pocket and rolled mat.
pack.loft([[1.035,.17,.09,0,.22],[1.08,.2,.115,0,.23],[1.32,.215,.12,0,.23],[1.405,.18,.1,0,.22]],'ochre',weight('Chest'),20,.5);
pack.loft([[1.32,.218,.123,0,.232],[1.385,.207,.126,0,.23],[1.42,.16,.095,0,.22]],'gold',weight('Chest'),20,.5);
for(const sign of [-1,1]) {
  pack.box([sign*.124,1.245,.36],[.027,.31,.018],'leather',weight('Chest'));
  pack.box([sign*.124,1.23,.374],[.047,.053,.018],'metal',weight('Chest'));
  pack.box([sign*.124,1.23,.386],[.025,.029,.008],'leather',weight('Chest'));
}
pack.bar([-.23,1.015,.255],[.23,1.015,.255],.083,'ochre',weight('Spine'),16);
for(const x of [-.15,.15]) pack.bar([x,1.015,.254],[x+.022,1.015,.254],.086,'leather',weight('Spine'),16);
pack.oval([0,1.237,.363],[.063,.057,.009],'moss',weight('Chest'));
pack.bar([-.032,1.217,.375],[.021,1.263,.375],.006,'ivory',weight('Chest'),5);

// Optional kit modules use the same bind skeleton and palette slots.
for(let i=0;i<6;i++) braid.oval([.09,1.67-i*.063,.115+i*.008],[.036,.049,.035],i%2?'hair':'hairLight',weight('Head'));
satchel.loft([[1.12,.14,.065,0,.19],[1.16,.175,.085,0,.20],[1.34,.175,.085,0,.20],[1.38,.14,.065,0,.19]],'moss',weight('Chest'),16,.5);
satchel.box([0,1.27,.292],[.03,.18,.015],'leather',weight('Chest'));
hat.loft([[1.785,.24,.225],[1.805,.24,.225]],'ochre',weight('Head'),24);
hat.loft([[1.80,.147,.138],[1.87,.137,.125],[1.925,.105,.101]],'ochre',weight('Head'),24,.8);
hat.loft([[1.807,.149,.14],[1.834,.145,.136]],'leather',weight('Head'),24);
hood.loft([[1.40,.15,.12,0,.04],[1.51,.178,.137,0,.035],[1.70,.17,.14,0,.035],[1.83,.137,.119,0,.025],[1.86,.06,.06,0,.025]],'moss',weight('Head'),20);
// Open face window: a separate soft hood rim leaves the face in front.
hood.loft([[1.425,.15,.10],[1.47,.16,.11]],'ochre',weight('Neck'),20);
const root = new T.Scene(); root.name='expeditionAsset';
const rig = new T.Group(); rig.name='explorerRig'; root.add(rig);
for(const bone of bones) bone.position.multiplyScalar(EXPLORER_SCALE);
rig.add(bones[0]); root.updateMatrixWorld(true);
const body = new T.SkinnedMesh(skin.finish(true).scale(EXPLORER_SCALE,EXPLORER_SCALE,EXPLORER_SCALE),material); body.name='explorerSkin';
// glTF skins are scene roots; grouping transforms are represented by the bones.
// The game reunites the skin with its identity rig container after loading.
root.add(body); root.updateMatrixWorld(true); const skeleton=new T.Skeleton(bones); body.bind(skeleton);
for(const [name,surface] of Object.entries({hair,bun,braid,pack,satchel,hat,hood})) {
  const mesh=new T.SkinnedMesh(surface.finish(true).scale(EXPLORER_SCALE,EXPLORER_SCALE,EXPLORER_SCALE),material);
  mesh.name=`explorerModule_${name}`;mesh.userData={module:name,paletteKeys};root.add(mesh);root.updateMatrixWorld(true);mesh.bind(skeleton);
}
body.userData.paletteKeys=paletteKeys;
body.userData = { authoring: 'offline code-authored lofted cloth, weighted limbs and fitted expedition equipment', palette: 'ivory / moss / ochre', restHeightMetres: 2.07, paletteKeys, authoringScale:EXPLORER_SCALE };
const rightSocket = new T.Group(); rightSocket.name='explorerRightGrip'; rightSocket.position.set(0,-.055,-.035); boneMap.get('RightHand').add(rightSocket);

// Portable props are baked too. One visible prop is one draw, all inactive ones hidden at runtime.
for(const id of ['wood','hatchet','pickaxe','spear','cooked_meat','planeFrame']) {
  const prop = new Surface();
  if(id==='wood') { prop.bar([-.1,.07,0],[.1,.23,0],.09,'leather'); }
  if(['hatchet','pickaxe','spear'].includes(id)) {
    prop.bar([0,-.12,0],[0,id==='spear'?.8:.38,0],.022,'leather');
    if(id==='hatchet') prop.box([0,.33,-.07],[.035,.12,.18],'metal',undefined,[0,.05,-.12]);
    if(id==='pickaxe') prop.bar([0,.37,-.2],[0,.37,.16],.032,'metal');
    if(id==='spear') prop.oval([0,.9,0],[.04,.16,.025],'metal');
  }
  if(id==='cooked_meat') { prop.oval([0,.1,0],[.1,.07,.065],'ochre'); prop.bar([-.13,.1,0],[.13,.1,0],.018,'ivory'); }
  if(id==='planeFrame') { prop.bar([-.23,.13,0],[.23,.13,0],.02,'leather'); prop.box([0,.2,0],[.45,.035,.15],'ivory'); }
  const mesh=new T.Mesh(prop.finish(),material); mesh.name=`character-prop-${id}`;rightSocket.add(mesh);
}

// Sculpted open-deck field skiff. Its distinct swept hull is authored once.
const vehicles=new T.Group();vehicles.name='explorerVehicles';root.add(vehicles);
const skiff=new T.Group();skiff.name='fieldSkiff';vehicles.add(skiff);
const hull=new Surface();
// Loft the hull vertically, narrowing both its belly and raised bow lip.
hull.loft([[.22,.28,.82,0,-.08],[.34,.5,1.02,0,-.06],[.59,.52,1.03,0,-.06],[.67,.46,.98,0,-.06]],'ivory',undefined,24,.65);
hull.loft([[.48,.524,1.035,0,-.06],[.56,.531,1.04,0,-.06]],'moss',undefined,24,.65);
hull.oval([0,.674,-.14],[.36,.028,.57],'dark');
hull.oval([0,.71,.29],[.28,.065,.2],'leather');
hull.oval([0,.9,.43],[.27,.25,.055],'moss');
// Raised bow cowl and low instrument rail leave the pilot visible.
hull.oval([0,.73,-.78],[.4,.17,.32],'moss');
hull.box([0,.85,-.54],[.38,.065,.18],'ochre',undefined,[-.3,0,0]);
hull.bar([-.24,.81,-.47],[.24,.81,-.47],.028,'dark');
for(const sign of [-1,1]) {
  hull.bar([sign*.4,.43,.12],[sign*1.12,.58,.1],.065,'moss');
  hull.bar([sign*.37,.3,-.62],[sign*.48,.12,-.62],.035,'dark');
  hull.bar([sign*.37,.3,.55],[sign*.48,.12,.55],.035,'dark');
  hull.bar([sign*.48,.1,-.83],[sign*.48,.1,.79],.035,'dark');
  const torus=new T.TorusGeometry(.39,.055,8,24);
  hull.geometry(torus,'ochre',undefined,new T.Matrix4().compose(new T.Vector3(sign*1.04,.63,.1),new T.Quaternion().setFromEuler(new T.Euler(Math.PI/2,0,0)),new T.Vector3(1,1,1)));
  const rotor=new Surface();rotor.oval([0,0,0],[.065,.06,.065],'dark');
  for(let k=0;k<3;k++)rotor.box([Math.sin(k*2*Math.PI/3)*.17,0,Math.cos(k*2*Math.PI/3)*.17],[.065,.018,.3],'deepMoss',undefined,[0,k*2*Math.PI/3,0]);
  const blade=new T.Mesh(rotor.finish(),material);blade.name=`fieldSkiffRotor${sign<0?'Left':'Right'}`;blade.position.set(sign*1.04,.64,.1);skiff.add(blade);
}
const skiffMesh=new T.Mesh(hull.finish(),material);skiffMesh.name='fieldSkiffHull';skiff.add(skiffMesh);

const shipSurface=new Surface();
shipSurface.oval([0,.7,.05],[.52,.42,1.48],'ivory',undefined,[0,0,0],24);
shipSurface.oval([0,.98,-.4],[.35,.22,.61],'deepMoss');
shipSurface.oval([0,1.01,-.43],[.27,.19,.48],'moss');
for(const sign of [-1,1]) {
  shipSurface.box([sign*.8,.49,.28],[1.12,.09,1.05],'ivory',undefined,[0,sign*.28,sign*.04]);
  shipSurface.box([sign*1.32,.63,.54],[.09,.3,.48],'ochre');
  shipSurface.oval([sign*.31,.64,1.27],[.22,.23,.25],'dark');
  shipSurface.oval([sign*.31,.64,1.46],[.15,.15,.035],'ochre');
  shipSurface.bar([sign*.4,.46,.55],[sign*.6,.13,.7],.045,'dark');
  shipSurface.oval([sign*.6,.1,.7],[.16,.045,.23],'moss');
}
shipSurface.bar([0,.42,-.7],[0,.13,-.8],.045,'dark');shipSurface.oval([0,.1,-.8],[.15,.045,.22],'moss');
shipSurface.box([0,1.09,.67],[.085,.45,.61],'moss');
const ship=new T.Mesh(shipSurface.finish(),material);ship.name='fieldStarship';vehicles.add(ship);

// Keyed poses are absolute local rotations. The runtime mixer interpolates/blends them.
const defaults = Object.fromEntries(boneDefs.map(([name]) => [name,[0,0,0]]));
defaults.LeftUpperArm=[.03,0,-.08];defaults.RightUpperArm=[.03,0,.08];
defaults.LeftForearm=[.1,0,0];defaults.RightForearm=[.1,0,0];
const pose=(changes={},hipOffset=0)=>({ rotations:{...defaults,...changes},hipOffset });
const clips=[];
function clip(name,duration,frames,loop=true) {
  const times=frames.map((_,i)=>i/(frames.length-1)*duration);const tracks=[];
  for(const [bone]of boneDefs) {
    const values=[];
    for(const frame of frames) { const angles=frame.rotations[bone];const q=new T.Quaternion().setFromEuler(new T.Euler(...angles)); values.push(q.x,q.y,q.z,q.w); }
    tracks.push(new T.QuaternionKeyframeTrack(`explorer${bone}.quaternion`,times,values));
  }
  tracks.push(new T.VectorKeyframeTrack('explorerHips.position',times,frames.flatMap(p=>[0,(.95+p.hipOffset)*EXPLORER_SCALE,0])));
  const result=new T.AnimationClip(name,duration,tracks);result.userData={loop,authoring:'explicit key poses'};clips.push(result);
}
clip('idle',3.2,[pose(),pose({Chest:[-.015,.012,0],Head:[0,.025,.01]},.006),pose({Chest:[0,-.01,0],Head:[0,-.018,-.01]},0),pose()]);
// Contact, down, passing, up, opposite contact. Knees flex backward (+Z), while the bent knee faces -Z.
const walk=[
  pose({LeftUpperLeg:[.48,0,0],RightUpperLeg:[-.42,0,0],LeftLowerLeg:[-.08,0,0],RightLowerLeg:[-.22,0,0],LeftFoot:[-.12,0,0],RightFoot:[.22,0,0],LeftUpperArm:[-.32,0,-.1],RightUpperArm:[.36,0,.1],Chest:[0,.035,.012]},-.025),
  pose({LeftUpperLeg:[.16,0,0],RightUpperLeg:[-.3,0,0],LeftLowerLeg:[-.25,0,0],RightLowerLeg:[-.8,0,0],LeftFoot:[.1,0,0],RightFoot:[.4,0,0],LeftUpperArm:[-.18,0,-.1],RightUpperArm:[.2,0,.1]},-.045),
  pose({LeftUpperLeg:[-.12,0,0],RightUpperLeg:[.12,0,0],LeftLowerLeg:[-.08,0,0],RightLowerLeg:[-.72,0,0],RightFoot:[.32,0,0]},.015),
  pose({LeftUpperLeg:[-.32,0,0],RightUpperLeg:[.42,0,0],LeftLowerLeg:[-.16,0,0],RightLowerLeg:[-.3,0,0],RightUpperArm:[-.19,0,.1],LeftUpperArm:[.22,0,-.1]},0),
];
function mirror(p) { const rotations={};for(const[name,value]of Object.entries(p.rotations)){const other=name.startsWith('Left')?name.replace('Left','Right'):name.startsWith('Right')?name.replace('Right','Left'):name;rotations[other]=[value[0],-value[1],-value[2]];}return{rotations,hipOffset:p.hipOffset}; }
// ~.74m per step at 2.4m/s; the old .84s cycle demanded >1m of locked stance
// from a leg whose complete hip-to-ankle chain is only .83m.
clip('move',.62,[...walk,...walk.map(mirror),walk[0]]);
const run=[
  pose({Chest:[.12,.045,0],LeftUpperLeg:[.85,0,0],RightUpperLeg:[-.65,0,0],LeftLowerLeg:[-.15,0,0],RightLowerLeg:[-.8,0,0],LeftUpperArm:[-.5,0,-.11],RightUpperArm:[.65,0,.11],LeftForearm:[1.0,0,0],RightForearm:[1.0,0,0]},-.04),
  pose({Chest:[.14,0,0],LeftUpperLeg:[.1,0,0],RightUpperLeg:[-.1,0,0],LeftLowerLeg:[-.5,0,0],RightLowerLeg:[-1.4,0,0],LeftUpperArm:[-.25,0,-.1],RightUpperArm:[.3,0,.1],LeftForearm:[1.15,0,0],RightForearm:[1.15,0,0]},-.075),
  pose({Chest:[.12,0,0],LeftUpperLeg:[-.45,0,0],RightUpperLeg:[.62,0,0],LeftLowerLeg:[-.32,0,0],RightLowerLeg:[-.95,0,0],LeftUpperArm:[.35,0,-.1],RightUpperArm:[-.3,0,.1],LeftForearm:[1.0,0,0],RightForearm:[1.0,0,0]},.055),
];
clip('sprint',.50,[...run,...run.map(mirror),run[0]]);
const jump=pose({Chest:[.08,0,0],LeftUpperArm:[.65,0,-.22],RightUpperArm:[.8,0,.22],LeftForearm:[.38,0,0],RightForearm:[.32,0,0],LeftUpperLeg:[-.15,0,0],RightUpperLeg:[-.23,0,0],LeftLowerLeg:[-.6,0,0],RightLowerLeg:[-.72,0,0]},-.015);
clip('jump',1,[jump,jump]);
const swimA=pose({Chest:[.23,0,0],LeftUpperArm:[1.6,0,-.45],RightUpperArm:[.55,0,.4],LeftForearm:[.45,0,0],RightForearm:[.8,0,0],LeftUpperLeg:[.2,0,0],RightUpperLeg:[-.15,0,0],LeftLowerLeg:[-.25,0,0],RightLowerLeg:[-.5,0,0]});
clip('swim',1.2,[swimA,mirror(swimA),swimA]);
const seated=pose({LeftUpperLeg:[1.35,0,-.04],RightUpperLeg:[1.35,0,.04],LeftLowerLeg:[-1.35,0,0],RightLowerLeg:[-1.35,0,0],LeftUpperArm:[.55,0,-.05],RightUpperArm:[.55,0,.05],LeftForearm:[.65,0,0],RightForearm:[.65,0,0]},-.16);
clip('plane',1,[seated,seated]);
clip('chop',.8,[pose({RightUpperArm:[.55,0,.12],RightForearm:[.5,0,0]}),pose({Chest:[-.06,-.1,0],RightUpperArm:[2.35,0,.18],RightForearm:[.65,0,0],LeftUpperArm:[.35,0,-.12]}),pose({Chest:[.18,.1,0],RightUpperArm:[.95,0,.12],RightForearm:[.08,0,0],LeftUpperArm:[.3,0,-.1]},-.035),pose({RightUpperArm:[.55,0,.12],RightForearm:[.5,0,0]})],false);
const crouch={Chest:[.3,0,0],Spine:[.16,0,0],LeftUpperLeg:[.5,0,0],RightUpperLeg:[.5,0,0],LeftLowerLeg:[-.8,0,0],RightLowerLeg:[-.8,0,0],LeftUpperArm:[.32,0,-.16],RightUpperArm:[.5,0,.13],LeftForearm:[.3,0,0],RightForearm:[.18,0,0],Head:[-.12,0,0]};
clip('pickup',.85,[pose(),pose(crouch,-.18),pose({...crouch,RightForearm:[.95,0,0],RightUpperArm:[.8,0,.13]},-.09),pose({RightUpperArm:[.55,0,.12],RightForearm:[.9,0,0]})],false);
const work={LeftUpperArm:[.55,0,-.18],RightUpperArm:[.6,0,.18],LeftForearm:[.95,0,0],RightForearm:[.85,0,0],Head:[.12,0,0],Chest:[.035,0,0]};
clip('craft',1,[pose(work),pose({...work,RightForearm:[1.15,0,0],LeftForearm:[.8,0,0]}),pose(work),pose({...work,RightForearm:[.75,0,0],LeftForearm:[1.1,0,0]}),pose(work)],false);

root.userData={asset:'Field explorer',version:2,source:'scripts/build-explorer.mjs',units:'metres',up:'+Y',forward:'-Z',pipeline:'direct offline code authoring / Three GLTFExporter; no Kiln render or bake'};
root.updateMatrixWorld(true);
const exporter=new GLTFExporter();
const result=await exporter.parseAsync(root,{binary:true,animations:clips,onlyVisible:false});
const data=Buffer.from(result);
const dir=fileURLToPath(new URL('../assets/explorer/',import.meta.url));
await mkdir(dir,{recursive:true});await writeFile(`${dir}/explorer.glb`,data);
let vertices=0,triangles=0,meshes=0;root.traverse(n=>{if(n.isMesh){meshes++;vertices+=n.geometry.getAttribute('position').count;triangles+=(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3;}});
const sourceBytes=await readFile(fileURLToPath(import.meta.url));
const receipt={asset:'Field explorer',version:2,source:'scripts/build-explorer.mjs',sourceSha256:createHash('sha256').update(sourceBytes).digest('hex'),pipeline:'offline direct Three GLTFExporter',three:T.REVISION,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,bones:bones.length,clips:clips.map(c=>({name:c.name,duration:c.duration})),skinVertices:body.geometry.getAttribute('position').count,skinTriangles:body.geometry.index.count/3,skinDraws:1,totalAssetMeshes:meshes,totalAssetVertices:vertices,totalAssetTriangles:triangles};
receipt.authoredScale=EXPLORER_SCALE;
receipt.defaultVisibleSkinDraws=4;
receipt.skinModules=[];
root.traverse(n=>{if(n.isSkinnedMesh&&n!==body)receipt.skinModules.push({name:n.name,vertices:n.geometry.getAttribute('position').count,triangles:n.geometry.index.count/3});});
receipt.totalSkins=receipt.skinModules.length+1;
await writeFile(`${dir}/explorer.receipt.json`,JSON.stringify(receipt,null,2)+'\n');
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
