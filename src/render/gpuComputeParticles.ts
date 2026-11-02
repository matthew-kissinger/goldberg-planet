/**
 * WebGPU Compute Shader Showcase (`three/tsl` + `instancedArray` + `compileComputeAsync`).
 *
 * Drives two GPU-accelerated planetary particle systems with zero per-frame CPU-to-GPU
 * buffer uploads:
 *  1. Keplerian Planetary Ring & Asteroid Belt (2,048 instanced rocks that orbit ringed
 *     planets and physically part in the player craft's wake).
 *  2. Spherical Biome Weather Advection (512 subtle ambient motes for volcanic embers,
 *     cryo-snow, canyon dust, and bioluminescent spores).
 */

import * as THREE from 'three/webgpu';
import {
  cos,
  float,
  Fn,
  instanceIndex,
  instancedArray,
  length,
  max,
  mix,
  positionLocal,
  sin,
  smoothstep,
  time,
  uniform,
  vec4,
} from 'three/tsl';
import type { PlanetConfig } from '../world/planetConfig';
import { mulberry32 } from '../util/prng';
import { hasAtmosphere } from './planetVisualProfile';
import { createPlanetRing } from './planetRing';

export const RING_INSTANCE_COUNT = 2048;
export const WEATHER_INSTANCE_COUNT = 512;

/* eslint-disable @typescript-eslint/no-explicit-any */

export class GpuPlanetEffects {
  readonly ringMesh: THREE.InstancedMesh;
  readonly ringBand = createPlanetRing();
  readonly weatherMesh: THREE.InstancedMesh;
  private readonly computeRingsNode: any;
  private readonly computeWeatherNode: any;

  // Ring uniforms
  private readonly uRingRight = uniform(new THREE.Vector3(1, 0, 0));
  private readonly uRingUp = uniform(new THREE.Vector3(0, 1, 0));
  private readonly uRingForward = uniform(new THREE.Vector3(0, 0, 1));
  private readonly uRingInner = uniform(1080);
  private readonly uRingOuter = uniform(1680);
  private readonly uRingColorA = uniform(new THREE.Vector3(0.88, 0.66, 0.46));
  private readonly uRingColorB = uniform(new THREE.Vector3(0.58, 0.76, 0.88));
  private readonly uPlayerPlanetPos = uniform(new THREE.Vector3(0, 900, 0));

  // Weather uniforms
  private readonly uWeatherColor = uniform(new THREE.Vector3(0.95, 0.98, 1.0));
  private readonly uWeatherDrift = uniform(new THREE.Vector3(0.5, -3.5, 0.5));
  private readonly uWeatherEmissive = uniform(0.2);
  private weatherEnabled = false;
  private planetRadius = 900;
  private weatherCeiling = 150;
  private waterLevel = -.35;
  private readonly weatherUp = new THREE.Vector3(0, 1, 0);
  private readonly weatherRight = new THREE.Vector3(1, 0, 0);
  private readonly weatherForward = new THREE.Vector3(0, 0, 1);
  private readonly weatherBasis = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    const rng = mulberry32(0x7fc391a5);

    // --- 1. Keplerian Planetary Ring Belt (WebGPU Compute + instancedArray) ---
    const ringSeedData = new Float32Array(RING_INSTANCE_COUNT * 4);
    for (let i = 0; i < RING_INSTANCE_COUNT; i++) {
      ringSeedData[i * 4] = rng();                       // radial fraction [0, 1]
      ringSeedData[i * 4 + 1] = rng() * Math.PI * 2;     // initial orbital angle
      ringSeedData[i * 4 + 2] = (rng() - 0.5) * 28.0;    // vertical belt thickness (m)
      ringSeedData[i * 4 + 3] = 0.18 + Math.pow(rng(), 2) * 0.85; // small debris; belt supplies the distant silhouette
    }
    const ringSeedStorage = instancedArray(ringSeedData, 'vec4');
    const ringOutStorage = instancedArray(RING_INSTANCE_COUNT, 'vec4');

    const uRingRight = this.uRingRight;
    const uRingUp = this.uRingUp;
    const uRingForward = this.uRingForward;
    const uRingInner = this.uRingInner;
    const uRingOuter = this.uRingOuter;
    const uPlayerPlanetPos = this.uPlayerPlanetPos;

    this.computeRingsNode = Fn(() => {
      const seed = ringSeedStorage.element(instanceIndex);
      const rFrac = seed.x;
      const angle0 = seed.y;
      const yOff = seed.z;
      const scale = seed.w;

      const radius = mix(uRingInner, uRingOuter, rFrac);
      const omega = float(18.0).div(max(radius, float(400.0)));
      const angle = angle0.add(time.mul(omega));

      const localPos = uRingRight
        .mul(cos(angle).mul(radius))
        .add(uRingForward.mul(sin(angle).mul(radius)))
        .add(uRingUp.mul(yOff))
        .toVar();

      const delta = localPos.sub(uPlayerPlanetPos);
      const dist = length(delta);
      const push = smoothstep(float(65.0), float(6.0), dist).mul(26.0);
      localPos.addAssign(delta.div(max(dist, float(1.0))).mul(push));

      ringOutStorage.element(instanceIndex).assign(vec4(localPos, scale));
    })().compute(RING_INSTANCE_COUNT);

    const rockGeom = new THREE.IcosahedronGeometry(1, 0);
    const ringMat = new THREE.MeshStandardNodeMaterial({
      roughness: 0.55,
      metalness: 0.12,
    });
    const instOut = ringOutStorage.element(instanceIndex);
    const instSeed = ringSeedStorage.element(instanceIndex);
    ringMat.positionNode = positionLocal.mul(instOut.w).add(instOut.xyz);
    ringMat.colorNode = mix(this.uRingColorA, this.uRingColorB, instSeed.x);

    this.ringMesh = new THREE.InstancedMesh(rockGeom, ringMat, RING_INSTANCE_COUNT);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.visible = false;
    scene.add(this.ringMesh);
    scene.add(this.ringBand.mesh);

    // --- 2. Subtle Spherical Biome Weather Motes (WebGPU Compute + instancedArray) ---
    const weatherSeedData = new Float32Array(WEATHER_INSTANCE_COUNT * 4);
    for (let i = 0; i < WEATHER_INSTANCE_COUNT; i++) {
      weatherSeedData[i * 4] = (rng() - 0.5) * 140;
      weatherSeedData[i * 4 + 1] = (rng() - 0.5) * 90;
      weatherSeedData[i * 4 + 2] = (rng() - 0.5) * 140;
      weatherSeedData[i * 4 + 3] = 0.035 + rng() * 0.055;
    }
    const weatherSeedStorage = instancedArray(weatherSeedData, 'vec4');
    const weatherOutStorage = instancedArray(WEATHER_INSTANCE_COUNT, 'vec4');
    const uWeatherDrift = this.uWeatherDrift;

    this.computeWeatherNode = Fn(() => {
      const s = weatherSeedStorage.element(instanceIndex);
      const drift = uWeatherDrift.mul(time);
      const px = s.x.add(drift.x).add(70.0).mod(140.0).sub(70.0);
      const py = s.y.add(drift.y).add(45.0).mod(90.0).sub(45.0);
      const pz = s.z.add(drift.z).add(70.0).mod(140.0).sub(70.0);
      weatherOutStorage.element(instanceIndex).assign(vec4(px, py, pz, s.w));
    })().compute(WEATHER_INSTANCE_COUNT);

    const moteGeom = new THREE.IcosahedronGeometry(1, 0);
    const weatherMat = new THREE.MeshBasicNodeMaterial({
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const wOut = weatherOutStorage.element(instanceIndex);
    weatherMat.positionNode = positionLocal.mul(wOut.w).add(wOut.xyz);
    weatherMat.colorNode = this.uWeatherColor.mul(float(1.0).add(this.uWeatherEmissive));

    this.weatherMesh = new THREE.InstancedMesh(moteGeom, weatherMat, WEATHER_INSTANCE_COUNT);
    this.weatherMesh.frustumCulled = false;
    this.weatherMesh.visible = false;
    scene.add(this.weatherMesh);
  }

  /** Compile and initialize both bounded storage layouts while startup is covered. */
  async precompile(renderer: THREE.WebGPURenderer): Promise<void> {
    const r = renderer as unknown as { compileComputeAsync?: (node: any) => Promise<void>; compute?: (node: any) => void };
    if (typeof r.compileComputeAsync === 'function') {
      await Promise.all([
        r.compileComputeAsync(this.computeRingsNode),
        r.compileComputeAsync(this.computeWeatherNode),
      ]);
    }
    r.compute?.(this.computeRingsNode);
    r.compute?.(this.computeWeatherNode);
  }

  /** Include initially hidden layouts in the caller's single covered scene warmup. */
  prepareWarmup(): () => void {
    const ringVisible = this.ringMesh.visible, weatherVisible = this.weatherMesh.visible, bandVisible = this.ringBand.mesh.visible;
    this.ringMesh.visible = this.weatherMesh.visible = true;
    this.ringBand.mesh.visible = true;
    return () => { this.ringMesh.visible = ringVisible; this.weatherMesh.visible = weatherVisible; this.ringBand.mesh.visible = bandVisible; };
  }

  /** Reconfigure ring belt and biome weather particles when entering a planet. */
  applyPlanetConfig(config: PlanetConfig): void {
    this.ringBand.apply(config.rings);
    if (config.rings) {
      this.ringMesh.visible = true;
      this.uRingInner.value = config.rings.innerRadius;
      this.uRingOuter.value = config.rings.outerRadius;
      this.uRingColorA.value.set(...config.rings.colorInner);
      this.uRingColorB.value.set(...config.rings.colorOuter);

      const up = new THREE.Vector3(...config.rings.normal).normalize();
      const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const right = new THREE.Vector3().crossVectors(up, ref).normalize();
      const fwd = new THREE.Vector3().crossVectors(right, up).normalize();
      this.uRingUp.value.copy(up);
      this.uRingRight.value.copy(right);
      this.uRingForward.value.copy(fwd);
    } else {
      this.ringMesh.visible = false;
    }

    const wk = config.atmosphere.weatherKind;
    this.planetRadius = config.radius;
    this.weatherCeiling = config.atmosphere.thickness * .85;
    this.waterLevel = config.ocean.hasOcean ? config.waterSurfaceOffset : -Infinity;
    this.weatherEnabled = wk !== 'none' && hasAtmosphere(config);
    if (!this.weatherEnabled) {
      this.weatherMesh.visible = false;
    } else {
      this.weatherMesh.visible = true;
      if (wk === 'snow') {
        this.uWeatherColor.value.set(0.92, 0.97, 1.0);
        this.uWeatherDrift.value.set(.65, -1.8, .3);
        this.uWeatherEmissive.value = 0.05;
      } else if (wk === 'embers') {
        this.uWeatherColor.value.set(1.0, 0.45, 0.12);
        this.uWeatherDrift.value.set(.45, 1.4, -.35);
        this.uWeatherEmissive.value = 0.35;
      } else if (wk === 'spores') {
        this.uWeatherColor.value.set(0.55, 0.76, 0.72);
        this.uWeatherDrift.value.set(.2, .35, -.25);
        this.uWeatherEmissive.value = 0.18;
      } else {
        this.uWeatherColor.value.set(0.92, 0.68, 0.46);
        this.uWeatherDrift.value.set(2.4, -.25, 1.1);
        this.uWeatherEmissive.value = 0.0;
      }
    }
  }

  /** Step GPU compute shaders and update floating-origin mesh anchors. */
  update(
    renderer: THREE.WebGPURenderer,
    camX: number,
    camY: number,
    camZ: number,
    playerX: number,
    playerY: number,
    playerZ: number,
  ): void {
    this.uPlayerPlanetPos.value.set(playerX, playerY, playerZ);
    this.ringMesh.position.set(-camX, -camY, -camZ);
    this.ringBand.mesh.position.copy(this.ringMesh.position);
    this.weatherMesh.position.set(playerX - camX, playerY - camY, playerZ - camZ);
    const radius = Math.hypot(playerX, playerY, playerZ);
    const altitude = radius - this.planetRadius;
    this.weatherMesh.visible = this.weatherEnabled && altitude < this.weatherCeiling && altitude > this.waterLevel;
    if (radius > 0) {
      this.weatherUp.set(playerX / radius, playerY / radius, playerZ / radius);
      // Parallel-transport the tangent frame, avoiding a sudden pole-axis flip.
      this.weatherRight.addScaledVector(this.weatherUp, -this.weatherRight.dot(this.weatherUp));
      if (this.weatherRight.lengthSq() < 1e-8) {
        this.weatherRight.set(Math.abs(this.weatherUp.x) < .9 ? 1 : 0, Math.abs(this.weatherUp.x) < .9 ? 0 : 1, 0);
        this.weatherRight.addScaledVector(this.weatherUp, -this.weatherRight.dot(this.weatherUp));
      }
      this.weatherRight.normalize();
      this.weatherForward.crossVectors(this.weatherRight, this.weatherUp).normalize();
      this.weatherBasis.makeBasis(this.weatherRight, this.weatherUp, this.weatherForward);
      this.weatherMesh.quaternion.setFromRotationMatrix(this.weatherBasis);
    }

    const r = renderer as unknown as { compute?: (node: any) => void };
    if (typeof r.compute === 'function') {
      if (this.ringMesh.visible) r.compute(this.computeRingsNode);
      if (this.weatherMesh.visible) r.compute(this.computeWeatherNode);
    }
  }
}
