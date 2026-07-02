/**
 * Indexed geodesic sphere by midpoint subdivision of an icosahedron — used for the water
 * surface. Order n gives 10*4^n+2 unique vertices with a shared index (no vertex merging
 * pass), so per-vertex attributes like shore depth are sampled once per point.
 * Order 7: 163,842 verts / 327,680 tris — triangle edges ~7.8 m at R=900, close to tile
 * scale, so the depth tint and foam band resolve individual coastline hexes.
 */

export interface GeodesicSphere {
  /** unit directions, xyz per vertex */
  dirs: Float32Array;
  index: Uint32Array;
}

export function buildGeodesic(order: number): GeodesicSphere {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: number[] = [
    -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
    0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
    t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
  ];
  let faces: number[] = [
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ];
  // normalize the icosahedron
  for (let i = 0; i < verts.length; i += 3) {
    const l = Math.hypot(verts[i], verts[i + 1], verts[i + 2]);
    verts[i] /= l; verts[i + 1] /= l; verts[i + 2] /= l;
  }

  for (let o = 0; o < order; o++) {
    const midCache = new Map<number, number>();
    const mid = (a: number, b: number): number => {
      const key = a < b ? a * 16777216 + b : b * 16777216 + a;
      let m = midCache.get(key);
      if (m !== undefined) return m;
      m = verts.length / 3;
      const x = (verts[a * 3] + verts[b * 3]) / 2;
      const y = (verts[a * 3 + 1] + verts[b * 3 + 1]) / 2;
      const z = (verts[a * 3 + 2] + verts[b * 3 + 2]) / 2;
      const l = Math.hypot(x, y, z);
      verts.push(x / l, y / l, z / l);
      midCache.set(key, m);
      return m;
    };
    const next: number[] = new Array(faces.length * 4);
    let w = 0;
    for (let f = 0; f < faces.length; f += 3) {
      const a = faces[f], b = faces[f + 1], c = faces[f + 2];
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next[w++] = a; next[w++] = ab; next[w++] = ca;
      next[w++] = b; next[w++] = bc; next[w++] = ab;
      next[w++] = c; next[w++] = ca; next[w++] = bc;
      next[w++] = ab; next[w++] = bc; next[w++] = ca;
    }
    faces = next;
  }

  return { dirs: Float32Array.from(verts), index: Uint32Array.from(faces) };
}
