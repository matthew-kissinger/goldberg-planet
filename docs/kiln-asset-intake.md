# Kiln Asset Intake Gate

This is the H4 external-asset intake node for Hearth and Horizon. It keeps generated
GLBs useful without letting them bypass gameplay readability, scale, snapping, performance,
or source-control hygiene.

`docs/kiln-asset-intake.md` is the canonical wiring doc. `public/assets/kiln/HANDOFF.md`
is only a short pointer back here so the asset folder does not carry a second source of
truth.

H4 is the gate. The follow-on H5 adoption plan is `docs/kiln-pack-adoption-plan.md`.
Together they treat the user-approved promoted pack as the visual target for the world:
procedural meshes should become fallback, collider/socket scaffolding, dynamic overlays, or
temporary proof geometry except where they are intentionally stronger, such as the current
craftable plane.

## Current Decision

The Drop 1 promoted pack is accepted as curated source material:

- `public/assets/kiln/ASSET_MANIFEST.json` is the authoritative manifest.
- `public/assets/kiln/models/` contains 70 committed GLBs, 5.92 MiB total.
- The manifest has 73 records: 70 `ready`, 3 `unused`, 0 `missing`.
- The 3 unused records are `cave-mouth-arch`, `cave-mouth-dry`, and
  `cave-mouth-sea`. Do not wire them; real carved cave voids read better than a small arch
  prop inside a larger terrain opening.
- Raw generated drops remain quarantine/provenance material under
  `public/assets/kiln/generated/` when present. They must stay ignored and out of commits.

The current target is to adopt the 70 ready assets across runtime families, not to leave
them as a passive library. Each ready asset should become runtime wired, runtime dressing,
or an explicit regeneration/supersession decision. Repeated families must be implemented
through palette/material reuse, instanced or batched geometry, and distance-gated animation
where applicable.

Run:

```bash
npm run proof:kiln-assets
```

Current proof result, 2026-07-07:

- 70 curated assets accepted into the committed pack.
- 29 runtime pilot candidates.
- 41 runtime-deferred assets.
- 3 runtime-rejected assets.
- 27 warnings, 0 failures.
- The proof also checks GLB headers/lengths, manifest/file parity, palette ids, animation
  metadata, secret/presigned URL leakage, and tracked raw-drop hygiene.

## Alignment Viewer

The custom placement viewer is the visual alignment bench for every ready GLB before it is
wired into gameplay or accepted as socket dressing.

Open:

```text
/?assetViewer=kiln&family=ready
/?assetViewer=kiln&slug=tree-pine
/?assetViewer=kiln&slug=tree-pine&neighbors=1
```

Run:

```bash
npm run proof:kiln-asset-viewer
```

Current proof result, 2026-07-07:

- Loads all 70 ready GLBs from committed `assets/kiln/models/` paths.
- Captures overview screenshots for `structures`, `drops`, `nodes`, `trees`, `creatures`,
  `fish`, `birds`, `adopted`, and the full `ready` pack.
- Captures one single-asset alignment screenshot for every ready slug under
  `output/playwright/kiln-asset-viewer/assets/<slug>.png`.
- Emits `output/playwright/kiln-asset-viewer/proof.json` with socket role, socket grid,
  source bounds, oriented bounds, normalized bounds, scale, material/triangle warnings,
  orientation policy, and placement-frame metadata for each asset.
- Proves the viewer's placement frame: local `+Y` is the planet-normal sky direction,
  local `+Z` is tile-forward tangent, local `+X` is tile-right tangent, the pivot is
  center-XZ/bottom-Y, and the reference hex is 5.6 world units flat-to-flat.
- Rejects runtime requests to `assets/kiln/generated/` and fails on page/console errors or
  blank screenshot pixels.

Use the viewer before every GLB placement decision. The screenshot should answer whether
the object sits on the hex, points into the planet-normal direction, fits the intended
socket ring, and needs an explicit orientation policy instead of silent runtime guesswork.
The viewer is allowed to label and draw bounds because it is a review tool; gameplay proofs
still need label-free, normal-distance screenshots.

## Source Of Truth

`scripts/proof-kiln-asset-pack.mjs` is the authoritative gate. It validates the promoted
manifest and model files by default, then records any local generated quarantine as
provenance if present.

`tools/kiln/scripts/build-manifest.mjs` is a provenance helper. It may rebuild manifest
metadata from the Kiln catalog and raw generated outputs, but it is not the runtime gate.

`tools/kiln/scripts/promote.mjs` is the promotion step. It must run only after raw
generated assets pass proof, and it now preflights every planned source GLB before cleaning
or copying into `public/assets/kiln/models/`.

Promotion order:

1. Generate or regenerate into the ignored quarantine.
2. Prove the quarantine source material.
3. Build the manifest and promote reviewed assets into `models/`.
4. Run `npm run proof:kiln-assets` against the promoted pack.
5. Run `npm run proof:kiln-asset-viewer` and inspect the per-asset alignment screenshot for
   any slug being wired or reviewed.
6. Wire one runtime family through a manifest-driven loader or family-specific batcher.
7. For repeated families, prove palette/material reuse, instancing or batching, draw-call
   budget, and distance-gated animation if the asset has clips.
8. Prove desktop and phone screenshots, fallback behavior, and that no runtime requests hit
   `public/assets/kiln/generated/`.

## DAG Node

| Node | Owner | Depends On | Exit Gate |
| --- | --- | --- | --- |
| H4 Kiln asset intake | Main orchestrator plus asset, UX, safety, and proof reviewer lanes | A4, H3 | Promoted pack has no integrity/security failures, raw drops remain untracked, runtime candidates are risk-ranked, and each wired family has fallback plus screenshot proof |

Parallel lanes for this node:

- **Safety/tooling lane**: verify `.env.local`, presigned URLs, source kits, raw generated
  drops, dogfood outputs, and package tarballs stay out of commits.
- **Art readability lane**: rank avatar, waystone, cave-anchor, house kit, drops,
  resource nodes, shrines, trees, and creatures by whether a player can name the noun and
  likely verb at normal play distance.
- **UX/control lane**: select assets that strengthen the survival loop instead of adding
  decoration without a player-facing action.
- **Batching/perf lane**: keep repeated trees, creatures, drops, resource nodes, and small
  props on instanced or merged paths with shared palette/material state instead of unique
  scene-graph clones.
- **Animation-distance lane**: play GLB animation clips only inside useful distance bands;
  mid/far creatures should low-rate pose, freeze, use impostors, or hide instead of running
  mixers globally.
- **Proof lane**: keep every accepted family behind unit, browser, request-path, fallback,
  and screenshot checks.

## Runtime Acceptance Criteria

No GLB becomes shipped gameplay art until it has:

- A manifest record with `status: "ready"`, `paletteId: "sphere-planet"`, a `replaces`
  owner pointer, geometry numbers, animation metadata, and raw bbox dimensions.
- Valid GLB 2.0 magic, matching declared length, no embedded live token, bearer header,
  HTTP URL, or presigned URL marker.
- A runtime asset entry declaring scale, pivot, orientation, socket/collider ownership,
  interaction overlays, repetition policy, and procedural fallback.
- A matching alignment-viewer record and screenshot on a 5.6 world-unit hex socket when
  the asset's scale, pivot, axis, socket, or snap behavior affects gameplay placement.
- An orientation normalization record for any upright or axis-sensitive asset family. The
  runtime must decide whether to preserve authored Y-up or rotate a detected source axis to
  local Y before computing pivots, fitted bounds, and instanced geometry.
- A batching policy for repeated assets, including whether the implementation uses
  `InstancedMesh`, merged geometry, LOD buckets, or a deliberate one-off mesh.
- A distance policy for animated assets, including active mixer radius, low-rate/frozen far
  behavior, and max active mixer counts.
- A debug-off desktop and phone screenshot proof where the noun and likely verb are
  readable without labels.
- A browser request proof showing committed `models/` paths only.
- Written acceptance or regeneration for C-grade instanceability, high mesh counts,
  high triangle counts, or unclear silhouettes.

## Runtime Decisions

First wired pilot:

- `waystone`: loaded through `KilnRuntimeAssets`, attached as a decorative body shell to
  the code-authored waystone, with `waystoneBase`, `waystoneCore`, and `waystoneBand`
  hidden only after GLB success. Attuned route glyph overlays, placement, collision, route
  readback, and fallback remain procedural.
- `cave-anchor`: accepted beside `waystone` as a K7 route-marker decorative shell.
  `StructureRenderer` hides duplicated static stone/cairn/post/rope-rail parts only after
  the committed GLB loads, while cave glyphs, rope pulses, flood/spring markers, route
  readback, active glow, placement, collision, and fallback remain procedural. `npm run
  proof:route-markers` now proves five waystones plus three cave anchors on committed
  model paths with zero fallback and zero generated-path requests.
- `door-kit`, `window-frame`, and `roof-bundle`: conditionally accepted as the first
  modular house-kit skins only after runtime normalization to the code-owned C2/C3 sockets.
  The game measures each loaded GLB template, computes the decorative scale from the actual
  runtime bounding box rather than the raw manifest bbox, and fits the final visible shell
  to the `doorKit`, `windowFrame`, or `roofBundle` socket. Collision, snap, opening,
  shelter, save, relocation, and comfort-light truth remain procedural. `window-frame`
  keeps its C-grade instanceability note, but the current acceptance is explicit because it
  remaps the wide local axis to wall width and is browser-proofed in
  `npm run proof:c2-c3-building-snap-grid`.
- `drop-wood-logs` and `drop-ore-chunk`: accepted as H5/K1 instanced ground-pickup skins.
  They are loaded from committed `models/`, normalized to ground-pickup pivots, merged by
  material, and rendered by `ResourceDropRenderer` as instanced batches. Collection timing,
  pickup glints, unsupported item fallbacks, and inventory truth remain code-authored.
- All 12 `node-*` resource bodies: accepted as H5/K2 instanced domain-resource skins.
  `DomainResourceRenderer` keeps the procedural base, dormant, and harvest-glow overlays
  for gameplay readability, but discovered node bodies now come from material-merged
  instanced batches. `npm run proof:k2-domain-resources` proves 36 revealed nodes across
  12 slugs on 33 instanced draw calls, zero pending/fallback, desktop/phone screenshots,
  and zero runtime `generated/` requests.
- `tree-pine`, `tree-broadleaf`, `tree-dead-snag`, and `tree-shrub`: accepted as H5/K5
  instanced vegetation skins. `Trees` remains the gameplay authority for tree existence,
  visual kind, chop progress, and drops; `TreeAssetRenderer` mirrors resident streamer
  chunks and turns each accepted tree GLB into a material-merged instanced batch. Stemmed
  trees now use the shared longest-axis-to-local-Y orientation normalizer before centering
  and bottom-pivoting; shrubs preserve authored Y-up because squat vegetation should not be
  spun simply for being wide. Procedural chunk tree meshes stay active until every tree skin
  is ready, then become fallback. The proof caps the family at 11 instanced draw calls for
  210 resident trees and gates cosmetic sway to 96 world units while keeping chop damage
  matrix-driven.
- All 9 `creature-*` native-life bodies: accepted as H5/K6 animated creature skins.
  `NativeLifeRenderer` keeps the native-life simulation, pressure, tend/ward rules, and
  reward/warning overlays code-authored, then hides duplicated procedural body meshes after
  a GLB skin attaches. Accepted creature assets must provide `idle` and `walk` clips.
  Runtime diagnostics split loaded/pending/fallback, visible GLB, procedural fallback,
  fit metadata, clip metadata, and active/low-rate/frozen/hidden mixer bands by slug.
  `npm run proof:k6-creatures` proves all nine committed model requests, zero generated
  requests, zero fallback, distance-gated animation, desktop/phone screenshots, and
  harmless/hazard gameplay responses. Follow-on proofs now close creature-first
  targetability, occupied-tile placement blockers, and first sparse roaming over approved
  GLB skins; richer behavior states remain future K6R work.
- K4 utility and waterline structure skins are accepted for `compost-bin`, `rain-cistern`,
  `root-cellar`, `dock-segment`, `fish-trap`, `shore-net`, and `lantern-post`.
  They attach over code-owned center or shore sockets, hide duplicated static bodies, and
  keep waterline blockers, trap/net/cistern/cellar/lantern state overlays authoritative.
- K7 skyfall crater shells are accepted for `crater-emberfall`, `crater-glassrain`, and
  `crater-starbloom`. `SkyfallRenderer` loads them through the shared Kiln runtime asset
  provider, normalizes them under the existing skyfall parent scale, and hides only the
  duplicated procedural crater floor/ring/rocks/shards. Core glow, signal discs, falling
  beams, omen trails/halos, sparks, harvest state, reward timing, and fallback remain
  code-owned. `npm run proof:k7-wonders` proves all three committed crater GLBs with zero
  fallback and zero generated-path requests.
- K7 shrine landmark shells are accepted for all 12 `shrine-*` GLBs. `LandmarkRenderer`
  loads them through the shared provider, maps shrine slug to pentagon index, fits each
  shell with a per-shrine socket target so tall silhouettes stay tall, and hides duplicated
  procedural body/ring/pillar parts only after GLB success. The landscape apron, domain
  halo, quiet/awake glows, signal beam, threshold meshes, threshold materials, terrain
  opening truth, discovery state, and fallback remain code-owned. Baked GLB water/glow
  nodes that would imply the wrong live state are hidden by exact node name. Surface placement
  now uses the shared right-handed local frame contract: local `+Y` maps to the hex/planet
  normal, local `+Z` keeps the family yaw/facing direction, and local `+X` is derived from
  that pair so GLBs do not inherit reflected or tilted matrices. `npm run proof:k7-wonders`
  proves all 12 committed shrine GLBs plus the three crater GLBs with zero fallback, zero
  generated-path requests, and shrine surface-basis determinant/up-dot assertions.

Runtime pilot candidates from the proof:

- `chest`, `campfire`, `bedroll`, `crop-plot`, `drying-rack`,
  `weather-vane`, `waystone`.
- Resource/drop candidates: `drop-wood-logs` and `drop-ore-chunk` are H5/K1
  runtime-wired through `ResourceDropRenderer` with instanced material batches.
- Resonance/resource-node candidates: `node-hearth-coal`, `node-rain-reed`,
  `node-salt-shell`, `node-lantern-shard`, `node-root-pod`, `node-red-nodule`,
  `node-snow-bloom`, `node-glass-shard`, `node-storm-amber`, `node-reed-kelp`,
  `node-bell-crystal`, and `node-horizon-shard` are H5/K2 runtime-wired through
  `DomainResourceRenderer` with instanced material batches.
- Vegetation candidates: `tree-pine`, `tree-broadleaf`, `tree-dead-snag`, and `tree-shrub`
  are H5/K5 runtime-wired through `TreeAssetRenderer` with resident-chunk instanced
  material batches.
- Creature candidates: `creature-moss-puff`, `creature-shell-skitter`,
  `creature-reedback-grazer`, `creature-cave-blinker`, `creature-brambleback`,
  `creature-cave-belljaw`, `creature-scree-snapper`, `creature-storm-burr`, and
  `creature-tide-lurker` are H5/K6 runtime-wired through `NativeLifeRenderer` with
  distance-gated `AnimationMixer` playback. The first K6T targeting slice also gives
  visible creatures pick priority over terrain mining and blocks structure placement on
  occupied native-life tiles.

Deferred until scale, snap, budget, readability, or animation proof exists:

- Any remaining modular house/build pieces outside the accepted utility props. The house-kit
  warning still applies: independently generated pieces do not share wall heights, opening
  sizes, wall thickness, or grid units unless the game imposes that contract. The accepted
  door/window/roof skins prove the cheapest safe path: keep the procedural
  socket/collider/snap volume as load-bearing, measure each loaded GLB template, normalize
  it to the socket, and hide duplicated procedural body parts only after GLB success. Future
  wall-shell pieces need the same fitted-bbox diagnostics, fallback proof, and screenshot
  proof before shipping as craftable art.
- House walls are not solved by the current pack. A `window-frame` is an insert, not a
  wall; a `door-kit` is an opening/threshold, not a full enclosure; a `roof-bundle` needs
  supports and joins. The second C6 slice now adds code-owned `floorFoundation`,
  `wallPanel`, `wallDoorPanel`, `wallWindowPanel`, `wallCorner`, `wallHalfRail`, and
  `roofJoin` sockets and proves integrated walls seal while rails/foundations do not fake
  enclosure. The edge-socket slice adds true edge-addressed occupancy: center foundations and
  multiple wall edges can share a hex only when sockets do not overlap. Before more
  craftable house pieces ship, finish edge-based shelter coverage, collision, and broader
  room-shape proof. New Kiln wall pieces should be generated as one shared-scale house-shell
  pack and then treated as decorative skins over measured sockets.
- Shrine landmark shells: defer for blind screenshot readability, world-placement scale,
  water/glow/threshold ownership, repetition/LOD policy, and collision proof. Craters are no
  longer deferred for the first skyfall-shell slice. Trees are no longer deferred for the
  first vegetation slice; broader forest art direction can still revise placement, density,
  and regeneration prompts after K5 proof.
- Native-life roaming: creature GLB skinning, first targeting ownership, and a first
  sparse-roaming actor layer are wired. Future K6R work should deepen `NativeCreatureActor`
  state over deterministic native sites so harmless creatures graze/wander/flee with more
  intent and territorial creatures warn/pressure/recover/retreat across valid neighbor
  hexes with anti-farming cooldowns.
- Native-life polish still needs named HUD pressure-source feedback and suppression of any
  remaining procedural body fragments that compete with the approved GLB skins.

## Next Kiln Request Backlog

Current guidance: use the approved pack first. Request more Kiln assets only when the
runtime owner and socket/behavior contract are known. Keep Kiln tokens in gitignored local
env or an authenticated AWS/Kiln session, and promote only after `proof:kiln-assets` and
`proof:kiln-asset-viewer`.

The backlog is now an executable pre-catalog request packet:
`tools/kiln/requests/hearth-horizon-next-packs.json`. It currently contains API-valid packs
for shared-scale house shells, aquatic life/fish, pickup/drop skins, ore/resource nodes,
native-life expansion, wonder/cave dressing, and authored avatar/equipment. Validate it
without spend from `tools/kiln`:

```bash
node scripts/validate-request-packs.mjs
```

Generate one approved pack only after the runtime/socket owner is ready and the spend is
intentional:

```bash
KILN_CONFIRM_SPEND=1 node scripts/generate-request-pack.mjs k9-aquatic-life
```

Generated candidates stay quarantined in `public/assets/kiln/generated/`. Accepted slugs
then enter `tools/kiln/assets-catalog.json`, manifest build, promote, and the proof gates.

Do not request GLBs for hex tile textures, terrain chunks, block materials, mining cracks,
water, sky, route ribbons, telegraph rings, dynamic glows, skyfall beams, or particle/signal
behavior unless a specific placeable prop is being authored. Those should remain
procedural/material/shader systems keyed to the palette.

Rejected for runtime:

- `cave-mouth-arch`, `cave-mouth-dry`, `cave-mouth-sea`. Keep carved terrain entrances and
  code-authored cave-mouth dressing.

## Room For Wonder

Reserve a small lane for assets that make the planet feel authored rather than merely
efficient: strange root-vaults, storm seats, glass-rain craters, harmless odd creatures,
and shrine silhouettes that invite investigation. Wonder still goes through the same gate;
it earns room by being readable, performant, and connected to a verb.
