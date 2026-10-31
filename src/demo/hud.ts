/**
 * Real Game UI, HUD, Live Objective Tracker & Interactive Survival/Planetary Codex (`Hud`).
 *
 *  - Top-left Status Card: Health bar (+regen badge), Hunger bar (Well-Fed badge), Suit Shield bar,
 *    Planet/FPS telemetry, and `☰ GUIDE [M]` button.
 *  - Top-center Solar System Planetary Nav Bar (`1..6` or click to warp/target).
 *  - Top-right Live Survival Objective & Explanatory Quest Tracker (`#objective-card`).
 *  - Bottom-center Action Dock (`#build-strip`) & SVG-Icon Inventory Hotbar (`#hotbar`).
 *  - Interactive Main Menu & 3-Tab Explanatory Codex Modal (`#game-menu`).
 */

import type { PlanetNavTarget } from '../world/solarSystem';
import type { StructureKind } from '../sim/persistence';

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
  onCraftSelect: ((id: string) => void) | null = null;
  onStructureSelect: ((kind: StructureKind) => void) | null = null;
  onPlanetSelect: ((planetId: string) => void) | null = null;
  onBuildStripClick: (() => void) | null = null;

  private vitals = document.getElementById('vitals')!;
  private planetBar = document.getElementById('planet-bar');
  private objectiveCard = document.getElementById('objective-card');
  private gameMenu = document.getElementById('game-menu');
  private diag = document.getElementById('diag')!;
  private msg = document.getElementById('msg')!;
  private flight = document.getElementById('flight')!;
  private buildStrip = document.getElementById('build-strip');
  private help = document.getElementById('help')!;
  private inventory = document.getElementById('hotbar')!;
  private crafting = document.getElementById('crafting')!;
  private craftButton = document.getElementById('btn-craft')!;
  private inventoryCache = '';
  private craftingCache = '';
  private vitalsCache = '';
  private planetBarCache = '';
  private objectiveCache = '';
  private buildStripCache = '';
  private helpCache = '';
  private craftKey = 'B';
  private msgTimer = 0;
  private menuOpen = false;
  private activeMenuTab: 'survival' | 'planets' | 'controls' = 'survival';

  constructor() {
    this.crafting.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const recipeBtn = (e.target as HTMLElement).closest('button[data-recipe]') as HTMLButtonElement | null;
      if (recipeBtn && !recipeBtn.disabled) {
        e.preventDefault();
        this.onCraftSelect?.(recipeBtn.dataset.recipe ?? '');
        return;
      }
      const structBtn = (e.target as HTMLElement).closest('button[data-structure]') as HTMLButtonElement | null;
      if (structBtn) {
        e.preventDefault();
        this.onStructureSelect?.((structBtn.dataset.structure ?? 'campfire') as StructureKind);
      }
    });

    this.vitals.addEventListener('pointerdown', (e) => {
      const btn = (e.target as HTMLElement).closest('button[data-action="toggle-menu"]');
      if (btn) {
        e.stopPropagation();
        e.preventDefault();
        this.toggleMenu();
      }
    });

    this.planetBar?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const pill = (e.target as HTMLElement).closest('button[data-planet]') as HTMLButtonElement | null;
      if (!pill) return;
      e.preventDefault();
      this.onPlanetSelect?.(pill.dataset.planet ?? '');
    });

    this.buildStrip?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.onBuildStripClick?.();
    });

    this.gameMenu?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target.closest('button[data-action="close-menu"]')) {
        e.preventDefault();
        this.setMenuOpen(false);
        return;
      }
      const tabBtn = target.closest('button[data-tab]') as HTMLButtonElement | null;
      if (tabBtn) {
        e.preventDefault();
        this.activeMenuTab = (tabBtn.dataset.tab as 'survival' | 'planets' | 'controls') ?? 'survival';
        this.renderMenu();
        return;
      }
      const warpBtn = target.closest('button[data-warp-planet]') as HTMLButtonElement | null;
      if (warpBtn) {
        e.preventDefault();
        this.setMenuOpen(false);
        this.onPlanetSelect?.(warpBtn.dataset.warpPlanet ?? '');
      }
    });
  }

  isMenuOpen(): boolean {
    return this.menuOpen;
  }

  toggleMenu(): void {
    this.setMenuOpen(!this.menuOpen);
  }

  setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    if (!this.gameMenu) return;
    this.gameMenu.classList.toggle('hide', !open);
    if (open) {
      document.exitPointerLock?.();
      this.renderMenu();
    }
  }

  private renderMenu(): void {
    if (!this.gameMenu) return;
    let bodyHtml = '';

    if (this.activeMenuTab === 'survival') {
      bodyHtml = `
        <div class="codex-box">
          <h3>🌲 1. Multi-Tree Groves &amp; Felling</h3>
          <p>Wooded hexes grow 1–3 procedural trees (Conifers, Palms, Weeping Willows, Giant Fungi, and Crystal Spires). Strike trees with <strong>LMB</strong> to chop them—the entire tree hinges and tips over around its stump before bursting into harvestable wood logs!</p>
          <span class="codex-tag">LMB Chop · Flint Hatchet 2.2x Speed</span>
        </div>
        <div class="codex-box">
          <h3>🦌 2. Procedural Fauna &amp; Hunting</h3>
          <p>Every planet synthesizes procedural wildlife across 4 guilds: <strong>Quadrupeds</strong>, <strong>Bipedals</strong>, <strong>Avian Sky-Gliders</strong>, and <strong>Aquatic Reef-Fish</strong>. Hunt creatures for <em>Raw Venison</em>, <em>Beast Hide</em>, and <em>Bone</em>, and fend off territorial predators!</p>
          <span class="codex-tag">LMB Hunt · Hunting Spear 2x Damage</span>
        </div>
        <div class="codex-box">
          <h3>🔥 3. Campfire Cooking &amp; Well-Fed Regen</h3>
          <p>Press <strong>Z / X</strong> to select a station and <strong>Q</strong> to build on a 7-slot hex plot. Roast raw meat at a <strong>Campfire</strong> (<strong>B</strong>) and press <strong>C</strong> to eat. Keeping <strong>Hunger ≥ 70% ("Well-Fed")</strong> or resting by a Campfire regenerates Health automatically!</p>
          <span class="codex-tag">C Eat Roasted Meat (+35% Hunger)</span>
        </div>
        <div class="codex-box">
          <h3>🚁 4. Sky-Hopper Skiff &amp; Starfarer Starship</h3>
          <p>Craft the <strong>Twin-Rotor Sky-Hopper Skiff</strong> at a Workbench to fly up to <strong>Floating Sky-Islands</strong> and waterfalls. Smelt Iron at a Stone Furnace to forge the <strong>Starfarer Starship</strong> and climb above 140m AGL into Interplanetary Space Cruise!</p>
          <span class="codex-tag">E Board / Stow Craft · 1–6 Warp Worlds</span>
        </div>
      `;
    } else if (this.activeMenuTab === 'planets') {
      const worlds = [
        { id: 'planet-0', num: 1, name: 'Aurelia', sub: 'Terran Cradle & Sky Archipelago', desc: 'Lush multi-tree groves, floating sky-islands (+55m AGL), gravity-driven rivers & waterfalls, and deep abyssal caverns.' },
        { id: 'planet-1', num: 2, name: 'Vespera Shard', sub: 'Shattered Crystal Moon', desc: 'Low-gravity airless moon with levitating crystal islands, Voronoi impact craters, and Quartz & Star-Shard spires.' },
        { id: 'planet-2', num: 3, name: 'Khoros Mesa', sub: 'Ringed Red-Rock Canyon World', desc: 'Stepped terracotta mesas under a Keplerian asteroid ring belt, canyon waterfalls, palm oases, and bipedal striders.' },
        { id: 'planet-3', num: 4, name: 'Nivara Spire', sub: 'Cryo-Glacial Spire World', desc: 'Razor-sharp glacial spires, pack-ice floes, crystalline Ice-Willows, and sub-surface cryo-brine sea caves.' },
        { id: 'planet-4', num: 5, name: 'Pyraxis', sub: 'Volcanic Caldera & Magma Rivers', desc: 'Hexagonal basalt columns, glowing magma rivers & lavafalls, and extreme thermal vents.' },
        { id: 'planet-5', num: 6, name: 'Mycelia Atoll', sub: 'Bioluminescent Fungal Archipelago', desc: 'Glowing cyan biolagoons, floating fungal spore-islands, terraced coral atolls, and neon reef-fish.' },
      ];
      bodyHtml = worlds.map((w) => `
        <div class="codex-box">
          <h3>[${w.num}] ${escapeHtml(w.name)}</h3>
          <p><strong style="color:#7dd3fc">${escapeHtml(w.sub)}</strong><br/>${escapeHtml(w.desc)}</p>
          <button data-warp-planet="${w.id}" class="menu-trigger-btn" style="margin-top:8px">🚀 Warp to ${escapeHtml(w.name)}</button>
        </div>
      `).join('');
    } else {
      bodyHtml = `
        <div class="codex-box">
          <h3>🏃 Movement &amp; Camera</h3>
          <p><strong>WASD</strong> Move / Steer Craft<br/><strong>Space</strong> Jump / Climb<br/><strong>Shift</strong> Sprint / Boost<br/><strong>Mouse Wheel</strong> Zoom 1st / 3rd Person Camera</p>
        </div>
        <div class="codex-box">
          <h3>⚒️ Harvesting &amp; Combat</h3>
          <p><strong>LMB (Click)</strong> Chop Trees &amp; Hunt Wildlife<br/><strong>V</strong> Mine Ground / Rock / Ore Cell<br/><strong>C</strong> Eat Roasted or Raw Meat<br/><strong>G</strong> Deploy Biosphere Seed Pod</p>
        </div>
        <div class="codex-box">
          <h3>🏕️ Hex Plot Building &amp; Crafting</h3>
          <p><strong>B</strong> Open Crafting &amp; Station Panel<br/><strong>Z / X</strong> Cycle Station Blueprint<br/><strong>Q</strong> Build Station on 7-Slot Hex Plot<br/><strong>R</strong> Rotate Station</p>
        </div>
        <div class="codex-box">
          <h3>🚀 Flight &amp; Interplanetary</h3>
          <p><strong>E</strong> Board / Stow Sky-Hopper or Starfarer<br/><strong>1 – 6</strong> Warp / Target Solar System Planets<br/><strong>M</strong> Toggle Main Menu &amp; Field Guide<br/><strong>F3</strong> Toggle Technical Diagnostics</p>
        </div>
      `;
    }

    this.gameMenu.innerHTML = `
      <div class="menu-card">
        <div class="menu-header">
          <div class="menu-brand">
            <h1>GOLDBERG PLANET — ASTRAL SURVIVAL</h1>
            <p>Procedural Hex-Sphere Worlds · Floating Sky-Islands · Gravity Hydrology · Infinite Fauna</p>
          </div>
          <div class="menu-actions">
            <button class="btn-resume" data-action="close-menu">▶ Resume Expedition</button>
          </div>
        </div>
        <div class="menu-tabs">
          <button class="menu-tab ${this.activeMenuTab === 'survival' ? 'active' : ''}" data-tab="survival">🏕️ Survival &amp; Progression Guide</button>
          <button class="menu-tab ${this.activeMenuTab === 'planets' ? 'active' : ''}" data-tab="planets">🪐 Planetary Atlas (6 Worlds)</button>
          <button class="menu-tab ${this.activeMenuTab === 'controls' ? 'active' : ''}" data-tab="controls">⌨️ Controls &amp; Keybindings</button>
        </div>
        <div class="menu-body">${bodyHtml}</div>
      </div>
    `;
  }

  /** Render the rich real-game status card with Health, Hunger, and Suit Shield bars. */
  setVitalsStatus(v: VitalsCardInput): void {
    const hpW = Math.max(0, Math.min(100, v.healthPct));
    const huW = Math.max(0, Math.min(100, v.hungerPct));
    const shW = Math.max(0, Math.min(100, v.shieldPct));

    const regenBadge = v.isRegenerating
      ? `<span class="bar-badge badge-regen">+REGEN</span>`
      : hpW < 45
        ? `<span class="bar-badge badge-warn">LOW HP</span>`
        : '';
    const fedBadge = huW >= 70
      ? `<span class="bar-badge badge-fed">WELL-FED</span>`
      : huW < 30
        ? `<span class="bar-badge badge-warn">HUNGRY</span>`
        : '';

    const html =
      `<div class="vitals-top">` +
        `<div class="vitals-world"><span>🪐 ${escapeHtml(v.planetName)}</span><span class="vitals-fps">${v.fps.toFixed(0)} FPS</span></div>` +
        `<button class="menu-trigger-btn" data-action="toggle-menu" title="Open Survival Guide &amp; Planetary Atlas (M)">☰ Guide [M]</button>` +
      `</div>` +
      `<div class="bar-row">` +
        `<div class="bar-label"><span>♥ Health ${hpW}%</span>${regenBadge}</div>` +
        `<div class="bar-track"><div class="bar-fill fill-hp" style="width:${hpW}%"></div></div>` +
      `</div>` +
      `<div class="bar-row">` +
        `<div class="bar-label"><span>🍖 Hunger ${huW}%</span>${fedBadge}</div>` +
        `<div class="bar-track"><div class="bar-fill fill-hunger" style="width:${huW}%"></div></div>` +
      `</div>` +
      `<div class="bar-row">` +
        `<div class="bar-label"><span>🛡 Suit Shield ${shW}%</span><span style="font-size:9.5px;color:#7dd3fc">${v.inSafeAura ? '🔥 Warm Camp Aura' : 'Active'}</span></div>` +
        `<div class="bar-track"><div class="bar-fill fill-shield" style="width:${shW}%"></div></div>` +
      `</div>`;

    if (html !== this.vitalsCache) {
      this.vitals.innerHTML = html;
      this.vitalsCache = html;
    }
  }

  /** Legacy string fallback for setVitals */
  setVitals(text: string): void {
    if (text !== this.vitalsCache) {
      this.vitals.textContent = text;
      this.vitalsCache = text;
    }
  }

  /** Update the top-right Live Survival Objective & Explanatory Guide card. */
  setObjective(obj: ObjectiveView): void {
    if (!this.objectiveCard) return;
    const stepsHtml = obj.steps.map((s) =>
      `<div class="obj-step${s.done ? ' done' : ''}"><span class="obj-dot"></span><span>${s.done ? '✓ ' : ''}${escapeHtml(s.label)}</span></div>`,
    ).join('');
    const html =
      `<div class="obj-header"><span>🧭 ${escapeHtml(obj.stageLabel)}</span><span>[B] Craft · [M] Guide</span></div>` +
      `<div class="obj-title">${escapeHtml(obj.title)}</div>` +
      `<div class="obj-desc">${escapeHtml(obj.description)}</div>` +
      `<div class="obj-steps">${stepsHtml}</div>`;
    if (html !== this.objectiveCache) {
      this.objectiveCard.innerHTML = html;
      this.objectiveCache = html;
    }
  }

  setPlanetBar(planets: PlanetNavTarget[], statusText: string): void {
    if (!this.planetBar) return;
    const pills = planets.map((p, idx) => {
      const distKm = (p.distanceMeters / 1000).toFixed(1);
      const label = p.isActive
        ? `[${idx + 1}] ★ ${escapeHtml(p.name)}`
        : `[${idx + 1}] ${escapeHtml(p.name)} (${distKm}km)`;
      return `<button class="planet-pill${p.isActive ? ' active' : ''}" data-planet="${escapeHtml(p.id)}" title="Warp to ${escapeHtml(p.name)} — ${escapeHtml(p.subtitle)}">${label}</button>`;
    }).join('');
    const html =
      `<div class="planet-pills">${pills}</div>` +
      `<div class="planet-status">${escapeHtml(statusText)}</div>`;
    if (html !== this.planetBarCache) {
      this.planetBar.innerHTML = html;
      this.planetBarCache = html;
    }
  }

  setBuildStrip(text: string): void {
    if (!this.buildStrip) return;
    if (text !== this.buildStripCache) {
      this.buildStrip.textContent = text;
      this.buildStripCache = text;
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
      `<div class="slot" title="${escapeHtml(s.name)}: ${s.goal ?? s.count}">` +
        `<div class="slot-icon">${itemSvgIcon(s.name, s.css)}</div>` +
        `<span class="key">${escapeHtml(s.name)}</span>` +
        `<span class="count">${s.goal ?? s.count}</span>` +
      `</div>`,
    ).join('');
    if (html !== this.inventoryCache) {
      this.inventory.innerHTML = html;
      this.inventoryCache = html;
    }
  }

  setCrafting(
    recipes: CraftingRecipeView[],
    open: boolean,
    structures: StructureBlueprintView[] = [],
  ): void {
    document.body.classList.toggle('crafting-open', open);
    this.craftButton.classList.toggle('active', open);
    this.crafting.classList.toggle('hide', !open);
    if (!open) return;

    const recipeRows = recipes.map((r) => {
      const req = r.requirements.map((m) =>
        `<span class="${m.have >= m.need ? 'ok' : 'miss'}">${escapeHtml(m.name)} ${m.have}/${m.need}</span>`).join('');
      return `<div class="craft-row${r.canCraft ? ' ready' : ''}">` +
        `<button data-recipe="${r.id}" aria-label="Craft ${escapeHtml(r.name)}" title="Craft ${escapeHtml(r.name)}" ${r.canCraft ? '' : 'disabled'}>+</button>` +
        `<div class="craft-copy"><div><strong>${escapeHtml(r.name)}</strong></div>` +
        `<p>${escapeHtml(r.description)}</p><div class="craft-req">${req}</div></div></div>`;
    });

    const structRows = structures.map((s) => {
      const req = s.requirements.map((m) =>
        `<span class="${m.have >= m.need ? 'ok' : 'miss'}">${escapeHtml(m.name)} ${m.have}/${m.need}</span>`).join('');
      return `<div class="craft-row${s.canBuild ? ' ready' : ''}">` +
        `<button data-structure="${s.kind}" aria-label="Build ${escapeHtml(s.name)}" title="Select & Build ${escapeHtml(s.name)} (Q in world)">${s.selected ? '★' : '⬡'}</button>` +
        `<div class="craft-copy"><div><strong>${escapeHtml(s.name)}</strong></div>` +
        `<p>${escapeHtml(s.description)}</p><div class="craft-req">${req}</div></div></div>`;
    });

    const html = [
      `<div class="craft-head"><span>⚒️ Survival Crafting &amp; Tech</span><span>${escapeHtml(this.craftKey)}</span></div>`,
      ...recipeRows,
      ...(structRows.length > 0
        ? [
            `<div class="craft-head" style="margin-top:6px"><span>🏕️ Hex Plot Camp Stations</span><span>Q build · Z/X</span></div>`,
            ...structRows,
          ]
        : []),
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
    this.toggleMenu();
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
