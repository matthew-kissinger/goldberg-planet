// Generate one approved request pack through Kiln /v1 packs.
// This spends generation budget. It refuses to run unless KILN_CONFIRM_SPEND=1.
//
// Usage from tools/kiln:
//   KILN_CONFIRM_SPEND=1 node scripts/generate-request-pack.mjs k9-aquatic-life

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadBytes, kilnJson, sleep, verifyGlb, writeWithin } from './http.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REQUESTS = resolve(HERE, '../requests/hearth-horizon-next-packs.json');
const OUT_ROOT = resolve(process.env.KILN_OUT_DIR ?? '../../public/assets/kiln/generated');
const MAX_COST_CENTS = Number(process.env.KILN_MAX_COST_CENTS ?? '2500');
const POLL_MS = Math.max(5000, Number(process.env.KILN_PACK_POLL_MS ?? '15000'));

if (!existsSync(REQUESTS)) throw new Error(`request packet not found: ${REQUESTS}`);

const packet = JSON.parse(readFileSync(REQUESTS, 'utf8'));
const requestedId = process.argv[2];
if (!requestedId) {
  console.log('Available request packs:');
  for (const pack of packet.packs) console.log(`  ${pack.id} - ${pack.goalNode}`);
  throw new Error('Pass the request pack id to generate.');
}

const requestPack = packet.packs.find((pack) => pack.id === requestedId);
if (!requestPack) throw new Error(`unknown request pack id: ${requestedId}`);

const validation = await kilnJson('/packs/validate', {
  method: 'POST',
  body: { manifest: requestPack.manifest },
});
if (!validation.ok) throw new Error(`pack invalid: ${(validation.errors ?? []).join('; ')}`);

if (typeof validation.costEstimateCents === 'number' && validation.costEstimateCents > MAX_COST_CENTS) {
  throw new Error(`pack estimate ${validation.costEstimateCents}c exceeds KILN_MAX_COST_CENTS=${MAX_COST_CENTS}`);
}

if (process.env.KILN_CONFIRM_SPEND !== '1') {
  console.log(JSON.stringify({
    ok: true,
    spendConfirmed: false,
    id: requestPack.id,
    itemCount: expandedItems(requestPack.manifest.items).length,
    costEstimateCents: validation.costEstimateCents,
    warnings: validation.warnings ?? [],
    next: `Set KILN_CONFIRM_SPEND=1 to generate ${requestPack.id}.`,
  }, null, 2));
} else {
  await generateConfirmedPack(requestPack);
}

async function generateConfirmedPack(requestPack) {
  console.log(`Creating pack ${requestPack.id}`);
  const created = await kilnJson('/packs', {
    method: 'POST',
    body: { manifest: requestPack.manifest },
  });
  const packId = created.pack?.packId;
  if (!packId) throw new Error('pack create response did not include pack.packId');
  console.log(`Created ${packId}`);

  const run = await kilnJson(`/packs/${encodeURIComponent(packId)}/run`, {
    method: 'POST',
    body: {},
  });
  console.log(`Queued ${(run.generationIds ?? []).length} generations`);

  const completed = await pollPack(packId);
  const items = expandedItems(requestPack.manifest.items);
  const outputs = [];

  for (const [index, member] of completed.members.entries()) {
    const item = items[index] ?? { name: `member-${index + 1}` };
    const slug = uniqueSlug(item.name ?? `member-${index + 1}`, index, items);
    if (member.status !== 'ok') {
      outputs.push({ slug, status: member.status, error: member.error ?? 'pack member did not succeed' });
      continue;
    }
    const job = await kilnJson(`/generations/${encodeURIComponent(member.generationId)}`);
    if (!job.asset?.assetId) {
      outputs.push({ slug, status: 'failed', generationId: member.generationId, error: 'succeeded member has no asset id' });
      continue;
    }
    const urls = await kilnJson(`/assets/${encodeURIComponent(job.asset.assetId)}/download-url`, {
      method: 'POST',
      body: { includeProvenance: false },
    });
    const glb = await downloadBytes(urls.glb);
    verifyGlb(glb);
    const modelPath = writeWithin(OUT_ROOT, `${slug}/model.glb`, glb);
    writeWithin(OUT_ROOT, `${slug}/asset.json`, Buffer.from(JSON.stringify({
      ...job.asset,
      requestPacket: 'tools/kiln/requests/hearth-horizon-next-packs.json',
      requestPackId: requestPack.id,
      kilnPackId: packId,
      generationId: member.generationId,
      requestedItem: item,
    }, null, 2)));
    outputs.push({
      slug,
      status: 'ok',
      generationId: member.generationId,
      assetId: job.asset.assetId,
      modelPath,
      bytes: glb.byteLength,
    });
  }

  const ok = outputs.filter((output) => output.status === 'ok').length;
  console.log(JSON.stringify({
    ok: ok > 0,
    requestPackId: requestPack.id,
    kilnPackId: packId,
    generated: ok,
    failed: outputs.length - ok,
    outputs,
    next: [
      'Review generated GLBs under public/assets/kiln/generated.',
      'Add accepted slugs to tools/kiln/assets-catalog.json before manifest/promote.',
      'Run node scripts/build-manifest.mjs, node scripts/promote.mjs, npm run proof:kiln-assets, and npm run proof:kiln-asset-viewer.',
    ],
  }, null, 2));
}

async function pollPack(packId) {
  for (let i = 0; i < 180; i++) {
    const pack = await kilnJson(`/packs/${encodeURIComponent(packId)}`);
    const statuses = (pack.members ?? []).map((member) => member.status);
    if (statuses.length && statuses.every((status) => status === 'ok' || status === 'failed' || status === 'missing')) {
      if (statuses.every((status) => status !== 'ok')) throw new Error(pack.error ?? `pack ${packId} had no successful members`);
      return pack;
    }
    await sleep(POLL_MS);
  }
  throw new Error(`pack ${packId} timed out`);
}

function expandedItems(items = []) {
  return items.flatMap((item) => Array.from({ length: Math.max(1, Number(item.count ?? 1)) }, () => item));
}

function uniqueSlug(name, index, items) {
  const base = sanitize(name);
  const sameNameCount = items.filter((item) => item.name === name).length;
  if (sameNameCount <= 1) return base;
  return `${base}-${index + 1}`;
}

function sanitize(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
