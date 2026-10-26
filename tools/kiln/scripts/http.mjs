// Minimal zero-dependency HTTP helper for the Kiln Studio /v1 developer API.
// Adapted from kiln-threejs-starter/scripts/kiln/http.ts + env.ts (raw fetch, no SDK).
// Requires Node 20+ (built-in global fetch). No npm install needed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// --- .env loading (.env.local wins over .env; process.env wins over both) ---
let envLoaded = false;
function loadLocalEnv() {
  if (envLoaded) return;
  envLoaded = true;
  for (const file of ['.env', '.env.local']) {
    const p = resolve(process.cwd(), file);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key]) continue; // do not clobber real env
      let val = (m[2] ?? '').trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}
loadLocalEnv();

// The Kiln Studio /v1 API (formerly https://app.kilnstudio.tools/v1) is retired, so there is no default.
export const apiUrl = (process.env.KILN_API_URL ?? '').replace(/\/+$/, '');
function requiredApiUrl() {
  if (!apiUrl) {
    throw new Error('KILN_API_URL is not set. The Kiln Studio /v1 API is retired; see tools/kiln/README.md for current Kiln options.');
  }
  return apiUrl;
}

export function requiredApiKey() {
  const key = process.env.KILN_API_KEY;
  if (!key) throw new Error('Set KILN_API_KEY in .env.local (or the shell). It is an admin-issued ks_live_... PAT.');
  if (!key.startsWith('ks_live_')) {
    console.warn('warning: KILN_API_KEY does not start with ks_live_ — is this the right developer PAT?');
  }
  return key;
}

const EDGE_RETRIES = numEnv('KILN_EDGE_RETRIES', 8);
const EDGE_RETRY_MS = numEnv('KILN_EDGE_RETRY_MS', 15000);

// JSON request against /v1 with Bearer auth + CloudFront edge-block retry.
export async function kilnJson(path, options = {}) {
  for (let attempt = 0; attempt <= EDGE_RETRIES; attempt += 1) {
    const res = await fetch(`${requiredApiUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        authorization: `Bearer ${requiredApiKey()}`,
        'content-type': 'application/json',
        'user-agent': 'kiln-dropin/1.0.0',
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const text = await res.text();
    const body = text ? safeJson(text) : undefined;
    if (!res.ok) {
      if (attempt < EDGE_RETRIES && isCloudFrontBlock(res.status, text)) {
        await sleep(EDGE_RETRY_MS);
        continue;
      }
      throw new Error(`${options.method ?? 'GET'} ${path} failed ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  }
  throw new Error(`${options.method ?? 'GET'} ${path} failed after CloudFront edge retries`);
}

// Download raw bytes from a presigned URL (or a /v1-relative path).
export async function downloadBytes(url) {
  const resolved = url.startsWith('/') ? new URL(url, new URL(requiredApiUrl()).origin) : new URL(url);
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    throw new Error(`unsupported URL protocol ${resolved.protocol}`);
  }
  const res = await fetch(resolved);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// GLB files begin with ASCII magic "glTF".
export function verifyGlb(bytes) {
  const magic = Buffer.from(bytes.slice(0, 4)).toString('utf8');
  if (magic !== 'glTF') throw new Error(`downloaded file is not a GLB, magic=${magic}`);
}

// Safe, contained write under an output root (blocks path traversal / absolute escapes).
export function writeWithin(root, relPath, bytes) {
  if (!relPath.trim() || isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) {
    throw new Error(`unsafe path ${relPath}`);
  }
  const outRoot = resolve(root);
  const target = resolve(outRoot, relPath);
  const rel = relative(outRoot, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`path escapes output root: ${relPath}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return target;
}

export function readJsonFile(path, fallback) {
  if (!existsSync(path)) return fallback;
  return safeJson(readFileSync(path, 'utf8'));
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return text; }
}
function isCloudFrontBlock(status, text) {
  return status === 403 && text.includes('CloudFront') && text.includes('Request blocked');
}
function numEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
