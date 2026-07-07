# Kiln Drop-in — 3D assets for sphere-planet

A **self-contained, portable kit** for generating consistent 3D game assets from
[Kiln Studio](https://app.kilnstudio.tools)'s production `/v1` developer API — with no dependency on
the Kiln monorepo, no SDK, and no `@kiln/engine`. Drop this folder into the sphere-planet
(goldberg-planet) game repo and any coding agent (or you) can generate props, creatures, and POIs
that share the game's palette.

Extracted and adapted from Kiln's own dogfood harness `kiln-threejs-starter/` (scripts/kiln/*.ts,
agent/skills/*, docs/*). Everything here talks only to `/v1` as an external developer would.

## What's in here
```
kiln-dropin/
├─ README.md                      ← this file
├─ .env.example                   ← copy to .env.local, paste the ks_live_ token
├─ .gitignore                     ← keeps .env.local + generated assets out of git
├─ palette.sphere-planet.json     ← the game's palette as Kiln slots (consistency anchor)
├─ skills/
│  ├─ kiln-generate-asset.SKILL.md   ← teaches an agent to generate ONE asset
│  └─ kiln-generate-pack.SKILL.md    ← teaches an agent to generate a coherent SET
├─ knowledge/
│  ├─ 01-auth-and-keys.md            ← key shape, header, provisioning, limits
│  ├─ 02-v1-endpoint-flow.md         ← submit → poll → download-url → GLB
│  ├─ 03-palette-consistency.md      ← optimizedPalette + paletteId recipe
│  ├─ 04-packs-for-consistent-sets.md← multi-asset packs
│  └─ 05-glb-voxel-integration.md    ← GLB-vs-voxel fit + three.js loading
└─ scripts/                        ← zero-dependency Node (.mjs), just needs Node 20+
   ├─ http.mjs                        ← fetch helper: auth, .env load, edge retry, GLB verify
   ├─ capabilities.mjs                ← no-spend token/health check (run first)
   ├─ create-palette.mjs              ← registers palette.sphere-planet.json in Kiln
   └─ generate-asset.mjs              ← prompt → GLB, downloaded to KILN_OUT_DIR
```

## Prerequisites
1. **Node 20+** (uses built-in global `fetch`). No `npm install` needed for this kit.
2. **A Kiln developer API key** (`ks_live_...`). This is owner-gated and must be provisioned against
   production by the admin — see `knowledge/01-auth-and-keys.md`. Until you have one, the scripts
   can't run. (The owner mints it via https://app.kilnstudio.tools/admin → developers, or the Kiln
   repo's `provision-starter-developer-client.ts`, after `aws sso login --profile mkclouds`.)

## Setup
```bash
cp .env.example .env.local
# edit .env.local -> set KILN_API_KEY=ks_live_...
```

## Use it (end to end)
```bash
# 1. No-spend sanity check (proves the key works and /v1 is live)
node scripts/capabilities.mjs

# 2. Register the game palette ONCE, then pin it in .env.local
node scripts/create-palette.mjs
#    -> prints a paletteId; set KILN_PALETTE_ID=<that> in .env.local

# 3. Generate an asset (downloads a GLB into KILN_OUT_DIR)
node scripts/generate-asset.mjs "a mossy low-poly stone well"
KILN_ASSET_ROLE=poi node scripts/generate-asset.mjs "a small glowing waypoint shrine"
```
Each generation writes `KILN_OUT_DIR/<assetId>/model.glb` + `asset.json`. Then register it in your
game's asset manifest and load it with `GLTFLoader` (see `knowledge/05-glb-voxel-integration.md`).

## Hearth and Horizon request packs
Future approved-asset needs live in `requests/hearth-horizon-next-packs.json` before they enter
`assets-catalog.json`. This keeps missing future GLBs from breaking the current intake proof while
still giving the team an executable Kiln plan.

No-spend validation:
```bash
node scripts/validate-request-packs.mjs
node scripts/validate-request-packs.mjs k9-aquatic-life
```

Guarded generation for one approved pack:
```bash
KILN_CONFIRM_SPEND=1 node scripts/generate-request-pack.mjs k9-aquatic-life
```

Generated candidates stay in `public/assets/kiln/generated/` until review. After acceptance, add the
slugs to `assets-catalog.json`, run `node scripts/build-manifest.mjs`, then `node scripts/promote.mjs`
and the root proof gates.

## The flow in one line
`POST /v1/generations` (202) → poll `GET /v1/generations/:jobId` → `POST /v1/assets/:id/download-url`
→ GET the presigned GLB → verify `glTF` magic. Auth is `Authorization: Bearer ks_live_...`.

## Consistency is the whole point
Voxel games live or die on a coherent palette. This kit pins **`optimizedPalette: true` +
`paletteId: sphere-planet`** on every generation so props/creatures match the terrain's colors
(grass `#6fae4e`, dirt `#8a6242`, rock `#7d7f85`, sand `#d8c48a`, snow `#eef2f5`, wood `#a8763f`,
plus stone-dark/foliage/water/glow extras). See `knowledge/03-palette-consistency.md`.

## Voxel fit (important)
Kiln outputs smooth **GLB meshes**, not voxel blocks. Use it for **props, creatures, POIs,
structures, decorations** placed on top of the procedural voxel terrain — NOT for terrain blocks
themselves. See `knowledge/05-glb-voxel-integration.md`.

## Security
- The `ks_live_...` key is a secret shown only once. Keep it in `.env.local` (gitignored). Never
  print, commit, or paste it. Rotate by asking the owner to revoke + re-issue.
- Don't commit generated GLBs/packages or presigned URLs.

## Gotchas
- **Key not provisioned yet** → all scripts fail with "Set KILN_API_KEY". Owner must mint one first.
- **402 spend cap** (default $5/day/key) or **429 rate limit** (default 60/min) → back off; ask the
  owner to raise caps for a big batch.
- **403 CloudFront "Request blocked"** → transient edge throttle; `http.mjs` auto-retries.
- **503 external_api_disabled** → the `/v1` kill-switch is on (normally off); ping the owner.
- **Pack routes 402/403** → the key lacks pack scopes or the pro-feature gate is closed.
