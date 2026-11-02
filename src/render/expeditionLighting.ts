import * as THREE from 'three/webgpu';
import type { PlanetConfig } from '../world/planetConfig';
import { planetVisualProfile, PLANET_VISUAL_PROFILES } from './planetVisualProfile';

/** One local sun shadow and a sky fill oriented to planetary gravity. */
export class ExpeditionLighting {
  readonly sun = new THREE.DirectionalLight(0xffedd1, 2.6);
  private readonly target = new THREE.Object3D();
  private readonly skyFill = new THREE.HemisphereLight(0xc4dce6, 0x71664f, 1.2);
  private readonly ambient = new THREE.AmbientLight(0xe4e0d2, .12);
  private profile = PLANET_VISUAL_PROFILES.terran.lighting;
  private readonly up = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  private readonly direction: THREE.Vector3;
  private readonly shadows: boolean;

  constructor(scene: THREE.Scene, private readonly renderer: THREE.WebGPURenderer, direction: THREE.Vector3, coarse: boolean, shadows = true) {
    this.direction = direction.clone().normalize();
    this.shadows = shadows;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.sun.target = this.target;
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.setScalar(coarse ? 512 : 1024);
    Object.assign(this.sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 20, far: 240 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.00015;
    this.sun.shadow.normalBias = 0.045;
    scene.add(this.sun, this.target, this.skyFill, this.ambient);
  }

  /** Reuse the same three lights/shadow pass; world changes only update values. */
  setPlanet(config: PlanetConfig): void {
    this.profile = planetVisualProfile(config).lighting;
    const p = this.profile;
    this.sun.color.setHex(p.sun); this.sun.intensity = p.sunStrength;
    this.skyFill.color.setHex(p.sky); this.skyFill.groundColor.setHex(p.ground);
    this.ambient.color.setHex(p.ambient); this.ambient.intensity = p.ambientStrength;
    this.renderer.toneMappingExposure = p.exposure;
  }

  update(player: { px: number; py: number; pz: number }, origin: { x: number; y: number; z: number }, altitude: number, cameraDistance: number): void {
    this.up.set(player.px, player.py, player.pz).normalize();
    this.focus.set(player.px - origin.x, player.py - origin.y, player.pz - origin.z);
    this.target.position.copy(this.focus);
    this.sun.position.copy(this.focus).addScaledVector(this.direction, 150);
    // HemisphereLight's axis must follow local up, rather than global +Y.
    this.skyFill.position.copy(this.up);
    const day = THREE.MathUtils.smoothstep(this.up.dot(this.direction), -0.15, 0.35);
    this.skyFill.intensity = this.profile.nightFill + day * (this.profile.dayFill - this.profile.nightFill);
    this.sun.intensity = this.profile.sunStrength;
    this.sun.shadow.camera.up.copy(this.up);
    if (Math.abs(this.up.dot(this.direction)) > 0.97) this.sun.shadow.camera.up.set(0, 1, 0);
    const close = altitude < 80 && cameraDistance < 150;
    this.sun.shadow.autoUpdate = this.shadows && close;
    this.sun.shadow.intensity = close ? this.profile.shadow : 0;
  }
}
