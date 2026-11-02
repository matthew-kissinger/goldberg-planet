# Performance review

2026-11-01. Production-build evidence; bounded desktop qualification. The
[portable release receipt](qa/survival-polish-2026-11-01.json) is tracked in the
repository. Raw `output/` report links refer to ignored local captures reproduced
by the included scripts; complete hardware/seed qualification is not claimed.

## Cloud, terrain and interface polish

The November 1 release candidate is `index-BoJ8WI4Y.js` / `index-DMR-J42o.css`.
Cloud integration now covers the complete visible cloud interval with a fixed
sample budget, skips clear air while retaining both shell lobes, and uses
length-normalized exponential extinction with soft vertical envelopes. This
addresses hard coverage changes without hiding foreground clouds behind liquid.
The current terrain proxy matches the fine layer datum and sits one fine layer
below it, replacing the previous twelve-metre offset for expedition worlds.
Legacy recipes retain their existing radius contract. The new regression checks
all six recipes across hundreds of elevations against their collision layer tops.

The interface now uses an astrolabe-inspired dark enamel/brass treatment, etched
route markers, instrument meters and a side-mounted destination rail. Touch uses
a horizontal rail and retains 44px controls, keyboard focus and reduced-motion
support. The first five-world rendered pass completes 86 checks without renderer
errors or warnings; its `index-Dnb_HYm3.js` differs from the candidate by the later
cloud lower-bound clipping and the world-heading contrast correction. Its images
and timings remain diagnostic evidence, rather than final candidate qualification.

The longer Survival runner (`scripts/playtest-survival-long.mjs`) uses actual
gathered drops, mined columns, station placement and recipe spending. It supplies
steering assistance through normal movement/flight intents, without inventory,
health or position grants. Checkpoints retain actual isolated autosaves for
resumption. Early harness failures are preserved: walking without jumps stalled
at a ledge; repeatedly targeting a removed natural top failed to mine further
cells; launch retries were needed after automatic stowing on terrain contact.
The corrected runner uses normal jumps, the current remaining solid layer and
normal boarding retries. A globe-wide nearest-tree search was also replaced with
a bounded nearby search. Its corrected gathering/crafting pass has no intervals
over 50ms, versus five such intervals in the earlier unbounded-search setup.

Physical flight review also exposed excessive dismount momentum. Stowing now
limits tangential speed to walking pace and radial velocity to -8…4 m/s in the
local gravity frame. Position and physical SOI handoff momentum are preserved.
The dismount and save-vitals regressions pass alongside terrain and streaming
checks: **274 tests / 47 files**. Health, hunger and suit charge now survive reload;
older saves without those optional fields retain their established defaults.
The later diagnostic run also revealed that attaching another Puppeteer client
without `defaultViewport:null` changed the live viewport to 800×600. Renderer
resize captures and CPU-profiler windows are retained separately; they cannot
establish ordinary travel frame times. The verification run uses no live client
attachments, profiler or screenshots during play windows.

### Longer Survival playtest and the physical-flight stall

The `index-DG1RR8mt.js` Survival circuit ran **16.25 minutes** at M192,
1440×900/DPR1 on Chrome 156 / RTX 3070 / Ryzen 7 3700X. It resumed a real isolated
save whose timber, ore, stations, spear and Starfarer had been earned by the earlier
gather/craft pass. The runner changes steering and normal control intents; it does
not change player position, health, inventory supply or travel mode to teleport.
It visits all six worlds through actual sphere-of-influence crossings, orbits to
land, walks and dwells for a minute on each, hunts three live animals, constructs
a cooking fire, cooks six meals and consumes food during the journey. **18 checks
pass without renderer errors or warnings.** The earlier earned-resource pass also
completes without a frame interval over 50 ms.

The seven surface windows have no intervals above 50 ms (maximum 8.6 ms). The
physical-flight windows expose **seven intervals above 50 ms, maximum 104.2 ms**.
This is the adverse result that the earlier no-save teleport routes missed.
[Long Survival report](../output/survival-long/results.json),
[earned-resource pass](../output/survival-long/pre-orbit-navigation-results.json).
The latter retained pass includes its subsequent unsuccessful landing-navigation
attempt; it is not presented as an entirely successful route.

CPU profiling did not attribute the pause to a long JavaScript function. Browser
tracing then located it in render submission; persistent CPU-stage peaks confirmed
that saving, physics and habitat discovery were not the long stage. Fine-grained
renderer instrumentation identifies **112.9 ms in geometry updates, including
109.2 ms creating geometry attributes**, inside a 146.9 ms render call. There were
no slow late pipeline compilations. Initializing hidden compute jobs again did
not improve it: the existing early `precompile()` already covered them, and the
redundant experiment was removed. Pausing hidden orbital geometry alone also did
not remove the outlier. [Renderer diagnostic](../output/survival-render-diagnostics/results.json).

The remaining cause was first-draw initialization after frustum culling. CPU-ready
resident chunks could accumulate without GPU buffers while looking away; a turn
toward the surface made the renderer initialize hundreds together. New chunks now
receive one main-camera draw at their bounded admission point before normal
frustum culling resumes. A shadow-only draw cannot end this priming step. Hidden
orbital admission also pauses, retaining its bounded CPU completion queue. Collision
and existing resident data remain available, while the close-fitting far proxy
covers unadmitted areas. No new scene compile is issued during travel.

Two subsequent fresh-browser, screenshot-free physical flights on `index-CgB-Ykep.js`
build use the same earned Canyon save and Vespera destination. Both finish with
**zero intervals above 50 ms**, maxima **20.9 / 20.8 ms**, p95 **7.1 ms**, no long
tasks and no renderer errors/warnings. The first run's worst render submission is
13.2 ms. These are bounded physical-flight repeats, not a second complete long
soak or GPU timer measurements. System/driver caches and other user applications
are not controlled. [Repeat 1](../output/survival-admission-final-1/results.json),
[repeat 2](../output/survival-admission-final-2/results.json).

That build also passes 86 WebGL world/region/orbit checks, 30 native UI
checks (including real mode-reload vitals and packed vehicle naming), and eight
navigation checks. Aurelia's coast, high and orbital representations pass on both
backends with complete far coverage and no fine chunks drawing at orbit. These
functional captures have zero renderer errors/warnings. The new desktop atlas and
touch portrait were inspected as rendered. [WebGL](../output/polish-final-gl/results.json),
[UI](../output/expedition-ui-worlds-v3/checks.json),
[navigation](../output/navigation-worlds-v3/checks.json),
[home distances](../output/rendering-smoke/results.json).

The release candidate differs only by retaining the far cloud lobe at grazing
angles. It passes a focused 17-check WebGPU Pyraxis/region/orbit route, with no
interval above 50 ms (maximum 27.9 ms), and an eight-stage fixed-clock WebGL cloud
and liquid isolation capture with no errors or warnings. These focused checks
validate the last shader adjustment; the earlier UI and all-world reports retain
their original bundle identities. [WebGPU route](../output/cloud-final-gpu/results.json),
[cloud inspection](../output/cloud-polish-shell-final/results.json).

A third fresh-browser physical Survival flight on the exact release bundle also
passes: **20.7 ms maximum**, p95 7.1 ms, zero intervals over 50 ms, zero long tasks
and no renderer errors/warnings. It uses the same earned save and physical route,
without screenshots or attached diagnostic clients. The complete 16-minute circuit
still predates the stall fix. [Release flight](../output/survival-release-final/results.json).

## Five-world rebuild — previous verification

The preceding production runtime was `index-B5YXkvCT.js`, with worker
`meshWorker-llFOppLU.js` and the unchanged modular explorer `explorer-DbysfKQk.glb`.
`npm test` passes **269 tests in 47 files** and `npm run build` passes. The existing
large-bundle advisory remains: the main JavaScript is 1,286.71 kB, 377.47 kB gzip.
All five foreign worlds now use the `worlds-v3` spherical terrain recipe, native
growth, named regions and per-world surface, sky and liquid profiles. Aurelia's
recipe remains `aurelia-v2` within the new save namespace.

The new terrain sampler uses a bounded noise budget and precomputed impact centers;
meshing, collision, workers, vegetation and distant surfaces share its field. Six
vegetation managers allocate only their native prototypes once. Travel switches
visibility and profile uniforms, with all vegetation and optional weather/sky/ocean
pipelines included in startup warmup. Growth discovery is incremental; instance
counts remain capped at 320 tall forms and 600 understory forms. The renderer uses
shared instancing, not a newly introduced meshlet pipeline. The optional portable
vegetation kit contains 39 GLBs; all pass independent Khronos validation without
errors or warnings. These are code-authored exports, not Kiln bakes.

Visual review exposed and corrected dark daytime desert skies, oversized orbital
debris, thick atmospheric rims, flat palm fronds, reversed fungal-cap faces and
fine lava shimmer. A remaining offshore line was isolated with terrain, sky,
shadows and other scenery removed. Clamping the interpolated shoreline attribute
before fractional powers removes its invalid negative inputs and the visible line.
The final targeted shader diagnostic (`index-Bmvs5CHf.js`, identical rendering
source to the current build) has zero errors/warnings and retains full-scene,
ocean-only, orbit and Aurelia views in
[the diagnostic report](../output/ocean-outline-corrected-final/results.json).
The later bundle change fixes planted-tree save restoration and planting text.

Compatibility checks cover worker/edited-column parity, three resource seeds per
world, native planting materials, atmosphere/liquid fauna exclusions and safe
home-world save carry-forward. A real save round trip also checks partially
chopped planted trees on naturally barren Aurelia and Vespera ground: edits and
seeds must be restored before damage is validated. The original `aurelia-v2` save
slot is preserved; only compatible home-world state carries into `worlds-v3`.

### Travel: all five worlds, three fresh-browser repeats

Chrome 156.0.8078.74, WebGPU, Ryzen 7 3700X / RTX 3070, M192, seed `GP192-01`,
1280×720 and DPR1. Each fresh browser visits planets 1–5 cold, then returns through
4–0 cached, with the streaming queue drained between windows. A window includes the
request, preparation, swap and 2.5 seconds after cold readiness (1.5 seconds cached).
No screenshots, CPU profiles, builds, tests or other agent GPU captures run in these
windows. Other user applications and the driver shader cache are not controlled.

**All 30 measured travel windows have zero rAF intervals over 50 ms.** Each window's
p95 is 7.1 ms; the worst interval is 27.6 ms. Cold callbacks take 0–0.5 ms, preparation
slices at most 2.1 ms, and cold commits 3.0–5.9 ms. Cached commits take 2.9–5.4 ms;
their worst interval is 8.9 ms. Preparation elapsed time includes frame yields and
does not represent a blocking task. Fine worker streaming continues after the swap.

| First arrival | Preparation elapsed, three runs | Worst frame interval |
| --- | ---: | ---: |
| Vespera Shard | 154.3–175.0 ms | 27.6 ms |
| Khoros Mesa | 395.7–434.0 ms | 14.1 ms |
| Nivara Spire | 362.5–402.5 ms | 20.7 ms |
| Pyraxis | 383.8–396.6 ms | 7.3 ms |
| Mycelia Atoll | 361.4–368.4 ms | 7.2 ms |

All runs load `index-B5YXkvCT.js`, finish successfully, record no console/page/
request/HTTP/unhandled errors or warnings, and write no local saves. Startup to the
displayed world is 2.93–3.05 seconds, measured separately from travel. These are
bounded presentation-scheduling observations, not GPU timer measurements or a
universal stall-free guarantee. [Raw final travel report](../output/performance/worlds-v3-final/results.json).

The [pre-rebuild capture](../output/performance/worlds-v3-before/results.json),
`index-UBvKzvcA.js`, recorded a 166.6 ms cold Khoros interval; its cause was not
profiled. It is retained without attributing that spike to one change. The new
recipe's [CPU sampler check](../output/performance/expedition-worlds-sampler.json)
measures 22.7–30.8 ms per 50,000 height/material/moisture/forest samples versus
59.0–115.8 ms for the unversioned recipes, under possible concurrent agent load.
That supports a lower sampling cost but is not an FPS comparison. An intermediate
travel series was intentionally stopped to fix planted-save restoration; its
partial data remains in `output/performance/worlds-v3-before-save-fix/` and is not
included in the final 30 windows.

### Surface movement and regions

The final screenshot-free WebGPU route uses the same machine, seed and M192 at
1440×900/DPR1. Native Worlds/Regions controls select all five planets and fifteen
regions. Each planet has a 2.5-second arrival and an eight-second Shift+W traverse;
each region has a 2.5-second arrival and a two-second W walk. The traverses cover
36.5–36.6 m and cross beyond the immediate landing clearings. Recording resets its
rAF baseline for every window; HUD rolling histories are not used as window timings.

**All 40 windows have zero intervals over 50 ms and zero long tasks.** The largest
interval is 14.1 ms, every window's p95 is 7.1 ms, and all **81 functional checks**
pass without console errors or warnings. Snapshots show 123–164 draw submissions
including passes, 1.01–1.65 million triangles, and seven or ten vegetation geometry
resources per new world. Maximum vegetation discovery is 0.7 ms, instance commit
2.8 ms, and combined update slice 3.0 ms. Mycelia reaches its fixed 320/600 growth
limits. [Final movement and region report](../output/worlds-v3-final-gpu/results.json).

Cold startup remains separate: 2.97 seconds to the world, four rAF intervals above
50 ms (maximum 166.7 ms), and four recorded long tasks (maximum 197 ms) during the
loading/initial-frame window. This rebuild does not claim zero startup blocking.
The short traversal checks also do not certify long play sessions, low-end devices,
every seed, dense construction or continuous physical interplanetary flight.

### Backend and saved-start checks

The final [WebGL2 route](../output/worlds-v3-final-gl/results.json) loads the same
`index-B5YXkvCT.js` and passes **86 checks** without errors or warnings. It includes
all fifteen regions, five traverses, Aurelia, and every planet's landscape/orbital
representation. Screenshots are outside active recording windows; this is the
functional and visual fallback check, not the primary performance comparison.
All five orbital snapshots confirm full coarse coverage and no detailed chunks
still drawing. Daylight ground and orbit views were inspected on both backends
across the staged reviews. The original camera-zoom harness timeout is retained
in `output/worlds-v3-first-review/`; it was a capture-control failure, and the
corrected native-wheel loop completes the final five-world route.

A faint pale shape over Pyraxis lava was reviewed separately at the landscape
camera and a labelled fixed shader time of 120 seconds. It disappears with clouds
hidden, remains without the atmosphere/far mesh and with a plain ocean material,
and is suppressed by forcing ocean depth writes. The camera is above the 70–115 m
cloud band, so this is foreground cloud coverage over the liquid, not the corrected
shoreline NaN or a terrain/ocean depth fight. No blanket depth-write change was
made: it would hide foreground cloud volume. The low-step cloud integrator can
still give that subtle coverage edge a harder boundary than ideal.
[Layer-isolation captures](../output/lava-horizon-isolation-time120/results.json).

An additional saved-start check uses an isolated real Creative save on Vespera,
reloads normally, confirms its empty fauna pools, then uses the native Worlds
button to travel home. **Four checks pass on each backend**, with visible occupied
animal instances after 38.1 ms (WebGPU) and 48.3 ms (WebGL2). Click-through-readiness
plus three-second windows have maximum intervals of 34.7 and 41.7 ms respectively,
zero intervals over 50 ms and no renderer errors/warnings. This checks a saved
airless-world start separately from the home-start travel series and does not
indicate a missing-fauna warmup defect. [WebGPU](../output/vacuum-start-smoke/gpu/results.json),
[WebGL2](../output/vacuum-start-smoke/gl/results.json).

On this same production bundle, the [native interface smoke](../output/expedition-ui-worlds-v3/checks.json)
passes **28 checks** for Survival/Creative isolation, camp placement and cooking,
the Furnace/Workbench/Starfarer chain, observations/feeding, customization and
touch layout. [Navigation](../output/navigation-worlds-v3/checks.json) passes
**eight checks** for movement reset, current-world regions, cancelled/superseded
requests and drop-state retention across a diagnostic sphere-of-influence handoff.
Both report zero errors/warnings. Navigation initially asserted before the HUD's
250 ms refresh; that result is retained in `checks-before-ui-wait.json`. The runner
now waits up to one second for current-world content before asserting, matching
the region-route runner. No runtime timing or application behavior was changed
to make that check pass. These fixture-assisted checks do not replace a full
resource-gathering or physical flight playthrough.

## Previous Aurelia v2 verification

The previous Aurelia runtime was `index-UBvKzvcA.js`, with the modular 1,246,084-byte explorer
GLB. `npm test` passes **223 tests in 42 files**, and `npm run build` passes (the
existing large-bundle advisory remains). These checks cover the new world field,
tree/picking/felling agreement, fauna residency and turning, avatar mesh clearance,
mode/station policy, save payloads and warp-state reset.

The final timing captures used Chrome 156 on the local Ryzen 7 3700X / RTX 3070,
WebGPU, M192 and DPR1, with saves disabled and sound muted. Browser captures ran sequentially.
They measure rAF intervals and CPU scheduling, not GPU timer queries or guaranteed
performance on other machines. Cold travel means an uncached destination's world
data in a fresh browser process; the system/driver shader cache is not certified cold.

Three final fresh-browser travel runs at 1280×720 each include a first visit and a
cached return. **All six measured windows contain zero intervals over 50 ms.** First
visits prepare for 486.6–508.6 ms in slices of at most 2.1 ms, then commit in
6.3–7.1 ms. The request callback takes 0.3–0.5 ms. Cached commits take 3.8–4.9 ms.
The worst observed interval is 27.9 ms; each window's p95 is 7.0–7.1 ms. Fine worker
streaming continues after the prepared swap. [Final travel report](../output/performance/aurelia-v2-audio-fixed/results.json).

The six-site capture at 1440×900 separates startup, 2.5-second region arrivals and
2-second real-W walks. Screenshot and recording overhead is excluded, and each
stage resets its rAF baseline. **All twelve post-loading arrival/walk windows have
zero intervals over 50 ms**; p95 is 7.0–7.1 ms, maximum arrival interval 20.9 ms,
maximum walk interval 7.2 ms. The scene reports 109–142 draw calls including passes
and approximately 1.02–1.50 million triangles. Vegetation keeps 18 geometries;
observed neighborhoods contain 12–203 trees and 88–600 understory instances.
Maximum discovery work is 0.6 ms, commit 2.3 ms, and combined vegetation slice
2.4 ms. This is a short route check, not a sustained performance guarantee.
[Six-site report](../output/aurelia-sites-final-audio-fixed/results.json).

Startup remains explicitly separate: that run takes about 3.17 seconds to the
displayed world, with five intervals above 50 ms during its loading/initial-frame
window (maximum 201.3 ms). The loading cover prepares the pipelines and geometry;
the report does not claim zero cold-start blocking work.

The prior screenshot-free run exposed a 69.5 ms first-W interval. A separate CPU
profile identifies about 46.7 ms in `GameAudio.ensureContext`/`unlock`, inside a
52 ms first-input long task, despite `mute=1`. Muted gestures and preloads now
leave the audio device unopened; enabling sound initializes it deliberately.
The unprofiled repeat has no long tasks and a maximum interval of 7.1 ms.
The instrumented 125 ms frame is diagnostic overhead evidence, not a comparable
benchmark. The old `events.duration` field measures a capture-listener microtask,
not total input processing, and is not used as evidence; the harness now records
only the key timestamp. [Before trace](../output/performance/first-input-before/first-key.cpuprofile),
[after capture](../output/performance/first-input-after/results.json).

Functional qualification is separate from timings: native UI passes 28 checks,
navigation cancellation/arrival/drop persistence passes six, and explorer motion
passes 25 each on WebGPU and WebGL2. The final wolf reversal correction reproduces
the exact previously failing resident and measures zero error across 2,282 planted
contacts, with bounded turning. These deliberately instrumented/recorded runs are
not performance comparisons. [UI](../output/expedition-ui-smoke/checks.json),
[navigation](../output/navigation-smoke/checks.json),
[WebGPU motion](../output/expedition-smoke-gpu-modular-rig-v2/checks.json),
[WebGL2 motion](../output/expedition-smoke-gl-modular-rig-v2/checks.json),
[wolf reversal](../output/fauna-reversal-exact-ridge-corrected/checks.json).

Earlier captures and adverse results are retained below and in their original
output folders. The intermediate wind-shader deformation and the first-key audio
stall were actual defects, found and corrected rather than excluded from the record.

## Current travel preparation

First-arrival terrain and shoreline sampling now prepares detached buffers incrementally before an atomic world swap. The player remains in the current world while preparation is pending. Cached returns reuse prepared data; stale/cancelled requests cannot commit. The previous roughly 159 ms synchronous preparation path is historical, described below.

### Final build: three fresh-browser repeats

The final production bundle, `index-ENQ8A8hm.js`, completed three fresh-browser WebGPU repeats with **zero frame intervals above 50 ms across all six cold-arrival/cached-return windows**. The prior large external Node process was confirmed gone, and other agent test, build, profiling and rendering work was paused. Other user applications were not controlled. The route, M192 seed, viewport, holds and hardware match the runner described below; no screenshots or CPU profiles ran in these measurement windows.

| Run | Cold request | Prep elapsed | Slice max | Commit | Cold frame max | Cached request | Cached frame max | Frames >50, cold / return |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Final 1 | 0.4 | 467.0 | 2.1 | 5.6 | 20.7 | 4.9 | 7.2 | 0 / 0 |
| Final 2 | 0.2 | 466.7 | 2.1 | 5.4 | 41.6 | 7.3 | 7.2 | 0 / 0 |
| Final 3 | 0.3 | 508.1 | 2.2 | 5.2 | 41.6 | 5.2 | 7.2 | 0 / 0 |

All values are milliseconds. Cold frame p50/p95/p99 were 6.9/7.1/7.2 in every run. Cached frame p50/p95 were 6.9/7.1; p99 was 7.1 in run 1 and 7.2 in runs 2-3. Readiness took 472.5-513.7 ms while the old world remained visible. All three runs loaded the expected final bundle and recorded zero page errors, console errors/warnings, request failures, HTTP errors, unhandled rejections or saved-state writes. [Final raw results, samples and environment](../output/performance/travel-final/results.json).

This establishes the measured improvement for three bounded first-arrival/return repeats on this PC. It does not establish universal stall-free play, the proposed five-repeat exploration qualification, all-world travel, or performance on other hardware. The earlier bad series below is retained; the machine conditions and final build differ, so the improvement is not attributed solely to one code change.

### Earlier series with concurrent memory pressure

The dedicated [travel runner](../scripts/measure-travel.mjs) captured five fresh Chrome processes against the rebuilt production server at port 5199, then one against the frozen pre-async-travel server at port 5201. These runs used Chrome 156, RTX 3070, Ryzen 7 3700X, approximately 32 GB RAM, M192, seed `GP192-01`, 1280 x 720 and DPR 1. Each waited for a zero streaming queue for one second, measured `planet-1` arrival through readiness plus two seconds, drained the streaming queue, then measured cached return through readiness plus one second. No screenshots or CPU profiles ran inside these measurement windows. Raw intervals, bundle paths and environment metadata are retained in the reports.

**These results do not establish stall-free travel.** Four rebuilt cold request callbacks took 0.4-0.5 ms, while preparation completed over multiple frames. All five cold windows still contained frames above 50 ms. `Prep` is elapsed preparation time including yields; `Slice max` and `Commit` are wall-clock durations, which also include any OS descheduling. All times below are milliseconds.

| Cold arrival | Request | Prep | Slice max | Commit | Frame p95 | Frame p99 | Frame max | Frames >50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rebuilt 1 | 0.4 | 694.0 | 3.8 | 11.0 | 7.1 | 20.7 | 62.6 | 1 |
| Rebuilt 2 | 0.5 | 765.8 | 7.2 | 12.5 | 7.1 | 20.8 | 62.7 | 1 |
| Rebuilt 3 | 42.5 | 3346.4 | 59.9 | 12.7 | 55.5 | 76.5 | 97.2 | 21 |
| Rebuilt 4 | 0.5 | 3356.0 | 106.5 | 81.3 | 55.7 | 125.1 | 145.8 | 22 |
| Rebuilt 5 | 0.4 | 625.5 | 2.2 | 8.9 | 7.2 | 14.0 | 55.5 | 1 |
| Pre-async baseline | 305.1 | - | - | - | 7.1 | 13.8 | 305.6 | 1 |

| Cached return | Request | Frame p95 | Frame p99 | Frame max | Frames >50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Rebuilt 1 | 13.4 | 7.1 | 14.0 | 21.0 | 0 |
| Rebuilt 2 | 8.2 | 7.1 | 14.0 | 14.1 | 0 |
| Rebuilt 3 | 13.9 | 62.6 | 146.1 | 146.1 | 4 |
| Rebuilt 4 | 7.5 | 7.1 | 13.8 | 14.0 | 0 |
| Rebuilt 5 | 7.5 | 7.1 | 13.7 | 14.0 | 0 |
| Pre-async baseline | 13.2 | 7.1 | 14.0 | 21.0 | 0 |

[Five-run rebuilt evidence](../output/performance/travel-rebuilt/results.json), [single pre-async baseline](../output/performance/travel-baseline/results.json). All six runs completed with zero page errors, console errors, console warnings, failed requests or saved-state writes. Chrome advertised Long Tasks support, but the observer recorded no entries, including for the CDP-triggered 305 ms baseline callback; empty arrays are not proof of an absence of main-thread blocking. End-of-window chunk populations differ and are recorded in the raw reports, so these are not equal-scene throughput comparisons.

The machine was not isolated. During the series, a separate project's Node test process was observed using about 19.7 GB RAM, with about 3.3 GB in Windows memory compression. A short unrelated four-test run also overlapped early cases, and other visible browser tabs were not controlled. Runs 3 and 4 contain markedly worse timing and remain in the results. A [read-only snapshot after measurement](../output/performance/travel-rebuilt/machine-pressure.json) found the large process gone and about 20 GiB free physical memory. This is substantial evidence of concurrent memory pressure, not attribution of every outlier to it.

In the faster rebuilt runs 1, 2 and 5, the remaining 55-63 ms frame ended about 99-107 ms after readiness. It therefore does not coincide with the measured preparation or atomic commit. One subsequently authorized diagnostic CPU-profile/trace run on the unchanged build did **not reproduce** that post-ready stall: its largest main-renderer animation callback was 19.7 ms, render submission 14.0 ms, commit 13.4 ms, and preparation slice 2.6 ms. The largest rAF interval was 48.6 ms during early preparation. Longer 76-134 ms trace tasks belonged to the two dedicated mesh workers, not the main renderer thread. [Diagnostic timings](../output/performance/travel-diagnostic/timings.json), [CPU profile](../output/performance/travel-diagnostic/cold-arrival.cpuprofile), [trace](../output/performance/travel-diagnostic/trace.json). Profiling and permitted concurrent test work make that run diagnostic only; no exact cause is claimed for the unreproduced post-ready frame.

Repeat on an unchanged production build, without another benchmark or memory-heavy test running:

```powershell
node scripts/measure-travel.mjs http://127.0.0.1:5199/ 5 travel-repeat
node scripts/measure-travel.mjs http://127.0.0.1:5201/ 1 travel-baseline-repeat
```

Raw artifacts live in the ignored local `output/performance/` directory; retain them with this review when sharing evidence. The final-build repeat above follows this earlier series; a longer exploration soak remains separate qualification work.

## Historical streaming stabilization

The remainder records the earlier implementation and its captured limitations before incremental travel preparation and the rebuilt visual assets. Its synchronous-first-arrival observations and next-work recommendations are historical, not descriptions of the current travel code.

Moving terrain meshing into bounded worker jobs removed the large main-thread streaming spikes in this captured route. Cached return travel also became substantially cheaper. **First arrival still stalls, and this work has not eliminated all stalls.** The revised WebGPU capture spent 158.7 ms inside the first planet warp and recorded a 166.7 ms frame interval during that stage.

The comparison uses one instrumented headless Chrome run per build/backend. Baseline is an independently built production archive of commit `bfc61ce7823fc8612bf8718a5e5219575bc96387`. Revised is the local working-tree production build at capture time, including the flat integer varying used for material metadata. It has no immutable revision identifier. Both WebGPU captures used Chrome 156.0.8078.74, an NVIDIA GeForce RTX 3070, a 1280 × 720 viewport at DPR 1, seed `GP192-01`, and Goldberg frequency 192. The reference PC has a Ryzen 7 3700X and approximately 32 GB RAM.

[profile-game.mjs](../scripts/profile-game.mjs) loads `?nosave=1&mute=1&seed=GP192-01&m=192&debug=1`, using the default desktop sky/cloud settings. It records 5 seconds settling, 10 seconds idle, 10 seconds holding forward+sprint, 6 seconds at orbit zoom, 6 seconds following a diagnostic warp to `planet-1`, then 6 seconds returning to `planet-0`. Each phase retains a CPU profile, screenshot, frame-interval samples, timed game-method calls, and end-of-phase world state. These diagnostic warps do not qualify the complete flight/navigation interaction.

All times below are milliseconds. `>50 / n` is the number of captured frame intervals above 50 ms divided by all intervals in that phase. `Pump max` measures the main-thread `Streamer.pump()` call.

| Phase | Build | Frame p95 | Frame p99 | Frame max | >50 / n | Pump max |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Settle | Baseline | 7.1 | 7.2 | 784.6 | 2 / 621 | 0.1 |
| Settle | Revised | 7.1 | 7.2 | 97.1 | 1 / 720 | 0.1 |
| Idle | Baseline | 7.1 | 7.2 | 69.4 | 1 / 1446 | 0.1 |
| Idle | Revised | 7.1 | 7.2 | 76.4 | 1 / 1445 | 0.2 |
| Walk | Baseline | 7.1 | 7.2 | 76.4 | 3 / 1421 | 45.2 |
| Walk | Revised | 7.1 | 7.2 | 76.4 | 2 / 1447 | 1.7 |
| Orbit | Baseline | 7.1 | 7.2 | 55.5 | 1 / 864 | 0.1 |
| Orbit | Revised | 7.1 | 7.2 | 83.2 | 3 / 854 | 0.1 |
| First arrival | Baseline | 62.7 | 97.0 | 159.6 | 22 / 151 | 93.4 |
| First arrival | Revised | 7.1 | 7.2 | 166.7 | 2 / 870 | 3.0 |
| Return | Baseline | 34.8 | 62.5 | 409.8 | 10 / 527 | 58.9 |
| Return | Revised | 7.1 | 7.2 | 55.6 | 1 / 870 | 1.6 |

Sources: [baseline WebGPU results](../output/performance/baseline-production-gpu/results.json), [revised WebGPU results](../output/performance/revised-production-gpu/results.json). Raw artifacts live in the ignored local `output/performance/` directory; retain them with this review when sharing evidence.

The first-arrival `warpToPlanet()` call was 152.6 ms in the baseline and 158.7 ms in the revision. The cached return call changed from 403.5 ms to 9.6 ms. First visits still synchronously prepare far-terrain/ocean data; caching helps repeat visits without solving first arrival. Boot-to-ready was 4.52 seconds and 3.96 seconds respectively in these runs, with no repeated-startup claim.

The arrival workloads also differ at the measurement boundary. Baseline had installed 132 chunks containing 2,311,165 triangles, with 178 chunks queued. Revised had installed 222 chunks containing 3,640,189 triangles, with 88 outstanding and two worker jobs in flight. These are resident mesh counts from the streamer, not rendered-triangle counters. The revised capture completed more generation work during the fixed interval; the scene populations were not held equal. The corresponding walk stages ended with the same 155 chunks and 751,409 resident triangles.

A separate revised WebGL2 run used the same script with `gpu=gl`; no baseline WebGL2 comparison was captured.

| Revised WebGL2 phase | Frame p95 | Frame p99 | Frame max | >50 / n | Pump max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Settle | 7.1 | 7.2 | 97.2 | 1 / 716 | 0.1 |
| Idle | 7.1 | 7.2 | 34.6 | 0 / 1446 | 0.2 |
| Walk | 7.1 | 7.2 | 55.6 | 2 / 1445 | 1.4 |
| Orbit | 7.1 | 7.2 | 132.0 | 2 / 847 | 0.1 |
| First arrival | 7.1 | 7.2 | 159.6 | 2 / 868 | 2.2 |
| Return | 7.1 | 7.2 | 111.0 | 1 / 867 | 1.0 |

The WebGL2 first-arrival and cached-return calls took 153.0 ms and 10.1 ms. Its arrival ended with 253 resident chunks and 57 outstanding. [Revised WebGL2 results](../output/performance/revised-production-gl/results.json). All three production captures recorded zero page errors and zero console errors. The harness does not treat console warnings as errors.

Interpretation limits:

- This is one bounded, instrumented route per case. It does not meet the five-repeat qualification proposed in [exploration-direction.md](exploration-direction.md), cover all worlds, or establish performance on phones and other GPUs.
- CPU profiling and screenshot boundaries can perturb individual frame outliers. The frame sampler continues between phases, so an interval spanning a boundary can enter the next phase. The tables retain those outliers instead of removing them. Their exact causes require a trace tied to the event.
- Frame intervals measure browser callback cadence. CPU method timings and render-submission timings do not measure GPU execution. No GPU timer query was captured.
- Renderer diagnostic draw/triangle counters in these captures were read at an unsuitable reset boundary. A later local correction samples after rendering. Do not use the old diagnostic counters for draw-call comparisons; the streamer residency counts above are independently maintained.
- The revised arrival still has an approximately 159 ms synchronous call, and captured warm phases still include intervals above 50 ms. Passing percentiles alone does not pass the proposed zero-stall traversal gate.

The changes address concrete defects:

| Evidence in the original path | Local correction | Remaining boundary |
| --- | --- | --- |
| The worker pool existed, but the live streamer called the full mesher synchronously. Its 4.5 ms budget was checked only between complete chunks. Tree edits rebuilt chunks directly in interaction callbacks. | Connect workers, bound pending work and installation, synchronize edits before jobs, and reject stale revisions/generations. Keep the old mesh until a replacement is ready. | Synchronous fallback is retained for worker failure/unavailability. An individual fallback chunk can exceed the budget. GPU uploads remain separate work. |
| Every planet rebind resampled unchanged proxy and ocean fields. | Cache samples per terrain/layer binding and reuse live attribute buffers on return. | First preparation is still synchronous; cache memory and all-world travel need longer-run measurement. |
| Terrain vertex color was multiplied twice, material-byte decoding disagreed with the mesher, interpolated packed integers could truncate incorrectly, and noise used floating-origin coordinates. | Apply vertex color once, decode the actual bytes, carry metadata as a flat integer varying, and reconstruct stable planet coordinates for material detail. | This corrects the current material path; it does not complete a new material/art system or visually qualify every distance. |
| Distant planets used intersecting terrain and ocean shells. | Represent distant land and water with one surface. | The active planet still uses a sunk far proxy; coastline and near/far ownership transitions need further visual work. |
| Wildlife and waterfall removal detached generated geometry without releasing owned GPU resources. | Dispose owned geometry/materials at removal while preserving shared waterfall materials. | A long exploration soak and broader asset-lifecycle audit remain necessary. |

The CPU-only [meshing benchmark](../scripts/benchmark-chunk-meshing.mjs) independently explains why an admission budget was insufficient. At M192, 16 evenly spaced chunks per world produced warm medians of 20.04 ms terran, 45.83 ms shattered, 35.54 ms canyon, 12.93 ms cryo, 10.64 ms volcanic, and 11.78 ms biolum. The largest warm sample was 67.76 ms. [Raw CPU benchmark and environment](../output/performance/chunk-meshing.json). This measures the unchanged generation kernel without rendering or worker transfer. Off-thread execution moves that work away from input/render scheduling; it does not make the computation disappear.

The separate [native streaming smoke](../scripts/smoke-streaming.mjs) passed on Chrome/WebGPU at M48: tree damage/felling retained the visible mesh until replacement, rapid three-world warps kept at most two jobs pending and attached only final-world geometry, and a deliberately invalid worker configuration exercised native error transport and a matching fallback geometry hash. It recorded no page/console/network errors or saved-state writes. One Three.js missing-position attribute warning was recorded. These diagnostic API checks establish those lifecycle cases, not a complete player-input playthrough. [Smoke evidence](../output/performance/streaming-smoke.json).

After correcting the renderer-counter sampling boundary, final local validation passed 125 tests across 25 files and the production build. A separate M192 rendering smoke with seed `journal-ui-smoke` passed on WebGPU and WebGL2, reporting 116 draw calls, 783,577 rendered triangles, and 70 geometries on each backend, with no captured errors or warnings. These are completed-frame counters for that smoke scene, not replacements for the older profile counters. [Rendering smoke results](../output/rendering-smoke/results.json), [WebGPU image](../output/rendering-smoke/gpu-world.png), [WebGL2 image](../output/rendering-smoke/gl-world.png). The UI smoke also passed 13 checks covering desktop keyboard behavior and touch portrait/landscape layouts. [UI checks](../output/ui-overhaul/checks.json). Neither smoke extends the bounded performance comparison into a full qualification.

To repeat the captures, build and serve the archived baseline in a separate directory at port 5200, and the revised production build at port 5199. Use a fresh `git archive` of the baseline hash above and its lockfile; do not switch the working tree under measurement. For the revised server, run the following in its own terminal:

```powershell
npm run build
npm run preview -- --host 127.0.0.1 --port 5199 --strictPort
```

From the repository root, run captures sequentially after servers are ready. Stop other game/browser benchmarks first; keep builds unchanged and use a new label to preserve previous output. Set `CHROME_PATH` if Chrome is installed elsewhere.

```powershell
node scripts/profile-game.mjs baseline-production-repeat 5200 gpu
node scripts/profile-game.mjs revised-production-repeat 5199 gpu
node scripts/profile-game.mjs revised-production-repeat 5199 gl
node scripts/smoke-streaming.mjs http://127.0.0.1:5199/
node scripts/smoke-ui.mjs http://127.0.0.1:5199
node scripts/smoke-rendering.mjs http://127.0.0.1:5199
node scripts/benchmark-chunk-meshing.mjs output/performance/chunk-meshing-repeat.json
```

Next work should make first-arrival preparation incremental or asynchronous, establish coherent near/middle/far surface ownership, then repeat the declared walking/exploration route with fixed populations and visual acceptance. Broader asset or shader changes should be assessed against that route, with CPU, worker, upload, and GPU costs reported separately where measurable.
