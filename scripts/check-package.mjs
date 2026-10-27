import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function checkPackage(root) {
  const cwd = resolve(root);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd, encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const archive = Array.isArray(output) ? output[0] : Object.values(output)[0];
  const required = [
    'package.json', 'README.md', 'LICENSE', 'NOTICE', 'bin/opensource.mjs',
    'skills/opensource/SKILL.md', 'skills/opensource/LICENSE', 'skills/opensource/NOTICE',
    'skills/opensource/agents/openai.yaml',
    ...['cli', 'scaffold', 'templates', 'profiles', 'questions'].map((name) => `skills/opensource/scripts/${name}.mjs`),
    ...['configuration', 'conventions', 'releasing'].map((name) => `skills/opensource/references/${name}.md`),
    ...['Apache-2.0.txt', 'MIT.txt', 'skill-installer.mjs', 'managed-skills.mjs'].map((name) => `skills/opensource/assets/${name}`),
  ];
  assert.deepEqual(archive.files.map((file) => file.path).sort(), required.sort(), 'Packed inventory changed. Review the allowlist.');
  for (const file of required) {
    const path = resolve(cwd, file);
    assert.ok((await lstat(path)).isFile(), `Not a regular public file: ${file}`);
    const content = await readFile(path, 'utf8');
    assert.ok(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|npm_[A-Za-z0-9]{36,}/.test(content),
      `Potential credential in public payload: ${file}`);
  }
  const pkg = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@ottoai/opensource');
  assert.equal(pkg.version, '0.1.0');
  assert.equal(pkg.publishConfig.tag, 'latest');
  assert.ok(!pkg.dependencies && !pkg.optionalDependencies, 'The runtime remains dependency-free.');
  console.log(`${required.length} reviewed public files; ${archive.unpackedSize} unpacked bytes. No publication performed.`);
  return archive;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await checkPackage(fileURLToPath(new URL('../', import.meta.url)));
}
