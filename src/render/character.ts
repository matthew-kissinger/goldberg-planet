/**
 * The player's body: a procedural avatar with a right-hand prop socket, readable action
 * poses for the core loop (walk, chop, pick up, craft), and the bush plane in plane mode.
 */

import * as THREE from 'three/webgpu';
import { attribute, color, float, positionLocal, time, vec3 } from 'three/tsl';
import type { Player } from '../player/player';
import { CHARACTER_PROP_IDS, type CharacterAction, type CharacterPropId, type CharacterVisualState } from '../sim/equipment';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const CHARACTER_ACTIONS: readonly CharacterAction[] = [
  'idle', 'move', 'sprint', 'jump', 'swim', 'plane', 'chop', 'craft', 'pickup',
] as const;

export interface CharacterRendererStats {
  visible: boolean;
  meshes: number;
  silhouetteParts: number;
  supportedActions: CharacterAction[];
  heldProp: CharacterPropId;
  heldPropMeshes: number;
}

type SdfVolume = {
  center: [number, number, number];
  radius: [number, number, number];
};

const sdfScratch = new THREE.Vector3();
const sdfCenter = new THREE.Vector3();
const sdfDir = new THREE.Vector3();

function sdEllipsoid(p: THREE.Vector3, volume: SdfVolume): number {
  const [cx, cy, cz] = volume.center;
  const [rx, ry, rz] = volume.radius;
  const x = (p.x - cx) / rx;
  const y = (p.y - cy) / ry;
  const z = (p.z - cz) / rz;
  const k0 = Math.hypot(x, y, z);
  const k1 = Math.hypot(x / rx, y / ry, z / rz);
  return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}

function smoothMin(a: number, b: number, k: number): number {
  const h = clamp01(0.5 + (0.5 * (b - a)) / k);
  return b * (1 - h) + a * h - k * h * (1 - h);
}

function blendSdf(p: THREE.Vector3, volumes: readonly SdfVolume[], blend: number): number {
  let d = sdEllipsoid(p, volumes[0]);
  for (let i = 1; i < volumes.length; i++) d = smoothMin(d, sdEllipsoid(p, volumes[i]), blend);
  return d;
}

function makeBlendShellGeometry(volumes: readonly SdfVolume[], origin: [number, number, number], detail = 2, blend = 0.12): THREE.BufferGeometry {
  const geom = new THREE.IcosahedronGeometry(1, detail).toNonIndexed();
  const pos = geom.getAttribute('position') as THREE.BufferAttribute;
  const out = new Float32Array(pos.count * 3);
  const phase = new Float32Array(pos.count);
  sdfCenter.set(...origin);
  for (let i = 0; i < pos.count; i++) {
    sdfDir.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    let lo = 0;
    let hi = 1.3;
    for (let guard = 0; guard < 4; guard++) {
      sdfScratch.copy(sdfDir).multiplyScalar(hi).add(sdfCenter);
      if (blendSdf(sdfScratch, volumes, blend) >= 0) break;
      hi *= 1.45;
    }
    for (let step = 0; step < 18; step++) {
      const mid = (lo + hi) * 0.5;
      sdfScratch.copy(sdfDir).multiplyScalar(mid).add(sdfCenter);
      if (blendSdf(sdfScratch, volumes, blend) < 0) lo = mid;
      else hi = mid;
    }
    sdfScratch.copy(sdfDir).multiplyScalar((lo + hi) * 0.5).add(sdfCenter);
    out[i * 3] = sdfScratch.x;
    out[i * 3 + 1] = sdfScratch.y;
    out[i * 3 + 2] = sdfScratch.z;
    const rawPhase = Math.sin(sdfDir.x * 12.9898 + sdfDir.y * 78.233 + sdfDir.z * 37.719) * 43758.5453;
    phase[i] = rawPhase - Math.floor(rawPhase);
  }
  geom.setAttribute('position', new THREE.BufferAttribute(out, 3));
  geom.setAttribute('shellPhase', new THREE.BufferAttribute(phase, 1));
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export class Character {
  readonly group: THREE.Group;
  private readonly plane: THREE.Group;
  private readonly prop: THREE.Group;
  private readonly body: THREE.Group;
  private readonly pilotBody: THREE.Group;
  private readonly rightArm = new THREE.Group();
  private readonly leftArm = new THREE.Group();
  private readonly rightLeg = new THREE.Group();
  private readonly leftLeg = new THREE.Group();
  private readonly rightSocket = new THREE.Group();
  private readonly leftSocket = new THREE.Group();
  private readonly heldProps = new Map<CharacterPropId, THREE.Group>();
  private readonly fadeMats: THREE.Material[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly upV = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private propAngle = 0;
  private walkPhase = 0;
  private lastState: CharacterVisualState = {
    action: 'idle',
    held: 'hands',
    actionT: 0,
    actionDuration: 0,
  };

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();

    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const mat = (color: number, roughness = 0.6, metalness = 0.05, emissive = 0x000000): THREE.MeshStandardMaterial => {
      const key = `${color}|${roughness}|${metalness}|${emissive}`;
      const cached = materialCache.get(key);
      if (cached) return cached;
      const m = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        emissive,
        emissiveIntensity: emissive === 0 ? 0 : 0.65,
        transparent: true,
      });
      materialCache.set(key, m);
      this.fadeMats.push(m);
      return m;
    };

    const visorMat = mat(0x2a3d55, 0.25, 0.2);
    const strapMat = mat(0x3b2b22, 0.78, 0.02);
    const hullMat = mat(0xc4502e, 0.55, 0.1);
    const wingMat = mat(0xe8dfc8, 0.7, 0);
    wingMat.side = THREE.DoubleSide;
    const propMat = mat(0x2b2b30, 0.5, 0.1);
    const metalMat = mat(0x9da3a9, 0.54, 0.1);
    const woodMat = mat(0x8b5a33, 0.8, 0.02);
    const glowMat = mat(0xffc15f, 0.35, 0.02, 0xff8a23);
    const coatDark = mat(0x375663, 0.86, 0.02);
    const creamMat = mat(0xe6d59b, 0.78, 0.02);
    const faceMat = mat(0xf0bf7b, 0.66, 0.02);
    const eyeMat = mat(0x101923, 0.35, 0.03, 0x69d7e5);
    const rustMat = mat(0xc4502e, 0.7, 0.04);

    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
    const cyl8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const sphere8 = new THREE.SphereGeometry(0.5, 8, 6);
    const cone8 = new THREE.ConeGeometry(0.5, 1, 8);
    const dodeca = new THREE.DodecahedronGeometry(0.5, 0);
    const torus = new THREE.TorusGeometry(0.18, 0.025, 6, 18);

    const mesh = (geom: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number], scale: [number, number, number], name: string): THREE.Mesh => {
      const m = new THREE.Mesh(geom, material);
      m.name = name;
      m.position.set(...pos);
      m.scale.set(...scale);
      m.castShadow = false;
      m.receiveShadow = true;
      return m;
    };

    const markRole = <T extends THREE.Object3D>(object: T, role: string): T => {
      object.userData.characterReadabilityRole = role;
      return object;
    };


    const makeShellMaterial = (baseColor: number, roughness = 0.84, metalness = 0.02): THREE.MeshStandardNodeMaterial => {
      const material = new THREE.MeshStandardNodeMaterial();
      material.colorNode = color(baseColor);
      material.roughnessNode = float(roughness);
      material.metalnessNode = float(metalness);
      material.transparent = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const shellPhase = float(attribute('shellPhase', 'float') as any);
      const local = positionLocal.sub(vec3(0, 1.04, -0.02));
      const pulse = time.mul(1.35).add(shellPhase.mul(6.283)).sin().mul(0.009);
      material.positionNode = positionLocal.add(local.normalize().mul(pulse));
      this.fadeMats.push(material);
      return material;
    };

    const makeProp = (id: CharacterPropId): THREE.Group => {
      const g = new THREE.Group();
      g.name = `character-prop-${id}`;
      if (id === 'hands') return g;
      if (id === 'wood') {
        g.add(mesh(box, mat(0xa8763f, 0.72, 0.03), [0, 0.2, 0], [0.28, 0.28, 0.28], 'heldBlock'));
        return g;
      }
      if (id === 'planeFrame') {
        const rib = mesh(cyl6, woodMat, [0, 0.28, 0], [0.025, 0.72, 0.025], 'planeFrameCarryRib');
        rib.rotation.z = Math.PI / 2;
        const wing = mesh(box, wingMat, [0, 0.4, -0.02], [0.56, 0.055, 0.2], 'planeFrameCarryWing');
        const cowlHint = mesh(cyl8, hullMat, [0.28, 0.28, -0.02], [0.12, 0.16, 0.12], 'planeFrameCarryCowl');
        cowlHint.rotation.x = Math.PI / 2;
        g.add(rib, wing, cowlHint);
        g.add(mesh(box, strapMat, [0, 0.18, -0.18], [0.52, 0.045, 0.035], 'planeFrameCarryStrap'));
      }
      return g;
    };

    this.pilotBody = new THREE.Group();

    const wayfarerShell = new THREE.Mesh(
      makeBlendShellGeometry([
        { center: [0, 0.96, 0], radius: [0.42, 0.56, 0.34] },
        { center: [0, 0.68, 0.02], radius: [0.34, 0.24, 0.3] },
        { center: [0, 1.42, -0.03], radius: [0.35, 0.32, 0.31] },
        { center: [0, 1.33, -0.28], radius: [0.22, 0.14, 0.1] },
        { center: [-0.34, 1.15, 0], radius: [0.16, 0.22, 0.18] },
        { center: [0.34, 1.15, 0], radius: [0.16, 0.22, 0.18] },
      ], [0, 1.03, -0.02], 2, 0.14),
      makeShellMaterial(0x6fa69b),
    );
    wayfarerShell.name = 'wayfarerSdfBlendShell';
    markRole(wayfarerShell, 'fused soft-facet body shell');
    wayfarerShell.receiveShadow = true;
    this.pilotBody.add(wayfarerShell);

    const bellyPatch = markRole(mesh(dodeca, creamMat, [0, 0.92, -0.31], [0.34, 0.36, 0.08], 'wayfarerBellyPatch'), 'bright front belly patch');
    bellyPatch.rotation.x = -0.08;
    const hoodRim = markRole(mesh(torus, creamMat, [0, 1.39, -0.29], [1.05, 0.68, 0.6], 'wayfarerHoodRim'), 'oversized hood rim');
    hoodRim.rotation.x = Math.PI / 2;
    const face = markRole(mesh(box, faceMat, [0, 1.38, -0.365], [0.28, 0.14, 0.035], 'wayfarerFacePlate'), 'warm face plate');
    const eyeL = markRole(mesh(box, eyeMat, [-0.075, 1.4, -0.389], [0.045, 0.035, 0.018], 'wayfarerEyeL'), 'left glowing eye');
    const eyeR = markRole(mesh(box, eyeMat, [0.075, 1.4, -0.389], [0.045, 0.035, 0.018], 'wayfarerEyeR'), 'right glowing eye');
    const faceNose = markRole(mesh(cone8, faceMat, [0, 1.35, -0.407], [0.04, 0.09, 0.04], 'wayfarerNose'), 'small goofy nose');
    faceNose.rotation.x = -Math.PI / 2;
    const capPebble = markRole(mesh(dodeca, rustMat, [0.08, 1.77, -0.02], [0.11, 0.13, 0.1], 'wayfarerCapPebble'), 'asymmetric cap pebble');
    capPebble.rotation.z = -0.22;
    const hoodEarL = markRole(mesh(dodeca, creamMat, [-0.24, 1.55, -0.24], [0.09, 0.14, 0.055], 'wayfarerHoodEarL'), 'left soft hood ear');
    hoodEarL.rotation.z = -0.32;
    const hoodEarR = markRole(mesh(dodeca, creamMat, [0.24, 1.55, -0.24], [0.09, 0.14, 0.055], 'wayfarerHoodEarR'), 'right soft hood ear');
    hoodEarR.rotation.z = 0.32;
    const scarf = markRole(mesh(torus, rustMat, [-0.06, 1.16, -0.08], [1.35, 0.74, 0.64], 'wayfarerScarfLoop'), 'rust scarf loop');
    scarf.rotation.x = Math.PI / 2;
    scarf.rotation.z = 0.12;
    const scarfTail = markRole(mesh(box, rustMat, [-0.26, 1.02, -0.24], [0.08, 0.36, 0.045], 'wayfarerScarfTail'), 'fluttering scarf tail');
    scarfTail.rotation.z = -0.26;
    const scarfPin = markRole(mesh(sphere8, glowMat, [-0.18, 1.14, -0.34], [0.045, 0.045, 0.03], 'wayfarerScarfPin'), 'warm scarf pin');
    const diagonalStrap = markRole(mesh(box, strapMat, [0.17, 0.95, -0.34], [0.065, 0.62, 0.045], 'wayfarerDiagonalStrap'), 'diagonal carry strap');
    diagonalStrap.rotation.z = 0.48;
    const belt = markRole(mesh(box, strapMat, [0, 0.61, -0.05], [0.52, 0.09, 0.3], 'toolBelt'), 'tool belt');
    const beltBuckle = markRole(mesh(box, metalMat, [0.02, 0.62, -0.26], [0.13, 0.075, 0.04], 'beltBuckle'), 'front belt buckle');
    const satchel = markRole(mesh(dodeca, mat(0x6b4a2f), [-0.36, 0.76, -0.02], [0.21, 0.25, 0.14], 'sideSatchel'), 'left side satchel');
    satchel.rotation.z = -0.08;
    const satchelFlap = markRole(mesh(box, strapMat, [-0.36, 0.86, -0.11], [0.2, 0.045, 0.13], 'sideSatchelFlap'), 'satchel flap');
    satchelFlap.rotation.z = -0.08;
    this.pilotBody.add(bellyPatch, hoodRim, face, eyeL, eyeR, faceNose, capPebble, hoodEarL, hoodEarR, scarf, scarfTail, scarfPin, diagonalStrap, belt, beltBuckle, satchel, satchelFlap);

    const backpack = markRole(mesh(dodeca, coatDark, [0, 0.98, 0.36], [0.34, 0.46, 0.17], 'roundedBackpack'), 'rounded backpack silhouette');
    backpack.rotation.x = 0.08;
    const backPatch = markRole(mesh(dodeca, creamMat, [0, 1.02, 0.53], [0.18, 0.24, 0.055], 'wayfarerBackPatch'), 'rear bright back patch');
    backPatch.rotation.x = 0.16;
    const backStrap = markRole(mesh(box, rustMat, [-0.08, 1.02, 0.56], [0.045, 0.42, 0.04], 'wayfarerBackStrap'), 'rear rust strap');
    backStrap.rotation.z = -0.28;
    const bedroll = markRole(mesh(cyl8, creamMat, [0, 1.42, 0.43], [0.22, 0.36, 0.22], 'wayfarerTopBedroll'), 'top bedroll roll');
    bedroll.rotation.z = Math.PI / 2;
    const bedrollTie = markRole(mesh(box, strapMat, [0, 1.42, 0.66], [0.36, 0.045, 0.035], 'wayfarerBedrollTie'), 'bedroll tie');
    this.pilotBody.add(backpack, backPatch, backStrap, bedroll, bedrollTie);

    const makeArm = (sign: 1 | -1, socket: THREE.Group): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(sign * 0.43, 1.23, -0.02);
      const armShell = new THREE.Mesh(
        makeBlendShellGeometry([
          { center: [0, -0.22, 0], radius: [0.08, 0.22, 0.08] },
          { center: [0, -0.5, -0.02], radius: [0.07, 0.24, 0.07] },
          { center: [0, -0.78, -0.07], radius: [0.11, 0.09, 0.1] },
        ], [0, -0.38, -0.02], 1, 0.055),
        makeShellMaterial(0xe6d59b, 0.8, 0.02),
      );
      armShell.name = sign > 0 ? 'rightSdfBlendArm' : 'leftSdfBlendArm';
      markRole(armShell, sign > 0 ? 'right soft-facet arm' : 'left soft-facet arm');
      arm.add(armShell);
      arm.add(markRole(mesh(dodeca, coatDark, [0, -0.03, 0], [0.12, 0.12, 0.1], sign > 0 ? 'rightShoulderPad' : 'leftShoulderPad'), sign > 0 ? 'right shoulder pad' : 'left shoulder pad'));
      arm.add(markRole(mesh(box, strapMat, [0, -0.67, -0.045], [0.13, 0.045, 0.09], sign > 0 ? 'rightWristWrap' : 'leftWristWrap'), sign > 0 ? 'right wrist wrap' : 'left wrist wrap'));
      const mitten = markRole(mesh(dodeca, rustMat, [0, -0.85, -0.09], [0.13, 0.09, 0.12], sign > 0 ? 'rightWayfarerMitten' : 'leftWayfarerMitten'), sign > 0 ? 'right oversized mitten' : 'left oversized mitten');
      mitten.rotation.x = -0.12;
      arm.add(mitten);
      socket.position.set(0, -0.88, -0.1);
      socket.rotation.set(0.25, 0, sign * 0.08);
      arm.add(socket);
      return arm;
    };
    this.rightArm.add(...makeArm(1, this.rightSocket).children);
    this.rightArm.position.set(0.43, 1.23, -0.02);
    this.leftArm.add(...makeArm(-1, this.leftSocket).children);
    this.leftArm.position.set(-0.43, 1.23, -0.02);

    const setupLeg = (leg: THREE.Group, sign: 1 | -1): void => {
      leg.position.set(sign * 0.18, 0.68, 0.04);
      const legShell = new THREE.Mesh(
        makeBlendShellGeometry([
          { center: [0, -0.12, 0], radius: [0.09, 0.2, 0.08] },
          { center: [0, -0.39, -0.01], radius: [0.075, 0.22, 0.07] },
        ], [0, -0.26, 0], 1, 0.045),
        makeShellMaterial(0x375663, 0.86, 0.02),
      );
      legShell.name = sign > 0 ? 'rightSdfBlendLeg' : 'leftSdfBlendLeg';
      markRole(legShell, sign > 0 ? 'right soft-facet leg' : 'left soft-facet leg');
      leg.add(legShell);
      const boot = markRole(mesh(dodeca, propMat, [0, -0.66, -0.09], [0.18, 0.1, 0.25], sign > 0 ? 'rightBoot' : 'leftBoot'), sign > 0 ? 'right chunky boot' : 'left chunky boot');
      boot.rotation.x = -0.08;
      leg.add(boot);
      leg.add(markRole(mesh(sphere8, metalMat, [0, -0.3, -0.08], [0.07, 0.045, 0.035], sign > 0 ? 'rightKneePad' : 'leftKneePad'), sign > 0 ? 'right knee pad' : 'left knee pad'));
      leg.add(markRole(mesh(box, creamMat, [0, -0.68, -0.28], [0.13, 0.04, 0.06], sign > 0 ? 'rightBootToe' : 'leftBootToe'), sign > 0 ? 'right bright boot toe' : 'left bright boot toe'));
    };
    setupLeg(this.rightLeg, 1);
    setupLeg(this.leftLeg, -1);
    this.pilotBody.add(this.rightArm, this.leftArm, this.rightLeg, this.leftLeg);

    for (const id of CHARACTER_PROP_IDS) {
      if (id === 'hands') continue;
      const held = makeProp(id);
      held.visible = false;
      this.rightSocket.add(held);
      this.heldProps.set(id, held);
    }

    this.body.add(this.pilotBody);

    // --- the plane: a high-wing bush flyer, forward = -Z, pilot rides in the open cockpit ---
    this.plane = new THREE.Group();

    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, 0.55, 12), propMat);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.82, -1.42);
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 1.5, 12), hullMat);
    cabin.rotation.x = Math.PI / 2;
    cabin.position.set(0, 0.85, -0.42);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.48, 1.9, 10), hullMat);
    boom.rotation.x = Math.PI / 2;
    boom.position.set(0, 0.92, 1.27);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 12), propMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.82, -1.9);
    this.plane.add(cowl, cabin, boom, nose);

    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.05), visorMat);
    shield.position.set(0, 1.5, -0.82);
    shield.rotation.x = 0.42;
    this.plane.add(shield);

    const seatedPilot = new THREE.Group();
    seatedPilot.name = 'wayfarerSeatedPilot';
    seatedPilot.position.set(0, 0.88, -0.58);
    const seatedBody = markRole(mesh(dodeca, coatDark, [0, 0.08, 0.03], [0.22, 0.24, 0.18], 'seatedWayfarerBody'), 'plane seated body');
    const seatedHood = markRole(mesh(dodeca, creamMat, [0, 0.38, -0.05], [0.19, 0.17, 0.15], 'seatedWayfarerHood'), 'plane seated hood');
    const seatedFace = markRole(mesh(box, faceMat, [0, 0.37, -0.18], [0.15, 0.07, 0.025], 'seatedWayfarerFace'), 'plane seated face');
    const seatedEye = markRole(mesh(box, eyeMat, [0, 0.39, -0.198], [0.11, 0.018, 0.012], 'seatedWayfarerEyeBand'), 'plane seated eye band');
    const yoke = markRole(mesh(torus, metalMat, [0, 0.14, -0.22], [0.62, 0.48, 0.62], 'seatedPilotYoke'), 'plane steering yoke');
    yoke.rotation.x = Math.PI / 2;
    const handL = markRole(mesh(dodeca, rustMat, [-0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandL'), 'left steering mitten');
    const handR = markRole(mesh(dodeca, rustMat, [0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandR'), 'right steering mitten');
    seatedPilot.add(seatedBody, seatedHood, seatedFace, seatedEye, yoke, handL, handR);
    this.plane.add(seatedPilot);

    for (const sign of [1, -1]) {
      const halfGeo = new THREE.BoxGeometry(3.0, 0.09, 1.15);
      halfGeo.translate(sign * 1.5, 0, 0);
      const half = new THREE.Mesh(halfGeo, wingMat);
      half.position.set(0, 1.86, -0.35);
      half.rotation.z = sign * 0.07;
      const tipGeo = new THREE.BoxGeometry(0.24, 0.11, 1.17);
      tipGeo.translate(sign * 2.9, 0, 0);
      const tip = new THREE.Mesh(tipGeo, hullMat);
      tip.position.copy(half.position);
      tip.rotation.z = half.rotation.z;
      this.plane.add(half, tip);
    }
    const strutR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.58, 6), propMat);
    strutR.position.set(0.99, 1.28, -0.35);
    strutR.rotation.z = -0.8;
    const strutL = strutR.clone();
    strutL.position.x = -0.99;
    strutL.rotation.z = 0.8;
    this.plane.add(strutR, strutL);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.6), hullMat);
    fin.position.set(0, 1.45, 2.0);
    const finTip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.62), wingMat);
    finTip.position.set(0, 1.78, 2.0);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.55), wingMat);
    stab.position.set(0, 1.0, 2.05);
    this.plane.add(fin, finTip, stab);

    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelR = new THREE.Mesh(wheelGeo, propMat);
    wheelR.position.set(0.7, 0.18, -0.85);
    const wheelL = wheelR.clone();
    wheelL.position.x = -0.7;
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.75, 6), hullMat);
    legR.position.set(0.45, 0.51, -0.85);
    legR.rotation.z = 0.87;
    const legL = legR.clone();
    legL.position.x = -0.45;
    legL.rotation.z = -0.87;
    const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 10).rotateZ(Math.PI / 2), propMat);
    tailWheel.position.set(0, 0.58, 2.15);
    const tailStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 6), propMat);
    tailStrut.position.set(0, 0.72, 2.15);
    this.plane.add(wheelR, wheelL, legR, legL, tailWheel, tailStrut);

    this.prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 0.05), propMat);
    const blade2 = blade.clone();
    blade2.rotation.z = Math.PI / 2;
    this.prop.add(blade, blade2);
    this.prop.position.set(0, 0.82, -2.2);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10), propMat);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.set(0, 0.82, -2.32);
    this.plane.add(this.prop, spinner);

    this.plane.visible = false;
    this.body.add(this.plane);

    this.group.add(this.body);
    this.group.visible = false;
    scene.add(this.group);
  }

  state(): CharacterVisualState {
    return { ...this.lastState };
  }

  stats(): CharacterRendererStats {
    const roles = new Set<string>();
    let meshes = 0;
    this.group.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) meshes++;
      const role = part.userData.characterReadabilityRole;
      if (typeof role === 'string') roles.add(role);
    });
    const heldProp = [...this.heldProps.entries()].find(([, obj]) => obj.visible)?.[0] ?? 'hands';
    let heldPropMeshes = 0;
    this.heldProps.get(heldProp)?.traverse((part) => {
      if ((part as THREE.Mesh).isMesh) heldPropMeshes++;
    });
    return {
      visible: this.group.visible,
      meshes,
      silhouetteParts: roles.size,
      supportedActions: [...CHARACTER_ACTIONS],
      heldProp,
      heldPropMeshes,
    };
  }

  /** eye/camera-relative update; camWorld is f64 */
  update(
    player: Player,
    camWorld: { x: number; y: number; z: number },
    camDist: number,
    dt: number,
    visual?: CharacterVisualState,
  ): void {
    const alpha = Math.max(0, Math.min(1, (camDist - 1.3) / 1.7));
    const show = alpha > 0.02;
    this.group.visible = show;
    if (!show) return;
    for (const m of this.fadeMats) m.opacity = alpha;

    const speed = Math.hypot(player.vx, player.vy, player.vz);
    this.walkPhase += dt * Math.max(1.5, Math.min(12, speed * 1.35));
    const moving = player.mode === 'walk' && speed > 0.45;
    const state: CharacterVisualState = visual ?? {
      action: moving ? 'move' : 'idle',
      held: 'hands',
      actionT: 0,
      actionDuration: 0,
    };
    this.lastState = { ...state };

    this.plane.visible = player.mode === 'plane';
    this.pilotBody.visible = player.mode !== 'plane';
    this.applyEquipment(state);
    this.applyPose(state, moving);

    const [ux, uy, uz] = player.up();
    this.upV.set(ux, uy, uz);
    this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ);
    this.right.crossVectors(this.upV, this.back);
    this.m.makeBasis(this.right, this.upV, this.back);
    this.group.quaternion.setFromRotationMatrix(this.m);

    if (player.mode === 'plane') {
      const v = Math.hypot(player.vx, player.vy, player.vz);
      if (v > 1) {
        const vr = (player.vx * ux + player.vy * uy + player.vz * uz) / v;
        const vp = Math.asin(Math.max(-1, Math.min(1, vr)));
        this.q.setFromAxisAngle(this.right.normalize(), vp * 0.8);
        this.group.quaternion.premultiply(this.q);
      }
      this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ).normalize();
      this.q.setFromAxisAngle(this.back, player.bank);
      this.group.quaternion.premultiply(this.q);
      this.propAngle += dt * (8 + player.planeSpeed * 0.5);
      this.prop.rotation.z = this.propAngle;
    }

    const s = player.stepSmooth;
    this.group.position.set(
      player.px - camWorld.x - this.upV.x * s,
      player.py - camWorld.y - this.upV.y * s,
      player.pz - camWorld.z - this.upV.z * s,
    );
  }

  private applyEquipment(state: CharacterVisualState): void {
    for (const [id, obj] of this.heldProps) obj.visible = id === state.held;
  }

  private applyPose(state: CharacterVisualState, moving: boolean): void {
    this.pilotBody.position.set(0, moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.025 : Math.sin(this.walkPhase * 0.6) * 0.006, 0);
    this.pilotBody.rotation.set(0, 0, 0);
    const setSquash = (amount: number): void => {
      const a = Math.max(-0.05, Math.min(0.07, amount));
      this.pilotBody.scale.set(1 + a * 0.85, 1 - a, 1 + a * 0.55);
    };
    setSquash(Math.sin(this.walkPhase * 0.6) * 0.008);
    this.rightArm.rotation.set(0.08, 0, -0.2);
    this.leftArm.rotation.set(0.08, 0, 0.2);
    this.rightLeg.rotation.set(0, 0, -0.04);
    this.leftLeg.rotation.set(0, 0, 0.04);
    this.rightSocket.rotation.set(0.25, 0, 0.08);
    this.leftSocket.rotation.set(0.25, 0, -0.08);

    const active = state.action !== 'idle' && state.actionDuration > 0 && state.actionT < state.actionDuration;
    const p = active ? clamp01(state.actionT / state.actionDuration) : 0;
    const swing = Math.sin(p * Math.PI);

    const applyGait = (intensity: number): void => {
      const gait = Math.sin(this.walkPhase);
      const lift = Math.max(0, Math.sin(this.walkPhase * 2));
      this.rightArm.rotation.x = gait * 0.3 * intensity;
      this.leftArm.rotation.x = -gait * 0.3 * intensity;
      this.rightLeg.rotation.x = -gait * 0.52 * intensity;
      this.leftLeg.rotation.x = gait * 0.52 * intensity;
      this.pilotBody.rotation.x = -0.03 * intensity;
      this.pilotBody.rotation.z = gait * 0.018 * intensity;
      this.pilotBody.position.y += lift * 0.018 * intensity;
      setSquash(lift * 0.028 * intensity);
    };

    if (!active) {
      if (state.action === 'move') {
        applyGait(1);
        return;
      }
      if (state.action === 'sprint') {
        applyGait(1.45);
        this.rightArm.rotation.z = -0.34;
        this.leftArm.rotation.z = 0.34;
        this.pilotBody.rotation.x = -0.08;
        return;
      }
      if (state.action === 'jump') {
        // Arms reach forward/up, legs tuck back — rotation.x > 0 swings a hanging limb
        // toward -Z (the character's front); this pose had both pairs backwards.
        this.rightArm.rotation.x = 0.62;
        this.leftArm.rotation.x = 0.5;
        this.rightArm.rotation.z = -0.36;
        this.leftArm.rotation.z = 0.36;
        this.rightLeg.rotation.x = -0.48;
        this.leftLeg.rotation.x = -0.32;
        this.rightLeg.rotation.z = -0.18;
        this.leftLeg.rotation.z = 0.18;
        this.pilotBody.rotation.x = -0.08;
        setSquash(-0.035);
        return;
      }
      if (state.action === 'swim') {
        const paddle = Math.sin(this.walkPhase * 1.35);
        this.rightArm.rotation.x = -0.82 + paddle * 0.22;
        this.leftArm.rotation.x = -0.82 - paddle * 0.22;
        this.rightArm.rotation.z = -0.58;
        this.leftArm.rotation.z = 0.58;
        this.rightLeg.rotation.x = -0.2 - paddle * 0.26;
        this.leftLeg.rotation.x = -0.2 + paddle * 0.26;
        this.pilotBody.rotation.x = -0.28;
        setSquash(0.018 + Math.abs(paddle) * 0.012);
        return;
      }
      if (state.action === 'plane') {
        this.rightArm.rotation.x = -0.32;
        this.leftArm.rotation.x = -0.32;
        this.rightLeg.rotation.x = 0.22;
        this.leftLeg.rotation.x = 0.22;
        setSquash(0.012);
        return;
      }
    } else if (moving && (state.action === 'move' || state.action === 'sprint')) {
      applyGait(state.action === 'sprint' ? 1.45 : 1);
      return;
    }

    switch (state.action) {
      case 'chop':
        // rotation.x > 0 swings a hanging arm toward -Z (the character's front, where the
        // target sits) — this was negative, swinging the tool backward instead of striking forward.
        this.rightArm.rotation.x = 0.45 + swing * 1.35;
        this.rightArm.rotation.z = -0.32;
        this.rightSocket.rotation.z = 0.55 * swing;
        this.leftArm.rotation.x = 0.25;
        this.pilotBody.rotation.x = -0.06 * swing;
        this.rightLeg.rotation.x = -0.08;
        this.leftLeg.rotation.x = 0.12;
        setSquash(swing * 0.026);
        break;
      case 'craft':
        this.rightArm.rotation.x = -0.85 + Math.sin(p * Math.PI * 4) * 0.12;
        this.leftArm.rotation.x = -0.75 - Math.sin(p * Math.PI * 4) * 0.12;
        this.rightArm.rotation.z = -0.42;
        this.leftArm.rotation.z = 0.42;
        this.rightLeg.rotation.x = 0.06;
        this.leftLeg.rotation.x = 0.06;
        setSquash(Math.abs(Math.sin(p * Math.PI * 4)) * 0.012);
        break;
      case 'pickup': {
        const reach = Math.sin(Math.min(1, p * 1.25) * Math.PI);
        const lift = clamp01((p - 0.36) / 0.64);
        this.pilotBody.rotation.x = -0.22 * reach + 0.04 * lift;
        this.pilotBody.position.y -= 0.045 * reach;
        this.rightArm.rotation.x = -0.96 - reach * 0.34 + lift * 0.3;
        this.leftArm.rotation.x = -0.78 - reach * 0.22 + lift * 0.22;
        this.rightArm.rotation.z = -0.26 - reach * 0.2 + lift * 0.1;
        this.leftArm.rotation.z = 0.24 + reach * 0.16 - lift * 0.08;
        this.rightSocket.rotation.x = 0.82 * reach - 0.18 * lift;
        this.rightSocket.rotation.z = -0.26 * reach + 0.18 * lift;
        this.leftSocket.rotation.x = 0.6 * reach;
        this.rightLeg.rotation.x = 0.22 * reach - 0.08 * lift;
        this.leftLeg.rotation.x = 0.18 * reach;
        this.rightLeg.rotation.z = -0.08 - 0.08 * reach;
        this.leftLeg.rotation.z = 0.08 + 0.08 * reach;
        setSquash(0.04 * reach - 0.018 * lift);
        break;
      }
      default:
        break;
    }
  }
}
