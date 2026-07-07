Original prompt: complete courier frontier plan
Current operating goal: Hearth and Horizon full crafting-survival cycle under the DAG/subagent workflow.

## 2026-07-07

- Corrected the current continuation back onto the explicit DAG after the user called out
  that subagents and graph execution were not visible enough. Opened H4 as the local
  critical-path node and deployed three parallel explorer lanes for generated-asset
  safety/tooling, art readability, and UX/control-loop fit while the main lane added the
  proof gate.
- Added `docs/kiln-asset-intake.md` and `npm run proof:kiln-assets`. The new proof validates
  the local `public/assets/kiln/generated` pack as quarantined source material: 64 GLBs,
  5.76 MiB total, valid GLB 2.0 headers and lengths, `sphere-planet` palette metadata, no
  detected secrets or presigned URLs, and 28 runtime-readiness warnings captured before any
  generated model can become a shipped dependency.
- Hardened asset intake hygiene by keeping raw generated Kiln drops, `.env.local`, generated
  packages, and dogfood outputs out of normal staging. The next H4 edge is not "load all
  GLBs"; it is a runtime manifest and blind screenshot proof for a small shortlist:
  waystones/cave anchors/cave mouths, functional home props, food/shore props, drops, and
  planet-native creatures.
- Integrated the three subagent lanes into the ledger. Safety found one ignored live-shaped
  Kiln secret and an earlier orphan UUID camp-lantern asset outside the catalog. The current
  proofed pack is back to catalog parity, but the generated pack remains quarantined and
  `tools/kiln/scripts/batch.mjs` was verified to contain regen deletes inside
  `KILN_OUT_DIR`. Art review accepted a one-family pilot only, preferably `waystone`
  or `cave-mouth-dry`, with the avatar remaining code-authored. UX review confirmed
  keyboard, touch, and gamepad systems are implemented but the next proof edge is landscape
  tablet/phone plus full survival/build verb coverage.
- Closed the J3 music/audio verification slice under the DAG/subagent workflow. Three
  parallel lanes audited runtime music wiring, asset optimization, and proof coverage while
  the main path added the enforceable gates. The Twelve Bells album was already correctly
  streamed through `GameAudio`; the new work makes that state reproducible instead of
  relying on a one-off handoff claim.
- Fixed audio asset URLs to resolve through Vite's configured base path, so the same runtime
  catalog works both at localhost root and when the production build is mounted under
  `/goldberg-planet/`. Streamed music media errors now surface in `GameAudio` diagnostics
  instead of silently advancing to the next track.
- Added `npm run proof:audio-assets` and `npm run proof:audio-music`. The asset proof uses
  `ffprobe` to enforce runtime catalog parity, MP3 codec, 44.1 kHz stereo, near-128 kbps
  bitrate, stripped metadata/artwork, per-file budgets, and the 36 MiB album budget. The
  browser proof unlocks audio by pointer/touch gesture, verifies ambience plus streamed
  music state, toggles mute/resume, checks audio network responses, captures screenshots,
  and serves `dist/` under `/goldberg-planet/` to catch root-absolute audio URLs.
- Verified the audio slice with `npm test -- audio` (11 tests), `npm run typecheck`,
  `npm run proof:audio-assets` (14 music tracks, 33.26 MiB; 13 SFX; 1 ambience loop),
  `npm run build`, and `npm run proof:audio-music` using the existing sibling Playwright
  `NODE_PATH`. Browser proof passed four targets: dev desktop, dev phone touch,
  production-subpath desktop, and production-subpath phone touch. The asset audit noted
  future SFX loudness/provenance debt, but the music files themselves are already optimized.
- Closed the I2/P1 Shared Panel Ownership slice under the DAG/subagent workflow. Three
  parallel reviewer lanes audited panel leakage, device proof, and docs/test alignment while
  the main path implemented the shared owner. Route Slate, crafting, Hearth Journal, and
  chest storage now report one `PanelOwnershipSnapshot` with deterministic owner priority and
  `worldInputBlocked` readback in `render_game_to_text`, `__world.stats()`, and
  `__world.controls()`.
- Hardened the input boundary around that owner: panel-owned frames cancel held pointer and
  touch state, exit pointer lock, block same-frame movement/look/zoom/hotbar/use/eat/plane/
  mine/build leakage, neutralize keyboard/touch/gamepad motion while panels are open, and
  hide touch movement/action buttons behind modal panel owners while keeping explicit panel
  buttons reachable.
- Added focused unit coverage for `src/player/panelOwnership.ts` inside `test/ux.test.ts`
  and committed a new browser proof harness at `scripts/proof-panel-ownership.mjs` exposed as
  `npm run proof:panel-ownership`. The proof writes
  `output/playwright/panel-ownership/proof.json` plus PC, laptop, tablet touch, phone touch,
  and synthetic gamepad screenshots, and asserts one visible panel owner, `worldInputBlocked:
  true`, blocked player motion, screenshot pixels, and no page/console errors.
- Verified the panel-owner slice with `npm test -- ux`, `npm run typecheck`, `npm run
  proof:panel-ownership`, full `npm test` (252 tests), `npm run build`, `git diff --check`
  (LF-to-CRLF warnings only), and a generic develop-web-game nonblank smoke at
  `output/web-game/shot-0.png`. The custom panel proof is the authoritative interaction
  artifact; the generic client did not open the panel reliably through its key vocabulary.
- Current frontier snapshot: goal outcome is measurable Hearth and Horizon progress under
  the DAG operating model; F1/I2/J1 route choice, H3/R4 route-marker readability, and the
  first I2/P1 shared-panel ownership slice are now closed with committed proof hooks. The
  next honest UX frontier is P2 responsive/device-matrix proof plus future all-verb parity
  for building and combat panels; no human-owned decision blocks that follow-up.
- Closed the H3/R4 Route Marker Glyph Dialect slice: cave anchors now carry belay/cairn/rope,
  dry-cave, sea-cave, spring, flood, and arch readability roles; waystones now use distinct
  survey bearing, hearth/home, cave arch, shore wave, and forage sprout glyph components; and
  `StructureRenderer.stats()` plus `render_game_to_text` expose route-marker silhouettes and
  readability-role counts instead of leaving the proof in screenshots only.
- Added committed browser proof for this asset slice at
  `scripts/proof-route-marker-readability.mjs` and `npm run proof:route-markers`. The proof
  seeds attuned waystones and cave anchors around the player, captures desktop and phone
  screenshots, validates screenshot pixels, asserts `routeSilhouettes: 2`,
  `routeReadabilityRoles: 24`, `waystones: 3`, `caveAnchors: 3`, and records no page or
  console errors in `output/playwright/route-marker-readability/proof.json`.
- Verified the marker slice with `npm test -- structureRenderer structures navigation`,
  `npm run typecheck`, `npm run proof:route-markers`, and the develop-web-game client at
  `output/web-game/route-marker-readability-client/`. The generic client screenshot is
  nonblank but still uses the normal diagnostic overlay; the committed route-marker proof is
  the authoritative readability artifact.
- Corrected the Hearth and Horizon orchestration process after the user called out that
  subagents and directed acyclic graphs were no longer visibly driving progress. The cycle
  docs now promote the static DAG into an active run ledger with node owners, statuses,
  dependencies, proof gates, and a progress-accounting rule: if no DAG node moves to
  complete/blocked/deferred with evidence, the slice did not advance the goal.
- Opened the current critical-path run as A2 living DAG, A3 subagent briefs, F1
  route/itinerary polish, I2 touch/gamepad parity, and J1 browser proof. The immediate
  target is selectable Route Slate candidates so route planning becomes an intentional
  player choice across input devices instead of always pinning the top-ranked candidate.
- Closed the selectable Route Slate candidate slice for F1/I2/J1: Route Slate rows now
  select the actual `RouteGuide` candidate that will be pinned, the pin command preserves
  prior top-ranked behavior unless a row is explicitly selected, keyboard Arrow/Enter/Escape
  and gamepad D-pad/A/B/Back own route focus while the panel is open, touch row selection
  works with the route pin button, and route clicks no longer leak into mouse-look.
- Verified the slice with `npm test -- navigation`, `npm test -- gamepad`,
  `npm test -- journal`, `npm run typecheck`, browser proof at
  `output/playwright/route-selection/proof.json` covering desktop pointer, injected
  gamepad, and phone touch non-primary route selection, the full 248-test suite,
  `npm run build`, and `git diff --check` with only known LF-to-CRLF checkout warnings.

## 2026-07-06

- Closed the first Cross-Device UX P0 input-accessibility slice under the Hearth and Horizon
  DAG: three subagents audited touch route access, gamepad panel focus, and docs/test gaps;
  the main implementation added touch Route Slate/pin/clear buttons, route-panel pin/clear
  actions, shared route command wrappers, gamepad menu-focus edges, focused crafting/storage
  rows, A-confirm craft/place/transfer, B-cancel, and world-input leakage guards while
  panels own focus. The pass also fixed crafting placement to pass the crafted placeable
  item id instead of the recipe id.
- Verified the input-accessibility slice with `npm test -- gamepad`, `npm run typecheck`,
  Playwright proof at `output/playwright/input-accessibility/` covering phone touch
  route open/pin/clear plus desktop gamepad crafting and chest-storage focus/confirm, the
  full 247-test suite, production build, and `git diff --check` with only the known
  LF-to-CRLF checkout warnings.
- Corrected the active Hearth and Horizon workflow back to the documented orchestrator
  model: deployed four read-only subagent lanes for goal/DAG audit, cross-device UX/input
  audit, asset-readability audit, and current season-afterglow code review, then added an
  active DAG rule, 10-lane living DAG board, critical path, subagent operating model, and
  reviewer gates to the cycle docs so broad work starts with dependency nodes, parallel
  lanes, merge order, reviewer gates, and proof artifacts instead of drifting into
  single-threaded feature work.
- Integrated the subagent audit findings into the active frontier: mobile/tablet route
  controls and gamepad panel focus are now documented as P0 Cross-Device UX work, while the
  immediate Asset Readability Gate frontier is player/avatar kit, cave anchors/waystones,
  native hazards at normal play distance, and the new season-afterglow marker. Low-risk UX
  safety fixes are in locally: storage clicks no longer leak into mouse-look, opening Route
  Slate or pinning a route closes crafting, and touch controls reset held state on pointer
  loss, blur, and visibility changes.
- Implemented the first Cycle 5 season-afterglow consequence slice locally: a completed
  full Stranger Season chord now creates a readable crater afterglow, promotes it through
  Route Slate, route guide/ribbon, Hearth Journal, F3/debug, save/export/import, and
  `render_game_to_text`, and lets the player read it once for trail focus, stamina, and
  exposure relief. The afterglow reviewer found and this pass fixed the route-completion
  edge case: afterglow route plans no longer complete by proximity before reading, and a
  nearby read now completes the planned stop. Focused event-season/save/navigation/journal/
  renderer/UX tests, typecheck, browser proof at `output/playwright/season-afterglow/`, the
  full 246-test suite, production build, and `git diff --check` pass for the slice with only
  the known LF-to-CRLF checkout warnings.
- Welcomed the Twelve Bells music handoff into the game: the album now streams through the
  existing `GameAudio` unlock/mute/visibility lifecycle, F3 diagnostics report current
  soundtrack state, the 14 MP3 files were optimized from 50.72 MB to 33.26 MB as stripped
  44.1 kHz stereo 128 kbps files, and audio tests now enforce streamed-track wiring plus the
  committed album size budget.
- Verified the music/native-life integration bundle with focused audio/native-life tests,
  typecheck, desktop/mobile audio and native-life Playwright probes, the bundled
  develop-web-game client at `output/web-game/music-integration-client/`, the full
  242-test suite, production build, and `git diff --check` with only the known LF-to-CRLF
  checkout warnings.
- Implemented the first native-life renderer readability pass for Cycle 7: native creature
  groups now expose nine distinct silhouette families, hazard counts, telegraph mesh counts,
  and named telegraph roles for brambleback crowding, cave bell-jaw hinge lift, scree-snapper
  jaw plates, storm-burr quill/gust arcs, tide-lurker eye/splash tells, and cave-blinker
  focus rings. F3/native-life diagnostics now report `silhouettes/kinds`,
  `telegraphs/meshes`, and hazards so screenshot reviewers can verify creature meaning
  instead of relying on a shared warning ring.
- Implemented the first domain-resource asset-readability renderer pass for Cycle 6:
  lantern, glass, bell, and horizon resources no longer share the generic shard-cluster
  model, and hearth coal, rain reeds, salt shells, lamp prisms, root pods, red nodules,
  snow blooms, glass panes, storm amber, kelp tangles, bell ribs, and horizon vanes now
  expose distinct renderer silhouette families. F3/domain-resource diagnostics now report
  `silhouettes/kinds`, and the new renderer test fails if the target shard families collapse
  back into one generic cluster.
- Verified the domain-resource readability pass with focused domain-resource renderer/sim
  tests, typecheck, targeted desktop/mobile Playwright proof at
  `output/playwright/domain-resource-readability/`, the bundled develop-web-game client at
  `output/web-game/domain-resource-readability-client/`, the full 238-test suite,
  production build, and `git diff --check` with only the known LF-to-CRLF checkout
  warnings.
- Implemented the first threshold asset-readability renderer pass for Cycle 6: generic
  threshold forms now include named hearth lintels/footstones, tide crawl floors/waterlines/
  ribs/low roofs, red-scree cut floors/walls/seams, and horizon return pads/sightlines/vanes
  with `assetRole` metadata exposed through `LandmarkRenderer.stats().thresholdAssetRoles`.
  The subagent asset audit also recorded the next readability risks: domain resource shards,
  remaining pentagon threshold silhouettes, native hazard telegraphs, cave anchors, and
  waystone route icons.
- Verified the threshold readability pass with focused landmark renderer/landmark tests,
  typecheck, targeted desktop/mobile Playwright proof at
  `output/playwright/threshold-readability/`, the bundled develop-web-game client at
  `output/web-game/threshold-readability-client/`, the full 237-test suite, production
  build, and `git diff --check` with only the known LF-to-CRLF checkout warnings.
- Scaffolded an Orchestrated Development Track and Asset Readability Gate into the Hearth
  and Horizon cycle docs: large slices should now be planned as dependency DAGs with
  subagent-ready parallel lanes, explicit merge/reviewer paths, proof bundles, and a hard
  review rule that unclear props, creatures, crystal/gate forms, markers, tools, or terrain
  wonders must be revised until their gameplay noun and verb read in screenshots.
- Implemented the staged terrain mining pass for Cycle 7: ordinary terrain cells now store
  partial mine progress before the column edit happens, with material-specific hit counts,
  shovel/pick/echo-tool speed differences, visible dark crack facets in rebuilt chunk
  meshes, save-backed progress, and `__world.mineProgress()`,
  `__world.stats().mineProgress`, diagnostics, and `render_game_to_text` readbacks. The
  final hit still spawns grounded mine/cave-chip drops through the existing physical reward
  path.
- Verified the staged terrain mining pass with focused mining/save/world tests, typecheck,
  targeted Playwright proof and screenshots at `output/playwright/staged-terrain-mining/`,
  the bundled develop-web-game client at `output/web-game/staged-terrain-mining-client/`,
  the full 236-test suite, production build, and `git diff --check` with only the known
  LF-to-CRLF checkout warnings.
- Implemented the native defense animation pass for Cycle 7: native hazard pressure now
  drives explicit Wayfarer action intent instead of generic interactions. Failed close
  pressure staggers the character, close prepared counters use a guarded ward beat, Storm
  Cloak counters brace into weather hazards, and reed-bow counters trigger a bow-shot pose;
  `__world.characterIntent()`, `__world.stats().characterIntent`, and
  `render_game_to_text.characterIntent` expose the short action beat for browser proof.
- Verified the native defense animation pass with focused equipment/native-life/tool tests,
  typecheck, targeted Playwright proof at `output/playwright/native-defense-actions/`, the
  bundled develop-web-game client at `output/web-game/native-defense-actions-client/`, an
  extended visual screenshot pass at `output/web-game/native-defense-actions-client-long/`
  that produced in-world frames before timing out, the full 233-test suite, production
  build, and `git diff --check` with only the known LF-to-CRLF checkout warnings.
- Implemented the pickup handoff polish pass for Cycle 7: when ready grounded drops collect,
  the character now enters a short `pickup` action, bends toward the ground, and briefly
  holds the primary collected item prop so tree wood, mined chips, cave crystals, fish,
  compost, and native-life rewards have a visible player-facing reward beat. Resource-drop
  diagnostics now keep a `lastPickup` readback for browser proof.
- Verified the pickup handoff rules with focused equipment/resource-drop tests and
  typecheck, targeted Playwright proof and screenshots at
  `output/playwright/pickup-handoff/`, the bundled develop-web-game client at
  `output/web-game/pickup-handoff-client/`, the full 232-test suite, production build, and
  `git diff --check` with only the known LF-to-CRLF checkout warnings.
- Implemented the mined material drop pass for Cycle 7: normal terrain mining now spawns
  grounded `source: mine` pickups for dirt, rock, sand, snow, or wood instead of adding the
  material directly to inventory, and cave-adjacent rock loosens glow-crystal pickups through
  the same delayed bounce/glint/proximity-collection path as tree and native-life rewards.
- Verified the mined material drop pass with focused resource/cave-drop tests, full
  231-test suite, production build, targeted Playwright proof at
  `output/playwright/mined-resource-drops/`, the bundled develop-web-game client at
  `output/web-game/mined-resource-drops-client/`, and `git diff --check` with only the known
  LF-to-CRLF checkout warnings.
- Implemented the native encounter route-guide pass for Cycle 7: unresolved native hazards
  and untended helpers can now become `RouteGuide` candidates, the visible route ribbon can
  point at the exact native encounter tile, and `P` can pin a single saved native route stop
  instead of folding local creature pressure into a seasonal itinerary. Native route plans
  now save with `nativeHazard` / `nativeLife` source kinds.
- Verified the native encounter route-guide pass with focused navigation/save tests, full
  230-test suite, typecheck, production build, targeted Playwright proof at
  `output/playwright/native-life-route-guide/`, the bundled develop-web-game client at
  `output/web-game/native-life-route-guide-client/`, and `git diff --check` with only the
  known LF-to-CRLF checkout warnings.
- Implemented the native-life route/journal readback pass for Cycle 7: Route Slate now
  accepts nearby Soft-Facet creature signals, promotes active territorial/combative hazards
  with direction, telegraph, counter, and grounded reward details, and still shows untended
  harmless helpers as nearby opportunities. Hearth Journal now records native-life
  visible/tended/warded counts and can promote "Answer native hazard" or "Tend native
  helper" into next actions, bridging creature animation/combat states back into the normal
  planning loop.
- Verified the native-life route/journal pass with focused navigation/journal tests,
  typecheck, targeted Playwright proof and screenshots at
  `output/playwright/native-life-route-journal/`, the bundled develop-web-game client at
  `output/web-game/native-life-route-journal-client/`, the full 229-test suite, production
  build, and `git diff --check` with only the known LF-to-CRLF warnings.
- Extended the Cycle 7 spec with a future native-creature and combat roadmap: every creature
  family now needs a Soft-Facet model recipe, animation/readback proof, harmless useful
  neighbor verbs before aggressive additions, non-health-bar pressure states, survival-tool
  weapon integration, staged breaking/drop reuse, cave/arch encounter hooks, and deliberate
  room for strange planet-native behavior.
- Connected the Cave Blinker payoff more clearly into cave expeditions: cave-pressure
  reports now surface blink-focus metadata and messages when trail focus is active, so
  `__world.caves()`, F3, and `render_game_to_text` can show that the blinker rhythm is
  softening dark-cave pressure. The survival math still lives in the existing trail-focus
  path, so the new pass adds legibility and planning depth without double-counting the
  exposure multiplier.
- Implemented the fourth harmless native-life family for Cycle 7 and the first cave-helper
  creature: cave blinkers now spawn deterministically at actual cave-mouth columns as
  sleepy Soft-Facet mushroom carriers with giant blink eyes, antennae, tiny feet, a focus
  ring, and visible mushroom caps. Matching the blink rhythm through the normal native-life
  `R` interaction saves the tended state, spawns cave-mushroom pickups through the grounded
  reward system, grants a short cave-focus breath, and trims exposure a little so caves
  gain friendly wonder beside the bell-jaw, scree-snapper, and tide-lurker hazards.
- Implemented the sea-cave fishing native-hazard slice for Cycle 7: tide lurkers now spawn
  deterministically around real sea-cave mouths as goofy Soft-Facet water hazards with shell
  backs, eye bulbs, paddle fins, whiskers, foam crests, a splash arc, and a pulsing tide
  ring. Successful cave fish casts can stir an unwarded lurker into a stamina/exposure surge,
  while lanterns, echo lanterns, Stone Blades, hatchets/axes, or whistling arrows startle it
  once, save the ward state, and drop raw-fish pickups through the grounded reward system.
  The cycle docs now include the Tide Lurker Avatar Kit delta for cave-cast recoil,
  steady-light warding, blade/hatchet startle taps, bow whistle-shots, failed-splash recoil,
  and raw-fish pickup handoff poses.
- Implemented the first weather-bound native-hazard loop for Cycle 7: storm burrs now spawn
  deterministically on open grass/snow ridges as goofy Soft-Facet wind hazards with static
  quills, tiny feet, a wind arc, and a pulsing warning ring. They are visible in ordinary
  native-life scans but only auto-pressure during storm, rain, cold, or soaked weather, so
  the danger teaches weather timing and route prep instead of becoming constant nuisance
  damage. A Storm Cloak brace is the signature close counter, while a Stone Blade,
  hatchet/axe, or whistling arrow can ground one once, persist the ward, and drop reed-fiber
  pickups through the grounded reward system. The cycle docs now include the Storm Burr
  Avatar Kit delta for cloak-brace, failed-gust, blade/hatchet grounding, and bow-pin poses.
- Implemented the first native combat-capable loop for Cycle 7: scree-snappers now appear
  deterministically on rocky cave-route scree as low, goofy Soft-Facet hazards with lifting
  jaw plates, shard backs, wedge feet, and a pulsing warning ring. Mining rock near one can
  wake it into a stamina/exposure pressure hit, while a Stone Blade, hatchet/axe, or
  whistling arrow stuns it once and makes it flee under the scree. The loop saves through
  the native ward state and drops rock shard pickups, giving combat a telegraph -> pressure
  -> stun/flee -> grounded reward chain without health bars, corpses, or repeat farming.
- Implemented the second territorial native-hazard slice for Cycle 7: cave bell-jaws now
  appear deterministically at real dry/sea cave-mouth columns as goofy hinged Soft-Facet
  snap hazards with glowing tongues, eye stalks, warning rings, and shell-ridge animation.
  They pressure stamina/exposure when crowded, require lantern/echo-lantern light or a
  Stone Blade through the normal `R` ward path, save their warded state, and drop
  glow-crystal shards as grounded pickups so cave danger teaches preparation without
  becoming a generic enemy or repeatable kill-for-loot loop.
- Implemented the third harmless native-life family for Cycle 7 and the first farming
  helper creature: deterministic reedback grazers now appear on wet grass near natural
  water, use a distinct reed-backed Soft-Facet body with visible compost pellets, can be
  scratched once through the normal native-life `R` interaction, save their tended state,
  and drop compost through grounded pickups so native ecology feeds crop fertility instead
  of only combat, fishing, or seed rewards.
- Implemented the first Reed Bow ranged-ward slice for Cycle 7: a workbench-crafted bow
  and whistling-arrow ammo now extend native-hazard control beyond the close ring without
  adding kill combat. Bramblebacks can be scared off at range through the normal world-use
  path when the player carries a bow and arrows, one arrow is consumed, bow wear saves
  through the normal repair/tool system, grounded reed rewards still spawn, and the avatar
  gains visible bow/arrow hand and back props for the next authored combat animation pass.
- Implemented the first Stone Blade defense-tool slice for Cycle 7: a workbench-crafted
  close-control blade now shares the normal crafting, Pack Ledger, saved tool-wear,
  repair-kit, avatar hand/back prop, and native-hazard warding chain while deliberately not
  increasing mining/build reach. Bramblebacks now prefer blade readiness over axes when
  the player is prepared, giving sword/blade combat a grounded first hook before larger
  enemy AI, bow, or damage loops ship.
- Implemented the second harmless native-life family for Cycle 7: deterministic
  shell-skitters now appear on shore sand as small skittering Soft-Facet creatures, can be
  gently coaxed once through the normal native-life use path, save their tended state, and
  drop bait scraps or tideline kelp through grounded pickups so shore camps feel alive before
  combat expands.
- Implemented the first Stone Hatchet foundation slice for Cycle 7: a compact workbench
  tool/sidearm now crafts from one stick and two rocks, appears in the Pack Ledger with
  saved wear, shows as a small one-handed avatar prop/back prop, improves staged tree
  chopping below the full stone axe, counts for axe-prep site work, and can ward
  bramblebacks through the same normal world-use path as other axe tools.
- Implemented the first territorial native-hazard slice for Cycle 7: deterministic
  Soft-Facet bramblebacks now appear on open grass/snow ridges as goofy bristled
  creatures with a warning ring, punish crowding with a small stamina/exposure hit,
  can be warded through the normal world-use action when the player has an axe,
  lantern, echo lantern, or storm cloak, persist their warded state in saves, and
  drop thorn-reed pickups through the grounded drop system.
- Implemented the first harmless native-life slice for Cycle 7: deterministic Soft-Facet
  moss-puffs now appear on grassy forest-edge hexes, bob as low-poly primitive creatures
  with visible seed burrs, can be gently brushed through the normal world-use action,
  persist their tended state in saves, spawn berry-seed pickups through the grounded drop
  system, and expose native-life diagnostics through F3, `__world.nativeLife()`, and
  `render_game_to_text`.
- Implemented the first Cycle 7 tree/drop foundation: trees now take staged chop hits with
  saved per-tree progress, visible crack/leaf-damage mesh feedback, tool-speed differences
  and wear per hit, final wood stacks spawn as grounded pickup entities with bounce/glint
  animation, pickups auto-collect by nearby hex after a short delay, and save/debug/text
  readbacks expose both active drops and partial tree damage.
- Scaffolded a future **Cycle 7: Planet-Native Life, Hazards, and Combat** into the Hearth
  and Horizon spec. The cycle keeps enemies out of the current runtime but gives future work
  a concrete path: Soft-Facet SDF creature families, harmless useful native life first,
  aggressive hazards later, staged tree chopping, grounded pickup drops with bounce/magnet
  animation, hatchet/sword/bow plans, non-generic warding/stun/flee combat, and explicit
  avatar/prop/animation/readback gates.
- Implemented the first Storm Cloak loadout pass for Cycle 1: a workbench-crafted wearable
  made from snow, reeds, kelp, and snow herbs now appears as Route Gear in the Pack Ledger,
  softens storm/rain/cold/soaked exposure in survival, satisfies storm-route prep as a
  packed wearable, caps at one fitted cloak in the crafting UI, persists through save
  normalization, and appears as a distinct hooded shoulder cloak on the procedural avatar.
- Reworked the fallback player art direction into **Soft-Facet Wayfarer**: the avatar now
  uses sampled SDF blend-shell body and limb geometry, faceted low-poly normals, WebGPU
  vertex breathing, squash-and-stretch procedural poses, hood/face/scarf cues, a rounded
  pack, satchel, mitt-like hands, and boot shapes instead of the old capsule-and-box
  mannequin.
- Reconsidered the unclear tilted crystal/gate forms: generated cave mouths now favor
  asymmetrical cairn and glow-tag markers, while scree and storm pentagon thresholds use
  grounded slabs, bowls, stones, and wind ribbons unless a site is explicitly meant to read
  as a true gate.
- Verified the Storm Cloak core slice with focused crafting/inventory/survival/navigation/
  equipment/save tests, typecheck, the full test suite, production build, bundled web-game
  smoke, and targeted Playwright JSON/screenshot proof. Verified the Soft-Facet Wayfarer
  renderer update with typecheck, the full 209-test suite, production build, clean browser
  probes, and close screenshots at `output/playwright/soft-facet-wayfarer-clean-2/`.
- Made the player-character production note concrete for this cloak slice: the authored
  survivor should include a reed-tied shoulder cloak with short hood, darker wet hem,
  hood-pull/weather-brace poses, wet-hem shake after soaked travel, and screenshot checks
  proving it reads alongside the pack frame on PC, laptop, tablet, phone, and gamepad HUD
  layouts.
- Implemented the first Pack Frame progression pass for Cycle 1: a workbench-crafted
  reed-lashed frame made from wood, sticks, and reeds now appears as route gear in the Pack
  Ledger, adds +28 pack capacity when fitted, shifts borderline heavy loads into field
  carry, caps at one active fitted frame in the crafting UI, persists through save
  normalization, and appears as a distinct back prop on the procedural avatar.
- Verified the Pack Frame slice with focused crafting/inventory/equipment/save tests,
  typecheck, the full 205-test suite, production build, `git diff --check` with only the
  known LF-to-CRLF warnings, the bundled web-game smoke at `output/web-game/pack-frame-smoke/`,
  and targeted browser proof at `output/playwright/pack-frame-targeted/pack-frame-targeted.json`
  plus `output/playwright/pack-frame-targeted/pack-frame-crafted.png`.
- Made the player-character production note concrete for this frame slice: the authored
  survivor should include side rails, a center spine, shoulder loops, reed lashings, a
  small pouch or bedroll tie point, a two-handed fitting/strap-tightening craft beat, and a
  shoulder-settle pose that stays readable alongside tools and route gear on PC, laptop,
  tablet, phone, and gamepad layouts.
- Implemented the first Pack Burden pass for Cycle 1: the Pack Ledger now estimates carried
  load, labels light/field/heavy/overloaded/creative carry, shows load detail in the crafting
  panel, exposes the burden in `__world.stats()`, `__world.survival()`,
  `__world.crafting()`, and `render_game_to_text`, and feeds a soft movement pressure into
  survival.
- Made burden playable without turning inventory into a hard cap: heavy packs drain more
  stamina while moving, overloaded packs block sprint with a stash/build-storage readback,
  and Creative mode keeps its unlimited carry behavior.
- Hardened the Cross-Device UX/gamepad pass after screenshot review: synthetic gamepad
  injection now emits edge actions once while continuous stick/hold inputs persist, matching
  real controller behavior even in low-FPS browser validation. Final checks passed the
  focused UX/gamepad tests, the full 203-test suite, production build, bundled web-game
  smoke at `output/web-game/ux-gamepad-smoke-postfix/`, and five-profile Playwright
  screenshots/results at `output/playwright/ux-gamepad-profiles-postfix/` covering desktop,
  laptop, tablet touch, phone touch, and gamepad layouts.
- Made the player-character production note concrete for this burden slice: the authored
  avatar should include visibly compressible pack straps, fuller satchel/bedroll silhouettes
  for heavy loads, a short shoulder-adjust or pack-settle animation when burden changes, and
  a tired/heavy locomotion overlay that stays readable on PC, laptop, tablet, phone, and
  gamepad HUD layouts.
- Implemented the first Pack Ledger pass for Cycle 1 and the Cross-Device UX Track: opening
  crafting now also shows a grouped inventory readout for materials, tools/light, food/bait,
  build kits, route gear, and parts, including meal-unit totals, route/build counts, repair
  kit count, and per-tool remaining durability. Touch now has a compact craft button that
  reaches the same crafting/ledger surface as keyboard `B` and gamepad `Y`.
- Surfaced the ledger in `__world.stats()`, `__world.crafting()`, and `render_game_to_text`
  so desktop, laptop, touch, and gamepad validation can assert the same inventory truth as
  the visible crafting panel.
- Made the player-character production note concrete for this inventory slice: the authored
  avatar should support a visible satchel/pack ledger silhouette, small sorted pouches for
  food, parts, route gear, and repair supplies, a quick pack-check pose used when opening
  crafting, and stowed gear proportions that remain readable on PC, laptop, tablet, phone,
  and gamepad HUD layouts.
- Implemented the first echo-tool upgrade pass for Cycle 1: stone axe, pick, and shovel can
  now upgrade at a workbench into echo axe, echo pick, and echo shovel variants using glow
  crystals plus repair supplies, spend the base tool, gain stronger reach/speed/durability,
  auto-select as the best matching tool, persist wear/repair state, and satisfy existing
  expedition-prep and pentagon site-work contracts without forcing old stone tools back into
  the pack.
- Surfaced echo tools through crafting normalization, tool summaries, Route Slate prep
  wording, scree-cut site readiness, avatar hand/back prop priority, and crystal-accented
  procedural fallback meshes so cave rewards now loop back into day-to-day chopping,
  mining, digging, and route preparation.
- Made the player-character production note concrete for this echo-tool slice: the authored
  avatar should include crystal-bound axe/pick/shovel meshes, cyan/green core accents, reed
  or wire bindings, reinforced handle silhouettes, stowed backpack variants, and upgraded
  chop/mine/dig poses that remain readable on desktop, laptop, tablet, phone, and gamepad
  layouts.
- Verified the echo-tool slice with focused crafting/tools/equipment/navigation/landmarks/
  save tests, the full 198-test suite, production build, `git diff --check`, targeted
  crafting + gamepad mining Playwright proof at `output/playwright/echo-tools-targeted.json`,
  screenshot inspection at `output/playwright/echo-tools-targeted.png`, and the bundled
  web-game smoke client at `output/web-game/echo-tools-smoke/shot-2.png`.
- Implemented the first field-repair supply pass for Cycle 1: workbench-crafted repair kits
  made from sticks, rock, and reeds now auto-save a stone axe, pick, or shovel at the exact
  break point, spend one kit, restore usable durability, persist the repaired wear state,
  and surface the result in tool readbacks, crafting inventory, F3/debug, `__world.tools()`,
  and the saved world state without adding another keyboard/touch/gamepad-only command.
- Made the player-character production note concrete for this repair slice: the authored
  avatar should include a belt or backpack repair roll, reed-lashing/stone-wedge hand prop,
  quick crouched rewrap pose, tool-inspection handoff, and stowed kit variant that remains
  readable on desktop, laptop, tablet, phone, and gamepad layouts.
- Verified the repair-kit slice with focused crafting/tools/equipment/save tests, the full
  195-test suite, production build, `git diff --check`, a targeted gamepad mine-path
  Playwright proof at `output/playwright/repair-kit-targeted.json`, screenshot inspection at
  `output/playwright/repair-kit-targeted.png`, and the bundled web-game smoke client at
  `output/web-game/repair-kit-smoke/shot-2.png`.
- Implemented the first shore-net ecology pass for Cycle 4: shore nets are now
  workbench-crafted placeables braided from reeds, sticks, and wood, can be set at shore,
  dock, or sea-cave water, block pack-up while set, persist their soak/check state in saves,
  and can later be combed for raw fish plus waterline scraps such as bait, reeds, or kelp
  from the local fish-school context.
- Surfaced shore nets in Route Slate fish pins, Hearth Journal next-goal/field notes,
  F3/debug food readouts, `__world.structures()`, `__world.stats().food`,
  `render_game_to_text`, save round-tripping, audio cues, docs, world prop rendering, and
  avatar/backpack prop readbacks so the net loop is playable on keyboard, touch, and
  gamepad without hidden state.
- Made the player-character production note concrete for this shore-net slice: the authored
  avatar should include a coiled reed-net carry prop, float-line shoulder lash, crouched
  shoreline set pose, wet-net comb/shake pose, raw-fish and scrap handoff, and stowed
  shoulder/backpack variant that remains readable on desktop, laptop, tablet, phone, and
  gamepad layouts.
- Verified the shore-net slice with focused crafting/structures/equipment/audio/navigation/
  journal/save tests, the full 193-test suite, production build, the bundled web-game smoke
  client, targeted shoreline shore-net Playwright JSON, and screenshot inspection at
  `output/playwright/shore-net-targeted.png`.
- Implemented the first reed-bed crop variety pass for Cycle 4: reeds are now a real
  waterline forage/part item, tide and shore contexts can yield reed stems, crop plots beside
  natural water can plant reed slips, reed beds tolerate storm/cold shore conditions better
  than berries, harvests produce reeds plus bait scraps, and saved crop state now supports
  both berry plots and reed beds.
- Connected reeds back into the survival loop: reeds compost as plant scraps, wrap raw fish
  on drying racks into trail rations, craft a lighter reed fish trap, appear in food/forage
  diagnostics, and have visible crop-plot and avatar bundle variants.
- Made the player-character production note concrete for this reed-bed slice: the authored
  avatar should include a reed bundle carry prop, kneeling waterline planting pose, reed-cut
  harvest pose, wrap-binding preservation pose, and backpack lash variant that remains
  readable on desktop, laptop, tablet, phone, and gamepad layouts.
- Verified the reed-bed slice with focused crafting/forage/structures/equipment/save/journal/
  navigation/audio tests, the full 191-test suite, production build, `git diff --check`, the
  bundled web-game smoke client, targeted shoreline reed-bed Playwright JSON, and screenshot
  inspection at `output/playwright/reed-bed-targeted.png`.
- Implemented the first passive fish-trap pass for Cycle 4: fish traps are now
  workbench-crafted placeables made from wood, sticks, and kelp, can be set at shore, dock,
  or sea-cave water, optionally spend bait, persist their soak timer in save state, block
  packing while set, and later check empty or haul raw fish based on in-world time and local
  fish-school context.
- Surfaced fish traps in Route Slate fish pins, Hearth Journal next-goal/field notes,
  F3/debug food readouts, `__world.structures()`, `__world.stats().food`,
  `render_game_to_text`, save round-tripping, audio cues, and docs so the passive loop is
  playable on keyboard, touch, and gamepad without relying on hidden state.
- Made the player-character production note concrete for this fish-trap slice: the authored
  avatar should include a carried wicker trap/backpack variant, bait pouch handoff, crouched
  shoreline set/check pose, haul-and-shake collection pose, and raw-fish handoff that reads
  on desktop, laptop, tablet, phone, and gamepad layouts.
- Verified the fish-trap slice with focused crafting/structures/equipment/audio/journal/
  navigation/save tests, the full 187-test suite, production build, `git diff --check`, the
  bundled web-game smoke client, targeted sea-cave fish-trap Playwright JSON, and screenshot
  inspection at `output/playwright/fish-trap-targeted.png`.
- Implemented the first cave-resonance discovery pass: standing inside a real dry or sea
  cave with an echo lantern now reveals a deterministic one-time chamber echo such as a
  root-hum chamber, tide-glass hollow, stone-bell seam, or sky-echo pocket, records the
  observation in save/export/import progression, grants a small glow-crystal reward, and
  keeps repeat reads from paying again.
- Surfaced cave resonances in Route Slate, Hearth Journal next-goal/discovery/field notes,
  F3/debug, `__world.caves()`, `__THREE_GAME_DIAGNOSTICS__`, and `render_game_to_text` so
  entering caves with the right gear has a visible reason beyond mining near a void.
- Made the player-character production note concrete for this cave-resonance slice: the
  authored avatar should include an echo-lantern listening pose, a hand-to-wall/ceiling
  resonance read, a small crystal pocket reward handoff, and a notebook mark animation that
  remains readable on desktop, tablet, phone, and gamepad layouts.
- Implemented the first stocked-home departure meal: using a bedroll in a warm functional
  home with root-cellar provisions now sleeps/rests to dawn, spends one home-cluster cellar
  provision, serves a hearth supper, grants comfort-scaled trail focus for the next route,
  and records the result in survival/home readbacks.
- Made the player-character production note concrete for this home-supper slice: the
  authored model should include a low hearth bowl or wrapped ration, a seated/kneeling
  meal pose, hand-to-mouth and pack-up-after-breakfast transitions, and a small satisfied
  departure gesture that reads on keyboard, touch, and gamepad layouts.
- Verified the home-supper slice with focused survival/structure/navigation/journal tests,
  the full 179-test suite, production build, `git diff --check`, targeted Playwright JSON
  proving stocked home -> bedroll rest -> cellar provision spend -> trail focus, screenshot
  inspection at `output/playwright/hearth-supper-journal.png`, the bundled web-game smoke
  client, and the four-profile UX/gamepad regression probe.
- Implemented the first Cycle 5 Stranger Season forecast pass: Skyfall and World Murmur
  windows now combine into current/upcoming overlap forecasts with focus labels for split
  choices, fall chases, listening walks, and quiet travel/rest windows.
- Surfaced Stranger Seasons in Route Slate, Hearth Journal next-goal/field notes, F3/debug
  state, `__world.navigation()`, `__world.strangerSeasons()`, `__THREE_GAME_DIAGNOSTICS__`,
  and `render_game_to_text` so the forecast is playable and testable on desktop, mobile, and
  gamepad layouts.
- Added focused tests for season timing, day rollover, known/quiet windows, Route Slate
  season pins, and journal season entries. Next validation should include full tests,
  production build, and a desktop/mobile Playwright probe that opens the Route Slate and
  Journal while checking `strangerSeasons` readback.
- Added the first derived Stranger Season chain payoff: harvesting the active Skyfall and
  listening to at least one overlapping Murmur now links the season, listening to all three
  overlapping notes upgrades it to a full season chord, and Route Slate, Hearth Journal,
  F3/debug, `__world.strangerSeasons()`, and `render_game_to_text` expose the chain from the
  already saved fall/note histories.
- Made the Stranger Season chain mechanically useful in expedition planning: linked chains
  can satisfy the route-memory check when the Horizon Chart has no active target, full
  season chords can trim one long-route food burden when no food insight already applies,
  and browser validation now asserts those Route Slate prep effects.
- Implemented the first seasonal route-line pass: active Stranger Seasons now generate
  dedicated RouteGuide stops for the live fall plus remaining unobserved notes, `P` pins
  that fall-plus-listening itinerary before unrelated chart/cave targets when no route is
  already planned, the route ribbon/atlas/save path remains the existing route-plan system,
  and `__world.navigation()` plus `render_game_to_text` expose the `seasonRoute` guide list.
- Added action-gated season itinerary advancement: planned seasonal fall/note stops no
  longer complete from arrival alone, and successful Skyfall gathering or Murmur listening
  now marks the matching planned stop reached, advances to the next season stop, refreshes
  Route Slate/Hearth Journal state, and records a `season itinerary action` readback.
- Added the first full-season itinerary payoff: completing every planned fall/note stop now
  completes the saved route line, upgrades the chain to a full chord, grants season chord
  focus through the existing trail-focus survival system, gives a small stamina/exposure
  recovery bump, and is validated end-to-end on desktop and phone touch.
- Made the player-character production note concrete for this season-itinerary slice:
  the authored model should include a seasonal route-string or note-knot prop, a fall mark,
  quiet-listening stop marks, and a quick chart/journal gesture that remains readable on
  keyboard, touch, and gamepad layouts.
- Implemented the first Cycle 5 saved multi-leg route itinerary pass: `P` now creates a
  route line from the current ranked Route Slate candidates, later `P` presses append new
  distinct stops, `Shift+P` clears the whole line, Route Slate and Hearth Journal call out
  active stop counts, the route ribbon follows the unfinished stop, arrivals advance or
  complete the itinerary, and save/export/import preserve reached and unreached legs.
- Added focused itinerary coverage for candidate ranking, duplicate protection, stop
  advancement, route-ribbon guide suppression after completion, Route Slate wording, and
  save round-tripping of reached/active/future route legs.
- Implemented the Hearth and Horizon Cross-Device UX Track foundation: runtime UX profiling
  now classifies phone, tablet, laptop, desktop, touch, gamepad, and hybrid states; body
  classes drive responsive HUD/panel placement, touch target sizing, controller-focused
  labels, Route Slate hidden-state behavior, and F3/debug/readback diagnostics.
- Added standard gamepad support for the main survival loop: left stick move, right stick
  look, full-stick/RB sprint, LB+right-stick zoom, A jump/swim, LT descend, X mine/chop, RT
  build, D-pad hotbar, B use/back, LB+B pack prop, Y craft, Back Route Slate, LB+D-pad
  pin/clear route, Start board/stow plane, and debug injection for automated verification.
- Made the player-character production note concrete for this UX slice: the authored avatar
  and prop animation packet should include controller-readable locomotion, mining/building,
  use/back, pack-up, Route Slate reading, and plane board/stow poses that remain legible on
  smaller screens where HUD text is intentionally sparse.
- Verified the UX/gamepad slice with focused gamepad/UX tests, TypeScript, and a four-profile
  Playwright probe covering desktop, laptop, tablet touch, and phone touch layouts plus
  synthetic gamepad activation/hotbar movement and nonblank screenshot entropy checks.
- Implemented the first Cycle 6 pentagon expedition-site contract pass: every landscape
  profile now derives a distinct build/carry/read opportunity such as hearth niche,
  rain-reading blind, salt dock cut, lantern lookout, root shelter, scree cut, snow clock,
  glass terrace, storm blind, reed spring line, deep-bell throat, or horizon gate; Route
  Slate, Hearth Journal, F3, `render_game_to_text`, `__world.landmarks()`, and repeated
  landmark reads now expose those site hints.
- Made Cycle 6 site contracts physically binding: nearby structures and carried kit are now
  evaluated against each pentagon's site plan, ready/complete/missing state appears in Route
  Slate, Hearth Journal, F3, diagnostics, and debug hooks, completion persists in saves, and
  rereading a prepared landmark pays the one-time site reward.
- Added the first Cycle 6 site-threshold landform pass: every pentagon site now has a
  deterministic sealed/open threshold such as hearth arch, rain pocket, tide underpass,
  lantern skylight, root room, scree gate, snow terrace, glass terrace, storm pocket, reed
  spring mouth, deep-bell chamber, or horizon gate; completion opens the threshold in Route
  Slate, Hearth Journal, F3, `render_game_to_text`, `__world.siteThreshold()`, and the
  pentagon renderer's threshold mesh layer.
- Added the first threshold-effect pass: opened thresholds now produce local mechanical
  affordances such as homeward warmth, weather shelter, tide fish runs, root forage, cold
  rest, spring-water/cave approach help, cave-listening pressure relief, and return-route
  steadiness; these effects feed survival pressure, route prep, fishing, forage, diagnostics,
  and `__world.siteThresholdEffect()`.
- Added the first save-backed threshold terrain pass: completed pentagon sites now carve a
  small real terrain mouth, pocket, shelf, hollow, or gate near the opened threshold through
  the column-edit system, avoid existing placed structures when choosing adjacent threshold
  tiles, rebuild affected chunks, export those edits in saves, and expose the latest action
  through F3, `render_game_to_text`, `__world.landmarks()`, and `__world.openThresholdTerrain()`.
- Added the first threshold-chamber reading pass: each opened pentagon threshold now exposes
  a one-time local chamber/alcove/crawl/shelf/hollow/seep/throat/gate-slot reading with a
  strange note, small practical reward, saved observation state, Route Slate pin, Hearth
  Journal next-goal/progress entry, F3/readback diagnostics, `render_game_to_text`, and
  `__world.inspectThresholdChamber()` coverage.
- Made the player-character production note concrete for the threshold-chamber slice:
  authored model work should include a crouched threshold-inspection pose, hand-to-stone or
  hand-to-air listening variant, journal note mark, and reward handoff that reads on desktop,
  tablet, phone, and gamepad layouts.
- Verified the physical site-work and threshold-chamber slice with focused
  landmark/save/navigation/journal tests, the full 166-test suite, production build, diff
  hygiene, a desktop/mobile Playwright probe that built the First Hearth kit, marked the
  bedroll home, lit the campfire, completed the site, opened the hearth arch threshold,
  checked the active homeward-warmth effect, save-backed threshold terrain column edits,
  threshold renderer meshes, chamber Route Slate pinning, chamber inspection, saved chamber
  observation, trail-ration reward, and nonblank screenshots, plus the bundled web-game
  smoke client.
- Made the player-character production note concrete for this site-contract slice:
  dock-and-rack planning marks, weather-vane sighting, cave-anchor listening, waystone
  alignment, cistern/spring checking, and protected-shelter inspection now belong in the
  authored model's prop/socket/animation packet.
- Implemented the first Cycle 6 pentagon landscape-geometry pass: each of the twelve
  pentagons now owns a stable landscape profile with a distinct silhouette, terrain apron,
  radial ribs, marker forms, and crown geometry, while renderer diagnostics expose 12
  profiles and 176 landscape meshes for browser validation.
- Made the player-character production note concrete for the Cycle 6 landmark slice:
  landmark approach stance, hand-on-stone or rune-tracing pose, journal-sketch/chart-marking
  pose, cautious look-up idle, mystery prop variants, and explicit hand/backpack/belt/journal
  sockets are now part of the Avatar Kit contract.
- Implemented the first Cycle 5 orbit-atlas route overlay pass: zooming out now keeps the
  existing walking-scale route ribbon and adds high-altitude atlas dashes plus origin/target
  halos for the current guide or planned path, with `routeRenderer.stats()` exposing surface
  dash, atlas dash, and endpoint counts for browser validation.
- Made the player-character production note concrete for this atlas slice: an orbit-chart
  prop, broad two-handed map-reading pose, and folded-chart or pack-strap variant are now
  part of the Avatar Kit contract for long-route planning.
- Implemented the first Cycle 5 Skyfall sky-omen pass: each active fall now carries a
  named high-altitude omen, Route Slate and route-guide details include the sky cue, the
  Hearth Journal records it, debug state exposes omen renderer counts, and the Skyfall
  renderer adds a tall translucent trail, halo, and moving shard points above the impact
  tile for travel/orbit readability.
- Made the player-character production note concrete for this sky-omen slice: sky-glance
  and hand-shade poses, held shard/glass/seed variants, and a small chart-marking prop for
  recording the omen are now part of the Avatar Kit contract.
- Implemented the first Cycle 5 saved route-plan pass: `P` pins the current best non-planned
  Route Slate target, `Shift+P` clears it, the plan persists through save/export/import,
  becomes a high-priority Route Slate pin, owns the route ribbon, appears in the Hearth
  Journal, and is exposed through `__world.routePlan()` diagnostics.
- Made the player-character production note concrete for this travel-planning slice:
  chart-marking/map-pin props, planned-route thread or chalk marks, a point-and-fold chart
  pose, and backpack variants that visibly carry the chosen route are now part of the Avatar
  Kit contract.
- Implemented the first Cycle 3 sealed-spring water rule pass: deterministic dry-cave
  spring seeps now surface as spring cave mouths, Route Slate/echo-lantern/cave-anchor
  readbacks call out the seep, cave anchors persist spring state, a blue cave-mouth marker
  renders the water cue, and nearby rain cisterns can tap clear-weather spring water for
  inland cave camps and gardens.
- Made the player-character production note concrete for this cave-water slice: water jars,
  spring-tap hand poses, cistern filling, and small blue seep/world-marker props are now part
  of the Avatar Kit contract.
- Implemented the first Cycle 4 preserved-meal effect pass: lit campfires now combine camp
  meals, trail rations, and cave mushrooms or snow herbs into expedition stew; eating stew
  grants timed trail focus that softens cave, weather, and long-flight pressure, saves with
  survival state, and appears in Route Slate, Hearth Journal, HUD/debug, and avatar prop
  readbacks.
- Made the player-character production note concrete for this food-expedition slice:
  expedition stew bowls or packed pots, ration pouches, cook/stir/pack/eat poses, and
  stowed backpack variants are now part of the Avatar Kit contract.
- Added a cycle-docs Player Character Model Pass for Hearth and Horizon: the authored
  survivor model, clothing/pack progression, equipable prop catalog, sockets, pivots,
  animation clips, procedural fallback, and a little room for mysterious carried objects are
  now called out as formal cycle work. The active Cycle 4 food-expedition note now names
  expedition meal props, ration pouches, eat/cook/pack poses, and backpack variants.
- Implemented the first weather-watch home action: using a weather vane within the wider
  home instrument ring during storm/rain/cold/soaked weather now lets a weather-safe shelter
  wait for a safer window, advance saved time/weather, recover stamina/exposure, update
  Route Slate/Hearth Journal state, and keep the normal forecast readback when weather is
  already passable.
- Made the player-character production note concrete for this slice: weather-vane reading,
  sheltered storm-watch idles, cloak/lantern/hand-shielding variants, and a readable
  wait-out-weather pose are now part of the authored model/prop/animation packet.
- Implemented the first collapse-recovery consequence for survival pressure: reaching
  maximum exposure now wakes the player at a marked home bedroll when one exists, or at
  spawn without a claimed home, with complete shelters recovering more stamina/exposure and
  the Hearth Journal counting rescue events.
- Reinforced the cycle-level player-character model requirement: Hearth and Horizon now
  treats the authored full-body player model, equippable props, socket map, and animation
  packet as required deliverables for each slice, with this rescue slice calling for
  exhausted collapse, bedroll wake-up, spawn-rescue wake-up, and visible bedroll/pack props.
- Implemented the first richer chest-storage UI for functional houses: using `R` on a
  nearby chest opens a compact storage panel with carried/stored material counts and
  one/all stash-or-take buttons, backed by pure `transferChestMaterial` rules, `__world`
  diagnostics, and focused structure tests.
- Made the player-character production note concrete for this slice: chest use should read
  through carried material bundles, a chest-open/sorting pose, and held/stowed prop variants
  for authored model work rather than remaining an invisible inventory transaction.
- Implemented the first safe prop pack-up pass for functional houses: `Shift+R` or a
  long-press on the touch `use` button near an empty/inactive placed prop now dismantles it
  back into inventory, while stocked chests, planted crop plots, wet cisterns, provisioned
  root cellars, lit fire/lanterns, home bedrolls, attuned waystones, and set cave anchors
  refuse pickup with clear feedback.
- Extended the Player Character Production Track in runtime: the procedural fallback avatar
  now has a clearer full-body survival silhouette with legs, boots, belt, satchel,
  helmet/visor cues, locomotion-derived walk/sprint/jump/swim/plane states, and diagnostics
  plus focused equipment tests for the pose-selection contract.
- Implemented the first Hearth Journal pass: `J` and the mobile log button now open a
  responsive in-game memory surface built from authoritative home, survival, food, crops,
  Route Slate, pentagon, domain resource, Skyfall, World Murmur, cave, fish, and forage
  state, with next-goal notes plus `__world`/`render_game_to_text` diagnostics.
- Reconstructed saved World Murmur notes from observation ids so the journal can show recent
  listened-to phenomena without adding a new save schema.
- Implemented the first World Murmurs wonder pass: deterministic wind-thread/tide-bell/
  root-whisper/cave-breath/star-glass phenomena now appear by day window, render as visible
  world signals, feed Route Slate and the route ribbon, can be listened to with `R`, save
  observations, and expose F3/readback/browser diagnostics.
- Made the player-character production note concrete for this slice: World Murmurs should
  carry a readable map/echo-lantern listening pose, quiet discovery reaction, and any small
  held prop needed to sell observation without loot.
- Verified the World Murmurs pass with TypeScript, focused murmur/navigation/save tests, the
  full 126-test suite, production build, diff hygiene, and desktop/mobile Playwright probes
  with screenshots, pixel checks, route/readback evidence, and recorded audio-event state.
- Implemented the first Hearth and Horizon audio-feedback pass: generated ambience and SFX
  assets now live under `public/audio`, runtime Web Audio unlock/mute/load diagnostics live
  in `src/audio`, and main survival verbs trigger event-driven feedback for crafting,
  building, gathering, fishing, hearth/rest, cave reads, water catch, Route Slate, landmarks,
  Skyfall, and UI confirm/deny states.
- Reinforced the cycle-level player-character requirement in
  `docs/hearth-and-horizon-cycle.md`: every Hearth and Horizon slice now has an explicit
  avatar packet gate for player model deltas, equipable prop variants, socket assignments,
  animations or procedural poses, and debug/screenshot evidence.
- Implemented the first Skyfall world-event pass: each day window deterministically lands one
  active emberfall/glass-rain/starbloom crater somewhere on the sphere, renders a visible
  crater/shard/beam/spark prop, feeds Route Slate plus the route ribbon as a timed travel
  target, and can be gathered with `R` for a saved one-time crystal, sand, or seed reward.
- Made the player-character production note concrete for this slice: fallen-star shard,
  glass, and seed collection should have readable held material props plus a kneel/reach or
  inspect-gather animation in the authored character packet.
- Verified the Skyfall domain slice with `npx tsc --noEmit`, focused
  Skyfall/navigation/save tests, the full 118-test suite, production build, targeted
  desktop/mobile Playwright probes with screenshots and pixel/readback evidence, and the
  bundled web-game smoke client.
- Implemented the first cave-anchor expedition-marker pass: cave anchors are workbench-
  crafted crystal/rope placeables, can be set with `R` near generated arches/dry caves/sea
  caves, save cave kind/depth/clearance/flooded/target-tile state, render with visible
  rope/stone/crystal cues, appear as carried/backpack player props, and feed Route Slate
  plus the route ribbon as persistent cave return targets.
- Made the player-character production note concrete for this slice: cave-anchor kits,
  rope coils, backpack carry, and a set/read cave-anchor discovery pose are now part of the
  visible prop and animation contract.
- Verified the cave-anchor slice with focused crafting/structure/navigation/equipment/save
  tests, the full 115-test suite, production build, `git diff --check`, packaged web-game
  Playwright smoke, targeted desktop JSON proving dry cave anchor -> Route Slate primary ->
  active route ribbon, desktop screenshot pixel sampling, and a mobile touch-viewport
  screenshot/readback check at `output/playwright/cave-anchor-mobile.png`.
- Clarified the Hearth and Horizon Player Character Production Track with a slice-level
  gate: each new mechanic should decide the authored player-model impact, equipable prop
  variants, hand/body sockets, and authored or procedural animation coverage before it is
  considered complete.
- Added the named long-form development goal: **Hearth and Horizon**.
- Scaffolded `docs/hearth-and-horizon-cycle.md` as the umbrella spec for a full crafting
  survival direction: save/simulation boundary, inventory/crafting/tools, functional
  houses, natural arches/caves/water rules, farming/fishing/ecology, planetary logistics,
  and the twelve pentagon progression spine.
- Added a README link so future work can refer to Hearth and Horizon as the overarching
  cycle instead of rediscovering the design frame.
- Preserved the current sandbox identity while leaving explicit room for mystery,
  unexplained landmarks, and emergent world discoveries.
- Implemented the first Cycle 0 foundation: `src/sim/save.ts` now serializes player state,
  local inventory, selected hotbar slot, plane unlock, sparse column edits, and chopped
  trees into a per-seed/frequency Hearth and Horizon local save slot.
- Wired save load/write/clear/export/import hooks through `src/main.ts`; default survival
  sessions save locally, `?nosave=1` disables writes, and `?resetSave=1` clears the current
  slot before boot.
- Added `test/save.test.ts` coverage for edit/tree/player/inventory/plane round-tripping,
  stable edit ordering, malformed-save rejection, and save-key identity.
- Added an explicit Hearth and Horizon character/equipment/animation planning note to the
  cycle docs: player model, prop sockets, equipped tools, backpack/camp gear, and core
  survival animation states are now part of the roadmap instead of later polish.
- Tightened that note into a dedicated character asset thread covering base model
  requirements, equip sockets, visible carried props, animation clips, and procedural
  fallback expectations for the first vertical slice.
- Implemented the first Cycle 1 scaffold: `src/sim/crafting.ts` defines stable items,
  recipe data, station gating, material spending, and crafted inventory normalization.
- Added a save-backed `B` crafting panel for sticks, workbench, stone tools, campfire,
  chest, bedroll, crop plot, shelter kits, lantern, and the visible plane-frame recipe.
- Extended local saves, debug hooks, and tests so crafted items restore alongside terrain
  edits, chopped trees, hotbar materials, and plane unlock state.
- Implemented the first Cycle 2 functional-house foundation: crafted workbench, campfire,
  chest, bedroll, crop plot, door kit, window frame, roof bundle, and lantern items can now
  be selected from the crafting panel and placed as anchored procedural world props.
- Placed workbenches count as stations for recipe gating, placed props persist in the local
  save slot, and the HUD/debug surface now reports a simple home/hearth score.
- Added first house-utility interactions: `R` on desktop or the touch use button can light
  campfires/lanterns, set a bedroll as home/rest, and quick-stash or retrieve material
  counts from a chest; these utility states save and reload with the placed prop.
- Implemented the first Cycle 3 cave/arch foundation: default terrain now includes a
  deterministic near-surface void field for natural arches, dry caves, and shoreline sea
  caves; column collision, meshing, and edit materialization read the same cave-aware
  default so generated voids are real traversable spaces instead of prop markers.
- Implemented the first Cycle 4 food foundation: crop plots plant, tend, visibly mature,
  harvest berries/seeds, and persist growth state; fishing rods can catch raw fish from
  shore when no prop is nearby; lit campfires cook fish and combine cooked fish plus berries
  into camp meals; HUD/debug/save/tests now expose the food loop.
- Tightened the cycle docs so the player model, equipped props, sockets, and animations are
  explicitly a Hearth and Horizon cycle-level deliverable.
- Implemented the first Cycle 6 landmark foundation: the twelve pentagons are now stable
  discoverable shrine sites with procedural markers, `R`/touch use interaction, clues,
  HUD/debug progress, save-backed discovery state, and focused tests.
- Implemented the first character/equipment foundation: the procedural avatar now has arms,
  hand/back sockets, visible held props, backpack tools, and action poses for the major
  Hearth and Horizon verbs; `render_game_to_text`, diagnostics, and tests now expose the
  equipment state.
- Implemented the first functional-shelter recognition pass: home scoring is now
  topology-aware around the home bedroll, requires nearby roof bundles, door, lit campfire,
  workbench, and chest for a complete shelter, upgrades rest feedback, and is covered by
  focused tests.
- Implemented the first tool-effect pass: stone axe/pick/shovel now match target materials,
  extend reach, reduce repeated mining/chopping cooldowns, track saved wear, eventually
  break, and expose tool state in HUD/debug/text probes.
- Implemented the first cave-resource chain: mining rock beside dry or sea caves can drop
  glow crystals, glow crystals plus a lantern craft the echo lantern, and `R`/touch use can
  read nearby cave resonance through HUD/debug/text probes.
- Implemented the first pentagon navigation reward: the first new pentagon awakening grants
  a saved Horizon Chart travel item, `M` reports the nearest unknown pentagon with
  great-circle distance and relative turn direction, and HUD/debug/text probes expose the
  chart signal.
- Implemented the first expedition-pressure pass: saved time/weather/stamina/exposure state,
  weather-driven exposure, sprint/swim stamina cost, warm shelter recovery, `Q` packed-food
  recovery, HUD/debug/text probes, and focused survival/save tests.
- Implemented the first functional sleep pass: using a home bedroll now advances saved
  time/weather to dawn and restores stamina/exposure based on rough, weather-safe, or fully
  functional shelter quality, with pure tests and runtime debug hooks for deterministic QA.
- Implemented the first Horizon Chart expedition-planning pass: `M` now combines nearest
  unknown pentagon distance/bearing with food, rest, home shelter, tool, light, weather, and
  plane-readiness checks so travel guidance pushes the player back through the survival loop.
- Implemented the first fish-school ecology pass: berries craft into bait, shore fishing now
  reads deterministic tile/time/weather school strength, bait improves quiet water, storms
  create stronger runs, sea caves can produce richer catches, and HUD/debug/text probes expose
  the current school.
- Implemented the first forage ecology pass: when no higher-priority prop/landmark/fishing
  action is available, `R` can gather deterministic wild berries, cold-ridge snow herbs,
  shore kelp, dry-cave mushrooms, and sea-cave kelp, all feeding the same food/save/debug
  surfaces and character prop contract.
- Implemented the first cave-pressure pass: dry and sea caves now feed survival exposure and
  stamina pressure, while lanterns, echo lanterns, and warmth mitigate the dark-cave penalty;
  debug/text probes expose the current cave pressure state.
- Implemented the first Hearth Beacon pass: a home bedroll plus a lit local campfire now
  produces a homeward great-circle distance/turn signal, `M` can read that signal before or
  alongside the Horizon Chart, lit campfires raise visible smoke, and debug/text probes expose
  the beacon state.
- Implemented the first Route Slate pass: `M` now opens a compact ranked pin panel combining
  Horizon Chart targets, Hearth Beacon, nearby cave signals, storm timing, fish runs, and
  forage opportunities, with pure route-ranking tests plus debug/text probe state for future
  map overlays.
- Implemented the first crop-condition pass: crop plots now read nearby water, shelter/roof
  protection, windows/daylight/lantern light, warmth, cold ridges, and storm exposure; bad
  conditions pause growth with explicit messages, while protected watered plots harvest a
  small berry/seed bonus and debug/text probes expose each plot environment.
- Implemented the first persistent route-marker pass: craftable waystones can now be placed,
  attuned with `R` to home/cave/shore/forage/survey context, saved as placed-prop state,
  rendered with a readable glyph, and folded back into Route Slate as distance/turn pins.
- Implemented the first visible route-ribbon pass: Route Slate now has a pure route-guide
  selector, the runtime renders terrain-hugging dashes toward the best remote chart/home/
  waystone/cave target, and debug/text probes expose the active guide and dash counts.
- Strengthened the Hearth and Horizon cycle docs so player character production stays
  attached to the cycle: the model brief, equipable prop forms, sockets, carry states,
  animation poses, and debug/readback expectations should be updated whenever new survival
  verbs or usable props are added.
- Implemented the first pentagon insight pass: every pentagon now has a stable named
  insight, themed inventory reward, derived report from saved discoveries, Route Slate pin,
  debug/text readback, and specific expedition-planning effects for food, shelter, tool,
  cave-light, and storm-prep checks.
- Implemented the first pentagon domain pass: nearby land around pentagons now reports a
  distinct domain signature, colors the shrine with a domain halo, appears in vitals/F3/
  render_game_to_text/Route Slate, and influences local weather, fish schools, and forage
  pockets such as salt-tide fish runs, snow-dial cold, storm-seat squalls, and root-vault
  seed pods.
- Implemented the first tangible pentagon-domain resource pass: each pentagon now owns
  three deterministic nearby resource sites with dormant/awakened props, one-time saved
  harvest state, practical inventory rewards, Route Slate resource pins, F3/readback/debug
  surfaces, and focused tests for placement, harvesting, save compatibility, and routing.
- Implemented the first cave-mouth visibility pass: generated arches, dry caves, and sea
  caves now surface as ranked mouth signals with depth/clearance/flooded readback, visible
  terrain cairns/ribs, Route Slate cave pins, echo-lantern feedback, route-ribbon targeting,
  diagnostics, and focused tests.
- Reinforced the character production requirement in the cycle docs: every new usable prop,
  tool, wearable, vehicle, or station should carry a model/mesh target, held and stowed
  variants, equip socket, animation clips, and debug/screenshot checks in the same cycle
  slice.
- Implemented the first shore-building/dock pass: dock segments are workbench-crafted
  placeable props with shoreline/water-edge placement rules, water-surface layer handling,
  visible plank-and-piling world geometry, carried character prop form, direct `R` dock
  fishing, dock-aware fish schools, debug/readback state, and focused crafting/structure/
  fishing/equipment tests.
- Verified the dock pass with focused tests, the full 99-test suite, production build, the
  develop-web-game Playwright smoke client, targeted dock placement/fishing JSON, and visual
  screenshot inspection at `output/playwright/dock-visual-close.png`.
- Made the player-character production note concrete for this slice: the cycle docs now
  call out trail ration bundles, drying-rack kits, and cook/preserve animation coverage as
  part of the model, prop socket, and animation contract.
- Implemented the first preserved expedition food pass: drying racks are workbench-crafted
  placeable camp stations with visible carried and placed forms, saved preserve state,
  `R` interaction, trail ration output from raw fish plus kelp or snow herbs, ration eating
  priority, Route Slate expedition food-unit weight, HUD/readback state, and focused
  crafting/structure/survival/navigation/equipment tests.
- Implemented the first weather-vane home instrument pass: weather vanes are
  workbench-crafted placeable props with carried and placed forms, saved forecast-read state,
  `R` weather reading, Route Slate storm-timing readiness, F3/readback diagnostics, and
  focused crafting/structure/navigation/equipment tests.
- Made the player-character production note concrete for this slice: weather-vane kits,
  backpack carry, and a forecast-reading/discovery pose are now part of the visible prop and
  animation contract.
- Named the recurring avatar work the Player Character Production Track in the cycle docs:
  every new survival slice should update the player model target, equipable prop catalog,
  held/stowed/world prop variants, sockets, animation clips, procedural fallback poses, and
  screenshot/debug validation expectations.
- Implemented the first compost/fertility farm-station pass: compost bins are
  workbench-crafted placeable props that turn kelp, berries, cave mushrooms, or raw fish
  scraps into compost; crop plots can spend compost into fertility, push through dry soil,
  grow faster, and harvest stronger berry/seed yields.
- Made the player-character production note concrete for this slice: compost sacks,
  compost-bin kits, backpack/carry variants, and composting/fertilizing poses are now part
  of the visible prop and animation contract.
- Verified the compost/fertility slice with the full 108-test suite, production build,
  `git diff --check`, packaged web-game Playwright smoke run, targeted compost-bin/crop
  browser JSON, desktop screenshot inspection, PNG pixel sampling, and a mobile viewport
  screenshot/error check.
- Implemented the first rain-cistern irrigation pass: rain cisterns are workbench-crafted
  placeable camp/farm stations with carried and placed forms, saved water/fill state, `R`
  storm-water collection, dry-crop irrigation spending, crop environment readback, F3/debug
  diagnostics, and focused crafting/structure/equipment/save tests.
- Made the player-character production note concrete for this slice: rain-cistern kits,
  water jars, backpack/carry variants, and rain-collecting/irrigating poses are now part of
  the visible prop and animation contract.
- Verified the rain-cistern irrigation slice with focused crafting/structure/equipment/save
  tests, the full 110-test suite, production build, `git diff --check`, targeted browser
  JSON proving mist capture -> dry crop irrigation, desktop screenshot inspection, and PNG
  pixel sampling at `output/playwright/rain-cistern-targeted.png`.
- Implemented the first root-cellar expedition-cache pass: root cellars are workbench-crafted
  placeable home stations with carried and placed forms, saved provision/cache state, `R`
  caching for trail rations, camp meals, or cave forage, withdrawal back into trail rations,
  home-cluster provision counting, Route Slate packed-food credit, diagnostics/readback, and
  focused crafting/structure/navigation/equipment/save tests.
- Made the player-character production note concrete for this slice: root-cellar kits,
  provision crates, backpack/carry variants, and cache/withdraw ration poses are now part of
  the visible prop and animation contract.
- Verified the root-cellar cache slice with focused tests, the full 113-test suite,
  production build, packaged web-game Playwright smoke, targeted browser JSON proving
  bedroll home -> cache trail ration -> cache cave mushrooms -> Route Slate cellar food
  credit, close screenshot inspection, and PNG pixel sampling at
  `output/playwright/root-cellar-close.png`.

## 2026-07-02

- User rejected the courier route modes and Frontier/outpost-building loop; current direction is back to the sandbox planet: creative/free-flight, mining, building, chopping, and the craftable plane.
- Reverted the Courier/Frontier release in the working tree, removing the route/outpost modules, docs, UI CSS, and tests instead of leaving unused mode code.
- Kept useful non-mode improvements: key-edge buffering for reliable quick taps, `render_game_to_text`, `advanceTime`, and a clearer `?creative=1` path.
- Updated plane onboarding: startup hint explains two trees -> 12 wood -> `E`/plane button, tree chopping reports plane progress, and failed craft attempts say how to get wood.
- Verified `npm test` returns the original 24-test suite, `npm run build` passes, the develop-web-game Playwright client captures Creative/touch gameplay, and targeted Playwright assertions confirm no Courier/Frontier UI remains.
- User approved committing, pushing, and deploying this cleanup to Pages.
- Added README QA/deployment notes for the simplified sandbox release path and Pages workflow.
- Release gates for this commit: `npm test` passed 24 tests; `npm run build` passed with the known Vite large-chunk warning; production preview passed desktop default sandbox plane-craft and mobile `?creative=1&touch=1` checks with clean console/page errors and nonblank canvas pixel samples.
