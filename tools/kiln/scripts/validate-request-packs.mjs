// No-spend validator for future Hearth and Horizon Kiln request packs.
// Usage from tools/kiln:
//   node scripts/validate-request-packs.mjs
//   node scripts/validate-request-packs.mjs k9-aquatic-life

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kilnJson } from './http.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REQUESTS = resolve(HERE, '../requests/hearth-horizon-next-packs.json');
const OUT_DIR = resolve(HERE, '../../../output/kiln');
const filters = process.argv.slice(2);

if (!existsSync(REQUESTS)) throw new Error(`request packet not found: ${REQUESTS}`);

const packet = JSON.parse(readFileSync(REQUESTS, 'utf8'));
const packs = packet.packs.filter((pack) => {
  if (!filters.length) return true;
  return filters.some((filter) => pack.id.includes(filter) || pack.goalNode.includes(filter));
});

if (!packs.length) throw new Error(`no request packs matched filters: ${filters.join(', ')}`);

const results = [];
for (const pack of packs) {
  const validation = await kilnJson('/packs/validate', {
    method: 'POST',
    body: { manifest: pack.manifest },
  });
  const itemCount = countItems(pack.manifest.items);
  results.push({
    id: pack.id,
    priority: pack.priority,
    goalNode: pack.goalNode,
    ok: Boolean(validation.ok),
    itemCount,
    costEstimateCents: validation.costEstimateCents,
    warnings: validation.warnings ?? [],
    errors: validation.errors ?? [],
  });
  const cost = typeof validation.costEstimateCents === 'number'
    ? `${validation.costEstimateCents}c`
    : 'n/a';
  const label = validation.ok ? 'OK' : 'INVALID';
  console.log(`${label} ${pack.id} (${itemCount} items, estimate ${cost})`);
  for (const warning of validation.warnings ?? []) console.log(`  warning: ${warning}`);
  for (const error of validation.errors ?? []) console.log(`  error: ${error}`);
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = resolve(OUT_DIR, 'kiln-request-pack-validation.json');
writeFileSync(outPath, JSON.stringify({
  schemaVersion: 'spherePlanet.kilnRequestValidation.v1',
  validatedAt: new Date().toISOString(),
  source: relativeRequestPath(),
  filters,
  counts: {
    total: results.length,
    ok: results.filter((result) => result.ok).length,
    invalid: results.filter((result) => !result.ok).length,
    itemCount: results.reduce((sum, result) => sum + result.itemCount, 0),
    costEstimateCents: results.reduce((sum, result) => (
      typeof result.costEstimateCents === 'number' ? sum + result.costEstimateCents : sum
    ), 0),
  },
  results,
}, null, 2));

if (results.some((result) => !result.ok)) {
  throw new Error(`one or more request packs are invalid; see ${outPath}`);
}

console.log(`Wrote ${outPath}`);

function countItems(items = []) {
  return items.reduce((sum, item) => sum + Math.max(1, Number(item.count ?? 1)), 0);
}

function relativeRequestPath() {
  return 'tools/kiln/requests/hearth-horizon-next-packs.json';
}
