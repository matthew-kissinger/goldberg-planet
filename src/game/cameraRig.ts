/**
 * Ground-to-orbit camera on one continuous zoom axis: first person at 0, a chase boom in
 * the middle, and a radial overhead view at orbit. Floating origin: the THREE camera stays
 * at (0,0,0) and `world` holds its f64 world position, which everything else subtracts.
 */

import type * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import type { Player } from '../player/player';
import { pick } from '../world/pick';

const DIST_MIN = 2.4;
const DIST_MAX = 4200;
/** zoom exponent that puts the boom ~15 m behind the plane */
const PLANE_CAM_EXP = Math.log(15 / DIST_MIN) / Math.log(DIST_MAX / DIST_MIN);

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class CameraRig {
  /** f64 world position of the camera */
  readonly world = { x: 0, y: 0, z: 0 };
  /** unit view direction (world) */
  readonly dir = { x: 0, y: 0, z: 1 };
  /** boom length in metres; 0 = first person */
  dist = 5.2;
  private zoomExp = 0.105;
  private zoomExpTarget = 0.105;
  private planeAutoZoom = false;
  private obstruct = Infinity;
  private upX = 0;
  private upY = 1;
  private upZ = 0;
  private frame = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly geo: Goldberg,
    private layers: Layers,
    private columns: Columns,
  ) {}

  rebindPlanet(layers: Layers, columns: Columns): void {
    this.layers = layers;
    this.columns = columns;
    this.obstruct = Infinity;
  }

  update(dt: number, player: Player, wheel: number, wheelTouched: boolean): void {
    this.frame++;
    this.updateZoom(dt, player, wheel, wheelTouched);
    const [ux, uy, uz] = player.up();
    const eye = player.eye();
    const cosP = Math.cos(player.pitch), sinP = Math.sin(player.pitch);
    const vfx = player.fwdX * cosP + ux * sinP;
    const vfy = player.fwdY * cosP + uy * sinP;
    const vfz = player.fwdZ * cosP + uz * sinP;
    // overhead blend: the boom swings radial with distance so at orbit you sit directly
    // above your own location and it faces the camera (instead of sliding to the rim)
    const blend = this.dist === 0 ? 0 : smoothstep(140, 2600, this.dist);
    let tx: number, ty: number, tz: number;
    if (this.dist === 0) {
      this.obstruct = Infinity;
      this.world.x = eye[0]; this.world.y = eye[1]; this.world.z = eye[2];
      tx = eye[0] + vfx; ty = eye[1] + vfy; tz = eye[2] + vfz;
    } else {
      const bb = blend * 0.95;
      let ox = -vfx * (1 - bb) + ux * (0.12 * (1 - bb) + bb);
      let oy = -vfy * (1 - bb) + uy * (0.12 * (1 - bb) + bb);
      let oz = -vfz * (1 - bb) + uz * (0.12 * (1 - bb) + bb);
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol; oy /= ol; oz /= ol;
      const d = Math.min(this.dist, this.boomLimit(dt, eye, ox, oy, oz));
      this.world.x = eye[0] + ox * d;
      this.world.y = eye[1] + oy * d;
      this.world.z = eye[2] + oz * d;
      if (this.dist >= 60) this.keepAboveGround();
      tx = eye[0] * (1 - blend); ty = eye[1] * (1 - blend); tz = eye[2] * (1 - blend);
    }
    this.aim(dt, player, ux, uy, uz, blend * 0.95, tx, ty, tz);
  }

  private updateZoom(dt: number, player: Player, wheel: number, wheelTouched: boolean): void {
    // user wheel always takes priority over the automatic plane zoom
    if (wheelTouched) this.planeAutoZoom = false;
    // plane auto camera: ease out to a chase view on boarding, back in on stowing
    if (player.mode === 'plane' && this.dist < 6 && !this.planeAutoZoom && !wheelTouched) {
      this.planeAutoZoom = true;
      this.zoomExpTarget = PLANE_CAM_EXP;
    }
    if (this.planeAutoZoom && player.mode !== 'plane') {
      this.planeAutoZoom = false;
      this.zoomExpTarget = 0.105;
    }
    this.zoomExpTarget = Math.max(0, Math.min(1, this.zoomExpTarget + wheel * 0.00045));
    this.zoomExp += (this.zoomExpTarget - this.zoomExp) * Math.min(1, dt * 7);
    if (this.zoomExpTarget === 0 && this.zoomExp < 0.004) this.zoomExp = 0; // settle exactly into first person
    // continuous distance: ramps smoothly from 0 (no first/third-person jump cut)
    this.dist = this.zoomExp <= 0 ? 0 : DIST_MIN * Math.pow(DIST_MAX / DIST_MIN, this.zoomExp) * smoothstep(0, 0.05, this.zoomExp);
  }

  /**
   * Boom obstruction: cast eye -> camera against the column field and pull in ahead of the
   * first hit (fast), then regrow gently — never teleports, never clips. High up the
   * terrain can't reach the boom, so the cast is skipped there.
   */
  private boomLimit(dt: number, eye: readonly number[], ox: number, oy: number, oz: number): number {
    if (this.dist >= 60) {
      this.obstruct = Infinity;
      return Infinity;
    }
    if (this.frame % 2 === 1) {
      const hit = pick(this.geo, this.layers, this.columns, eye[0], eye[1], eye[2], ox, oy, oz, this.dist + 0.4);
      const allowed = hit ? Math.max(0.6, hit.dist - 0.75) : this.dist;
      this.obstruct = allowed < this.obstruct
        ? allowed
        : Math.min(allowed, this.obstruct + (allowed - this.obstruct) * Math.min(1, dt * 8));
    }
    return this.obstruct;
  }

  /** cheap radial floor for high booms */
  private keepAboveGround(): void {
    const w = this.world;
    const cr = Math.hypot(w.x, w.y, w.z);
    const tile = this.geo.tileOf(w.x, w.y, w.z);
    const minR = this.layers.topRadius(this.columns.groundLayerBelow(tile, cr)) + 1.2;
    if (cr < minR) {
      const s = minR / cr;
      w.x *= s; w.y *= s; w.z *= s;
    }
  }

  private aim(dt: number, player: Player, ux: number, uy: number, uz: number, blend: number, tx: number, ty: number, tz: number): void {
    // as the view goes overhead the radial up degenerates against the view axis; roll
    // screen-up toward the player's heading — rate-limited so fast mouse turns at mid
    // zoom can't whip the horizon
    let cux = ux * (1 - blend) + player.fwdX * blend;
    let cuy = uy * (1 - blend) + player.fwdY * blend;
    let cuz = uz * (1 - blend) + player.fwdZ * blend;
    const cul = Math.hypot(cux, cuy, cuz) || 1;
    cux /= cul; cuy /= cul; cuz /= cul;
    const k = Math.min(1, dt * (this.dist === 0 ? 30 : 7));
    this.upX += (cux - this.upX) * k;
    this.upY += (cuy - this.upY) * k;
    this.upZ += (cuz - this.upZ) * k;
    const ul = Math.hypot(this.upX, this.upY, this.upZ) || 1;
    this.upX /= ul; this.upY /= ul; this.upZ /= ul;

    const cam = this.camera;
    const w = this.world;
    cam.position.set(0, 0, 0);
    cam.up.set(this.upX, this.upY, this.upZ);
    cam.lookAt(tx - w.x, ty - w.y, tz - w.z);
    const dx = tx - w.x, dy = ty - w.y, dz = tz - w.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    this.dir.x = dx / dl; this.dir.y = dy / dl; this.dir.z = dz / dl;
    const wantNear = Math.min(60, Math.max(0.09, this.dist * 0.02));
    if (Math.abs(wantNear - cam.near) / cam.near > 0.05) {
      cam.near = wantNear;
      cam.updateProjectionMatrix();
    }
  }
}
