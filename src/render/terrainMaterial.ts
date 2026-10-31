/**
 * Cohesive Hex-Voxel Terrain Material (`three/tsl` + `unpack4xU8`).
 *
 * Unpacks the 4-byte vertex attribute (`packedMat`) via `unpack4xU8` and applies:
 *  - Clean 3-tone stylized sun-angle shading ramp
 *  - Smooth macro-scale planetary color harmony (zero high-frequency moiré stipple!)
 *  - Subtle hex-step bevel lighting and moisture specular sheen
 *  - Emissive glow on molten magma veins, crystal spires, and bioluminescent turf
 */

import * as THREE from 'three/webgpu';
import {
  attribute,
  clamp,
  dot,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  uint,
  uniform,
  unpack4xU8,
  uvec4,
  vec3,
} from 'three/tsl';
import type { PlanetConfig } from '../world/planetConfig';

export interface TerrainMaterialHandle {
  material: THREE.MeshStandardNodeMaterial;
  applyPlanetConfig(config: PlanetConfig): void;
}

export function createTerrainMaterial(initialConfig?: PlanetConfig): TerrainMaterialHandle {
  const mat = new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
  });

  const uRockTint = uniform(new THREE.Vector3(1, 1, 1));
  const uSoilTint = uniform(new THREE.Vector3(1, 1, 1));
  const uFoliageTint = uniform(new THREE.Vector3(1, 1, 1));
  const uEmissiveTint = uniform(new THREE.Vector3(0.2, 0.9, 0.7));
  const uHorizonTint = uniform(new THREE.Vector3(0.62, 0.78, 1.0));
  const uTriplanarScale = uniform(0.045);

  const packedAttr = attribute('packedMat', 'float');
  const unpacked = unpack4xU8(uint(packedAttr)) as unknown as ReturnType<typeof uvec4>;

  const matIdF = unpacked.x.toFloat();
  const wetness = unpacked.y.toFloat().div(255.0);
  const emissiveMask = unpacked.z.toFloat().div(255.0);
  const crystalMask = unpacked.w.toFloat().div(255.0);

  const vCol = attribute('color', 'vec3');
  const pos = positionWorld.mul(uTriplanarScale);
  const nW = normalWorld;

  // Smooth macro-scale elevation bands & gentle painterly patch variation (no high-freq stipple)
  const macroPatch = mx_noise_float(pos.mul(0.35)).mul(0.06);
  const strataBand = mx_noise_float(vec3(pos.x.mul(0.18), pos.y.mul(1.1), pos.z.mul(0.18))).mul(0.07);

  // Differentiate horizontal hex caps from vertical cliff walls using normal alignment
  const radialDir = positionWorld.normalize();
  const capAlignment = clamp(dot(nW, radialDir), 0.0, 1.0);
  const isCliffWall = float(1.0).sub(smoothstep(0.65, 0.88, capAlignment));

  const isRockLike = smoothstep(5.5, 6.5, matIdF);
  const isGrassOrLeaf = float(1.0).sub(smoothstep(3.5, 4.5, matIdF));

  const planetTint = mix(
    uSoilTint,
    mix(uRockTint, uFoliageTint, isGrassOrLeaf),
    clamp(isRockLike.add(isGrassOrLeaf), 0.0, 1.0),
  );

  // Deep cliff-wall ambient occlusion / shadow (0.35) + crisp top-cap highlight
  const wallShade = float(1.0).sub(isCliffWall.mul(0.35)).add(isCliffWall.mul(strataBand.mul(0.5)));
  const capHighlight = smoothstep(0.85, 0.99, capAlignment).mul(0.06);

  const wetnessDarken = float(1.0).sub(wetness.mul(0.14));
  const baseShadedColor = vCol
    .mul(planetTint)
    .mul(wallShade)
    .add(macroPatch.add(capHighlight))
    .mul(wetnessDarken);

  // Clean distance atmospheric depth: ZERO haze within 220m for razor-sharp foreground clarity,
  // then smoothly blend into atmospheric horizon color across 220m - 2200m
  const distCam = positionWorld.length();
  const distHaze = smoothstep(220.0, 2200.0, distCam).mul(0.55);
  const finalColor = mix(baseShadedColor, uHorizonTint, distHaze);

  mat.colorNode = clamp(finalColor, 0.02, 1.35);

  mat.roughnessNode = clamp(
    float(0.88)
      .sub(wetness.mul(0.32))
      .sub(crystalMask.mul(0.45)),
    0.15,
    0.96,
  );

  mat.metalnessNode = clamp(crystalMask.mul(0.38), 0.0, 0.65);

  // Smooth emissive glow for magma channels, glowing mycelium, and Pentagon runes
  const pulse = mx_noise_float(pos.mul(0.5)).mul(0.2).add(0.9);
  mat.emissiveNode = uEmissiveTint.mul(emissiveMask.mul(1.25).mul(pulse));

  const handle: TerrainMaterialHandle = {
    material: mat,
    applyPlanetConfig(cfg: PlanetConfig): void {
      uHorizonTint.value.set(...cfg.atmosphere.horizonColor);
      switch (cfg.archetype) {
        case 'canyon':
          uRockTint.value.set(1.15, 0.88, 0.72);
          uSoilTint.value.set(1.10, 0.82, 0.65);
          uFoliageTint.value.set(0.95, 1.02, 0.65);
          uEmissiveTint.value.set(1.0, 0.65, 0.25);
          break;
        case 'volcanic':
          uRockTint.value.set(0.82, 0.80, 0.85);
          uSoilTint.value.set(0.88, 0.78, 0.72);
          uFoliageTint.value.set(1.05, 0.72, 0.45);
          uEmissiveTint.value.set(1.0, 0.45, 0.08);
          break;
        case 'cryo':
          uRockTint.value.set(0.92, 0.98, 1.08);
          uSoilTint.value.set(0.95, 1.02, 1.10);
          uFoliageTint.value.set(0.85, 1.05, 1.12);
          uEmissiveTint.value.set(0.45, 0.92, 1.0);
          break;
        case 'biolum':
          uRockTint.value.set(0.85, 0.90, 1.05);
          uSoilTint.value.set(0.78, 1.02, 0.95);
          uFoliageTint.value.set(0.65, 1.15, 1.02);
          uEmissiveTint.value.set(0.25, 1.0, 0.85);
          break;
        case 'shattered':
          uRockTint.value.set(0.95, 0.90, 1.05);
          uSoilTint.value.set(0.92, 0.88, 1.02);
          uFoliageTint.value.set(1.05, 0.85, 1.15);
          uEmissiveTint.value.set(0.65, 0.88, 1.0);
          break;
        default:
          uRockTint.value.set(1.0, 1.0, 1.0);
          uSoilTint.value.set(1.0, 0.98, 0.95);
          uFoliageTint.value.set(1.0, 1.05, 0.98);
          uEmissiveTint.value.set(0.35, 0.95, 1.0);
          break;
      }
      uTriplanarScale.value = 0.045;
    },
  };

  if (initialConfig) {
    handle.applyPlanetConfig(initialConfig);
  }

  return handle;
}
