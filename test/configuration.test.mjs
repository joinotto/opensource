import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gatherConfig, questions } from '../skills/opensource/scripts/questions.mjs';
import { validateConfig, scaffold } from '../skills/opensource/scripts/scaffold.mjs';

const base = {
  name: '@example/package', description: 'A package.', owner: 'example',
  repo: 'package', profile: 'skills', license: 'MIT', copyright: 'Example contributors',
};
const temp = () => mkdtemp(join(tmpdir(), 'opensource-config-test-'));

test('wizard asks each applicable setting and preserves supplied answers', async () => {
  const asked = [];
  const answers = {
    name: base.name, description: base.description, owner: base.owner,
    repo: base.repo, copyright: base.copyright, license: 'MIT', profile: 'skills', conventions: 'customize',
  };
  const result = await gatherConfig(async (message) => {
    const question = questions.find((entry) => message.startsWith(entry.label));
    assert.ok(question, message);
    asked.push(question.key);
    return answers[question.key] || '';
  });
  assert.equal(result.license, 'MIT');
  assert.deepEqual(asked, questions.filter((question) => !question.when || question.when(result)).map((question) => question.key));
  const remaining = [];
  await gatherConfig(async (message) => {
    remaining.push(message);
    return '';
  }, base);
  assert.ok(!remaining.some((message) => message.startsWith('License:')));
  assert.ok(remaining.some((message) => message.startsWith('Shared conventions')));
  assert.ok(!remaining.some((message) => message.startsWith('Require contributor DCO')));
  validateConfig(result);
});

test('conditional prompts and boolean/list parsing affect the answers', async () => {
  const changes = {
    cliName: 'my-command', ci: 'no', publication: 'none', conventions: 'customize',
    agents: 'none', dco: 'no', readmeHeader: 'no',
    keywords: 'library,example',
  };
  const asked = [];
  const result = await gatherConfig(async (message) => {
    const question = questions.find((entry) => message.startsWith(entry.label));
    asked.push(question.key);
    return changes[question.key] || '';
  }, base);
  assert.ok(asked.includes('cliName'));
  assert.ok(!asked.includes('releaseTag'));
  assert.equal(result.ci, false);
  assert.equal(result.dco, false);
  assert.deepEqual(result.agents, []);
  assert.deepEqual(result.keywords, ['library', 'example']);
  validateConfig(result);
});

test('wizard retries invalid choices without silently accepting defaults', async () => {
  const supplied = { ...base };
  delete supplied.license;
  const messages = [];
  const licenseAnswers = ['invented', 'mit'];
  const result = await gatherConfig(async (message) => {
    if (message.startsWith('License:')) return licenseAnswers.shift();
    return '';
  }, supplied, (message) => messages.push(message));
  assert.equal(result.license, 'MIT');
  assert.equal(licenseAnswers.length, 0);
  assert.deepEqual(messages, ['Choose MIT or Apache-2.0.']);
});

test('all selected metadata and workflow settings reach the files', async () => {
  const root = await temp();
  const target = join(root, 'project');
  await scaffold(target, {
    ...base, cliName: 'custom-command', displayName: 'Custom Tool', publication: 'configured',
    copyrightYear: '2025', author: 'Example Maintainer', keywords: ['tool', 'example'],
    version: '1.2.3', releaseTag: 'latest', nodeVersion: '24.0.0',
    defaultBranch: 'trunk', securityContact: 'security@example.com',
  });
  const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.2.3');
  assert.equal(pkg.publishConfig.tag, 'latest');
  assert.equal(pkg.engines.node, '>=24.0.0');
  assert.deepEqual(pkg.bin, { 'custom-command': 'bin/skills.mjs' });
  assert.deepEqual(pkg.keywords, ['tool', 'example']);
  assert.equal(pkg.author, 'Example Maintainer');
  const workflow = await readFile(join(target, '.github/workflows/npm-stage.yml'), 'utf8');
  assert.ok(workflow.includes("'refs/heads/trunk'"));
  assert.ok(workflow.includes("node-version: '24.0.0'"));
  assert.ok(workflow.includes('--tag latest'));
  assert.ok((await readFile(join(target, 'SECURITY.md'), 'utf8')).includes('security@example.com'));
  assert.ok((await readFile(join(target, 'LICENSE'), 'utf8')).includes('Copyright 2025 Example contributors'));
  assert.ok((await readFile(join(target, 'docs/assets/header.svg'), 'utf8')).includes('Custom Tool'));
});

test('opting out removes files and npm publication capability', async () => {
  const root = await temp();
  const target = join(root, 'project');
  const plan = await scaffold(target, {
    ...base, ci: false, publication: 'none', dependabot: false,
    dco: false, agents: [], readmeHeader: false,
  });
  for (const path of [
    '.github/workflows/ci.yml', '.github/workflows/npm-stage.yml',
    '.github/dependabot.yml', 'AGENTS.md', 'CLAUDE.md', 'docs/assets/header.svg',
  ]) assert.ok(!plan.files.includes(path), path);
  const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(pkg.private, true);
  assert.ok(!Object.hasOwn(pkg, 'publishConfig'));
  const policy = await readFile(join(target, 'CONTRIBUTING.md'), 'utf8');
  assert.ok(!policy.includes('git commit -s'));
  const pr = await readFile(join(target, '.github/pull_request_template.md'), 'utf8');
  assert.ok(!pr.includes('DCO signoff'));
  const readme = await readFile(join(target, 'README.md'), 'utf8');
  assert.ok(!readme.includes('header.svg'));
  assert.ok(!readme.includes('/workflows/ci.yml'));
});

test('manual mode and Claude-only instructions do not reference absent files', async () => {
  const root = await temp();
  const target = join(root, 'project');
  const plan = await scaffold(target, { ...base, ci: false, agents: ['claude-code'] });
  assert.equal(plan.config.releaseMode, 'manual');
  assert.ok(!plan.files.includes('.github/workflows/npm-stage.yml'));
  assert.ok(!plan.files.includes('AGENTS.md'));
  const claude = await readFile(join(target, 'CLAUDE.md'), 'utf8');
  assert.ok(!claude.includes('Read AGENTS.md'));
  assert.ok(claude.includes('npm run check'));
  const guide = await readFile(join(target, 'docs/RELEASING.md'), 'utf8');
  assert.ok(guide.includes('Manual npm release'));
});

test('invalid configuration and inconsistent release choices are rejected', () => {
  for (const change of [
    { ci: 'false' }, { dco: 1 }, { agents: ['cursor'] }, { agents: ['codex', 'codex'] },
    { keywords: 'not-array' }, { keywords: ['line\nbreak'] },
    { defaultBranch: "main' || true" }, { nodeVersion: '22.1.0' },
    { nodeVersion: '22.23.3; exit 0' }, { version: '1.0.0-preview.01' },
    { version: '01.2.3' }, { version: '1.2.3', releaseTag: 'next' },
    { releaseTag: 'latest' }, { releaseMode: 'direct' },
    { ci: false, releaseMode: 'github-staged' }, { securityContact: 'line\ninjected' },
    { securityContact: 'https://example.com' }, { copyrightYear: 'unknown' },
    { cliName: '../outside' },
  ]) assert.throws(() => validateConfig({ ...base, ...change }), JSON.stringify(change));
});
