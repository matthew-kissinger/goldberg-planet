# /v1 Endpoint Flow (single asset, end to end)

> **Retired.** This endpoint no longer exists; see the note at the top of `../README.md`.

Former base URL: `https://app.kilnstudio.tools/v1` (retired)  ·  Auth: `Authorization: Bearer ks_live_...`
Contract: **async 202 + poll**. (Source: `kiln-studio/server/src/routes/v1.ts`.)

## 0. No-spend capability check (do this first)
```
GET /v1/capabilities                 (scope: library:read)  -> models, defaults, limits
GET /v1/library/palette-presets                            -> { presets, maxSlots }
GET /v1/library/roles                                      -> valid role ids
```

## 1. Submit a generation
```
POST /v1/generations                 (scope: generations:create)
{
  "assetSpec": {
    "schemaVersion": "kiln.asset.v1",
    "prompt": "a mossy low-poly stone well",
    "category": "prop",              // ASSET_CATEGORIES enum
    "role": "prop",                  // ASSET_ROLES enum
    "optimizedPalette": true,        // quantize to a small clean palette
    "paletteId": "sphere-planet"     // optional: pin saved-palette colors (consistency)
  },
  "idempotencyKey": "well-001"       // dedupes retries; reuse w/ different input -> 409
}
-> 202 { "jobId": "...", "status": "queued", "createdAt": "..." }
```
A flat top-level `"prompt": "..."` is also accepted instead of `assetSpec`.

## 2. Poll the job
```
GET /v1/generations/:jobId           (scope: generations:read)   every ~2s
-> { "jobId": "...", "status": "queued|running|succeeded|failed",
     "asset": { "assetId": "...", "quality": {...}, "palette": {...} }?,  // present on success
     "error": "..."? }
```
Generic `GET /v1/jobs/:id` exists too (same shape) for compose/refine jobs.

## 3. Mint download URLs
```
POST /v1/assets/:assetId/download-url   (scope: artifacts:download)
{ "includeProvenance": false }          // includeSource -> artifacts:source; includeProvenance -> provenance:read
-> { "glb": "<presigned https url>", "views": "...", "source"?: "...", "provenance"?: "..." }
```

## 4. Download the bytes
```
GET <glb presigned url>              (plain fetch, no auth header needed on the presigned URL)
-> raw GLB. Verify the first 4 bytes are ASCII "glTF" before trusting it.
```

## Other useful endpoints
- `POST /v1/generations/plan` / `POST /v1/generations/validate` — normalize/validate + cost estimate, no spend.
- `POST /v1/assets/:id/refine` — async job (202+poll) to edit an owned asset by instruction.
- Palettes: `GET/POST /v1/palettes`, `GET/PUT/DELETE /v1/palettes/:id` (see palette doc).
- Packs: `/v1/packs*` (see packs doc).  Scenes: `/v1/scenes*` (compose placed layouts).

## Error codes to handle
- 400 invalid/validation-failed (check `detail`) · 401 bad/expired key · 402 daily spend cap ·
  403 missing scope / pack pro-gate · 409 idempotency conflict · 429 rate limit ·
  503 `external_api_disabled` (the whole `/v1` kill-switch — normally OFF).
- 403 with CloudFront "Request blocked" HTML = edge throttle; retry with backoff (http.mjs does this).
