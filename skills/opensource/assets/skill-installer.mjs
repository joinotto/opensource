#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manageSkills } from './managed-skills.mjs';

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const metadata = JSON.parse(await readFile(join(root, 'skills-package.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (!Array.isArray(metadata.hosts) || !metadata.hosts.length ||
      metadata.hosts.some((host) => !['codex', 'claude-code'].includes(host)) ||
      new Set(metadata.hosts).size !== metadata.hosts.length) throw new Error('Invalid coding host metadata.');
  const { values, positionals } = parseArgs({
    allowPositionals: true, strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      host: { type: 'string' }, project: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (values.help || !positionals.length) {
    console.log(`Usage: install|upgrade|uninstall|restore --host ${metadata.hosts.join('|')} --project <directory> [--dry-run]\nManaged operations preserve local edits and backups. macOS/Linux; Node.js 22.14+.`);
    return;
  }
  if (positionals.length !== 1 || !values.project ||
      !metadata.hosts.includes(values.host)) throw new Error('Use install with a supported --host and an existing --project.');
  const result = await manageSkills({
    project: values.project, host: values.host, names: metadata.skills,
    source: (name) => join(root, 'skills', name), operation: positionals[0],
    dryRun: values['dry-run'], version: pkg.version, packageName: pkg.name,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
