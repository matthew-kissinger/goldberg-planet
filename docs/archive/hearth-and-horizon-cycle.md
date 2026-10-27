# Hearth and Horizon Cycle

Hearth and Horizon is the long-form development goal for turning Goldberg Planet from a
beautiful spherical sandbox into a full crafting survival game.

Use this name in planning and future conversations when referring to the whole direction:
survive on a tiny continuous hex planet, build a real home, farm and fish, descend through
arches and caves, travel by plane and water, and uncover the twelve pentagon mysteries
without sanding away the planet's strangeness.

## Goal Statement

Goldberg Planet should become a small-planet survival builder where the player makes a
home on a living spherical world. The game should borrow the legibility of Minecraft,
the discovery pressure of Terraria, and the shelter/resource rhythm of survival games,
but it should not become a flat-world block clone. Its identity is local gravity,
hex/pent terrain, whole-planet sightlines, global water, flight, arches, caves, and the
feeling that every trip away from home can eventually curve back over the horizon.

## Current Substrate

The existing prototype already supports:

- Walk, swim, free-flight, plane flight, terrain-following altitude, and orbit zoom.
- Mining and building through sparse radial column edits.
- Arbitrary solid and empty runs in a tile column, which means tunnels, ceilings,
  overhangs, and player-made caves are already compatible with storage and meshing.
- Deterministic terrain, forests, tree chopping, material yields, and a craftable plane.
- A promoted Kiln asset pack with 82 ready GLBs that should become the default art
  backlog for trees, creatures, pickups, resource nodes, structures, landmarks, and props.
- Chunk streaming, floating origin rendering, water, sky, clouds, touch controls, and
  debugging hooks.

The main gap is not whether the world can hold survival systems. It can. The main gap is
that survival state and rules currently live in the demo layer, while natural world
generation is mostly a surface height field plus trees.

## Design Pillars

1. Home matters.
   Houses should be functional, not decorative piles of blocks. A good home gives sleep,
   storage, warmth, crafting, food prep, crop protection, weather safety, and a reason to
   return after expeditions.

2. The planet is the hook.
   Systems should use curvature, local up, circumnavigation, visibility from orbit, and
   the twelve pentagons. A feature that would work unchanged on a flat map needs a
   spherical reason to exist here.

3. Hexes are terrain, props are function.
   Large terrain edits stay hex-prism based: walls, terraces, tunnels, bridges, towers,
   cellars, harbors. Fine survival objects should be anchored props: doors, beds,
   chests, windows, roof pieces, workstations, fires, fences, nets, traps, and crop plots.
   Functional house structure is a special case: wall panels, openings, corners, rails,
   foundations, roof joins, collision, enclosure, and snap math should be procedural or
   code-authored first so pieces fit snugly. Kiln GLBs can skin or decorate those sockets,
   but they should not be the dimensional source of truth for player-built homes.

4. Caves and arches are world identity.
   Natural arches, sea caves, dry caves, cave lakes, skylight shafts, and under-mountain
   passages should become landmark content, not just side effects of mining.

5. Progression should reveal wonder, not only unlock numbers.
   Better tools and stations are useful, but the most memorable rewards should change how
   the planet is read: weather maps, fish migrations, cave resonance, pentagon routes,
   star alignment, distant smoke, strange lights below water.

6. The approved asset pack is the visual target.
   The promoted Kiln GLBs are user-approved art direction, not optional decoration. Most
   procedural meshes should become fallbacks, sockets, colliders, dynamic overlays, or proof
   scaffolding while the GLB pack takes over the visible world. The plane is the explicit
   exception for now: it already reads well and remains an intentional hero asset unless a
   future approved model beats it. Repeated assets must use palette/material reuse,
   instanced geometry or batching, and distance-gated animation so the broader pack does not
   balloon draw calls or mixer cost.

   New missing visual bodies should be generated through the repo's Kiln tools, not patched in
   with throwaway procedural art by default. Future wall-shell pieces, ore/resource nodes,
   native-life additions, cave/wonder dressing, and authored avatar props are staged in
   `tools/kiln/requests/hearth-horizon-next-packs.json` as API-valid request packs. They
   enter `tools/kiln/assets-catalog.json` only after generation, review, and proof.
   Aquatic bodies must be generated as singleton characters, not authored school scenes.
   The first school/cluster prompt attempt is rejected; the corrected fish bodies are now
   promoted and wired through `FishSchoolRenderer` as animated anchors plus point-school
   members. Future birds, flocking creatures, and new-biome tree variants should use the
   same one-asset-one-noun discipline. The first bird pack is now promoted and wired
   through `SkyLifeRenderer` as animated anchors plus point-flock members, and the first
   exact pickup/drop bodies are now promoted and wired through `ResourceDropRenderer`.

   Hex tile material variety stays code-owned. Add procedural swatches, shader/vertex-color
   variation, mining cracks, wetness, snow, and biome signals through the terrain material
   pipeline unless a specific prop or dressing object is needed.

## Reference Stance

Borrow from Minecraft:

- Simple gathering, crafting, block placement, shelter, tools, farms, and player-made
  goals.
- Clear recipes and readable materials.
- Low-friction terrain editing.

Do not copy from Minecraft:

- Infinite flat-world sprawl.
- Cubic-grid assumptions.
- Nether/End-style separated dimensions before the main planet is deep enough.

Borrow from Terraria:

- Layered underground progression.
- Caves as high-density discovery spaces.
- Tool tiers tied to deeper, stranger places.
- Biome-specific resources and events.

Do not copy from Terraria:

- 2D combat density.
- Boss-rush pacing as the main identity.

Borrow from broader survival games:

- Shelter pressure, food loops, crafting stations, weather risk, travel prep, and
  expedition planning.
- The feeling that a home base is both safety and a launch point.

## Development Cycle

Each cycle should leave the game playable. Do not build months of infrastructure without
one player-facing loop improving.

The player character is part of the Hearth and Horizon cycle itself. The cycle should design
the authored full-body player model, the equippable props, and the animation set as core game
systems, not as a late cosmetic pass. Any cycle that adds a survival verb, tool, prop,
vehicle, shelter action, or expedition system should also update the authored-player model
target, procedural fallback, equipped prop list, socket map, and animation contract so
gameplay does not harden around invisible actions. Each cycle should leave a clear answer
for what the player can visibly hold, wear, carry, perform, and emote. Treat the player
character, its equipped and stowed props, and its animation set as a formal cycle
deliverable, even while the game is still using procedural placeholder geometry. Name this
recurring work the Player Character Production Track: every Hearth and Horizon slice should
leave behind a small model/prop/animation packet that says what the avatar looks like in that
slice, what gear can be equipped or stowed, what prop variants are needed in hand, on the
body, or in the world, and which animation clips or procedural poses prove the new verb is
readable.
No Hearth and Horizon slice is complete until it leaves an avatar packet covering the player
model delta, equipable prop variants, held/stowed/world forms, socket assignments,
animation clips or procedural fallback poses, and debug or screenshot evidence for the new
survival action.
No slice that adds a player-facing verb is complete until it also declares the feedback
contract: UI toast/readback, animation or pose, VFX if relevant, and an audio cue or an
explicit silent-design reason. Ambience and interaction audio should serve readable survival
state, not random decoration.

Add a recurring **Cross-Device UX Track** to Hearth and Horizon. Every player-facing loop
should remain comfortable on desktop PC, laptop-height displays, tablets, phones, and
standard gamepads. Treat this as a systems deliverable, not a skin: each new verb should
declare its keyboard/mouse path, touch path, gamepad path, panel placement, HUD/readback
surface, and failure/close behavior. The runtime should classify the active device and input
mode, then adapt panel density, touch target sizes, shortcut labels, diagnostics, and hidden
overlay behavior without changing the underlying game rules. No future menu, station, route,
crafting, storage, journal, or building feature should ship until it has at least one small
desktop/laptop/touch/gamepad verification note proving the controls are reachable and the
important HUD surfaces do not collide.

Current UX audit frontier:

- **P0 touch route access, first slice closed**: phone/touch now has Route Slate, route-pin,
  and clear-route buttons that feed the same chart/pin/clear route commands as keyboard and
  gamepad. Keep the remaining tablet and landscape screenshots in R3 until the full matrix
  proves no overlap with vitals, route slate, journal, or hotbar.
- **P0 gamepad panel focus, first slice closed**: crafting and chest storage now render
  selected rows/actions, consume D-pad/A/B while focused, confirm craft/place/transfer, and
  block jump/use/hotbar/mine/build leakage behind the panel. Route Slate candidate rows now
  have their first keyboard, pointer/touch, and gamepad focus contract too.
- **P1 panel ownership, shared blocker closed**: Route Slate, crafting, journal, and
  storage now share a `PanelOwnershipSnapshot` with deterministic owner priority, a
  `worldInputBlocked` flag, and text/debug readback. Opening a panel gives that panel
  immediate same-frame ownership, clears held pointer/touch actions, and blocks movement,
  look, mine, build, use, eat, plane, autopilot, and hotbar leakage.
- **P1 pointer safety, first slice closed**: UI surfaces own their pointers; panel-owned
  pointer activity cancels mouse look and exits pointer lock, touch held movement/build/use
  state clears on pointer loss, blur, visibility changes, and panel ownership, and modal
  touch panels hide movement/action buttons while keeping explicit panel controls reachable.
- **P2 responsive proof**: the panel-ownership proof now covers desktop, 1366x720 laptop,
  tablet portrait, phone portrait, and synthetic gamepad. Remaining P2 work is landscape
  tablet/phone proof, deeper bbox overlap assertions, and the full all-verbs device matrix.

Current input-accessibility slice proof:

- Subagents ran in parallel for touch route UX, gamepad panel focus, and documentation/test
  gaps; their findings were merged into this slice before verification.
- Touch proof: `output/playwright/input-accessibility/phone-touch-route-controls.png` and
  `proof.json` exercise `?touch=1` Route Slate open, route pin, and route clear through the
  new touch buttons.
- Gamepad proof: `desktop-gamepad-crafting-focus.png` shows focused crafting with
  A-confirm crafting, and `desktop-gamepad-storage-focus.png` shows focused chest storage
  with A-confirm transfer.
- Panel-ownership proof: `scripts/proof-panel-ownership.mjs`, `npm run
  proof:panel-ownership`, and `output/playwright/panel-ownership/proof.json` assert one
  visible owner among Route Slate/crafting/journal/storage, `panels.activePanel`,
  `worldInputBlocked: true`, blocked player movement while panels are open, no page/console
  errors, and screenshot pixel probes for PC, laptop, tablet touch, phone touch, and
  synthetic gamepad.
- Gates passed for the current panel-owner slice: `npm test -- ux`, `npm run typecheck`,
  `npm run proof:panel-ownership`, full `npm test` at 252 tests, `npm run build`,
  `git diff --check` with only the known LF-to-CRLF checkout warnings, and a generic
  develop-web-game nonblank smoke screenshot at `output/web-game/shot-0.png`.

Add a recurring **Orchestrated Development Track** to Hearth and Horizon. Large slices
should be planned as a directed acyclic graph instead of a single linear checklist: define
the gameplay outcome, list the dependency nodes, mark which nodes can run in parallel, and
identify the proof artifacts that unblock downstream work. Codex should act as the
orchestrator when the scope is broad: assign subagents to independent lanes such as
simulation rules, rendering/assets, UX/input, tests, docs, performance, and art-direction
review; merge only after the dependency edge is satisfied; and keep a reviewer lane that
checks whether the merged result actually serves the cycle goal. Each substantial slice
should leave a small DAG note in docs or progress covering:

- **Nodes**: implementation tasks small enough to verify independently.
- **Edges**: dependencies that must finish before another node starts.
- **Parallel lanes**: work that can be safely delegated to subagents at the same time.
- **Reviewer path**: who reviews playability, tests, screenshots, performance, and art
  readability before acceptance.
- **Proof bundle**: tests, browser screenshots, `render_game_to_text` evidence, docs, and
  any rejected or revised assets.

Use parallelism aggressively where it reduces cycle time without hiding ownership. Good
parallel lanes include sim tests beside renderer polish, docs beside browser proof, UX
review beside save/load tests, and art-readability critique beside implementation. Do not
parallelize dependent edits that touch the same fragile runtime path without a clear merge
order. The orchestrator is responsible for resolving contradictions, pruning weak work, and
recording what remains human-owned.

Active DAG rule: every substantial continuation of Hearth and Horizon should start by
recording the active dependency graph before implementation. The current graph should name
the goal outcome, the local critical-path task, the subagent lanes already running or
available, the merge order, and the reviewer gates that decide whether the slice actually
moves the full-game loop forward. If a slice begins without this note, treat that as a
process bug and add the DAG before widening the implementation.

Current Hearth and Horizon DAG board:

Post-rejection closeout, 2026-07-08: C6 should be treated as topology/prototype scaffolding,
not an accepted player-facing house direction. The current implementation proved useful
facts about real hex-edge sockets, same-tile socket occupancy, traversal blockers, shelter
coverage, connected outer perimeters, interior seam exclusion, degree-5 pentagon safety,
and irregular live footprints. It did not prove a properly built house. The isolated
`wall-shells-footprint-review` attempt confirmed that the freestanding wall-panel grammar
reads as scattered construction pieces, not a home. Do not keep polishing that screenshot,
do not generate or wire decorative Kiln house skins over this shape, and do not
use `npm run proof:c6-wall-shells` as house-art acceptance. The next C6 pass starts from
[c6-house-redesign-brief.md](c6-house-redesign-brief.md): floors define rooms first,
walls become continuous runs, corners/openings derive from adjacency, roofs solve as a
coherent cap, and the first proof shows one small, boring, well-built home.

Closeout task ledger, 2026-07-08: [hearth-and-horizon-remaining-tasks.md](hearth-and-horizon-remaining-tasks.md)
tracks **91 post-rejection atomic tasks** left for the full Hearth and Horizon goal. Treat
that ledger as the current completion counter unless a future audited slice closes or adds
tasks with evidence.

Night closeout insight, 2026-07-08: do not widen the runtime again before the next
continuation names its node. Two parallel read-only lanes found that K9 already had real sim
depth, committed singleton fish GLBs, live route-state proof, near-only analytic school
motion, and renderer diagnostics, but most of that was hidden in F3/proof JSON until after
the player pressed `R`. That insight became the **K9.2 fishing cues and readback** slice:
surface compact pre-cast/setup copy from the existing `currentFishSchool()` result without
changing catch math, fish visuals, or route rules, expose it through the normal HUD,
`__world`, and `render_game_to_text`, and prove it with a focused interaction gate.

K9.2 implementation update, 2026-07-08: the first fishing cue/readback slice is now in.
`currentFishSchool()` remains the fishing authority, while a pure cue formatter turns the
current school into compact player copy for HUD vitals, F3, `__world.fishingCue()`, and
`render_game_to_text().inventory.food.fishingCue`. Near-water no-rod and no-catch fishing
actions now stay on the fishing message instead of being overwritten by forage, dry-land
no-water can still fall through to forage, and already-tended harmless native life no longer
consumes the generic fallback use before fishing. `npm run proof:k9-fishing-cues` proves a
live shore cue, synthetic gamepad use input through the normal `useStructure -> tryFish`
path, fish-catch toast, inventory/`lastAction` deltas, no-rod setup denial, committed
`fish-shore-minnow.glb` provenance, zero generated-path requests, screenshots, and text
readback. Remaining K9 work is richer trap/net/cast verbs and beauty-grade fishing framing.

Critical path:
`A0 -> A2 -> A4 -> B0 -> B1 -> B2 -> B3 -> H0 -> C0 -> C1 -> C2 -> C4 -> C5 -> D2 -> E4 -> F1 -> G3 -> I2 -> J1 -> J4`.

| Lane | Atomic Tasks | Depends On | Current State |
| --- | --- | --- | --- |
| A Orchestration/docs | A0 repo-state decision; A1 docs truth; A2 living DAG; A3 subagent briefs; A4 reviewer gates | none | A0-A4 active; must be refreshed at the start of each substantial continuation |
| B Sim/save architecture | B0 main responsibility map; B1 extract interaction services; B2 save compatibility; B3 progression contracts; B4 economy/anti-exploit balance | A2 | B3 now has a browser-level hearth contract for site readiness, completion, threshold terrain, journal/slate readback, and rest rewards; B1 now has a first build-command facade for select, rotate, place, use, and pack result contracts before larger systems widen |
| C Building/houses | C0 build-mode UX contract; C1 placement/rotation/dismantle polish; C2 shelter/room validation; C3 readable house-kit assets; C4 utility integrations; C5 functional-home playtest; C6 wall/shell socket contract | B1, H0 | C5 is proven for the first hearth loop; C1 has placement rotation/pack proof; C2 has a single-room enclosure and comfort-readability contract around the claimed bedroll; C2/C3 has relocation, code-owned house-kit sockets, socket-specific snap-preview silhouettes, and the first normalized Kiln door/window/roof skins as decorative art only. C6 proved valuable edge-socket, shelter, traversal, connected-perimeter, pentagon-safety, and irregular-footprint topology, but the visible freestanding wall-shell grammar is rejected. Next C6 work is a replacement procedural house grammar from `docs/c6-house-redesign-brief.md`; shared-scale Kiln house skins wait until that replacement grammar proves one small, well-built home |
| D Terrain/caves/water | D0 cave/water spec; D1 entrance readability; D2 larger arches/rooms; D3 cave resources/hazards; D4 spring/cave-lake rules | B2 | Cave mouths and cave pressure exist; D2 now has a first browser-proofed threshold-space slice for the First Hearth underpass and Deep Bell chamber; D3/D4 remain |
| E Food/farming/fishing | E0 crop/fish tuning; E1 crop variety; E2 traps/nets loop; E3 cooking/preservation effects; E4 ecology-to-route balance; E5 fish singleton bodies/instanced schools/boids | B2, C4, D4 | E4 now has capped route-adjacent staging, arrival-spent waterline sources, and an organic place/set/wait/haul proof path; E5 has runtime visual/provenance, live-route, first near-only swim-path, and first player-facing cue/readback slices: corrected singleton fish GLBs are promoted, fish schools select shore/storm/cave/reed/tide bodies, near visuals use two animated anchors, point sprites, analytic near-boid flow, and waterline swim-path beads while far groups freeze richer motion, HUD/readback now previews casts/setup through `currentFishingCue()`, `npm run proof:k9-fish-visuals` proves all five committed aquatic GLBs through existing `fishSchoolAt` contexts, `npm run proof:k9-live-fish-routes` proves all five through normal `currentFishSchool()` / `currentFishVisualSite()` state after route/weather/cave/domain setup, and `npm run proof:k9-fishing-cues` proves live cue, use input, toast, inventory, no-rod denial, text, screenshots, and provenance. Richer food variety, net ecology tuning, richer fishing verbs, and beauty-grade fishing framing remain |
| F Travel/wonder | F0 settle afterglow local work; F1 route/itinerary polish; F2 visible event consequences; F3 boat/glider/cave-shortcut logistics | B3, D2, E4 | F0 shipped; F1 selectable Route Slate candidates and active-stop later/drop itinerary controls are closed; arbitrary leg selection and deeper travel logistics remain later |
| G Native life/combat | G0 behavior state machine; G1 harmless depth; G2 hazard variety; G3 ward/stun/flee tool rules; G4 rewards/anti-farming; G5 sparse roaming actors | B3, D3, E4 | Several native families and ward loops exist; native-life targeting and occupied-tile placement ownership now have a proof gate; G5/K6R has sparse-roaming actors with home/current/target tiles, leash movement, current-tile picking, approved GLB skins, distance-gated mixers, current clip diagnostics, short-lived alert-source diagnostics, and a first renderer-level reaction pose layer for `curious`, `flee`, `telegraph`, `lunge`, and `recover`. Next G0/G5 work is the actual creature-brain design: saved/non-saved state-machine boundaries, social/herd behavior, flee/return timing, combat consequences, anti-farming cooldowns, and broader device playtest proof |
| H Avatar/art/assets | H0 authored Soft-Facet model brief; H1 prop/socket catalog; H2 animation coverage; H3 asset readability pass; H4 external asset ledger/probes; H5 approved Kiln pack adoption | A4 | Route-marker glyph dialect is closed for the first H3 slice; H4 validates the promoted Kiln pack, wires the manifest-driven waystone pilot, and conditionally accepts normalized door/window/roof house-kit skins with procedural fallback; H5 is now the goal-level art track for using the approved pack across world props, trees, creatures, pickups, resource nodes, landmarks, and structures with instanced palette/geometry and distance-gated animation; K1/K10 proves all 11 exact pickup/drop GLBs plus the `node-root-pod` seed alias as instanced ground-drop skins; K2 proves all 12 promoted node GLBs as instanced domain-resource bodies; K3 proves seven camp/home props as decorative GLB skins over code-owned state overlays; K4 proves seven utility/waterline props as decorative GLB skins over code-owned center/shore sockets; K5 proves the four promoted tree/shrub GLBs as resident-chunk instanced vegetation with base-stable placement, whole-instance matrix wind disabled until height-weighted bending exists, and chop/drop proof; K6 proves all nine promoted native-creature GLBs with authored `+Z` forward, required idle/walk clips, distance-gated mixers, tend/ward behavior proof, and desktop/phone screenshots; K6T proves native targetability and occupied-tile build blockers; K7 proves cave-anchor, three crater shells, and all 12 shrine landmark shells as fitted GLB skins while route, threshold, glow, and reward state remain code-owned; K9 promotes and wires five corrected singleton fish/driftjelly GLBs with distance-gated animation and point-school rendering; K11 promotes and wires four singleton bird GLBs with sky/shore/forest/storm site cues, distance-gated animation, and point-flock rendering; the Soft-Facet Wayfarer has a normal-distance renderer contract, named readability roles, action-pose proof, and desktop/laptop/tablet/phone/gamepad/WebGL screenshots |
| I UX/input | I0 device control matrix; I1 HUD/panel hierarchy; I2 touch/gamepad parity for all verbs; I3 settings/pause/help/accessibility | C0, B3 | Route choice parity and shared panel ownership are closed for their first slices; P2 responsive/device matrix and future building/combat verbs remain |
| J QA/release | J0 unit suites; J1 browser proof scripts; J2 screenshot/readability matrix; J3 perf/audio/bundle gates; J4 deploy/live/docs truth | all feature lanes | Unit/build proof is strong; route, panel, audio, asset, and hearth-contract proof scripts now cover current risky slices |

Active run ledger, 2026-07-07 through 2026-07-08:

| DAG Node | Owner | Status | Proof Gate |
| --- | --- | --- | --- |
| A2 living DAG | Main orchestrator | Done for this slice | Docs show node status, owner, dependencies, proof gate, and next critical path before code edits widen |
| A3 subagent briefs | Main orchestrator plus explorer lanes | Done for this slice | Three independent lanes audited panel leakage, proof matrix, and docs/test alignment before the commit |
| F1 route/itinerary polish | Main implementation lane | Done for selected-candidate plus active-stop edit slices | Player can choose a Route Slate candidate, then move the active saved stop later or drop it without clearing the whole itinerary |
| I2 touch/gamepad parity | Main implementation lane with reviewer audit | Done for route choice | Same route-candidate choice works by mouse/touch, keyboard, and gamepad without leaking panel input |
| J1 browser proof scripts | QA/release lane | Done for route choice and active-stop itinerary edits | `output/playwright/route-selection/proof.json` captures desktop pointer, gamepad, and phone touch proof; `output/playwright/f1-itinerary-controls/proof.json` captures desktop, laptop, tablet touch, phone touch, and gamepad later/drop proof |
| H3 route-marker glyph dialect | Main implementation lane with asset-reviewer audit | Done for this slice | Cave anchors and waystones expose distinct route-marker silhouettes, named readability roles, desktop/phone screenshots, and text readback stats |
| H0/H3 Soft-Facet Wayfarer readability | Main implementation lane with avatar renderer/proof explorers | Done for procedural fallback normal-distance slice | `test/characterRenderer.test.ts` plus `npm run proof:character` prove 46 named silhouette/readability parts, 3 prop sockets, 21 action poses, visible held/stowed props, seated plane pilot cues, and desktop/laptop/tablet/phone/gamepad/WebGL screenshots under `output/playwright/soft-facet-wayfarer-readability/proof.json` |
| I2/P1 panel ownership | Main implementation with UX/input reviewers | Done for shared-owner slice | `PanelOwnershipSnapshot`, blocked-input runtime gate, touch/pointer cancellation, `npm test -- ux`, and `npm run proof:panel-ownership` prove panel-owned world-input blocking |
| J3 music/audio gate | Main implementation with audio/runtime/proof reviewers | Done for soundtrack handoff | `npm run proof:audio-assets`, `npm run proof:audio-music`, base-path-safe URLs, and desktop/phone dev plus production-subpath browser proof validate streamed music |
| H4 Kiln asset intake | Main implementation with safety, art-readability, runtime-insertion, and proof reviewer lanes | Done for promoted-pack gate plus waystone and first house-kit family | `docs/kiln-asset-intake.md` plus `npm run proof:kiln-assets` validate 82 committed GLBs and 0 unused manifest records; `npm run proof:route-markers` proves the waystone skin loads from `models/`; `npm run proof:c2-c3-building-snap-grid` proves promoted `door-kit`, `window-frame`, and `roof-bundle` requests, measured runtime source bounds, fitted socket bounds, no raw `generated/` requests, and procedural fallback coverage |
| H5 approved Kiln pack adoption | Main orchestrator with asset-runtime, batching/perf, animation, UX, and proof lanes | Active goal-level priority; K1/K10 pickup/drop skins, K2 resource nodes, K3 home/camp props, K4 utility/waterline props, K5 trees, K6 native-creature skins, K6T native targetability, K6R roaming/reaction-readability, K7 cave-anchor/crater/shrine/cave-mouth shells, K9 fish visuals/live routes/near swim paths/cue readback, K11 sky life, and C6 functional serviced, six-edge single-room, connected outer-perimeter, topology-safe pentagon, and irregular depth-two wall-shell proof passing | `docs/kiln-pack-adoption-plan.md` makes the 82 ready GLBs the target visual backlog; every asset family must become runtime wired, runtime dressing, regenerated, or explicitly superseded; repeated families must use palette/material reuse, instanced or batched geometry, and distance-gated animation before broad rollout; `npm run proof:k10-resource-drops` proves source-aware pickup/drop skins and `npm run proof:k1-resource-drops` remains a compatibility alias; `npm run proof:k2-domain-resources` proves resource nodes; `npm run proof:k3-home-props` proves seven home/camp structure skins with state overlays preserved; `npm run proof:k4-utilities` proves seven utility/waterline skins with code-owned state overlays and shore blockers preserved; `npm run proof:k5-trees` proves trees/shrubs; `npm run proof:k6-creatures` proves creature skins and animation bands; `npm run proof:k7-native-targeting` proves native creature picks beat terrain mining and occupied native-life tiles block structure placement; `npm run proof:k6r-roaming` proves sparse roaming actors, state-aware reaction pose roles, visible telegraph readout, current GLB clips, and alert sources over approved creature skins; `npm run proof:route-markers` proves cave-anchor route-marker GLBs; `npm run proof:k7-wonders` proves all three crater shell GLBs plus all 12 shrine landmark GLBs with code-owned overlays preserved; `npm run proof:cave-mouth-dressing` proves all three committed cave-mouth GLBs as skins over carved cave signals; `npm run proof:k9-fish-visuals` proves all five promoted aquatic GLB anchors, point-school rendering, near-boid flow, swim-path beads, and focus screenshots through existing fish-school contexts; `npm run proof:k9-live-fish-routes` proves those five aquatic skins and near-path diagnostics through live shore/storm/sea-cave/salt-tide/reed-water fish-school state; `npm run proof:k9-fishing-cues` proves the first live cast/setup cue path; `npm run proof:k11-sky-life` proves all four promoted bird GLBs as sky-life anchors plus point flocks; `npm run proof:c6-wall-shells` proves the expanded edge-addressed code-owned wall-shell catalog, edge-based shelter coverage, live wall traversal collision, serviced functional home/rest, full six-edge single-room perimeter coverage, connected foundation-backed outer perimeters, topology-safe invalid-edge blocking on degree-5 tiles, and an irregular live six-tile footprint that future house GLBs must skin rather than replace |
| K9.2 fishing cues and readback | Main implementation with fishing-UX and proof reviewer lanes | Done for first cue/readback slice | `fishingCueForSchool` keeps catch math unchanged while `currentFishingCue()` surfaces compact cast/setup copy in HUD vitals, F3, `__world`, and `render_game_to_text`; near-water no-rod/no-catch messages stay on fishing, dry-land no-water can still fall through to forage, and already-tended harmless native life no longer blocks fallback fishing. `npm run proof:k9-fishing-cues` proves live shore cue, accepted synthetic gamepad use input through `useStructure -> tryFish`, fish-catch toast, inventory/`lastAction` deltas, no-rod setup denial, committed `fish-shore-minnow.glb` request, zero generated-path requests, screenshots, and text readback |
| B3/C5 hearth contract | Main implementation with frontier-review lane | Done for functional-home contract | `npm run proof:hearth-contract` seeds the real hearth site, proves missing requirements, builds the functional home, completes site work, opens 20 terrain cells across 5 underpass tiles, spends a root-cellar provision, grants trail focus, and captures PC/laptop/tablet/phone/gamepad-active screenshots |
| B1 build command boundary | Main implementation with command-boundary and proof reviewer lanes | Done for affected build verbs | `src/sim/buildCommands.ts`, `test/buildCommands.test.ts`, and `npm run proof:c1-build-placement` prove structured command results for select, selected-placement rotation, placed-prop rotation, placement, use, safe pack, blocked pack, command source tags, inventory deltas, and text diagnostics |
| C1 build placement contract | Main implementation with build-contract and interaction-ownership explorer lanes | Done for first rotation/pack proof | `test/structures.test.ts` plus `npm run proof:c1-build-placement` prove selected build-facing rotation, placed-prop rotation, safe pack-back inventory return, lit-prop pack refusal, placement diagnostics, and desktop/laptop/tablet/phone/gamepad screenshots under `output/playwright/c1-build-placement/proof.json` |
| C2 single-room shelter enclosure | Main implementation with enclosure-sim and renderer-proof reviewer lanes | Done for first derived room/comfort slice | `ShelterReport.enclosure`, `test/structures.test.ts`, `test/structureRenderer.test.ts`, and `npm run proof:c2-room-enclosure` prove room/boundary/support/roof/opening/utility tiles, spatial enclosure separate from warmth, weather-safe and service-ready tiers, comfort renderer signals, and snap-out/snap-back recovery without changing save shape |
| C2/C3 building relocation, snap-preview, snap-grid, and house-kit skin contract | Main implementation with sim-contract, renderer-readability, asset-fit, and proof/docs explorer lanes | Done for first inactive-prop relocation, player-facing move/drop controls, socket-specific door/window/roof snap-preview guides, code-owned sockets, and normalized door/window/roof Kiln skins | `src/sim/structures.ts`, `src/sim/buildCommands.ts`, `src/render/structures.ts`, `src/render/kilnAssets.ts`, `test/structures.test.ts`, `test/buildCommands.test.ts`, `test/structureRenderer.test.ts`, and `npm run proof:c2-c3-building-snap-grid` prove relocation command results, blocker reasons, id/state/yaw preservation, shelter drop/recovery when a roof moves out/back, code-owned door/window/roof socket dimensions, promoted model requests, measured/fitted house-kit bounds, valid/blocked preview diagnostics/screenshots, socket-specific guide mesh/role diagnostics, desktop/laptop door/window/roof placement-preview screenshots, and keyboard/touch/synthetic-gamepad relocation controls across desktop/laptop/tablet/phone profiles |
| C6 wall/shell socket contract | Building sim, renderer, and asset-fit lanes | Edge-socket, edge-shelter, traversal-collision, serviced-room, full six-edge single-room perimeter, connected outer-perimeter, topology-safe pentagon, and irregular depth-two footprint slices passing as topology/prototype evidence only | `floorFoundation`, `wallPanel`, `wallDoorPanel`, `wallWindowPanel`, `wallCorner`, `wallHalfRail`, and `roofJoin` are code-owned/craftable sockets with renderer silhouettes, shelter contribution rules, save/build coverage, floor/center/edge occupancy, same-hex floor-plus-edge stacking, duplicate-edge blockers, edge-based shelter coverage diagnostics, wall/window/corner traversal blockers, passable integrated door edges, live player movement collision proof, stale collision clearing after relocation, and browser proof. The visible freestanding wall-shell grammar is rejected as a house direction, so these facts are regression scaffolding for the replacement C6 grammar, not a green light for Kiln house skins |
| K6T native targetability | Main implementation with UX/proof reviewer lane | Done for first targetability and placement ownership slice | `src/edit/pick.ts`, `src/main.ts`, `src/sim/buildCommands.ts`, `test/nativeLifePick.test.ts`, `test/buildCommands.test.ts`, and `npm run proof:k7-native-targeting` prove desktop and phone moss-puff tending, brambleback warding, creature rewards, native pick priority over terrain mining, and shell-skitter occupied-tile structure blockers |
| G5 native roaming actors | Creature sim, renderer, and animation/perf lanes | Done for first sparse-roaming plus reaction-readability slice | `npm run proof:k6r-roaming` proves deterministic home sites derive visible roaming actors with current/target tiles, walk/idle clip hints, actual current GLB clips, renderer interpolation, current-tile picking, approved GLB skins, reaction pose roles, visible hazard telegraph diagnostics, short-lived alert-source propagation, and no generated runtime requests; deeper creature brains, social behavior, flee/return timing, combat consequences, and anti-farming states remain open |
| D2 threshold spaces | Main implementation with terrain/cave explorer lane | Done for first authored-space proof | `npm run proof:d2-caves` proves the First Hearth underpass opens 20 terrain cells across 5 tiles, the Deep Bell chamber opens 24 cells across 4 tiles, high-clearance arches become routeable, threshold reads pay rewards, and desktop/phone screenshots stay nonblank with no page/console errors |
| E4 ecology-to-route balance | Main implementation with proof/docs reviewer lanes | Done for route-adjacent staging, arrival-spent sources, and organic gear proof | `npm run proof:e4-ecology-route` proves off-route ready gear is ignored, unready route gear leaves packed food missing, ready route-adjacent trap + net resupply flips the food check, route arrival consumes the eligible trap/net without awarding duplicate inventory, off-route gear stays ready, an organic copy places/sets/waits route and off-route trap/net gear through existing runtime hooks, hauls the route pair, then proves route arrival consumes only the route-adjacent pair while the off-route pair remains ready across desktop, laptop, tablet touch, phone touch, and synthetic gamepad |

Progress accounting rule: after each substantial slice, move exactly one current node to
`complete`, `blocked`, or `deferred` with the proof artifact that justifies the state. If
no DAG node moved, the slice did not advance Hearth and Horizon and should be treated as
process drift, even if code changed.

Living node ledger:

| Node | Outcome | State | Owner/Lane | Depends On | Exit Gate | Evidence | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A2 | Make the DAG board measurable | Done | Main orchestrator | A0 | R0 | Active run ledger, living node ledger, subagent ledger, and gate evidence ledger in this doc | Keep updated at the start and end of the next substantial continuation |
| A3 | Use subagents as parallel reviewer lanes | Done | Explorer lanes | A2 | R0 | Graph/progress audit accepted; next-node route audit accepted | Use worker lanes only for disjoint future code ownership |
| F1 | Route planning becomes an intentional player choice | Done for selectable candidates plus active-stop later/drop controls | Main implementation | B3, D2, E4 | R2, R3 | Route Slate rows select actual `RouteGuide` candidates; non-primary route candidates can be pinned; active saved stops can move later or be dropped through normalized route-plan helpers with Stranger Season stops locked | Broaden only if needed to arbitrary leg selection, full drag/reorder, and richer route-logistics decisions |
| I2 | Cross-device parity covers the affected verb | Done for route choice and active-stop edits | UX/input lane | C0, B3, F1 | R3 | Desktop pointer, keyboard, tablet/phone touch panel buttons, and injected gamepad route edit paths are wired | Continue all-verbs parity for future building/combat verbs |
| J1 | Browser proof tracks the actual player path | Done for route choice and active-stop edits | QA/release lane | F1, I2 | R5 | `output/playwright/route-selection/proof.json`; `output/playwright/f1-itinerary-controls/proof.json`; route and panel screenshots | Extend reusable proof harness for landscape device matrix and future all-verb coverage |
| H3 | Route markers read as route tools, not generic glowing props | Done for route-marker glyph dialect | Main implementation plus asset-readability lanes | A4, F1 | R4, R5 | `test/structureRenderer.test.ts`; `npm run proof:route-markers`; `output/playwright/route-marker-readability/proof.json` | Continue blind screenshot review and apply the same noun/verb gate to future accepted asset families |
| H0/H3 | Soft-Facet Wayfarer reads at normal play distance | Done for procedural fallback normal-distance slice | Main implementation plus avatar renderer/proof explorer lanes | A4, H3, G3 | R4, R5 | `src/render/character.ts`; `test/characterRenderer.test.ts`; `scripts/proof-character-readability.mjs`; `output/playwright/soft-facet-wayfarer-readability/proof.json` | Next avatar work is an authored model packet or two-hand/socket polish for maps, bow, fishing rod, and front-carry props, not a return to generic primitive limbs |
| H4 | External generated assets are auditable before runtime import | Done for promoted-pack gate plus waystone and first normalized house-kit family | Main implementation plus safety/art/UX/runtime/proof reviewer lanes | A4, H3 | R4, R5 | `docs/kiln-asset-intake.md`; `scripts/proof-kiln-asset-pack.mjs`; `src/render/kilnAssets.ts`; `output/kiln/kiln-asset-pack-proof.json`; `output/playwright/route-marker-readability/proof.json`; `output/playwright/c2-c3-building-snap-grid/proof.json` | Extend the same measured-bound fit, fallback, and screenshot proof only to the next accepted family; remaining modular pieces still need socket contracts before runtime import |
| H5 | The approved Kiln pack replaces janky procedural visuals across the world | Active; K1/K10 pickup/drop skins, K2/K3/K4/K5 repeated/static-family slices, K6 animated-creature skin slice, K6T targetability, K6R roaming/reaction-readability, K7 cave-anchor/crater/shrine slice, K9 fish visuals/live routes/near swim paths/cue readback, K11 sky life, and C6 topology/prototype wall-shell proof passing but visually rejected | Main orchestrator plus asset-runtime, batching/perf, animation, UX, and proof lanes | H4, A4 | R4, R5 | `docs/kiln-pack-adoption-plan.md`; `docs/hearth-and-horizon-remaining-tasks.md`; `docs/c6-house-redesign-brief.md`; `npm run proof:k10-resource-drops`; `npm run proof:k1-resource-drops`; `npm run proof:k2-domain-resources`; `npm run proof:k3-home-props`; `npm run proof:k4-utilities`; `npm run proof:k5-trees`; `npm run proof:k6-creatures`; `npm run proof:k7-native-targeting`; `npm run proof:k6r-roaming`; `npm run proof:k7-wonders`; `npm run proof:k9-fish-visuals`; `npm run proof:k9-live-fish-routes`; `npm run proof:k9-fishing-cues`; `npm run proof:k11-sky-life`; `npm run proof:c6-wall-shells`; current evidence proves waystone and cave-anchor route-marker skins, three skyfall crater skins, all 12 shrine landmark skins, door/window/roof skins, seven home/camp prop skins, seven utility/waterline skins, all 11 exact pickup/drop skins plus a seed alias, all 12 domain resource node skins, four tree/shrub vegetation skins, all nine native-creature skins, native creature targeting/build blockers, sparse creature roaming plus state-aware reaction/readout, five fish/driftjelly bodies through visual/live-route fish-school paths with near-only analytic flow, swim-path beads, first cast/setup cue readback, four bird bodies, and C6 edge/topology lessons. The current C6 freestanding wall-shell visuals are explicitly rejected as house art | Continue with the C6 house-grammar rebuild, richer fishing verbs and beauty-grade fishing framing, future ore/resource expansion, shared-scale house skins only after the replacement grammar passes, and avatar/equipment authored assets |
| K9.2 | Fishing schools are understandable before and after the player casts | Done for first cue/readback slice | Main implementation plus fishing-UX/proof reviewer lanes | E5, H5 | R2, R3, R5 | `src/sim/fishing.ts` cue formatter, `src/main.ts` `currentFishingCue()` HUD/F3/`__world`/text surfaces, `test/fishing.test.ts`, `scripts/proof-k9-fishing-cues.mjs`, `output/playwright/k9-fishing-cues/proof.json`, `shore-cast-cue.png`, `shore-no-rod-cue.png`, and `output/web-game/k9-fishing-cues-smoke/shot-1.png`; proof covers live shore cue, synthetic gamepad use input, toast, inventory/lastAction, no-rod denial, committed GLB provenance, and no generated-path requests | Next K9 work is richer trap/net/cast verbs, better visible-school guidance for route/camp chores, and beauty-grade fishing framing; do not regenerate fish bodies or redo basic cue readback |
| B3 | Progression contracts survive real loop transitions | Done for hearth-site contract | Main implementation plus frontier-review lane | A2, C2, C4 | R1, R2, R5 | `src/main.ts` debug hook now returns structured threshold terrain proof; `src/sim/journal.ts`; `test/journal.test.ts`; `scripts/proof-hearth-contract.mjs`; `output/playwright/hearth-contract/proof.json` | Broaden the same contract pattern to other pentagon site kinds before combat or economy loops depend on them |
| B1 | Build interactions return explicit command results | Done for first affected build verbs | Main implementation plus command-boundary/proof reviewer lanes | A2, C1, I2/P1 | R1, R2, R3, R5 | `src/sim/buildCommands.ts`; `test/buildCommands.test.ts`; `src/main.ts`; `scripts/proof-c1-build-placement.mjs`; `output/playwright/c1-build-placement/proof.json` | Broaden the facade only when the next feature needs it: storage transfer, dock fishing, fallback world-use routing, or future combat/build panels should keep runtime side effects out of sim command results |
| C5 | Functional-home playtest proves home utility instead of decoration | Done for first hearth loop | Main implementation plus frontier-review lane | B3, C2, C4 | R2, R3, R5 | `npm run proof:hearth-contract` covers home construction, site completion, threshold opening, root-cellar supper, trail focus, Route Slate, Hearth Journal, and five device profiles | Follow with broader room forms, socket-specific house affordances, and the same measured-fit proof for any remaining craftable modular pieces |
| C1 | Building placement has a real orientation and pack contract | Done for first rotation/pack slice | Main implementation plus build-contract and interaction-ownership explorer lanes | B1, C0, C5 | R1, R2, R3, R5 | `src/sim/structures.ts`; `src/sim/buildCommands.ts`; `src/main.ts`; `test/structures.test.ts`; `test/buildCommands.test.ts`; `scripts/proof-c1-build-placement.mjs`; `output/playwright/c1-build-placement/proof.json` | Keep C1 stable while future building work adds richer room shapes, socket-local snap affordances, and modular-kit art over the code-owned sockets |
| C2 | Shelter validation understands a real local room | Done for first single-room enclosure and comfort-readability slice | Main implementation plus shelter-sim and renderer-proof lanes | B1, C1, C5 | R1, R2, R4, R5 | `src/sim/structures.ts`; `src/render/structures.ts`; `test/structures.test.ts`; `test/structureRenderer.test.ts`; `scripts/proof-c2-room-enclosure.mjs`; `output/playwright/c2-room-enclosure/proof.json` | Next shelter work is broader room shapes only when needed by player-facing building UI; do not add saved room entities or modular house GLB collision until placement/snapping and screenshot proof justify it |
| C2/C3 | Building pieces can preview, relocate, and wear normalized decorative skins on a code-owned snap grid | Done for first inactive-prop relocation, player-facing move/drop controls, socket-specific door/window/roof preview guides, house-kit socket contract, and fitted door/window/roof GLB skins | Main implementation plus sim-contract, renderer-readability, asset-fit, and proof/docs explorer lanes | B1, C1, C5, H4 | R1, R2, R4, R5 | `src/sim/structures.ts`; `src/sim/buildCommands.ts`; `src/render/structures.ts`; `src/render/kilnAssets.ts`; `src/main.ts`; `test/structures.test.ts`; `test/buildCommands.test.ts`; `test/structureRenderer.test.ts`; `scripts/proof-c2-c3-building-snap-grid.mjs`; `output/playwright/c2-c3-building-snap-grid/proof.json` | Next building work is broader room forms, remaining modular prop families, and socket-local affordance polish after the player-facing move loop and decorative-skin fallback stay stable |
| C6 | A functional house has real wall and shell sockets | Topology/prototype proof passing; visible freestanding wall-shell house grammar rejected | Building sim/renderer plus asset-fit lanes | C2/C3, H5 | R1, R2, R4, R5 | `floorFoundation`, `wallPanel`, `wallDoorPanel`, `wallWindowPanel`, `wallCorner`, `wallHalfRail`, and `roofJoin`; `ShelterEnclosureReport.coveredBoundaryEdges`; `ShelterEnclosureReport.footprintMode`; `ShelterEnclosureReport.interiorSeamEdges`; `ShelterEnclosureReport.pentagonRoomTiles`; `structurePlacementBlocker` topology checks; `structureTraversalBlocker`; `Player.update` collision callback; `test/structures.test.ts`; `test/buildCommands.test.ts`; `test/structureRenderer.test.ts`; `npm run proof:c6-wall-shells`; `docs/c6-house-redesign-brief.md` | Next: replace the rejected grammar with floors-first rooms, continuous wall runs, derived corners/openings, coherent roofs, and one small well-built proof house before requesting decorative house skins |
| K6T | Visible native life owns targeting and occupied-tile placement | Done for first desktop/phone slice | Main implementation plus UX/proof lane | K6, B1 | R1, R2, R3, R5 | `src/edit/pick.ts`; `src/main.ts`; `src/sim/buildCommands.ts`; `test/nativeLifePick.test.ts`; `test/buildCommands.test.ts`; `scripts/proof-k7-native-creature-targeting.mjs`; `output/playwright/k7-native-targeting/proof.json` | Add HUD pressure-source polish and keep K6T in the regression set when K6R roaming changes actor ownership |
| G5/K6R | Native life roams through sparse actor state instead of only tile-local animation | Done for first sparse actor plus reaction-readability slice | Creature sim/renderer/animation lanes | K6T, H5, G1-G3 | R1, R2, R4, R5 | `src/sim/nativeLife.ts`, `src/render/nativeLife.ts`, `src/edit/pick.ts`, `src/main.ts`, `test/nativeLife.test.ts`, `test/nativeLifePick.test.ts`, `test/nativeLifeRenderer.test.ts`, and `npm run proof:k6r-roaming` | Build the richer state machine on top: saved/non-saved brain boundaries, social/herd behavior, flee/return timing, combat telegraph consequences, anti-farming cooldowns, and broader device proof |
| D2 | Larger terrain thresholds become real spaces | Done for first hearth/bell proof | Main implementation plus terrain/cave explorer lane | B3, C5 | R2, R4, R5 | `test/landmarks.test.ts`; `test/navigation.test.ts`; `scripts/proof-d2-threshold-spaces.mjs`; `output/playwright/d2-threshold-spaces/proof.json`; desktop/phone hearth and bell screenshots | Extend this standard to remaining pentagon thresholds, then add richer cave materials, hazards, and water-local rules |
| E4 | Ecology prep changes expedition readiness without becoming free global food | Done for route-adjacent staging, route-arrival consumption, and organic placement/wait/haul proof | Main implementation plus proof/docs reviewer lanes | B2, C4, D4 | R1, R2, R3, R5 | `src/sim/navigation.ts`; `src/sim/structures.ts`; `src/main.ts`; `test/navigation.test.ts`; `test/structures.test.ts`; `scripts/proof-e4-ecology-route.mjs`; `output/playwright/e4-ecology-route/proof.json`; desktop, laptop, tablet-touch, phone-touch, and gamepad screenshots | Add more food variety, net ecology tuning, and landscape-device smoke before treating this as final travel logistics |
| I2/P1 | Shared panel ownership blocks world-input leakage | Done for shared-owner slice | Main implementation plus UX/input reviewer lanes | C0, B3, F1 | R3, R5 | `src/player/panelOwnership.ts`, `test/ux.test.ts`, `scripts/proof-panel-ownership.mjs`, `output/playwright/panel-ownership/proof.json` | Extend to landscape tablet/phone proof and apply the same contract to future building/combat panels |
| J3 | Soundtrack handoff is optimized, streamed, and release-path safe | Done for music handoff | Main implementation plus audio/proof reviewers | J0, J1 | R5 | `scripts/proof-audio-assets.mjs`, `scripts/proof-audio-music.mjs`, `output/audio/audio-asset-proof.json`, `output/playwright/audio-music/proof.json` | Follow up on SFX loudness/provenance, then add contextual music policy later |

Subagent decision ledger:

| Lane | DAG Nodes | Brief | Decision | Merge Status | Reviewer Result |
| --- | --- | --- | --- | --- | --- |
| Graph/progress audit | A2, A3, J1 | Inspect whether the DAG is acting as a living board | Accepted | Merged into docs | Static lane table needed node states, evidence links, and start/end update rules |
| Next-node route audit | F1, I2, J1 | Rank Route Slate selection, asset readability, and music optimization | Accepted | Driving current implementation | Selectable Route Slate candidates are the right critical-path node; music is already optimized |
| Current graph/frontier audit | A2, A3, H3, I2, J1 | Check whether F1 was still a truthful frontier after `c9bc338` | Accepted | Merged into current docs | F1/I2/J1 route choice is closed; H3 route-marker readability is the highest-leverage unblocked node |
| Asset readability lane | H3, R4 | Review player/avatar, crystal-gate risk, native hazards, cave anchors, waystones, and generated GLBs | Accepted | Driving current implementation | Route markers are weaker than the current Soft-Facet avatar and native-life hooks; use code-authored glyphs before generated GLBs |
| Gameplay/UX/input lane | I2/P1, F1, J1 | Audit cross-device loop and panel ownership after route choice | Accepted as next node | Deferred from this code slice | Shared panel-owned input blocking is the next UX task; do not mix it into the H3 renderer slice |
| Music/runtime lane | J3 | Audit whether the Twelve Bells handoff is actually wired into the game | Accepted | Merged into code/tests/docs | Music already streamed through `GameAudio`; added base-path URL safety, media-error diagnostics, and gamepad mute doc follow-up |
| Audio asset lane | J3, R5 | Check codec, bitrate, sample rate, sizes, metadata, loop suitability, and provenance | Accepted | Merged as proof plus follow-up debt | Music is optimized at 33.26 MiB total; SFX are tiny but need later loudness/provenance cleanup |
| Audio proof lane | J3, R5 | Define authoritative unit, asset, browser, and production-subpath proof for the handoff | Accepted | Merged into scripts/tests | Added ffprobe asset proof and desktop/phone browser proof for dev root plus `/goldberg-planet/` production subpath |
| Generated asset safety lane | H4, R5 | Audit local Kiln drop, generated GLBs, source kit, and secret/presigned URL risk | Accepted | Merged into proof script, `.gitignore`, tool safety check, and intake docs | 82 committed GLBs and 0 unused records now pass the promoted-pack gate; raw drops, `.env.local`, dogfood outputs, and package tarballs are enforced as untracked |
| Generated asset readability lane | H4, R4 | Rank generated waystone, cave-anchor, home-kit, drop, creature, and cave-mouth candidates before runtime import | Accepted | Merged into intake docs and runtime pilot scope | First GLB pilot was `waystone`; cave-mouth GLBs are now promoted as skins over carved terrain signals; door/window/roof house-kit pieces are accepted only as measured decorative skins over code-owned sockets; creatures use AnimationMixer plus behavior proof |
| Generated asset UX lane | H4, R3 | Tie GLB intake to survival verbs rather than adding decoration | Accepted | Merged as constrained runtime scope | Runtime import is limited to route-relevant waystones and functional house-kit skins that strengthen the building loop; add landscape tablet/phone and all-verb survival/build proof before widening new panels, build placement, or combat verbs |
| Kiln runtime insertion lane | H4, R4 | Choose the lowest-risk renderer insertion point for the promoted pack | Accepted | Merged into code/tests | `waystone` loads as a decorative body shell on the existing procedural socket; door/window/roof skins load as measured decorative shells on code-owned house sockets; glyph overlays, shelter overlays, placement, collision, route readback, and fallback remain code-authored |
| Kiln proof lane | H4, J1, R5 | Prove the promoted runtime path instead of trusting a manifest diff | Accepted | Merged into proof script | Route-marker proof asserts a successful `assets/kiln/models/waystone.glb` response; C2/C3 proof asserts successful `door-kit`, `window-frame`, and `roof-bundle` model responses, measured source/fitted bounds, no `assets/kiln/generated/` runtime requests, screenshots, and no browser errors |
| Approved-pack adoption lane | H5, R4, R5 | Elevate user-approved GLBs from optional candidates to the target visual backlog | Accepted | Merged into docs as the next art-runtime track | Procedural art is now fallback/scaffold except for stronger authored systems like the plane; repeated pack families require palette/material reuse, instanced or batched geometry, draw-call proof, and distance-gated creature animation |
| Kiln alignment viewer lane | H5, H4, R4, R5 | Build a visual bench for socket, pivot, scale, and axis review across every approved GLB | Accepted | Merged into asset viewer, proof script, and docs | The viewer renders all 82 ready assets on 5.6 world-unit hex sockets with bounds/orientation warnings and per-slug screenshots before runtime wiring decisions |
| Future Kiln request lane | H5, C6, K10, R4 | Audit what additional generated assets are worth requesting after the approved pack | Accepted | Merged into intake and adoption docs | Future requests should focus on ore nodes after item taxonomy, shared-scale house-shell pieces, avatar/equipment assets after rig/socket decisions, and optional wonder/cave dressing; keep terrain tiles, water, sky, cracks, ribbons, glows, and particles procedural/material |
| K2 resource-node batching audit | H5, R4, R5 | Confirm the safest proof and batching path for all promoted `node-*` domain resources | Accepted | Merged into `KilnRuntimeAssets`, `DomainResourceRenderer`, tests, proof script, and docs | Sidecar audit confirmed domain diagnostics were already exposed, there was no existing distance gate to mirror, and the proof should assert renderer-level instancing/request paths instead of raw GLB mesh counts |
| K5 tree instancing audit | H5, R4, R5 | Confirm the safest path for promoted tree/shrub GLBs without turning GLB triangles into gameplay authority | Accepted | Merged into `KilnRuntimeAssets`, `TreeAssetRenderer`, streamer fallback control, tests, proof script, and docs | Sidecar audit confirmed `Trees` must remain the chop/pick/drop authority; the accepted path mirrors resident chunks, uses material-merged instanced batches, keeps procedural trees active until all skins load, preserves pine/shrub authored Y-up, rotates only tall broadleaf/dead-snag through longest-axis-to-Y, and disables whole-instance matrix wind until a height-weighted bend can keep bases planted |
| K6 creature animation/targetability audit | H5, R4, R5 | Confirm the safest path for promoted creature GLBs and the playtest-reported native-life input gap | Accepted | Merged into GLB skinning, mixer gates, native-pick routing, placement blockers, tests, proof script, and docs | Sidecar audit confirmed K6 asset loading was separate from the UX bug; K6 keeps creatures tile-anchored for now, while K6T closes click/placement ownership so visible native life no longer behaves like ordinary terrain |
| K6R native roaming audit | G5, H5, R4, R5 | Define the state-machine path for creatures that should move around | Accepted | Merged into sim, renderer, pick routing, tests, proof, and docs | Deterministic native sites remain home/claim anchors; nearby active creatures now derive sparse roaming snapshots with current/target tile, leash/path data, clip hints, and distance-banded animation cost; richer mood/combat/social state remains the next layer |
| K6R reaction-renderer audit | G0, G5, H5, R4, R5 | Identify the smallest night-closeout slice for making existing creature states visible | Accepted | Merged into renderer stats, tests, proof, and docs | Keep this as a renderer/readout layer, not a saved-brain rewrite: `curious`, `flee`, `telegraph`, `lunge`, and `recover` now map to pose roles, visible telegraph counts are separate from hidden telegraph meshes, and current GLB clips are reported so proof can catch animation drift |
| K6R alert-source audit | G0, G5, R1, R5 | Trace why mining, fishing, and failed wards were still reported as generic player proximity | Accepted | Merged into main-thread alert-source latch, tests, proof, and docs | Sim and renderer already carried `NativeCreatureAlertSource`; main flattened the context to `player`. The fix keeps a short-lived source for mining noise, fishing splash, and failed wards, refreshes failed-ward renderer sites, and leaves save shape unchanged |
| K9 fishing UX cue audit | K9.2, E5, R2, R3, R5 | Identify the smallest player-facing fishing improvement after fish GLBs and near-flow proof | Accepted | Merged into cue formatter, HUD/readback, and proof | Added immediate cast/setup cues from `currentFishSchool()` without changing catch math or fish visuals. The cue names school, raw-fish yield, bait state, and setup failures in compact HUD/readback copy that adapts to keyboard, touch, and gamepad labels |
| K9 cue proof/readout audit | K9.2, J1, R5 | Decide whether to extend existing K9 visual/live-route proofs or add a separate cue gate | Accepted | Merged into `proof:k9-fishing-cues` | Added a separate cue proof lane using the accepted synthetic gamepad use path, HUD toast text, `lastAction`, fish-school cue state, near-water/no-rod setup, inventory deltas, committed model requests, screenshots, and no generated-path/fallback regressions. Existing K9 live-route screenshots still stay state/provenance evidence, not beauty-grade art proof |
| C6.1 next-slice ranking | C6, H5, R1, R5 | Rank house-shell geometry proof against K9 polish and new art generation for the closeout slice | Accepted | Merged into topology-safe C6.1 | C6 stayed on the critical path because house-shell geometry blocks polished house art. The accepted slice widened connected-room diagnostics and closed pentagon invalid-edge safety before any shared-scale house-shell GLB generation |
| C6.1 topology-safe pentagon audit | C6, R1, R5 | Inspect whether the six-edge wall-socket model was unsafe on degree-5 planet tiles | Accepted | Merged into sim, command facade, tests, proof, and docs | Added topology-aware placement blockers, invalid-edge command copy, degree-5 unit coverage, synthetic pentagon connected shelter diagnostics, and a live browser `pentagonInvalidEdge` proof so wall pieces cannot rotate or relocate into phantom pentagon edges |
| C6.2 irregular footprint audit | C6, R1, R5 | Check whether broader/arbitrary support needed a new shelter solver or stronger evidence | Accepted as topology proof | Merged into irregular unit fixture, browser proof, and docs | Existing connected-foundation solver was shape-agnostic enough. Added a six-tile depth-two irregular fixture, live irregular footprint search, 24-edge perimeter proof, seam exclusion, exterior weakening, and procedural-only wall-shell policy evidence without adding saved room entities. This does not accept the visible house grammar |
| C6.2 footprint readability audit | C6, R4, R5 | Identify whether the current wall-shell grammar could become a reviewer-facing house proof | Rejected as visual direction | Replaced by `docs/c6-house-redesign-brief.md` | The `wall-shells-footprint-review.png` attempt confirmed the freestanding wall panels do not read as a properly built house. Stop polishing that screenshot; rebuild C6 from a floors-first, continuous-wall, coherent-roof grammar before any house-skin generation |
| K9/G5 skitter-marked cast audit | K9, G5, R2, R4 | Explore whether passive native-life state could enrich fishing without new fish bodies | Deferred | Recorded as future K9/G5 candidate | Suggested a tended shell-skitter lure that gently improves nearby rod fishing through existing fish-school state, but it was deferred to keep the closeout on the C6 house-building critical path |
| Hearth contract frontier lane | B3, C5, J1 | Rank the next DAG node after H4 instead of widening more GLB wiring | Accepted | Merged into proof/docs | B3 progression contracts plus C5 functional-home playtest were the right next edge: prove build home -> complete site -> open threshold -> rest/reward across the device matrix before adding more craftable assets |
| D2 terrain/cave explorer | D2, J1 | Choose the cheapest proofable path toward larger arches and chambers | Accepted | Merged into code/proof/docs | Keep `NaturalCaves.sample` stable, widen only named pentagon threshold spaces first, expose structured terrain results, make high-clearance arches routeable, and prove First Hearth plus Deep Bell before cave-generator rewrites |
| E4 proof/docs reviewer | E4, J1 | Audit whether waterline ecology is closeable as a route-prep node | Accepted | Merged into proof/docs | Close only the capped staged-resupply slice: the proof may seed trap/net readiness directly, so docs must not claim organic placement/wait/haul setup, route-local ecology, or full cross-device parity yet |
| E4 route-local code audit | E4, R1, R2 | Identify the lowest-risk path from global waterline resupply to route-local logistics | Accepted | Merged into code/tests/docs | Keep route eligibility pure in `src/sim/navigation.ts`, feed diagnostics from `src/main.ts`, count only ready route-adjacent sources now, and defer hard source consumption to route-arrival work |
| E4 proof matrix audit | E4, R3, R5 | Define the smallest cross-device proof matrix for route-local waterline logistics | Accepted | Merged into proof script/docs | Reused the E4 proof with desktop, laptop, tablet touch, phone touch, and synthetic gamepad profiles; still do not claim landscape or full all-verb parity |
| E4 route-arrival proof audit | E4, R1, R2, R5 | Inspect the safest browser-proof trigger for arrival-spent waterline sources | Accepted | Merged into proof script | Seed the active `target` route plan through save import/export, capture valid player saves with existing spawn hooks, use distinct off-route tiles because structures normalize one prop per tile, and treat missing zero check counters as zero |
| E4 organic waterline proof lane | E4, R1, R2, R5 | Verify route-food readiness through real placement, setting, waiting, hauling, and arrival consumption | Accepted | Merged into proof script | Use existing `placeStructure`, `useStructure`, `setTime`, save import/export, and diagnostics; search valid route-adjacent and off-route shore tiles, prove manual route-gear haul moves raw fish without disturbing off-route gear, then restore the ready save to prove route arrival spends only the route-adjacent source class |
| F1 route itinerary audit | F1, I2, J1 | Check whether saved route plans still lacked leg-level edit controls after E4 | Accepted | Merged into route-plan helpers, HUD controls, docs, and proof script | Confirmed saved itineraries already persisted legs; closed a conservative active-stop later/drop slice, rebuilt plans through `routePlanFromLegs`, locked Stranger Season stops against skip-order exploits, and proved keyboard/touch/gamepad paths |
| Avatar normal-distance readability lane | H0, H3, R4 | Audit whether the next art node should be route markers, native life, Kiln GLBs, or the player avatar | Accepted as next parallel node | Deferred from F1 code slice | The next highest-leverage art slice is the Soft-Facet Wayfarer normal-distance pass with renderer tests and clean character screenshots before widening creature GLB imports |
| Avatar renderer audit lane | H0, H3, R4 | Inspect character renderer, equipment props, plane mode, sockets, and action coverage | Accepted | Merged into renderer/tests/docs | Current SDF Wayfarer foundation was stronger than the old pill placeholder, but needed renderer stats, specific carried forms for key nouns, plane seated cues, and proof against short-action timing |
| Character proof harness lane | H0, H3, J1, R5 | Design the unit/browser proof for avatar normal-distance readability | Accepted | Merged into test/proof script | Added renderer tests plus a six-profile proof that triggers pickup, mine, chop, build, fish, ward, shoot, brace, discover, and plane states, asserts `characterIntent`/`characterState`/renderer stats, and captures desktop/mobile screenshots |
| Panel leakage code audit | I2/P1 | Inspect current main-loop and input-module leakage paths | Accepted | Merged into implementation | Movement, same-frame gamepad, touch mine/build, pointer lock, hotbar, and panel action risks were gated through the shared owner |
| Panel proof matrix | I2/P1, J1 | Define realistic PC/laptop/tablet/phone/gamepad proof | Accepted | Merged into proof script | Proof now asserts active owner readback, one visible panel, blocked player motion, screenshots, and no page/console errors |
| Docs/test alignment | A2, I2/P1, J1 | Identify docs, tests, and proof naming needed to close the node | Accepted | Merged into docs/tests | Added pure owner tests and moved I2/P1 from next-follow-up to done-with-evidence |
| Build placement contract lane | C1, C3, H4 | Rank snap/rotate/pack work versus modular house-kit GLB import | Accepted | Merged into C1 implementation and docs | Closed rotation/pack contract first; later C2/C3 work added the owned scale, orientation, socket, fallback, and screenshot proof needed to accept `doorKit`/`windowFrame`/`roofBundle` as decorative GLB skins |
| Build interaction ownership lane | B1, C1, I2, J1 | Map selected placement, nearby use, pack, panel ownership, and debug hooks | Accepted | Merged into B1 facade, runtime diagnostics, and proof script | `buildCommands.ts` now owns select/rotate/place/use/pack command result semantics while `main.ts` keeps HUD/audio/render/save effects; remaining work is not to broaden blindly, but to apply the same boundary when storage, dock fishing, fallback world use, or combat panels need it |
| Building relocation sim lane | C2, C3, B1 | Audit the smallest relocation/socket implementation that fits existing sim boundaries | Accepted | Merged into relocation helpers, command facade, tests, and runtime diagnostics | Keep relocation narrow: inactive structures only, preserve id/item/state/yaw, reuse one-prop-per-tile occupancy and pack blockers, expose house-kit sockets as static code-owned metadata, and defer multi-tile GLB collision |
| Building snap-grid proof lane | C2, C3, J1, R5 | Define a proof that closes relocation/snap-grid without overclaiming input parity | Accepted | Merged into new proof script and docs | Added a separate `proof:c2-c3-building-snap-grid` gate instead of widening C1; it proves state/readback/shelter effects plus keyboard, touch, and synthetic-gamepad move/drop controls while still not claiming real hardware gamepad support |
| Snap-preview render/sim seam lane | C2, C3, B1, R4 | Find the lowest-risk seam for player-facing snap-preview ghosts | Accepted | Merged into pure preview helpers, renderer ghost, diagnostics, and tests | Preview decisions stay non-mutating in `buildCommands`, terrain/water blockers still come from runtime `structureSnapTarget`, and `StructureRenderer` consumes a transient preview object outside save-backed structures |
| Snap-preview proof/UX lane | C2, C3, J1, R3, R5 | Define proof coverage for valid and blocked preview affordances | Accepted | Merged into C2/C3 proof/docs | Existing C2/C3 matrix now reads preview diagnostics before drops, captures valid/blocked preview screenshots, compares occupied preview blockers to command blockers, and keeps real hardware gamepad unclaimed |
| Socket-preview readability lane | C2, C3, R4, J1 | Audit whether house-kit previews communicate door, window, and roof affordances instead of generic ghosts | Accepted | Merged into renderer stats, unit test, browser proof, and docs | Keep GLBs out of preview logic; add procedural guide names/roles for jambs, pane/sill, and ridge/eaves; expose `socketRole`, `socketCollider`, `silhouette`, visible mesh names, and visible readability roles so proof can reject ambiguous or hidden-only preview reads |
| Shelter enclosure sim lane | C2, R1, R2 | Audit the smallest room validation slice after relocation/socket work | Accepted | Merged into `ShelterReport.enclosure`, focused tests, and room proof | Close a derived single-room report around the home bedroll, keep save shape unchanged, separate spatial enclosure from warmth, and defer multi-room solvers, saved room entities, and GLB collision contracts |
| Shelter comfort renderer lane | C2, R4, R5 | Define the renderer/proof contract for a functional house reading as warm and inhabited | Accepted | Merged into structure renderer diagnostics and browser proof | Use existing procedural pieces first: warmth halo, comfort ring, roof glow, window warm light, named readability roles, and structured `homeComfort` counters before broader lighting or modular GLB art swaps |

Gate evidence ledger:

| Gate | Required Proof | Latest Evidence | Status | Remaining Gap |
| --- | --- | --- | --- | --- |
| R0 DAG intake | Current node, owner, dependency, reviewer lane, and proof target named before broad edits | Active run ledger, living node ledger, and subagent decisions above | Passing for this slice | Keep future slices from starting without a node ledger update |
| R1 Sim/save gate | Focused sim tests pass and debug hooks expose durable state without hiding progression in UI-only code | `npm test -- test/buildCommands.test.ts test/structures.test.ts test/navigation.test.ts` covers capped route-adjacent waterline resupply, off-route ignored gear, route-consumption clearing set trap/net timers without duplicate inventory, active route stop later/drop, Stranger Season edit locks, structure yaw normalization, command-result selection/rotation/place/use/pack/relocate, non-mutating place/relocate snap-preview decisions, placed-prop rotation, relocation blockers, house-kit socket specs, wall-shell traversal blockers/passable doors, inventory deltas, pack blockers, and single-room shelter enclosure semantics without save-shape changes | Passing for B1, E4, F1, C1 rotation/pack, first C2/C3 relocation/socket/preview contracts, first C2 room enclosure, and first C6 traversal-collision helper | Save import/export compatibility still needs a broader pentagon-site, route-food, and future organic source-consumption regression suite |
| R2 Playability gate | Real player loop changes state without debug-only shortcuts | `npm run proof:hearth-contract` proves the functional-home/site-work loop; `npm run proof:d2-caves` proves First Hearth and Deep Bell terrain spaces; `npm run proof:e4-ecology-route` proves route-local waterline prep, organic placement, and arrival spending; `npm run proof:f1-itinerary` proves itinerary edits; `npm run proof:c1-build-placement` proves selected build rotation, placed-prop rotation, safe packing, unsafe pack refusal, placement readback, and structured command diagnostics; `npm run proof:c2-room-enclosure` and `npm run proof:c2-c3-building-snap-grid` prove relocating a roof out of a real shelter weakens the derived room, snapping it back restores both enclosure and comfort readback, preview diagnostics are read before drop, door/window/roof skins fit the sockets, and keyboard/touch/synthetic-gamepad move/drop controls drive the relocation cursor; `npm run proof:c6-wall-shells` proves real player movement hits wall-shell blockers, door edges stay passable, moved corners clear stale collision, and a serviced wall-shell bedroll rests through shelter sleep | Passing for this slice | Future site kinds, remaining modular house-kit families, richer food variety, arbitrary leg selection, and landscape-device route-food smoke need the same loop proof |
| R3 Cross-device gate | PC/laptop, touch, and gamepad evidence for affected verbs | Hearth-contract proof covers desktop, 1366x720 laptop, tablet touch portrait, phone touch portrait, and gamepad-active profile; D2 proof adds desktop and phone-touch hearth/bell screenshots; E4 proof covers desktop, laptop-height, tablet touch portrait, phone touch portrait, and synthetic gamepad Route Slate screenshots; F1 itinerary proof covers desktop keyboard, laptop keyboard, tablet touch, phone touch, and synthetic gamepad later/drop controls; C1 build-placement proof covers desktop keyboard, laptop keyboard, tablet touch portrait, phone touch portrait, keyboard selected-placement rotation, synthetic gamepad selected-placement rotation, command-result logs, and debug-controlled exact place/use/pack flows; C2/C3 snap-grid proof covers state/readback/screenshots plus valid/blocked preview and player-facing keyboard/touch/synthetic-gamepad relocation across desktop, laptop, tablet touch, phone touch, and synthetic gamepad profiles | Passing for the current affected verbs only | Landscape tablet/phone, real hardware gamepad, true touch rotation/fine targeting, and future all-verb parity remain later work |
| R4 Asset readability gate | Reviewer can name the gameplay noun and likely verb from screenshots | Route markers expose named cave-anchor/waystone glyph roles; D2 proof captures separate First Hearth underpass and Deep Bell chamber screenshots; `npm run proof:character` now captures Soft-Facet Wayfarer desktop/laptop/tablet/phone/gamepad/WebGL screenshots after asserting 46 silhouette/readability parts, 3 prop sockets, 21 action poses, held/stowed prop separation, and plane seated cues; C2 now exposes visible warmth halo, home comfort ring, roof shelter glow, window warm light, and structured comfort diagnostics; C2/C3 exposes door/window/roof socket dimensions, socket-specific snap-preview guides for door openings, window light, and roof caps, and fitted promoted door/window/roof GLB skins with procedural fallback; `npm run proof:kiln-asset-viewer` now captures 10 overview plus 82 single-asset socket-local screenshots against the 5.6 world-unit hex frame, including all 82 adopted GLBs and a K7 wonders family; H5 now makes future visual work focus on new packs or explicit code-owned systems; K1/K10 adds all 11 exact pickup/drop GLB skins plus the `node-root-pod` seed alias; K2 adds all 12 promoted domain-resource node skins while keeping code-owned base/glow overlays; K4 adds seven utility/waterline GLB skins while keeping trap/net/cistern/cellar/lantern overlays and shore blockers code-owned; K5 adds four promoted tree/shrub skins while keeping chop/drop authority code-owned; K6 adds all nine promoted creature GLB skins while keeping warning/reward overlays and native-life behavior code-owned; K6T proves visible native-life targets and blockers read through interaction diagnostics; K7 adds cave-anchor, three skyfall crater GLB shells, all 12 shrine landmark GLB shells, and all three cave-mouth GLB shells while keeping route glyphs, carved-void cues, threshold overlays, beams, sparks, and rewards code-owned; K9 adds five promoted aquatic singleton bodies with fish-school anchors, point-school rendering, near-only analytic flow, swim-path beads, focus crops, and live route-state proof; K11 adds four promoted bird bodies with sky-life anchors and point-flock rendering | Passing for route-marker glyph dialect, waystone/cave-anchor pilot, first threshold-space proof, procedural avatar normal-distance contract, first shelter comfort readability, code-owned house-kit sockets, first normalized house-kit skins, first snap-preview readability, first socket-specific house-kit preview silhouettes, full-pack alignment-viewer review packet, source-aware pickup/drop skin family with seed alias, first approved-pack resource-node family, first approved-pack utility/waterline family, first approved-pack vegetation family, first approved-pack creature skin family, native-life targetability/readback, K7 crater/shrine/cave-mouth landmark slice, fish-school visual/live-route/near-swim-path/cue-readback slices, and first sky-life visual slice; H5 is active for new generation and deeper polish, not because approved ready GLBs remain unwired | Blind human gameplay-context screenshot review, fishing beauty framing plus richer cast/trap/net guidance, native-life roaming/state-machine depth, authored model generation/rigging, two-hand prop polish, C6 replacement house grammar, replacement house skins after that grammar, and future modular/new asset families remain open |
| R5 Performance/release gate | Typecheck, unit suite, build, browser screenshots, console check, canvas proof, bundle/audio budgets | `npm run proof:kiln-assets` validates 82 committed GLBs; `npm run proof:kiln-asset-viewer` proves 82 ready alignment records, 10 overview screenshots, 82 per-asset screenshots, 82 adopted GLBs, zero generated-path requests, and no browser/page errors; `npm run proof:route-markers` proves committed waystone and cave-anchor model requests; `npm run proof:k10-resource-drops` proves all 11 exact pickup/drop model requests plus the committed seed alias, no generated requests, 13 spawned source-aware pickup instances, instanced material batching, desktop/phone screenshots, and collection into inventory/crafted items; `npm run proof:k1-resource-drops` remains a compatibility alias for that expanded drop proof; `npm run proof:k2-domain-resources` proves all 12 committed node model requests, no generated requests, 36 revealed node instances on 33 instanced draw calls, desktop/phone screenshots, and zero pending/fallback; `npm run proof:k5-trees` proves all four committed tree model requests, no generated requests, 210 resident tree instances on 11 instanced draw calls, desktop/phone screenshots, zero pending/fallback, stable tree bases with matrix wind disabled until height-weighted bending exists, and chopped wood drops; `npm run proof:k6-creatures` proves all nine committed creature model requests, no generated requests, authored `+Z` forward, required idle/walk clips, active/low-rate/hidden mixer bands, desktop/phone screenshots, zero fallback, and tend/ward gameplay responses; `npm run proof:k7-native-targeting` proves desktop/phone creature-first targeting and occupied-tile blockers; `npm run proof:k7-wonders` proves all three committed crater GLB shell requests plus all 12 committed shrine GLB shell requests, no generated requests, screenshots, zero fallback, and code-owned skyfall/landmark overlay preservation; `npm run proof:cave-mouth-dressing` proves all three committed cave-mouth GLB requests, no generated requests, desktop/phone screenshots, zero pending/fallback after load, and code-owned route overlays; `npm run proof:k9-fish-visuals` proves all five promoted aquatic GLB paths with two animated anchors each, point sprites, near-boid sprites, 14 swim-path beads, focus screenshots, per-scenario text/model requests, zero generated requests, zero fallback, and zero browser errors; `npm run proof:k9-live-fish-routes` proves those same five slugs through live baited-shore, storm-front, sea-cave, salt-tide, and reed-water `currentFishSchool()` state with committed model requests, near-path diagnostics, zero generated requests, zero fallback, and screenshots/focus crops; `npm run proof:k9-fishing-cues` proves live cast/setup cues, accepted synthetic gamepad use input, HUD toast/text readback, inventory/`lastAction` deltas, no-rod denial, committed model request, screenshots, and zero generated-path requests; `npm run proof:k11-sky-life` proves all four promoted bird GLBs load from committed models as sky-life anchors with point flocks, zero generated requests, and zero fallback; `npm run proof:character` proves avatar renderer stats, screenshot/canvas pixels, and no page/console errors across six profiles; `npm run proof:hearth-contract`, `npm run proof:d2-caves`, `npm run proof:e4-ecology-route`, `npm run proof:f1-itinerary`, `npm run proof:panel-ownership`, `npm run proof:c1-build-placement`, `npm run proof:c2-room-enclosure`, and `npm run proof:c2-c3-building-snap-grid` record screenshots, screenshot/canvas pixels, no page/console errors, command logs, terrain/progression/route-prep/arrival-consumption/organic route/off-route/build-placement/relocation/enclosure evidence, promoted door/window/roof model responses, fitted-bounds diagnostics, valid/blocked snap-preview screenshots, and desktop/laptop door/window/roof placement-preview guide screenshots | Passing for the promoted Kiln pack, full-pack alignment viewer, first route-marker/cave-anchor pilot, first normalized house-kit family, expanded K1/K10 instanced pickup/drop family, first K2 instanced resource-node family, first K5 instanced vegetation family, first K6 animated creature-skin family, K6T native targeting, K7 crater/shrine/cave-mouth landmark slice, K9 fish visual/provenance, live-route, near-swim-path, and first cue/readback slices, K11 sky-life visual slice, avatar fallback proof, hearth contract, first D2 threshold-space proof, E4 route-adjacent plus organic source proof, F1 itinerary controls, shared panel ownership, B1 command boundary, C1 build placement, first C2 room enclosure, first C2/C3 snap-grid relocation/preview, and first socket-specific house-kit preview proof | Production large-chunk warning, SFX loudness/provenance cleanup, landscape-device route-food smoke, richer native-life state-machine/combat proof, fishing beauty framing plus richer cast/trap/net guidance, C6 replacement house grammar proof, and future generated-family scale/collision proofs remain known follow-ups |

| R5 C6 addendum | Wall-shell edge coverage, collision, serviced-room, six-edge single-room, connected outer-perimeter, topology-safe pentagon, and irregular footprint browser proof | `npm run proof:c6-wall-shells` records useful edge-based shelter coverage, traversal, connected-perimeter, interior-seam, degree-5 pentagon, and irregular-footprint evidence | Passing only as topology/prototype regression, not as house-art acceptance | Rebuild the visible house grammar from `docs/c6-house-redesign-brief.md`; request shared-scale house skins only after the replacement grammar proves one small, well-built home |

Board update rule: update the node ledger at the start and end of each substantial
continuation. No node moves to `Done` without an evidence link. Every subagent output must
be recorded as `accepted`, `rejected`, or `deferred`, including the reason when it does not
become code.

Reviewer gates:

- **R0 DAG intake**: no broad feature edits until the current DAG node, lane owner,
  dependencies, and proof target are named.
- **R1 Sim/save gate**: focused tests pass, import/export/save compatibility holds, and
  hidden progression state is not stranded in `main.ts`.
- **R2 Playability gate**: the real loop works without debug hooks.
- **R3 Cross-device gate**: PC, laptop-height, tablet, phone, and gamepad evidence exists
  for the affected verbs.
- **R4 Asset readability gate**: screenshot reviewers can name the gameplay noun and
  likely verb without implementation notes.
- **R5 Performance/release gate**: production build, browser/canvas proof, console check,
  bundle/audio budgets, and docs truth pass.
- **R6 Wonder gate**: mysteries remain player-facing and strange, not vague placeholders.

Subagent operating model: the main agent is the orchestrator. Explorer lanes audit DAG,
UX/input, art readability, performance, or review risks; worker lanes edit only disjoint
file sets with explicit ownership; reviewer lanes inspect merged behavior before commit.
Merge order follows dependency edges, not completion order. The orchestrator resolves
contradictions, keeps the critical path moving locally, and records any human-owned
decisions before the next frontier starts.

Each cycle should also produce a small **Avatar Kit** entry before it closes. The kit is the
working design packet for the authored player model and its visible gameplay attachments:
base model changes, clothing/backpack needs, equipped prop variants, held/stowed/world
forms, socket assignments, animation clips, procedural fallback poses, and screenshot/debug
evidence that the new verb reads on the spherical world. Leave room for a few expressive or
mysterious props too, so the character can carry discovery without every item being purely
utilitarian.

Add the named art-style target **Soft-Facet Wayfarer**. The player should read as a silly,
polished, low-poly survivor built from fused primitive volumes rather than a capsule mannequin
with boxes attached. The procedural fallback can use sampled SDF blend-shell meshes, faceted
surface normals, small asymmetries, shader-driven breathing, squash-and-stretch action beats,
and practical costume shapes such as a hood rim, scarf, satchel, rounded pack, mittens, and
boots. Crystals should be used as restrained functional accents on echo gear, cave rewards,
or old-world devices, not as unexplained decorative gates. Terrain wonders should read
terrain-first: mouths, cairns, bowls, shelves, arches, pockets, ledges, and hollows before
they read as arbitrary markers. If a threshold is truly a gate, the surrounding contract
should explain why it is a gate and its silhouette should be unmistakable.

Use that same Soft-Facet language for future planet-native creatures and hazards. Native
life should look assembled from blended primitive volumes, faceted shell forms, goofy
proportions, asymmetrical little props, and procedural motion rather than generic fantasy
mobs. A harmless creature should be readable as a useful neighbor before it is a resource
node. A dangerous creature should feel like the planet pushing back through weather, caves,
sound, migration, or territory, not like a random enemy dropped into the sandbox.

Add a recurring **Asset Readability Gate**. A modeled asset is not accepted just because it
is visible, animated, or technically clever. It must communicate what it is for at normal
play distance, in motion, and under the game HUD. If a crystal ring, creature, prop, shrine,
tool, crop, trap, marker, or native hazard does not clearly signify its role, the slice
should stop and revise the asset language before adding more variants. Each asset packet
should answer: what is the gameplay noun, what verb does it invite, what silhouette carries
that meaning, what colors/materials are functional rather than decorative, what smaller
motion sells the behavior, and what screenshot proves the read. Unclear assets should be
renamed, reshaped, simplified, relocated, or removed; do not keep ambiguous cool geometry
as lore unless the mystery is intentional and the player has a way to learn it later.

Current asset-readability debt should be reviewed in subagent lanes before additional
variants multiply the problem. The first domain-resource readability pass is in: lantern
shards now target lamp prisms, glass shards target flat shoal panes, bell crystals target
resonant bell/rib clusters, horizon shards target route vanes/bearings, and the other
domain resources now report twelve distinct renderer silhouette families for proof. The
next reviewer lane should judge those shapes from normal play-distance screenshots and keep
refining any family that still reads as generic glow. Pentagon threshold landforms remain a
high-risk landmark asset class and should keep moving away from ambiguous crystal-gate
decoration toward terrain-first silhouettes that say arch, underpass, cut, shelf, bowl,
throat, chamber, or return route. The first native-life renderer readability pass is in:
native creatures now expose distinct silhouette families and named telegraph roles for
bristle crowding, hinged cave jaws, lifting scree plates, storm quills/gust arcs, tide eye
bulbs/splash arcs, and blink-focus rings. The next reviewer lane should judge those at
normal play distance and keep pushing any hazard that still reads as a shared warning ring.
Cave anchors should read as belay/route kit rather than shrine ornaments, and waystones need
stronger route icons so the player can tell shelter, water, cave, landmark, weather, and
homeward bearings apart at play distance.

Current Asset Readability Gate DAG:

1. **A0 Intake**: inventory the asset family, decide dirty-worktree/generated-asset status,
   and name the target gameplay noun and verb.
2. **A1 Contract**: define states, interaction path, UI/audio/readback labels, and the
   smallest proof scene.
3. **A2 Art lane**: revise silhouette, material roles, motion cues, sockets, and prop
   relationships.
4. **A3 Sim/UX lane**: verify keyboard, touch, and gamepad can reach the intended verb.
5. **A4 Runtime proof**: capture desktop/mobile screenshots at normal play distance with HUD
   visible plus `render_game_to_text` evidence.
6. **A5 Budget proof**: record meshes, draw calls, GLB/import size when applicable, material
   count, pivot/orientation, and runtime reference path.
7. **A6 Blind readability review**: ask what the screenshot shows and what action it invites
   without labels; failed reads return to A2.
8. **A7 Accept/document/commit**: only after the asset passes noun, verb, UX, budget, and
   proof gates.

The immediate readability frontier is player/avatar kit, cave anchors and waystones, native
hazards at normal play distance, and the season-afterglow marker. Generated Kiln GLBs should
remain uncommitted until they have an integration wrapper, import ledger, and runtime proof.

Add a named **Player Character Model Pass** to this cycle. That pass should design the
authored survivor as a real production target: base body proportions, clothing and pack
progression, rig expectations, local-up orientation behavior, LOD/procedural fallback, and
the full prop/animation contract that lets the player visibly use the survival systems.
The same pass should keep a live catalog of equipable props, including hand-held, stowed,
world-placed, worn, seated, and vehicle variants, plus their sockets, pivots, scale notes,
materials, and transition poses. The animation packet should cover locomotion, mining,
building, farming, fishing, cooking, eating, preserving, resting, weather-reading, cave
work, discovery reactions, and plane/vehicle states, while leaving room for a few strange
or ceremonial objects that make the planet feel older than the player's recipes.

### Cycle 0: Simulation and Save Boundary

Status: foundation implemented for the current sandbox survival state. The save schema now
captures seed/frequency, player state, hotbar inventory counts, crafted item counts,
selected hotbar slot, plane unlock, column edits, chopped trees, placed structures, prop
utility state, crop state, stamina/exposure, clock/weather phase, and pentagon progression.
The next Cycle 0 work is to keep migrating richer survival systems into the same `src/sim/`
boundary as they are built.

Purpose: move the game from demo state to saveable survival state.

Scope:

- Add a `src/sim/` boundary for serializable game state.
- Save seed, player position/mode, inventory, crafted unlocks, column edits, chopped
  trees, placed structures, crops, time, weather, and progression.
- Keep renderer objects, meshes, DOM nodes, and Three.js materials out of save data.
- Define stable ids for entities and structures anchored to tile/layer/local offsets.
- Add import/export or local save slots before complex progression depends on state.

Acceptance:

- Reloading the page restores mined cells, placed cells, chopped trees, inventory, plane
  unlock, selected hotbar slot, and player location.
- Future time, weather, hunger/stamina, and deeper progression should use the reserved
  schema fields instead of creating separate save systems.
- Existing `npm test` and `npm run build` remain green.

### Cycle 1: Crafting, Inventory, and Tools

Status: first scaffold implemented. `src/sim/crafting.ts` now defines stable item ids,
material/crafted inventory helpers, basic survival recipes, station gating, and pure
crafting rules. The current playable surface adds a `B` crafting panel backed by saved
crafted item counts, while the old hotbar remains the immediate terrain-building path.
Crafted house props and route markers have started moving into Cycle 2 and Cycle 5 as
placeable anchored structures.
The first character/equipment foundation is now in: the procedural player has hand and back
sockets, crafted tools and selected build props can become visible props, and survival verbs
drive readable action poses. The first tool-effect pass is also in: matching stone tools
extend reach, speed up repeated work, and track saved wear. Field repair kits now give that
wear system a first expedition-supply answer by auto-saving a breaking stone tool without
adding a new cross-device control burden. Echo tools now add the first upgrade tier: cave
glow crystals, repair kits, and base stone tools craft into stronger axe, pick, and shovel
variants that are preferred by the tool selector, satisfy existing route/site prep, and
read as crystal-accented avatar props. The first real inventory detail view is now in as the
Pack Ledger inside the same crafting surface: it groups hotbar materials and crafted items by
survival job, shows food meal units, repair supply counts, route/build gear counts, and tool
wear, and exposes the same data through debug/readback hooks for desktop, laptop, touch, and
gamepad verification. Touch now has a compact craft button to reach that same surface without
a keyboard. Pack Burden now adds the first load model on top of that ledger: carried
materials and crafted gear produce light, field, heavy, overloaded, or creative-carry
readbacks, heavy loads add soft movement pressure, overloaded packs block sprint until the
player stashes materials or builds storage, and Creative mode keeps unlimited carry. The
first pack progression step is also in: a workbench-crafted Pack Frame uses wood, sticks,
and reeds to fit a visible reed-lashed back frame, adds +28 capacity, shifts borderline
heavy loads back into field carry, and caps at one active fitted frame instead of creating a
stackable exploit. The first weather-loadout step is also in: a workbench-crafted Storm
Cloak uses snow, reeds, kelp, and snow herbs to fit a visible shoulder cloak, softens
storm/rain/cold/soaked exposure while the player is outside, appears as Route Gear in the
Pack Ledger, and can satisfy storm timing prep as a wearable answer without replacing
shelter, weather vanes, or pentagon weather insights. Next Cycle 1 work is stricter
material eligibility, additional upgrade branches, and richer pack fit/loadout decisions
beyond the first frame and cloak.

Purpose: replace the current five-count hotbar with a survival inventory and recipe loop.

Scope:

- Add items for wood, sticks, stone, sand, clay/glass, fiber, food, bait, ore, crystal,
  and crafted tools.
- Add recipes for workbench, axe, pick, shovel, repair supplies, fishing rod, fire, bed,
  chest, crop plot, compost bin, rain cistern, root cellar, cave anchor, door, window, roof,
  dock segment, drying rack, torch/lantern, waystones, preserved food, pack frame, storm
  cloak, and plane parts.
- Add tool tiers that affect speed, reach, material eligibility, and durability.
- Leave room for a later hatchet branch instead of treating every wood tool as the same
  axe: a hatchet should be a one-handed chopping/defense tool that speeds staged tree
  breaks, while larger axe/echo-axe variants stay expedition-grade woodcutting tools.
- Plan for future sword/blade, bow, arrows, and defensive tools through the same crafting,
  tool-wear, repair-kit, equipment-socket, input, audio, and Pack Ledger systems; do not
  create a separate combat inventory.
- Replace instant resource grants over time with staged world feedback: trees and resource
  nodes should show break progress, then spawn grounded pickup entities with small bounce or
  magnet animations before materials enter inventory.
- Design the player character model as a production asset target, including readable
  survival silhouette, carried/equipped prop sockets, tool-in-hand variants, backpack or
  satchel progression, and compatibility with the current local-up orientation system.
- Define the first animation set before tool tuning hardens: idle, walk, sprint, jump,
  swim, mine, chop, place/build, craft, fish cast/reel, farm/plant, preserve/eat, sleep,
  read weather, take off, plane seated/steering, and simple emotes or discovery reactions.
  Future combat/life verbs should extend this with hatchet guard, short slash, bow draw,
  dodge/sidestep, pickup bend/magnet handoff, creature tend/feed/shear, hit-stun, flee,
  and non-lethal warding poses.
- Treat equipped props as gameplay communication, not decoration: axe, pick, shovel,
  repair roll, fishing rod, seed pouch, torch/lantern, map, trail ration bundle,
  drying-rack kit, food, compost sack, compost-bin kit, rain-cistern kit, water jar,
  root-cellar kit, provision crate, cave-anchor kit, weather-vane kit, and plane/camp gear
  should be visible when selected or used.
- Keep the Pack Ledger as the cross-device inventory surface until a deeper pack system
  warrants a separate panel. It should remain reachable from the existing craft action on
  keyboard, touch, and gamepad, and should keep grouping items by what the player is trying
  to do rather than by implementation storage.
- Keep creative mode as a separate debug/sandbox path.

Acceptance:

- A new player can gather wood and stone, craft a workbench, craft basic tools, place a
  chest/fire/bed, and still craft the plane through a more explicit recipe path.
- A player preparing for a longer chop, mine, cave, or route run can craft repair kits and
  trust that the next stone-tool break point is saved with a clear HUD/tool readback on
  keyboard, touch, and gamepad.
- A player returning from caves can spend glow crystals, repair supplies, and base tools on
  echo-tier axe/pick/shovel upgrades that improve reach, speed, durability, expedition prep,
  site-work compatibility, and visible equipped props without adding a new control path.
- A player can open crafting on desktop, laptop, touch, or gamepad and read a compact Pack
  Ledger that explains carried materials, tools, food/bait, build kits, route gear, parts,
  meal units, and tool wear without opening a second inventory-only screen.
- A player carrying a heavy or overloaded pack gets an understandable HUD/ledger readback,
  feels the stamina cost while moving, loses sprint only when overloaded, and can see that
  stashing supplies or building storage is the intended fix rather than a hidden failure.
- A player with reeds and a workbench can craft one Pack Frame, see it as route gear in the
  ledger, gain a visible +28 capacity upgrade across HUD/readback/survival math, and get a
  fitted-frame recipe state instead of repeatedly stacking the same upgrade.
- A player with snow, reeds, kelp, snow herbs, and a workbench can craft one Storm Cloak,
  see it as route gear in the ledger, gain a visible worn cloak, feel reduced hazardous
  weather exposure while still needing shelter for full recovery, and get storm-route prep
  credit without bypassing weather-vane or home systems.
- The character/equipment plan is documented well enough that model generation,
  procedural fallback, sockets, and animation clips can be implemented without guessing
  scale, pivot, orientation, or required gameplay states.

Avatar Kit delta: Field Repair Roll. The authored character model needs a small belt or
backpack repair roll, loose reed lashings, a stone wedge bundle, and a quick crouched
rewrap/tool-inspection pose that can interrupt mine/chop/dig actions briefly without
confusing the held tool. The procedural fallback now represents the kit as a brown wrap,
gold reed lashing, stone wedge, and wooden peg on the hand/back socket. Validation should
capture the kit in hand after an auto-repair, a stowed backpack variant, and a compact HUD
readback so the moment remains legible on desktop, laptop, tablet, phone, and gamepad.

Avatar Kit delta: Echo Tool Set. The authored character model now needs upgraded axe,
pick, and shovel variants with a clear cave-crystal language: cyan/green crystal cores,
reed or wire bindings, reinforced handles, and stowed backpack silhouettes distinct from
the stone tools. Required poses are the existing chop/mine/dig clips with a faint
tool-inspection or crystal-glint beat after crafting, plus screenshot checks proving the
echo tool is selected over the base tool, visible in hand, visible on the backpack, and
legible in compact HUD layouts on desktop, laptop, tablet, phone, and gamepad.

Avatar Kit delta: Pack Ledger. The authored survivor should carry a readable but compact
satchel/pack system that supports sorted pouches for food, parts, route gear, and repair
supplies without making the silhouette noisy. Required animation/pose work includes a quick
pack-check or ledger-glance gesture when opening crafting, a small one-handed item sorting
beat for crafting confirmations, and stowed gear proportions that still read when the HUD is
compressed on laptop, tablet, phone, and gamepad layouts. The procedural fallback can stay
minimal for now, but future authored assets should make the pack feel like the physical
source of the Pack Ledger rather than a detached menu.

Avatar Kit delta: Pack Burden. The authored survivor should support visible load states:
compressible pack straps for normal carry, fuller satchel or bedroll silhouettes for heavy
loads, and an overloaded profile that reads from third-person distance without becoming
cartoonish. Required animation/pose work includes a shoulder-adjust or pack-settle gesture
when burden changes, a tired/heavy locomotion overlay, and a blocked-sprint feedback pose
that remains legible on PC, laptop, tablet, phone, and gamepad HUD layouts.

Avatar Kit delta: Pack Frame. The authored survivor needs a craftable reed-lashed frame
that sits over or behind the base backpack without hiding tools: two side rails, a center
spine, shoulder loops, reed lashings, and a small pouch or bedroll tie point. Required
animation/pose work includes a two-handed fitting/strap-tightening craft beat, a brief
shoulder-settle after equipping, and back-socket screenshots proving the frame remains
readable with tools, fishing gear, route gear, and compact HUD layouts.

Avatar Kit delta: Storm Cloak. The authored survivor needs a reed-tied weather cloak with a
short hood, darker wet hem, and shoulder wrap that can sit with the pack frame without
hiding tools. Required animation/pose work includes a two-handed cloak-fit craft beat, a
wind-brace or hood-pull weather idle, a wet-hem shake after soaked travel, and desktop,
laptop, tablet, phone, and gamepad screenshots proving the cloak reads in storm travel,
Route Slate, and Pack Ledger layouts.

#### Character Model and Equipment Thread

The player character is a cycle-level deliverable for Hearth and Horizon, not a later
cosmetic pass. Before tools, farming, fishing, shelters, and travel harden around
invisible actions, define the avatar, its equipped props, and its animations as one
production target:

- Production brief: maintain a living character model spec that can drive authored model
  generation, procedural fallback work, rigging, scale checks, texture/material style,
  silhouette readability, and in-game validation screenshots.
- Character model packet: design the full player-character model for this survival game,
  including body proportions, head/face or helmet approach, clothing layers, backpack or
  satchel progression, rig expectations, LOD/procedural fallback rules, and how the model
  stays readable against trees, water, caves, houses, and pentagon landmarks.
- Model and prop packet per cycle: every survival slice that adds a usable prop, tool,
  wearable, vehicle, or station should name the required mesh/model target, held and stowed
  variants, material/readability notes, equip socket, animation clips, and debug/screenshot
  checks before the mechanic is considered done.
- Avatar Kit entry: close every cycle with a named packet for the current player-character
  delta, including the authored model target, fallback geometry, equipable prop variants,
  socket map changes, required animation clips, procedural poses, and any prop that should
  exist mostly to make wonder, travel, or discovery read in the character's hands.
- Player-character gate: each development slice should produce or update a concrete model
  brief for the authored player character, then explicitly decide whether that model needs a
  new body/clothing/backpack detail, which props can be equipped or carried, which hand/body
  sockets they use, and which authored animation clips or procedural poses prove the mechanic
  on screen.
- Equipable prop catalog: keep a cycle-by-cycle list of props the player can visibly hold,
  wear, pack, shoulder, set down, sit in, or operate. Each catalog entry should include the
  gameplay source item, in-hand mesh, stowed/body mesh, placed-world mesh if different,
  socket, scale/pivot, material read, and any required transition pose.
- Animation packet: each new verb should declare its authored clip target and procedural
  fallback pose at the same time as its rules. At minimum, track start/loop/end timing,
  target alignment on a spherical world, left/right hand use, carried-prop motion, and
  whether the pose must blend with walking, swimming, climbing, resting, or plane seating.
- Base model: a readable survival-builder silhouette, stable scale, pivot, local-up
  orientation behavior, first/third-person camera compatibility, and a simple procedural
  fallback if the authored asset is not ready.
- Equip sockets: right hand, left hand, back, belt, pack, head/hat, chest/front carry, and
  optional shoulder/lantern points that can be driven by gameplay state.
- Equipped props: axe, pick, shovel, fishing rod, seed pouch, torch/lantern, food/meal,
  trail ration bundle, compost sack, compost-bin kit, rain-cistern kit, water jar,
  drying-rack kit, root-cellar kit, provision crate, cave-anchor kit, rope coil,
  weather-vane kit, map/chart, backpack/satchel upgrades, camp kit, future hatchet,
  sword/blade, bow, arrow bundle, creature-tending bundle, glider/boat gear if those ship,
  and plane-related carry or seated variants.
- Animation set: idle, walk, sprint, jump, land, swim, mine, chop, dig, place/build,
  craft, plant/tend/fertilize/irrigate/harvest, fish cast/reel, compost, collect rain
  water, cache/withdraw provisions, cook/preserve/eat, read weather/forecast, sleep/wake,
  set/read cave anchor, tap cave spring water, climb/ledge movement, take off, plane
  seated/steering, and a few quiet discovery reactions. Later native-life/combat work adds
  pickup bend and catch, hatchet guard/chop, sword draw/ward/slash, bow draw/release,
  dodge/sidestep, creature feed/tend/shear, startle/flee, hit-stun, and non-lethal scare-off
  reactions.
- Integration rules: selected tools should be visible before they are used, action
  animations should line up with terrain/prop targets on a sphere, and save/debug state
  should expose enough equipment information to reproduce animation or socket bugs.
- Cycle rule: when a new usable object ships, decide its equipped prop form, carry state,
  socket, animation pose, transition timing, and debug/readback state in the same pass as
  the mechanic.

Status: first procedural fallback implemented and now pivoted toward the Soft-Facet Wayfarer
style. The current avatar exposes hand/back sockets, legs, boots, mittens, a belt, satchel,
rounded pack, bedroll, hood/face/scarf cues, sampled SDF blend-shell body and limb meshes,
WebGPU vertex breathing, and squash-and-stretch procedural action beats; shows owned tools on
the backpack; shows selected blocks or structure kits in hand; promotes workbench, campfire,
chest, bedroll, waystone, and plane-frame carries out of the generic pack fallback; and maps
walking, sprinting, jumping, swimming, plane mode, mining, chopping, placing, crafting,
fishing, farming, cooking, resting, native-defense beats, pickup handoffs, and discovery to
short readable poses. Plane mode now includes a named seated Wayfarer/yoke silhouette instead
of hiding the character entirely. `Character.stats()`, F3, `__world.characterRenderer()`,
`__THREE_GAME_DIAGNOSTICS__`, and `render_game_to_text` expose 46 named silhouette/readability
parts, 3 prop sockets, 21 supported action poses, visible held/stowed prop counts, and a
`normalDistanceReady` gate. `test/characterRenderer.test.ts` and `npm run proof:character`
prove that contract across desktop, laptop, tablet touch, phone touch, synthetic gamepad, and
WebGL fallback screenshots. This does not replace the eventual authored model; it locks the
gameplay contract and art direction that the authored model must satisfy.

### Cycle 2: Functional Houses

Status: first foundation implemented. Crafted workbench, campfire, chest, bedroll, crop
plot, compost bin, rain cistern, root cellar, cave anchor, door kit, window frame, roof bundle, dock segment, drying rack, weather vane, and lantern items can be selected from the
crafting panel and placed onto highlighted hexes as world-anchored procedural props. Placed
workbenches count as crafting stations, placed props save/reload, and the HUD/debug state
tracks home/hearth status. First utility interactions are now in place: `R` or the touch
use button toggles campfire/lantern light, marks a bedroll as the home/rest point, and
quick-stashes or retrieves material counts from chests. The first preserved-food station is
also in: drying racks have a workbench recipe, visible carried and placed forms, saved
preserve state, and turn raw fish plus kelp or snow herbs into trail rations. The first shore-building pass is in:
dock segments have a workbench recipe, visible carried prop form, shoreline/water-edge
placement rules, plank-and-piling world model, save/readback state, and a direct `R` fishing
station role. The first home-instrument pass is in: weather vanes have a workbench recipe,
visible carried and placed forms, saved forecast-read state, and `R` reads local wind or
storm timing for route prep. The first farm-station pass is in too: compost bins have a
workbench recipe, visible carried and placed forms, saved use state, and `R` turns forage or
fish scraps into compost for nearby gardens. The first water-station pass is in: rain
cisterns have a workbench recipe, visible carried and placed forms, saved water state, and
`R` catches mist/rain/storm water for nearby dry crop plots. The first cellar/cache pass is
in: root cellars have a workbench recipe, visible carried and placed forms, saved provision
state, and `R` caches trail rations, camp meals, or cave forage as home-staged expedition
food that Route Slate counts before distant departures. Stocked functional homes now turn
that cache into a concrete bedroll departure ritual: dawn rest serves a hearth supper,
spends one root-cellar provision, and grants timed trail focus for the next route. The first
shelter recognition pass is now topology-aware: a home bedroll needs nearby roof bundles,
door, lit campfire, workbench, and chest to count as a complete shelter. The first
single-room enclosure report is in too: `ShelterReport.enclosure` derives room, boundary,
support, roof, opening, and utility tiles around the claimed home bedroll, separates
spatial enclosure from warmth and workshop/storage service readiness, reports rough,
weather-safe, working, or lived-in comfort tiers, and keeps the save shape unchanged rather
than creating saved room entities.
The first safe prop pack-up pass is now in: `Shift+R` near a placed prop returns empty and
inactive structures to inventory while refusing stocked chests, planted crop plots, wet
cisterns, provisioned cellars, lit fire/lanterns, home bedrolls, attuned waystones, and set
cave anchors. The first placement-facing contract is now in as well: `Z/X` rotate the
selected crafted prop before placement or rotate a nearby placed prop by one hex face,
gamepad `LB+D-pad` rotates a selected build piece before returning to route pin/clear
behavior, placed yaw normalizes through save data, and `__world.structures()` plus
`render_game_to_text` expose the selected build face and placed prop turns. The browser
gate `npm run proof:c1-build-placement` proves a small house-kit cluster, placed-prop
rotation, safe pack-back inventory return, lit-prop pack refusal, and desktop/laptop/tablet
touch/phone touch/gamepad screenshots. The first richer chest UI is now in as well: `R` opens a compact storage
panel for nearby chests, shows carried and stored material counts, and gives explicit
one/all stash and take controls instead of relying on a blind quick-toggle. The Avatar Kit
entry for this slice should keep chest use readable through small carried material bundles,
packing/placing hand motion, and a chest-open or sorting pose for the authored character.
Bedroll use now has its first real sleep consequence:
resting advances saved time/weather to dawn and recovers stamina/exposure based on shelter
quality, so a complete house is a better expedition reset than a rough camp. The first
collapse-recovery consequence is now in too: maximum exposure knocks the player out of the
field, then wakes them at a marked home bedroll if one exists, or at spawn if they never
claimed a home. Functional shelter gives the best recovery, rough homes recover less, and
spawn rescues leave the player tired and exposed enough to make home-building matter. The
Avatar Kit entry for this slice should add an exhausted stagger or collapse pose, a bedroll
wake-up pose, a spawn-rescue wake-up pose, and visible bedroll/blanket or pack props that
make recovery readable without a text panel. The first weather-watch pass is now in: a
weather vane within the wider home instrument ring can turn a weather-safe shelter into a
real storm/cold/rain waiting action, advancing time until a safer window opens or reporting
that the weather held, while restoring stamina/exposure according to shelter comfort. The
Avatar Kit entry for this slice should add a weather-vane reading pose, a sheltered
storm-watch idle, and cloak/lantern/hand-shielding variants that show the character waiting
out weather instead of ignoring it. The home-supper Avatar Kit entry should add a low bowl
or wrapped ration, seated/kneeling hearth-meal pose, pack-up-after-breakfast transition,
and a short satisfied departure gesture that reads on phone, tablet, keyboard, and gamepad
HUD layouts. The first relocation and snap-grid contract is now in: inactive placed props
can move across the same solid-ground and shore-edge rules as placement, keep their id,
state, yaw turn, and save shape, and report structured `fromTile`/`toTile` build-command
diagnostics. Moving a roof bundle out of a functional shelter now weakens shelter quality,
and snapping it back restores the shelter. The first house-kit socket contract is in too:
door kits, window frames, and roof bundles expose code-owned grid footprint, snap role,
opening dimensions, collider ownership, visual scale, and decorative-GLB policy through
`__world.structures()`, `render_game_to_text`, unit tests, and
`npm run proof:c2-c3-building-snap-grid`. The first snap-preview pass is also in: selected
build pieces and active relocation cursors render a transient footprint ghost with a facing
tick, blocked crossbars, renderer stats, and the same valid/blocked diagnostic object that
the command path will use. The C2/C3 proof now captures valid and blocked preview
screenshots before player-facing drops across desktop, laptop, touch, and synthetic gamepad.
The first socket-specific preview pass is in too: door kits add jamb/lintel/threshold guide
meshes, window frames add glass/sill/mullion/top-rail guide meshes, and roof bundles add
ridge/eave/cap-coverage guide meshes. Renderer diagnostics expose `socketRole`,
`socketCollider`, `silhouette`, `meshNames`, and `visibleReadabilityRoles`, and the C2/C3
proof now checks the door-opening, window-light, and roof-cap silhouettes before accepting
placement-preview screenshots.
The first shelter comfort renderer pass is in as
well: lit home fires show a warmth halo, claimed functional bedrolls show a comfort ring,
roof bundles inside a functional room show roof shelter glow, window frames can show warm
interior light, and renderer diagnostics expose `homeComfortSignals`,
`shelterReadabilityRoles`, and structured warmth/light/home/smoke counters. The named
browser gate `npm run proof:c2-room-enclosure` proves the derived room report and those
comfort signals using the same real shelter setup and roof snap-out/snap-back recovery
scenario. The C6 wall-shell proof now extends this from prop-based shelter into a
code-owned single-room wall shell: the bedroll-centered shell reports protected shelter,
functional home, lived-in comfort, workbench/chest/campfire service readiness, bedroll rest
through shelter sleep, and full six-edge single-room perimeter coverage. This does not claim
arbitrary-room housing or a beauty-grade house art pass. This now claims keyboard, touch, and synthetic-gamepad relocation controls while
still leaving real hardware gamepad relocation, typed multi-room solving, saved room
entities, or modular GLB house-kit collision unclaimed. The first normalized modular GLB
house-kit art pass is now in: promoted Kiln `door-kit`, `window-frame`, and `roof-bundle`
load as measured decorative skins over code-owned sockets, expose fitted-bounds diagnostics,
and hide duplicated procedural body parts only after load success while preserving
`windowWarmLight`, `roofShelterGlow`, snap, relocation, save, and shelter rules. The next
Cycle 2 work is broader room forms only when build UI needs them, remaining modular prop
families, and deeper socket-local affordance polish after the decorative-skin fallback stays
stable. The first homeward beacon pass is also
in: a marked home bedroll plus a lit local campfire produces a
Hearth Beacon signal, `M` can read the direction home even before the Horizon Chart exists,
and lit campfires raise visible smoke in the world.

Purpose: make building matter.

Scope:

- Add structure props anchored to the hex world: door, hatch, window, roof, bed, chest,
  fire, workbench, stove, shelf, lantern, weather vane, fence, crop plot, compost bin,
  rain cistern, root cellar, dock segment.
- Add simple shelter detection: enclosed area, roof coverage, floor contact, door access,
  and weather exposure.
- Add comfort and utility: sleeping advances time, chests persist storage, fire gives
  warmth/cooking, compost bins turn scraps into crop fertility, rain cisterns store storm
  water for inland gardens, drying racks preserve expedition food, root cellars stage
  preserved food and cave forage for Route Slate prep, roof protects crops and workstations,
  windows admit light without losing shelter.
- Add building previews and placement rules that understand local radial frames.

Acceptance:

- A player can build a small functional house with a door, roof, bed, chest, fire, and
  workbench. The game recognizes it as shelter and grants practical benefits, and the
  surrounding camp can support preserved food and cached-provision prep before longer trips.

### Cycle 3: Natural Arches, Caves, and Water Rules

Purpose: make the planet naturally explorable below and through the surface.

Status: first foundation implemented. Default terrain now has a deterministic near-surface
void field that can carve natural arches, dry caves above sea level, and sea caves near
shoreline water. The column collision and chunk mesher both read the same void rules, so
generated caves are visible spaces with floors, ceilings, and walls instead of decorative
markers. Edits materialize from the cave-aware default column, which keeps natural voids
intact when the player mines or builds nearby. The first cave resource chain is now in:
rock mined beside dry and sea-cave voids can drop glow crystals, and a lantern plus glow
crystals crafts the echo lantern for reading nearby cave resonance. The first cave-pressure
pass is also in: dark dry caves and sea caves raise exposure and slow stamina recovery, while
lanterns, echo lanterns, and warmth mitigate the pressure. The first cave-mouth visibility
pass is now in: real generated arch/dry-cave/sea-cave voids can surface as routeable mouth
signals with clearance, depth, flooded state, visible surface cairns/ribs, Route Slate cave
pins, echo-lantern readback, and debug/text state. The first cave-anchor pass is now in:
crystal-tuned anchors can be placed near cave mouths, set with `R`, save the cave kind,
depth, clearance, flooded state, and target tile, and render as a rope, stone, and crystal
marker. The first sealed spring pass is now in too: some dry caves carry deterministic
freshwater seeps that are not sea-flooded, surface as spring cave mouths in Route Slate,
echo-lantern, cave-anchor, and debug readbacks, render with a small blue seep marker, and
let nearby rain cisterns collect clear-weather water for inland cave camps and gardens.
The first cave-resonance discovery pass is now in: entering a real dry or sea cave with an
echo lantern can read a deterministic chamber echo, save the one-time observation, pay a
small glow-crystal reward, and surface the echo in Route Slate, Hearth Journal, F3/debug,
and text readbacks. The avatar packet for this pass should include echo-lantern listening,
hand-to-wall or hand-to-ceiling reading, crystal-pocket reward, and notebook-mark gestures.
The next Cycle 3 work is richer entrance composition, more cave materials, cave hazards, and
deeper water connectivity beyond this first spring/sea-cave split.

Scope:

- Add a seeded void field over tile/layer space, not just player edits.
- Generate dry caves above sea level, wet caves below sea level, sea caves connected to
  coastlines, mountain arches, skylight shafts, and occasional land bridges.
- Classify water by connectivity: sea-connected cavities flood, sealed cavities can stay
  dry, cave lakes can exist as special local features instead of every low void becoming
  open ocean.
- Add cave materials and hazards: ore seams, crystal growths, mushrooms, glow lichen,
  loose rock, darkness, cold, flooding, and hidden exits.
- Ensure far view and chunk streaming degrade gracefully: caves do not need to appear on
  the far proxy, but entrances and arches should read from flight distance.

Acceptance:

- The player can find a natural arch, pass under terrain, enter at least one dry cave,
  find a wet/sea cave near a coast, and mine cave-specific resources.

### Cycle 4: Food, Farming, Fishing, and Ecology

Purpose: make survival rhythmic without making it chores.

Status: first foundation implemented. Food item ids now cover berry seeds, berries, raw
fish, cooked fish, camp meals, compost, and trail rations. Crop plots can be planted,
tended to visible maturity, fertilized with compost, irrigated by rain cisterns, harvested
for berries/seeds, and saved as placed-prop state. The first crop-condition pass
is now in: plots report dry/open/protected/warm/cold/storm conditions, wait when they lack
nearby water, light, warmth, or storm cover, and give protected watered gardens a modest
harvest bonus. The first fertility pass is in: compost bins convert kelp, berries, cave
mushrooms, or raw fish scraps into compost, fertile plots can push through dry soil, grow
faster, and spend fertility into stronger harvests. The first irrigation pass is in: rain
cisterns catch mist, rain, and storm water, and nearby dry plots can spend stored water to
grow away from shore. Fishing rods open a shore-cast
fallback when no nearby prop is in reach, dock segments turn placed shoreline building into
stronger local casts, and lit campfires cook raw fish or combine cooked fish with berries
into camp meals. The first fish-school pass is now in: berry bait improves shore casts, fish
schools vary by tile/time/weather/dock context, storms create stronger runs, dockside runs
steady local catches, and sea-cave water can produce richer catches. The first
passive fish-trap pass is now in: workbench-crafted traps made from wood, sticks, and kelp
can be placed at shores, docks, or sea-cave water, optionally baited, checked after in-world
time passes, blocked from packing while set, saved as prop state, surfaced in Route Slate,
Hearth Journal, F3/debug, `__world.structures()`, and `render_game_to_text`, and carried as
a visible avatar prop. The first shore-net ecology pass is now in too: reed-and-stick shore
nets can be crafted at the workbench, set at shore, dock, or sea-cave water, combed after a
shorter soak than traps, and hauled for raw fish plus waterline scraps such as bait, reeds,
or kelp depending on the local fish school. Nets save their set/check state, block pack-up
while set, render as a visible reed lattice with floats and catch hints, appear in Route
Slate fish pins, Hearth Journal next goals and field notes, F3/debug, `__world.structures()`,
`__world.stats().food`, and `render_game_to_text`, and add a distinct camp chore from baited
traps. The first preserved-food pass is now in too: drying racks preserve raw fish with kelp or snow herbs
into trail rations, which count strongly in expedition prep and recovery. The first home
provision-cache pass is in as well: root cellars store trail rations, camp meals, cave
mushrooms, snow herbs, berries, or kelp as saved home provisions that Route Slate counts as
staged expedition food. The first forage pass is also in: `R` can gather
wild berries, cold-ridge snow herbs, shore kelp, dry-cave mushrooms, and sea-cave kelp when
no higher-priority prop, landmark, or fishing action is available. The first reed-bed crop
variety pass is now in: shore and tide-domain forage can cut reeds, waterline crop plots
can plant reed slips, reed beds tolerate storm/cold waterline conditions better than berry
plots, harvests produce reeds and bait scraps, reeds can compost, wrap drying-rack fish into
trail rations, and craft a lighter reed fish trap. The first
expedition-pressure pass is now in: weather, stamina, exposure, packed food, and warm
functional shelter recovery are saved and visible in HUD/debug state. Bedroll rest and
collapse recovery now tie the pressure loop back to functional homes by sleeping or waking
to dawn and restoring more stamina/exposure when the home is weather-safe or fully alive.
Weather vane watching now turns bad weather into an active home decision too: storm, rain,
cold, and soaking weather can be waited through from a protected home, feeding the Hearth
Journal and Route Slate after time advances. The first preserved-meal effect pass is now in:
lit campfires combine camp meals, trail rations, and cave mushrooms or snow herbs into
expedition stew; eating one grants timed trail focus that reduces cave, weather, and
long-flight pressure while it lasts, saves with survival state, and appears in Route Slate,
Hearth Journal, HUD/debug, and the avatar prop contract. The first home-supper effect is in:
root-cellar provisions can now be spent automatically by a stocked functional home bedroll
after dawn rest, converting farm/fish/forage prep into a comfort-scaled trail-focus window
for the next expedition while leaving the remaining cellar count visible in the Hearth
Journal and Route Slate prep surfaces. The first waterline-route balance pass is now in:
ready fish traps and shore nets count as capped staged resupply for far or planetary
expeditions, with an active fish run adding a small confidence bonus. The stricter
route-adjacent staging pass is in too: the plan now counts only ready waterline gear at the
route origin, destination, or active great-circle corridor, while ready off-route gear stays
visible as ignored prep instead of quietly becoming food. The Route Slate target row keeps
that waterline detail visible even when route candidates become selectable, and
`npm run proof:e4-ecology-route` proves off-route ignored gear, unready route gear, and
ready route-adjacent gear across desktop, laptop, tablet touch, phone touch, and synthetic
gamepad. The arrival-spent source pass is now in as well: when a saved Horizon Chart route
is completed, the eligible route-adjacent fish trap and shore net are cleared and counted as
checked without awarding duplicate inventory, while distinct off-route ready gear remains
set and ready. The organic proof pass now searches valid route-adjacent and off-route shore
tiles, places fish trap and shore net props for both source classes through the runtime
placement path, sets them through `useStructure`, advances time until all four are ready,
hauls a restored route-pair copy for raw fish while leaving off-route gear ready, and then
restores the ready state to prove route arrival consumes only the route-adjacent source
class. The next Cycle 4 work is net ecology tuning, deeper food effects, more cave/flight
expedition food variety, and landscape-device route-food smoke.
The Avatar Kit entry for this food-expedition slice includes expedition meal bowls or
wrapped stew pots, ration pouches, drying-rack bundles, water jars, hand-to-mouth eat loops,
cook/stir/pack poses, home-supper bowl/ration variants, dawn departure pack-up poses, and
fish-trap carry/set/haul poses with bait pouch and raw-fish handoff variants, plus reed
bundle carry, kneeling reed-planting, reed-cutting, and wrap-binding poses with stowed
backpack variants, plus shore-net carry/set/comb/haul poses with a coiled reed net, float
line, wet-net shake, waterline scrap handoff, and stowed shoulder-lash variant so preserved meals and food effects are visible on the player
instead of only appearing as counters.

Scope:

- Add hunger/stamina lightly enough that exploration is guided, not punished.
- Add crop plots that care about soil, water adjacency, light, temperature/elevation,
  weather exposure, compost fertility, and stored rain-cistern irrigation.
- Add crops and forage: berries, grains, reeds, snow herbs, cave mushrooms, kelp.
- Add composting as the farm-house bridge: forage scraps, kelp, mushrooms, and fish waste
  should feed crop fertility instead of becoming dead-end inventory clutter.
- Add rain capture as the weather-farm bridge: cisterns should make storms useful, let
  inland homes support gardens away from shore, and create a reason to read weather before
  planting.
- Add fishing rod, traps, nets, bait, fish schools, tide/shore zones, cave fish, cooking
  recipes, preserved trail food, and root-cellar provision caches for cave or flight
  expeditions.
- Add animal or creature hints only where they serve the loop: small ambient life first,
  dangerous wildlife later.

Acceptance:

- A player can establish a food source near home, fish from shore or a dock, cook meals,
  preserve trail rations, cache home provisions, and prepare food for longer cave/flight
  expeditions.

### Cycle 5: Planetary Travel and Logistics

Purpose: make distance meaningful on a tiny planet.

Status: first navigation reward implemented. Awakening the first pentagon grants a saved
Horizon Chart travel item. Pressing `M` reads the nearest still-unknown pentagon, its
great-circle distance around the sphere, and a local turn direction relative to where the
player is facing. The chart now also produces a prepared-expedition checklist from current
food, rest, home shelter, tools, light, weather, and plane readiness, so distant pentagons
start asking the player to build and pack before leaving home. The first return-home
navigation pass is also in: the Hearth Beacon gives the player a homeward distance and turn
label from anywhere on the sphere once they have made a lit home. The first Route Slate pass
now folds the chart target, home beacon, nearby cave signal, storms, fish runs, and forage
into ranked pins when the player presses `M`. The first persistent-marker pass is now in:
craftable waystones can be placed, attuned with `R` to home/cave/shore/forage/survey context,
saved with placed-prop state, rendered with a readable glyph, and folded back into Route
Slate as distance/turn pins. The first visible-route pass is also in: the best remote route
target now draws a terrain-hugging ribbon of dashes toward chart targets, home beacons,
waystones, or nearby off-tile caves. Pentagon insights now feed the travel checklist and
Route Slate, so discovered mysteries can lower specific expedition burdens such as packed
food, storm timing, tool confidence, shelter confidence, or cave-light readiness. The first
weather-vane pass now gives homes and camps a physical storm-timing instrument: reading a
placed vane stores its local forecast and can satisfy storm prep in the expedition checklist.
The first root-cellar pass gives homes a physical expedition-cache surface: stocked cellar
provisions count toward Route Slate packed-food readiness without pretending every staged
meal is already in the backpack. The first
domain pin pass is also in: standing near a pentagon domain adds a Route Slate place-reading
pin before or after the landmark is awakened. Cave mouths now feed the same route surface:
nearby generated cave entrances report mouth/depth/clearance/flooded state, draw visible
markers on the terrain, and can become the route ribbon target. The first cave-anchor pass
adds a saved expedition marker between transient mouth readings and generic waystones:
anchors remember the specific cave mouth they were set against, appear as Route Slate
`caveAnchor` pins, and can own the route ribbon as a planned return path. The first Skyfall
world-event pass now gives the sphere a timed moving opportunity: each day window lands one
visible emberfall, glass-rain, or starbloom crater, Route Slate and the route ribbon can send
the player toward it before it cools, `R` gathers a one-time practical reward, and saved
progress remembers which falls were harvested. The first Skyfall sky-omen pass makes those
falls readable before arrival: each active fall carries a named high-altitude omen, the
Route Slate and Hearth Journal call out that sky cue, debug state exposes it, and the
renderer draws a tall translucent trail and halo above the impact tile for travel and orbit
readability. The Avatar Kit entry for this pass should add a sky-glance or hand-shade pose,
held shard/glass/seed variants, and a small chart mark that lets the character record the
omen without turning it into ordinary loot. The first World Murmurs pass now adds
observation-only wonder events: each day window places a few wind-thread, tide-bell,
root-whisper, cave-breath, or star-glass signals, Route Slate and the route ribbon can point
to an active one, `R` listens close-up, and saved progression remembers the note without
turning every mystery into loot. The player-character packet for this pass should include a
map/echo-lantern listening pose and any small hand prop needed to make quiet observation
read on screen. The first Hearth Journal pass now gives the player a persistent in-game
memory surface: `J` gathers home quality, survival pressure, food stores, garden status,
Route Slate prep, pentagon progress, domain resources, Skyfall, World Murmurs, caves, fish,
and forage into short next-goal notes without requiring the debug overlay. The first saved
route-plan pass is now in too: `P` pins the current best non-planned Route Slate target,
`Shift+P` clears it, the planned path persists through save/export/import, becomes a high
priority Route Slate pin, owns the route ribbon until arrival or clear, and appears in the
Hearth Journal as an intentional trip rather than a transient suggestion. The Avatar Kit
entry for this travel-planning slice should add a chart-marking or map-pin hand prop,
planned-route chalk/thread marks, a deliberate point-and-fold chart pose, and a backpack
variant that can visibly carry the chosen route plan. The first orbit-atlas pass now turns
the zoomed-out planet into a map surface: the route renderer keeps the walking-scale surface
ribbon, then adds high-altitude atlas dashes plus origin and destination halos when the
camera pulls toward orbit. Diagnostics expose both surface and atlas counts so route overlay
readability can be validated in desktop and mobile screenshots. The Avatar Kit entry for
this atlas pass should add an orbit-chart prop, a broad two-handed map-reading pose, and a
pack strap or folded-chart variant that makes planned long trips visible on the character.
The first multi-leg itinerary pass is now in: `P` can create a saved route line from the
current ranked route candidates, later `P` presses append new distinct stops, Route Slate and
the Hearth Journal name the active stop count, the route ribbon follows only the unfinished
stop, arrivals advance or complete the line, and save/export/import preserve reached and
unreached legs. The Avatar Kit entry for this itinerary slice should add a route-string or
folded-map prop with visible stop knots, plus a quick "mark reached / choose next" chart
gesture that reads even when the HUD is reduced for phone or gamepad play. The first
Stranger Season forecast pass is now in too: Skyfall windows and World Murmur windows are
read together as current/upcoming overlap windows, Route Slate adds a Stranger Season pin,
the Hearth Journal records the season as a next-goal and field note, and diagnostics plus
`render_game_to_text` expose the same forecast for desktop, mobile, and gamepad validation.
The first derived chain payoff is now in as well: when a player harvests the active fall and
listens to at least one overlapping Murmur, the season becomes linked; hearing all three
overlapping notes upgrades it into a full season chord. This is deliberately derived from
the existing saved Skyfall harvest and Murmur observation histories, so import/export and
reloads preserve it without a new save bucket. The first practical planning effect is also
in: a linked season can stand in as route memory when the Horizon Chart has no active target,
and a full season chord can remove one long-route food requirement when no food insight
already does. The first seasonal route-line pass is in too: during an active Stranger Season,
the route system can generate a dedicated fall-plus-note itinerary from the current fall and
remaining unobserved Murmurs, make that itinerary own the route ribbon, persist it through
the existing route-plan save path, and keep the Horizon Chart free for non-season trips once
the window is no longer urgent. Seasonal fall and note stops now advance on the matching
season action, not on arrival alone: gathering the planned fall moves the itinerary to the
next note, and listening to planned notes can continue the route line until the chord is
complete. Completing that full seasonal itinerary now grants season chord focus, a long
trail-focus window and small recovery bump that makes the next expedition easier without
turning the event into a plain loot box. The first season-afterglow consequence is now in:
a completed full chord leaves a low, readable chord-ring at the fall crater, promotes it
through Route Slate, route ribbon, Hearth Journal, save/export/import, F3, and
`render_game_to_text`, and lets the player read it once for trail focus, stamina, and
exposure relief. The next Cycle 5 work should deepen those chains into stronger sky/ground
tells, event rewards that change later windows, and a few routes where choosing the quiet
note matters as much as chasing the fall.

Scope:

- Keep the plane central, but support non-flight travel too: paths, bridges, docks, boats,
  gliders/parachutes, cave shortcuts, and landmark navigation.
- Add expedition prep: cargo limits, portable camp kit, repair supplies, food, bait,
  torches, and spare tools.
- Add world events that move around the sphere: storms, fish migrations, meteor showers,
  drifting cloud shadows, rare bloom seasons, and visible smoke/light signals.
- Add maps that respect the sphere: local chart, horizon markers, pentagon bearings,
  route pins, orbit-view discoveries, and route-atlas overlays that are useful from the
  camera's whole-planet view.
- Extend character props and animation states for travel readability: packed camp kit,
  glider/parachute harness if added, boat/oar pose if boats ship, climbing/ledge motion if
  cave traversal needs it, sky-glance and hand-shade poses for Skyfall omens,
  fallen-star shard/glass/seed collection poses, orbit-chart reading, seasonal route-string
  or note-knot props for fall-plus-listening itineraries, and weather-reactive posture for
  storms or cold.

Acceptance:

- The player can plan a trip from home to a distant visible target, travel there by one
  of several methods, gather something unique, and return with a story.

### Cycle 6: The Twelve Pentagons

Status: first foundation in progress. The twelve degree-5 tiles are now treated as stable
planetary landmark ids with procedural shrine markers, save-backed discovery state, HUD/debug
progress, one-line clues, and practical rewards. The first pentagon still grants the Horizon
Chart, and every pentagon now has a named insight, themed inventory reward, debug/text
readback, Route Slate pin, and expedition-planning effect. Hearth, tide, root, stone, cave,
storm, weather, and horizon readings can make specific routes easier to prepare for without
turning mystery into a generic stat bonus. The first local-domain pass is now in too: nearby
land around each pentagon reports a distinct signature such as warm-ring ground, salt-tide
shore, root-vault hollow, red-stone scree, snow-dial slope, storm-seat air, reed-water hollow,
or deep-bell stone. These domains have colored shrine halos, HUD/debug/readback state, Route
Slate pins, and first mechanical touches in weather, fishing, and forage. The first tangible
resource-site pass is now in as well: each pentagon owns three deterministic local resources,
with dormant props before awakening, visible harvestable props after discovery, practical
item rewards, Route Slate resource pins, save-backed one-time collection, and debug/text
readback. The first resource asset-readability pass is now in too: domain resources no
longer lean on one shared shard cluster for every strange reward. Hearth coal, rain reeds,
salt shells, lamp prisms, root pods, red stone nodules, snow blooms, glass panes, storm
amber, kelp tangles, bell-rib crystals, and horizon vanes now have distinct renderer
silhouettes, semantic mesh names, and `domainResources().renderer` diagnostics for kind and
silhouette counts. The first landscape-geometry pass is now in: every pentagon has a stable
landscape profile, distinct silhouette, apron, radial terrain ribs, marker forms, and crown
geometry so the site reads as a place in the land before the player stands on the shrine.
Renderer diagnostics expose the twelve landscape profiles and their mesh contribution for
desktop/mobile validation. The first expedition-site contract is now in too: each pentagon's
landscape profile produces a distinct site affordance such as a hearth niche, rain-reading
blind, salt dock cut, lantern lookout, root shelter hollow, red scree cut, snow-clock step,
glass terrace, storm blind, reed spring line, deep-bell throat, or last-bearing gate. These
site contracts appear in Route Slate, Hearth Journal, F3, text diagnostics, and repeat
landmark reads, giving the player a concrete build/carry/read hint without spending the
remaining mystery. The first physical binding pass is now in: site plans evaluate nearby
structures and carried kit, report missing/ready/complete state, persist completed sites in
the save boundary, and pay one-time practical rewards when a prepared player rereads the
landmark. The first threshold-landform pass is now in too: every site owns a sealed/open
threshold such as hearth arch, rain pocket, tide underpass, lantern skylight, root room,
scree cut, snow terrace, glass terrace, storm pocket, reed spring mouth, deep-bell chamber,
or horizon gate. These thresholds have renderer meshes, Route Slate/Journals/readback
language, and open-state diagnostics tied to site completion. The renderer direction is
terrain-first: scree and storm thresholds use low slabs, bowls, stones, and wind ribbons
instead of tilted crystal-gate shapes unless the site fiction explicitly calls for a true
gate. The first threshold asset-readability pass is now in: the renderer replaces the most
generic threshold forms with named terrain nouns such as hearth posts/lintels/footstones,
tide crawl floors/waterlines/ribs/low roofs, red-scree floor cuts/walls/seams, and horizon
return pads/sightlines/vanes. These parts carry `assetRole` metadata and renderer
diagnostics expose `thresholdAssetRoles`, giving future DAG/reviewer lanes a measurable way
to reject vague threshold geometry before it spreads. Opened thresholds now also produce
first local effects: homeward warmth, weather shelter, tide fish runs, route sightlines,
root forage, tool passes, cold rest, storm watching, spring-water approaches, cave
listening, and return-route steadiness feed survival pressure, route prep, fishing, forage,
and diagnostics. The first terrain-native threshold pass is now in: completing a
site carves a small save-backed terrain mouth, pocket, shelf, hollow, or gate near the
opened threshold, avoiding existing placed structures where possible and rebuilding the
affected chunks through the same column-edit path as player mining. This proves pentagon
thresholds can change the real traversable land instead of only adding markers or stats. The
first threshold-chamber reading pass is now in too: each opened threshold exposes a one-time
nearby chamber, alcove, crawl, shelf, hollow, seep, throat, or gate-slot note with a small
practical reward, saved observation state, Route Slate pinning, Hearth Journal progress,
F3/readback diagnostics, and enough ambiguity to feel discovered rather than fully
explained. The first larger threshold-space proof is now in too: the First Hearth threshold
opens a wider walk-under underpass with 20 carved terrain cells across 5 tiles, the Deep
Bell threshold opens a 24-cell chamber across 4 tiles, high-clearance land arches become
routeable Route Slate signals, and `npm run proof:d2-caves` captures desktop and phone
screenshots for both sites while proving threshold reads and rewards. The next Cycle 6 work
should extend this authored-space standard to the other pentagons: larger cave mouths or
sealed chambers that belong to specific sites, weather pockets with stronger localized
behavior, buildable terraces, traversal constraints, and a few stranger one-off discoveries
that should remain partly unexplained even after they become useful.

The Avatar Kit entry for Cycle 6 should design the authored player model around landmark
approach and discovery. Add a landmark approach stance, hand-on-stone or rune-tracing pose,
journal-sketch/chart-marking pose, cautious look-up idle for tall silhouettes, and small
held or stowed mystery props tied to each pentagon family. The site-contract layer adds
more readable prop work: dock-and-rack planning marks, weather-vane sighting, cave-anchor
listening, waystone alignment, cistern/spring checking, and protected-shelter inspection.
The packet should name the hand, backpack, belt, and journal sockets these props use; define
held/stowed/world forms; and make sure the full-body player model, fallback geometry, and
animation set can show awe, careful study, preparation, and return visits without turning
every pentagon into a normal resource node. The threshold-chamber reading verb adds a small
but important animation target: a crouched threshold-inspection pose, hand-to-stone or
hand-to-air listening variant, quick journal note mark, and small gathered-object handoff
for the chamber reward, all readable on desktop, tablet, phone, and gamepad layouts.

Purpose: give the planet a long-term progression spine without over-explaining it.

Scope:

- Treat the twelve pentagons as rare planetary landmarks.
- Each pentagon should have a distinct surrounding biome signature, cave relation,
  building opportunity, or weather/navigation effect.
- Pentagons can unlock or reveal systems: better maps, weather reading, deep cave access,
  plane upgrades, rare crop knowledge, fish migration tracking, or ancient structure parts.
- The first pentagon should be approachable early. The last few should require prepared
  expeditions and mastery of house, food, cave, and travel systems.

Acceptance:

- At least one pentagon landmark is implemented as a discoverable site with a readable
  mystery, a practical reward, and a reason to revisit.
- Awakened pentagon domains offer visible nearby resources that can be gathered once,
  survive save/export/import, and give the player practical reasons to walk the land around
  the shrine instead of treating it as a one-and-done marker.

### Cycle 7: Planet-Native Life, Hazards, and Combat

Status: first foundations live. The runtime now has staged tree chopping, grounded pickup
drops for trees, mined terrain chips, loose cave crystals, and native-life rewards, four
harmless native-life families, four territorial/environmental native hazards, and a compact
hatchet foundation for chopping and warding. It also has the first Stone Blade defense-tool
hook: a close-control warding tool that shares the existing craft, Pack Ledger, wear,
repair, save, prop, and avatar-socket systems without increasing normal mining/build reach.
It now has the first Reed Bow ranged-ward hook too: whistling arrows scare bramblebacks
before they crowd the player, spend ammo, wear the bow, save state, and use grounded rewards
without creating enemy farming. It now has the first combat-capable native loop too:
scree-snappers telegraph a jaw-plate snap, punish loud nearby mining, and can be stunned
once with blade, axe/hatchet, or whistling arrow before fleeing under rock. Storm burrs now
prove the weather-bound hazard variant too: they only auto-pressure during storm, rain,
cold, or soaked weather and can be grounded with a Storm Cloak brace, blade, axe/hatchet,
or whistling arrow. Tide lurkers now prove the sea-cave fishing hazard variant too: they
spawn near actual sea-cave mouths, can be stirred by successful cave fish casts, and can be
startled off with steady lantern light, blade/hatchet/axe, or whistling arrows before
slipping below the tide and scattering fish. Cave blinkers now prove the cave-helper variant:
they sit at actual cave mouths, blink as harmless Soft-Facet mushroom carriers, grant a
short cave-focus breath, surface blink-focus cave-pressure readback, and drop blinkcap
mushrooms through grounded pickups. Native life now also reaches the planning surfaces:
Route Slate can promote nearby active hazards or untended helpers as creature-specific route
work, and the Hearth Journal keeps a native-life field note with visible/tended/warded
counts plus the most important helper or hazard to answer. The first native-defense
animation pass is live too: failed native pressure staggers the Soft-Facet Wayfarer, close
blade/hatchet/axe/light counters use a guarded ward beat, Storm Cloak counters brace into
the weather, and reed-bow counters read as a shot instead of a generic interaction.
Diagnostics expose `characterIntent` through `__world.characterIntent()`,
`__world.stats()`, and `render_game_to_text` so those short action beats can be proven in
browser tests. The first native-life renderer readability pass is live as well: renderer
groups expose nine creature silhouette families, five active hazard families, and named
telegraph roles such as bristle crowding ring, hinged cave jaw lift, lifting scree jaw
plates, flattening storm quills, directional gust arc, rising tide eye bulbs, cupped water
splash arc, and blink rhythm focus ring. F3 and `nativeLife().renderer` report
silhouette/telegraph coverage so screenshots can be reviewed against mechanics instead of
generic danger rings. It still has no generic enemies, health/damage loop, or kill-for-loot
combat. The hatchet, blade, bow, and cloak are intentionally survival tools/sidearms first,
not a combat system by themselves. This cycle should not start by
adding generic combat mobs. It should first make the planet feel alive, then let a small
number of native hazards and tools grow into combat only where the survival loop needs
friction.

Purpose: add life and danger without breaking the cozy survival, building, cave, and travel
core.

Design direction:

- Native creatures use the Soft-Facet Wayfarer art language: low-poly SDF blend-shell
  bodies, goofy silhouettes, faceted normals, shader breathing, squash/stretch loops, and
  modular primitive props such as horns, shells, wool-puffs, reeds, crystals, seed pods, or
  little packs of stolen sticks.
- Harmless creatures come first. Examples: woolly moss-puffs that shed warm fiber, reedback
  grazers that fertilize wet gardens, shell skitters that reveal shore bait, cave blinkers
  that lead toward mushrooms and safer cave air, and tiny storm moths that gather around
  weather changes. They should offer resources through observation, tending, feeding,
  shearing, tracking, or gentle herding before any killing loop exists.
- Aggressive or dangerous life comes later and should be territorial, seasonal, or
  environment-bound. Scree-snappers now wake when mining too loudly, storm burrs charge only
  when bad weather helps them, cave bell-jaws react to lantern light, and tide lurkers now
  wait near sea-cave schools until fishing splashes stir them. Future examples can still
  include thorn herds that are harmless until crowded. The danger should
  teach terrain, sound, weather, light, or preparation rather than simply draining health.
- Combat should be non-generic and small. The first version should be about warding,
  stunning, scaring off, trapping, dodging, and controlling space on a spherical terrain
  tile, not farming enemies for loot. Killing can exist later, but it should not become the
  main progression engine.
- Weapons should grow out of survival tools: a one-handed hatchet for faster staged tree
  chopping and emergency defense, a short blade or sword for close hazard control, a bow
  with reed/wood arrows for pulling or warding creatures at range, and echo/crystal variants
  that interact with caves, sound, or storm behavior. Weapon recipes should share the same
  Pack Ledger, tool-wear, repair-kit, visible-prop, and cross-device input rules as tools.
- Tree chopping should become a staged interaction before this cycle leans on combat. Trees
  should not disappear immediately: repeated chops should show bark chips, trunk crack
  marks, leaf shake, hit sounds, tool recoil, and a final fall/pop state. Hatchets and echo
  axes can reduce the stage count or widen the timing window.
- Ordinary terrain mining should share the same staged language instead of becoming the
  one instant resource action. Dirt, sand, snow, wood, rock, and cave-adjacent rock should
  take repeated visible hits, show darkened crack facets before the cell opens, respect
  shovel/pick/echo-tool speed differences, save partial progress, and only spawn the
  grounded chip reward on the final pop.
- Material rewards should spawn as grounded pickup entities instead of jumping directly into
  inventory. Wood, sticks, fruit, fiber, creature drops, and cave chips should arc or bounce
  out, settle on the hex surface, respect local-up orientation, show a short glint/pulse,
  and then collect by proximity or use after a brief delay. The Pack Ledger should explain
  collected stacks, while debug/readback exposes active drops for tests.

Implementation stages:

1. **Ground Drops Foundation**: create deterministic, save-safe pickup entities for tree
   wood and mined materials; add local-up bounce/magnet animation, pickup readback, and
   browser proof that drops spawn, settle, and collect on PC, touch, and gamepad.
2. **Staged Tree Chopping**: replace instant tree removal with per-tree chop progress,
   visible crack/leaf-shake state, hatchet/axe speed differences, tool wear per hit, and
   final wood/stick drop spawns.
3. **Harmless Native Life**: add four or more ambient creature families with SDF
   blend-shell bodies, idle/wander/flee/tend animations, resource hooks such as fiber,
   compost, bait, or route clues, and Hearth Journal notes that frame them as part of the
   world rather than enemies. Moss-puffs, shell-skitters, reedback grazers, and cave
   blinkers now prove seed, fishing-scrap, compost/farming, and cave-food/focus helper
   variants.
4. **Hazard Pressure**: add one dangerous-but-readable creature or weather hazard that can
   injure stamina/exposure, scare the player away, or force shelter/route decisions without
   adding full combat yet. Bramblebacks, cave bell-jaws, storm burrs, and tide lurkers now
   prove open-ridge, cave-mouth, bad-weather, and sea-cave fishing pressure variants.
5. **Weapon and Defense Tools**: add hatchet, sword/blade, bow, arrows, and defensive
   animations to the existing item, crafting, equipment, tool-wear, repair, audio, and
   input systems. The Stone Hatchet foundation is live as the first compact chop/ward tool;
   the Stone Blade foundation is live as the first close-control defense tool; the Reed Bow
   and Whistling Arrows foundation is live as the first ranged warding tool/ammo loop.
   The first procedural ward, bow-shot, storm-brace, and hazard-stagger poses are live;
   authored animation polish, audio, and deeper creature-facing combat rules remain future
   work. Keep gamepad/touch controls explicit before any enemy logic depends on them.
6. **First Native Combat Loop**: add one small combat-capable creature with telegraphed
   wind-up, readable hit/stun/flee states, terrain-aware movement, non-spammy rewards, and
   a reason to exist near a cave, storm, pentagon domain, or food route.

Future native-creature and combat roadmap:

- Treat every creature as a small planet-native character, not a reskinned enemy. Each new
  family needs a Soft-Facet model recipe, idle loop, local-up locomotion, startled reaction,
  interaction pose, reward/drop animation, audio cue, Journal/Route Slate readback, and one
  screenshot proof before it counts as done.
- Keep harmless useful neighbors ahead of aggressive additions. The "sheep" slot for this
  world should be goofy and useful: graze gardens, shed fiber or warm moss, leave compost,
  follow bait, reveal safe cave paths, or huddle before weather changes. Tending, brushing,
  feeding, shearing, herding, or guiding should be the verbs, with rewards spawned as
  grounded pickups rather than silent inventory grants.
- Add dangerous life as planet pressure with personality. Aggressive creatures should be
  anchored to a reason: a cave mouth, under-arch tunnel, wet cave pool, storm ridge,
  pentagon threshold, migration crossing, nest, or resource claim. They can be genuinely
  dangerous, but they should teach a readable rule about light, sound, weather, water,
  height, route timing, or tool preparation.
- Use a small state machine before any health-bar system: calm, curious, wary, telegraphing,
  pressuring, warded, stunned, fleeing, sleeping, tended, or befriended. The default answer
  is not "reduce HP to zero"; it is observe, choose the right tool, spend stamina/ammo/light,
  control space, then decide whether to gather, pass, herd, scare off, or retreat.
- Grow weapons out of survival tools. The hatchet stays a fast chopping and emergency-guard
  tool; the blade/sword stays close-control hazard management; the bow stays a ranged
  sound/pressure tool before it becomes lethal. Future combat can add stronger variants,
  but each variant must still live in crafting, Pack Ledger, tool wear, repair kits,
  sockets, animations, audio, touch, and gamepad controls.
- Generalize staged breaking beyond trees. Trees already crack, shake, and drop wood in the
  world; rocks, cave chips, nests, thorn clumps, shells, and creature gifts should use the
  same readable sequence: repeated action, visible damage or response, final pop/fall, local
  arc, bounce/glint, short pickup delay, and proximity collection.
- Let caves and arches change encounters. A creature under an arch can block a route without
  blocking the whole world; a cave hazard can care about lantern angle, echo tools, or water
  depth; a harmless helper can lead the player to a dry pocket before water pressure takes
  over. These systems should make the spherical cave/arch terrain matter more than a flat
  arena would.
- Leave room for wonder. Some native life should be named only after the player observes it,
  some migrations should cross the horizon before their purpose is known, and a few props or
  dropped objects should feel ceremonial or strange instead of immediately useful.

First foundation pass: tree chopping now uses per-tree progress, visible trunk/leaf damage,
tool-speed differences, tool wear per hit, and grounded wood pickups that bounce/glint
before auto-collecting near the player. That same drop/readback/save/render pattern is now
the common reward spine for creature gifts, hazard rewards, and ordinary resource work.

Mined material drop pass: ordinary terrain mining now spawns grounded pickup chips instead
of silently adding materials to inventory. Dirt, rock, sand, snow, and wood chips appear on
the mined hex with the existing local-up bounce/glint animation, wait through the same short
pickup delay, save as `source: mine`, and then enter the Pack Ledger through proximity
collection. Rock mined beside dry or sea caves also loosens glow-crystal pickups through the
same path, so cave parts read as physical finds rather than invisible grants. This closes
the first Ground Drops Foundation loop across trees, terrain mining, cave chips, and native
life while leaving staged breaking for rocks, nests, shells, and other future nodes as a
separate polish layer.

Staged terrain mining pass: ordinary terrain cells now crack before they pop. Soft soil,
sand, and snow take a short two-hit sequence, wood takes a middle sequence, and rock takes
the longest sequence unless the player carries a matching pick or echo tool. Partial mining
progress is save-backed, visible as darker cracked mesh facets in resident chunks, exposed
through `__world.mineProgress()`, `__world.stats().mineProgress`, diagnostics, and
`render_game_to_text.inventory.mineProgress`, and cleared only when the final hit edits the
column and spawns the grounded chip/cave-crystal reward. This moves rocks and cave chips out
of the "future staged breaking" bucket while leaving nests, shells, thorn clumps, and
ceremonial creature gifts for later polish.

Pickup handoff polish pass: collected world drops now trigger a short avatar pickup action
instead of only changing inventory and HUD text. The procedural Wayfarer bends toward the
ground, scoops with both arms, and briefly shows the primary collected item prop in hand;
resource-drop diagnostics also keep the last pickup message for browser and text proof.
This gives tree wood, mined chips, cave crystals, fish, compost, and future creature gifts a
shared physical reward beat before the authored character model and bespoke creature-facing
handoffs replace the fallback pose.

Harmless native-life foundation pass: moss-puffs now appear deterministically on grassy
forest-edge hexes as Soft-Facet primitive creatures with bobbing, seed burrs, small feet,
and a harmless grazer read. A nearby player can use the normal world-use action to gently
brush one once, saving that tend state and spawning berry-seed pickups through the same
grounded drop system as tree wood. This proves the "useful neighbor before resource node"
direction without adding killing, damage, or enemy loot pressure.

Second harmless native-life pass: shell-skitters now appear deterministically on sand
waterlines as tiny Soft-Facet shore creatures with domed shells, skitter legs, feelers, and
visible bait/kelp scraps. A nearby player can coax one once through the same world-use path,
save the tended state, and spawn bait scraps or tideline kelp as grounded pickups. This
gives the shore and fishing loop a living neighbor without turning shore creatures into
generic enemies or loot sacks.

Third harmless native-life pass: reedback grazers now appear deterministically on wet grass
near natural water as sheepish Soft-Facet farming helpers with reed manes and visible compost
pellets. A nearby player can scratch one once through the same world-use path, save the
tended state, and spawn compost as grounded pickups. This ties native ecology directly into
crop fertility and gardens instead of letting native life only support seeds, fishing, or
combat prep.

Fourth harmless native-life pass: cave blinkers now appear deterministically at actual cave
mouth columns as sleepy Soft-Facet cave helpers with huge glowing eyes, antennae, tiny feet,
a mushroom pack, and a soft focus ring. A nearby player can match the blink rhythm once
through the same world-use path, save the tended state, spawn cave-mushroom pickups, and
gain a short cave-focus breath with a small exposure relief. Cave pressure readbacks now
name that blink focus while the survival system uses the existing trail-focus multiplier
to soften dark-cave exposure, making the helper's effect legible in HUD/F3/debug output.
This gives cave routes a friendly native before and beside the hazards, so caves can feel
strange and generous without turning every cave-mouth encounter into combat.

Native-life route/journal readback pass: nearby active hazards and untended harmless helpers
now become planning information rather than only renderer/debug state. Route Slate can pin a
combative or territorial creature above local cave/resource work when it needs an answer,
naming the telegraph, tool/light/weather weakness, direction, and grounded reward. Harmless
helpers show as nearby opportunities with their tending verb and gift. Hearth Journal adds
an explicit native-life field note with visible/tended/warded counts and promotes "Answer
native hazard" or "Tend native helper" into next actions when the local ecology matters.
This is the first readable bridge between Soft-Facet creature animation, non-generic combat
states, and the player's ordinary planning loop.

Native encounter route-guide pass: native hazards and helpers are now route-guide candidates
instead of only Route Slate text. An unresolved local hazard can take over the route ribbon
even during an active Stranger Season, so the world points at the immediate creature problem
before it asks the player to chase distant skyfall or murmur work. Pressing `P` while that
native encounter leads the guide now pins a single saved native route stop rather than mixing
it into a seasonal itinerary. This makes creature pressure actionable on the sphere: see the
warning, read the counter, follow the local ribbon, then ward, tend, or deliberately leave.

Hazard pressure foundation pass: bramblebacks now appear deterministically on open grass and
snow ridge hexes as squat Soft-Facet territorial grazers with shell backs, thorn reeds, tiny
feet, horns, and a warning ring. Standing too close to an unwarded brambleback creates a
small survival hit instead of an abstract health fight: stamina drops, exposure rises, HUD
and diagnostics record the rattle, and existing collapse/recovery rules remain the failure
path. A nearby player can ward one through the normal world-use action if prepared with an
axe, lantern, echo lantern, or storm cloak; the warded state saves, and thorn-reed rewards
spawn as grounded pickups. This proves danger, preparation, and reward without shipping a
generic enemy or weapon-combat loop.

Second hazard pressure pass: cave bell-jaws now appear deterministically at actual dry and
sea-cave mouth columns, keeping the danger tied to the cave system instead of spawning
random enemies. They read as goofy hinged Soft-Facet snap hazards with shell jaws, eye
stalks, glowing tongues, tiny hinge feet, shell ridges, and a warning ring. Crowding an
unwarded bell-jaw creates a stamina/exposure slap and clear HUD/readback pressure; warding
requires lantern light, an echo lantern, or a Stone Blade. A warded bell-jaw folds back into
the lit cave seam, saves that state, and drops glow-crystal shards through the grounded
pickup system. This gives caves a native pressure lesson around light and close-control
prep without adding health bars, corpses, repeat farming, or a generic enemy role.

Stone Hatchet foundation pass: a compact workbench-crafted hatchet now exists as the first
Cycle 7 tool/sidearm. It crafts from one stick and two rocks, has lower reach and durability
than the full stone axe, swings quickly, contributes to staged tree chopping, tracks saved
tool wear, appears in the Pack Ledger, shows as a small one-handed avatar prop/back prop,
counts for axe-prep site-work contracts, and can ward bramblebacks through the existing
world-use action. This proves the tool, prop, save, readback, and hazard-prep chain before
the cycle adds swords, bows, arrows, or any larger combat AI.

Stone Blade foundation pass: a short workbench-crafted blade now exists as the first
dedicated close-control defense tool. It crafts from one stick, three rocks, and one reed,
appears as a visible hand/back prop, records saved wear, shows defense durability in the
Pack Ledger, can be saved by field repair kits, and is preferred when warding bramblebacks.
It deliberately does not increase normal terrain/build reach, keeping "weapon reach" from
quietly becoming better mining. This gives sword/blade combat a production hook before the
cycle adds damage, enemy health, bow aiming, arrows, or ranged hazard rules.

Reed Bow foundation pass: a workbench-crafted bow and whistling-arrow ammo now exist as the
first ranged native-hazard control loop. The bow crafts from sticks, wood, and reeds; arrows
craft in small reed-and-stone batches; the Pack Ledger shows bow durability and arrow counts;
the avatar can carry both; one arrow is consumed per ranged ward; the bow wears and can be
saved by repair kits; and bramblebacks can be spooked before they enter the close pressure
ring. The loop deliberately uses warding, sound, ammo pressure, and grounded reed rewards
instead of health bars, corpses, or repeatable loot farming.

First native combat-loop pass: scree-snappers now appear deterministically on rocky
cave-route scree and make mining noise matter. They read as low, silly Soft-Facet hazards:
stone bodies, lifting jaw plates, tiny wedge feet, shard backs, tail shard, and an amber
warning ring that pulses during the wind-up. Mining rock near one can trigger a stamina and
exposure snap, while a Stone Blade, hatchet/axe, or whistling arrow can stun it once and
make it flee under the scree. The save state reuses native wards, the reward is a grounded
rock-shard drop, and diagnostics expose its telegraph, weakness, and flee result. This is
the first combat-capable loop, but it remains non-generic: no enemy health bar, no corpses,
no repeatable loot farming, and no reason to grind creatures instead of reading terrain.

Weather-bound hazard pass: storm burrs now appear deterministically on open grass and snow
ridges as goofy wind-rolled Soft-Facet hazards with static quills, tiny feet, a spinning
wind arc, and a blue warning ring. They are visible as native life in any weather, but their
automatic pressure only triggers when the current weather is storm, rain, cold, or soaked,
so the danger teaches weather timing and route prep rather than constant ambient damage. A
Storm Cloak brace is the signature close counter, while a Stone Blade, hatchet/axe, or
whistling arrow can also ground one once. The reward remains a grounded reed-fiber pickup,
the save state reuses native wards, and diagnostics expose the quill telegraph, weather
weakness, and tumble-away result.

Sea-cave fishing hazard pass: tide lurkers now appear deterministically around actual
sea-cave mouths as flat, goofy Soft-Facet water hazards with shell backs, eye bulbs, paddle
fins, whiskers, foam crests, a splash arc, and a pulsing tide ring. A successful sea-cave
fish cast can stir an unwarded lurker into a stamina/exposure surge, making cave fishing a
prepared expedition activity instead of only a richer food node. Lanterns and echo lanterns
are the signature close counter, while a Stone Blade, hatchet/axe, or whistling arrow can
also startle one once. The save state reuses native wards, the reward is grounded raw-fish
pickups rather than a corpse or repeat farm, and it does not auto-pressure purely from
proximity in calm exploration. Diagnostics expose its eye-bulb telegraph,
light/sound weakness, and slip-below-the-tide result.

Native defense animation pass: native-hazard counters now drive explicit avatar actions
instead of generic interaction poses. Failed close pressure triggers a goofy stagger with
hands or fishing rod visible, close counters trigger a guarded ward/slash pose with the
ready blade, hatchet, axe, lantern, or echo lantern, storm burr counters trigger a planted
Storm Cloak brace, and reed-bow counters trigger a readable bow-shot beat. Because these
actions can be shorter than the last rendered character frame in headless proof, the runtime
also exposes `__world.characterIntent()`, `__world.stats().characterIntent`, and
`render_game_to_text.characterIntent` as the authoritative short-action readback.

Avatar Kit entry for Cycle 7: the authored survivor needs weapon-ready variants that still
look like a builder, not a generic fighter. Add hatchet carry/chop/guard poses, sword draw
and short warding slash, bow draw/aim/release, dodge or sidestep, startled/flee reaction,
creature-tending/shearing/feeding poses, pickup bend/magnet handoff, and tool recoil. The
procedural fallback now uses the same SDF/squash approach as the Soft-Facet Wayfarer for
pickup, ward, bow-shot, Storm Cloak brace, and hazard-stagger beats. It must keep proving
that creatures, weapons, drops, and HUD readbacks remain readable on desktop, laptop,
tablet, phone, and gamepad layouts.

Avatar Kit delta: Stone Blade. The authored survivor needs a short, chunky stone-and-reed
blade with a goofy but polished silhouette: wrapped grip, small crossguard, faceted chipped
edge, stowed back/belt form, and right-hand warding form. Required animation/pose work
includes a quick draw, guarded sidestep, short warding slash, non-lethal scare-off beat,
and a tool-inspection/readiness pose that can blend out of walking. The procedural fallback
now supplies a visible stone blade prop; future screenshots should prove blade-in-hand,
blade-stowed, brambleback warding, Pack Ledger wear, and compact desktop/laptop/tablet/
phone/gamepad HUD layouts.

Avatar Kit delta: Reed Bow and Whistling Arrows. The authored survivor needs a light,
slightly silly reed bow with a whistle charm, a small back/belt arrow bundle, and a
non-lethal ranged-warding animation set. Required poses include quick nock, short draw,
release, listening-for-the-whistle follow-through, and a cautious sidestep as the creature
backs off. The procedural fallback now supplies bow and arrow-bundle props; future
screenshots should prove bow in hand, arrows stowed, arrow count in the Pack Ledger, a
brambleback scared at range, and compact desktop/laptop/tablet/phone/gamepad HUD layouts.

Avatar Kit delta: Storm Burr and Storm Cloak brace. The authored survivor needs a braced
weather stance that makes the cloak read as a defensive survival tool rather than armor:
feet planted on local-up, cloak shoulder pulled forward, free hand shielding the face, and
a small recoil beat when the burr gust hits. Required creature-facing poses include cloak
brace, blade/hatchet grounding tap, bow pin-and-listen follow-through, and a stumble-recover
reaction for failed wards. Future screenshots should prove the burr, cloak, HUD weather
label, grounded reed-fiber reward, and gamepad/touch use prompts all read together.

Avatar Kit delta: Tide Lurker and cave-fishing startle. The authored survivor needs a cave
cast and splash-recoil beat that keeps the fishing rod readable when the tide hazard wakes:
rod tip tightening, one foot braced on local-up shore rock, free hand pulling a lantern or
blade into view, and a short startled sidestep before the ward answer. Required creature
facing poses include echo-lantern steady-light ward, short blade or hatchet startle tap,
bow whistle-shot into cave water, failed-splash recoil, and raw-fish pickup handoff. Future
screenshots should prove the lurker silhouette, cave fish HUD readback, fishing rod,
lantern/blade/bow counter, grounded fish reward, and compact touch/gamepad prompts all read
together without crowding the playfield.

Avatar Kit delta: Cave Blinker and cave-focus breath. The authored survivor needs a gentle
cave-tending beat that reads differently from combat and forage: crouch toward the blinker,
pause on the blink rhythm, breathe out as the focus ring answers, then bend into the
mushroom pickup handoff. Required creature-facing poses include soft cave-mushroom carry,
lantern-low cave approach, blink-match idle, short exposure-relief breath, and a curious
look-back pose that leaves room for stranger cave helpers later. Future screenshots should
prove the blinker silhouette, cave-mouth placement, focus HUD readback, grounded mushroom
reward, and compact touch/gamepad prompts all read together without hiding cave hazards.

Acceptance:

- A player can see harmless native life, learn what it offers, and gain at least one useful
  resource or clue without combat.
- Trees and simple resource nodes have staged feedback before yielding materials, and their
  drops appear in the world before entering inventory.
- At least one native hazard forces a preparation, movement, shelter, light, sound, weather,
  or route decision without feeling like a generic damage sponge.
- Hatchet, sword/blade, and bow plans are integrated into crafting, equipment sockets,
  tool wear, repair supplies, input mapping, audio/VFX feedback, and the Avatar Kit before
  any larger combat system ships.
- The first combat loop, when implemented, is small enough to validate end-to-end with
  focused sim tests, save tests, desktop/touch/gamepad browser probes, screenshot review,
  and `render_game_to_text` diagnostics for creatures, drops, hit state, and rewards.
- Large slices leave a DAG/reviewer note that names subagent-ready lanes, dependencies,
  merge order, proof artifacts, and any asset-readability failures found during review.
- Creature, prop, marker, shrine, tool, and terrain-wonder assets pass the Asset Readability
  Gate: a screenshot reviewer can identify the gameplay noun and likely verb without relying
  on a hidden implementation note.

## Minimum Vertical Slice

The first full Hearth and Horizon vertical slice should include:

- Save/load.
- Inventory and basic recipes.
- Workbench, axe, pick, bed, chest, fire, door, roof, crop plot, compost bin, rain cistern,
  root cellar, fishing rod, dock segment, drying rack, and trail rations.
- First-pass player character model plan, equip socket map, visible tool/prop set, and
  animation checklist with a procedural fallback path.
- First-pass audio matrix: ambience loop, streamed soundtrack, UI confirm/deny/open sounds,
  and event-driven SFX for crafting, building, gathering, fishing, hearth/rest, cave
  reading, route planning, landmark awakening, and timed planetary events.
- Music handoff proof: The Twelve Bells streams through the `music` gain path instead of
  eager decoded buffers, asset format/budget proof lives at `npm run proof:audio-assets`,
  runtime unlock/stream/mute/subpath proof lives at `npm run proof:audio-music`, and future
  soundtrack changes must keep the album under the browser-streaming budget or document a
  deliberate delivery change.
- Functional shelter recognition.
- One crop chain with fertility and rain-cistern irrigation, one staged-provision cache,
  plus one fishing chain.
- One natural arch and one cave type.
- One cave resource and one cave-crafted item.
- One timed planetary world event that can become a route target and saved harvest.
- One observation-only wonder event that can become a route target and saved note without
  always becoming a material reward.
- One harmless native creature, one dangerous native hazard, one staged resource break, and
  one grounded pickup reward that prove the planet-native life/combat language without a
  generic enemy grind.
- One in-game journal or map-memory surface that summarizes home, route prep, discoveries,
  and current next goals without relying on F3 diagnostics.
- Plane crafting preserved, but integrated into the recipe system.
- One pentagon landmark that hints at the larger planet mystery.

## Architecture Notes

- Keep vanilla Three.js and the current radial world model. Do not introduce a new engine.
- Move survival rules out of `src/main.ts` into simulation modules before the feature set
  grows much further.
- Keep input mapping explicit, especially once inventory, build mode, fishing, farming,
  doors, chests, and pause/menu states exist.
- Use DOM overlays for inventory, crafting, map, pause, settings, and tooltips.
- Keep terrain columns as the source of truth for collision, mining, placement, caves,
  and shelter checks.
- Use anchored prop entities for functional objects that are too small or too semantic
  for terrain cells.
- Add tests around save serialization, recipe validity, structure placement, shelter
  detection, cave generation determinism, and water connectivity.
- For broad work, create a dependency DAG before implementation and split independent lanes
  across subagents where possible: simulation, rendering/assets, UX/input, tests, docs,
  performance, and art-direction review. Merge in dependency order and keep the orchestrator
  responsible for final playability and reviewer evidence.

## Deferred Until Later

Do not start with:

- Complex fluid simulation.
- Multiplayer.
- Automation networks.
- Large combat systems before Cycle 7 proves harmless native life, staged resource drops,
  readable hazards, and one small non-generic combat loop.
- Boss-rush progression.
- Fully simulated ecosystems.
- Massive numbers of creature types before a few Soft-Facet native families are readable,
  useful, animated, and validated.
- Separate dimensions.

These can become interesting later, but they should not distract from home, caves, food,
travel, and pentagon discovery.

## Room for Wonder

Leave some things unnamed until they are encountered in play.

Guidelines:

- Every major biome should have at least one unexplained visual or sound cue.
- The first version of a mystery should be observable before it is useful.
- Not every pentagon needs a literal explanation in the first release.
- Some cave openings should be visible from flight but hard to reach on foot.
- Some lights, sounds, migrations, and weather behavior should imply a larger system
  before the player can decode it.
- Some Skyfall events should be visible or audible before the player understands whether the
  crater is a resource, omen, route clue, or future danger.
- Some World Murmurs should stay useful as notes, bearings, sounds, or memory fragments
  before they become recipes, upgrades, or explicit explanations.
- Keep at least one design slot per cycle for a surprising world feature discovered while
  testing, not decided in advance.

The target feeling is practical survival sitting next to a little uncertainty: a warm
house behind you, supplies in your pack, a strange arch ahead, and the curve of the world
quietly promising that there is more over the next ridge.
