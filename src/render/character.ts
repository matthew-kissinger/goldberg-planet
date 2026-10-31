/**
 * The player's body & vehicles:
 *  - Wayfarer avatar with a right-hand prop socket (hands, wood, flint hatchet, stone pickaxe,
 *    hunting spear, roasted meat, skiff frame) and readable action poses (walk, chop, pickup, craft)
 *  - Twin-Rotor "Sky-Hopper" Atmospheric Skiff (Kiln-verified mid-tier explorer craft)
 *  - "Starfarer" Interplanetary Starship (Kiln-verified delta-wing spacecraft for orbital & planet-to-planet flight)
 */

import * as THREE from 'three/webgpu';
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

export class Character {
  readonly group: THREE.Group;
  private readonly plane: THREE.Group;
  private readonly skyHopper: THREE.Group;
  private readonly starship: THREE.Group;
  private readonly rotorBlades: THREE.Object3D[] = [];
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
    const mat = (colorHex: number, roughness = 0.6, metalness = 0.05, emissive = 0x000000): THREE.MeshStandardMaterial => {
      const key = `${colorHex}|${roughness}|${metalness}|${emissive}`;
      const cached = materialCache.get(key);
      if (cached) return cached;
      const m = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness,
        metalness,
        emissive,
        emissiveIntensity: emissive === 0 ? 0 : 0.75,
        transparent: true,
        flatShading: true,
      });
      materialCache.set(key, m);
      this.fadeMats.push(m);
      return m;
    };

    const strapMat = mat(0x3b2b22, 0.78, 0.02);
    const hullMat = mat(0xc4502e, 0.55, 0.15);
    const wingMat = mat(0xe8dfc8, 0.55, 0.15);
    wingMat.side = THREE.DoubleSide;
    const propMat = mat(0x2b2b30, 0.5, 0.35);
    const metalMat = mat(0x9da3a9, 0.45, 0.55);
    const woodMat = mat(0x8b5a33, 0.8, 0.02);
    const glowMat = mat(0xffc15f, 0.35, 0.02, 0xff8a23);
    const cyanThrusterMat = mat(0x48f0ff, 0.2, 0.1, 0x10b8ff);
    const goldVisorMat = mat(0xe8a838, 0.22, 0.85, 0x442800);
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

    const makeProp = (id: CharacterPropId): THREE.Group => {
      const g = new THREE.Group();
      g.name = `character-prop-${id}`;
      if (id === 'hands') return g;
      if (id === 'wood') {
        g.add(mesh(box, mat(0xa8763f, 0.72, 0.03), [0, 0.2, 0], [0.28, 0.28, 0.28], 'heldBlock'));
        return g;
      }
      if (id === 'hatchet') {
        const handle = mesh(cyl6, woodMat, [0, 0.22, 0], [0.055, 0.56, 0.055], 'hatchetHandle');
        const blade = mesh(box, metalMat, [0, 0.44, -0.10], [0.05, 0.18, 0.24], 'hatchetBlade');
        g.add(handle, blade);
        return g;
      }
      if (id === 'pickaxe') {
        const handle = mesh(cyl6, woodMat, [0, 0.24, 0], [0.055, 0.62, 0.055], 'pickaxeHandle');
        const head = mesh(box, metalMat, [0, 0.50, 0], [0.06, 0.09, 0.44], 'pickaxeHead');
        g.add(handle, head);
        return g;
      }
      if (id === 'spear') {
        const shaft = mesh(cyl6, woodMat, [0, 0.36, 0], [0.045, 1.15, 0.045], 'spearShaft');
        const tip = mesh(cone8, metalMat, [0, 0.98, 0], [0.09, 0.24, 0.09], 'spearTip');
        g.add(shaft, tip);
        return g;
      }
      if (id === 'cooked_meat') {
        const roast = mesh(dodeca, mat(0xd87a32, 0.65, 0.05), [0, 0.20, 0], [0.26, 0.20, 0.22], 'heldRoastMeat');
        const bone = mesh(cyl6, creamMat, [0, 0.20, 0], [0.05, 0.36, 0.05], 'heldRoastBone');
        bone.rotation.x = Math.PI / 2;
        g.add(roast, bone);
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

    const armorTealMat = mat(0x2d5e72, 0.55, 0.18);
    const armorCreamMat = mat(0xe8ddc2, 0.65, 0.08);
    const slateDarkMat = mat(0x1e2836, 0.72, 0.15);
    const leatherMat = mat(0x7c4f2b, 0.78, 0.04);

    // Heroic Tapered Torso & Pelvis (replaces the old bulbous egg blob while preserving part name/role)
    const wayfarerShell = markRole(
      mesh(cyl8, armorTealMat, [0, 1.12, 0], [0.46, 0.52, 0.34], 'wayfarerSdfBlendShell'),
      'fused soft-facet body shell',
    );
    const pelvis = markRole(mesh(cyl8, slateDarkMat, [0, 0.78, 0], [0.36, 0.18, 0.28], 'wayfarerPelvis'), 'articulated pelvis');
    this.pilotBody.add(wayfarerShell, pelvis);

    const bellyPatch = markRole(mesh(box, armorCreamMat, [0, 1.18, -0.15], [0.32, 0.26, 0.10], 'wayfarerBellyPatch'), 'bright front belly patch');
    const suitCoreNode = markRole(mesh(cyl6, cyanThrusterMat, [0, 1.20, -0.21], [0.11, 0.04, 0.11], 'wayfarerSuitCore'), 'glowing suit chest core');
    suitCoreNode.rotation.x = Math.PI / 2;

    // Articulated Explorer Helmet & Panoramic Visor Head (y = 1.44 .. 1.80m)
    const helmetShell = markRole(mesh(sphere8, armorCreamMat, [0, 1.59, 0], [0.38, 0.40, 0.40], 'wayfarerHelmetShell'), 'explorer helmet shell');
    const hoodRim = markRole(mesh(box, armorTealMat, [0, 1.71, -0.04], [0.34, 0.06, 0.28], 'wayfarerHoodRim'), 'oversized hood rim');
    hoodRim.rotation.x = 0.12;
    const face = markRole(mesh(box, goldVisorMat, [0, 1.58, -0.15], [0.27, 0.13, 0.10], 'wayfarerFacePlate'), 'warm face plate');
    const eyeL = markRole(mesh(box, cyanThrusterMat, [-0.065, 1.58, -0.205], [0.045, 0.028, 0.02], 'wayfarerEyeL'), 'left glowing eye');
    const eyeR = markRole(mesh(box, cyanThrusterMat, [0.065, 1.58, -0.205], [0.045, 0.028, 0.02], 'wayfarerEyeR'), 'right glowing eye');
    const faceNose = markRole(mesh(cone8, faceMat, [0, 1.54, -0.20], [0.03, 0.05, 0.03], 'wayfarerNose'), 'small goofy nose');
    faceNose.rotation.x = -Math.PI / 2;
    const capPebble = markRole(mesh(cyl6, metalMat, [0.17, 1.73, 0.03], [0.028, 0.16, 0.028], 'wayfarerCapPebble'), 'asymmetric cap pebble');
    const antennaTip = markRole(mesh(sphere8, cyanThrusterMat, [0.17, 1.82, 0.03], [0.05, 0.05, 0.05], 'wayfarerAntennaTip'), 'helmet comms beacon');
    const hoodEarL = markRole(mesh(cyl6, armorTealMat, [-0.19, 1.58, 0], [0.10, 0.06, 0.10], 'wayfarerHoodEarL'), 'left soft hood ear');
    hoodEarL.rotation.z = Math.PI / 2;
    const hoodEarR = markRole(mesh(cyl6, armorTealMat, [0.19, 1.58, 0], [0.10, 0.06, 0.10], 'wayfarerHoodEarR'), 'right soft hood ear');
    hoodEarR.rotation.z = Math.PI / 2;

    // Weather Scarf & Harness Straps
    const scarf = markRole(mesh(cyl8, rustMat, [0, 1.38, 0], [0.44, 0.11, 0.36], 'wayfarerScarfLoop'), 'rust scarf loop');
    const scarfTail = markRole(mesh(box, rustMat, [-0.14, 1.20, 0.24], [0.11, 0.34, 0.04], 'wayfarerScarfTail'), 'fluttering scarf tail');
    scarfTail.rotation.set(0.22, 0, -0.18);
    const scarfPin = markRole(mesh(sphere8, glowMat, [-0.14, 1.37, -0.18], [0.05, 0.05, 0.04], 'wayfarerScarfPin'), 'warm scarf pin');
    const diagonalStrap = markRole(mesh(box, leatherMat, [0.11, 1.12, -0.18], [0.06, 0.42, 0.04], 'wayfarerDiagonalStrap'), 'diagonal carry strap');
    diagonalStrap.rotation.z = 0.22;
    const diagonalStrapL = markRole(mesh(box, leatherMat, [-0.11, 1.12, -0.18], [0.06, 0.42, 0.04], 'wayfarerDiagonalStrapL'), 'left harness strap');
    diagonalStrapL.rotation.z = -0.22;

    // Utility Belt & Satchel
    const belt = markRole(mesh(cyl8, leatherMat, [0, 0.82, 0], [0.40, 0.09, 0.32], 'toolBelt'), 'tool belt');
    const beltBuckle = markRole(mesh(box, goldVisorMat, [0, 0.82, -0.17], [0.11, 0.08, 0.05], 'beltBuckle'), 'front belt buckle');
    const satchel = markRole(mesh(box, leatherMat, [-0.23, 0.76, 0.02], [0.10, 0.20, 0.18], 'sideSatchel'), 'left side satchel');
    satchel.rotation.z = -0.10;
    const satchelFlap = markRole(mesh(box, strapMat, [-0.23, 0.85, 0.02], [0.11, 0.04, 0.19], 'sideSatchelFlap'), 'satchel flap');
    satchelFlap.rotation.z = -0.10;
    this.pilotBody.add(
      bellyPatch, suitCoreNode, helmetShell, hoodRim, face, eyeL, eyeR, faceNose,
      capPebble, antennaTip, hoodEarL, hoodEarR, scarf, scarfTail, scarfPin,
      diagonalStrap, diagonalStrapL, belt, beltBuckle, satchel, satchelFlap,
    );

    // Compact Expedition Backpack, Glowing Power Node & Camp Lantern
    const backpack = markRole(mesh(box, slateDarkMat, [0, 1.16, 0.22], [0.32, 0.38, 0.16], 'roundedBackpack'), 'rounded backpack silhouette');
    const backPatch = markRole(mesh(box, armorCreamMat, [0, 1.28, 0.225], [0.30, 0.14, 0.17], 'wayfarerBackPatch'), 'rear bright back patch');
    const backStrap = markRole(mesh(cyl6, cyanThrusterMat, [0, 1.14, 0.31], [0.09, 0.04, 0.09], 'wayfarerBackStrap'), 'rear rust strap');
    backStrap.rotation.x = Math.PI / 2;
    const packLantern = markRole(mesh(cyl6, glowMat, [0.19, 1.06, 0.24], [0.08, 0.11, 0.08], 'wayfarerPackLantern'), 'backpack camp lantern');
    const bedroll = markRole(mesh(cyl8, rustMat, [0, 1.41, 0.22], [0.15, 0.36, 0.15], 'wayfarerTopBedroll'), 'top bedroll roll');
    bedroll.rotation.z = Math.PI / 2;
    const bedrollTie = markRole(mesh(box, strapMat, [0, 1.41, 0.30], [0.30, 0.04, 0.03], 'wayfarerBedrollTie'), 'bedroll tie');
    this.pilotBody.add(backpack, backPatch, backStrap, packLantern, bedroll, bedrollTie);

    const makeArm = (sign: 1 | -1, socket: THREE.Group): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(sign * 0.31, 1.30, 0);
      const armShell = markRole(
        mesh(cyl6, armorTealMat, [0, -0.22, 0], [0.115, 0.28, 0.115], sign > 0 ? 'rightSdfBlendArm' : 'leftSdfBlendArm'),
        sign > 0 ? 'right soft-facet arm' : 'left soft-facet arm',
      );
      const forearm = markRole(
        mesh(cyl6, armorCreamMat, [0, -0.46, -0.02], [0.105, 0.24, 0.105], sign > 0 ? 'rightForearm' : 'leftForearm'),
        sign > 0 ? 'right articulated forearm' : 'left articulated forearm',
      );
      arm.add(armShell, forearm);
      arm.add(markRole(mesh(sphere8, armorCreamMat, [0, 0.0, 0], [0.19, 0.16, 0.18], sign > 0 ? 'rightShoulderPad' : 'leftShoulderPad'), sign > 0 ? 'right shoulder pad' : 'left shoulder pad'));
      arm.add(markRole(mesh(box, strapMat, [0, -0.56, -0.03], [0.12, 0.045, 0.11], sign > 0 ? 'rightWristWrap' : 'leftWristWrap'), sign > 0 ? 'right wrist wrap' : 'left wrist wrap'));
      const mitten = markRole(mesh(box, rustMat, [0, -0.64, -0.04], [0.10, 0.11, 0.11], sign > 0 ? 'rightWayfarerMitten' : 'leftWayfarerMitten'), sign > 0 ? 'right oversized mitten' : 'left oversized mitten');
      arm.add(mitten);
      socket.position.set(0, -0.66, -0.06);
      socket.rotation.set(0.25, 0, sign * 0.08);
      arm.add(socket);
      return arm;
    };
    this.rightArm.add(...makeArm(1, this.rightSocket).children);
    this.rightArm.position.set(0.31, 1.30, 0);
    this.leftArm.add(...makeArm(-1, this.leftSocket).children);
    this.leftArm.position.set(-0.31, 1.30, 0);

    const setupLeg = (leg: THREE.Group, sign: 1 | -1): void => {
      leg.position.set(sign * 0.15, 0.72, 0.0);
      const thigh = markRole(
        mesh(cyl6, slateDarkMat, [0, -0.14, 0], [0.15, 0.28, 0.15], sign > 0 ? 'rightThigh' : 'leftThigh'),
        sign > 0 ? 'right articulated thigh' : 'left articulated thigh',
      );
      const legShell = markRole(
        mesh(cyl6, armorTealMat, [0, -0.38, 0], [0.125, 0.28, 0.125], sign > 0 ? 'rightSdfBlendLeg' : 'leftSdfBlendLeg'),
        sign > 0 ? 'right soft-facet leg' : 'left soft-facet leg',
      );
      leg.add(thigh, legShell);
      const boot = markRole(mesh(box, leatherMat, [0, -0.62, -0.02], [0.15, 0.18, 0.22], sign > 0 ? 'rightBoot' : 'leftBoot'), sign > 0 ? 'right chunky boot' : 'left chunky boot');
      leg.add(boot);
      leg.add(markRole(mesh(box, armorCreamMat, [0, -0.30, -0.06], [0.11, 0.10, 0.06], sign > 0 ? 'rightKneePad' : 'leftKneePad'), sign > 0 ? 'right knee pad' : 'left knee pad'));
      leg.add(markRole(mesh(box, armorCreamMat, [0, -0.67, -0.14], [0.13, 0.06, 0.07], sign > 0 ? 'rightBootToe' : 'leftBootToe'), sign > 0 ? 'right bright boot toe' : 'left bright boot toe'));
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

    // --- Vehicle Root Group (forward = -Z) ---
    this.plane = new THREE.Group();

    // =========================================================================
    // 1. THE "SKY-HOPPER" TWIN-ROTOR ATMOSPHERIC SKIFF (Kiln-verified mid-tier craft)
    // =========================================================================
    this.skyHopper = new THREE.Group();
    this.skyHopper.name = 'skyHopperSkiff';

    for (const sx of [-0.62, 0.62]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.08, 1.96), propMat);
      skid.position.set(sx, 0.04, 0);
      const strutF = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 5), propMat);
      strutF.position.set(sx * 0.85, 0.25, -0.48);
      strutF.rotation.z = sx * 0.28;
      const strutB = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 5), propMat);
      strutB.position.set(sx * 0.85, 0.25, 0.48);
      strutB.rotation.z = sx * 0.28;
      this.skyHopper.add(skid, strutF, strutB);
    }

    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.38, 1.68), wingMat);
    tub.position.set(0, 0.56, 0);
    const noseFairing = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.66, 6), hullMat);
    noseFairing.rotation.x = -Math.PI / 2;
    noseFairing.position.set(0, 0.58, -1.14);
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.42, 0.48), goldVisorMat);
    windshield.position.set(0, 0.88, -0.34);
    windshield.rotation.x = -0.38;
    const rollBar = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.52, 0.08), propMat);
    rollBar.position.set(0, 0.98, 0.22);
    this.skyHopper.add(tub, noseFairing, windshield, rollBar);

    const seatedPilot = new THREE.Group();
    seatedPilot.name = 'wayfarerSeatedPilot';
    seatedPilot.position.set(0, 0.78, -0.05);
    const seatedBody = markRole(mesh(dodeca, coatDark, [0, 0.08, 0.03], [0.22, 0.24, 0.18], 'seatedWayfarerBody'), 'plane seated body');
    const seatedHood = markRole(mesh(dodeca, creamMat, [0, 0.38, -0.05], [0.19, 0.17, 0.15], 'seatedWayfarerHood'), 'plane seated hood');
    const seatedFace = markRole(mesh(box, faceMat, [0, 0.37, -0.18], [0.15, 0.07, 0.025], 'seatedWayfarerFace'), 'plane seated face');
    const seatedEye = markRole(mesh(box, eyeMat, [0, 0.39, -0.198], [0.11, 0.018, 0.012], 'seatedWayfarerEyeBand'), 'plane seated eye band');
    const yoke = markRole(mesh(torus, metalMat, [0, 0.14, -0.22], [0.62, 0.48, 0.62], 'seatedPilotYoke'), 'plane steering yoke');
    yoke.rotation.x = Math.PI / 2;
    const handL = markRole(mesh(dodeca, rustMat, [-0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandL'), 'left steering mitten');
    const handR = markRole(mesh(dodeca, rustMat, [0.13, 0.12, -0.19], [0.055, 0.045, 0.045], 'seatedPilotHandR'), 'right steering mitten');
    seatedPilot.add(seatedBody, seatedHood, seatedFace, seatedEye, yoke, handL, handR);
    this.skyHopper.add(seatedPilot);

    // Twin Outrigger Ducted Rotor Nacelles
    for (const sx of [-1.22, 1.22]) {
      const boomArm = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.22), propMat);
      boomArm.position.set(sx * 0.62, 0.68, 0.05);
      const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.22, 10, 1, true), hullMat);
      shroud.position.set(sx, 0.72, 0.05);
      const rotorHub = new THREE.Group();
      rotorHub.position.set(sx, 0.74, 0.05);
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.80, 0.03, 0.10), metalMat);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, 0.80), metalMat);
      rotorHub.add(b1, b2);
      this.rotorBlades.push(rotorHub);
      const glowRing = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.04, 8), cyanThrusterMat);
      glowRing.position.set(sx, 0.63, 0.05);
      this.skyHopper.add(boomArm, shroud, rotorHub, glowRing);
    }

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.44), hullMat);
    tailFin.position.set(0, 0.94, 0.78);
    this.skyHopper.add(tailFin);
    this.plane.add(this.skyHopper);

    // =========================================================================
    // 2. THE "STARFARER" INTERPLANETARY STARSHIP (Kiln-verified space craft)
    // =========================================================================
    this.starship = new THREE.Group();
    this.starship.name = 'starfarerStarship';

    for (const [lx, lz] of [[-0.68, 0.42], [0.68, 0.42], [0, -0.78]] as const) {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.08, 6), propMat);
      foot.position.set(lx, 0.04, lz);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.38, 6), propMat);
      strut.position.set(lx * 0.82, 0.23, lz * 0.88);
      this.starship.add(foot, strut);
    }

    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 1.95, 8), wingMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.set(0, 0.64, 0.05);

    const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.95, 8), hullMat);
    noseCone.rotation.x = -Math.PI / 2;
    noseCone.position.set(0, 0.64, -1.40);

    const canopyGlass = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.92), goldVisorMat);
    canopyGlass.position.set(0, 0.94, -0.25);
    canopyGlass.rotation.x = -0.16;

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 1.15), wingMat);
    wingL.position.set(-0.78, 0.56, 0.25);
    wingL.rotation.y = -0.28;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.09, 1.15), wingMat);
    wingR.position.set(0.78, 0.56, 0.25);
    wingR.rotation.y = 0.28;

    const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.58), hullMat);
    wingTipL.position.set(-1.32, 0.70, 0.44);
    const wingTipR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.58), hullMat);
    wingTipR.position.set(1.32, 0.70, 0.44);

    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.54, 0.74), hullMat);
    dorsalFin.position.set(0, 1.08, 0.58);

    this.starship.add(fuselage, noseCone, canopyGlass, wingL, wingR, wingTipL, wingTipR, dorsalFin);

    for (const nx of [-0.32, 0.32]) {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.28, 0.36, 8), propMat);
      bell.rotation.x = Math.PI / 2;
      bell.position.set(nx, 0.62, 1.16);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.14, 8), cyanThrusterMat);
      core.rotation.x = Math.PI / 2;
      core.position.set(nx, 0.62, 1.32);
      this.starship.add(bell, core);
    }

    this.starship.visible = false;
    this.plane.add(this.starship);

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
    if (player.mode === 'plane') {
      const useStarship = player.inSpaceCruise || player.hasOrbitalThruster;
      this.starship.visible = useStarship;
      this.skyHopper.visible = !useStarship;
    }
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
      this.propAngle += dt * (10 + player.planeSpeed * 0.55);
      for (const rotor of this.rotorBlades) {
        rotor.rotation.y = this.propAngle;
      }
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
