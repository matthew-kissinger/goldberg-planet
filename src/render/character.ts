/**
 * The player's body: a capsule with a visor hint, plus a little bush plane that appears
 * around it in plane mode. Visible whenever the camera is pulled back — faded in over a
 * short distance band instead of popping — oriented by the player's local frame
 * (up = radial, forward = transported heading), pitched with velocity and banked with
 * the turn while flying.
 */

import * as THREE from 'three/webgpu';
import type { Player } from '../player/player';

export class Character {
  readonly group: THREE.Group;
  private readonly plane: THREE.Group;
  private readonly prop: THREE.Mesh;
  private readonly body: THREE.Group;
  private readonly fadeMats: THREE.MeshStandardMaterial[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly right = new THREE.Vector3();
  private readonly upV = new THREE.Vector3();
  private readonly back = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private propAngle = 0;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.body = new THREE.Group();

    const mat = (color: number, roughness = 0.6, metalness = 0.05): THREE.MeshStandardMaterial => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: true });
      this.fadeMats.push(m);
      return m;
    };

    const suit = mat(0xd8dee8);
    const visorMat = mat(0x2a3d55, 0.25, 0.2);
    const hullMat = mat(0xc4502e, 0.55, 0.1);
    const wingMat = mat(0xe8dfc8, 0.7, 0);
    wingMat.side = THREE.DoubleSide;
    const propMat = mat(0x2b2b30, 0.5, 0.1);

    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.05, 6, 14), suit);
    capsule.position.set(0, 0.93, 0);
    this.body.add(capsule);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.1), visorMat);
    visor.position.set(0, 1.38, -0.29);
    this.body.add(visor);

    // --- the plane: fuselage + high wing + tail + spinning prop, forward = -Z ---
    this.plane = new THREE.Group();
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 3.2, 10), hullMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.set(0, 0.8, 0.15);
    this.plane.add(fuselage);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.65, 10), hullMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.8, -1.75);
    this.plane.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.08, 1.25), wingMat);
    wing.position.set(0, 1.62, -0.25);
    this.plane.add(wing);
    const strutL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.15), propMat);
    strutL.position.set(-1.15, 1.2, -0.1);
    strutL.rotation.z = 0.9;
    const strutR = strutL.clone();
    strutR.position.x = 1.15;
    strutR.rotation.z = -0.9;
    this.plane.add(strutL, strutR);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.68), hullMat);
    fin.position.set(0, 1.25, 1.65);
    this.plane.add(fin);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.6), wingMat);
    stab.position.set(0, 0.86, 1.68);
    this.plane.add(stab);
    this.prop = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.06), propMat);
    this.prop.position.set(0, 0.8, -2.1);
    this.plane.add(this.prop);
    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), propMat);
    spinner.position.set(0, 0.8, -2.12);
    this.plane.add(spinner);

    this.plane.visible = false;
    this.body.add(this.plane);

    this.group.add(this.body);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** eye/camera-relative update; camWorld is f64 */
  update(player: Player, camWorld: { x: number; y: number; z: number }, camDist: number, dt: number): void {
    // fade in with distance instead of popping at a threshold
    const alpha = Math.max(0, Math.min(1, (camDist - 1.3) / 1.7));
    const show = alpha > 0.02;
    this.group.visible = show;
    if (!show) return;
    for (const m of this.fadeMats) m.opacity = alpha;
    this.plane.visible = player.mode === 'plane';

    const [ux, uy, uz] = player.up();
    this.upV.set(ux, uy, uz);
    this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ);
    this.right.crossVectors(this.upV, this.back);
    this.m.makeBasis(this.right, this.upV, this.back);
    this.group.quaternion.setFromRotationMatrix(this.m);

    // flight attitude: pitch with actual velocity, bank with the turn
    if (player.mode === 'plane') {
      const v = Math.hypot(player.vx, player.vy, player.vz);
      if (v > 1) {
        const vr = (player.vx * ux + player.vy * uy + player.vz * uz) / v;
        const vp = Math.asin(Math.max(-1, Math.min(1, vr)));
        this.q.setFromAxisAngle(this.right.normalize(), -vp * 0.8);
        this.group.quaternion.premultiply(this.q);
      }
      this.back.set(-player.fwdX, -player.fwdY, -player.fwdZ).normalize();
      this.q.setFromAxisAngle(this.back, -player.bank);
      this.group.quaternion.premultiply(this.q);
      this.propAngle += dt * (8 + player.planeSpeed * 0.5);
      this.prop.rotation.z = this.propAngle;
    }

    this.group.position.set(player.px - camWorld.x, player.py - camWorld.y, player.pz - camWorld.z);
  }
}
