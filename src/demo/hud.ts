/**
 * Exploration HUD: a quiet world title, compact condition and supplies, and two
 * accessible journal panels for field notes, travel, inventory, and crafting.
 * World actions remain in the game; panels expose callbacks and own focus while open.
 */

import type { PlanetNavTarget } from '../world/solarSystem';
import type { StructureKind } from '../sim/persistence';
import type { GameMode } from '../sim/gameMode';
import type { ExplorerAppearance } from '../render/explorerKit';

export interface EcologyView {
  world?: string;
  description?: string;
  region: string;
  sites: ReadonlyArray<{ id: string; name: string; biome: string; description: string; visited: boolean }>;
  observation: { id: string; name: string; behavior: string; distance: number; familiarity: number; canFeed?: boolean; observed?: boolean } | null;
  observedCount: number;
}

export interface InventorySlotView {
  name: string;
  css: string;
  count: number;
  goal?: string;
}

export interface CraftingRecipeView {
  id: string;
  name: string;
  description: string;
  canCraft: boolean;
  requirements: { name: string; need: number; have: number }[];
}

export interface StructureBlueprintView {
  kind: StructureKind;
  name: string;
  description: string;
  powerKw: number;
  canBuild: boolean;
  selected: boolean;
  requirements: { name: string; need: number; have: number }[];
}

export interface VitalsCardInput {
  fps: number;
  planetName: string;
  healthPct: number;
  hungerPct: number;
  shieldPct: number;
  isRegenerating: boolean;
  inSafeAura: boolean;
  coopCount?: number;
}

export interface ObjectiveView {
  stageLabel: string;
  title: string;
  description: string;
  steps: Array<{ label: string; done: boolean }>;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Crisp inline SVG icon for each survival resource, tool, food, and vehicle in the hotbar. */
function itemSvgIcon(name: string, colorCss: string): string {
  const n = name.toLowerCase();
  if (n.includes('wood')) {
    return `<svg viewBox="0 0 28 28"><rect x="4" y="13" width="20" height="7" rx="3" fill="#8b5a2b" stroke="#cfa06e" stroke-width="1.4"/><circle cx="7" cy="16.5" r="2.2" fill="#deb887"/><rect x="6" y="7" width="17" height="6" rx="2.5" fill="#704620" stroke="#b88652" stroke-width="1.2"/></svg>`;
  }
  if (n.includes('flint')) {
    return `<svg viewBox="0 0 28 28"><polygon points="14,3 23,12 18,24 8,23 5,13" fill="#525b66" stroke="#9aa6b5" stroke-width="1.5"/><polygon points="14,3 21,12 14,19" fill="#737f8e"/></svg>`;
  }
  if (n.includes('stone') || n.includes('ferric')) {
    return `<svg viewBox="0 0 28 28"><polygon points="8,6 20,5 24,14 20,23 7,23 4,14" fill="#788290" stroke="#b6c2d2" stroke-width="1.4"/><circle cx="11" cy="12" r="2" fill="#d97736"/><circle cx="17" cy="17" r="1.8" fill="#d97736"/></svg>`;
  }
  if (n.includes('raw')) {
    return `<svg viewBox="0 0 28 28"><ellipse cx="14" cy="15" rx="9" ry="6.5" fill="#d94848" stroke="#fca5a5" stroke-width="1.6"/><circle cx="17" cy="14" r="2.3" fill="#fef2f2"/></svg>`;
  }
  if (n.includes('roast') || n.includes('cooked')) {
    return `<svg viewBox="0 0 28 28"><line x1="5" y1="22" x2="23" y2="6" stroke="#f3e5ab" stroke-width="3" stroke-linecap="round"/><ellipse cx="14" cy="14" rx="8.5" ry="6" transform="rotate(-32 14 14)" fill="#d97224" stroke="#fdba74" stroke-width="1.5"/></svg>`;
  }
  if (n.includes('hide')) {
    return `<svg viewBox="0 0 28 28"><path d="M7,5 L21,5 L23,11 L20,23 L8,23 L5,11 Z" fill="#9c6334" stroke="#d6a172" stroke-width="1.4"/></svg>`;
  }
  if (n.includes('bone')) {
    return `<svg viewBox="0 0 28 28"><line x1="7" y1="21" x2="21" y2="7" stroke="#ede4d3" stroke-width="4" stroke-linecap="round"/><circle cx="6.5" cy="21.5" r="3" fill="#ede4d3"/><circle cx="21.5" cy="6.5" r="3" fill="#ede4d3"/></svg>`;
  }
  if (n.includes('quartz') || n.includes('crystal')) {
    return `<svg viewBox="0 0 28 28"><polygon points="14,3 20,11 17,24 11,24 8,11" fill="#38e8d8" stroke="#a7f3d0" stroke-width="1.4"/><polygon points="7,10 12,15 10,24 5,21" fill="#22b8cf"/></svg>`;
  }
  if (n.includes('hatchet')) {
    return `<svg viewBox="0 0 28 28"><line x1="7" y1="23" x2="20" y2="6" stroke="#9c6635" stroke-width="3" stroke-linecap="round"/><polygon points="14,5 24,8 22,16 14,12" fill="#cbd5e1" stroke="#f8fafc" stroke-width="1.3"/></svg>`;
  }
  if (n.includes('spear') || n.includes('hunting')) {
    return `<svg viewBox="0 0 28 28"><line x1="5" y1="23" x2="20" y2="8" stroke="#9c6635" stroke-width="2.6" stroke-linecap="round"/><polygon points="24,4 21,12 16,7" fill="#e2e8f0" stroke="#38bdf8" stroke-width="1.2"/></svg>`;
  }
  if (n.includes('pickaxe')) {
    return `<svg viewBox="0 0 28 28"><line x1="6" y1="22" x2="20" y2="8" stroke="#9c6635" stroke-width="2.8" stroke-linecap="round"/><path d="M12,5 Q20,5 23,16" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  if (n.includes('sky') || n.includes('skiff') || n.includes('plane')) {
    return `<svg viewBox="0 0 28 28"><ellipse cx="14" cy="16" rx="6" ry="4" fill="#f59e0b" stroke="#fde68a" stroke-width="1.3"/><circle cx="6" cy="12" r="4" fill="none" stroke="#38bdf8" stroke-width="1.8"/><circle cx="22" cy="12" r="4" fill="none" stroke="#38bdf8" stroke-width="1.8"/></svg>`;
  }
  if (n.includes('starfarer') || n.includes('orbital') || n.includes('star')) {
    return `<svg viewBox="0 0 28 28"><polygon points="14,3 23,21 14,17 5,21" fill="#60a5fa" stroke="#e0f2fe" stroke-width="1.5"/><circle cx="14" cy="21" r="2.8" fill="#38bdf8"/></svg>`;
  }
  return `<svg viewBox="0 0 28 28"><rect x="5" y="5" width="18" height="18" rx="4" fill="${colorCss}" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/></svg>`;
}

export class Hud {
  onGameModeSelect: ((mode: GameMode) => void) | null = null;
  onAppearanceChange: ((appearance: Partial<ExplorerAppearance>) => void) | null = null;
  onSiteSelect: ((id: string) => void) | null = null;
  onObserve: (() => void) | null = null;
  onFeed: (() => void) | null = null;
  onCraftSelect: ((id: string) => void) | null = null;
  onStructureSelect: ((kind: StructureKind) => void) | null = null;
  onPlanetSelect: ((planetId: string) => void) | null = null;
  onBuildStripClick: (() => void) | null = null;
  onCraftToggle: (() => void) | null = null;
  onCraftClose: (() => void) | null = null;

  private vitals = document.getElementById('vitals')!;
  private objectiveCard = document.getElementById('objective-card');
  private gameMenu = document.getElementById('game-menu')!;
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
  private menuCache = '';
  private objectiveCache = '';
  private craftKey = 'B';
  private msgTimer = 0;
  private menuOpen = false;
  private craftingOpen = false;
  private activeMenuTab: 'notes' | 'aurelia' | 'planets' | 'explorer' | 'controls' = 'notes';
  private activeCraftTab: 'pack' | 'make' | 'camp' = 'make';
  private returnFocus: HTMLElement | null = null;
  private planets: PlanetNavTarget[] = [];
  private planetStatus = '';
  private objective: ObjectiveView | null = null;
  private slots: InventorySlotView[] = [];
  private recipes: CraftingRecipeView[] = [];
  private structures: StructureBlueprintView[] = [];
  private controlCopy = '';
  private gameMode: GameMode = 'survival';
  private appearance: ExplorerAppearance = { version: 1, outfit: 'field', hair: 'bun', headgear: 'none', pack: 'pack', skin: 'warm', hairColor: 'brown', stature: 1 };
  private ecology: EcologyView = { region: 'Aurelia', sites: [], observation: null, observedCount: 0 };
  private readonly travel = document.createElement('div');

  constructor() {
    this.travel.className = 'travel-status';
    this.travel.setAttribute('role', 'status');
    this.travel.hidden = true;
    document.body.appendChild(this.travel);
    const actions = document.getElementById('hud-actions');
    const buildStrip = document.getElementById('build-strip');
    for (const root of [actions, this.crafting, this.gameMenu, this.inventory, this.objectiveCard, buildStrip]) {
      if (!root) continue;
      // Keep UI interactions out of the global mouse-look handler, preserving native button clicks.
      root.addEventListener('pointerdown', (event) => event.stopPropagation());
      root.addEventListener('mousedown', (event) => event.stopPropagation());
      root.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
      });
    }
    actions?.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (button?.dataset.action === 'guide') this.toggleMenu();
      if (button?.dataset.action === 'satchel') this.onCraftToggle?.();
    });
    this.inventory.addEventListener('click', () => { this.activeCraftTab = 'pack'; this.onCraftToggle?.(); });
    buildStrip?.addEventListener('click', () => this.onBuildStripClick?.());
    this.objectiveCard?.addEventListener('click', () => { this.activeMenuTab = 'notes'; this.setMenuOpen(true); });
    this.crafting.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'close-craft') this.onCraftClose?.();
      else if (button.dataset.craftTab) {
        this.activeCraftTab = button.dataset.craftTab as typeof this.activeCraftTab;
        this.renderCrafting();
      } else if (button.dataset.recipe) this.onCraftSelect?.(button.dataset.recipe);
      else if (button.dataset.structure) this.onStructureSelect?.(button.dataset.structure as StructureKind);
      else if (button.dataset.action === 'place-selected') {
        this.onCraftClose?.();
        this.onBuildStripClick?.();
      }
    });
    this.gameMenu.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'close-menu') this.setMenuOpen(false);
      else if (button.dataset.tab) {
        this.activeMenuTab = button.dataset.tab as typeof this.activeMenuTab;
        this.renderMenu();
      } else if (button.dataset.planet) {
        this.setMenuOpen(false);
        this.onPlanetSelect?.(button.dataset.planet);
      } else if (button.dataset.site) {
        this.setMenuOpen(false); this.onSiteSelect?.(button.dataset.site);
      } else if (button.dataset.gameMode) {
        this.onGameModeSelect?.(button.dataset.gameMode as GameMode);
      } else if (button.dataset.appearanceKey && button.dataset.appearanceValue) {
        const patch = { [button.dataset.appearanceKey]: button.dataset.appearanceValue } as Partial<ExplorerAppearance>;
        this.appearance = { ...this.appearance, ...patch };
        this.onAppearanceChange?.(patch); this.renderMenu();
      } else if (button.dataset.action === 'observe') {
        this.onObserve?.();
      } else if (button.dataset.action === 'feed') {
        this.onFeed?.();
      } else if (button.dataset.action === 'view-kit') {
        this.setMenuOpen(false);
      } else if (button.dataset.action === 'open-satchel') {
        this.setMenuOpen(false);
        this.onCraftToggle?.();
      }
    });
    this.gameMenu.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.appearanceKey !== 'stature') return;
      const stature = Math.max(0.94, Math.min(1.06, Number(input.value)));
      if (!Number.isFinite(stature)) return;
      this.appearance = { ...this.appearance, stature };
      const output = this.gameMenu.querySelector<HTMLOutputElement>('[data-stature-output]');
      if (output) output.value = `${Math.round(stature * 100)}%`;
      // Keep this native range element alive throughout a drag; the next tab
      // render uses the updated state without rebuilding the focused slider.
      this.onAppearanceChange?.({ stature });
    });
    for (const panel of [this.gameMenu, this.crafting]) {
      panel.addEventListener('keydown', (event) => this.panelKeydown(event, panel));
    }
  }

  private panelKeydown(event: KeyboardEvent, panel: HTMLElement): void {
    // Prevent held game keys from entering Input while a journal panel owns focus.
    // Keyup continues bubbling so keys held before opening the panel can clear.
    event.stopPropagation();
    if (panel === this.gameMenu && event.code === 'KeyB') {
      event.preventDefault(); this.setMenuOpen(false); this.onCraftToggle?.(); return;
    }
    if (panel === this.crafting && (event.code === 'KeyM' || event.code === 'KeyH')) {
      event.preventDefault(); this.onCraftClose?.(); this.setMenuOpen(true); return;
    }
    if (event.key === 'Escape' || (panel === this.crafting && event.code === 'KeyB') ||
      (panel === this.gameMenu && (event.code === 'KeyM' || event.code === 'KeyH'))) {
      event.preventDefault(); event.stopPropagation();
      if (panel === this.gameMenu) this.setMenuOpen(false);
      else this.onCraftClose?.();
      return;
    }
    if (event.key !== 'Tab') return;
    event.stopPropagation();
    const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (!first) return;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  }

  /** Preserve keyboard focus and reading position when inventory counts change. */
  private replaceMarkup(root: HTMLElement, html: string): void {
    const focused = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
      ? document.activeElement : null;
    const focusData = focused ? { ...focused.dataset } : null;
    const scroller = root.querySelector<HTMLElement>('.journal-body');
    const scrollTop = scroller?.scrollTop ?? 0;
    root.innerHTML = html;
    const nextScroller = root.querySelector<HTMLElement>('.journal-body');
    if (nextScroller) nextScroller.scrollTop = scrollTop;
    if (focusData) {
      const next = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')].find((button) =>
        Object.entries(focusData).every(([key, value]) => button.dataset[key] === value));
      (next ?? root.querySelector<HTMLButtonElement>('button'))?.focus({ preventScroll: true });
    }
  }

  private rememberFocus(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
  }

  private restoreFocus(): void {
    const target = this.returnFocus?.isConnected ? this.returnFocus : document.querySelector<HTMLElement>('#app canvas');
    target?.focus({ preventScroll: true });
  }

  isMenuOpen(): boolean { return this.menuOpen; }
  toggleMenu(): void { this.setMenuOpen(!this.menuOpen); }

  setGameMode(mode: GameMode): void {
    if (mode === this.gameMode) return;
    this.gameMode = mode;
    this.renderMenu();
    this.renderCrafting();
  }

  setAppearance(appearance: ExplorerAppearance): void {
    if (JSON.stringify(appearance) === JSON.stringify(this.appearance)) return;
    this.appearance = { ...appearance };
    if (this.menuOpen && this.activeMenuTab === 'explorer') this.renderMenu();
  }

  setEcology(view: EcologyView): void {
    this.ecology = { ...view, region: view.region.replace(/[-_]/g, ' ') };
    if (this.menuOpen && this.activeMenuTab === 'aurelia') this.renderMenu();
  }

  setMenuOpen(open: boolean): void {
    if (open === this.menuOpen) return;
    if (open) { this.onCraftClose?.(); this.rememberFocus(); }
    this.menuOpen = open;
    document.body.classList.toggle('guide-open', open);
    this.gameMenu.classList.toggle('hide', !open);
    document.querySelector('[data-action="guide"]')?.setAttribute('aria-expanded', String(open));
    if (open) {
      this.renderMenu();
      this.gameMenu.querySelector<HTMLButtonElement>('[data-action="close-menu"]')?.focus();
    } else this.restoreFocus();
  }

  private explorerMarkup(): string {
    const groups = [
      ['outfit', 'Field clothes', [['field', 'Field cream'], ['reed', 'Reed green'], ['ochre', 'Ochre'], ['night', 'Night blue']]],
      ['hair', 'Hair shape', [['short', 'Short'], ['bun', 'Bun'], ['braid', 'Braid']]],
      ['hairColor', 'Hair color', [['brown', 'Brown'], ['black', 'Black'], ['silver', 'Silver'], ['copper', 'Copper']]],
      ['headgear', 'Headwear', [['none', 'None'], ['hat', 'Field hat'], ['hood', 'Hood']]],
      ['pack', 'Carry kit', [['pack', 'Backpack'], ['satchel', 'Satchel'], ['none', 'None']]],
      ['skin', 'Skin tone', [['warm', 'Warm'], ['deep', 'Deep'], ['light', 'Light']]],
    ] as const;
    return `<section class="journal-intro"><span class="eyebrow">Your explorer / ${this.gameMode}</span><h2>Make this journey yours.</h2><p>Clothes and kit change your explorer immediately. Close the journal and zoom out to see the whole outfit.</p></section>
      <section class="mode-section" aria-labelledby="mode-title"><h3 id="mode-title">Choose your expedition</h3><p>Survival and Creative keep separate saves. Switching mode saves this journey and opens the other one.</p><div class="mode-grid">
      ${(['survival', 'creative'] as const).map((mode) => `<article class="mode-card${mode === this.gameMode ? ' current' : ''}"><h4>${mode === 'survival' ? 'Survival' : 'Creative'}</h4><p>${mode === 'survival' ? 'Gather, cook and build. Craft your skiff and Starfarer, then travel to each destination yourself.' : 'Every tool, vehicle and suit upgrade is supplied. Build freely, refill supplies and visit any destination.'}</p><button class="journal-button" data-game-mode="${mode}" aria-pressed="${mode === this.gameMode}" ${mode === this.gameMode ? 'disabled' : ''}>${mode === this.gameMode ? 'Current expedition' : `Open ${mode === 'survival' ? 'Survival' : 'Creative'}`}</button></article>`).join('')}
      </div></section><section class="kit-section" aria-labelledby="kit-title"><h3 id="kit-title">Clothes &amp; field kit</h3><div class="kit-grid">
      ${groups.map(([key, label, options]) => `<fieldset class="kit-field"><legend>${label}</legend><div class="kit-options">${options.map(([value, name]) => `<button class="kit-option" data-appearance-key="${key}" data-appearance-value="${value}" aria-pressed="${this.appearance[key] === value}">${['outfit', 'hairColor', 'skin'].includes(key) ? `<span class="kit-swatch swatch-${key}-${value}" aria-hidden="true"></span>` : ''}${name}</button>`).join('')}</div></fieldset>`).join('')}
      <fieldset class="kit-field stature-field"><legend>Stature</legend><label for="explorer-stature">A slightly shorter or taller explorer <output for="explorer-stature" data-stature-output>${Math.round(this.appearance.stature * 100)}%</output></label><input id="explorer-stature" data-appearance-key="stature" type="range" min="0.94" max="1.06" step="0.01" value="${this.appearance.stature}" aria-label="Explorer stature"></fieldset>
      </div><button class="text-button" data-action="view-kit">Back to the world to see your kit <span aria-hidden="true">↗</span></button></section>`;
  }

  private ecologyMarkup(): string {
    const { observation: animal, sites } = this.ecology;
    const canObserve = !!animal && animal.distance <= 18;
    const canFeed = !!animal && animal.distance <= 7 && animal.canFeed !== false;
    return `<section class="journal-intro"><span class="eyebrow">${escapeHtml(this.ecology.world ?? 'Aurelia')} / living field notes</span><h2>${escapeHtml(this.ecology.region.replace(/[-_]/g, ' '))}</h2><p>${escapeHtml(this.ecology.description ?? 'Living Shores and Six Wild Regions')}. Choose a region below to find its landscape, growth and wildlife.</p><div class="ecology-counts"><span><b>${sites.filter((site) => site.visited).length}/${sites.length}</b> regions visited</span><span><b>${this.ecology.observedCount}</b> animals observed</span></div></section>
      <section class="field-observation" aria-labelledby="observation-title"><span class="eyebrow">Nearby wildlife</span><h3 id="observation-title">${animal ? escapeHtml(animal.name) : 'Take a quiet moment.'}</h3>
      ${animal ? `<p>${escapeHtml(animal.behavior)} · ${Math.max(0, animal.distance).toFixed(0)}m away · ${Math.round(Math.max(0, Math.min(1, animal.familiarity)) * 100)}% familiar${animal.observed ? ' · Recorded in your notes' : ''}</p><div class="observation-actions"><button class="journal-button" data-action="observe" ${canObserve ? '' : 'disabled'}>${animal.observed ? 'Observe again' : 'Observe animal'}</button><button class="journal-button" data-action="feed" ${canFeed ? '' : 'disabled'}>Offer plant fiber</button></div><p class="journal-footnote">Observe within 18m. Approach slowly; offer plant fiber within 7m to a willing herbivore. Familiar animals become more comfortable around you.</p>` : '<p>Approach an animal and open these notes to observe its behavior. A patient explorer can offer plant fiber to willing herbivores.</p>'}</section>
      <div class="world-list site-list">${sites.map((site, index) => `<article class="world-entry"><span class="world-number">${String(index + 1).padStart(2, '0')}</span><div class="world-copy"><span class="eyebrow">${escapeHtml(site.biome.replace(/[-_]/g, ' '))}${site.visited ? ' / Visited' : ' / To discover'}</span><h3>${escapeHtml(site.name)}</h3><p>${escapeHtml(site.description)}</p></div><button class="journal-button" data-site="${escapeHtml(site.id)}" aria-label="${this.gameMode === 'creative' ? 'Visit' : 'Set course'} ${escapeHtml(site.name)}">${this.gameMode === 'creative' ? 'Visit' : 'Set course'}</button></article>`).join('')}</div>
      <p class="journal-footnote">${this.gameMode === 'creative' ? 'Visit takes you to the selected region. Your observations and discoveries are saved in this Creative expedition.' : 'Set course marks your next destination. Walk or use your skiff to reach it; every region can be explored without leaving this world.'}</p>`;
  }

  private renderMenu(): void {
    if (!this.menuOpen) return;
    let content: string;
    if (this.activeMenuTab === 'notes') {
      const objective = this.objective;
      content = `<section class="journal-intro"><span class="eyebrow">A small world. A long way to wander.</span>
        <h2>Follow your curiosity.</h2><p>Pick a ridge, a grove, or a distant shore. Walk there. Gather what you find and make something that helps you go farther.</p></section>
        ${objective ? `<section class="field-note"><span class="eyebrow">${escapeHtml(objective.stageLabel)}</span><h3>${escapeHtml(objective.title)}</h3><p>${escapeHtml(objective.description)}</p>
          <ul class="note-list">${objective.steps.map((step) => `<li class="${step.done ? 'done' : ''}"><span aria-hidden="true">${step.done ? '✓' : '○'}</span>${escapeHtml(step.label)}</li>`).join('')}</ul></section>` : ''}
        <div class="note-grid"><section><span class="chapter-number">01 / Shelter &amp; food</span><h3>Make a small camp</h3><p>Gather <b>3 Wood + 2 Stone</b>. Open <b>Satchel &gt; Camp</b>, select Campfire, then place it with Q or the placement prompt. Selecting the plan alone does not build it.</p><p>Carry raw meat and wood, stand within <b>10m of your Campfire</b>, then choose Roast Meat in Satchel &gt; Make. C eats the carried meal.</p></section>
        <section><span class="chapter-number">02 / Across the landscape</span><h3>Find a place worth exploring</h3><p>Twelve wood makes the Sky-Hopper skiff for flying over coastlines and high ground. Each world has named destinations in Regions: crater rims, desert oases, glacial shelves, basalt refuges and fungal lagoons. Observe animals and offer plant fiber to approachable herbivores.</p><button class="text-button" data-tab="aurelia">Open local regions <span aria-hidden="true">↗</span></button></section>
        <section><span class="chapter-number">03 / Beyond this world</span><h3>Build the Starfarer</h3><p>The skiff stays in the atmosphere. Build a <b>Workbench (5 Wood + 2 Stone)</b> and <b>Furnace (6 Stone + 2 Wood)</b>. Mine stone for iron ore; smelt <b>2 ingots</b> at the Furnace.</p><p>At the Workbench, craft Starfarer with <b>8 Wood + 4 Stone + 2 Iron Ingots</b>. Board with E and climb beyond the atmosphere. All starting materials are available on Aurelia.</p><button class="text-button" data-action="open-satchel">Open satchel <span aria-hidden="true">↗</span></button></section>
        <section><span class="chapter-number">04 / Your expedition</span><h3>${this.gameMode === 'creative' ? 'Creative freedom' : 'Survival journey'}</h3><p>${this.gameMode === 'creative' ? 'Every vehicle and tool is supplied. Crafting and camp building are free; destination buttons take you there. Supplies replenish automatically.' : 'Gather supplies, eat and build real stations. World and region buttons chart a destination; travel there on foot or in your craft.'}</p><p>Choose Survival or Creative and customize your explorer in the Explorer tab. Each mode keeps a separate save.</p><button class="text-button" data-tab="explorer">Open explorer kit <span aria-hidden="true">↗</span></button></section></div>`;
    } else if (this.activeMenuTab === 'aurelia') {
      content = this.ecologyMarkup();
    } else if (this.activeMenuTab === 'explorer') {
      content = this.explorerMarkup();
    } else if (this.activeMenuTab === 'planets') {
      content = `<section class="journal-intro"><span class="eyebrow">The world atlas / ${this.gameMode}</span><h2>A sky full of destinations.</h2><p>${this.gameMode === 'creative' ? 'Choose Visit to travel freely. Every vehicle and suit upgrade is already supplied.' : 'Set a course, then fly there in your Starfarer. The Sky-Hopper skiff cannot leave the atmosphere; the Field notes explain the complete crafting path.'}</p></section>
        <div id="planet-bar" class="world-list">${this.planets.map((planet, index) => `<article class="world-entry${planet.isActive ? ' current' : ''}">
          <span class="world-number">${String(index + 1).padStart(2, '0')}</span><div class="world-copy"><span class="eyebrow">${escapeHtml(planet.archetype)}</span><h3>${escapeHtml(planet.name)}</h3><p>${escapeHtml(planet.subtitle)}</p><span class="world-condition">${escapeHtml(planet.hazard === 'none' ? 'Temperate conditions' : planet.hazard.replaceAll('_', ' '))}${planet.isActive ? ' · You are here' : ` · ${(planet.distanceMeters / 1000).toFixed(1)} km away`}</span></div>
          <button class="journal-button" data-planet="${escapeHtml(planet.id)}" ${planet.isActive ? 'disabled aria-current="location"' : ''}>${planet.isActive ? 'Here' : this.gameMode === 'creative' ? 'Visit' : 'Set course'}<span class="shortcut">${index + 1}</span></button></article>`).join('')}</div>
        <p class="journal-footnote">${escapeHtml(this.planetStatus)}</p>`;
    } else {
      content = `<section class="journal-intro"><span class="eyebrow">A few useful bearings</span><h2>Find your footing.</h2><p>Use a mouse and keyboard, touch controls, or a standard gamepad.</p></section>
        <div class="controls-grid"><section><h3>Walking &amp; looking</h3><dl><dt>W A S D</dt><dd>Walk</dd><dt>Mouse / drag</dt><dd>Look around</dd><dt>Wheel</dt><dd>Move between eye level and orbit</dd><dt>Space / Shift</dt><dd>Jump / sprint</dd></dl></section>
        <section><h3>Gathering &amp; making</h3><dl><dt>Click</dt><dd>Chop a tree or hunt</dd><dt>V</dt><dd>Mine ground or rock</dd><dt>B</dt><dd>Open satchel &amp; recipes</dd><dt>C</dt><dd>Eat carried food</dd><dt>G</dt><dd>Plant an ecosystem seed</dd></dl></section>
        <section><h3>Camp &amp; travel</h3><dl><dt>Z / X</dt><dd>Choose a camp plan</dd><dt>Q / R</dt><dd>Place / rotate a structure</dd><dt>E</dt><dd>Board or stow your craft</dd><dt>1–6</dt><dd>${this.gameMode === 'creative' ? 'Visit another world' : 'Set a course to another world'}</dd><dt>M / Esc</dt><dd>Field guide / close panel</dd></dl></section>
        <section><h3>Touch &amp; gamepad</h3><p>Touch: left thumb moves; drag to look; pinch to zoom. Tap a tree to chop. Use the on-screen jump, satchel, and flight buttons.</p><p>Gamepad: left stick moves, right stick looks, A jumps, X/RT harvests, Y opens the satchel, Start boards. Hold LB with right stick to zoom.</p></section></div>
        <p class="journal-footnote">N toggles sound. F3 opens technical details.${this.gameMode === 'creative' ? ' F toggles free flight.' : ' Free flight is available in Creative mode.'} Observe and Feed are available in Regions when an animal is nearby.</p>
        <p class="sr-only">${escapeHtml(this.controlCopy)}</p>`;
    }
    const html = `<div class="journal-card guide-card"><header class="journal-header"><div><span class="eyebrow">Goldberg Planet / Expedition journal</span><h1 id="guide-title">Field guide</h1></div><button class="close-button" data-action="close-menu" aria-label="Close field guide">Back to the world <span aria-hidden="true">×</span></button></header>
      <nav class="journal-tabs" aria-label="Field guide sections">${([['notes', 'Field notes'], ['aurelia', 'Regions'], ['planets', 'Worlds'], ['explorer', 'Explorer'], ['controls', 'Controls']] as const).map(([id, label]) => `<button data-tab="${id}" aria-pressed="${this.activeMenuTab === id}" class="${this.activeMenuTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav>
      <div class="journal-body">${content}</div><footer class="journal-footer"><span>GOLDBERG / A WORLD UNDER YOUR FEET</span><span>Keep wandering.</span></footer></div>`;
    if (html !== this.menuCache) { this.replaceMarkup(this.gameMenu, html); this.menuCache = html; }
  }

  setVitalsStatus(value: VitalsCardInput): void {
    const health = Math.round(Math.max(0, Math.min(100, value.healthPct)));
    const hunger = Math.round(Math.max(0, Math.min(100, value.hungerPct)));
    const shield = Math.round(Math.max(0, Math.min(100, value.shieldPct)));
    const html = `<div class="world-heading"><span class="eyebrow">GOLDBERG / ${this.gameMode === 'creative' ? 'CREATIVE' : 'SURVIVAL'} EXPEDITION</span><h1>${escapeHtml(value.planetName)}</h1><span class="location-rule"><i></i> ${escapeHtml(this.ecology.region || 'A world under your feet')}${value.coopCount ? ` · ${value.coopCount} explorers` : ''}</span></div>
      <div id="vital-values" aria-label="Explorer condition">${[['Health', health, 'health'], ['Hunger', hunger, 'hunger'], ['Shield', shield, 'shield']].map(([label, amount, key]) => `<div class="vital${Number(amount) < 30 ? ' low' : ''}" title="${label}: ${amount}%"><span>${label}<b>${amount}</b></span><div class="vital-track" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${amount}"><i class="${key}" style="width:${amount}%"></i></div></div>`).join('')}${value.inSafeAura ? '<span class="condition-note">At camp</span>' : ''}</div>`;
    if (html !== this.vitalsCache) { this.vitals.innerHTML = html; this.vitalsCache = html; }
  }

  setVitals(text: string): void { if (text !== this.vitalsCache) { this.vitals.textContent = text; this.vitalsCache = text; } }

  setObjective(objective: ObjectiveView): void {
    this.objective = objective;
    const html = `<span class="eyebrow">Field note</span><span class="quiet-objective">${escapeHtml(objective.title)} <span aria-hidden="true">↗</span></span>`;
    if (this.objectiveCard && html !== this.objectiveCache) { this.objectiveCard.innerHTML = html; this.objectiveCache = html; }
    if (this.menuOpen && this.activeMenuTab === 'notes') this.renderMenu();
  }

  setPlanetBar(planets: PlanetNavTarget[], statusText: string): void {
    this.planets = planets;
    this.planetStatus = statusText;
    if (this.menuOpen && this.activeMenuTab === 'planets') this.renderMenu();
  }

  setBuildStrip(text: string, visible = true): void {
    const strip = document.getElementById('build-strip');
    if (strip && strip.textContent !== text) strip.textContent = text;
    strip?.classList.toggle('show', visible);
  }

  setDiag(lines: string[] | null): void {
    this.diag.style.display = lines ? 'block' : 'none';
    if (lines) this.diag.textContent = lines.join('\n');
  }

  setFlight(text: string | null): void {
    this.flight.style.display = text ? 'block' : 'none';
    if (text && this.flight.textContent !== text) this.flight.textContent = text;
  }

  setInventory(slots: InventorySlotView[]): void {
    this.slots = slots;
    const visible = slots.filter((slot) => slot.count > 0).slice(0, 3);
    const html = `<button class="pack-summary" aria-label="Open satchel"><span class="eyebrow">In your satchel</span><span class="pack-items">${visible.length ? visible.map((slot) => `<span>${escapeHtml(slot.name)} <b>${slot.count}</b></span>`).join('') : '<span>A little room for discoveries</span>'}${slots.filter((slot) => slot.count > 0).length > 3 ? '<span>+ more</span>' : ''}<span aria-hidden="true">↗</span></span></button>`;
    if (html !== this.inventoryCache) { this.inventory.innerHTML = html; this.inventoryCache = html; }
    if (this.craftingOpen && this.activeCraftTab === 'pack') this.renderCrafting();
  }

  setCrafting(recipes: CraftingRecipeView[], open: boolean, structures: StructureBlueprintView[] = []): void {
    this.recipes = recipes; this.structures = structures;
    const changed = open !== this.craftingOpen;
    if (open && changed) { this.setMenuOpen(false); this.rememberFocus(); }
    this.craftingOpen = open;
    document.body.classList.toggle('crafting-open', open);
    this.craftButton.classList.toggle('active', open);
    this.craftButton.setAttribute('aria-expanded', String(open));
    document.querySelector('[data-action="satchel"]')?.setAttribute('aria-expanded', String(open));
    this.crafting.classList.toggle('hide', !open);
    if (open) {
      this.renderCrafting();
      if (changed) this.crafting.querySelector<HTMLButtonElement>('[data-action="close-craft"]')?.focus();
    } else if (changed) this.restoreFocus();
  }

  private renderCrafting(): void {
    if (!this.craftingOpen) return;
    let content: string;
    if (this.activeCraftTab === 'pack') {
      const carried = this.slots.filter((slot) => slot.count > 0);
      content = `<section class="journal-intro"><span class="eyebrow">Collected along the way</span><h2>What you carry.</h2><p>Supplies for the next stretch of your journey.</p></section><div class="pack-grid">${carried.length ? carried.map((slot) => `<div class="pack-item"><div class="slot-icon" aria-hidden="true">${itemSvgIcon(slot.name, slot.css)}</div><span>${escapeHtml(slot.name)}</span><b>${slot.count}</b></div>`).join('') : '<p class="empty-note">Your satchel is empty. Start with a nearby tree; fallen logs are picked up as you walk past.</p>'}</div>`;
    } else if (this.activeCraftTab === 'make') {
      content = `<section class="journal-intro"><span class="eyebrow">Tools for the journey</span><h2>Make your way.</h2><p>${this.gameMode === 'creative' ? 'Creative supplies are provided. Craft freely without ingredients or stations.' : 'A few gathered materials can take you farther. Station recipes need a matching structure within 10m on this world.'}</p></section><div class="recipe-list">${this.recipes.map((recipe) => `<article class="recipe-row${recipe.canCraft ? ' ready' : ''}"><div class="recipe-copy"><h3>${escapeHtml(recipe.name)}</h3><p>${escapeHtml(recipe.description)}</p><div class="craft-req">${recipe.requirements.map((requirement) => `<span class="${requirement.have >= requirement.need ? 'ok' : 'miss'}">${escapeHtml(requirement.name)} <b>${requirement.have}/${requirement.need}</b></span>`).join('')}</div></div><button class="journal-button" data-recipe="${escapeHtml(recipe.id)}" aria-label="Make ${escapeHtml(recipe.name)}" ${recipe.canCraft ? '' : 'disabled'}>Make</button></article>`).join('')}</div>`;
    } else {
      content = `<section class="journal-intro"><span class="eyebrow">A place to return to</span><h2>Set down roots.</h2><p>Choose a plan, then find a spot in the world. Z/X changes the plan, R rotates it, and Q or the placement prompt builds it.${this.gameMode === 'creative' ? ' All structures are free in Creative.' : ' A selected plan only becomes a working station after you place it.'}</p></section><div class="recipe-list">${this.structures.map((structure) => `<article class="recipe-row${structure.canBuild ? ' ready' : ''}"><div class="recipe-copy"><h3>${escapeHtml(structure.name)}${structure.selected ? '<span class="selected-tag">Selected</span>' : ''}</h3><p>${escapeHtml(structure.description)}</p><div class="craft-req">${this.gameMode === 'creative' ? '<span class="ok">Free in Creative</span>' : structure.requirements.map((requirement) => `<span class="${requirement.have >= requirement.need ? 'ok' : 'miss'}">${escapeHtml(requirement.name)} <b>${requirement.have}/${requirement.need}</b></span>`).join('')}</div></div><button class="journal-button" data-structure="${structure.kind}" aria-label="Select ${escapeHtml(structure.name)} plan" ${structure.canBuild || this.gameMode === 'creative' ? '' : 'disabled'}>Select plan</button></article>`).join('')}</div>`;
    }
    const html = `<div class="journal-card satchel-card"><header class="journal-header"><div><span class="eyebrow">The things you bring</span><h1 id="satchel-title">Your satchel</h1></div><button class="close-button" data-action="close-craft" aria-label="Close satchel">Close <span aria-hidden="true">×</span></button></header>
      <nav class="journal-tabs" aria-label="Satchel sections">${([['pack', 'Pack'], ['make', 'Make'], ['camp', 'Camp']] as const).map(([id, label]) => `<button data-craft-tab="${id}" aria-pressed="${this.activeCraftTab === id}" class="${this.activeCraftTab === id ? 'active' : ''}">${label}</button>`).join('')}</nav><div class="journal-body">${content}</div><footer class="journal-footer"><span>TAKE ONLY WHAT YOU NEED</span><span>${escapeHtml(this.craftKey)} / Esc to close</span></footer></div>`;
    if (html !== this.craftingCache) { this.replaceMarkup(this.crafting, html); this.craftingCache = html; }
  }

  setTravelStatus(destination: string | null, progress: number): void {
    this.travel.hidden = destination === null;
    if (destination) this.travel.textContent = `Preparing passage to ${destination} · ${Math.round(progress * 100)}% · Esc to stay`;
  }

  flash(text: string, seconds = 4): void { this.msg.textContent = text; this.msg.classList.add('on'); this.msgTimer = seconds; }
  toggleHelp(): void { this.toggleMenu(); }
  setCraftKey(label: string): void { this.craftKey = label; }
  setHelpText(text: string): void {
    this.controlCopy = text;
    this.help.textContent = text.startsWith('Touch') || text.startsWith('Left stick') ? 'Drag to look · pinch to zoom' : text.startsWith('Gamepad') ? 'Left stick walk · right stick look' : 'WASD walk · drag to look · wheel zoom';
  }
  tick(dt: number): void {
    if (this.msgTimer > 0) { this.msgTimer -= dt; if (this.msgTimer <= 0) this.msg.classList.remove('on'); }
  }
}

export function splash(msg: string, frac: number): void {
  const bar = document.getElementById('splashbar');
  const label = document.getElementById('splashmsg');
  if (bar) bar.style.width = `${Math.round(frac * 100)}%`;
  if (label) label.textContent = msg;
}

export function hideSplash(): void { document.getElementById('splash')?.remove(); }
