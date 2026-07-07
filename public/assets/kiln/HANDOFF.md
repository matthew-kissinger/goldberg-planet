# Kiln Asset Drop — Handoff & Wiring Guide

**Drop 1 · goldberg-planet** · generated with [Kiln Studio](https://app.kilnstudio.tools) `/v1`
(`google:gemini-3.5-flash`), palette-locked to `sphere-planet`.

This folder (`public/assets/kiln/`) carries a batch of authored GLB assets meant to replace
the game's rough procedural placeholder geometry with consistent, palette-matched models. It is
a **handoff to whoever wires these into the renderer** — read this before plugging anything in.
It is also a **learning loop**: the pipeline is not down pat, orientation and scale are not
guaranteed, and not every asset is final. Analyze each asset (geometry, animation, dimensions,
size, palette) and adjust per asset rather than assuming a uniform import.

---

## What's here

```
public/assets/kiln/
├─ HANDOFF.md              ← this file
├─ ASSET_MANIFEST.json     ← machine-readable, one record per asset (READ THIS)
└─ generated/<slug>/
   ├─ model.glb            ← the asset
   └─ asset.json           ← raw Kiln response (prompt, palette, quality, tags)
```

The generator, palette, prompts, and per-asset config live one level up in
[`tools/kiln/`](../../../tools/kiln/) — that's the portable pipeline (README + knowledge + skills
+ scripts + `assets-catalog.json`). The live API token is **not** committed (it lives only in
`tools/kiln/.env.local`, which is gitignored).

**Counts:** 64 catalog entries → **61 ready**, **3 unused** (see "Left to code" below).
Categories: structures/props, 12 shrines, 12 resonance nodes, 9 animated creatures, trees,
craters, resource drops.

---

## How to read `ASSET_MANIFEST.json`

Top-level: `palette`, `hexReference`, `counts`, `wiringNotes`, and `assets[]`. Each asset record:

| field | meaning |
|---|---|
| `slug` / `title` | id + display name; `file` is the GLB path relative to this folder |
| `category` / `role` / `tier` / `footprint` | Kiln taxonomy + intended world footprint (`single` = one hex, `small` = sub-hex, `landmark` = 1–2 hexes) |
| `status` | `ready` to wire, or `unused` (with `unusedReason`) |
| `replaces` | best-effort pointer to the procedural code this supersedes — **verify before ripping anything out** |
| `geometry.triangles` / `meshCount` / `nodeCount` / `materialCount` | budget + structure |
| `geometry.hasSkin` | **false on everything** — no skeletons (see Animation) |
| `geometry.bboxLocal.size` | `[x,y,z]` extent in **raw GLB units**, transforms NOT baked — an approximate size, not a final scale |
| `animations[]` | `{name, channels, durationSec}` per clip (e.g. `idle`, `walk`) |
| `animationPlayback` | `static`, or how to drive the clips |
| `paletteId` / `kilnTris` / `instanceability` | palette id, Kiln's own tri count, and an instanceability grade (A–C) |
| `prompt` | the exact text prompt that produced it (full provenance; edit + regenerate via the pipeline) |

---

## Wiring guidance

**1. Scale to the hex, don't trust raw size.** `bboxLocal.size` is local-space and does not bake
node transforms, so treat it as a rough extent. The hex tile is **~5.6 world units flat-to-flat**
(`hexReference.flatToFlatWorldUnits`). Scale each asset so its footprint matches its intended
`footprint` (single/small/landmark), then eyeball in-engine.

**1b. Modular building pieces will NOT agree on proportions — this is the biggest wiring risk.**
Each asset was generated independently with **no shared dimensional contract**, so the pieces that
are meant to assemble into a structure — **`door-kit`, `window-frame`, `roof-bundle`,
`dock-segment`, `root-cellar`, `compost-bin`** (and anything else the player crafts and places into
a house) — do not share a wall height, opening size, wall thickness, or grid unit. Kiln has no idea
the door and the window belong to the same wall. Concretely: the door's opening may not match the
window's, the roof wedge won't span a wall built to the door's width, the dock plank width won't
tile. **If these are craftable placeables the player snaps together, they will look broken until the
game imposes the dimensional contract, not the assets.** Options, cheapest first: (a) treat each GLB
as *decoration inside* a code-authored, correctly-proportioned socket (the existing procedural frame
stays the load-bearing collider/snap volume; the GLB just skins it); (b) per-asset normalize each
piece to a shared module grid at import (uniform scale + offset so openings/edges land on grid
lines); (c) regenerate the whole kit as ONE Kiln *pack* so it shares a style/scale context, then
still normalize. Do **not** assume raw scale — measure each piece's opening/edge against your build
grid and snap. This is exactly why placement + snapping has to be solid before the house kit ships.

**2. Animations are skeleton-free node-transform clips.** `hasSkin` is false everywhere — Kiln
keyframed the mesh parts directly (transform channels on nodes), which lines up with the game's
existing procedural-animation-by-mesh-name convention. Play them with a `THREE.AnimationMixer`
per instance and select clips by name (`idle`, `walk`). No rig binding, no bone retargeting. The 9
creatures each ship `idle` + `walk`; everything else is `static`.

**3. Palette is already baked in.** These were generated with `optimizedPalette:true` against the
saved `sphere-planet` palette, so vertex colors/materials are already snapped to the game's 10-slot
palette (grass, dirt, rock, sand, snow, wood, stone-dark, foliage, water-glass, glow). No recolor
needed; just make sure your material setup respects vertex colors / the emissive `glow` slot.

**4. Orientation is not guaranteed.** Text-to-3D picks "up" stochastically; some assets want a
90-degree axis correction. The review viewer captures per-asset fixes as a small ledger — if an
`ORIENTATION_LEDGER.json` is included, apply those rotations at import; otherwise correct per asset
as you place them (and send fixes back so we bake them into the pipeline).

**5. This is iterative.** Regenerate any asset by editing its prompt in
`tools/kiln/assets-catalog.json` (set `"regen": true`) and running
`node scripts/batch.mjs <slug>` from `tools/kiln/`. One call ≈ 60–70s. Palette + config are handled
by the runner.

---

## Left to code (the 3 `unused`, and why — these are the learnings)

Some shapes text-to-3D fights hard enough that the existing procedural geometry is simply better.
Marked `unused` so they **don't** get wired in:

- **`cave-mouth-arch` / `-dry` / `-sea`** — Caves in this game are *real carved voxel voids*
  (`src/world/caves.ts` carves continuous passages; `src/sim/caveMouths.ts` finds where one breaks
  the surface). The entrance is a genuine hole in the terrain, so a hex-sized arch prop just reads
  as a little door sitting inside a bigger gap. Keep the bare carved entrance (or the existing
  `src/render/caveMouths.ts` dressing). No scene switch / portal — you walk into the same world.

- **`roof-bundle`** *(currently `ready` as a plain wedge — under review)* — The word "roof"
  repeatedly made Gemini hallucinate an entire house. It only behaved once the prompt described
  pure geometry ("triangular prism wedge," no roof/house/thatch words). If the wedge doesn't pass
  review, fall back to the procedural plank panels.

- **`tree-pine`** *(now `ready`)* — Went through several rounds: "needle/branch/layered" language
  made it spawn random spikes. It only came out clean when described as **smooth solid cones** with
  spikes explicitly forbidden. Kept because the smooth-cone version reads well; if it regresses,
  the game's procedural conifer is the fallback.

General rule this drop established: **Kiln wins on props and creatures with real volume; it fights
thin/spiky/primitive shapes the engine already draws cleanly.** Prompt for smooth solid geometry,
forbid the clutter words, and describe geometry not semantics when a noun carries a strong prior.

---

## Provenance

- **Model:** `google:gemini-3.5-flash` via Kiln `/v1` (async: submit → poll → download presigned GLB).
- **Determinism:** none — Kiln does not accept a seed, so every regeneration is a fresh roll.
- **Prompts:** the exact prompt for every asset is in each record's `prompt` field and in
  `tools/kiln/assets-catalog.json` (with a shared `styleSpine` + `footprints` map appended at
  generation time).
- **Palette:** saved `sphere-planet` palette, 10 slots, applied via `optimizedPalette:true`.
