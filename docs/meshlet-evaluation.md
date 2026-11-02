# Meshlet evaluation — Aurelia, Three r187

Status: local evaluation on 2026-11-01. **Keep the standard drawing pipeline for the game.** The installed meshlet add-on is a useful research candidate for immutable environment meshes, but its automatic terrain LOD violates this game's categorical material contract. It also adds synchronous work when editable terrain geometry changes. No upstream demonstration's speedup is a performance claim for this game.

## What was inspected

Installed `three@0.187.0`, specifically `examples/jsm/pipelines/MeshletDrawingPipeline.js` and `examples/jsm/utils/MeshletGeometryUtils.js`. The feature was introduced in [Three PR #35191](https://github.com/mrdoob/three.js/pull/35191); the author describes GPU cluster culling, indirect draws and screen-space LOD selection, with fallback for unsupported objects. The source labels the API experimental. These are drawing optimizations, not a replacement for terrain generation, streaming budgets, world composition or vegetation residency.

Pinned primary sources:

- [r187 MeshletDrawingPipeline](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/pipelines/MeshletDrawingPipeline.js): eligibility checks, preparation, geometry invalidation, transform upload, culling and fallback.
- [r187 MeshletGeometryUtils](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/MeshletGeometryUtils.js): welding, simplification, packed attribute storage and six LOD tiers.
- [r187 WebGPU timestamp query implementation](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgpu/utils/WebGPUTimestampQueryPool.js): query duration is the sum of passes in the latest completed frame represented by that query pool.

## Compatibility with this scene

| Content | Current compatibility | Consequence |
| --- | --- | --- |
| Terrain chunk meshes, custom `colorNode`, flat `packedMat` varying | Eligible for the meshlet pipeline's front-sided opaque material path, but unsafe automatic LOD semantics | Keep standard terrain draws. The byte-packed material/flags must remain constant over every emitted triangle. |
| Transparent water | Explicit standard fallback | Meshlets do not remove water's shading or transparency cost. |
| Alpha-hashed explorer | Explicit standard fallback; skinned and morphed meshes also fall back | Do not predict character savings from this pipeline. |
| Opaque instanced trees, plants, landmark and herd parts | Our CPU-authored instance matrices/colors are supported | A possible isolated future experiment. The present habitat already uses eight shared geometries and bounded residency; benefit is unproven. |
| Meshes using `vertexColors: true`, flat shading or double-sided material | Explicit standard fallback in this revision | Inventory actual eligibility rather than counting every scene triangle as optimized. |
| Floating origin | Matrix updates are supported, but every translated object changes world transform while the player moves | Do not treat these objects as permanently static `BundleGroup` content. Upload and culling cost must be measured on a walk, not only at rest. |
| Edited/replaced chunk geometry | Attribute replacement/version changes invalidate cached clusters | Six-tier preprocessing occurs again. The one-geometry-per-projection limit bounds count, not the duration of an individual conversion. |

The compatibility entries above are verified against the installed eligibility and invalidation code; visual correctness and performance still require a browser comparison. Our instanced herbivores animate instance transforms, not skinned vertices. Individual source shapes are small, so 64-triangle meshlet padding and processing overhead may outweigh culling savings.

## Confirmed terrain LOD defect

`scripts/audit-meshlet-geometry.mjs` runs the installed meshlet utility against the four real M192 chunks traversed by the Aurelia recipe. It writes `output/meshlet-evaluation/geometry-audit.json`. No browser or GPU is involved in that audit.

The full-detail tier preserves constant per-triangle metadata. Every simplified tier in all four sampled chunks creates triangles whose vertices disagree about material or cap/wall identity. For example:

| Chunk | Source triangles | LOD 1 triangles | Mixed material IDs | Mixed cap/wall flags |
| --- | ---: | ---: | ---: | ---: |
| 20612 | 10,648 | 7,303 | 488 | 3,689 |
| 20613 | 10,996 | 7,889 | 968 | 3,553 |
| 20549 | 5,576 | 4,023 | 462 | 1,328 |
| 20550 | 8,104 | 5,803 | 1,180 | 2,506 |

This is **not** numerical interpolation of newly generated integer IDs: the utility retains original vertex attributes and changes triangle indices. Our flat integer varying then selects one vertex's metadata for a triangle that now spans several categories. It prevents the former pixel stipple, but cannot preserve the new triangle's material boundary or cap/wall meaning.

The source explains the result: simplification weights normals and UVs; extra attributes such as `packedMat` and colors are retained for drawing but are not simplification constraints. Later tiers permit crossing attribute seams and may use a topology-relaxing fallback. Correct terrain LOD needs categorical boundary protection, chunk-border protection and edit-aware preprocessing; simply enabling this pipeline does not provide them.

One offline process observed 38–149 ms per sampled chunk for the synchronous conversion, including all tiers. Those values include local process/JIT effects and are **not browser frame or GPU timings**. They justify measuring first arrival and remeshing separately; they do not predict a universal conversion cost.

## Controlled browser comparison

`scripts/compare-render-pipelines.mjs` launches fresh headless Chrome processes sequentially: standard first, then the deliberately enabled experimental pipeline in the same unchanged production build. Both use M192, seed `GP192-01`, 1280×720 at DPR 1, no save, the new habitat, identical lighting and the same route replay. The replay follows the recipe's tile route over 21 seconds while retaining the simulation update; it is a repeatable streaming/camera workload, not a keyboard-control acceptance test.

It records boot-to-ready, startup and warm frame intervals, long tasks, CPU render submission and streamer pump durations, supported GPU render/compute timestamps, renderer counters, errors, and screenshots. The final phase mines one route tile and rebuilds its chunk. `pipeline-comparison.json` preserves device/browser identity and failure details. GPU render and compute queries resolve independently; their percentiles must not be added as if they were matched frame samples. CPU submission time is not GPU time. Boot captures include loading/compilation and are not warm traversal measurements.

The recorded local run used Chrome 156.0.8078.74 and an NVIDIA RTX 3070 (driver 32.0.16.1742). Timestamp queries were available. This was one sequential pair, not repeated statistical qualification. It included the new habitat and character, before the subsequent baked material-detail, daylight-star and rebuilt camp-kit changes.

| Measurement | Standard | Experimental meshlets |
| --- | ---: | ---: |
| Boot to ready | 4.68 s | 15.47 s |
| Route frame interval p95 / p99 | 7.2 / 7.2 ms | **Invalid rendering** |
| Route maximum interval / intervals >50 ms | 7.5 ms / 0 | 590.3 ms / 13, during failed rendering |
| Route CPU render-call maximum | 11.4 ms | 146.2 ms, during failed rendering |
| Sampled route GPU render-pass sum p95 | 1.38 ms | **Invalid rendering** |
| Post-edit maximum frame interval | 7.3 ms | 83.4 ms, during failed rendering |
| Console/page errors | 0 | 27,904 repeated validation errors |

The experimental run exceeded the requested WebGPU device's maximum storage-buffer binding: **159,742,368 bytes requested versus 134,217,728 bytes allowed**. This invalidated bind groups and subsequent draws. The adapter advertised a higher optional limit, but simply requesting it would not fix categorical terrain LOD, synchronous preprocessing, or portability to other devices. The failed pipeline's apparently short GPU render time is not a speedup: required drawing did not complete correctly. Its frame timings characterize the failed experiment only.

The first diagnostic run continued through the route/edit to preserve failure evidence; the runner now stops a case when validation errors are detected. Raw stage counters, screenshots and deduplicated representative errors remain in `output/meshlet-evaluation/pipeline-comparison.json`. The standard case completed every phase without errors or warnings. This result does not qualify travel, mobile hardware, keyboard movement, or the later revised lighting/material build.

The failed experimental production build is preserved locally at `output/meshlet-evaluation/experimental-dist`; it has not been published. For an explicit rerun, serve that archived directory with `npx vite preview --outDir output/meshlet-evaluation/experimental-dist --host 127.0.0.1 --port 5210`, then run `node scripts/compare-render-pipelines.mjs http://127.0.0.1:5210`. The runner checks the reported active pipeline, so running against the regular game after removal of the flag cannot silently label standard rendering as meshlets.

## Decision and next gate

Do not ship the global opt-in as a user-facing rendering choice. Preserve the evaluation build/results and the reproducible source audit. Consider a later isolated scene containing only immutable, opaque vegetation/landmark meshes if draw/vertex processing is measured as a bottleneck. Do not use private renderer hooks or dummy render callbacks to force per-object fallback in the live game.

Before revisiting terrain meshlets: preserve categorical metadata and shared chunk boundaries at every LOD; move preprocessing into the existing worker/budget system or bake immutable geometry; invalidate only changed data; compare first upload, mining, travel arrival and warm walking; verify screenshots at LOD transitions and floating-origin shifts; and show a repeatable total-frame improvement on target hardware. A faster GPU pass is insufficient if CPU preprocessing introduces traversal stalls or material boundaries become incorrect.
