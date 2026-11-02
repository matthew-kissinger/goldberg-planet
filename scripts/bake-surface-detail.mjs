// Deterministic, seamless material grain baked once; no per-frame noise generation.
// Node-only PNG encoder: RGB stores broad grain, fine grain, and strata respectively.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const size = 256;
const hash = (x, y, seed) => {
  let h = Math.imul(x ^ seed, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295;
};
const noise = (x, y, period, seed) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const at = (a, b) => hash((a + period) % period, (b + period) % period, seed);
  const a = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx;
  const b = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
  return a * (1 - sy) + b * sy;
};
const pixels = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const at = y * (size * 4 + 1) + 1 + x * 4;
  const a = noise(x / size * 8, y / size * 8, 8, 37);
  const b = noise(x / size * 32, y / size * 32, 32, 71);
  const c = noise(x / size * 64, y / size * 64, 64, 19);
  pixels[at] = Math.round((a * 0.55 + b * 0.3 + c * 0.15) * 255);
  pixels[at + 1] = Math.round((b * 0.65 + c * 0.35) * 255);
  pixels[at + 2] = Math.round((0.5 + Math.sin(y / size * Math.PI * 32 + a * 2) * 0.18 + (b - 0.5) * 0.2) * 255);
  pixels[at + 3] = 255;
}
const crc = bytes => { let c = 0xffffffff; for (const b of bytes) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out;
};
const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
await mkdir('assets/materials', { recursive: true });
await writeFile('assets/materials/expedition-grain.png', png);
await writeFile('assets/materials/expedition-grain.json', JSON.stringify({ source: 'scripts/bake-surface-detail.mjs', size, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex'), channels: ['broad grain', 'fine grain', 'strata'], colorSpace: 'linear data' }, null, 2) + '\n');
console.log(`Baked ${size}x${size} seamless surface data (${png.length} bytes)`);
