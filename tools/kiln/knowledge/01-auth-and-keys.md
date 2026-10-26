# Auth & Key Handling

> **Retired.** Kiln Studio and its `/v1` API were shut down; `ks_live_` keys can no longer be issued.
> See the note at the top of `../README.md` for current Kiln options.

## The key
- Kiln `/v1` uses an admin-issued **DeveloperClient PAT** shaped `ks_live_<43 base64url chars>`.
  (Source: `kiln-studio/server/src/developer/clients.ts` — `TOKEN_PREFIX = 'ks_live'`.)
- It is stored server-side only as a **SHA-256 hash**; the plaintext is shown **once** at creation
  and is unrecoverable. Rotation = revoke + re-issue.

## How it travels
- Header on every `/v1` request: `Authorization: Bearer ks_live_...`
  (NOT `x-api-key`). Source: `kiln-studio/server/src/developer/clients.ts` `developerAuth`.
- `content-type: application/json` for JSON bodies.

## Where the key lives in this kit
- Put it in `.env.local` (gitignored) as `KILN_API_KEY=ks_live_...`.
- `scripts/http.mjs` loads `.env` then `.env.local`; real shell env wins over both.
- NEVER print it, commit it, or paste it into logs, chat, code, or asset metadata.

## Getting a key provisioned (owner action — not automatable by the agent)
The owner (admin) mints it against production. Simplest paths:
1. **Admin UI (retired):** the Kiln Studio admin -> "developers" tab -> "issue private developer
   client" -> pick the owner's user, set $/day + rpm + scopes -> Create -> copy the one-time secret.
2. **Repo script (in the Kiln monorepo, not here):**
   `AWS_PROFILE=mkclouds bun scripts/provision-starter-developer-client.ts`
   (requires `aws sso login --profile mkclouds` first).

Ask the owner for a key with these scopes (single-asset + pack lane):
```
library:read generations:create generations:read assets:read artifacts:download
palettes:read palettes:write packs:create packs:read packs:write packs:run packs:export
```
(Scope sets mirror `kiln-threejs-starter/docs/provisioning.md`.)

## Limits attached to a key
- **Rate limit:** default 60 req/min -> HTTP 429 on breach.
- **Daily spend cap:** default $5 (500 cents) -> HTTP 402 `developer_spend_cap` when exceeded.
- **Expiry:** the starter provisioning script defaults to 24h; the Admin UI can issue non-expiring
  keys. An expired key returns 401. If you get 401/402/429, tell the human — don't retry blindly.
