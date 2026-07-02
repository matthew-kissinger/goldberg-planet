# Goldberg Planet

A browser prototype of a walkable, swimmable, flyable, mineable, buildable spherical planet
whose surface is a true Goldberg polyhedron — hexagons plus exactly twelve pentagons —
continuous from a footstep on a beach to the whole planet hanging in space.

**Play it: <https://matthew-kissinger.github.io/sphere-planet/>**

Best in a WebGPU browser (Chrome/Edge); it falls back to WebGL2 automatically everywhere else.
Chop twelve wood, press E, and fly around the world.

| | | |
|---|---|---|
| ![The plane over a coast](media/plane.jpg) | ![A forest](media/forest.jpg) | ![The planet from orbit](media/orbit.jpg) |
| the wooden plane you craft | forests grow from the same seed | the whole planet in frame |

## Run locally

```
npm install
npm run dev      # open the printed URL
npm test         # 24 topology/world/trees/storage/persistence tests
npm run build    # typecheck + production bundle (deployed to Pages by CI)
```

URL params: `?seed=anything` (world seed), `?m=192` (Goldberg frequency), `?gpu=gl`
(force the WebGL2 fallback), `?creative=1` (999 of every block + the plane pre-crafted).

## Controls

| Input | Action |
|---|---|
| click | lock mouse — or **drag to look** where pointer lock is unavailable (embedded previews) |
| WASD + mouse | move / look |
| Space | jump; swim up in water |
| Shift | sprint / flight boost |
| LMB | mine terrain / **chop trees** (+6 wood each) |
| RMB | build the selected block |
| 1–5 | hotbar: dirt · rock · sand · snow · wood — mining feeds the counts, building spends them |
| **E** | **the plane**: craft it once for 12 wood, then board / stow anytime |
| W / S (flying) | throttle 16–88 m/s |
| look up / down (flying) | climb / dive — **level flight holds your height over the terrain** |
| mouse wheel | one continuous axis from first-person to whole-planet orbit and back |
| F | creative free-flight |
| G / O | autopilot circumnavigation / orbit pull-back demo (both capture frame metrics) |

## The survival loop

Trees grow in forest clusters on grassland — deterministically from the seed, like everything
else: a released region regrows the same woods, minus what you chopped (the chopped set is
sparse state, independent of mesh residency, exactly like column edits). Chop six wood out of
a tree with LMB; twelve crafts your plane. Mining yields blocks by material (grass crumbles
to dirt, seabed to sand); the hotbar builds them back anywhere, and placed cells **remember
their material** through release and regeneration.

## The plane

The plane is the traversal mechanic: velocity chases wherever you look, W/S set the
throttle, and — the part that makes it feel like flying around a *planet* — **flying level
holds your altitude above the ground, not above sea level**. The flight model samples the
column field under you and ~1.5 s ahead of you, so rising terrain lifts you over ridgelines
and falling terrain lets you sink back down the far side, all the way around the sphere if
you like (the autopilot does exactly that lap for the metrics below). Touching ground,
water, or a cliff stows it; E brings it back mid-fall.

## Shape and identity

- Tile ids are **combinatorial, not spatial**: icosa **vertex** (12), icosa **edge** +
  offset, or icosa **face** + interior (i,j) — an atlas of 20 charts stitched by canonical
  ownership of shared features. No global coordinate chart exists in addressing, which is
  why the twelve pentagons are unremarkable: they're just the degree-5 ids. Neighbor lists
  are explicit and CCW-ordered ([goldberg.ts](src/geo/goldberg.ts)).
- **GP(192,0)** at a **900 m radius**: 368,642 tiles (~5.2 m across), 12 of them pentagons.
- Every tile carries position, boundary polygon, ordered neighbors, and an oriented local
  frame; trees reuse that frame, so the mesher and the chop-picker agree on where a trunk is.
- **Watertight by construction**: a shared corner is the normalized centroid of the three
  owning tile centers summed in ascending-id order — bit-identical floats from all sides,
  asserted by test.

## Volume, editing, persistence

- One **global radial layer grid**: 148 uniform 1.25 m cells spanning +130…−55 m around sea
  level, then ×1.5 growth per layer to a single bedrock cell — **163 layers**, so resolution
  decays with depth and storage is O(tiles), never O(R³). Edited columns cost ~64 B
  (+1 B/layer once something is placed), only when touched. Columns are bitmask runs:
  tunnels, overhangs, and caves work.
- **Edits are permanent and survive residency cycles** — verified by unit test (edits +
  chops replayed over regenerated terrain rebuild byte-identical meshes, wood stays wood)
  and live `persistTest()`: edit, release *every* chunk mesh on the planet, regenerate —
  masks untouched, mesh byte-identical.
- Picking ray-marches the same column field the mesh is built from (trees get an exact
  ray-vs-axis test against their deterministic placement); collision reads columns too, so
  physics works even where meshes aren't resident.

## Streaming and rendering

- ~1,800 chunks of ≤ ~256 tiles stream inside an angular cap sized to the *peak-visibility*
  horizon (eye horizon + acos(R/(R+H_max)) ≈ 0.48 rad, capped at 0.88), with hysteresis and
  a 4.5 ms/frame build budget. **Trees are meshed into their chunk's buffers** — they
  stream, release, and rebuild with the chunk, zero extra draw calls.
- The **far view** is a frequency-96 geodesic (~92k verts) sampling the same terrain field,
  sunk 6 m, always resident; triangles fully covered by resident chunks are filtered from
  its index. The **water** is an order-7 geodesic (163,842 verts, ~7.8 m edges — near tile
  scale) whose per-vertex shore depth is sampled from the **layer-quantized** surface, so
  the depth tint and foam band hug the actual hex terraces; slow swells + short chop
  displace it and a moving ripple field breaks up the specular highlight.
- **Camera**: floating origin (f64 sim, camera pinned at 0,0,0); one continuous wheel axis
  from first person to orbit (the first/third transition is a smooth ramp plus a character
  fade, not a cut); the third-person boom **ray-casts the column field** and pulls in ahead
  of terrain, regrowing gently; pull-back turns radial so orbit sits directly above you.
- **WebGPU first** via `three/webgpu` (r185); automatic WebGL2 fallback (`?gpu=gl`).
- Gravity pulls toward the core; "up" is the local radial normal; heading is a
  parallel-transported tangent — no poles, no gimbal, pentagons included.

## Measured (RTX 3070, 1080p @ 145 Hz, Chromium, GP(192,0) / R=900, with trees + high-res water)

| Measurement | Result |
|---|---|
| Topology build (368,642 tiles, ids + CCW neighbors) | 192–294 ms |
| Far sphere + order-7 water build | ~290 + ~250 ms (sliced behind the splash) |
| **Traversal**: full circumnavigation (5.65 km at 110 m/s, 54 s) | **143.9 fps avg** (display-locked), p50 6.9 / p95 7.2 / p99 8.9 ms, max 26.9 ms, **0 frames > 33 ms** |
| Streaming during that lap | 1,492 loads / 1,313 releases; ~320–410 resident, ~612k tris |
| **Plane flight** (28 s, 1.98 km, throttle 72) | 144.0 fps avg, p99 7.3 ms, max 9.3 ms; terrain-follow held AGL through a ridge crossing |
| **Orbit round-trip** (ground → whole planet → ground) | 143.5 fps avg, p99 10.3 ms, max 21.2 ms, zero streaming |
| Mine/place/chop incl. localized chunk rebuilds | avg 2.8 ms, max 4 ms per edit |
| Edit persistence (release all → regenerate) | mask + mesh byte-identical, verified live |
| Camera obstruction (32.8 m boom into a 14.6 m cliff) | pulled in to 2.3 m, 1.9 m above ground — no clip, no teleport |
| Chunk mesh build (with trees) | avg 1.44 ms, p95 2.4 ms |
| WebGL2 fallback | boots the full feature set, 144 fps at spawn |

Test suite: 24 tests — icosahedron invariants; 10m²+2 counts with exactly 12 pentagons;
neighbor symmetry; CCW winding and bit-identical shared corners; id round-trips; seam
agreement; `tileOf` vs brute force; layer-grid inverses; terrain determinism and
ocean/land/mountain balance; column edit semantics incl. tunnels and immutable bedrock;
**per-cell placed materials with replay persistence**; sparse-edit storage scaling; chunk
partition exactness; mesh determinism; edit locality; **tree determinism, chopping, and
regeneration**; edit persistence through regeneration.

## Honest limitations

- Edits and trees don't render into the far-view proxy (sub-pixel at that distance); trees
  appear with their chunk at the residency edge, so a distant ridge line can gain its
  forest as you approach.
- Tree trunks have no collision — you walk through them (chopping works everywhere though).
- Beach tiles step ~0.35 m above the water plane; the far sphere sits 6 m low, so
  partially-covered coastal triangles at the residency boundary can peek through the sea
  surface far away.
- Collision is a column-sampled point capsule (step-up, head bump, wall block) — fine at
  these speeds, not a swept hull.
- Meshing stays on the main thread because measurement says it can (p95 2.4 ms); the mesher
  is three-free and typed-array pure, ready to move to a Worker if a bigger planet needs it.
- Progress persists for the session (edits, chops, inventory, the plane); there is no save
  file yet.
