import { readFile } from 'node:fs/promises';

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const escape = (value) => value.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);
const compiler = {
  version: '6.0.3',
  integrity: 'sha512-y2TvuxSZPDyQakkFRPZHKFm+KKVqIisdg9/CZwm9ftvKXLP8NRWj38/ODjNbr43SsoXqNuAisEf1GdCxqWcdBw==',
};
const tsconfig = {
  compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
    lib: ['ES2022'], types: [], strict: true, declaration: true,
    noEmitOnError: true, forceConsistentCasingInFileNames: true,
  },
};

export function packageDirectories(c) {
  return c.profile === 'typescript' && c.layout === 'workspace'
    ? c.packages.map((item) => `packages/${item.name.split('/').at(-1)}`) : ['.'];
}

function npmLock(root, children = {}) {
  const packages = {
    '': {
      name: root.name, version: root.version, license: root.license,
      ...(root.workspaces ? { workspaces: root.workspaces } : {}),
      ...(root.devDependencies ? { devDependencies: root.devDependencies } : {}),
      ...(root.bin ? { bin: root.bin } : {}), engines: root.engines,
    },
  };
  if (root.devDependencies) packages['node_modules/typescript'] = {
    version: compiler.version, resolved: `https://registry.npmjs.org/typescript/-/typescript-${compiler.version}.tgz`,
    integrity: compiler.integrity, dev: true, license: 'Apache-2.0',
    bin: { tsc: 'bin/tsc', tsserver: 'bin/tsserver' }, engines: { node: '>=14.17' },
  };
  for (const [path, pkg] of Object.entries(children)) {
    packages[path] = { name: pkg.name, version: pkg.version, license: pkg.license, engines: pkg.engines };
    packages[`node_modules/${pkg.name}`] = { resolved: path, link: true };
  }
  return json({ name: root.name, version: root.version, lockfileVersion: 3, requires: true, packages });
}

function pnpmLock(directories) {
  return `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    devDependencies:
      typescript:
        specifier: ${compiler.version}
        version: ${compiler.version}
${directories.filter((path) => path !== '.').map((path) => `  ${path}: {}`).join('\n')}
packages:
  typescript@${compiler.version}:
    resolution:
      integrity: ${compiler.integrity}
    engines: {node: '>=14.17'}
    hasBin: true
snapshots:
  typescript@${compiler.version}: {}
`;
}

function publicManifest(c, name, description, path = '') {
  const repo = `https://github.com/${c.owner}/${c.repo}`;
  return {
    name, version: c.version, description, type: 'module', license: c.license,
    engines: { node: `>=${c.nodeVersion}` },
    private: c.publication !== 'configured',
    repository: { type: 'git', url: `git+${repo}.git`, ...(path ? { directory: path } : {}) },
    bugs: { url: `${repo}/issues` }, homepage: `${repo}#readme`,
    ...(c.author ? { author: c.author } : {}),
    ...(c.keywords.length ? { keywords: c.keywords } : {}),
    ...(c.publication !== 'none' ? { publishConfig: { access: 'public', tag: c.releaseTag } } : {}),
  };
}

function packageCheck(c) {
  return `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const directories = ${JSON.stringify(packageDirectories(c))};
for (const directory of directories) {
  const cwd = resolve(directory);
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  const archive = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const paths = archive.files.map((file) => file.path);
  const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8'));
  for (const required of ['package.json', 'README.md', 'LICENSE', 'NOTICE']) assert.ok(paths.includes(required), required);
  for (const path of paths) {
    assert.ok(${c.profile === 'skills'
      ? "/^(?:package\\.json|README\\.md|LICENSE|NOTICE|skills-package\\.json|bin\\/(?:skills|managed-skills)\\.mjs|skills\\/[^/]+\\/(?:SKILL\\.md|LICENSE|NOTICE|agents\\/openai\\.yaml))$/.test(path)"
      : "/^(?:package\\.json|README\\.md|LICENSE|NOTICE|dist\\/[A-Za-z0-9_./-]+\\.(?:js|d\\.ts))$/.test(path)"}, 'Unexpected packed file: ' + path);
    assert.ok(!path.split('/').some((part) => part === '..' || part === '.'), 'Unexpected packed traversal');
  }
  ${c.profile === 'typescript' ? `assert.ok(paths.includes('dist/index.js') && paths.includes('dist/index.d.ts'), 'Build JavaScript and declarations before packaging.');
  assert.equal(manifest.exports['.'].types, './dist/index.d.ts');` : `assert.ok(paths.includes('skills-package.json'));`}
  console.log(manifest.name + ': ' + paths.length + ' reviewed package files');
}
`;
}

function releaseCheck(c) {
  return `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const configured = ${JSON.stringify(c.publication === 'configured')};
assert.ok(configured, 'Publication is deferred or unnecessary. Enable it only in an approved configuration change.');
for (const directory of ${JSON.stringify(packageDirectories(c))}) {
  const pkg = JSON.parse(await readFile(directory + '/package.json', 'utf8'));
  assert.equal(pkg.private, false, 'Publishable package must not be private');
  assert.equal(pkg.publishConfig?.access, 'public');
  assert.equal(pkg.publishConfig?.tag, ${JSON.stringify(c.releaseTag)});
  assert.equal(pkg.version, ${JSON.stringify(c.version)}, 'Review version and workflow together');
}
console.log('Local release metadata checks passed. External account protections still require verification.');
`;
}

function packRelease(c) {
  return `import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
const target = resolve('.opensource/release');
await mkdir(resolve('.opensource'), { recursive: true });
const parent = await lstat(resolve('.opensource'));
assert.ok(parent.isDirectory() && !parent.isSymbolicLink(), 'Refusing a symlinked development directory');
await mkdir(target); // Refuse stale archives and preserve previous release evidence.
const checksums = [];
for (const directory of ${JSON.stringify(packageDirectories(c))}) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', target], { cwd: resolve(directory), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  const info = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  assert.match(info.filename, /^[a-z0-9@._+-]+(?:-[a-z0-9@._+-]+)*\\.tgz$/);
  const hash = createHash('sha256').update(await readFile(join(target, info.filename))).digest('hex');
  checksums.push(hash + '  ' + info.filename);
}
await writeFile(join(target, 'SHA256SUMS'), checksums.join('\\n') + '\\n', { flag: 'wx' });
console.log('Packed reviewed release candidates; nothing staged or published.');
`;
}

function typeScriptFiles(c, common) {
  const m = c.packageManager;
  const workspace = c.layout === 'workspace';
  const files = {};
  const children = {};
  const entries = workspace ? c.packages : [{ name: c.name, description: c.description }];
  for (const item of entries) {
    const dir = workspace ? `packages/${item.name.split('/').at(-1)}` : '';
    const prefix = dir ? `${dir}/` : '';
    const pkg = {
      ...publicManifest(c, item.name, item.description, dir),
      types: './dist/index.d.ts',
      exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
      files: ['dist/', 'LICENSE', 'NOTICE'],
      scripts: {
        build: 'tsc -p tsconfig.json',
        typecheck: 'tsc --noEmit -p tsconfig.json',
        test: `${m} run build && node --test`,
      },
      ...(!workspace ? {
        packageManager: m === 'pnpm' ? 'pnpm@10.34.9' : 'npm@12.2.1',
        devDependencies: { typescript: compiler.version },
      } : {}),
    };
    if (workspace) children[dir] = pkg;
    files[`${prefix}package.json`] = json(pkg);
    files[`${prefix}tsconfig.json`] = json({
      ...(workspace ? { extends: '../../tsconfig.base.json' } : tsconfig),
      compilerOptions: { ...(!workspace ? tsconfig.compilerOptions : {}), rootDir: 'src', outDir: 'dist' },
      include: ['src/**/*.ts'],
    });
    files[`${prefix}src/index.ts`] = '// Replace this sample with the product implementation.\nexport function identity<T>(value: T): T {\n  return value;\n}\n';
    files[`${prefix}test/index.test.mjs`] = "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { identity } from '../dist/index.js';\n\ntest('sample preserves identity', () => {\n  const input = { example: true };\n  assert.equal(identity(input), input);\n});\n";
    if (workspace) {
      files[`${prefix}README.md`] = `# ${escape(item.name)}\n\n${escape(item.description)}\n\nUnpublished starter. See the repository release guide. ESM JavaScript and TypeScript declarations are built into dist/.\n`;
      files[`${prefix}LICENSE`] = common.LICENSE;
      files[`${prefix}NOTICE`] = common.NOTICE;
    }
  }
  let root = JSON.parse(files['package.json'] || '{}');
  if (workspace) {
    root = {
      ...publicManifest(c, c.name, c.description), private: true,
      workspaces: ['packages/*'],
      packageManager: m === 'pnpm' ? 'pnpm@10.34.9' : 'npm@12.2.1',
      devDependencies: { typescript: compiler.version },
      scripts: {
        build: m === 'pnpm' ? 'pnpm -r run build' : 'npm run build --workspaces --if-present',
        typecheck: m === 'pnpm' ? 'pnpm -r run typecheck' : 'npm run typecheck --workspaces --if-present',
        test: m === 'pnpm' ? 'pnpm -r run test' : 'npm run test --workspaces --if-present',
      },
    };
    delete root.publishConfig;
    files['tsconfig.base.json'] = json(tsconfig);
    if (m === 'pnpm') files['pnpm-workspace.yaml'] = "packages:\n  - 'packages/*'\n";
    files['docs/PACKAGES.md'] = '# Workspace packages\n\n' +
      c.packages.map((item) => `- \`${item.name}\`: ${escape(item.description)}`).join('\n') +
      '\n\nThe root is private. Each child owns its exports and packed archive. This starter uses one initial version; independent versioning/Changesets is not included.\n';
  }
  root.scripts['package:check'] = 'node scripts/check-package.mjs';
  root.scripts.check = `${m} run typecheck && ${m} test && ${m} run package:check`;
  files['package.json'] = json(root);
  if (m === 'npm') files['package-lock.json'] = npmLock(root, children);
  else files['pnpm-lock.yaml'] = pnpmLock(packageDirectories(c));
  return files;
}

async function skillsFiles(c, common) {
  const installer = c.distribution !== 'repository';
  const root = {
    ...publicManifest(c, c.name, c.description),
    files: ['skills/', 'skills-package.json', 'LICENSE', 'NOTICE', ...(installer ? ['bin/'] : [])],
    ...(installer ? { bin: { [c.cliName]: 'bin/skills.mjs' } } : {}),
    scripts: {
      test: 'node --test',
      'validate:skills': 'node scripts/validate-skills.mjs',
      'package:check': 'node scripts/check-package.mjs',
      check: 'npm run validate:skills && npm test && npm run package:check',
    },
  };
  const files = {
    'package.json': json(root), 'package-lock.json': npmLock(root),
    'skills-package.json': json({ hosts: c.hosts, skills: c.skills.map((skill) => skill.name) }),
  };
  if (installer) {
    files['bin/skills.mjs'] = await readFile(new URL('../assets/skill-installer.mjs', import.meta.url), 'utf8');
    files['bin/managed-skills.mjs'] = await readFile(new URL('../assets/managed-skills.mjs', import.meta.url), 'utf8');
  }
  for (const skill of c.skills) {
    const prefix = `skills/${skill.name}/`;
    files[`${prefix}SKILL.md`] = `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\nlicense: ${JSON.stringify(c.license)}\n---\n\n# ${skill.name}\n\n${escape(skill.description)}\n\nThis is an initial instruction scaffold, not a finished skill. Define the actual\nworkflow, supporting resources, and verification before release. Preserve the\nuser's scope. Do not imply authority for publishing or external account changes.\n`;
    files[`${prefix}LICENSE`] = common.LICENSE;
    files[`${prefix}NOTICE`] = common.NOTICE;
    if (c.hosts.includes('codex')) files[`${prefix}agents/openai.yaml`] = `interface:\n  display_name: ${JSON.stringify(skill.name)}\n  short_description: ${JSON.stringify(skill.description.length >= 25 ? skill.description.slice(0, 64) : 'Project-specific agent skill workflow')}\n  default_prompt: ${JSON.stringify(`Use $${skill.name} to carry out the requested task.`)}\n`;
  }
  files['scripts/validate-skills.mjs'] = `import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const metadata = JSON.parse(await readFile('skills-package.json', 'utf8'));
for (const name of metadata.skills) {
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const content = await readFile('skills/' + name + '/SKILL.md', 'utf8');
  assert.ok(content.startsWith('---\\n'));
  const header = content.split('---\\n')[1];
  const field = (key) => {
    const raw = header.split('\\n').find((line) => line.startsWith(key + ': '))?.slice(key.length + 2);
    assert.ok(raw, 'Missing ' + key);
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  };
  assert.equal(field('name'), name);
  assert.ok(field('description').trim());
  await readFile('skills/' + name + '/LICENSE', 'utf8');
  await readFile('skills/' + name + '/NOTICE', 'utf8');
}
console.log('Generated skill metadata and license files verified. Live host behavior still needs evaluation.');
`;
  files['test/skills.test.mjs'] = `import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const metadata = JSON.parse(await readFile('skills-package.json', 'utf8'));
${installer ? `for (const host of metadata.hosts) {
  test(host + ': install, dry run, and collision preservation', async () => {
    const project = await mkdtemp(join(tmpdir(), 'skill-starter-'));
    const run = (extra = []) => spawnSync(process.execPath,
      ['bin/skills.mjs', 'install', '--host', host, '--project', project, ...extra], { encoding: 'utf8' });
    assert.equal(run(['--dry-run']).status, 0);
    const installed = run();
    assert.equal(installed.status, 0, installed.stderr);
    for (const name of metadata.skills) await access(join(project, host === 'codex' ? '.agents' : '.claude', 'skills', name, 'SKILL.md'));
    assert.notEqual(run().status, 0);
  });
}` : `test('repository skills are self-contained', async () => {
  for (const name of metadata.skills) {
    await access('skills/' + name + '/SKILL.md');
    await access('skills/' + name + '/LICENSE');
  }
});`}
`;
  files['docs/HOSTS.md'] = `# Supported coding hosts\n\n${c.hosts.map((host) => `- ${host}`).join('\n')}\n\nCoding hosts are not model providers. This package does not change Bedrock,\nAPI keys, hooks, model settings, or global configuration. Skill instructions\nstill need real task evaluation in each selected host before release.\n\n${installer ? `Use node bin/skills.mjs install --host <selected-host> --project <existing-project>.\nUse --dry-run to preview. Existing skills and symlinked destination ancestors are\npreserved/refused. This starter has no upgrade/removal automation or ownership receipts.\n` : 'Repository-only distribution includes no npm installer. Copy reviewed skill directories to the selected host location yourself.'}
`;
  return files;
}

export async function profileFiles(c, common) {
  if (c.profile === 'none') return {};
  const files = c.profile === 'typescript' ? typeScriptFiles(c, common) : await skillsFiles(c, common);
  files['scripts/check-package.mjs'] = packageCheck(c);
  if (c.publication !== 'none') {
    files['scripts/check-release.mjs'] = releaseCheck(c);
    files['scripts/pack-release.mjs'] = packRelease(c);
  }
  return files;
}

export function localCommands(c) {
  if (c.profile === 'none') return 'git diff --check';
  const m = c.packageManager;
  const install = m === 'pnpm' ? 'pnpm install --frozen-lockfile --ignore-scripts' : 'npm ci --ignore-scripts';
  return `${install}\n${m} run check${c.profile === 'skills' && c.distribution !== 'repository' ? '\nnode bin/skills.mjs --help' : ''}`;
}

export function workflows(c) {
  const checkout = 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1';
  const setup = 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1';
  const setupSteps = `      - uses: ${checkout}\n      - uses: ${setup}\n        with:\n          node-version: '${c.nodeVersion}'\n          package-manager-cache: false\n` +
    (c.packageManager === 'pnpm' ? '      - run: npm install --global pnpm@10.34.9 --ignore-scripts\n' : '');
  const checkSteps = localCommands(c).split('\n').filter((line) => !line.endsWith('--help'))
    .map((line) => `      - run: ${line}\n`).join('');
  const files = {};
  if (c.ci) files['.github/workflows/ci.yml'] = `name: CI\non:\n  push:\n    branches: [${c.defaultBranch}]\n  pull_request:\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n${c.profile === 'none' ? `      - uses: ${checkout}\n      - run: git diff --check\n` : setupSteps + checkSteps}`;
  if (c.publication !== 'none' && c.releaseMode === 'github-staged') {
    files['.github/workflows/npm-stage.yml'] = `name: Stage npm release
on:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: npm-stage
  cancel-in-progress: false
jobs:
  verify:
    if: github.ref == 'refs/heads/${c.defaultBranch}' && vars.NPM_STAGING_ENABLED == 'true'${c.publication === 'deferred' ? ' && false' : ''}
    runs-on: ubuntu-latest
    steps:
${setupSteps}${checkSteps}      - run: node scripts/check-release.mjs
      - run: node scripts/pack-release.mjs
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9
        with:
          name: reviewed-npm-archives
          path: |
            .opensource/release/*.tgz
            .opensource/release/SHA256SUMS
          if-no-files-found: error
  stage:
    needs: verify
    environment: npm
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: ${checkout}
      - uses: ${setup}
        with:
          node-version: '${c.nodeVersion}'
          registry-url: 'https://registry.npmjs.org'
          package-manager-cache: false
      - run: npm install --global npm@12.2.1 --ignore-scripts
      - uses: actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333
        with:
          name: reviewed-npm-archives
          path: .opensource/release
      - run: sha256sum --check SHA256SUMS
        working-directory: .opensource/release
      - name: Stage reviewed archives; never approve them here
        run: |
          for archive in .opensource/release/*.tgz; do
            npm stage publish "$archive" --access public --tag ${c.releaseTag} --ignore-scripts --workspaces=false
          done
`;
  }
  return files;
}
