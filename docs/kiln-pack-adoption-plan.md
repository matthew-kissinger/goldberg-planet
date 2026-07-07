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
- For any animated family, diagnostics must split active, low-rate/frozen, and hidden
  counts by distance band before that family can replace procedural motion.
- Do not widen asset adoption until proof records draw calls, visible instance counts,
  mixer counts, and fallback counts for the affected family.

## Scope

The current promoted pack contains 61 ready GLBs plus 3 unused cave-mouth records. The
adoption goal is to use the 61 ready assets broadly across the game and to revisit the
cave-mouth assets as possible dressing or regeneration references instead of silently
forgetting them.

## Rollout Waves

| Wave | Asset Families | Runtime Owner | Proof Gate |
| --- | --- | --- | --- |
| K0 loader contract | Shared GLB template cache, fit diagnostics, palette/material reuse, instancing policy, distance animation policy, fallback state | `src/render/kilnAssets.ts` plus family renderers | Unit tests prove normalization metadata, batching metadata, distance gates, and failed-load fallback for each owner |
| K1 pickups and rocks | `drop-wood-logs`, `drop-ore-chunk` | `ResourceDropRenderer` | Passing first slice: `npm run proof:k1-resource-drops` spawns wood/rock drops, loads committed GLBs, proves 5 batched instances on 5 instanced draw calls, collects into inventory, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K2 harvest nodes | all 12 `node-*` harvest/resource assets | `DomainResourceRenderer`, domain hooks | Passing first slice: `npm run proof:k2-domain-resources` reveals all 36 domain nodes, loads all 12 committed node GLBs, proves 36 batched instances on 33 instanced draw calls, keeps code-owned harvest glows/base overlays, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K3 camp and home props | `campfire`, `bedroll`, `chest`, `crop-plot`, `drying-rack`, `weather-vane`, `workbench` | `StructureRenderer` | Home proof shows placed props use GLB skins while state overlays, storage, fire, warmth, crop, and weather behavior remain readable |
| K4 waterline and utility props | `rain-cistern`, `fish-trap`, `shore-net`, `lantern-post`, `dock-segment`, `compost-bin`, `root-cellar` | `StructureRenderer` plus waterline/fishing rules | E4/C2 proof shows shore placement, set/check/collect states, and socket/collider ownership survive GLB swaps |
| K5 trees and shrubs | `tree-pine`, `tree-broadleaf`, `tree-dead-snag`, `tree-shrub` | `Trees`, `Streamer`, `TreeAssetRenderer` | Passing first slice: `npm run proof:k5-trees` loads all four committed tree GLBs, replaces chunk-embedded procedural tree meshes only after all skins are instanced-ready, proves 210 resident trees on 11 instanced draw calls, gates cosmetic sway to near range, fells a tree into ground drops, records desktop/phone screenshots, and rejects `generated/` runtime requests |
| K6 native creatures | all `creature-*` GLBs | `NativeLifeRenderer` plus native-life/combat sim | Passing first slice: `npm run proof:k6-creatures` loads all nine committed creature GLBs, requires idle/walk clips, distance-gates mixers, proves tend/ward responses, captures desktop/phone screenshots, and rejects `generated/` runtime requests |
| K7 landmarks and wonder | shrines, craters, cave-anchor, cave-mouth dressing/reference | Landmark, skyfall, cave-mouth, and route renderers | Screenshots prove each landmark reads as a place with a verb, not a random ornament |
| K8 remaining modular kits | door/window/roof already started; expand to any remaining build pieces | `StructureRenderer` and build sockets | Measured fit, socket-local preview, fallback, and room/shelter proof for each modular family |

## Definition Of Done

The asset-pack adoption track is done when:

- `KilnRuntimeAssets` or successor family loaders cover every ready GLB family.
- The debug renderer reports loaded/pending/fallback counts by family, not only structures.
- Browser proofs assert model requests for every adopted family and assert zero raw
  `assets/kiln/generated/` runtime requests.
- Screenshots show the objects in real gameplay contexts at desktop, laptop, phone, tablet,
  and gamepad-relevant paths where the family affects input.
- Performance proof records pack size, draw calls, mesh counts, and repetition strategy,
  especially for trees, creatures, drops, and resource nodes.
- Animated-family proof records active mixer count by distance band and proves far creatures
  do not keep full animation playback alive.
- Any asset not wired has an explicit regeneration or supersession record with a reason.

## Current Evidence

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

## Native-Life UX Gap

User playtesting found a separate K6 follow-up: native-life hazards can look like old
procedural plants or ground props, apply stamina/exposure pressure, and still allow a click
or attack to mine the hex underneath. Today the sim generates native life as tile-anchored
sites with renderer-local bob/graze/walk animation. They do not yet roam as full AI actors.

Before K6 can be called player-ready, native life needs an input/placement pass:

- Add a native-life pick target that wins over terrain mining when the reticle/tap is on a
  visible creature or hazard.
- Route that target to inspect, tend, ward, scare, or tool-readiness feedback instead of
  silently striking the underlying hex.
- Block structure/block placement on occupied native-life tiles unless the placement action
  explicitly relocates or clears the encounter.
- Name the pressure source in HUD/readback when a hazard drains stamina or raises exposure.
- Suppress any remaining procedural body fragments that compete with the approved GLB skin,
  while keeping intentional reward/warning overlays.
- Keep the current rule visible in docs and debug output: native life is tile-anchored for
  this slice; roaming/herd AI is a later combat/ecology node.

## Next Critical Slice

K1, K2, K5, and K6 now prove the repeated static-family and first animated-family paths for
pickups, resource nodes, vegetation, and native creatures. Continue with K3/K4 functional
home and waterline props, then close the K6 native-life UX gap so hazards and helpers feel
targetable, readable, and blocked from accidental terrain/placement interactions.
