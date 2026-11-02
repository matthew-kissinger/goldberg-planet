import { describe, expect, it } from 'vitest';
import Info from 'three/src/renderers/common/Info.js';
import * as THREE from 'three/webgpu';
import { RenderStats } from '../src/demo/renderStats';

describe('completed render diagnostics', () => {
  it('retains actual shared-backend counters when Three resets them before the next HUD update', () => {
    // WebGPUBackend and WebGLBufferRenderer both feed this common Info class.
    const info = new Info();
    const stats = new RenderStats();
    const mesh = new THREE.Mesh();
    info.update(mesh, 36, 4);
    info.update(mesh, 6, 1);
    info.memory.geometries = 2;
    stats.capture(info);
    expect(stats.snapshot()).toEqual({ drawCalls: 2, triangles: 50, geometries: 2 });

    info.reset();
    expect(info.render.drawCalls).toBe(0);
    expect(stats.snapshot()).toEqual({ drawCalls: 2, triangles: 50, geometries: 2 });
    info.update(mesh, 9, 1);
    stats.capture(info);
    expect(stats.snapshot()).toEqual({ drawCalls: 1, triangles: 3, geometries: 2 });

    // A genuinely empty completed frame must replace the prior values with zero.
    info.reset();
    stats.capture(info);
    expect(stats.snapshot().drawCalls).toBe(0);
    expect(stats.snapshot().triangles).toBe(0);
  });
});
