/** Small authored expedition kit. Parts are baked into one opaque vertex-colored
 * geometry per stationary assembly, then shared by every placed instance. */
import * as THREE from 'three/webgpu';
import type { StructureKind } from '../sim/persistence';

type V3 = [number, number, number];
type Paint = number | THREE.Color;
export const CAMP_COLORS = {
  cream: 0xeadfc4, moss: 0x667659, ochre: 0xc49348, dark: 0x343d39,
  wood: 0x765c46, clay: 0xb97852, stone: 0x929485, leaf: 0x85a363,
} as const;

export class GeometryKit {
  private readonly parts: THREE.BufferGeometry[] = [];

  add(source: THREE.BufferGeometry, color: Paint, position: V3 = [0, 0, 0], scale: V3 = [1, 1, 1], rotation: V3 = [0, 0, 0]): this {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    geometry.clearGroups();
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(...position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
      new THREE.Vector3(...scale),
    );
    geometry.applyMatrix4(matrix);
    const tint = color instanceof THREE.Color ? color : new THREE.Color(color);
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(geometry);
    return this;
  }

  box(color: Paint, position: V3, size: V3, rotation: V3 = [0, 0, 0]): this {
    return this.add(new THREE.BoxGeometry(...size), color, position, [1, 1, 1], rotation);
  }

  cylinder(color: Paint, position: V3, top: number, bottom: number, height: number, sides = 8, rotation: V3 = [0, 0, 0]): this {
    return this.add(new THREE.CylinderGeometry(top, bottom, height, sides), color, position, [1, 1, 1], rotation);
  }

  crown(color: Paint, position: V3, scale: V3, detail = 0): this {
    return this.add(new THREE.IcosahedronGeometry(1, detail), color, position, scale);
  }

  beam(color: Paint, from: V3, to: V3, width: number, sides = 7): this {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(width * 0.72, width, direction.length(), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    return this.add(geometry, color, a.add(b).multiplyScalar(0.5).toArray() as V3);
  }

  finish(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const count = this.parts.reduce((n, part) => n + part.getAttribute('position').count, 0);
    for (const name of ['position', 'normal', 'color']) {
      const values = new Float32Array(count * 3);
      let offset = 0;
      for (const part of this.parts) {
        const attribute = part.getAttribute(name);
        values.set(attribute.array, offset); offset += attribute.array.length;
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, 3));
    }
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface CampStationAsset {
  geometry: THREE.BufferGeometry;
  animation?: { geometry: THREE.BufferGeometry; position: V3; motion: 'pulse' | 'spin'; emissive: boolean };
  cargoY: number;
}

/** Each automation station has its own readable working silhouette. */
export function buildCampStation(kind: StructureKind): CampStationAsset {
  const k = new GeometryKit(), c = CAMP_COLORS;
  let animation: CampStationAsset['animation'];
  if (kind === 'campfire') {
    k.cylinder(c.dark, [0, 0.035, 0], 0.66, 0.7, 0.07);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      k.crown(i % 2 ? c.stone : c.cream, [Math.cos(a) * 0.55, 0.13, Math.sin(a) * 0.55], [0.16, 0.13, 0.15]);
    }
    k.beam(c.wood, [-0.34, 0.14, -0.18], [0.32, 0.14, 0.14], 0.075);
    k.beam(c.wood, [-0.29, 0.16, 0.24], [0.29, 0.16, -0.2], 0.075);
    k.beam(c.dark, [-0.58, 0.02, 0], [-0.47, 0.96, 0], 0.035);
    k.beam(c.dark, [0.58, 0.02, 0], [0.47, 0.96, 0], 0.035);
    k.beam(c.dark, [-0.49, 0.96, 0], [0.49, 0.96, 0], 0.028);
    k.beam(c.dark, [0, 0.94, 0], [0, 0.69, 0], 0.018);
    k.cylinder(c.ochre, [0, 0.58, 0], 0.2, 0.15, 0.22);
    k.cylinder(c.dark, [0, 0.696, 0], 0.21, 0.21, 0.025);
    k.cylinder(c.cream, [0, 0.728, 0], 0.045, 0.045, 0.04);
    const flame = new GeometryKit().crown(0xe8a346, [0, 0.1, 0], [0.18, 0.26, 0.17]).crown(0xf1d39a, [-0.06, 0.1, 0.02], [0.09, 0.17, 0.1]);
    animation = { geometry: flame.finish(), position: [0, 0.26, 0], motion: 'pulse', emissive: true };
  } else if (kind === 'workbench') {
    for (const x of [-0.53, 0.53]) {
      k.beam(c.moss, [x, 0.035, -0.32], [x, 0.79, 0.22], 0.055);
      k.beam(c.moss, [x, 0.035, 0.32], [x, 0.79, -0.22], 0.055);
      k.box(c.dark, [x, 0.025, 0], [0.15, 0.05, 0.73]);
    }
    k.box(c.wood, [0, 0.32, 0], [1.12, 0.05, 0.58]);
    k.box(c.cream, [0, 0.82, 0], [1.3, 0.12, 0.74]);
    k.box(c.moss, [-0.13, 0.889, 0], [0.65, 0.018, 0.42]);
    k.box(c.cream, [-0.13, 0.901, 0], [0.48, 0.012, 0.31], [0, 0.13, 0]);
    k.cylinder(c.ochre, [0.39, 0.95, -0.1], 0.09, 0.09, 0.18);
    k.box(c.dark, [0.4, 0.92, 0.2], [0.21, 0.08, 0.13]);
    k.beam(c.wood, [-0.48, 0.91, 0.25], [-0.17, 0.91, 0.17], 0.024);
    k.box(c.ochre, [-0.49, 0.92, 0.25], [0.08, 0.08, 0.17]);
    k.box(c.moss, [0, 0.45, -0.28], [0.48, 0.23, 0.13]);
  } else if (kind === 'furnace') {
    k.cylinder(c.dark, [0, 0.07, 0], 0.61, 0.68, 0.14);
    k.cylinder(c.clay, [0, 0.61, 0], 0.5, 0.61, 0.98);
    k.cylinder(c.cream, [0, 1.12, 0], 0.49, 0.53, 0.12);
    k.cylinder(c.clay, [0, 1.29, 0], 0.2, 0.49, 0.22);
    k.cylinder(c.dark, [-0.18, 1.57, -0.09], 0.12, 0.16, 0.45);
    k.cylinder(c.cream, [-0.18, 1.8, -0.09], 0.18, 0.18, 0.08);
    k.box(c.cream, [0, 0.53, 0.53], [0.45, 0.49, 0.15]);
    k.box(c.dark, [0, 0.53, 0.617], [0.32, 0.34, 0.035]);
    k.box(c.dark, [0, 0.28, 0.59], [0.5, 0.055, 0.3]);
    k.box(c.ochre, [0, 0.35, 0.66], [0.25, 0.08, 0.13]);
    animation = { geometry: new GeometryKit().box(0xe9a34e, [0, 0, 0], [0.25, 0.21, 0.02]).finish(), position: [0, 0.52, 0.64], motion: 'pulse', emissive: true };
  } else if (kind === 'storage_chest') {
    for (const x of [-0.46, 0.46]) k.box(c.dark, [x, 0.06, 0], [0.16, 0.12, 0.65]);
    k.box(c.moss, [0, 0.36, 0], [1.06, 0.5, 0.64]);
    k.box(c.cream, [0, 0.63, 0], [1.12, 0.1, 0.69]);
    k.box(c.moss, [0, 0.7, 0], [0.88, 0.05, 0.5]);
    for (const x of [-0.36, 0.36]) k.box(c.ochre, [x, 0.4, 0], [0.07, 0.62, 0.71]);
    k.box(c.dark, [0, 0.56, 0.355], [0.18, 0.13, 0.05]);
    k.box(c.cream, [0, 0.57, 0.39], [0.12, 0.04, 0.025]);
  } else if (kind === 'solar_relay') {
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      k.beam(c.moss, [Math.cos(a) * 0.58, 0.04, Math.sin(a) * 0.58], [0, 0.8, 0], 0.065);
      k.box(c.dark, [Math.cos(a) * 0.58, 0.035, Math.sin(a) * 0.58], [0.18, 0.07, 0.18]);
    }
    k.cylinder(c.cream, [0, 1.18, 0], 0.07, 0.1, 1.4);
    k.box(c.cream, [0, 1.94, 0], [1.12, 0.075, 0.89], [0.35, 0, 0]);
    // Recessed dark cells and generous cream seams read as a collector at distance.
    for (const x of [-0.36, 0, 0.36]) for (const z of [-0.21, 0.21]) {
      k.box(c.moss, [x, 1.986 - Math.sin(0.35) * z, Math.cos(0.35) * z], [0.31, 0.025, 0.36], [0.35, 0, 0]);
    }
    k.box(c.ochre, [0, 0.57, 0.15], [0.28, 0.36, 0.21]);
  } else if (kind === 'extractor') {
    k.box(c.dark, [0, 0.07, 0], [1.16, 0.14, 0.87]);
    for (const x of [-0.46, 0.46]) k.box(c.cream, [x, 0.83, -0.17], [0.14, 1.54, 0.18]);
    k.box(c.moss, [0, 1.57, -0.17], [1.08, 0.25, 0.39]);
    k.box(c.ochre, [0, 1.27, 0.04], [0.49, 0.34, 0.43]);
    k.box(c.moss, [0, 0.28, -0.3], [0.72, 0.28, 0.26]);
    const drill = new GeometryKit().cylinder(c.dark, [0, 0, 0], 0.09, 0.09, 0.85);
    for (let i = 0; i < 6; i++) drill.box(c.ochre, [0, -0.35 + i * 0.12, 0], [0.35, 0.045, 0.11], [0, i * 0.85, -0.22]);
    animation = { geometry: drill.finish(), position: [0, 0.64, 0.07], motion: 'spin', emissive: false };
  } else if (kind === 'synthesizer') {
    k.box(c.dark, [0, 0.07, 0], [1.25, 0.14, 0.78]);
    k.box(c.moss, [0, 0.29, 0], [1.12, 0.3, 0.68]);
    for (const x of [-0.35, 0.35]) {
      k.cylinder(c.cream, [x, 0.89, -0.04], 0.22, 0.22, 0.96);
      k.cylinder(c.ochre, [x, 1.39, -0.04], 0.23, 0.23, 0.08);
      k.cylinder(c.moss, [x, 0.54, -0.04], 0.24, 0.24, 0.13);
      k.beam(c.dark, [x, 1.43, -0.04], [0, 1.62, -0.04], 0.04);
    }
    k.box(c.dark, [0, 0.78, 0.32], [0.3, 0.3, 0.1]);
    k.box(c.ochre, [0, 0.8, 0.38], [0.18, 0.12, 0.025]);
    k.box(c.cream, [0, 0.52, 0.39], [0.39, 0.07, 0.1]);
  } else if (kind === 'mass_driver') {
    k.cylinder(c.dark, [0, 0.09, 0], 0.59, 0.65, 0.18);
    k.box(c.moss, [0, 0.42, 0], [0.59, 0.59, 0.63]);
    for (const x of [-0.23, 0.23]) {
      k.beam(c.cream, [x, 0.63, -0.5], [x, 1.26, 0.59], 0.105);
      for (let i = 0; i < 4; i++) k.cylinder(c.ochre, [x, 0.73 + i * 0.12, -0.32 + i * 0.21], 0.13, 0.13, 0.075, 8, [Math.PI / 3, 0, 0]);
    }
    k.box(c.dark, [0, 0.8, -0.38], [0.61, 0.18, 0.18], [-0.52, 0, 0]);
  } else if (kind === 'landing_pad') {
    k.cylinder(c.moss, [0, 0.11, 0], 2.16, 2.28, 0.22, 8);
    k.cylinder(c.cream, [0, 0.245, 0], 2.06, 2.13, 0.05, 8);
    k.cylinder(c.moss, [0, 0.278, 0], 1.66, 1.66, 0.016, 8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      k.box(c.ochre, [Math.cos(a) * 1.22, 0.296, Math.sin(a) * 1.22], [0.38, 0.025, 0.12], [0, -a, 0]);
    }
    k.box(c.cream, [0, 0.3, 0], [0.12, 0.02, 0.64]);
    k.box(c.cream, [0, 0.3, 0], [0.64, 0.02, 0.12]);
    for (const x of [-1.45, 1.45]) {
      k.cylinder(c.dark, [x, 0.49, -1.25], 0.06, 0.1, 0.5);
      k.cylinder(c.ochre, [x, 0.78, -1.25], 0.12, 0.12, 0.16);
      k.cylinder(c.cream, [x, 0.89, -1.25], 0.14, 0.14, 0.05);
    }
  } else if (kind === 'eco_dome') {
    k.cylinder(c.moss, [0, 0.12, 0], 2.08, 2.18, 0.24, 10);
    k.cylinder(c.wood, [0, 0.25, 0], 1.88, 1.88, 0.02, 10);
    // Open conservatory ribs avoid the previous intersecting transparent sphere.
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a), z = Math.sin(a);
      k.beam(c.cream, [x * 1.99, 0.24, z * 1.99], [x * 1.51, 1.72, z * 1.51], 0.045);
      k.beam(c.cream, [x * 1.51, 1.72, z * 1.51], [x * 0.38, 2.45, z * 0.38], 0.045);
      if (i % 2 === 0) {
        k.cylinder(c.clay, [x * 1.08, 0.47, z * 1.08], 0.36, 0.3, 0.4);
        k.crown(c.leaf, [x * 1.08, 0.9, z * 1.08], [0.43, 0.55, 0.43]);
      }
    }
    k.cylinder(c.ochre, [0, 2.44, 0], 0.43, 0.49, 0.12);
    k.cylinder(c.cream, [0, 2.56, 0], 0.22, 0.43, 0.12);
    k.box(c.cream, [0, 0.37, 0.2], [0.53, 0.2, 1.18]);
    k.crown(c.leaf, [0, 0.74, 0.1], [0.34, 0.5, 0.5]);
  }
  const geometry = k.finish();
  geometry.name = `expedition-${kind}`;
  return { geometry, animation, cargoY: geometry.boundingBox!.max.y + 0.37 };
}
