/**
 * HUD: a single dim vitals line (F3 expands full diagnostics), transient toasts above
 * the hotbar, a flight strip while airborne, and a tap/click-selectable hotbar.
 * The help block fades itself out after a few seconds of play; H brings it back.
 */

export interface HotbarSlot {
  name: string;
  css: string;
  count: number;
}

export interface InventoryLedgerEntryView {
  item: string;
  name: string;
  css: string;
  count: number;
  detail: string;
}

export interface InventoryLedgerSectionView {
  id: string;
  title: string;
  total: number;
  emptyLabel: string;
  entries: InventoryLedgerEntryView[];
}

export interface InventoryLedgerView {
  title: string;
  summary: string;
  burden?: { status: string; label: string; detail: string };
  sections: InventoryLedgerSectionView[];
}

export interface HudControlLabels {
  craft: string;
  route: string;
  hotbar: string[];
}

export interface CraftingRecipeView {
  id: string;
  name: string;
  description: string;
  count: number;
  owned: number;
  canCraft: boolean;
  canPlace: boolean;
  selected: boolean;
  station?: string;
  requirements: { name: string; need: number; have: number }[];
}

export interface RouteSlateView {
  title: string;
  summary: string;
  pins: { id: string; label: string; detail: string; ready: boolean }[];
}

export interface HearthJournalView {
  title: string;
  summary: string;
  next: { label: string; detail: string; tone?: string }[];
  sections: {
    id: string;
    title: string;
    summary: string;
    entries: { label: string; detail: string; tone?: string }[];
  }[];
}

export type ChestStorageAction = 'depositOne' | 'depositAll' | 'withdrawOne' | 'withdrawAll';

export interface ChestStoragePanelView {
  id: number;
  title: string;
  summary: string;
  rows: {
    item: string;
    name: string;
    css: string;
    pack: number;
    stored: number;
    canDeposit: boolean;
    canWithdraw: boolean;
  }[];
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export class Hud {
  onSlotSelect: ((i: number) => void) | null = null;
  onCraftSelect: ((id: string) => void) | null = null;
  onPlaceSelect: ((id: string) => void) | null = null;
  onJournalToggle: (() => void) | null = null;
  onJournalClose: (() => void) | null = null;
  onStorageTransfer: ((chestId: number, item: string, action: ChestStorageAction) => void) | null = null;
  onStorageClose: (() => void) | null = null;
  private vitals = document.getElementById('vitals')!;
  private diag = document.getElementById('diag')!;
  private msg = document.getElementById('msg')!;
  private flight = document.getElementById('flight')!;
  private slot = document.getElementById('slotname')!;
  private help = document.getElementById('help')!;
  private hotbar = document.getElementById('hotbar')!;
  private crafting = document.getElementById('crafting')!;
  private route = document.getElementById('route')!;
  private journal = document.getElementById('journal')!;
  private storage = document.getElementById('storage')!;
  private journalButton = document.getElementById('btn-journal')!;
  private craftButton = document.getElementById('btn-craft')!;
  private hotbarCache = '';
  private craftingCache = '';
  private routeCache = '';
  private journalCache = '';
  private storageCache = '';
  private vitalsCache = '';
  private helpCache = '';
  private controls: HudControlLabels = {
    craft: 'B',
    route: 'M',
    hotbar: ['1', '2', '3', '4', '5'],
  };
  private ledger: InventoryLedgerView | null = null;
  private msgTimer = 0;
  private slotTimer = 0;
  private routeTimer = 0;
  private helpTimer = 25;
  private helpShown = true;

  constructor() {
    this.hotbar.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (el?.dataset.i !== undefined) {
        e.stopPropagation();
        this.onSlotSelect?.(Number(el.dataset.i));
      }
    });
    this.crafting.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const button = (e.target as HTMLElement).closest('button[data-recipe]') as HTMLButtonElement | null;
      const place = (e.target as HTMLElement).closest('button[data-place]') as HTMLButtonElement | null;
      if ((!button || button.disabled) && (!place || place.disabled)) return;
      e.preventDefault();
      if (place && !place.disabled) this.onPlaceSelect?.(place.dataset.place ?? '');
      else if (button && !button.disabled) this.onCraftSelect?.(button.dataset.recipe ?? '');
    });
    this.journal.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const close = (e.target as HTMLElement).closest('button[data-journal-close]') as HTMLButtonElement | null;
      if (close) {
        e.preventDefault();
        this.onJournalClose?.();
      }
    });
    this.journalButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onJournalToggle?.();
    });
    this.storage.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const close = (e.target as HTMLElement).closest('button[data-storage-close]') as HTMLButtonElement | null;
      if (close) {
        e.preventDefault();
        this.onStorageClose?.();
        return;
      }
      const action = (e.target as HTMLElement).closest('button[data-storage-action]') as HTMLButtonElement | null;
      if (!action || action.disabled) return;
      e.preventDefault();
      const chestId = Number(action.dataset.chest);
      const item = action.dataset.item ?? '';
      const transfer = action.dataset.storageAction as ChestStorageAction | undefined;
      if (!Number.isFinite(chestId) || !transfer) return;
      this.onStorageTransfer?.(chestId, item, transfer);
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

  setHotbar(slots: HotbarSlot[], sel: number): void {
    const html = slots.map((s, i) =>
      `<div class="slot${i === sel ? ' sel' : ''}" data-i="${i}"><div class="swatch" style="background:${s.css}"></div>` +
      `<span class="key">${escapeHtml(this.controls.hotbar[i] ?? String(i + 1))}</span><span class="count">${s.count}</span></div>`,
    ).join('');
    if (html !== this.hotbarCache) {
      this.hotbar.innerHTML = html;
      this.hotbarCache = html;
    }
  }

  private renderLedger(ledger: InventoryLedgerView): string {
    const visibleSections = ledger.sections.filter((section) => section.entries.length > 0);
    const sections = visibleSections.length > 0
      ? visibleSections.map((section) => {
        const entries = section.entries.slice(0, 8).map((entry) =>
          `<div class="ledger-entry">` +
          `<span class="ledger-swatch" style="background:${escapeHtml(entry.css)}"></span>` +
          `<span class="ledger-name">${escapeHtml(entry.name)}</span>` +
          `<span class="ledger-count">${entry.count}</span>` +
          `<span class="ledger-detail">${escapeHtml(entry.detail)}</span></div>`,
        ).join('');
        const hidden = section.entries.length > 8
          ? `<div class="ledger-more">+${section.entries.length - 8} more</div>`
          : '';
        return `<section class="ledger-section ${escapeHtml(section.id)}">` +
          `<div class="ledger-section-head"><span>${escapeHtml(section.title)}</span><b>${section.total}</b></div>` +
          `<div class="ledger-items">${entries}${hidden}</div></section>`;
      }).join('')
      : '<div class="ledger-empty">pack empty · gather, craft, and place to fill it</div>';
    return `<div class="pack-ledger">` +
      `<div class="ledger-head"><strong>${escapeHtml(ledger.title)}</strong><span>${escapeHtml(ledger.summary)}</span></div>` +
      (ledger.burden ? `<div class="ledger-burden ${escapeHtml(ledger.burden.status)}"><span>${escapeHtml(ledger.burden.label)}</span><p>${escapeHtml(ledger.burden.detail)}</p></div>` : '') +
      `<div class="ledger-grid">${sections}</div></div>`;
  }

  setCrafting(recipes: CraftingRecipeView[], open: boolean, ledger?: InventoryLedgerView | null): void {
    if (ledger !== undefined) this.ledger = ledger;
    document.body.classList.toggle('crafting-open', open);
    this.craftButton.classList.toggle('active', open);
    this.crafting.classList.toggle('hide', !open);
    if (!open) return;
    const html = [
      `<div class="craft-head"><span>Crafting</span><span>${escapeHtml(this.controls.craft)}</span></div>`,
      this.ledger ? this.renderLedger(this.ledger) : '',
      ...recipes.map((r) => {
        const req = r.requirements.map((m) =>
          `<span class="${m.have >= m.need ? 'ok' : 'miss'}">${m.name} ${m.have}/${m.need}</span>`).join('');
        const station = r.station ? `<span class="miss">${r.station}</span>` : '';
        const needs = `${station}${req}`;
        const owned = r.owned > 0 ? `<span class="owned">x${r.owned}</span>` : '';
        return `<div class="craft-row${r.canCraft ? ' ready' : ''}${r.selected ? ' selected' : ''}">` +
          `<button data-recipe="${r.id}" aria-label="Craft ${r.name}" title="Craft ${r.name}" ${r.canCraft ? '' : 'disabled'}>+</button>` +
          `<button data-place="${r.id}" aria-label="Place ${r.name}" title="Place ${r.name}" ${r.canPlace ? '' : 'disabled'}>set</button>` +
          `<div class="craft-copy"><div><strong>${r.name}</strong>${owned}<em>+${r.count}</em></div>` +
          `<p>${r.description}</p><div class="craft-req">${needs}</div></div></div>`;
      }),
    ].join('');
    if (html !== this.craftingCache) {
      this.crafting.innerHTML = html;
      this.craftingCache = html;
    }
  }

  setRouteSlate(slate: RouteSlateView | null, seconds = 8): void {
    if (!slate) {
      this.route.classList.add('hide');
      this.routeTimer = 0;
      return;
    }
    const rows = slate.pins.slice(0, 5).map((pin) =>
      `<div class="route-pin${pin.ready ? ' ready' : ''}">` +
      `<span class="route-dot"></span><div><strong>${pin.label}</strong><p>${pin.detail}</p></div></div>`,
    ).join('');
    const html = `<div class="route-head"><span>${slate.title}</span><span>${escapeHtml(this.controls.route)}</span></div>` +
      `<div class="route-summary">${slate.summary}</div>${rows}`;
    if (html !== this.routeCache) {
      this.route.innerHTML = html;
      this.routeCache = html;
    }
    this.route.classList.remove('hide');
    this.routeTimer = seconds;
  }

  setJournal(journal: HearthJournalView | null, open: boolean): void {
    this.journalButton.classList.toggle('active', open);
    if (!open || !journal) {
      this.journal.classList.add('hide');
      return;
    }
    const toneClass = (tone: string | undefined): string => tone ? ` ${escapeHtml(tone)}` : '';
    const nextRows = journal.next.slice(0, 5).map((entry) =>
      `<div class="journal-next-item${toneClass(entry.tone)}"><strong>${escapeHtml(entry.label)}</strong><span>${escapeHtml(entry.detail)}</span></div>`,
    ).join('');
    const sectionRows = journal.sections.map((section) => {
      const entries = section.entries.slice(0, 7).map((entry) =>
        `<div class="journal-entry${toneClass(entry.tone)}"><span>${escapeHtml(entry.label)}</span><p>${escapeHtml(entry.detail)}</p></div>`,
      ).join('');
      return `<section class="journal-section ${escapeHtml(section.id)}">` +
        `<div class="journal-section-head"><strong>${escapeHtml(section.title)}</strong><span>${escapeHtml(section.summary)}</span></div>` +
        `<div class="journal-entries">${entries}</div></section>`;
    }).join('');
    const html = `<div class="journal-head"><div><strong>${escapeHtml(journal.title)}</strong><p>${escapeHtml(journal.summary)}</p></div>` +
      '<button data-journal-close="1" aria-label="Close journal" title="Close journal">×</button></div>' +
      `<div class="journal-next">${nextRows}</div><div class="journal-sections">${sectionRows}</div>`;
    if (html !== this.journalCache) {
      this.journal.innerHTML = html;
      this.journalCache = html;
    }
    this.journal.classList.remove('hide');
  }

  setStorage(view: ChestStoragePanelView | null, open: boolean): void {
    if (!open || !view) {
      this.storage.classList.add('hide');
      return;
    }
    const rows = view.rows.map((row) => {
      const swatch = `<span class="storage-swatch" style="background:${escapeHtml(row.css)}"></span>`;
      const carried = row.pack > 0 ? ' ready' : '';
      const stored = row.stored > 0 ? ' ready' : '';
      return `<div class="storage-row">` +
        `<div class="storage-item">${swatch}<span>${escapeHtml(row.name)}</span></div>` +
        `<div class="storage-count${carried}">${row.pack}</div>` +
        `<div class="storage-count${stored}">${row.stored}</div>` +
        `<div class="storage-actions">` +
        `<button data-storage-action="depositOne" data-chest="${view.id}" data-item="${escapeHtml(row.item)}" aria-label="Stash one ${escapeHtml(row.name)}" title="Stash one" ${row.canDeposit ? '' : 'disabled'}>&gt;</button>` +
        `<button data-storage-action="depositAll" data-chest="${view.id}" data-item="${escapeHtml(row.item)}" aria-label="Stash all ${escapeHtml(row.name)}" title="Stash all" ${row.canDeposit ? '' : 'disabled'}>&gt;&gt;</button>` +
        `<button data-storage-action="withdrawOne" data-chest="${view.id}" data-item="${escapeHtml(row.item)}" aria-label="Take one ${escapeHtml(row.name)}" title="Take one" ${row.canWithdraw ? '' : 'disabled'}>&lt;</button>` +
        `<button data-storage-action="withdrawAll" data-chest="${view.id}" data-item="${escapeHtml(row.item)}" aria-label="Take all ${escapeHtml(row.name)}" title="Take all" ${row.canWithdraw ? '' : 'disabled'}>&lt;&lt;</button>` +
        `</div></div>`;
    }).join('');
    const html = `<div class="storage-head"><div><strong>${escapeHtml(view.title)}</strong><p>${escapeHtml(view.summary)}</p></div>` +
      '<button data-storage-close="1" aria-label="Close storage" title="Close storage">×</button></div>' +
      '<div class="storage-labels"><span>material</span><span>pack</span><span>chest</span><span>move</span></div>' +
      `<div class="storage-rows">${rows}</div>`;
    if (html !== this.storageCache) {
      this.storage.innerHTML = html;
      this.storageCache = html;
    }
    this.storage.classList.remove('hide');
  }

  /** transient toast above the hotbar */
  flash(text: string, seconds = 4): void {
    this.msg.textContent = text;
    this.msg.classList.add('on');
    this.msgTimer = seconds;
  }

  /** brief label under the toast line when the selected block changes */
  slotName(text: string): void {
    this.slot.textContent = text;
    this.slot.classList.add('on');
    this.slotTimer = 1.3;
  }

  toggleHelp(): void {
    this.helpShown = !this.helpShown;
    this.help.classList.toggle('hide', !this.helpShown);
    this.helpTimer = this.helpShown ? 30 : 0;
  }

  setControlLabels(labels: HudControlLabels): void {
    if (
      labels.craft === this.controls.craft &&
      labels.route === this.controls.route &&
      labels.hotbar.join('|') === this.controls.hotbar.join('|')
    ) return;
    this.controls = { craft: labels.craft, route: labels.route, hotbar: labels.hotbar.slice() };
    this.hotbarCache = '';
    this.craftingCache = '';
    this.routeCache = '';
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
    if (this.slotTimer > 0) {
      this.slotTimer -= dt;
      if (this.slotTimer <= 0) this.slot.classList.remove('on');
    }
    if (this.routeTimer > 0) {
      this.routeTimer -= dt;
      if (this.routeTimer <= 0) this.route.classList.add('hide');
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
