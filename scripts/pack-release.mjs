import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directory } from '../skills/opensource/assets/managed-skills.mjs';
import { checkPackage } from './check-package.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await checkPackage(root);
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(pkg.private, false, 'Release remains blocked until readiness is reviewed.');
const parent = await directory(join(root, '.opensource'), { create: true });
try {
  await parent.verify();
  const destination = join(parent.path, 'release');
  await mkdir(destination); // Refuse stale archives and preserve evidence.
  const target = await directory(destination, { parent });
  try {
    const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', target.path],
      { cwd: root, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    const archive = Array.isArray(output) ? output[0] : Object.values(output)[0];
    assert.equal(archive.filename, 'ottoai-opensource-0.1.0.tgz');
    const bytes = await readFile(join(target.path, archive.filename));
    const digest = createHash('sha256').update(bytes).digest('hex');
    await writeFile(join(target.path, 'SHA256SUMS'), `${digest}  ${archive.filename}\n`, { flag: 'wx' });
    console.log(`${archive.filename}: ${digest}. Nothing staged or published.`);
  } finally { await target.close(); }
} finally { await parent.close(); }
