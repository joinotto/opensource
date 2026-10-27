#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readConfig, scaffold } from './scaffold.mjs';
import { gatherConfig } from './questions.mjs';
import { manageSkills } from '../assets/managed-skills.mjs';

const help = `OpenSource
  opensource init <new-directory> [--config config.json] [--dry-run]
  opensource install --host codex|claude-code --project <directory> [--dry-run]
  opensource upgrade|uninstall|restore --host codex|claude-code --project <directory> [--dry-run]
  opensource --help
  opensource --version

Init prompts for missing choices in an interactive terminal.
Noninteractive use requires --config. No GitHub/npm commands run automatically.
Install refuses an existing skill. Managed operations preserve local edits and backups.
Requires Node.js 22.14 or later on macOS or Linux.
`;

async function interactiveInit(destination, provided, dryRun) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error('Noninteractive init requires --config.');
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log('Choose all supported project settings. Author/contact fields are public. Never enter credentials.');
    console.log('Profiles: agent skills, TypeScript ESM (single/workspace), or common structure only.');
    console.log('Shared defaults can be accepted as a group. Publication defaults to deferred.');
    const config = await gatherConfig((message) => prompt.question(message), provided);
    const plan = await scaffold(destination, config, { dryRun: true });
    console.log(JSON.stringify(plan, null, 2));
    if (dryRun) return plan;
    if (!/^(y|yes)$/i.test((await prompt.question('Create these local files? [y/N]: ')).trim())) {
      return { target: plan.target, cancelled: true };
    }
    return scaffold(destination, config);
  } finally {
    prompt.close();
  }
}

export async function install(host, project, { dryRun = false, operation = 'install' } = {}) {
  if (!project) throw new Error('Install requires --project.');
  const source = fileURLToPath(new URL('../', import.meta.url));
  const result = await manageSkills({
    host, project, operation, dryRun, names: ['opensource'], source: () => source,
    packageName: '@ottoai/opensource', version: '0.1.0',
  });
  return { ...result, target: result.targets[0] };
}

export async function main(args = process.argv.slice(2)) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 14)) throw new Error('Use Node.js 22.14 or later.');
  const { values, positionals } = parseArgs({
    args, allowPositionals: true, strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      config: { type: 'string' },
      host: { type: 'string' },
      project: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  if (values.version) {
    console.log('0.1.0');
    return;
  }
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const dryRun = values['dry-run'];
  let result;
  if (positionals[0] === 'init' && positionals.length === 2) {
    if (values.host || values.project) throw new Error('Init does not accept --host or --project.');
    const config = values.config ? await readConfig(values.config) : {};
    result = stdin.isTTY && stdout.isTTY
      ? await interactiveInit(positionals[1], config, dryRun)
      : values.config
        ? await scaffold(positionals[1], config, { dryRun })
        : (() => { throw new Error('Noninteractive init requires --config.'); })();
  } else if (['install', 'upgrade', 'uninstall', 'restore'].includes(positionals[0]) && positionals.length === 1) {
    if (values.config) throw new Error('Skill operations do not accept --config.');
    result = await install(values.host, values.project, { dryRun, operation: positionals[0] });
  } else {
    throw new Error('Unknown command or invalid arguments. Use --help.');
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`OpenSource: ${error.message}`);
    process.exitCode = 1;
  });
}
