# Kiln Generated Asset Intake Gate

This is the H4 external-asset intake node for Hearth and Horizon. It exists to prevent
generated GLBs from becoming runtime dependencies just because they appeared in
`public/assets/kiln/generated`.

## Current Decision

The local Kiln drop is quarantined. It can be audited and used as source material, but it
should not be imported into the runtime or committed as shipped game content until it passes
the intake gates below.

Run:

```bash
npm run proof:kiln-assets
```

The proof writes `output/kiln/kiln-asset-pack-proof.json`. If the local generated pack is
absent, the command records a skipped proof unless `KILN_ASSET_PACK_REQUIRED=1` is set.

Current proof result, 2026-07-07:

- 64 generated asset directories found under `public/assets/kiln/generated`.
- 64 valid GLB 2.0 files, 5.76 MiB total, largest GLB 344.6 KiB.
- No integrity failures and no detected `ks_live_` tokens, bearer headers, HTTP/presigned
  URLs, or package download references inside asset sidecars or GLBs.
- 28 runtime-readiness warnings remain: the optional catalog is absent on `main`, several
  assets are C-grade or high-draw, and a few high-triangle candidates need explicit
  acceptance or regeneration before runtime import.
- A safety lane previously found an extra UUID camp-lantern asset outside the catalog; the
  current proofed local pack no longer contains an orphan directory. Future orphan outputs
  must be named/registered or deleted before promotion.

## DAG Node

| Node | Owner | Depends On | Exit Gate |
| --- | --- | --- | --- |
| H4 generated asset intake | Main orchestrator plus asset, UX, and safety reviewer lanes | A4, H3 | Generated pack has no secrets/presigned URLs, every asset has valid GLB magic and metadata, runtime candidates are listed with risks, and no raw generated drop is committed by accident |

Parallel lanes for this node:

- **Safety/tooling lane**: verify `.env.local`, presigned URLs, source kits, and generated
  drops stay out of commits.
- **Art readability lane**: rank avatar, waystone, cave-anchor, cave-mouth, home-kit, drop,
  and creature candidates by whether a player can name the noun and likely verb at normal
  play distance.
- **UX/control lane**: decide which assets support the survival loop next instead of adding
  decoration without a player-facing action.
- **Main lane**: add the proof gate, update the DAG ledger, and leave runtime import
  deferred until the proof says what to ship.

## Runtime Acceptance Criteria

No generated GLB becomes a runtime asset until it has:

- Stable `asset.json` metadata with `status: "ok"`, `paletteId: "sphere-planet"`, a useful
  prompt, category, tags, and quality numbers.
- Valid GLB 2.0 magic and matching declared length.
- No embedded `ks_live_` token, bearer header, `http(s)` URL, presigned URL marker, or
  package download reference.
- Size, triangle, draw-call, material, and instanceability warnings either fixed upstream or
  accepted in a written note.
- A runtime manifest entry that declares scale, pivot, interaction socket, collision proxy,
  LOD/repetition policy, and the fallback procedural asset it replaces.
- A blind screenshot readability pass on desktop and phone where a reviewer can identify
  the object without reading debug labels.
- A debug-off proof frame when evaluating art readability. HUD-open frames are useful only
  when the specific question is occlusion or touch/gamepad reachability.

## First Runtime Candidate Shortlist

The first pass should favor gameplay nouns that close existing loops:

- **Route and cave readability**: `waystone`, `cave-anchor`, `cave-mouth-arch`,
  `cave-mouth-dry`, `cave-mouth-sea`.
- **Functional home kit**: `workbench`, `campfire`, `chest`, `bedroll`, `door-kit`,
  `window-frame`.
- **Food and shore loops**: `crop-plot`, `fish-trap`, `shore-net`.
- **Drops and resources**: `drop-wood-logs`, `drop-ore-chunk`, readable resource nodes.
- **Native life/hazards**: harmless `creature-moss-puff` and `creature-reedback-grazer`
  before aggressive hazards, then `creature-shell-skitter`, `creature-scree-snapper`, and
  cave hazards once combat/ward rules are ready.

Defer `creature-cave-blinker`, `creature-tide-lurker`, and the larger shrine/landmark
variants until triangle, draw-call, scale, pivot, collision, and screenshot-readability
warnings have explicit owner acceptance.

## Next DAG Edges

1. **H4.1 runtime manifest pilot**: choose one family only, preferably `waystone` or
   `cave-mouth-dry`, and declare scale, pivot, collision proxy, fallback procedural asset,
   and allowed state overlays.
2. **H4.2 blind readability proof**: capture desktop and phone screenshots with debug labels
   off. A reviewer should identify noun and likely verb at one to three route rings.
3. **H4.3 GLTFLoader pilot**: load the chosen family through a manifest, keep procedural
   overlays for gameplay signals, and retain the code-authored fallback.
4. **I2/J1 device proof follow-up**: extend the responsive proof matrix to landscape
   tablet/phone and full survival verbs before new panels or build/combat verbs widen.

## Room For Wonder

Keep a small reserve for assets that do not immediately optimize the loop but make the
planet feel authored: shrine variants, storm or crater landmarks, odd root-vaults, and
strange harmless creatures. They still need the same proof gate; wonder is not an excuse
for unclear silhouettes.
