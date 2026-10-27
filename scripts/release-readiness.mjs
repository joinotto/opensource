import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkPackage } from './check-package.mjs';
import { checkBranch, checkEnvironment, checkPublisher, parseTrustOutput } from './release-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const blockers = [];
function json(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(
    /404|Could not resolve to a Repository/.test(result.stderr || '')
      ? 'Resource is not configured or is inaccessible (404).'
      : `${command} read-only check failed (${result.status}); verify account access in your own terminal.`);
  return JSON.parse(result.stdout);
}
function gate(name, fn) {
  try { fn(); console.log(`PASS ${name}`); } catch (error) { blockers.push(`${name}: ${error.message}`); }
}
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await checkPackage(root);
gate('public repository', () => {
  const repo = json('gh', ['api', 'repos/joinotto/opensource']);
  if (repo.private || repo.archived || repo.default_branch !== 'main') throw new Error('Expected active public main repository.');
});
gate('private reporting', () => {
  if (!json('gh', ['api', 'repos/joinotto/opensource/private-vulnerability-reporting']).enabled) {
    throw new Error('GitHub private vulnerability reporting is disabled.');
  }
});
gate('main protection', () => {
  const branch = json('gh', ['api', 'repos/joinotto/opensource/branches/main/protection']);
  checkBranch(branch);
});
gate('npm environment', () => {
  const env = json('gh', ['api', 'repos/joinotto/opensource/environments/npm']);
  checkEnvironment(env);
});
gate('npm stage-only publisher', () => {
  const command = process.env.npm_execpath ? process.execPath : 'npm';
  const prefix = process.env.npm_execpath ? [process.env.npm_execpath] : [];
  const result = spawnSync(command,
    [...prefix, 'trust', 'list', '@ottoai/opensource', '--json', '--registry=https://registry.npmjs.org/', '--browser=false'],
    { cwd: root, encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error('Could not read package-specific publisher settings. Stop; do not retry authentication automatically.');
  checkPublisher(parseTrustOutput(result.stdout));
});
gate('repository permission', () => {
  const state = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  if (state.status !== 0 || state.stdout.trim()) throw new Error('Commit reviewed files and use a clean checkout.');
  const remotes = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
  if (remotes.status !== 0 || !/github\.com[:/]joinotto\/opensource(?:\.git)?\s*$/.test(remotes.stdout)) {
    throw new Error('No matching origin repository.');
  }
});
gate('human and host evidence', () => {
  const evidence = json(process.execPath, ['-e',
    "process.stdout.write(require('node:fs').readFileSync('.opensource/release-evidence.json','utf8'))"]);
  for (const name of ['codex', 'claude-code']) {
    if (evidence.hosts?.[name]?.status !== 'passed' || !evidence.hosts[name].version) throw new Error(`No verified ${name} behavior evidence.`);
  }
  if (!evidence.maintainerReview?.identity || !evidence.maintainerReview?.reference) throw new Error('Record an actual maintainer review reference.');
  if (!evidence.copyrightConfirmed || !evidence.securityRouteConfirmed) throw new Error('Confirm public ownership and monitored reporting.');
  if (!evidence.npmTrustedPublisher?.reference || evidence.npmTrustedPublisher.stageOnly !== true) {
    throw new Error('Record verified package-specific stage-only publisher settings; never fabricate evidence.');
  }
});
gate('publication guard', () => {
  if (pkg.private !== false) throw new Error('Manifest stays private until all readiness gates are satisfied.');
});
if (blockers.length) {
  console.error(`Release blocked:\n${blockers.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('Readiness checks passed. Staging and approval still require separate authority.');
