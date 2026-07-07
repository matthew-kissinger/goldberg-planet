import * as THREE from 'three/webgpu';

export interface TileSurfaceFrame {
  normal: readonly [number, number, number];
  east: readonly [number, number, number];
  north: readonly [number, number, number];
}

export function makeSurfaceBasisFromYaw(
  frame: TileSurfaceFrame,
  yaw: number,
  out: THREE.Matrix4,
  outX: THREE.Vector3,
  outY: THREE.Vector3,
  outZ: THREE.Vector3,
): THREE.Matrix4 {
  const ca = Math.cos(yaw);
  const sa = Math.sin(yaw);
  outY.set(frame.normal[0], frame.normal[1], frame.normal[2]).normalize();
  outZ.set(
    -frame.east[0] * sa + frame.north[0] * ca,
    -frame.east[1] * sa + frame.north[1] * ca,
    -frame.east[2] * sa + frame.north[2] * ca,
  ).normalize();
  return makeSurfaceBasisFromForward(outY, outZ, out, outX, outY, outZ);
}

export function makeSurfaceBasisFromForward(
  up: THREE.Vector3,
  forward: THREE.Vector3,
  out: THREE.Matrix4,
  outX: THREE.Vector3,
  outY: THREE.Vector3,
  outZ: THREE.Vector3,
): THREE.Matrix4 {
  outY.copy(up).normalize();
  outZ.copy(forward).addScaledVector(outY, -forward.dot(outY));
  if (outZ.lengthSq() < 1e-10) {
    const pickX = Math.abs(outY.x) < 0.9;
    const ax = pickX ? 1 : 0;
    const ay = pickX ? 0 : 1;
    const dot = outY.x * ax + outY.y * ay;
    outZ.set(ax - outY.x * dot, ay - outY.y * dot, -outY.z * dot);
  }
  outZ.normalize();
  outX.crossVectors(outY, outZ).normalize();
  outZ.crossVectors(outX, outY).normalize();
  return out.makeBasis(outX, outY, outZ);
}
