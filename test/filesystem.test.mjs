import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rename, readdir, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../skills/opensource/scripts/cli.mjs';
import { scaffold, readConfig } from '../skills/opensource/scripts/scaffold.mjs';
import { directory, writeTree, snapshot } from '../skills/opensource/assets/managed-skills.mjs';

const temp = () => mkdtemp(join(tmpdir(), 'opensource-filesystem-'));
const config = {
  name: 'sample', description: 'A common-only project.', owner: 'example',
  repo: 'sample', profile: 'none', license: 'MIT', copyright: 'Example',
};

test('managed lifecycle preserves backups and restores removed skills', async () => {
  const root = await temp();
  const first = await install('codex', root);
  await install('codex', root, { operation: 'upgrade' });
  const records = join(root, '.opensource/skills/codex');
  const receipt = JSON.parse(await readFile(join(records, 'opensource.json'), 'utf8'));
  assert.equal(receipt.package, '@ottoai/opensource');
  assert.ok(receipt.files['SKILL.md']);
  assert.ok((await readdir(join(records, receipt.backup, 'payload'))).includes('SKILL.md'));
  await install('codex', root, { operation: 'uninstall' });
  await assert.rejects(readFile(join(first.target, 'SKILL.md')), { code: 'ENOENT' });
  await install('codex', root, { operation: 'restore' });
  assert.ok((await readFile(join(first.target, 'SKILL.md'), 'utf8')).includes('name: opensource'));
});

test('unowned skills and edited managed skills are never replaced or removed', async () => {
  const root = await temp();
  const { target } = await install('claude-code', root);
  await writeFile(join(target, 'SKILL.md'), 'user edits');
  for (const operation of ['upgrade', 'uninstall']) {
    await assert.rejects(install('claude-code', root, { operation }), /Local edits/);
    assert.equal(await readFile(join(target, 'SKILL.md'), 'utf8'), 'user edits');
  }
  const unowned = await temp();
  await mkdir(join(unowned, '.agents/skills/opensource'), { recursive: true });
  await writeFile(join(unowned, '.agents/skills/opensource/SKILL.md'), 'unowned');
  await assert.rejects(install('codex', unowned, { operation: 'uninstall' }), /receipt/);
  assert.equal(await readFile(join(unowned, '.agents/skills/opensource/SKILL.md'), 'utf8'), 'unowned');
});

test('concurrent installs produce one managed copy without overwriting', async () => {
  const root = await temp();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => install('codex', root)));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const receipt = JSON.parse(await readFile(join(root, '.opensource/skills/codex/opensource.json'), 'utf8'));
  const files = await snapshot(join(root, '.agents/skills/opensource'));
  assert.equal(Object.keys(files).length, Object.keys(receipt.files).length);
});

test('concurrent scaffolds never merge into another winner', async () => {
  const root = await temp();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => scaffold(join(root, 'new'), config)));
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.ok((await readFile(join(root, 'new/README.md'), 'utf8')).includes('sample'));
});

test('writes refuse a replaced ancestor without touching an external symlink', async () => {
  const root = await temp();
  const outside = await temp();
  const target = join(root, 'new');
  await mkdir(target);
  const bound = await directory(target);
  try {
    await rename(target, join(root, 'original'));
    await symlink(outside, target);
    await assert.rejects(writeTree(bound, { 'nested/sample.txt': 'guarded' }), /changed|symlink/);
    assert.deepEqual(await readdir(outside), []);
    assert.deepEqual(await readdir(join(root, 'original')), []);
  } finally { await bound.close(); }
});

test('nested payload symlinks and symlinked config files are refused', async () => {
  const root = await temp();
  const outside = await temp();
  await mkdir(join(root, 'nested'));
  await writeFile(join(outside, 'private.txt'), 'private');
  await symlink(join(outside, 'private.txt'), join(root, 'nested/private.txt'));
  await assert.rejects(snapshot(root), /symlink/);
  await writeFile(join(outside, 'config.json'), JSON.stringify(config));
  await symlink(join(outside, 'config.json'), join(root, 'config.json'));
  await assert.rejects(readConfig(join(root, 'config.json')));
});

test('hard-linked payloads are refused without reading private target content', async () => {
  const root = await temp();
  const outside = await temp();
  await writeFile(join(outside, 'private.txt'), 'private');
  await link(join(outside, 'private.txt'), join(root, 'linked.txt'));
  await assert.rejects(snapshot(root), /hard-linked/);
});

test('prototype-like filenames are counted as real local edits', async () => {
  const root = await temp();
  const { target } = await install('codex', root);
  await writeFile(join(target, '__proto__'), 'user addition');
  const files = await snapshot(target);
  assert.equal(Object.hasOwn(files, '__proto__'), true);
  assert.equal(files.__proto__.toString(), 'user addition');
  await assert.rejects(install('codex', root, { operation: 'upgrade' }), /Local edits/);
  assert.equal(await readFile(join(target, '__proto__'), 'utf8'), 'user addition');
});

test('managed state symlinks, edited backups and stale locks fail closed', async () => {
  const root = await temp();
  const outside = await temp();
  await symlink(outside, join(root, '.opensource'));
  await assert.rejects(install('codex', root), /symlink/);
  assert.deepEqual(await readdir(outside), []);
  const project = await temp();
  await install('codex', project);
  await install('codex', project, { operation: 'uninstall' });
  const state = join(project, '.opensource/skills/codex');
  const record = JSON.parse(await readFile(join(state, 'opensource.json'), 'utf8'));
  await writeFile(join(state, record.backup, 'payload/SKILL.md'), 'edited backup');
  await assert.rejects(install('codex', project, { operation: 'restore' }), /Backup changed/);
  await mkdir(join(state, '.lock'));
  await assert.rejects(install('codex', project, { operation: 'restore' }), /lock/);
});
