import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, access, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { scaffold, validateConfig, exists } from '../skills/opensource/scripts/scaffold.mjs';
import { gatherConfig } from '../skills/opensource/scripts/questions.mjs';

const node = process.execPath;
const pnpm = fileURLToPath(new URL('../node_modules/pnpm/bin/pnpm.cjs', import.meta.url));
const rootPath = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env, PATH: `${dirname(node)}:${join(rootPath, 'node_modules/.bin')}:${process.env.PATH}` };
delete env.NODE_TEST_CONTEXT;
env.NPM_CONFIG_CACHE = join(tmpdir(), 'opensource-smoke-npm-cache');
env.npm_config_cache = env.NPM_CONFIG_CACHE;
const base = {
  name: '@example/starter', description: 'A project-specific starter.',
  owner: 'example', repo: 'starter', profile: 'skills',
  license: 'Apache-2.0', copyright: 'Example contributors',
};
const temp = () => mkdtemp(join(tmpdir(), 'opensource-profile-'));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env, timeout: 120_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.ok(!result.stderr.includes('run() is being called recursively'), 'Nested project tests must execute.');
  return result;
}
const npm = (args, cwd) => run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, cwd);
function manager(c, args, cwd) {
  return c.packageManager === 'pnpm' ? run(node, [pnpm, ...args], cwd) : npm(args, cwd);
}

test('common-only profile creates no package, SDK, or skill tooling', async () => {
  const root = await temp();
  const plan = await scaffold(join(root, 'common'), { ...base, profile: 'none', name: 'Common project' });
  assert.equal(plan.config.publication, 'none');
  assert.equal(plan.config.packageManager, 'none');
  for (const path of plan.files) {
    assert.ok(!/^(package(?:-lock)?\.json|pnpm-|tsconfig|src\/|skills\/|scripts\/|bin\/|test\/)/.test(path), path);
  }
  assert.ok(!plan.files.includes('.github/workflows/npm-stage.yml'));
  assert.ok(!plan.files.includes('.github/workflows/ci.yml'));
  assert.ok(plan.files.includes('README.md') && plan.files.includes('LICENSE'));
});

test('common-only wizard skips npm, TypeScript, and skill choices', async () => {
  const prompts = [];
  const provided = { ...base, profile: 'none', conventions: 'customize' };
  const result = await gatherConfig(async (message) => { prompts.push(message); return ''; }, provided);
  assert.equal(result.publication, 'none');
  assert.ok(!prompts.some((message) => /Skill names|Supported coding hosts|Workspace npm|Package manager|npm publication|npm release|Initial version|Exact Node/.test(message)));
  validateConfig(result);
});

test('shared defaults require fewer questions and preserve explicit customization', async () => {
  const prompts = [];
  const result = await gatherConfig(async (message) => { prompts.push(message); return ''; }, {
    ...base, license: 'MIT', dco: false,
  });
  assert.equal(result.license, 'MIT');
  assert.equal(result.dco, false);
  assert.equal(result.publication, 'deferred');
  assert.ok(!prompts.some((message) => /Require contributor DCO|Generate GitHub Actions/.test(message)));
  validateConfig(result);
});

for (const hosts of [['codex'], ['claude-code'], ['codex', 'claude-code']]) {
  test(`skill bundle targets ${hosts.join('/')} and preserves collisions`, async () => {
    const root = await temp();
    const target = join(root, 'skills-project');
    const plan = await scaffold(target, {
      ...base, hosts, skills: [
        { name: 'design', description: 'Guide project design decisions.' },
        { name: 'test', description: 'Guide project testing decisions.' },
      ],
    });
    assert.ok(!plan.files.some((path) => /^(src\/|tsconfig|pnpm-)/.test(path)));
    npm(['run', 'check'], target);
    for (const host of hosts) {
      const consumer = join(root, `consumer-${host}`);
      await mkdir(consumer);
      const install = ['bin/skills.mjs', 'install', '--host', host, '--project', consumer];
      run(node, [...install, '--dry-run'], target);
      assert.equal(await exists(join(consumer, host === 'codex' ? '.agents' : '.claude')), false);
      run(node, install, target);
      const copied = join(consumer, host === 'codex' ? '.agents' : '.claude', 'skills/design');
      await access(join(copied, 'SKILL.md'));
      assert.equal(await exists(join(copied, 'agents/openai.yaml')), host === 'codex');
      const collision = spawnSync(node, install, { cwd: target, env, encoding: 'utf8' });
      assert.notEqual(collision.status, 0);
    }
    const unsupported = hosts.includes('codex') ? 'cursor' : 'codex';
    const consumer = join(root, 'unsupported');
    await mkdir(consumer);
    assert.notEqual(spawnSync(node, ['bin/skills.mjs', 'install', '--host', unsupported, '--project', consumer],
      { cwd: target, env }).status, 0);
  });
}

test('repository-only skills omit installer and publication workflows', async () => {
  const root = await temp();
  const target = join(root, 'repository-only');
  const plan = await scaffold(target, { ...base, distribution: 'repository' });
  assert.equal(plan.config.publication, 'none');
  assert.ok(!plan.files.includes('bin/skills.mjs'));
  assert.ok(!plan.files.includes('.github/workflows/npm-stage.yml'));
  assert.ok(!plan.files.includes('scripts/check-release.mjs'));
  npm(['run', 'check'], target);
});

test('default deferred publication is blocked by metadata, check, and workflow', async () => {
  const root = await temp();
  const target = join(root, 'deferred');
  await scaffold(target, base);
  const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  const check = spawnSync(node, ['scripts/check-release.mjs'], { cwd: target, encoding: 'utf8' });
  assert.notEqual(check.status, 0);
  assert.match(check.stderr, /deferred/);
  const workflow = await readFile(join(target, '.github/workflows/npm-stage.yml'), 'utf8');
  assert.ok(workflow.includes("&& false"));
  const publishJob = workflow.split('  stage:\n')[1];
  assert.ok(publishJob.includes('id-token: write'));
  assert.ok(publishJob.includes('sha256sum --check'));
  assert.ok(!/npm (?:ci|test|run)|pnpm (?:install|run)/.test(publishJob));
});

test('configured publication passes local guards but performs no external writes', async () => {
  const root = await temp();
  const target = join(root, 'configured');
  await scaffold(target, { ...base, publication: 'configured' });
  const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.private, false);
  run(node, ['scripts/check-release.mjs'], target);
  run(node, ['scripts/pack-release.mjs'], target);
  await access(join(target, '.opensource/release/SHA256SUMS'));
  const workflow = await readFile(join(target, '.github/workflows/npm-stage.yml'), 'utf8');
  assert.ok(!workflow.includes('&& false'));
  assert.ok(workflow.includes("NPM_STAGING_ENABLED == 'true'"));
});

for (const packageManager of ['npm', 'pnpm']) {
  for (const layout of ['single', 'workspace']) {
    test(`TypeScript ${packageManager}/${layout}: frozen install, types, tests, archives`, async () => {
      const root = await temp();
      const target = join(root, 'sdk');
      const plan = await scaffold(target, {
        ...base, profile: 'typescript', packageManager, layout,
        ...(layout === 'workspace' ? {
          name: 'sdk-workspace',
          packages: [
            { name: '@example/core', description: 'Shared provider-native SDK core.' },
            { name: '@example/provider', description: 'A provider-specific SDK.' },
          ],
        } : {}),
      });
      assert.ok(!plan.files.some((path) => /^(skills\/|bin\/skills|skills-package)/.test(path)));
      if (packageManager === 'npm') npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, 'cache')], target);
      else run(node, [pnpm, 'install', '--frozen-lockfile', '--ignore-scripts', '--store-dir', join(root, 'store')], target);
      manager(plan.config, ['run', 'check'], target);
      const packagePath = layout === 'workspace' ? join(target, 'packages/core') : target;
      const pkg = JSON.parse(await readFile(join(packagePath, 'package.json'), 'utf8'));
      assert.equal(pkg.private, true);
      assert.equal(pkg.exports['.'].types, './dist/index.d.ts');
      assert.equal(pkg.exports['.'].import, './dist/index.js');
      const runtime = await import(pathToFileURL(join(packagePath, 'dist/index.js')).href);
      assert.equal(runtime.identity('verified'), 'verified');
      const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', root], packagePath).stdout);
      const info = Array.isArray(packed) ? packed[0] : Object.values(packed)[0];
      const consumer = join(root, 'consumer');
      await mkdir(consumer);
      npm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', join(root, 'cache'), join(root, info.filename)], consumer);
      run(node, ['--input-type=module', '-e', `import { identity } from ${JSON.stringify(pkg.name)}; if (identity(7) !== 7) process.exit(1);`], consumer);
      await writeFile(join(consumer, 'consumer.mts'),
        `import { identity } from ${JSON.stringify(pkg.name)};\nconst value: number = identity(7);\nvoid value;\n`);
      run(node, [
        join(target, 'node_modules/typescript/bin/tsc'), '--noEmit', '--module', 'NodeNext',
        '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--strict', 'consumer.mts',
      ], consumer);
      await writeFile(join(consumer, 'wrong.mts'),
        `import { identity } from ${JSON.stringify(pkg.name)};\nconst value: number = identity("not a number");\nvoid value;\n`);
      const rejected = spawnSync(node, [
        join(target, 'node_modules/typescript/bin/tsc'), '--noEmit', '--module', 'NodeNext',
        '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--strict', 'wrong.mts',
      ], { cwd: consumer, env, encoding: 'utf8' });
      assert.notEqual(rejected.status, 0, 'Published declarations must reject the wrong type.');
    });
  }
}

test('generated skill installer refuses symlinked destinations', async () => {
  const root = await temp();
  const target = join(root, 'project');
  await scaffold(target, base);
  const consumer = join(root, 'consumer');
  const outside = join(root, 'outside');
  await mkdir(consumer);
  await mkdir(outside);
  await symlink(outside, join(consumer, '.agents'));
  const result = spawnSync(node, ['bin/skills.mjs', 'install', '--host', 'codex', '--project', consumer], {
    cwd: target, env, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.equal(await exists(join(outside, 'skills')), false);
});

test('bundle preflight preserves all skills when a later destination collides', async () => {
  const root = await temp();
  const target = join(root, 'project');
  await scaffold(target, { ...base, skills: [
    { name: 'first', description: 'The first task.' },
    { name: 'last', description: 'The last task.' },
  ] });
  const consumer = join(root, 'consumer');
  await mkdir(join(consumer, '.agents/skills/last'), { recursive: true });
  const existing = join(consumer, '.agents/skills/last/SKILL.md');
  await writeFile(existing, 'User-owned instructions.');
  const result = spawnSync(node, ['bin/skills.mjs', 'install', '--host', 'codex', '--project', consumer], {
    cwd: target, env, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.equal(await exists(join(consumer, '.agents/skills/first')), false);
  assert.equal(await readFile(existing, 'utf8'), 'User-owned instructions.');
});

test('generated behavior tests fail when sample behavior is broken', async () => {
  const root = await temp();
  const target = join(root, 'project');
  await scaffold(target, { ...base, profile: 'typescript' });
  npm(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], target);
  await writeFile(join(target, 'src/index.ts'), 'export function identity<T>(_value: T): T { return null as T; }\n');
  const result = spawnSync('npm', ['test'], { cwd: target, env, encoding: 'utf8', timeout: 60_000 });
  assert.notEqual(result.status, 0, 'A broken implementation must fail the generated tests.');
  assert.ok(!result.stderr.includes('run() is being called recursively'));
  assert.match(result.stdout, /sample preserves identity/);
});

test('profile configuration rejects collisions and cross-profile settings', () => {
  for (const change of [
    { profile: 'cli' }, { hosts: [] }, { hosts: ['cursor'] },
    { profile: 'typescript', skills: [{ name: 'skill', description: 'A skill.' }] },
    { profile: 'none', publication: 'deferred' },
    { publication: 'none', releaseMode: 'github-staged' },
    { distribution: 'repository', publication: 'configured' },
    { skills: [{ name: '../outside', description: 'A task.' }] },
    { skills: [{ name: 'same', description: 'A.' }, { name: 'same', description: 'B.' }] },
    { profile: 'typescript', layout: 'workspace', packages: [{ name: '@example/only', description: 'Only one.' }] },
    { profile: 'typescript', layout: 'workspace', packages: [
      { name: '@example/core', description: 'A.' }, { name: '@other/core', description: 'B.' },
    ] },
  ]) assert.throws(() => validateConfig({ ...base, ...change }), JSON.stringify(change));
});

test('derived names stay valid for legal npm names with punctuation or long slugs', () => {
  for (const name of ['@example/foo__bar', `@example/${'a'.repeat(100)}.`]) {
    const config = validateConfig({ ...base, name });
    assert.match(config.skills[0].name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(config.skills[0].name.length <= 64);
    assert.ok(config.displayName.length <= 64);
    assert.ok(config.cliName.length <= 64);
  }
});
