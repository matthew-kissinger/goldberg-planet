# Goldberg Planet — Asset Opportunities (forward backlog)

From a 3-agent discovery pass (roadmap mining · biome enrichment · character/NPC design).
Complements `ASSET_INVENTORY.md` (which catalogs assets that already exist). This doc is
what to ADD. Everything here is a Kiln GLB candidate; use `paletteId: sphere-planet` +
`optimizedPalette:true`. **Valid Kiln roles: `ground|building|wonder|poi|prop|fill|vehicle`
(there is NO `character`/`actor` role — creatures use category `character` + role `prop`).**

## Three load-bearing findings
1. **The Kiln effort is doctrinally backed.** The design bible (`docs/hearth-and-horizon-cycle.md`)
   explicitly calls the current procedural meshes a *placeholder "runtime contract for the future
   authored player model and prop set"* and names a **Player Character Model Pass** + **Asset
   Readability Gate** as formal deliverables. Replacing procedural geometry with authored GLBs is
   the planned path, not a detour.
2. **The world is nearly empty of ambient scatter.** The ONLY passive decoration between the 12
   pentagons is a single parametric conifer on grass tiles. No flowers, grass tufts, boulders,
   bushes, driftwood, coral, cave dripstone, ice, ruins — nothing. This is the "empty world"
   problem and the highest-leverage fix (it multiplies across ~368k tiles). **Caveat:** trees are
   baked into the chunk vertex buffer, so any scatter is the moment to build an **InstancedMesh +
   LOD scatter layer** — the biggest engineering lift, but it unlocks all fill assets at once.
3. **The game is deliberately NPC-free / solitary.** Zero humanoids exist besides the player, by
   design. Humanoids should stay *rarer than the 12 pentagons* — 3-4 unique, fixed, non-respawning
   encounters, trading in murmurs & gifts, never storefronts. The companion beat is best served by
   a **follower creature**, not a person or a mount.

## Executable request queue

The next approved-asset needs are now staged as a pre-catalog Kiln request packet:
`tools/kiln/requests/hearth-horizon-next-packs.json`.

Current no-spend validation, 2026-07-07:

- `k3w-house-shell-shared-scale`: 9 shared-scale wall/roof/foundation GLBs, estimated 60c.
- `k9-aquatic-life`: 5 fish/driftjelly GLBs with swim clips, estimated 33c.
- `k1-pickup-and-drop-skins`: 9 pickup GLBs, estimated 60c.
- `k2-resource-and-ore-nodes`: 6 ore/material-node GLBs, estimated 40c.
- `k6r-native-life-expansion`: 6 creature GLBs with ecology/roaming clips, estimated 40c.
- `k7-wonder-and-cave-dressing`: 8 wonder/cave dressing GLBs, estimated 53c.
- `h0-avatar-and-equipment`: 9 player/equipment GLBs, estimated 60c.

Run `node scripts/validate-request-packs.mjs` from `tools/kiln` before spend. Run
`KILN_CONFIRM_SPEND=1 node scripts/generate-request-pack.mjs <pack-id>` only after the pack is
approved for generation. Keep generated candidates out of `assets-catalog.json` until they exist
and have passed review.

---

## Track A — Planned content (roadmap-backed; highest priority)
| Asset | Type | Kiln cat/role | Notes |
|---|---|---|---|
| **Authored player model** (Soft-Facet Wayfarer) | character | character/prop | The protagonist; everything renders around a placeholder. Rig integration = existing runtime work. |
| **Avatar equipable prop set** (pack frame, storm cloak, echo tools, repair roll, folded chart) | prop | prop/prop | Co-required with the player model; drives loop readability. |
| **House-kit** (door ✓, window ✓, roof ✓, + wall shell, hatch, fence) | architecture | architecture/building | Gameplay-load-bearing for the functional-home check. Door/window/roof already generated, but they are inserts/skins, not a wall system. Next pack needs shared-scale wall panels, wall openings, corners, rails, roof joins, and foundations tied to the code-owned hex socket contract. |
| **Boat / raft** | vehicle | vehicle/vehicle | Water-traversal peer to the plane in a swimmable ocean world (roadmap node F3). Needs a system. |
| **Glider** | vehicle | vehicle/vehicle | Early-game descent tool, distinct from the crafted plane (F3). Needs a system. |
| **Storm moths, thorn herd, migrating horizon beast** | creature | character/prop | Named-but-unbuilt creatures in the bible. |
| **Old-world / ceremonial relic props** | discoverable | poi/poi | Fills the mandated per-cycle "wonder" slot; pentagon-threshold payoff. |

## Track B — Biome enrichment (fixes "empty world"; mostly stateless fill = low integration risk)
Top 10 by (surface-area fixed ÷ effort). All static GLBs, role `fill` unless noted.
1. **Wildflower clumps** (grassland) — cheapest "alive" signal, blankets the most-walked biome.
2. **Grass tufts / long grass** (grassland) — kills the flat-color ground read everywhere.
3. **Field boulders** (grass/snow/underwater) — closes the #1 structural gap: *no ground-level rock props exist at all*.
4. **Coral clusters** (ocean floor) — fills the single largest empty volume; sea floor is currently barren.
5. **Fallen logs + stumps** (forest) — gives forests history; pairs with the chop loop.
6. **Leafy bushes / berry shrubs** (grass + forest) — supplies the missing mid-height layer.
7. **Cave stalactites/stalagmites** (caves) — turns bare voids into caves; README-flagged weakness.
8. **Driftwood + scattered shells** (beach) — makes any beach read as a beach.
9. **Snow-capped boulders** (snow/ridge) — breaks the flat grey/white alpine gradient.
10. **Ferns / undergrowth** (forest floor) — highest-repetition forest filler.
Runners-up: kelp forest, ice-crystal formations, cave glow-crystal clusters, cave mushrooms,
geodes (discoverable), bones/fossils (discoverable), standing-stone cairns, old campsites, sunken
wreck (underwater discoverable), domain-tinted scatter rings (per-pentagon approach dressing).

## Track C — Characters, NPCs & fauna (owner priority; keep sparse)
**Humanoid NPCs — cap at 3-4 on the whole planet:**
- **The Other Wayfarer** — a recolored twin who's also circling the planet; leaves route memories/gifts. Reuses the player rig recolored = near-zero new art. *The "not alone out here" beat.*
- **The Shrine-Keeper Hermit** — a tiny ancient keeper at *a few* pentagons; one murmur + a blessing. Can ship as a static seated GLB.
- **The Beached Aviator** — stranded flyer beside a plane wreck; hand in parts → they repair and fly off over the horizon. Reuses plane model + item hand-in.
- **The Lantern Recluse** *(stretch)* — coastal tower keeper; a night beacon visible across the curved horizon. Tower doubles as a POI structure.

**Creature expansion — fills real biome gaps (no flying, open-water, deep-cave, or friendly-cold life today):**
- **Skylift** (grassland balloon-bird) — first flying life.
- **Driftjelly** (open ocean) — sells the global-water pillar; visible from the plane.
- **Frostpuff** (snow) — a *friendly* cold-biome face; near-free mossPuff reskin.
- **Glowmoth** (deep cave) — safe-air marker; extends the lantern economy.
- **Glidewing** (forest canopy) — rewards looking up.
- **Domain-Warden** *(1-3 domains only)* — gives select pentagons a creature identity via the existing ward contract.

**Companion (recommended, cheap, high emotional payoff):**
- **Pocket-Puff** — a palm-sized moss-puff that adopts you and rides the existing `backSocket` / trots at your heel; sniffs out creatures & seed spots. Follower, not mount.

**Plus: authored replacements for the 9 existing procedural creatures** (same placeholder logic as the player model) — start with the readability-debt ones.

## Suggested next generation waves
- **Wave 2 (now running):** finish the 64-asset world set (structures, 12 shrines, 12 nodes, 9 creatures, cave mouths, trees, craters, drops).
- **Wave 3 — Enrichment fill:** Track B top 10 (flowers, grass, boulders, coral, logs/stumps, bushes, dripstone, driftwood/shells, snow boulders, ferns). Pairs with building the instanced scatter layer.
- **Wave 4 — Life:** companion Pocket-Puff + Frostpuff + Skylift + Driftjelly + Glowmoth; then the 3 core NPCs (Wayfarer, Hermit, Aviator).
- **Wave 5 — Hero authored:** player model + equipable prop set + boat/glider.
- **Wave 6 — Aquatic life and functional gaps:** fish-school-shore, fish-school-storm-run,
  fish-school-cave-shimmer, driftjelly, generic pickup skins for dirt/sand/snow/glow crystal/
  raw fish/kelp/reeds/compost/cave mushrooms, future ore/resource nodes after item taxonomy,
  and one shared-scale house-shell pack. GLBs are visual bodies or skins; fish-school rules,
  wall sockets, terrain materials, mining cracks, water, sky, route ribbons, telegraphs,
  glows, and particles stay procedural/material systems.
