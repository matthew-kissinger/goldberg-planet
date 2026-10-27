# C6 House Redesign Brief

Status, 2026-07-08: the current procedural wall-shell house implementation is rejected as
the player-facing house direction. It proved useful topology details, but it does not read
as a properly built house at gameplay distance. Do not keep polishing the screenshot, do not
generate a Kiln skin pack over this shape, and do not treat the existing C6 proof as an
accepted visual target.

## What To Keep

- Edge-socket and topology lessons: real hex edges, pentagon invalid-edge blocking,
  same-tile socket occupancy, traversal blocking, and interior-seam exclusion are still useful
  implementation facts.
- Functional shelter tests can stay as regression scaffolding until the replacement system
  owns the same contracts.
- Code-owned dimensions are still the right direction for player-built houses; GLBs should
  skin sockets only after the procedural grammar is good.

## What To Burn Down

- The current freestanding wall-panel scatter as the visible house language.
- The current irregular footprint beauty/readability path.
- Any shared-scale house-shell Kiln request based on the current wall panels, corners, and
  roof joins.
- Any claim that the current proof images show shippable houses.

## Replacement Direction

The next C6 pass should start from a real house-building grammar:

- Floors define rooms first, with a readable foundation slab and clear expansion seams.
- Walls snap into continuous runs, not isolated posts scattered around a hex footprint.
- Corners and openings are generated from adjacent wall relationships, not placed as
  independent visual nouns.
- Roofs solve as a coherent cap over a room before decorative roof pieces appear.
- Door/window previews should show the finished wall section they will become.
- Shelter recognition should follow the same grammar the player sees.

The first replacement proof should show one small, boring, well-built house before it tries
irregular multi-room footprints.
