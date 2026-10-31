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

  // Subtle cliff-wall strata darkening + crisp top-cap highlight
  const wallShade = float(1.0).sub(isCliffWall.mul(0.12)).add(isCliffWall.mul(strataBand));
  const capHighlight = smoothstep(0.85, 0.99, capAlignment).mul(0.04);

  const wetnessDarken = float(1.0).sub(wetness.mul(0.14));
  const shadedColor = vCol
    .mul(planetTint)
    .mul(wallShade)
    .add(macroPatch.add(capHighlight))
    .mul(wetnessDarken);

  mat.colorNode = clamp(shadedColor, 0.02, 1.35);

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
      switch (cfg.archetype) {
        case 'canyon':
          uRockTint.value.set(0.82, 0.45, 0.28);
          uSoilTint.value.set(0.75, 0.52, 0.34);
          uFoliageTint.value.set(0.55, 0.68, 0.32);
          uEmissiveTint.value.set(0.95, 0.55, 0.22);
          break;
        case 'volcanic':
          uRockTint.value.set(0.28, 0.26, 0.30);
          uSoilTint.value.set(0.35, 0.28, 0.25);
          uFoliageTint.value.set(0.85, 0.38, 0.18);
          uEmissiveTint.value.set(1.0, 0.32, 0.05);
          break;
        case 'cryo':
          uRockTint.value.set(0.72, 0.84, 0.95);
          uSoilTint.value.set(0.82, 0.90, 0.98);
          uFoliageTint.value.set(0.48, 0.82, 0.92);
          uEmissiveTint.value.set(0.35, 0.85, 1.0);
          break;
        case 'biolum':
          uRockTint.value.set(0.34, 0.38, 0.52);
          uSoilTint.value.set(0.26, 0.48, 0.44);
          uFoliageTint.value.set(0.18, 0.88, 0.72);
          uEmissiveTint.value.set(0.18, 0.95, 0.78);
          break;
        case 'shattered':
          uRockTint.value.set(0.52, 0.48, 0.62);
          uSoilTint.value.set(0.45, 0.42, 0.55);
          uFoliageTint.value.set(0.68, 0.52, 0.95);
          uEmissiveTint.value.set(0.55, 0.78, 1.0);
          break;
        default:
          uRockTint.value.set(0.55, 0.53, 0.50);
          uSoilTint.value.set(0.48, 0.38, 0.28);
          uFoliageTint.value.set(0.30, 0.62, 0.28);
          uEmissiveTint.value.set(0.25, 0.85, 0.92);
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
