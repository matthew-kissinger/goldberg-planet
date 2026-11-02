/**
 * Cohesive Hex-Voxel Terrain Material (`three/tsl` + `unpack4xU8`).
 *
 * Reads the mesher's three packed bytes (material, flags/moisture, emission hint).
 *  - Stable planet-space macro color variation
 *  - Cliff shading, radial cap highlights, and moisture specular sheen
 *  - Emissive glow on molten magma veins, crystal spires, and bioluminescent turf
 */

import * as THREE from 'three/webgpu';
import {
  attribute,
  bumpMap,
  clamp,
  dot,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  triplanarTexture,
  uint,
  uniform,
  unpack4xU8,
  uvec4,
  varying,
  vec3,
} from 'three/tsl';
import type { PlanetConfig } from '../world/planetConfig';
import { MAT } from '../world/terrain';
import { hasAtmosphere, planetVisualProfile, PLANET_VISUAL_PROFILES } from './planetVisualProfile';

export interface TerrainMaterialHandle {
  material: THREE.MeshStandardNodeMaterial;
  applyPlanetConfig(config: PlanetConfig): void;
  /** Planet-local camera position removed from render transforms by the floating origin. */
  setCameraOrigin(x: number, y: number, z: number): void;
  loadSurfaceDetail(): Promise<void>;
}

export function createTerrainMaterial(initialConfig?: PlanetConfig): TerrainMaterialHandle {
  const mat = new THREE.MeshStandardNodeMaterial({
    // colorNode reads the attribute explicitly; enabling this would multiply it twice.
    vertexColors: false,
    roughness: 0.88,
    metalness: 0.04,
  });

  const uRockTint = uniform(new THREE.Vector3(1, 1, 1));
  const uSoilTint = uniform(new THREE.Vector3(1, 1, 1));
  const uFoliageTint = uniform(new THREE.Vector3(1, 1, 1));
  const uEmissiveTint = uniform(new THREE.Vector3(0.2, 0.9, 0.7));
  const uHorizonTint = uniform(new THREE.Vector3(0.62, 0.78, 1.0));
  const uMacroScale = uniform(0.045);
  const uCameraOrigin = uniform(new THREE.Vector3());
  const home = PLANET_VISUAL_PROFILES.terran.surface;
  const uRadius = uniform(900);
  const uRoughness = uniform(home.roughness);
  const uWetResponse = uniform(home.wetResponse);
  const uGrain = uniform(home.grain);
  const uBump = uniform(home.bump);
  const uMacro = uniform(home.macro);
  const uWallShade = uniform(home.wallShade);
  const uStrata = uniform(home.strata);
  const uRadialStrata = uniform(home.radialStrata);
  const uHazeStart = uniform(home.hazeStart);
  const uHazeEnd = uniform(home.hazeEnd);
  const uHaze = uniform(home.haze);
  const uEmission = uniform(new THREE.Vector3(...home.emission));
  const uEmissionGrain = uniform(home.emissionGrain);
  const detailMap = new THREE.Texture();
  detailMap.wrapS = detailMap.wrapT = THREE.RepeatWrapping;
  detailMap.colorSpace = THREE.NoColorSpace;

  const packedAttr = attribute('packedMat', 'float');
  // Metadata is constant within each meshed triangle. Cast before rasterization
  // and carry it flat: interpolating the large Float32 integer can round below
  // its value, and fragment uint() truncation then corrupts the material/flags.
  const packedMaterial = varying(uint(packedAttr), 'vPackedMaterial').setInterpolation('flat');
  const unpacked = unpack4xU8(packedMaterial) as unknown as ReturnType<typeof uvec4>;

  const matId = unpacked.x;
  const isMaterial = (id: number) => matId.equal(uint(id));
  // Byte 1 has wall/pentagon/flora flags in bits 0..2 and moisture in bits 3..7.
  const wetness = unpacked.y.shiftRight(uint(3)).toFloat().div(31.0);
  const isCliffWall = unpacked.y.bitAnd(uint(1)).toFloat();
  // There is no fourth byte in the Float32-safe encoding. Derive these from identity.
  const crystalMask = float(isMaterial(MAT.CRYSTAL));
  const isEmissive = isMaterial(MAT.MAGMA).or(isMaterial(MAT.CRYSTAL)).or(isMaterial(MAT.MYCELIUM));
  const emissiveMask = unpacked.z.toFloat().div(255.0).mul(float(isEmissive));

  const vCol = attribute('color', 'vec3');
  const planetPosition = positionWorld.add(uCameraOrigin);
  const pos = planetPosition.mul(uMacroScale);
  const nW = normalWorld;
  // One reusable baked texture; consistent scale on caps and cliffs without UV seams.
  const detail = triplanarTexture(texture(detailMap), null, null, float(0.7), planetPosition, nW);
  const detailFade = float(1).sub(smoothstep(20, 75, positionWorld.length()));

  // Smooth macro-scale elevation bands & gentle painterly patch variation (no high-freq stipple)
  const macroPatch = mx_noise_float(pos.mul(0.35)).mul(uMacro);
  // Strata on the new worlds follow radial elevation on every hemisphere.
  // Reuse the existing noise sample rather than adding another octave/pass.
  const oldStrataPosition = vec3(pos.x.mul(0.18), pos.y.mul(1.1), pos.z.mul(0.18));
  const radialStrataPosition = vec3(0, planetPosition.length().sub(uRadius).mul(0.32), 0);
  const strataBand = mx_noise_float(mix(oldStrataPosition, radialStrataPosition, uRadialStrata)).mul(uStrata);

  // Differentiate horizontal hex caps from vertical cliff walls using normal alignment
  const radialDir = planetPosition.normalize();
  const capAlignment = clamp(dot(nW, radialDir), 0.0, 1.0);

  const isRockLike = float(
    isMaterial(MAT.ROCK).or(isMaterial(MAT.LIMESTONE)).or(isMaterial(MAT.BEDROCK)).or(isMaterial(MAT.BUILT))
      .or(isMaterial(MAT.SNOW)).or(isMaterial(MAT.ICE)).or(isMaterial(MAT.TERRACOTTA))
      .or(isMaterial(MAT.BASALT)).or(isMaterial(MAT.CRYSTAL)).or(isMaterial(MAT.MAGMA)),
  );
  const isGrassOrLeaf = float(isMaterial(MAT.GRASS).or(isMaterial(MAT.MYCELIUM)));

  const planetTint = mix(
    uSoilTint,
    mix(uRockTint, uFoliageTint, isGrassOrLeaf),
    clamp(isRockLike.add(isGrassOrLeaf), 0.0, 1.0),
  );

  const wallShade = float(1.0).sub(isCliffWall.mul(uWallShade)).add(isCliffWall.mul(strataBand));
  const capHighlight = smoothstep(0.85, 0.99, capAlignment).mul(0.06);

  const wetnessDarken = float(1.0).sub(wetness.mul(0.14));
  const baseShadedColor = vCol
    .mul(planetTint)
    .mul(float(1).add(detail.r.sub(0.5).mul(uGrain).mul(detailFade)))
    .mul(wallShade)
    .add(macroPatch.add(capHighlight))
    .mul(wetnessDarken);

  // Vacuum explicitly disables haze; atmospheric worlds retain a clear near field.
  const distCam = positionWorld.length();
  const distHaze = smoothstep(uHazeStart, uHazeEnd, distCam).mul(uHaze);
  const finalColor = mix(baseShadedColor, uHorizonTint, distHaze);

  mat.colorNode = clamp(finalColor, 0.02, 1.35);
  mat.normalNode = bumpMap(detail.g, detailFade.mul(uBump));

  mat.roughnessNode = clamp(
    uRoughness
      .sub(wetness.mul(uWetResponse))
      .sub(crystalMask.mul(0.45)),
    0.15,
    0.96,
  );

  mat.metalnessNode = clamp(crystalMask.mul(0.38), 0.0, 0.65);

  // Only magma, crystal, and mycelium emit light; moisture/specular hints do not.
  const pulse = mx_noise_float(pos.mul(0.5)).mul(0.2).add(0.9);
  const emissionGain = float(isMaterial(MAT.MAGMA)).mul(uEmission.x)
    .add(crystalMask.mul(uEmission.y)).add(float(isMaterial(MAT.MYCELIUM)).mul(uEmission.z));
  // Local veins/mottles use the already sampled grain map. Distant emission
  // converges to a restrained average instead of sparkling at subpixel scale.
  const localGlow = mix(float(1), mix(float(.18), smoothstep(.56, .75, detail.b), detailFade), uEmissionGrain);
  mat.emissiveNode = uEmissiveTint.mul(emissiveMask.mul(emissionGain).mul(pulse).mul(localGlow));

  const handle: TerrainMaterialHandle = {
    material: mat,
    async loadSurfaceDetail(): Promise<void> {
      const loaded = await new THREE.TextureLoader().loadAsync(new URL('../../assets/materials/expedition-grain.png', import.meta.url).href);
      loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
      loaded.colorSpace = THREE.NoColorSpace;
      loaded.anisotropy = 4;
      detailMap.copy(loaded);
      detailMap.needsUpdate = true;
    },
    setCameraOrigin(x: number, y: number, z: number): void {
      uCameraOrigin.value.set(x, y, z);
    },
    applyPlanetConfig(cfg: PlanetConfig): void {
      uHorizonTint.value.set(...cfg.atmosphere.horizonColor);
      const p = planetVisualProfile(cfg).surface;
      uRadius.value = cfg.radius;
      uRoughness.value = p.roughness; uWetResponse.value = p.wetResponse;
      uGrain.value = p.grain; uBump.value = p.bump; uMacro.value = p.macro;
      uWallShade.value = p.wallShade; uStrata.value = p.strata; uRadialStrata.value = p.radialStrata;
      uHazeStart.value = p.hazeStart; uHazeEnd.value = p.hazeEnd; uHaze.value = hasAtmosphere(cfg) ? p.haze : 0;
      uEmission.value.set(...p.emission); uEmissionGrain.value = p.emissionGrain;
      // World palettes carry hue; additional global multipliers would muddy them.
      uRockTint.value.set(1, 1, 1); uSoilTint.value.set(1, 1, 1); uFoliageTint.value.set(1, 1, 1);
      switch (cfg.archetype) {
        case 'canyon':
          uEmissiveTint.value.set(1.0, 0.65, 0.25);
          break;
        case 'volcanic':
          uEmissiveTint.value.set(1.0, 0.45, 0.08);
          break;
        case 'cryo':
          uEmissiveTint.value.set(0.45, 0.92, 1.0);
          break;
        case 'biolum':
          uEmissiveTint.value.set(0.25, 1.0, 0.85);
          break;
        case 'shattered':
          uEmissiveTint.value.set(0.65, 0.88, 1.0);
          break;
        default:
          uRockTint.value.set(1.0, 1.0, 1.0);
          uSoilTint.value.set(1.0, 0.98, 0.95);
          uFoliageTint.value.set(1.0, 1.05, 0.98);
          uEmissiveTint.value.set(0.35, 0.95, 1.0);
          break;
      }
      uMacroScale.value = 0.045;
    },
  };

  if (initialConfig) {
    handle.applyPlanetConfig(initialConfig);
  }

  return handle;
}
