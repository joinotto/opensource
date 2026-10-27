import { lstat, mkdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { render } from './templates.mjs';
import { questions, fallbackFor, inactiveFor } from './questions.mjs';
import { directory, writeTree } from '../assets/managed-skills.mjs';

const required = ['name', 'description', 'owner', 'repo', 'profile', 'license', 'copyright'];
const fields = questions.map((question) => question.key);
const component = '[a-z0-9][a-z0-9._-]*';
const npmName = new RegExp(`^(?:@${component}/)?${component}$`);

function text(value, key, max = 240) {
  if (typeof value !== 'string' || !value.trim() || value.length > max ||
      /[\p{C}\u2028\u2029]/u.test(value)) {
    throw new Error(`${key} must be nonempty, single-line text of at most ${max} characters.`);
  }
  return value.trim();
}

export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Configuration must be a JSON object.');
  }
  for (const key of Object.keys(input)) {
    if (!fields.includes(key)) throw new Error(`Unknown configuration field: ${key}`);
  }
  const c = Object.fromEntries(required.map((key) => [key, text(input[key], key)]));
  for (const question of questions) {
    if (!required.includes(question.key)) {
      c[question.key] = Object.hasOwn(input, question.key)
        ? input[question.key]
        : question.when && !question.when({ ...input, ...c }) && Object.hasOwn(question, 'inactive')
          ? inactiveFor(question, { ...input, ...c }) : fallbackFor(question, { ...input, ...c });
    }
  }
  if (c.profile !== 'none' && (!npmName.test(c.name) || c.name.length > 214 ||
      ['node_modules', 'favicon.ico'].includes(c.name.split('/').at(-1)))) {
    throw new Error('Use a lowercase npm package name, optionally scoped.');
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(c.owner) ||
      c.owner.includes('--')) throw new Error('Use a valid GitHub owner.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(c.repo) ||
      c.repo.endsWith('.git')) throw new Error('Use a repository name without paths or a .git suffix.');
  if (!['skills', 'typescript', 'none'].includes(c.profile)) throw new Error('Profile must be skills, typescript, or none.');
  if (!['Apache-2.0', 'MIT'].includes(c.license)) throw new Error('License must be Apache-2.0 or MIT.');
  for (const key of ['layout', 'packageManager', 'distribution', 'publication', 'conventions', 'displayName', 'cliName', 'copyrightYear', 'defaultBranch', 'nodeVersion', 'version', 'releaseMode', 'releaseTag']) {
    c[key] = text(c[key], key);
  }
  for (const key of ['author', 'securityContact']) {
    if (c[key] !== '') c[key] = text(c[key], key);
  }
  if (c.displayName.length > 64) throw new Error('Display name must be at most 64 characters.');
  if (c.profile === 'skills' && c.distribution !== 'repository' &&
      !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(c.cliName)) throw new Error('Use a lowercase installer command name without paths.');
  if (!['single', 'workspace'].includes(c.layout)) throw new Error('TypeScript layout must be single or workspace.');
  if (!['npm', 'pnpm', 'none'].includes(c.packageManager) || (c.profile !== 'none' && c.packageManager === 'none')) throw new Error('Package manager must be npm or pnpm for package profiles.');
  if (!['npm', 'repository', 'both'].includes(c.distribution)) throw new Error('Invalid distribution choice.');
  if (!['deferred', 'configured', 'none'].includes(c.publication)) throw new Error('Invalid publication choice.');
  if (!['defaults', 'customize'].includes(c.conventions)) throw new Error('Conventions must be defaults or customize.');
  if (c.profile === 'skills' && (c.layout !== 'single' || c.packageManager !== 'npm')) {
    throw new Error('Skills use the npm installer; TypeScript workspace settings do not apply.');
  }
  if (c.profile === 'typescript' && c.distribution !== 'npm') throw new Error('TypeScript distribution is npm; publication can be deferred or none.');
  if (c.profile === 'none' && (c.publication !== 'none' || c.packageManager !== 'none' || c.layout !== 'single')) {
    throw new Error('Common-only projects do not configure npm publication, package managers, or workspaces.');
  }
  if (c.distribution === 'repository' && c.publication !== 'none') throw new Error('Repository-only skills require publication: none.');
  if (!/^\d{4}$/.test(c.copyrightYear)) throw new Error('Copyright year must contain four digits.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(c.defaultBranch)) throw new Error('Use a simple default branch name without paths.');
  if (!/^(22|24)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(c.nodeVersion) ||
      (c.nodeVersion.startsWith('22.') && Number(c.nodeVersion.split('.')[1]) < 14)) {
    throw new Error('Node version must be an exact 22.14+ or 24.x version; verify its availability separately.');
  }
  const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  const match = semver.exec(c.version);
  if (!match || match[4]?.split('.').some((part) => /^0\d+$/.test(part))) throw new Error('Use a valid semantic version.');
  for (const key of ['ci', 'dependabot', 'dco', 'readmeHeader']) {
    if (typeof c[key] !== 'boolean') throw new Error(`${key} must be a boolean.`);
  }
  if (c.profile === 'none' && c.dependabot && !c.ci) throw new Error('Common-only dependency updates require a selected CI workflow.');
  if (!['none', 'manual', 'github-staged'].includes(c.releaseMode)) throw new Error('Invalid release mode.');
  if ((c.publication === 'none') !== (c.releaseMode === 'none')) {
    throw new Error('Publication none requires release mode none; other choices require manual or github-staged.');
  }
  if (!['next', 'latest'].includes(c.releaseTag)) throw new Error('Release tag must be next or latest.');
  if (c.releaseMode !== 'none' && ((match[4] && c.releaseTag !== 'next') || (!match[4] && c.releaseTag !== 'latest'))) {
    throw new Error('Preview versions use next; stable versions use latest.');
  }
  if (c.releaseMode === 'github-staged' && !c.ci) throw new Error('GitHub-staged release requires CI.');
  if (!Array.isArray(c.hosts) || c.hosts.some((host) => !['codex', 'claude-code'].includes(host)) ||
      new Set(c.hosts).size !== c.hosts.length || (c.profile === 'skills' && !c.hosts.length) ||
      (c.profile !== 'skills' && c.hosts.length)) throw new Error('Skills require unique supported coding hosts; other profiles do not use skill hosts.');
  const records = (value, key, min) => {
    if (!Array.isArray(value) || value.length < min || value.length > 20) {
      throw new Error(`${key} requires ${min} to 20 name/description records.`);
    }
    const names = new Set();
    const folders = new Set();
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          Object.keys(item).some((field) => !['name', 'description'].includes(field))) {
        throw new Error(`${key} records contain only name and description.`);
      }
      const name = text(item.name, `${key} name`);
      const folder = name.split('/').at(-1);
      if (key === 'skills' ? !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64
        : !npmName.test(name) || name.length > 214 || ['node_modules', 'favicon.ico'].includes(folder)) {
        throw new Error(`Invalid ${key} name: ${name}`);
      }
      if (names.has(name) || folders.has(folder)) throw new Error(`Duplicate ${key} name or folder: ${name}`);
      if (key === 'packages' && name === c.name) throw new Error('Workspace root and child package names must differ.');
      names.add(name);
      folders.add(folder);
      return { name, description: text(item.description, `${key} description`) };
    });
  };
  c.skills = records(c.skills, 'skills', c.profile === 'skills' ? 1 : 0);
  if (c.hosts.includes('claude-code') && c.skills.some((skill) => ['synced', 'anthropic-skills'].includes(skill.name))) {
    throw new Error('Claude Code reserves the synced and anthropic-skills skill names.');
  }
  c.packages = records(c.packages, 'packages', c.profile === 'typescript' && c.layout === 'workspace' ? 2 : 0);
  if (c.profile !== 'skills' && c.skills.length) throw new Error('Skill records apply only to skills packages.');
  if ((c.profile !== 'typescript' || c.layout !== 'workspace') && c.packages.length) {
    throw new Error('Package records apply only to TypeScript workspaces.');
  }
  if (!Array.isArray(c.agents) || c.agents.some((host) => !['codex', 'claude-code'].includes(host)) ||
      new Set(c.agents).size !== c.agents.length) throw new Error('Agents must be a unique list of codex and/or claude-code.');
  if (!Array.isArray(c.keywords) || c.keywords.length > 12) throw new Error('Use at most 12 keyword strings.');
  c.keywords = c.keywords.map((value) => text(value, 'keyword', 32));
  if (c.securityContact && !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(c.securityContact)) {
    throw new Error('Security contact must be a public email address or empty.');
  }
  return c;
}

export async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function scaffold(destination, config, { dryRun = false } = {}) {
  const c = validateConfig(config);
  const requested = resolve(destination);
  if (await exists(requested)) throw new Error(`Target already exists: ${requested}`);
  const parent = await directory(dirname(requested));
  const target = requested;
  try {
  const files = await render(c);
  const plan = {
    target, config: c, files: Object.keys(files).sort(), dryRun,
    nextSteps: [c.profile === 'none' ? 'Choose implementation and product checks when needed; no package tooling was added.'
      : `Install reviewed dependencies using ${c.packageManager}, then run ${c.packageManager} run check.`,
      'Publishing and account setup are separate approved actions.'],
  };
  if (dryRun) return plan;
  const anchored = join(parent.path, basename(requested));
  await parent.verify();
  await mkdir(anchored); // Atomic collision check; never recursively merge into user work.
  const output = await directory(anchored, { parent });
  try {
    await writeTree(output, files);
  } catch (error) {
    throw new Error(`Generation stopped; partial files remain at ${target}. ${error.message}`);
  } finally { await output.close(); }
  return plan;
  } finally { await parent.close(); }
}

export async function readConfig(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > 16_384) throw new Error('Config must be a regular file of at most 16 KiB.');
    const data = await handle.readFile('utf8');
    if (Buffer.byteLength(data) > 16_384) throw new Error('Config exceeds 16 KiB.');
    return JSON.parse(data);
  } finally { await handle.close(); }
}
