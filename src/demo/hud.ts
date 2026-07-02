/** Minimal text HUD + hotbar. */

export interface HotbarSlot {
  name: string;
  css: string;
  count: number;
}

export class Hud {
  private stats = document.getElementById('stats')!;
  private msg = document.getElementById('msg')!;
  private hotbar = document.getElementById('hotbar')!;
  private hotbarCache = '';
  private msgTimer = 0;

  setStats(lines: string[]): void {
    this.stats.textContent = lines.join('\n');
  }

  setHotbar(slots: HotbarSlot[], sel: number): void {
    const html = slots.map((s, i) =>
      `<div class="slot${i === sel ? ' sel' : ''}"><div class="swatch" style="background:${s.css}"></div>` +
      `<span class="key">${i + 1}</span><span class="count">${s.count}</span><span class="name">${s.name}</span></div>`,
    ).join('');
    if (html !== this.hotbarCache) {
      this.hotbar.innerHTML = html;
      this.hotbarCache = html;
    }
  }

  flash(text: string, seconds = 6): void {
    this.msg.textContent = text;
    this.msgTimer = seconds;
  }

  tick(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.textContent = '';
    }
  }
}

export function splash(msg: string, frac: number): void {
  const bar = document.getElementById('splashbar');
  const label = document.getElementById('splashmsg');
  if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
  if (label) label.textContent = msg;
}

export function hideSplash(): void {
  document.getElementById('splash')?.remove();
}
