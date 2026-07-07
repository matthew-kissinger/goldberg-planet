# Kiln Pack Adoption Plan

This is the art-direction adoption track for Hearth and Horizon. The promoted Kiln Drop 1
pack is no longer treated as optional reference material. It is the approved runtime art
backlog for replacing janky procedural stand-ins across the world.

The exception is the airplane. The current craftable plane already reads clearly and is a
core traversal object, so it remains an intentional authored/procedural hero asset until a
future approved model demonstrably improves it.

## Adoption Rule

Every `ready` GLB in `public/assets/kiln/models/` must move toward one of these outcomes:

- **Runtime wired**: loaded from `assets/kiln/models/`, normalized in-engine, connected to a
  gameplay noun or verb, and proven with request-path, fallback, screenshot, and budget
  evidence.
- **Runtime dressing**: used as environmental dressing where its original generated purpose
  is not the load-bearing gameplay object.
- **Regenerate**: rejected at the current quality/scale/readability level, with a specific
  prompt or pack-generation requirement.
- **Superseded by stronger code-authored art**: allowed only when the procedural/authored
  object is already more readable or more dynamic, as with the plane and dynamic VFX.

Procedural meshes should become fallback, collider/socket scaffolding, or dynamic overlay
systems. They should not remain the default visual representation for approved pack nouns
without a written reason.

## Runtime Budget Policy

The pack should ship through a low-draw-call runtime, not as dozens of independent cloned
scene graphs. The default implementation target is:

- Reuse the packed palette/vertex-color look with as few shared materials as possible.
- Convert repeated static families into `THREE.InstancedMesh` or equivalent merged batches
  by slug, material, LOD, and state.
- Normalize orientation before pivot/scale/instancing. Any upright family whose exported
  local up axis is suspect must declare an orientation policy, record the source up axis and
  correction, and prove the corrected bounds before it can replace procedural art.
- Keep per-instance transforms, tint, phase, and simple state in instance attributes where
  that is cheaper than unique meshes.
- Use code-authored overlays for dynamic gameplay signals such as glows, route glyphs,
  warmth rings, harvest sparkles, waterline readiness, and warning telegraphs.
- For animated creature GLBs, run `THREE.AnimationMixer` only inside the active animation
  radius. Mid-distance creatures should use cheaper node/pose sampling or low-rate updates;
  far creatures should freeze into a readable idle pose, impostor, or hidden marker.
- Flocking wildlife such as fish schools and birds must be generated as single bodies, not
  mini-scenes. Schools/flocks are runtime systems: one or a few instanced bodies with
  per-instance scale/tint/phase, point or impostor rendering for tiny/far members, and
  distance-banded boids-style simulation only for near/inspectable groups. Mid/far groups
  collapse to cheap path-following, impostors, or hidden migration signals.
- For any animated family, diagnostics must split active, low-rate/frozen, and hidden
  counts by distance band before that family can replace procedural motion.
- Do not widen asset adoption until proof records draw calls, visible instance counts,
  mixer counts, and fallback counts for the affected family.

## Scope

The current promoted pack contains 70 ready GLBs plus 3 unused cave-mouth records. The
adoption goal is to use the 70 ready assets broadly across the game and to revisit the
cave-mouth assets as possible dressing or regeneration references instead of silently
forgetting them.

## Rollout Waves

| Wave | Asset Families | Runtime Owner | Proof Gate |
| --- | --- | --- | --- |
| K0 loader contract | Shared GLB template cache, fit diagnostics, palette/material reuse, instancing policy, distance animation policy, fallback state, and review alignment bench | `src/render/kilnAssets.ts`, `src/tools/kilnAssetViewer.ts`, plus family renderers | Unit tests prove normalization metadata, batching metadata, distance gates, and failed-load fallback for each owner; `npm run proof:kiln-asset-viewer` captures socket-local screenshots for every ready GLB |
| K1 pickups and rocks | `drop-wood-logs`, `drop-ore-chunk` | `ResourceDropRenderer` | Passing first slice: `npm run proof:k1-resource-drops` spawns wood/rock drops, loads committed GLBs, proves 5 batched instances on 5 instanced draw calls, collects into inventory, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K2 harvest nodes | all 12 `node-*` harvest/resource assets | `DomainResourceRenderer`, domain hooks | Passing first slice: `npm run proof:k2-domain-resources` reveals all 36 domain nodes, loads all 12 committed node GLBs, proves 36 batched instances on 33 instanced draw calls, keeps code-owned harvest glows/base overlays, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K3 camp and home props | `campfire`, `bedroll`, `chest`, `crop-plot`, `drying-rack`, `weather-vane`, `workbench` | `StructureRenderer` | Home proof shows placed props use GLB skins while state overlays, storage, fire, warmth, crop, and weather behavior remain readable |
| K3W wall and house shell contract | Code-authored/procedural wall panels, corners, wall-with-window openings, wall-with-door openings, half walls/rails, roof joins, foundations, and snap sockets; Kiln skins only after the wall contract exists | `src/sim/structures.ts`, `src/render/structures.ts`, `StructureRenderer` | Proof builds a readable enclosed room from procedural wall/socket geometry, then proves door/window/roof GLBs align only as skins or inserts instead of pretending loose panes/frames are walls |
| K4 waterline and utility props | `rain-cistern`, `fish-trap`, `shore-net`, `lantern-post`, `dock-segment`, `compost-bin`, `root-cellar` | `StructureRenderer` plus waterline/fishing rules | E4/C2 proof shows shore placement, set/check/collect states, and socket/collider ownership survive GLB swaps |
| K5 trees and shrubs | `tree-pine`, `tree-broadleaf`, `tree-dead-snag`, `tree-shrub` | `Trees`, `Streamer`, `TreeAssetRenderer` | Passing first slice: `npm run proof:k5-trees` loads all four committed tree GLBs, replaces chunk-embedded procedural tree meshes only after all skins are instanced-ready, proves 210 resident trees on 11 instanced draw calls, gates cosmetic sway to near range, fells a tree into ground drops, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K6 native creatures | all `creature-*` GLBs | `NativeLifeRenderer` plus native-life/combat sim | Passing first slice: `npm run proof:k6-creatures` loads all nine committed creature GLBs, requires idle/walk clips, distance-gates mixers, proves tend/ward responses, captures desktop/phone screenshots, and rejects `generated/` runtime requests |
| K6T native targetability | Native creature ray pick, tend/ward routing, HUD feedback, and occupied-tile placement blockers | `src/edit/pick.ts`, `src/main.ts`, native-life sim | Passing first slice: `npm run proof:k7-native-targeting` proves desktop and phone native targeting beats terrain mining, harmless and territorial interactions resolve, drops spawn or collect, and occupied native-life tiles block building |
| K6R native roaming and ecology state | Harmless grazing/fleeing, territorial patrol/telegraph/recover, shore/cave/fish interactions, pathing across adjacent hexes, and animation state selection | Native-life sim plus `NativeLifeRenderer` | Passing first slice: `npm run proof:k6r-roaming` proves visible creatures derive stable roaming motion from deterministic home sites, move between valid nearby hexes, expose walk/idle clip hints, keep current-tile picking, use approved GLB skins, and avoid generated runtime requests |
| K7 landmarks and wonder | shrines, craters, cave-anchor, cave-mouth dressing/reference | Landmark, skyfall, cave-mouth, and route renderers | Screenshots prove each landmark reads as a place with a verb, not a random ornament |
| K8 remaining modular kits | door/window/roof already started; expand to any remaining build pieces | `StructureRenderer` and build sockets | Measured fit, socket-local preview, fallback, and room/shelter proof for each modular family |
| K9 aquatic life and fish visibility | Generated Kiln single fish bodies: shore minnow, storm runner, cave shimmer, reed fry, plus a single driftjelly body over existing fishing systems | Fishing sim, waterline structures, `FishSchoolRenderer`, `KilnRuntimeAssets` | Passing first slice: corrected singleton fish are promoted to `models/`, fish-school state selects the matching body, the renderer shows up to two animated GLB anchors plus a point school, mixers are distance-gated, and `npm run proof:k9-fish-visuals` proves the cave-shimmer GLB loads from committed assets with fallback at zero |
| K11 sky life and biome expansion | Promoted Kiln singleton bird bodies and future new-biome tree variants | `SkyLifeRenderer`, `KilnRuntimeAssets`, weather/shore/forest site selection | Passing first slice: four bird bodies are promoted to `models/`, reviewed in the asset viewer, selected from sky/shore/forest/storm cues, rendered as a few distance-gated animated GLB anchors plus point flocks, and `npm run proof:k11-sky-life` proves all four committed bird GLBs load with fallback at zero |
| K10 drop and ore expansion | Future pickup/drop skins plus new ore/resource node taxonomy after item design | `ResourceDropRenderer`, `DomainResourceRenderer` | Proof keeps drops/nodes instanced, collectable, and readable while new ores have explicit recipes and route/cave reasons |

## Definition Of Done

The asset-pack adoption track is done when:

- `KilnRuntimeAssets` or successor family loaders cover every ready GLB family.
- The debug renderer reports loaded/pending/fallback counts by family, not only structures.
- Browser proofs assert model requests for every adopted family and assert zero raw
  `assets/kiln/generated/` runtime requests.
- `npm run proof:kiln-asset-viewer` passes for the whole ready pack and leaves a current
  per-asset screenshot packet for scale, pivot, and orientation review.
- Screenshots show the objects in real gameplay contexts at desktop, laptop, phone, tablet,
  and gamepad-relevant paths where the family affects input.
- Performance proof records pack size, draw calls, mesh counts, and repetition strategy,
  especially for trees, creatures, drops, and resource nodes.
- Animated-family proof records active mixer count by distance band and proves far creatures
  do not keep full animation playback alive.
- Any asset not wired has an explicit regeneration or supersession record with a reason.

## Current Evidence

- K0 now includes the Kiln alignment viewer. `/?assetViewer=kiln&family=ready` loads the
  full approved pack on 5.6 world-unit hex sockets with local `+Y` as the planet-normal sky
  direction, local `+Z` as tile-forward tangent, center-XZ/bottom-Y pivots, socket rings,
  bounds, orientation metadata, and review warnings for modular-kit, mesh-count, material,
  triangle, and axis-correction risk.
- `npm run proof:kiln-asset-viewer` covers 9 overview screenshots plus 70 single-asset
  screenshots under `output/playwright/kiln-asset-viewer/assets/`, proves every ready GLB
  is requested from committed `assets/kiln/models/`, rejects `generated/` runtime requests,
  and writes `proof.json` with per-slug fit/socket diagnostics.
- K1 pickup skins are runtime-wired for `drop-wood-logs` and `drop-ore-chunk`.
- `KilnRuntimeAssets` loads both from `assets/kiln/models/`, normalizes them to a ground-pickup pivot, merges source meshes by material, and exposes fit/batching diagnostics.
- `ResourceDropRenderer` uses one instanced batch per accepted drop skin while keeping procedural fallback only for unsupported or failed skins.
- `npm run proof:k1-resource-drops` covers desktop and phone: 3 wood drops plus 2 rock drops become 5 batched instances, `instancedDrawCalls` stays at 5, no `assets/kiln/generated/` request occurs, screenshots pass pixel probing, and collection leaves 6 wood plus 2 rock in inventory.
- K2 harvest/resource nodes are runtime-wired for all 12 node GLBs:
  `node-hearth-coal`, `node-rain-reed`, `node-salt-shell`, `node-lantern-shard`,
  `node-root-pod`, `node-red-nodule`, `node-snow-bloom`, `node-glass-shard`,
  `node-storm-amber`, `node-reed-kelp`, `node-bell-crystal`, and
  `node-horizon-shard`.
- `DomainResourceRenderer` keeps procedural base/glow/dormant overlays for gameplay
  readability, but discovered node bodies now render through slug/material instanced
  batches with normalized center-XZ/bottom-Y pivots. Failed or unsupported skins fall back
  to the older procedural bodies.
- `npm run proof:k2-domain-resources` covers desktop and phone: 12 revealed landmarks
  create 36 discovered nodes, all 12 committed node GLBs are requested from `models/`, the
  family resolves to 36 batched instances on 33 instanced draw calls, pending/fallback stay
  at zero, screenshots pass pixel probing, and no runtime request hits `generated/`.
- K5 tree/shrub skins are runtime-wired for `tree-pine`, `tree-broadleaf`,
  `tree-dead-snag`, and `tree-shrub`.
- `TreeAssetRenderer` mirrors the streamer's resident chunks, classifies tree visuals from
  the authoritative `Trees` simulation, and uses one material-merged instanced batch per
  tree skin. The older procedural chunk tree geometry stays active until every tree GLB
  batch is ready, then becomes fallback/scaffold rather than the default visual.
- Tree GLBs now run through the shared instanced orientation normalizer before centering and
  bottom-pivoting. Stemmed trees use a longest-axis-to-local-Y policy, shrubs preserve
  authored Y-up orientation, and diagnostics report the source up axis plus correction so a
  sideways exported GLB cannot silently become a sideways forest.
- Cosmetic sway is distance-gated to 96 world units. Chop damage remains matrix-driven so
  hit feedback still works without starting per-tree animation systems.
- `npm run proof:k5-trees` covers desktop and phone: all four committed tree GLBs load from
  `models/`, final proof frames show 210 resident trees on 11 instanced draw calls, pending
  and fallback stay at zero, a pine fells into wood drops that can be collected, screenshots
  pass pixel probing, and no runtime request hits `generated/`.
- K6 native creature skins are runtime-wired for all nine promoted creature GLBs:
  `creature-moss-puff`, `creature-shell-skitter`, `creature-reedback-grazer`,
  `creature-cave-blinker`, `creature-brambleback`, `creature-cave-belljaw`,
  `creature-scree-snapper`, `creature-storm-burr`, and `creature-tide-lurker`.
- `NativeLifeRenderer` keeps the native-life simulation authoritative while replacing the
  duplicated body with GLB skins. Code-authored reward and warning overlays remain visible,
  and the renderer reports loaded/pending/fallback, visible GLB, procedural fallback,
  active/low-rate/frozen/hidden mixer bands, clip names, and fit metadata by slug.
- `npm run proof:k6-creatures` covers desktop and phone: all nine committed creature GLBs
  load from `models/`, each accepted skin has `idle` and `walk` clips, mixer playback is
  distance-gated with active <=90wu, low-rate <=135wu, frozen <=180wu, and hidden beyond
  180wu, active mixer count stays under the proof cap, harmless creatures can be tended,
  hazards can be warded, screenshots pass PNG pixel probing, fallback stays at zero, and no
  runtime request hits `generated/`.
- K6T native-life targetability is runtime-wired. Creature picks now win over terrain mining
  when the reticle/tap is on a visible native-life capsule, harmless targets route to tend
  behavior, territorial targets route to ward behavior, and structure placement receives a
  named blocker on occupied native-life tiles.
- `npm run proof:k7-native-targeting` covers desktop and phone: moss-puffs can be tended
  without mining the underlying hex, bramblebacks can be warded, shell-skitter tiles block
  workbench placement with `native life on snap target: ...`, creature rewards spawn or
  auto-collect as pickups, structures stay unchanged, screenshots pass pixel probing, and
  no page/console errors occur.
- K9 aquatic life is runtime-wired for `fish-shore-minnow`, `fish-storm-runner`,
  `fish-cave-shimmer`, `fish-reed-fry`, and `creature-driftjelly` after rejecting the
  earlier school/cluster generation attempt. `KilnRuntimeAssets` normalizes fish bodies with
  a longest-axis-forward policy, requires `idle` plus `swim` or `pulse`, and exposes fit,
  clip, and distance-band diagnostics. `FishSchoolRenderer` keeps the fishing sim
  authoritative, maps current shore/dock/run/storm/cave schools to accepted singleton
  bodies, renders up to two animated GLB anchors, and uses point sprites for the remaining
  school members. `npm run proof:k9-fish-visuals` proves a sea-cave school loads
  `fish-cave-shimmer` from committed `assets/kiln/models/`, shows 2 visible GLB anchors and
  32 point sprites, and keeps fallback at zero.
- K11 sky life is runtime-wired for `bird-sky-kite`, `bird-shore-gull`,
  `bird-forest-flutter`, and `bird-storm-finch`. `KilnRuntimeAssets` preserves authored
  Y-up, normalizes each singleton body into a sky-life socket, requires `idle` plus
  `flap` or `glide`, and exposes clip/fit/distance-band diagnostics. `SkyLifeRenderer`
  keeps bird behavior visual-only for this slice: nearby weather, shore, forest, and
  high-sky cues choose a few animated GLB anchors, while point flocks carry the wider
  group. `npm run proof:k11-sky-life` proves all four bird GLBs load from committed
  `assets/kiln/models/`, with zero generated requests and zero fallback.
- Hex terrain material variety now stays in the procedural/material lane. `src/render/palette.ts`
  uses deterministic per-material swatch ramps for grass, dirt, rock, sand, snow, bedrock,
  built blocks, seabed, and wood while preserving the single shared vertex-color material.
  This is intentionally not a Kiln task and adds no texture maps, material splits, or draw
  calls.

## House Wall And Shell Contract

The current promoted `door-kit`, `window-frame`, and `roof-bundle` GLBs are not a complete
house. They are accepted only as fitted skins over code-authored sockets. A window pane or
frame is not a wall; a door kit is not an enclosing wall by itself; a roof bundle needs
clear roof-support and edge-join sockets.

Before craftable houses can be treated as a polished building system, the game must define
the wall contract in code:

- Wall grid: hex-edge or hex-face sockets with stable width, height, thickness, pivot,
  neighbor join, and collision rules.
- Wall pieces: full wall panel, wall-with-window opening, wall-with-door opening, corner or
  angled join, half wall/rail, roof support, roof edge/eave, floor/foundation if needed.
- Snap truth: code-owned sockets, blockers, enclosure contribution, room detection, and
  player collision stay authoritative.
- GLB role: Kiln wall pieces may skin the socket or provide decorative inserts, but they do
  not define collision, enclosure, or snap dimensions without measured-fit proof.
- Proof: build a small enclosed room from wall sockets, insert a door/window, cap it with a
  roof, move one wall/roof piece out and back, and prove shelter quality follows the code
  sockets while screenshots show an actual house.

If we generate more house assets, request them as one shared-scale Kiln house-shell pack:
`wall-panel`, `wall-window-opening`, `wall-door-opening`, `wall-corner`, `wall-half-rail`,
`roof-edge`, `roof-corner`, and `floor-foundation`, all authored to the same hex-edge
socket dimensions. The runtime still normalizes and proves every piece in the asset viewer.

## Native-Life Targetability And Roaming

User playtesting found two separate K6 follow-ups. The first was input routing: native-life
hazards could look like old procedural plants or ground props, apply stamina/exposure
pressure, and still allow a click or attack to mine the hex underneath. That targeting
slice now has a proof gate through `npm run proof:k7-native-targeting`.

The second follow-up now has its first K6R slice: native life still persists as
deterministic home sites, but nearby visible creatures derive ephemeral roaming motion from
time, habitat, leash radius, and species rules. Their site ids and save ids remain stable,
while each visible actor exposes `homeTile`, `currentTile`, `fromTile`, `toTile`,
`progress`, `state`, and an `idle`/`walk` clip hint. The renderer interpolates approved
Kiln GLB bodies between neighboring valid hexes and keeps `THREE.AnimationMixer` playback
distance-gated.

The next creature-depth layer should build from that first slice into a fuller native-life
state machine:

- Site spawn remains deterministic and save-light; active nearby creatures should gain mood,
  alert source, cooldowns, player intent, and richer temporary actor state only where needed.
- Harmless states: `idle`, `graze`, `wander`, `curious`, `gift`, `flee`, `return`.
- Territorial states: `idle`, `patrol`, `warn`, `telegraph`, `lunge`, `recover`, `flee`,
  `warded`.
- Movement is hex-to-hex on species-valid neighbor tiles, not freeform physics: shore
  creatures prefer sand/water edges, cave creatures prefer cave/low-light tiles, grazers
  prefer grass near water, hazards avoid crowded player-built homes unless provoked.
- Animation selection maps state to clips and procedural offsets: idle/graze use low-rate
  mixer or pose sampling; wander/patrol use `walk`; telegraph/lunge/flee can layer
  code-authored squash, warning rings, facing, and speed without requiring new skeletons.
- Performance stays distance-banded: near creatures get state ticks and mixers, mid-distance
  creatures get coarse state/low-rate clips, far creatures freeze, hide, or resolve back
  into deterministic sites.
- Gameplay remains non-generic: harmless creatures point to resources, seeds, fish, cave
  air, or weather; hazards teach preparation and environment tools instead of becoming
  standard enemy spawners.

Closed targetability requirements:

- Native-life pick target wins over terrain mining when the reticle/tap is on a
  visible creature or hazard.
- That target routes to inspect, tend, ward, scare, or tool-readiness feedback instead of
  silently striking the underlying hex.
- Structure placement blocks on occupied native-life tiles unless the placement action
  explicitly relocates or clears the encounter.

Open polish requirements:

- Name the pressure source in HUD/readback when a hazard drains stamina or raises exposure.
- Suppress any remaining procedural body fragments that compete with the approved GLB skin,
  while keeping intentional reward/warning overlays.
- Extend K6R beyond sparse deterministic roam into social/herd behavior, flee/return,
  attack telegraphs, and species-specific tool reactions once those rules are designed.
- Do not invent fish, extra hazards, or wonder creatures procedurally as final visuals.
  Missing bodies stay in the Kiln request packs until generated, reviewed, promoted, and
  proved.

## Future Kiln Asset Requests

Use the current pack first. When we need a new Kiln run, use the same `sphere-planet`
palette/optimized-palette contract, keep tokens in gitignored local env, and promote only
after `proof:kiln-assets` and `proof:kiln-asset-viewer`.

The canonical pre-catalog request packet is now
`tools/kiln/requests/hearth-horizon-next-packs.json`. Do not add those slugs to
`tools/kiln/assets-catalog.json` until the run is approved and the generated GLBs exist in
`public/assets/kiln/generated/`.

No-spend validation:

```bash
cd tools/kiln
node scripts/capabilities.mjs
node scripts/validate-request-packs.mjs
```

Current validation, 2026-07-07: all 8 request packs are API-valid, 56 candidate GLBs total,
estimated at 373 cents before spend. The guarded generator refuses to spend unless explicitly
confirmed:

```bash
cd tools/kiln
KILN_CONFIRM_SPEND=1 node scripts/generate-request-pack.mjs k9-aquatic-life
```

After generation, review the quarantined GLBs, add accepted slugs to
`tools/kiln/assets-catalog.json`, then run `node scripts/build-manifest.mjs`,
`node scripts/promote.mjs`, `npm run proof:kiln-assets`, and
`npm run proof:kiln-asset-viewer`.

Prepared request packs:

- Aquatic life: the first accepted singleton bodies are promoted and wired:
  `fish-shore-minnow`, `fish-storm-runner`, `fish-cave-shimmer`, `fish-reed-fry`, and
  `creature-driftjelly`. Existing fish-school rules stay in the fishing sim; schools are
  instanced/points/boids runtime behavior, not GLB-authored clusters. The first
  `fish-school-*` / cluster prompt attempt is rejected as improper prompting and should not
  be promoted.
- Sky life: the first singleton bodies are promoted and wired: `bird-sky-kite`,
  `bird-shore-gull`, `bird-forest-flutter`, and `bird-storm-finch` with
  idle/flap/glide/turn clips. Flocks are runtime points, impostors, boids, or migration
  signals, never authored multi-bird GLB scenes.
- Pickup skins: `drop-dirt-clod`, `drop-sand-pile`, `drop-snow-clump`,
  `drop-glow-crystal`, `drop-raw-fish`, `drop-kelp-reeds`, `drop-compost-pellet`, and
  `drop-cave-mushroom`.
- Ore/resource nodes after item taxonomy: `node-iron-vein`, `node-copper-patina`,
  `node-coal-seam`, `node-glow-crystal-vein`, `node-clay-bank`, and
  `node-geode-pocket`.
- House-shell pack: shared-scale wall panels, wall openings, corners, rails, foundations,
  and roof joins matching the code-owned wall socket contract.
- Wonder/cave dressing: threshold arches, tide underpass ribs, lantern skylight rings,
  root vault room pieces, horizon gate dressing, dripstone clusters, cave mushrooms,
  spring seep stones, sea-cave tide-pool stones, and glow-crystal veins.
- Avatar/equipment: authored Soft-Facet Wayfarer candidate, pack frame, storm cloak,
  hatchet, pickaxe, fishing rod, sword, bow, and folded chart as an approved-asset path
  for replacing the procedural character once rig/socket decisions are ready.

Do not generate these as GLBs unless a specific prop is needed: hex tile textures, terrain
columns, block materials, mining cracks, water/sky, route ribbons, telegraph rings, dynamic
glows, skyfall beams, and particle/signal behavior. Those should stay procedural material,
shader, or instanced runtime systems keyed to the palette.

## Next Critical Slice

K1, K2, K5, K6, K6T, K6R, K9, and K11 now prove the repeated static-family, first
animated-family, native targetability, sparse creature-roaming, aquatic singleton, and
sky-life singleton paths. Continue with K3W/K3 functional home shells and props, then K4
waterline utilities, richer G5/K6R creature behavior, and K7 wonders.
