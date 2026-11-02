/** Runtime import contract for the offline-authored expedition asset. */
import * as THREE from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Player } from '../player/player';
import type { CharacterAction } from '../sim/equipment';

export interface ExplorerLeg {
  hip: THREE.Bone;
  knee: THREE.Bone;
  ankle: THREE.Bone;
  side: -1 | 1;
  /** Local ankle-to-sole offset; +Y is up, -Z is forward. */
  soleOffset: THREE.Vector3;
}

export interface ExplorerRig {
  root: THREE.Object3D;
  pelvis: THREE.Bone;
  legs: [ExplorerLeg, ExplorerLeg];
  skin: THREE.SkinnedMesh;
  rightHand: THREE.Bone;
  leftHand: THREE.Bone;
}

export interface ExplorerPoseContext {
  rig: ExplorerRig;
  player: Player;
  camWorld: { x: number; y: number; z: number };
  dt: number;
  /** Normalized left-leg cycle. Zero is the left foot's forward contact. */
  gaitPhase: number;
  /** Authored stance weights, ordered left/right like rig.legs. */
  contactWeights: readonly [number, number];
  /** Lets contact solvers reseed when entering locomotion from an idle pose. */
  action?: CharacterAction;
}

export type ExplorerPoseModifier = (context: ExplorerPoseContext) => void;

let assetPromise: Promise<GLTF> | undefined;

/** Fetch/decode once per page. Runtime clones share geometry and clip data. */
export function loadExplorerAsset(): Promise<GLTF> {
  return assetPromise ??= new GLTFLoader().loadAsync(
    new URL('../../assets/explorer/explorer.glb', import.meta.url).href,
  ).catch((error: unknown) => {
    assetPromise = undefined;
    throw error;
  });
}

export function instantiateExplorer(asset: GLTF): { scene: THREE.Group; rig: ExplorerRig; clips: THREE.AnimationClip[] } {
  const scene = clone(asset.scene) as THREE.Group;
  const node = <T extends THREE.Object3D>(name: string): T => {
    const found = scene.getObjectByName(name);
    if (!found) throw new Error(`Explorer asset is missing ${name}`);
    return found as T;
  };
  const leg = (label: 'Left' | 'Right', side: -1 | 1): ExplorerLeg => ({
    hip: node<THREE.Bone>(`explorer${label}UpperLeg`),
    knee: node<THREE.Bone>(`explorer${label}LowerLeg`),
    ankle: node<THREE.Bone>(`explorer${label}Foot`),
    side,
    soleOffset: new THREE.Vector3(0, -0.12, -0.055).multiplyScalar(1.13),
  });
  const rig: ExplorerRig = {
    root: node('explorerRig'),
    pelvis: node('explorerHips'),
    legs: [leg('Left', -1), leg('Right', 1)],
    skin: node('explorerSkin'),
    rightHand: node('explorerRightHand'),
    leftHand: node('explorerLeftHand'),
  };
  if (!rig.skin.isSkinnedMesh || !rig.pelvis.isBone) throw new Error('Explorer asset has no valid skin/rig');
  // The portable glTF puts the skin at scene root (per the skinning contract).
  // Both containers are identity transforms here; reunite visibility/lifetime.
  rig.root.add(rig.skin);
  for (const part of [...scene.children]) {
    if (part.name.startsWith('explorerModule_')) rig.root.add(part);
  }
  return { scene, rig, clips: asset.animations };
}
