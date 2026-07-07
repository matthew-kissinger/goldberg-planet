import * as THREE from 'three/webgpu';
import type { Goldberg } from '../geo/goldberg';
import type { Layers } from '../world/layers';
import type { Columns } from '../world/columns';
import { WATER_SURFACE } from '../world/layers';
import { routeAtlasVisible, type RouteGuide } from '../sim/navigation';

const DASH_COUNT = 18;
const ATLAS_DASH_COUNT = 28;
const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);

function materialFor(kind: RouteGuide['kind'], opacity = 0.78, intensity = 0.42): THREE.MeshStandardMaterial {
  const color = kind === 'target'
    ? 0xf1cf79
    : kind === 'planned'
    ? 0x77f0b2
    : kind === 'home'
    ? 0xff9d4d
    : kind === 'cave' || kind === 'caveAnchor'
    ? 0x6de2d8
    : kind === 'skyfall'
    ? 0xf4b75f
    : kind === 'murmur'
    ? 0xb99cff
    : kind === 'seasonAfterglow'
    ? 0xf6f0a2
    : 0x87a9d6;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.04,
    emissive: color,
    emissiveIntensity: intensity,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

function unitAt(centers: ArrayLike<number>, tile: number): THREE.Vector3 {
  const i = Math.max(0, Math.trunc(tile)) * 3;
  return new THREE.Vector3(centers[i] ?? 0, centers[i + 1] ?? 0, centers[i + 2] ?? 1).normalize();
}

function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number): THREE.Vector3 {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  const theta = Math.acos(dot);
  if (theta < 1e-5) return a.clone().lerp(b, t).normalize();
  const sinTheta = Math.sin(theta);
  return a.clone().multiplyScalar(Math.sin((1 - t) * theta) / sinTheta)
    .add(b.clone().multiplyScalar(Math.sin(t * theta) / sinTheta))
    .normalize();
}

export class RouteRenderer {
  readonly group = new THREE.Group();
  private readonly dashes: THREE.Mesh[] = [];
  private readonly atlasDashes: THREE.Mesh[] = [];
  private readonly endpointMarkers: THREE.Mesh[] = [];
  private materialKind: RouteGuide['kind'] | null = null;

  constructor(scene: THREE.Scene) {
    this.group.name = 'route-ribbon';
    scene.add(this.group);
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const atlasGeom = new THREE.BoxGeometry(1, 1, 1);
    const markerGeom = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    for (let i = 0; i < DASH_COUNT; i++) {
      const dash = new THREE.Mesh(geom, materialFor('waystone'));
      dash.name = `routeDash${i}`;
      dash.visible = false;
      dash.frustumCulled = false;
      this.dashes.push(dash);
      this.group.add(dash);
    }
    for (let i = 0; i < ATLAS_DASH_COUNT; i++) {
      const dash = new THREE.Mesh(atlasGeom, materialFor('waystone', 0.88, 0.84));
      dash.name = `routeAtlasDash${i}`;
      dash.visible = false;
      dash.frustumCulled = false;
      dash.renderOrder = 9;
      this.atlasDashes.push(dash);
      this.group.add(dash);
    }
    for (const name of ['routeAtlasOrigin', 'routeAtlasTarget']) {
      const marker = new THREE.Mesh(markerGeom, materialFor('waystone', 0.78, 0.68));
      marker.name = name;
      marker.visible = false;
      marker.frustumCulled = false;
      marker.renderOrder = 9;
      this.endpointMarkers.push(marker);
      this.group.add(marker);
    }
  }

  private hideAll(): void {
    for (const dash of this.dashes) dash.visible = false;
    for (const dash of this.atlasDashes) dash.visible = false;
    for (const marker of this.endpointMarkers) marker.visible = false;
  }

  update(
    guide: RouteGuide | null,
    fromTile: number,
    geo: Goldberg,
    layers: Layers,
    columns: Columns,
    camWorld: { x: number; y: number; z: number },
    camDist: number,
    seconds: number,
  ): void {
    if (!guide || guide.targetTile === fromTile) {
      this.hideAll();
      return;
    }
    if (this.materialKind !== guide.kind) {
      const material = materialFor(guide.kind);
      for (const dash of this.dashes) dash.material = material;
      const atlasMaterial = materialFor(guide.kind, 0.9, 0.92);
      for (const dash of this.atlasDashes) dash.material = atlasMaterial;
      const markerMaterial = materialFor(guide.kind, 0.78, 0.72);
      for (const marker of this.endpointMarkers) marker.material = markerMaterial;
      this.materialKind = guide.kind;
    }

    const from = unitAt(geo.centers, fromTile);
    const to = unitAt(geo.centers, guide.targetTile);
    const angle = Math.acos(Math.max(-1, Math.min(1, from.dot(to))));
    if (angle < 0.002) {
      this.hideAll();
      return;
    }

    const active = Math.max(4, Math.min(DASH_COUNT, Math.ceil(angle / 0.055)));
    const m = new THREE.Matrix4();
    const xAxis = new THREE.Vector3();
    const yAxis = new THREE.Vector3();
    const zAxis = new THREE.Vector3();
    const next = new THREE.Vector3();
    const delta = new THREE.Vector3();
    for (let i = 0; i < this.dashes.length; i++) {
      const dash = this.dashes[i];
      dash.visible = i < active;
      if (!dash.visible) continue;

      const t = (i + 1) / (active + 1);
      const up = slerpUnit(from, to, t);
      next.copy(slerpUnit(from, to, Math.min(0.985, t + 0.018)));
      delta.copy(next).sub(up);
      xAxis.copy(delta).addScaledVector(up, -delta.dot(up)).normalize();
      if (xAxis.lengthSq() < 1e-6) {
        xAxis.crossVectors(up, WORLD_Y);
        if (xAxis.lengthSq() < 1e-6) xAxis.crossVectors(up, WORLD_X);
        xAxis.normalize();
      }
      yAxis.copy(up);
      zAxis.crossVectors(xAxis, yAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis);
      dash.setRotationFromMatrix(m);

      const tile = geo.tileOf(up.x, up.y, up.z);
      const ground = layers.topRadius(columns.groundLayerBelow(tile, layers.bounds[0]));
      const r = Math.max(ground + 0.12, WATER_SURFACE + 0.2);
      dash.position.set(
        up.x * r - camWorld.x,
        up.y * r - camWorld.y,
        up.z * r - camWorld.z,
      );
      const pulse = 1 + Math.sin(seconds * 2.4 + i * 0.6) * 0.06;
      dash.scale.set(1.25 * pulse, 0.035, 0.16);
    }

    const showAtlas = routeAtlasVisible(guide, camDist);
    const atlasActive = showAtlas ? Math.max(8, Math.min(ATLAS_DASH_COUNT, Math.ceil(angle / 0.036))) : 0;
    const atlasBaseRadius = Math.max(WATER_SURFACE + 118, layers.bounds[0] + 34);
    const atlasScale = Math.max(0.9, Math.min(2.25, camDist / 1150));
    for (let i = 0; i < this.atlasDashes.length; i++) {
      const dash = this.atlasDashes[i];
      dash.visible = i < atlasActive;
      if (!dash.visible) continue;

      const t = (i + 1) / (atlasActive + 1);
      const up = slerpUnit(from, to, t);
      next.copy(slerpUnit(from, to, Math.min(0.985, t + 0.014)));
      delta.copy(next).sub(up);
      xAxis.copy(delta).addScaledVector(up, -delta.dot(up)).normalize();
      if (xAxis.lengthSq() < 1e-6) {
        xAxis.crossVectors(up, WORLD_Y);
        if (xAxis.lengthSq() < 1e-6) xAxis.crossVectors(up, WORLD_X);
        xAxis.normalize();
      }
      yAxis.copy(up);
      zAxis.crossVectors(xAxis, yAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis);
      dash.setRotationFromMatrix(m);

      const bow = Math.sin(Math.PI * t);
      const r = atlasBaseRadius + bow * 48;
      dash.position.set(
        up.x * r - camWorld.x,
        up.y * r - camWorld.y,
        up.z * r - camWorld.z,
      );
      const pulse = 1 + Math.sin(seconds * 1.55 + i * 0.38) * 0.08;
      dash.scale.set(6.5 * atlasScale * pulse, 0.08 * atlasScale, 0.72 * atlasScale);
    }

    for (let i = 0; i < this.endpointMarkers.length; i++) {
      const marker = this.endpointMarkers[i];
      marker.visible = showAtlas;
      if (!marker.visible) continue;
      const up = i === 0 ? from : to;
      xAxis.crossVectors(WORLD_Y, up).normalize();
      if (xAxis.lengthSq() < 1e-6) xAxis.crossVectors(WORLD_X, up).normalize();
      yAxis.copy(up);
      zAxis.crossVectors(xAxis, yAxis).normalize();
      m.makeBasis(xAxis, yAxis, zAxis);
      marker.setRotationFromMatrix(m);
      const r = atlasBaseRadius - 7 + i * 3;
      marker.position.set(
        up.x * r - camWorld.x,
        up.y * r - camWorld.y,
        up.z * r - camWorld.z,
      );
      const pulse = 1 + Math.sin(seconds * 1.3 + i * 1.7) * 0.07;
      const radius = (i === 0 ? 4.2 : 7.1) * atlasScale * pulse;
      marker.scale.set(radius, 0.06 * atlasScale, radius);
    }
  }

  stats(): { active: number; meshes: number; atlasActive: number; atlasMeshes: number; endpointActive: number; endpointMeshes: number } {
    return {
      active: this.dashes.filter((dash) => dash.visible).length,
      meshes: this.dashes.length,
      atlasActive: this.atlasDashes.filter((dash) => dash.visible).length,
      atlasMeshes: this.atlasDashes.length,
      endpointActive: this.endpointMarkers.filter((marker) => marker.visible).length,
      endpointMeshes: this.endpointMarkers.length,
    };
  }
}
