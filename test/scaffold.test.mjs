import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scaffold, validateConfig, exists } from '../skills/opensource/scripts/scaffold.mjs';
import { install } from '../skills/opensource/scripts/cli.mjs';

const config = {
  name: '@example/test-package', description: 'A useful sample.',
  owner: 'example', repo: 'test-package', profile: 'skills',
  license: 'Apache-2.0', copyright: 'Example contributors',
};
const cli = fileURLToPath(new URL('../bin/opensource.mjs', import.meta.url));
const temp = () => mkdtemp(join(tmpdir(), 'opensource-test-'));
const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const npmEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
};
delete npmEnv.NODE_TEST_CONTEXT;
npmEnv.NPM_CONFIG_CACHE = join(tmpdir(), 'opensource-smoke-npm-cache');
npmEnv.npm_config_cache = npmEnv.NPM_CONFIG_CACHE;
function npm(args, cwd) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd, encoding: 'utf8', env: npmEnv, timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!result.stderr.includes('run() is being called recursively'), 'Generated project tests must execute.');
  return result.stdout;
}
function packInfo(output) {
  const value = JSON.parse(output);
  return Array.isArray(value) ? value[0] : Object.values(value)[0];
}

test('dry run creates nothing; existing targets are never merged', async () => {
  const root = await temp();
  const target = join(root, 'new');
  const plan = await scaffold(target, config, { dryRun: true });
  assert.equal(await exists(target), false);
  assert.ok(plan.files.includes('package.json'));
  await mkdir(target);
  await writeFile(join(target, 'mine.txt'), 'preserve');
  await assert.rejects(scaffold(target, config), /already exists/);
  assert.equal(await readFile(join(target, 'mine.txt'), 'utf8'), 'preserve');
});

test('reject invalid and unexpected inputs', () => {
  for (const change of [
    { name: '../outside' }, { name: 'UPPERCASE' }, { name: 'node_modules' },
    { owner: 'a/b' }, { repo: '../../x' }, { profile: 'server' },
    { license: 'invented' }, { description: 'line\ninjected' },
    { token: 'not-a-real-token' }, { copyright: '' },
    { skills: [{ name: 'synced', description: 'Reserved Claude name.' }] },
    { skills: [{ name: 'anthropic-skills', description: 'Reserved Claude name.' }] },
  ]) assert.throws(() => validateConfig({ ...config, ...change }));
});

for (const profile of ['skills', 'typescript']) {
  for (const license of ['Apache-2.0', 'MIT']) {
    test(`${profile}/${license}: generated tests and safe metadata work`, async () => {
      const root = await temp();
      const target = join(root, 'generated');
      await scaffold(target, {
        ...config, profile, license,
        description: 'Quotes " and <script> and `literal` and $(notExecuted).',
      });
      const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
      assert.equal(pkg.license, license);
      assert.equal(pkg.publishConfig.tag, 'next');
      assert.equal(pkg.version, '0.1.0-preview.1');
      const svg = await readFile(join(target, 'docs/assets/header.svg'), 'utf8');
      assert.ok(!svg.includes('<script>'));
      const text = await readFile(join(target, 'LICENSE'), 'utf8');
      assert.ok(text.includes(license === 'MIT' ? 'Permission is hereby granted' : 'Apache License'));
      npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, 'cache')], target);
      npm(['run', 'check', '--cache', join(root, 'cache')], target);
      const packed = packInfo(npm([
        'pack', '--dry-run', '--ignore-scripts', '--json', '--cache', join(root, 'cache'),
      ], target));
      const names = packed.files.map((file) => file.path).sort();
      assert.ok(names.includes('LICENSE') && names.includes('package.json'));
      assert.equal(pkg.private, true);
      assert.ok(!names.some((name) => /^(?:test|scripts|\.opensource|\.github)\//.test(name)));
      if (profile === 'typescript') assert.ok(names.includes('dist/index.js') && names.includes('dist/index.d.ts'));
      else assert.ok(names.includes('bin/skills.mjs') && names.includes('skills/test-package/SKILL.md'));
    });
  }
}

for (const host of ['codex', 'claude-code']) {
  test(`${host}: copied skill scaffolds independently and preserves existing install`, async () => {
    const root = await temp();
    const preview = await install(host, root, { dryRun: true });
    assert.equal(await exists(preview.target), false);
    const { target } = await install(host, root);
    const configPath = join(root, 'choices.json');
    await writeFile(configPath, JSON.stringify(config));
    const result = spawnSync(process.execPath, [
      join(target, 'scripts/cli.mjs'), 'init', join(root, 'product'), '--config', configPath,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    await assert.rejects(install(host, root), /already exists/);
    assert.equal(await exists(join(target, 'agents/openai.yaml')), host === 'codex');
  });
}

test('install rejects symlinked ancestors and preserves destination', async () => {
  const root = await temp();
  const outside = await temp();
  await symlink(outside, join(root, '.agents'));
  await assert.rejects(install('codex', root), /symlink/);
  assert.equal(await exists(join(outside, 'skills')), false);
  await assert.rejects(install('cursor', root), /Host/);
});

test('CLI rejects noninteractive missing config and unexpected flags', () => {
  for (const args of [
    ['init', '/not-used'], ['init', '/not-used', '--force'],
    ['install', '--host', 'codex'], ['unknown'],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
});

test('packed CLI runs offline without adding a project dependency', async () => {
  const root = await temp();
  const packed = packInfo(npm([
    'pack', '--ignore-scripts', '--json', '--pack-destination', root,
    '--cache', join(root, 'cache'),
  ], packageRoot));
  const names = packed.files.map((file) => file.path);
  assert.ok(names.includes('skills/opensource/scripts/cli.mjs'));
  assert.ok(names.includes('skills/opensource/LICENSE'));
  assert.ok(!names.some((path) => /^(test|\.opensource|\.github)\//.test(path)));
  const consumer = join(root, 'consumer');
  await mkdir(consumer);
  npm([
    'exec', '--offline', '--yes', '--ignore-scripts', '--cache', join(root, 'cache'),
    '--package', join(root, packed.filename), '--',
    'opensource', 'install', '--host', 'codex', '--project', consumer,
  ], consumer);
  assert.equal(await exists(join(consumer, '.agents/skills/opensource/SKILL.md')), true);
  assert.equal(await exists(join(consumer, 'package.json')), false);
  assert.equal(await exists(join(consumer, 'package-lock.json')), false);
  assert.equal(await exists(join(consumer, 'node_modules')), false);
});
