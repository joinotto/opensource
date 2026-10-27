import { constants } from 'node:fs';
import { open, lstat, mkdir, readdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const slug = (name) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64;
const hosts = { codex: '.agents', 'claude-code': '.claude' };

export async function present(path) {
  try { await lstat(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

// Open handles establish identity; repeated checks detect replacement. Node does
// not expose portable openat/renameat. An actively hostile same-user process is
// outside this CLI's security boundary; run in a trusted local filesystem.
export async function directory(path, { create = false, parent } = {}) {
  if (process.platform === 'win32') throw new Error('Filesystem writes currently support macOS and Linux only.');
  if (parent) await parent.verify();
  if (create) {
    try { await mkdir(path); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  let handle;
  try { handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); }
  catch (error) { throw new Error(`Refusing inaccessible directory, non-directory, or symlink: ${path}. ${error.message}`); }
  if (!(await handle.stat()).isDirectory()) {
    await handle.close();
    throw new Error(`Refusing non-directory or symlink: ${path}`);
  }
  const identity = await handle.stat();
  async function verify() {
    if (parent) await parent.verify();
    const current = await lstat(path);
    if (!current.isDirectory() || current.isSymbolicLink() ||
        current.dev !== identity.dev || current.ino !== identity.ino) {
      throw new Error(`Directory changed or symlink introduced: ${path}`);
    }
  }
  try { await verify(); } catch (error) { await handle.close(); throw error; }
  return { handle, path, verify, close: () => handle.close() };
}

async function writeNew(path, data, mode = 0o644) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
}

export async function writeTree(root, files) {
  for (const [relative, content] of Object.entries(files)) {
    await root.verify();
    const parts = relative.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
      throw new Error(`Unsafe payload path: ${relative}`);
    }
    let current = root;
    const opened = [];
    try {
      for (const part of parts.slice(0, -1)) {
        current = await directory(join(current.path, part), { create: true, parent: current });
        opened.push(current);
      }
      await current.verify();
      await writeNew(join(current.path, parts.at(-1)), content,
        relative.startsWith('bin/') ? 0o755 : 0o644);
    } finally { for (const item of opened.reverse()) await item.close(); }
  }
}

export async function snapshot(path, { omitAgents = false } = {}) {
  const files = Object.create(null);
  let size = 0;
  async function walk(parent, prefix = '') {
    await parent.verify();
    for (const name of (await readdir(parent.path)).sort()) {
      if (omitAgents && !prefix && name === 'agents') continue;
      const relative = prefix + name;
      if (name === '.opensource-install.json') throw new Error('Reserved receipt name in payload.');
      const full = join(parent.path, name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error(`Refusing payload symlink: ${relative}`);
      if (info.isDirectory()) {
        const child = await directory(full, { parent });
        try { await walk(child, relative + '/'); } finally { await child.close(); }
      } else if (info.isFile()) {
        if (info.size > 4 * 1024 * 1024 || Object.keys(files).length >= 512) throw new Error('Skill payload limit exceeded.');
        const file = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const actual = await file.stat();
          if (!actual.isFile() || actual.nlink > 1 || actual.size > 4 * 1024 * 1024) {
            throw new Error(`Refusing special, hard-linked, or oversized payload file: ${relative}`);
          }
          const data = await file.readFile();
          size += data.length;
          if (size > 16 * 1024 * 1024) throw new Error('Skill payload limit exceeded.');
          files[relative] = data;
        } finally { await file.close(); }
      } else throw new Error(`Refusing special payload file: ${relative}`);
    }
  }
  const root = await directory(path);
  try { await walk(root); } finally { await root.close(); }
  return files;
}

const inventory = (files) => Object.fromEntries(Object.entries(files).map(([name, data]) => [name, hash(data)]));
function same(a, b) {
  return JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
}

async function receipt(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 128 * 1024) throw new Error('Invalid installation receipt.');
    const value = JSON.parse(await handle.readFile('utf8'));
    if (value.schema !== 1 || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) {
      throw new Error('Invalid installation receipt.');
    }
    return value;
  } finally { await handle.close(); }
}

export async function manageSkills({ project, host, names, source, operation = 'install', dryRun = false, version, packageName }) {
  if (!Object.hasOwn(hosts, host)) throw new Error('Host must be codex or claude-code.');
  if (!['install', 'upgrade', 'uninstall', 'restore'].includes(operation)) throw new Error('Unsupported skill operation.');
  if (!Array.isArray(names) || !names.length || names.some((name) => !slug(name)) || new Set(names).size !== names.length) {
    throw new Error('Invalid skill names.');
  }
  const root = await directory(resolve(project));
  const held = [root];
  let state;
  let locked = false;
  const result = { targets: names.map((name) => join(resolve(project), hosts[host], 'skills', name)), operation, dryRun };
  try {
    async function child(parent, name) {
      const path = join(parent.path, name);
      if (dryRun && !(await present(path))) return null;
      const value = await directory(path, { create: !dryRun, parent });
      held.push(value);
      return value;
    }
    const base = await child(root, hosts[host]);
    const parent = base && await child(base, 'skills');
    const privateRoot = await child(root, '.opensource');
    const records = privateRoot && await child(privateRoot, 'skills');
    state = records && await child(records, host);
    if (state && !dryRun) {
      try { await mkdir(join(state.path, '.lock')); locked = true; } catch (error) {
        if (error.code === 'EEXIST') throw new Error('Another skill operation or interrupted transaction holds the lock. Inspect .opensource/skills before recovery.');
        throw error;
      }
    }
    const plans = [];
    for (const name of names) {
      const target = parent && join(parent.path, name);
      const record = state && join(state.path, `${name}.json`);
      const installed = target && await present(target);
      const previous = record && await present(record) ? await receipt(record) : null;
      if (operation === 'install' && installed) throw new Error(`Skill already exists; preserving it: ${name}`);
      if (operation !== 'install' && (!previous || previous.package !== packageName || previous.name !== name || previous.host !== host)) {
        throw new Error(`No matching managed-install receipt for ${name}; preserving user work.`);
      }
      if (operation === 'restore') {
        if (installed || previous.status !== 'removed' || !/^[a-f0-9-]{36}$/.test(previous.backup || '')) {
          throw new Error(`Restore requires a removed skill with a saved backup: ${name}`);
        }
      } else if (operation !== 'install') {
        if (!installed || previous.status !== 'installed') throw new Error(`Managed skill is not installed: ${name}`);
        const actual = inventory(await snapshot(target));
        if (!same(actual, previous.files)) throw new Error(`Local edits detected; preserving ${name}. Back up or reconcile edits before retrying.`);
      } else if (previous) throw new Error(`Existing receipt requires explicit recovery for ${name}.`);
      const files = ['install', 'upgrade'].includes(operation)
        ? await snapshot(source(name), { omitAgents: host === 'claude-code' }) : null;
      if (files && !Object.hasOwn(files, 'SKILL.md')) throw new Error(`Missing SKILL.md: ${name}`);
      if (operation === 'restore') {
        const backup = join(state.path, previous.backup, 'payload');
        if (!same(inventory(await snapshot(backup)), previous.files)) throw new Error(`Backup changed; preserving ${name}.`);
      }
      plans.push({ name, target, record, previous, files });
    }
    if (dryRun) return result;
    // Lock and preflight cover cooperative concurrency. Recheck directory
    // identity before writes; hostile same-user mutation remains out of scope.
    for (const plan of plans) {
      const { name, target, record, previous, files } = plan;
      const id = randomUUID();
      await parent.verify();
      await state.verify();
      const transaction = await directory(join(state.path, id), { create: true, parent: state });
      held.push(transaction);
      const next = {
        schema: 1, package: packageName, version: version ?? previous?.version, name, host,
        status: operation === 'uninstall' ? 'removed' : 'installed',
        files: files ? inventory(files) : previous.files,
        backup: operation === 'restore' ? null : id,
      };
      await writeNew(join(transaction.path, 'journal.json'), JSON.stringify({ operation, previous, next }, null, 2));
      if (files || operation === 'restore') {
        const stage = await directory(join(transaction.path, 'new'), { create: true, parent: transaction });
        try {
          await writeTree(stage, files || await snapshot(join(state.path, previous.backup, 'payload')));
        } finally { await stage.close(); }
      }
      if (operation === 'upgrade' || operation === 'uninstall') {
        // Verify again immediately before moving. Never delete an old payload.
        if (!same(inventory(await snapshot(target)), previous.files)) throw new Error(`Local edits detected; preserving ${name}.`);
        await parent.verify();
        await transaction.verify();
        await rename(target, join(transaction.path, 'payload'));
      }
      if (operation === 'restore' || files) {
        await parent.verify();
        await mkdir(target);
        const reserved = await directory(target, { parent });
        try {
          await reserved.verify();
          await transaction.verify();
          // Replace only our exclusive empty reservation with the fully written
          // payload. An occupied destination fails, preserving both sides.
          await rename(join(transaction.path, 'new'), target);
        } finally { await reserved.close(); }
      }
      const pending = join(transaction.path, 'receipt.json');
      await writeNew(pending, JSON.stringify(next, null, 2) + '\n');
      await transaction.verify();
      await state.verify();
      await rename(pending, record);
    }
    return result;
  } catch (error) {
    throw new Error(`Skill operation stopped. Existing files/backups are retained; inspect .opensource/skills/${host} for recovery. ${error.message}`);
  } finally {
    try {
      if (locked) {
        // A failed transaction retains its journal and payload backups.
        // Only remove the empty cooperative lock; never remove project content.
        await state.verify();
        const lock = await directory(join(state.path, '.lock'), { parent: state });
        await lock.close();
        const { rmdir } = await import('node:fs/promises');
        await rmdir(join(state.path, '.lock'));
      }
    } finally { for (const item of held.reverse()) await item.close(); }
  }
}
