/** The offline-authored explorer, blended clips, equipment, and expedition vehicles. */
import * as THREE from 'three/webgpu';
import { WALK_SPEED, SPRINT_SPEED } from '../player/locomotion';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Player } from '../player/player';
import { CHARACTER_PROP_IDS, type CharacterAction, type CharacterPropId, type CharacterVisualState } from '../sim/equipment';
import { instantiateExplorer, loadExplorerAsset, type ExplorerPoseContext, type ExplorerPoseModifier, type ExplorerRig } from './explorerAsset';
import { applyExplorerAppearance, DEFAULT_APPEARANCE, normalizeAppearance, type ExplorerAppearance } from './explorerKit';

const ACTIONS: readonly CharacterAction[] = ['idle', 'move', 'sprint', 'jump', 'swim', 'plane', 'chop', 'craft', 'pickup'];
const ONE_SHOTS = new Set<CharacterAction>(['chop', 'craft', 'pickup']);

export interface CharacterRendererStats {
  ready: boolean;
  visible: boolean;
  meshes: number;
  visibleDraws: number;
  skinnedMeshes: number;
  bones: number;
  clips: number;
  skinTriangles: number;
  activeClip: CharacterAction | null;
  supportedActions: CharacterAction[];
  heldProp: CharacterPropId;
  heldPropMeshes: number;
}

/** Stance weight follows the authored left-foot contact at phase zero. */
export function explorerContactWeight(phase: number, sprint = false): number {
  const p = ((phase % 1) + 1) % 1;
  // Walk toe-off meets the opposite foot's contact at .5. At the authored
  // .62s / 2.4m/s pace, the locked interval travels ~.73m, matching this rig's
  // forward/back foot reach. Sprint has a shorter stance and an aerial phase.
  const stanceEnd = sprint ? 0.34 : 0.5;
  const release = sprint ? 0.07 : 0.08;
  if (p < stanceEnd - release) return 1;
  if (p < stanceEnd) return 1 - (p - stanceEnd + release) / release;
  if (p > 0.96) return (p - 0.96) / 0.04;
  return 0;
}

export class Character {
  readonly group = new THREE.Group();
  /** Boot must await this before compiling or removing the loading screen. */
  readonly ready: Promise<void>;
  private explorer: ExplorerRig | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private assetRoot: THREE.Group | null = null;
  private plane: THREE.Object3D | null = null;
  private skiff: THREE.Object3D | null = null;
  private starship: THREE.Object3D | null = null;
  private rotorBlades: THREE.Object3D[] = [];
  private readonly heldProps = new Map<CharacterPropId, THREE.Object3D>();
  private readonly actions = new Map<CharacterAction, THREE.AnimationAction>();
  private readonly materials = new Set<THREE.Material>();
  private readonly ownedGeometry = new Set<THREE.BufferGeometry>();
  private appearance: ExplorerAppearance = { ...DEFAULT_APPEARANCE };
  private readonly authoredPose: Array<{ bone: THREE.Bone; position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }> = [];
  private currentAction: CharacterAction | null = null;
  private poseModifier?: ExplorerPoseModifier;
  private context: ExplorerPoseContext | null = null;
  private readonly contacts: [number, number] = [1, 1];
  private readonly matrix = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private propAngle = 0;
  private previousActionT = 0;
  private disposed = false;
  private lastState: CharacterVisualState = { action: 'idle', held: 'hands', actionT: 0, actionDuration: 0 };

  constructor(scene: THREE.Scene, asset?: GLTF) {
    this.group.name = 'expeditionCharacter';
    this.group.visible = false;
    scene.add(this.group);
    this.ready = (asset ? Promise.resolve(asset) : loadExplorerAsset()).then(source => {
      if (this.disposed) return;
      const instance = instantiateExplorer(source);
      this.assetRoot = instance.scene;
      this.explorer = instance.rig;
      applyExplorerAppearance(this.explorer.root, this.appearance, this.ownedGeometry);
      this.group.add(instance.scene);
      this.plane = instance.scene.getObjectByName('explorerVehicles')!;
      this.skiff = instance.scene.getObjectByName('fieldSkiff')!;
      this.starship = instance.scene.getObjectByName('fieldStarship')!;
      this.rotorBlades = ['fieldSkiffRotorLeft', 'fieldSkiffRotorRight'].map(name => instance.scene.getObjectByName(name)!);
      const copies = new Map<THREE.Material, THREE.Material>();
      instance.scene.traverse(part => {
        const mesh = part as THREE.Mesh;
        if (!mesh.isMesh) return;
        const ownMaterial = (sourceMaterial: THREE.Material): THREE.Material => {
          let copy = copies.get(sourceMaterial);
          if (!copy) {
            copy = sourceMaterial.clone();
            // Opaque draw ordering. Hashed coverage gives an explicit close-camera fade
            // without permanently placing the whole avatar in the transparent queue.
            copy.transparent = false;
            copy.alphaHash = true;
            copies.set(sourceMaterial, copy);
            this.materials.add(copy);
          }
          return copy;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ownMaterial) : ownMaterial(mesh.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      // Reviewed broad envelope for all authored poses + bounded contact correction.
      // Updating a full deformed-vertex bound every frame is unnecessary for one hero.
      instance.scene.traverse(object => {
        const skin = object as THREE.SkinnedMesh;
        if (!skin.isSkinnedMesh) return;
        skin.boundingBox = new THREE.Box3(new THREE.Vector3(-1.25, -.7, -1.8), new THREE.Vector3(1.25, 2.5, 1.35));
        skin.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .9, -.15), 2.4);
      });
      for (const id of CHARACTER_PROP_IDS) {
        if (id === 'hands') continue;
        const prop = instance.scene.getObjectByName(`character-prop-${id}`);
        if (!prop) throw new Error(`Explorer asset missing prop ${id}`);
        prop.visible = false;
        this.heldProps.set(id, prop);
      }
      this.plane.visible = false;
      this.mixer = new THREE.AnimationMixer(instance.scene);
      for (const actionName of ACTIONS) {
        const clip = instance.clips.find(item => item.name === actionName);
        if (!clip) throw new Error(`Explorer asset missing ${actionName} clip`);
        const action = this.mixer.clipAction(clip);
        action.setLoop(ONE_SHOTS.has(actionName) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = ONE_SHOTS.has(actionName);
        this.actions.set(actionName, action);
      }
      this.activate('idle', 0);
      this.mixer.update(0);
      for (const bone of this.explorer.skin.skeleton.bones) {
        this.authoredPose.push({ bone, position: bone.position.clone(), quaternion: bone.quaternion.clone(), scale: bone.scale.clone() });
      }
      this.group.updateMatrixWorld(true);
    });
  }

  get rig(): ExplorerRig | null { return this.explorer; }
  setAppearance(value: unknown): void {
    this.appearance = normalizeAppearance(value);
    if (this.explorer) applyExplorerAppearance(this.explorer.root, this.appearance, this.ownedGeometry);
  }
  getAppearance(): ExplorerAppearance { return { ...this.appearance }; }
  setPoseModifier(modifier?: ExplorerPoseModifier): void { this.poseModifier = modifier; }
  state(): CharacterVisualState { return { ...this.lastState }; }

  /** Call only while the loading cover is visible and before starting the frame loop. */
  async warmup(renderer: Pick<THREE.WebGPURenderer, 'compileAsync' | 'render'>, scene: THREE.Scene, camera: THREE.Camera): Promise<void> {
    await this.ready;
    if (this.disposed) return;
    const nodes: Array<{ object: THREE.Object3D; visible: boolean; frustumCulled: boolean }> = [];
    const opacity = new Map<THREE.Material, number>();
    this.group.traverse(object => {
      nodes.push({ object, visible: object.visible, frustumCulled: object.frustumCulled });
      object.visible = true;
      object.frustumCulled = false;
    });
    for (const material of this.materials) { opacity.set(material, material.opacity); material.opacity = 1; }
    try {
      this.group.updateMatrixWorld(true);
      await renderer.compileAsync(scene, camera);
      // Compile does not necessarily upload every attribute or bone buffer. One
      // covered render prepares the skin and static held/vehicle variants too.
      renderer.render(scene, camera);
    } finally {
      for (const { object, visible, frustumCulled } of nodes) { object.visible = visible; object.frustumCulled = frustumCulled; }
      for (const [material, value] of opacity) material.opacity = value;
    }
  }

  stats(): CharacterRendererStats {
    let meshes = 0, visibleDraws = 0, skinnedMeshes = 0;
    this.group.traverse(part => {
      if ((part as THREE.Mesh).isMesh) meshes++;
      if ((part as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshes++;
    });
    this.group.traverseVisible(part => { if ((part as THREE.Mesh).isMesh) visibleDraws++; });
    const heldProp = [...this.heldProps.entries()].find(([, obj]) => obj.visible)?.[0] ?? 'hands';
    let heldPropMeshes = 0;
    this.heldProps.get(heldProp)?.traverseVisible(part => { if ((part as THREE.Mesh).isMesh) heldPropMeshes++; });
    return {
      ready: !!this.explorer, visible: this.group.visible, meshes, visibleDraws, skinnedMeshes,
      bones: this.explorer?.skin.skeleton.bones.length ?? 0, clips: this.actions.size,
      skinTriangles: (this.explorer?.skin.geometry.index?.count ?? 0) / 3,
      activeClip: this.currentAction, supportedActions: [...this.actions.keys()], heldProp, heldPropMeshes,
    };
  }

  private activate(name: CharacterAction, fade: number): void {
    const next = this.actions.get(name)!;
    const previous = this.currentAction ? this.actions.get(this.currentAction) : undefined;
    const changingGait = (name === 'move' || name === 'sprint') &&
      (this.currentAction === 'move' || this.currentAction === 'sprint');
    const phase = changingGait && previous ? (previous.time / previous.getClip().duration) % 1 : 0;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    // Both authored gait cycles use left contact at zero/right contact at .5.
    // Preserve that phase across speed changes so a crossfade cannot pair the
    // old stance leg with the opposite leg's new contact/IK instructions.
    if (changingGait) next.time = phase * next.getClip().duration;
    next.paused = ONE_SHOTS.has(name);
    if (previous && previous !== next && fade > 0) previous.crossFadeTo(next, fade, false);
    else if (previous && previous !== next) previous.stop();
    this.currentAction = name;
  }

  /** Camera-relative root transform, then authored clips, then optional terrain pose correction. */
  update(player: Player, camWorld: { x: number; y: number; z: number }, camDist: number, dt: number, visual?: CharacterVisualState): void {
    const speed = Math.hypot(player.vx, player.vy, player.vz);
    const state = visual ?? { action: speed > .45 ? 'move' : 'idle', held: 'hands', actionT: 0, actionDuration: 0 };
    this.lastState.action = state.action; this.lastState.held = state.held;
    this.lastState.actionT = state.actionT; this.lastState.actionDuration = state.actionDuration;
    if (!this.explorer || !this.mixer || this.disposed) return;
    const alpha = THREE.MathUtils.clamp((camDist - 1.3) / 1.7, 0, 1);
    this.group.visible = alpha > .02 && camDist < 800;
    for (const material of this.materials) material.opacity = alpha;

    const [ux, uy, uz] = player.up();
    this.up.set(ux, uy, uz);
    this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ).normalize();
    this.right.crossVectors(this.up, this.back).normalize();
    this.back.crossVectors(this.right, this.up).normalize();
    this.matrix.makeBasis(this.right, this.up, this.back);
    this.group.quaternion.setFromRotationMatrix(this.matrix);
    const flying = player.mode === 'plane';
    const orbital = flying && (player.inSpaceCruise || player.hasOrbitalThruster);
    this.plane!.visible = flying;
    this.skiff!.visible = !orbital;
    this.starship!.visible = orbital;
    this.explorer.root.visible = !orbital;
    if (flying) {
      if (speed > 1) {
        const radialSpeed = (player.vx * ux + player.vy * uy + player.vz * uz) / speed;
        this.rotation.setFromAxisAngle(this.right, Math.asin(THREE.MathUtils.clamp(radialSpeed, -1, 1)) * .8);
        this.group.quaternion.premultiply(this.rotation);
      }
      this.rotation.setFromAxisAngle(this.back, player.bank);
      this.group.quaternion.premultiply(this.rotation);
      this.propAngle += dt * (10 + player.planeSpeed * .55);
      for (const rotor of this.rotorBlades) rotor.rotation.y = this.propAngle;
    }
    // Camera easing must not push the body down through the destination ledge.
    this.group.position.set(player.px - camWorld.x, player.py - camWorld.y, player.pz - camWorld.z);
    this.explorer.root.position.y = 0;
    for (const [id, prop] of this.heldProps) prop.visible = !flying && id === state.held;

    const name = flying ? 'plane' : state.action;
    const restart = ONE_SHOTS.has(name) && name === this.currentAction && state.actionT + .001 < this.previousActionT;
    if (name !== this.currentAction || restart) this.activate(name, this.currentAction ? .14 : 0);
    this.previousActionT = state.actionT;
    const action = this.actions.get(name)!;
    if (ONE_SHOTS.has(name)) {
      const progress = state.actionDuration > 0 ? THREE.MathUtils.clamp(state.actionT / state.actionDuration, 0, 1) : 0;
      action.time = progress * action.getClip().duration;
    } else {
      const radial = player.vx * ux + player.vy * uy + player.vz * uz;
      const tangentSpeed = Math.sqrt(Math.max(0, speed * speed - radial * radial));
      const reference = name === 'sprint' ? SPRINT_SPEED : WALK_SPEED;
      action.setEffectiveTimeScale(name === 'move' || name === 'sprint' ? THREE.MathUtils.clamp(tangentSpeed / reference, .4, 2) : 1);
    }
    // PropertyMixer can skip identical output values. Restore its last unmodified
    // pose first, otherwise a paused frame can accumulate last frame's IK offset.
    for (const pose of this.authoredPose) {
      pose.bone.position.copy(pose.position);
      pose.bone.quaternion.copy(pose.quaternion);
      pose.bone.scale.copy(pose.scale);
    }
    this.mixer.update(Math.min(.1, Math.max(0, dt)));
    for (const pose of this.authoredPose) {
      pose.position.copy(pose.bone.position);
      pose.quaternion.copy(pose.bone.quaternion);
      pose.scale.copy(pose.bone.scale);
    }
    this.group.updateMatrixWorld(true);
    const gaitPhase = (action.time / action.getClip().duration) % 1;
    const onGround = player.mode === 'walk' && player.grounded && player.submerged <= .45 && name !== 'jump';
    if (!onGround) { this.contacts[0] = 0; this.contacts[1] = 0; }
    else if (name === 'move' || name === 'sprint') {
      this.contacts[0] = explorerContactWeight(gaitPhase, name === 'sprint');
      this.contacts[1] = explorerContactWeight(gaitPhase + .5, name === 'sprint');
    } else { this.contacts[0] = 1; this.contacts[1] = 1; }
    if (this.poseModifier && this.group.visible && !flying) {
      if (!this.context) this.context = { rig: this.explorer, player, camWorld, dt, gaitPhase, contactWeights: this.contacts, action: name };
      else { this.context.player = player; this.context.camWorld = camWorld; this.context.dt = dt; this.context.gaitPhase = gaitPhase; this.context.action = name; }
      this.poseModifier(this.context);
      this.group.updateMatrixWorld(true);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer?.stopAllAction();
    if (this.assetRoot) this.mixer?.uncacheRoot(this.assetRoot);
    const skeletons = new Set<THREE.Skeleton>();
    this.group.traverse(object => { const mesh = object as THREE.SkinnedMesh; if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.ownedGeometry) geometry.dispose();
    this.ownedGeometry.clear();
    this.materials.clear();
    this.group.removeFromParent();
    // Recolored skin geometry is owned; cached source geometry, props and clips
    // remain available to other instances.
  }
}
