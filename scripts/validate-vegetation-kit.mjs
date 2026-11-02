/** Validate the exported kit with Khronos glTF-Validator.
 * npm-installed: node scripts/validate-vegetation-kit.mjs
 * explicit install: node scripts/validate-vegetation-kit.mjs C:/path/to/gltf-validator/index.js
 * Does not download packages or require a browser/GPU. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const argument = process.argv[2];
const moduleId = argument ? pathToFileURL(resolve(argument)).href : 'gltf-validator';
const imported = await import(moduleId), validator = imported.default ?? imported;
const output = resolve('assets/vegetation-kit');
const manifest = JSON.parse(await readFile(resolve(output, 'manifest.json'), 'utf8'));
const reports = [];
for (const asset of manifest.assets) {
  const bytes = await readFile(resolve(output, asset.file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== asset.sha256) throw new Error(`Manifest hash mismatch: ${asset.file}`);
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: asset.file, maxIssues: 100 });
  reports.push({ file: asset.file, sha256, ...report });
}
const totals = reports.reduce((total, report) => ({
  errors: total.errors + report.issues.numErrors,
  warnings: total.warnings + report.issues.numWarnings,
  infos: total.infos + report.issues.numInfos,
}), { errors: 0, warnings: 0, infos: 0 });
await writeFile(resolve(output, 'validation.json'), JSON.stringify({ validator: validator.version(), reports, ...totals }, null, 2) + '\n');
console.log(JSON.stringify({ assets: reports.length, ...totals }));
if (totals.errors || totals.warnings) process.exitCode = 1;
