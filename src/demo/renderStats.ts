interface RendererInfo {
  render: { drawCalls: number; triangles: number };
  memory: { geometries: number };
}

/** Counters captured after renderer.render(), retained across Three's next-frame reset. */
export class RenderStats {
  private drawCalls = 0;
  private triangles = 0;
  private geometries = 0;

  capture(info: RendererInfo): void {
    this.drawCalls = info.render.drawCalls;
    this.triangles = info.render.triangles;
    this.geometries = info.memory.geometries;
  }

  snapshot(): { drawCalls: number; triangles: number; geometries: number } {
    return { drawCalls: this.drawCalls, triangles: this.triangles, geometries: this.geometries };
  }
}
