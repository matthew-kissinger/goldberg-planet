# Progress

Current goal: a clean, playable core loop to rebuild from (walk the hex planet, chop trees,
craft the plane, fly). The previous Hearth and Horizon cycle log is archived at
[docs/archive/progress-hearth-and-horizon.md](docs/archive/progress-hearth-and-horizon.md).

## 2026-10-26: burndown to the core loop

- Removed everything outside the loop: building kits, the snap grid and house-kit sockets,
  chests and storage, fishing and fish schools, forage, cooking and food, tools and tool
  wear, pack burden, mining and block placing, pentagon landmarks, time and weather,
  autopilot/orbit demos, creative mode, the `__world` debug hooks, and the character prop
  catalogue beyond bare hands, a carried log and the plane frame.
- Removed dead Kiln remnants: `KilnFishSkinSlug`, `tools/kiln/`, the Kiln intake and
  adoption docs, the procedural-tree toggle, and the tree visual-kind classifier.
- Split the 3,847-line `src/main.ts` into `src/game/` (core loop, controls, camera rig,
  autosave, spawn, hints) plus `render/ocean.ts`, `render/stars.ts` and
  `render/tileHighlight.ts`; `main.ts` is now boot plus a short frame loop.
- Save format bumped to v4 (player, inventory, plane, felled trees, chop progress, loose
  logs). Older saves are ignored, not migrated.
- `tsconfig` now enables `noUnusedLocals` and `noUnusedParameters`.
- Kept on purpose: natural caves in terrain generation (they shape the world), the column
  edit API (terrain engine, tested), free-flight on F (dev affordance), and the soundtrack.
- Verified: `npm run build`, `npm test`, and a scripted browser playtest on desktop and a
  phone viewport (spawn, chop two trees, pick up 12 wood, craft in the panel, board, fly)
  with no console errors.

## Next

The rebuild starts from here: new Kiln assets, better agents, and a proper game loop.
