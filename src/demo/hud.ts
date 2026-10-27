/**
 * HUD: a single dim vitals line (F3 expands full diagnostics), transient toasts above
 * the inventory strip, a flight strip while airborne, and the crafting panel.
 * The help block fades itself out after a few seconds of play; H brings it back.
 */

export interface InventorySlotView {
  name: string;
  css: string;
  count: number;
  /** optional progress label, e.g. "7/12" toward the plane */
  goal?: string;
}

export interface CraftingRecipeView {
  id: string;
  name: string;
  description: string;
  canCraft: boolean;
  requirements: { name: string; need: number; have: number }[];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class Hud {
  onCraftSelect: ((id: string) => void) | null = null;
  private vitals = document.getElementById('vitals')!;
  private diag = document.getElementById('diag')!;
  private msg = document.getElementById('msg')!;
  private flight = document.getElementById('flight')!;
  private help = document.getElementById('help')!;
  private inventory = document.getElementById('hotbar')!;
  private crafting = document.getElementById('crafting')!;
  private craftButton = document.getElementById('btn-craft')!;
  private inventoryCache = '';
  private craftingCache = '';
  private vitalsCache = '';
  private helpCache = '';
  private craftKey = 'B';
  private msgTimer = 0;
  private helpTimer = 25;
  private helpShown = true;

  constructor() {
    this.crafting.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const button = (e.target as HTMLElement).closest('button[data-recipe]') as HTMLButtonElement | null;
      if (!button || button.disabled) return;
      e.preventDefault();
      this.onCraftSelect?.(button.dataset.recipe ?? '');
    });
  }

  setVitals(text: string): void {
    if (text !== this.vitalsCache) {
      this.vitals.textContent = text;
      this.vitalsCache = text;
    }
  }

  setDiag(lines: string[] | null): void {
    if (lines === null) {
      if (this.diag.style.display !== 'none') this.diag.style.display = 'none';
      return;
    }
    this.diag.style.display = 'block';
    this.diag.textContent = lines.join('\n');
  }

  setFlight(text: string | null): void {
    if (text === null) {
      if (this.flight.style.display !== 'none') this.flight.style.display = 'none';
      return;
    }
    this.flight.style.display = 'block';
    if (this.flight.textContent !== text) this.flight.textContent = text;
  }

  setInventory(slots: InventorySlotView[]): void {
    const html = slots.map((s) =>
      `<div class="slot"><div class="swatch" style="background:${s.css}"></div>` +
      `<span class="key">${escapeHtml(s.name)}</span><span class="count">${s.goal ?? s.count}</span></div>`,
    ).join('');
    if (html !== this.inventoryCache) {
      this.inventory.innerHTML = html;
      this.inventoryCache = html;
    }
  }

  setCrafting(recipes: CraftingRecipeView[], open: boolean): void {
    document.body.classList.toggle('crafting-open', open);
    this.craftButton.classList.toggle('active', open);
    this.crafting.classList.toggle('hide', !open);
    if (!open) return;
    const html = [
      `<div class="craft-head"><span>Crafting</span><span>${escapeHtml(this.craftKey)}</span></div>`,
      ...recipes.map((r) => {
        const req = r.requirements.map((m) =>
          `<span class="${m.have >= m.need ? 'ok' : 'miss'}">${m.name} ${m.have}/${m.need}</span>`).join('');
        return `<div class="craft-row${r.canCraft ? ' ready' : ''}">` +
          `<button data-recipe="${r.id}" aria-label="Craft ${r.name}" title="Craft ${r.name}" ${r.canCraft ? '' : 'disabled'}>+</button>` +
          `<div class="craft-copy"><div><strong>${r.name}</strong></div>` +
          `<p>${r.description}</p><div class="craft-req">${req}</div></div></div>`;
      }),
    ].join('');
    if (html !== this.craftingCache) {
      this.crafting.innerHTML = html;
      this.craftingCache = html;
    }
  }

  /** transient toast above the inventory strip */
  flash(text: string, seconds = 4): void {
    this.msg.textContent = text;
    this.msg.classList.add('on');
    this.msgTimer = seconds;
  }

  toggleHelp(): void {
    this.helpShown = !this.helpShown;
    this.help.classList.toggle('hide', !this.helpShown);
    this.helpTimer = this.helpShown ? 30 : 0;
  }

  setCraftKey(label: string): void {
    if (label === this.craftKey) return;
    this.craftKey = label;
    this.craftingCache = '';
  }

  setHelpText(text: string): void {
    if (text === this.helpCache) return;
    this.help.textContent = text;
    this.helpCache = text;
  }

  tick(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.classList.remove('on');
    }
    if (this.helpShown && this.helpTimer > 0) {
      this.helpTimer -= dt;
      if (this.helpTimer <= 0) {
        this.helpShown = false;
        this.help.classList.add('hide');
      }
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
