# Kiln Asset Intake Gate

This is the H4 external-asset intake node for Hearth and Horizon. It keeps generated
GLBs useful without letting them bypass gameplay readability, scale, snapping, performance,
or source-control hygiene.

`docs/kiln-asset-intake.md` is the canonical wiring doc. `public/assets/kiln/HANDOFF.md`
is only a short pointer back here so the asset folder does not carry a second source of
truth.

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
5. Wire one runtime family through a manifest-driven loader.
6. Prove desktop and phone screenshots, fallback behavior, and that no runtime requests hit
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

Runtime pilot candidates from the proof:

- `chest`, `campfire`, `bedroll`, `crop-plot`, `cave-anchor`, `drying-rack`,
  `weather-vane`, `waystone`.
- Resource/drop candidates: `drop-wood-logs`, `drop-ore-chunk`.
- Resonance/resource-node candidates: `node-hearth-coal`, `node-rain-reed`,
  `node-salt-shell`, `node-lantern-shard`, `node-root-pod`, `node-red-nodule`,
  `node-bell-crystal`, `node-horizon-shard`.

Deferred until scale, snap, budget, readability, or animation proof exists:

- Modular house/build pieces: `door-kit`, `window-frame`, `dock-segment`, `roof-bundle`,
  `compost-bin`, `root-cellar`. These were generated independently and do not share wall
  heights, opening sizes, wall thickness, or grid units. The game must impose the
  dimensional contract. Cheapest safe path: keep the procedural socket/collider/snap volume
  as load-bearing and use a GLB only as decoration inside that socket. The first code-owned
  door/window/roof socket contract now lives in `src/sim/structures.ts` and is proved by
  `npm run proof:c2-c3-building-snap-grid`; raw modular GLBs remain deferred until each
  asset is normalized to that socket and screenshot-proved.
- Functional props with warnings or watery placement needs: `workbench`, `rain-cistern`,
  `fish-trap`, `shore-net`, `lantern-post`.
- Shrines, craters, and trees: defer for blind screenshot readability, world-placement
  scale, repetition/LOD policy, and collision proof.
- Creatures: all 9 have `hasSkin:false` and node-transform `idle`/`walk` clips. Wire later
  with `THREE.AnimationMixer` by clip name after native-life behavior/combat rules choose
  harmless, useful, and aggressive roles.

Rejected for runtime:

- `cave-mouth-arch`, `cave-mouth-dry`, `cave-mouth-sea`. Keep carved terrain entrances and
  code-authored cave-mouth dressing.

## Room For Wonder

Reserve a small lane for assets that make the planet feel authored rather than merely
efficient: strange root-vaults, storm seats, glass-rain craters, harmless odd creatures,
and shrine silhouettes that invite investigation. Wonder still goes through the same gate;
it earns room by being readable, performant, and connected to a verb.
