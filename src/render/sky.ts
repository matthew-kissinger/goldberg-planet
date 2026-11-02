/**
 * Sky: a raymarched atmosphere shell, a smooth cloud band, and a deep-space starfield.
 *
 * Dynamically parameterized via TSL uniforms (`applyPlanetConfig`) so each world in the
 * solar system renders its own physical Rayleigh/Mie horizon tint, scale height, and
 * cloud deck when entered.
 */

import * as THREE from 'three/webgpu';
import {
  Break, Fn, If, Loop,
  cameraFar, cameraNear, viewportLinearDepth,
  dot, exp, float, floor, fract, length, max, min, mix, normalize,
  positionLocal, pow, smoothstep, sqrt, time, uniform, vec3, vec4,
} from 'three/tsl';
import { PLANET_RADIUS, WATER_SURFACE } from '../world/layers';
import type { PlanetConfig } from '../world/planetConfig';
import { mulberry32 } from '../util/prng';
import { hasAtmosphere, planetVisualProfile, PLANET_VISUAL_PROFILES } from './planetVisualProfile';

const BASE_RA = PLANET_RADIUS * 1.2;
const ATMO_H = 46;
const CLOUD_LO = 125;
const CLOUD_HI = 165;
const BASE_R_HI = PLANET_RADIUS + CLOUD_HI;

export type SkyQuality = 'high' | 'low';
const ATMO_STEPS = { high: 10, low: 6 };
const CLOUD_MARCH = { high: { steps: 18, len: 18 }, low: { steps: 10, len: 26 } };

/* eslint-disable @typescript-eslint/no-explicit-any */

const hash3 = Fn(([pIn]: any[]) => {
  const q = fract(vec3(pIn).mul(0.1031)).toVar();
  q.addAssign(dot(q, q.zyx.add(31.32)));
  return fract(q.x.add(q.y).mul(q.z));
});

const vnoise = Fn(([pIn]: any[]) => {
  const p = vec3(pIn);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(f.mul(-2).add(3)).toVar();
  const a = mix(hash3(i), hash3(i.add(vec3(1, 0, 0))), u.x);
  const b = mix(hash3(i.add(vec3(0, 1, 0))), hash3(i.add(vec3(1, 1, 0))), u.x);
  const c = mix(hash3(i.add(vec3(0, 0, 1))), hash3(i.add(vec3(1, 0, 1))), u.x);
  const d = mix(hash3(i.add(vec3(0, 1, 1))), hash3(i.add(vec3(1, 1, 1))), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
});

export class Sky {
  readonly atmo: THREE.Mesh;
  readonly clouds: THREE.Mesh | null = null;
  readonly stars: THREE.Points;
  private readonly sunlight = new THREE.Vector3();
  private atmosphereEnabled = true;
  private skyProfile = PLANET_VISUAL_PROFILES.terran.sky;
  private atmosphereThickness = 220;
  /** live-tunable: atmosphere glow strength */
  readonly kGlow = uniform(0.0035);
  /** live-tunable: cloud coverage threshold (lower = more cloud) */
  readonly cover = uniform(0.65);
  private readonly camU = uniform(new THREE.Vector3());
  private readonly fwdU = uniform(new THREE.Vector3(0, 0, -1));
  private readonly uPlanetRadius = uniform(PLANET_RADIUS);
  private readonly uRG = uniform(WATER_SURFACE);
  private readonly uRA = uniform(BASE_RA);
  private readonly uRLo = uniform(PLANET_RADIUS + CLOUD_LO);
  private readonly uRHi = uniform(BASE_R_HI);
  private readonly uZenith = uniform(new THREE.Vector3(0.18, 0.45, 0.95));
  private readonly uHorizon = uniform(new THREE.Vector3(0.62, 0.78, 1.0));
  private readonly uSunset = uniform(new THREE.Vector3(1.0, 0.42, 0.15));
  private readonly uCloudTint = uniform(new THREE.Vector3(0.97, 0.985, 1.0));
  private readonly uScaleHeight = uniform(ATMO_H);
  private readonly uNight = uniform(new THREE.Vector3(.05, .08, .16));
  private readonly uCloudLow = uniform(CLOUD_LO);
  private readonly uCloudHigh = uniform(CLOUD_HI);
  private readonly uCloudSpeed = uniform(1);
  private readonly uForwardHaze = uniform(0);
  private readonly uCloudOpacity = uniform(.38);

  constructor(scene: THREE.Scene, sunDir: THREE.Vector3, quality: SkyQuality, withClouds: boolean) {
    this.sunlight.copy(sunDir).normalize();
    const sunU = uniform(sunDir);
    const camU = this.camU;
    const fwdU = this.fwdU;
    const uPlanetRadius = this.uPlanetRadius;
    const uRG = this.uRG;
    const uRA = this.uRA;
    const uRLo = this.uRLo;
    const uRHi = this.uRHi;
    const uZenith = this.uZenith;
    const uHorizon = this.uHorizon;
    const uSunset = this.uSunset;
    const uCloudTint = this.uCloudTint;
    const uScaleHeight = this.uScaleHeight;
    const uNight = this.uNight;
    const uCloudLow = this.uCloudLow, uCloudHigh = this.uCloudHigh;
    const uCloudSpeed = this.uCloudSpeed, uForwardHaze = this.uForwardHaze;
    const uCloudOpacity = this.uCloudOpacity;

    const sceneT = (rd: any): any =>
      cameraNear.add(viewportLinearDepth.mul(cameraFar.sub(cameraNear))).div(max(dot(rd, fwdU), 1e-4));

    // --- deep-space pinpoint starfield dome ---
    {
      const starCount = 1400;
      const rng = mulberry32(0x51a7f1ed);
      const starPos = new Float32Array(starCount * 3);
      const starCol = new Float32Array(starCount * 3);
      const starR = 22000;
      for (let i = 0; i < starCount; i++) {
        const u = rng() * 2 - 1;
        const theta = rng() * 2 * Math.PI;
        const s = Math.sqrt(Math.max(0, 1 - u * u));
        starPos[i * 3] = s * Math.cos(theta) * starR;
        starPos[i * 3 + 1] = u * starR;
        starPos[i * 3 + 2] = s * Math.sin(theta) * starR;
        const b = 0.35 + 0.65 * Math.pow(rng(), 3);
        const warm = rng();
        starCol[i * 3] = b * (0.85 + 0.15 * warm);
        starCol[i * 3 + 1] = b * (0.88 + 0.10 * (1 - Math.abs(warm - 0.5)));
        starCol[i * 3 + 2] = b * (0.90 + 0.10 * (1 - warm));
      }
      const starGeom = new THREE.BufferGeometry();
      starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeom.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
      const starMat = new THREE.PointsMaterial({
        size: 2.0,
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      });
      this.stars = new THREE.Points(starGeom, starMat);
      this.stars.frustumCulled = false;
      this.stars.renderOrder = 0;
      scene.add(this.stars);
    }

    // --- atmosphere: integrate exponential density along the shell chord ---
    {
      const N = ATMO_STEPS[quality];
      const kGlow = this.kGlow;
      const shader = Fn(() => {
        const ro = vec3(camU).toVar();
        const rd = normalize(positionLocal.mul(uRA.div(BASE_RA)).sub(camU)).toVar();
        const b = dot(ro, rd).toVar();
        const roro = dot(ro, ro).toVar();
        const col = vec3(0).toVar();
        const alpha = float(0).toVar();
        const raSq = uRA.mul(uRA);
        const rgSq = uRG.mul(uRG);
        const disc = b.mul(b).sub(roro).add(raSq).toVar();
        If(disc.greaterThan(0).and(roro.greaterThan(rgSq)), () => {
          const sq = sqrt(disc);
          const t0 = max(b.negate().sub(sq), 0).toVar();
          const t1 = b.negate().add(sq).toVar();
          t1.assign(min(t1, sceneT(rd)));
          const discW = b.mul(b).sub(roro).add(rgSq);
          If(discW.greaterThan(0), () => {
            const tw = b.negate().sub(sqrt(discW));
            If(tw.greaterThan(0), () => { t1.assign(min(t1, tw)); });
          });
          If(t1.sub(t0).greaterThan(1), () => {
            const dt = t1.sub(t0).div(N);
            const od = float(0).toVar();
            const li = float(0).toVar();
            Loop(N, ({ i }: any) => {
              const p = ro.add(rd.mul(t0.add(float(i).add(0.5).mul(dt))));
              const r = length(p);
              // Density datum is the planet radius, not an oasis/magma sea level.
              const dens = exp(max(r.sub(uPlanetRadius), 0).div(uScaleHeight.negate()));
              const day = smoothstep(-0.28, 0.22, dot(p, sunU).div(r));
              od.addAssign(dens);
              li.addAssign(dens.mul(day));
            });
            od.mulAssign(dt);
            li.mulAssign(dt);
            alpha.assign(float(1).sub(exp(od.mul(kGlow).negate())));
            const glow = float(1).sub(exp(li.mul(kGlow).negate())).toVar();
            const pm = ro.add(rd.mul(t0.add(t1).mul(0.5)));
            const sdm = dot(normalize(pm), sunU);
            const warm = pow(float(1).sub(min(sdm.abs().mul(2.8), 1)), 3);
            const base = mix(uZenith, uHorizon, glow.mul(glow));
            col.assign(base.mul(glow));
            col.assign(mix(col, uSunset.mul(glow), warm.mul(0.5)));
            // Dust/ash forward scatter uses the existing integration, no extra march.
            col.addAssign(uHorizon.mul(max(dot(rd, sunU), 0).pow(8)).mul(glow).mul(uForwardHaze));
            const night = float(1).sub(exp(od.mul(-0.0012)));
            col.addAssign(uNight.mul(night).mul(float(1).sub(glow)));
          });
        });
        // Normal compositing attenuates rings/stars through the same atmosphere;
        // additive light alone left orbital debris fully bright in a dusty sky.
        return vec4(col.div(max(alpha, 1e-5)), alpha);
      });
      const mat = new THREE.MeshBasicNodeMaterial();
      const out = shader();
      mat.colorNode = out.xyz;
      mat.opacityNode = out.w;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.side = THREE.BackSide;
      mat.fog = false;
      this.atmo = new THREE.Mesh(new THREE.IcosahedronGeometry(BASE_RA, 4), mat);
      this.atmo.frustumCulled = false;
      this.atmo.renderOrder = 2;
      scene.add(this.atmo);
    }

    // --- smooth billowing cloud deck (no blocky floor() artifacts) ---
    if (withClouds) {
      const { steps: N, len: STEP } = CLOUD_MARCH[quality];
      const cover = this.cover;
      const shader = Fn(() => {
        const ro = vec3(camU).toVar();
        const rd = normalize(positionLocal.mul(uRHi.div(BASE_R_HI)).sub(camU)).toVar();
        const b = dot(ro, rd).toVar();
        const roro = dot(ro, ro).toVar();
        const acc = vec3(0).toVar();
        const trans = float(1).toVar();
        const rHiSq = uRHi.mul(uRHi);
        const rLoSq = uRLo.mul(uRLo);
        const rgSq = uRG.mul(uRG);
        const disc = b.mul(b).sub(roro).add(rHiSq).toVar();
        If(disc.greaterThan(0).and(roro.greaterThan(rgSq)), () => {
          const sq = sqrt(disc);
          const t0 = max(b.negate().sub(sq), 0).toVar();
          const t1 = b.negate().add(sq).toVar();
          t1.assign(min(t1, sceneT(rd)));
          const discW = b.mul(b).sub(roro).add(rgSq);
          If(discW.greaterThan(0), () => {
            const tw = b.negate().sub(sqrt(discW));
            If(tw.greaterThan(0), () => { t1.assign(min(t1, tw)); });
          });
          If(roro.lessThan(rLoSq), () => {
            const discL = b.mul(b).sub(roro).add(rLoSq);
            t0.assign(max(t0, b.negate().add(sqrt(max(discL, 0)))));
          });
          // Skip clear air below the deck, retaining both visible shell lobes.
          // Discarding the far lobe would introduce a coverage discontinuity
          // as a grazing ray first touches the lower cloud sphere.
          const nearEnd = t1.toVar(), farStart = t1.toVar();
          If(roro.greaterThanEqual(rLoSq), () => {
            const discL = b.mul(b).sub(roro).add(rLoSq);
            If(discL.greaterThan(0), () => {
              const lowerEntry = b.negate().sub(sqrt(discL));
              const lowerExit = b.negate().add(sqrt(discL));
              nearEnd.assign(min(t1, max(t0, lowerEntry)));
              farStart.assign(min(t1, max(t0, lowerExit)));
            });
          });
          const nearLength = max(nearEnd.sub(t0), 0);
          const cloudLength = nearLength.add(max(t1.sub(farStart), 0));
          If(cloudLength.greaterThan(0.5), () => {
            // Integrate the entire visible segment. Fixed metre steps used to
            // truncate the deck at N*STEP, leaving a moving hard coverage edge.
            const segmentStep = cloudLength.div(N).toVar();
            Loop(N, ({ i }: any) => {
              const distance = float(i).add(0.5).mul(segmentStep);
              const t = t0.add(distance).toVar();
              If(distance.greaterThanEqual(nearLength), () => { t.assign(farStart.add(distance.sub(nearLength))); });
              If(t.greaterThanEqual(t1), () => { Break(); });
              const p = ro.add(rd.mul(t)).toVar();
              const r = length(p).toVar();
              const h = r.sub(uPlanetRadius).toVar();
              If(h.greaterThan(uCloudLow).and(h.lessThan(uCloudHigh)), () => {
                const pd = p.add(vec3(1.8, 0.3, -1.2).mul(time).mul(uCloudSpeed)).mul(0.011);
                const covN = vnoise(pd).mul(0.68).add(vnoise(pd.mul(2.3)).mul(0.32));
                const shellF = h.sub(uCloudLow).div(uCloudHigh.sub(uCloudLow));
                const verticalEnvelope = shellF.mul(float(1).sub(shellF)).mul(4.0);
                const field = covN.mul(verticalEnvelope);
                If(field.greaterThan(cover), () => {
                  const day = smoothstep(-0.25, 0.3, dot(p, sunU).div(r));
                  const bright = mix(0.68, 1.05, shellF);
                  const cS = mix(vec3(0.06, 0.09, 0.16), uCloudTint.mul(bright), day);
                  const density = smoothstep(cover, cover.add(0.18), field);
                  // Beer-Lambert opacity stays consistent as segment length
                  // changes; smooth shell extinction softens grazing rays.
                  const extinction = density.mul(uCloudOpacity).mul(segmentStep.div(STEP))
                    .mul(smoothstep(0, .18, shellF)).mul(float(1).sub(smoothstep(.82, 1, shellF)));
                  const a = float(1).sub(exp(extinction.negate())).mul(smoothstep(25, 95, t));
                  acc.addAssign(cS.mul(trans.mul(a)));
                  trans.mulAssign(float(1).sub(a));
                  If(trans.lessThan(0.08), () => { Break(); });
                });
              });
            });
          });
        });
        const alpha = float(1).sub(trans);
        return vec4(acc.div(max(alpha, 1e-3)), alpha);
      });
      const mat = new THREE.MeshBasicNodeMaterial();
      const out = shader();
      mat.colorNode = out.xyz;
      mat.opacityNode = out.w;
      mat.transparent = true;
      mat.depthWrite = false;
      mat.depthTest = true;
      mat.side = THREE.BackSide;
      mat.fog = false;
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(BASE_R_HI, 4), mat);
      mesh.frustumCulled = false;
      mesh.renderOrder = 5;
      scene.add(mesh);
      this.clouds = mesh;
    }
  }

  /** Cover saved vacuum/day starts too; compile the same shell/star layouts once. */
  prepareWarmup(): () => void {
    const atmo = this.atmo.visible, clouds = this.clouds?.visible, stars = this.stars.visible;
    this.atmo.visible = this.stars.visible = true;
    if (this.clouds) this.clouds.visible = true;
    return () => {
      this.atmo.visible = atmo; this.stars.visible = stars;
      if (this.clouds) this.clouds.visible = clouds!;
    };
  }

  /** Re-parameterize the raymarched atmosphere and clouds for a newly entered planet. */
  applyPlanetConfig(config: PlanetConfig): void {
    const profile = planetVisualProfile(config).sky;
    this.skyProfile = profile;
    this.atmosphereThickness = config.atmosphere.thickness;
    this.atmosphereEnabled = hasAtmosphere(config);
    const R = config.radius;
    const rg = config.ocean.hasOcean ? R + config.waterSurfaceOffset : R - 35;
    const ra = R + config.atmosphere.thickness;
    const rLo = R + profile.cloudLow;
    const rHi = R + profile.cloudHigh;

    this.uPlanetRadius.value = R;
    this.uRG.value = rg;
    this.uRA.value = ra;
    this.uRLo.value = rLo;
    this.uRHi.value = rHi;
    this.uScaleHeight.value = profile.scaleHeight;
    this.uNight.value.set(...profile.night);
    this.uCloudLow.value = profile.cloudLow; this.uCloudHigh.value = profile.cloudHigh;
    this.uCloudSpeed.value = profile.cloudSpeed; this.uForwardHaze.value = profile.forwardHaze;
    this.uCloudOpacity.value = profile.cloudOpacity;

    this.uZenith.value.set(...config.atmosphere.zenithColor);
    this.uHorizon.value.set(...config.atmosphere.horizonColor);
    this.uSunset.value.set(...config.atmosphere.sunsetColor);
    this.uCloudTint.value.set(...config.atmosphere.cloudTint).lerp(new THREE.Vector3(...config.atmosphere.horizonColor), 1 - profile.cloudContrast);

    // Optical depth is dimensionless. Normalize by scale height so a small
    // world's thin shell does not accidentally become an almost black vacuum.
    this.kGlow.value = profile.opticalDepth / profile.scaleHeight * config.atmosphere.density;
    this.atmo.visible = this.atmosphereEnabled;
    this.atmo.scale.setScalar(ra / BASE_RA);

    if (this.clouds) {
      if (!this.atmosphereEnabled || config.atmosphere.cloudCoverage <= 0.05) {
        this.clouds.visible = false;
      } else {
        this.clouds.visible = true;
        this.cover.value = 0.62 - config.atmosphere.cloudCoverage * 0.14;
        this.clouds.scale.setScalar(rHi / BASE_R_HI);
      }
    }
  }

  /** floating origin: recenter the shells and refresh the planet-frame camera uniforms */
  update(camX: number, camY: number, camZ: number, camera: THREE.PerspectiveCamera): void {
    const radius = Math.hypot(camX, camY, camZ) || 1;
    // These miniature planets need dense readable air at walking height, but
    // that scale height creates a thick opaque limb from orbit. Compress only
    // the display falloff after leaving the shell; no gameplay datum changes.
    const orbitalDisplay = THREE.MathUtils.smoothstep(radius - this.uPlanetRadius.value,
      this.atmosphereThickness + 40, this.atmosphereThickness * 3 + 200);
    this.uScaleHeight.value = this.skyProfile.scaleHeight * (1 - orbitalDisplay * .72);
    this.uCloudOpacity.value = this.skyProfile.cloudOpacity * (1 - orbitalDisplay * .75);
    const day = THREE.MathUtils.smoothstep((camX * this.sunlight.x + camY * this.sunlight.y + camZ * this.sunlight.z) / radius, -0.2, 0.25);
    const space = THREE.MathUtils.smoothstep(radius - this.uPlanetRadius.value, 120, 450);
    (this.stars.material as THREE.PointsMaterial).opacity = 0.72 * (this.atmosphereEnabled ? Math.max(1 - day, space) : 1);
    this.stars.visible = (this.stars.material as THREE.PointsMaterial).opacity > 0.01;
    this.camU.value.set(camX, camY, camZ);
    camera.getWorldDirection(this.fwdU.value);
    this.atmo.position.set(-camX, -camY, -camZ);
    if (this.clouds) this.clouds.position.set(-camX, -camY, -camZ);
  }
}
