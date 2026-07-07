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
- `public/assets/kiln/models/` contains 61 committed GLBs, 5.12 MiB total.
- The manifest has 64 records: 61 `ready`, 3 `unused`, 0 `missing`.
- The 3 unused records are `cave-mouth-arch`, `cave-mouth-dry`, and
  `cave-mouth-sea`. Do not wire them; real carved cave voids read better than a small arch
  prop inside a larger terrain opening.
- Raw generated drops remain quarantine/provenance material under
  `public/assets/kiln/generated/` when present. They must stay ignored and out of commits.

The current target is to adopt the 61 ready assets across runtime families, not to leave
them as a passive library. Each ready asset should become runtime wired, runtime dressing,
or an explicit regeneration/supersession decision. Repeated families must be implemented
through palette/material reuse, instanced or batched geometry, and distance-gated animation
where applicable.

Run:

```bash
npm run proof:kiln-assets
```

Current proof result, 2026-07-07:

- 61 curated assets accepted into the committed pack.
- 18 runtime pilot candidates.
- 43 runtime-deferred assets.
- 3 runtime-rejected assets.
- 19 warnings, 0 failures.
- The proof also checks GLB headers/lengths, manifest/file parity, palette ids, animation
  metadata, secret/presigned URL leakage, and tracked raw-drop hygiene.

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
5. Wire one runtime family through a manifest-driven loader or family-specific batcher.
6. For repeated families, prove palette/material reuse, instancing or batching, draw-call
   budget, and distance-gated animation if the asset has clips.
7. Prove desktop and phone screenshots, fallback behavior, and that no runtime requests hit
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
  chunks and turns each accepted tree GLB into a material-merged instanced batch. Procedural
  chunk tree meshes stay active until every tree skin is ready, then become fallback. The
  proof caps the family at 11 instanced draw calls for 210 resident trees and gates cosmetic
  sway to 96 world units while keeping chop damage matrix-driven.
- All 9 `creature-*` native-life bodies: accepted as H5/K6 animated creature skins.
  `NativeLifeRenderer` keeps the native-life simulation, pressure, tend/ward rules, and
  reward/warning overlays code-authored, then hides duplicated procedural body meshes after
  a GLB skin attaches. Accepted creature assets must provide `idle` and `walk` clips.
  Runtime diagnostics split loaded/pending/fallback, visible GLB, procedural fallback,
  fit metadata, clip metadata, and active/low-rate/frozen/hidden mixer bands by slug.
  `npm run proof:k6-creatures` proves all nine committed model requests, zero generated
  requests, zero fallback, distance-gated animation, desktop/phone screenshots, and
  harmless/hazard gameplay responses. K6 is not player-ready until the native-life
  targetability/placement UX gap is closed.

Runtime pilot candidates from the proof:

- `chest`, `campfire`, `bedroll`, `crop-plot`, `cave-anchor`, `drying-rack`,
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
  distance-gated `AnimationMixer` playback.

Deferred until scale, snap, budget, readability, or animation proof exists:

- Remaining modular house/build pieces: `dock-segment`, `compost-bin`, and `root-cellar`.
  The house-kit warning still applies: independently generated pieces do not share wall
  heights, opening sizes, wall thickness, or grid units unless the game imposes that
  contract. The accepted door/window/roof skins prove the cheapest safe path: keep the
  procedural socket/collider/snap volume as load-bearing, measure each loaded GLB template,
  normalize it to the socket, and hide duplicated procedural body parts only after GLB
  success. Future pieces need the same fitted-bbox diagnostics, fallback proof, and
  screenshot proof before shipping as craftable art.
- Functional props with warnings or watery placement needs: `workbench`, `rain-cistern`,
  `fish-trap`, `shore-net`, `lantern-post`.
- Shrines and craters: defer for blind screenshot readability, world-placement scale,
  repetition/LOD policy, and collision proof. Trees are no longer deferred for the first
  vegetation slice; broader forest art direction can still revise placement, density, and
  regeneration prompts after K5 proof.
- Native-life UX: creature GLB skinning is wired, but playtest feedback found that visible
  native hazards can still be treated as ordinary terrain by click/attack and placement
  routing. Add native-life pick priority, HUD pressure source feedback, and occupied-tile
  placement blockers before calling K6 player-ready.

Rejected for runtime:

- `cave-mouth-arch`, `cave-mouth-dry`, `cave-mouth-sea`. Keep carved terrain entrances and
  code-authored cave-mouth dressing.

## Room For Wonder

Reserve a small lane for assets that make the planet feel authored rather than merely
efficient: strange root-vaults, storm seats, glass-rain craters, harmless odd creatures,
and shrine silhouettes that invite investigation. Wonder still goes through the same gate;
it earns room by being readable, performant, and connected to a verb.
