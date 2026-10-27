import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkBranch, checkEnvironment, checkPublisher, parseTrustOutput } from '../scripts/release-policy.mjs';

test('publisher checks reject direct-publish permissions and unrelated identities', () => {
  const publisher = { type: 'github', repository: 'joinotto/opensource', file: 'npm-stage.yml',
    environment: 'npm', permissions: ['createStagedPackage'] };
  checkPublisher([publisher]);
  for (const change of [{ permissions: ['createPackage'] }, { repository: 'other/repo' }, { environment: 'other' }]) {
    assert.throws(() => checkPublisher([{ ...publisher, ...change }]));
  }
  assert.throws(() => checkPublisher([publisher, { ...publisher, permissions: ['createPackage'] }]));
  const output = JSON.stringify(publisher, null, 2) + '\n\n' + JSON.stringify(publisher);
  assert.equal(parseTrustOutput(output).length, 2);
  for (const invalid of ['', 'not json', '{"bad":', '{} trailing']) assert.throws(() => parseTrustOutput(invalid));
});

test('account policy requires actual reviewers, all CI platforms, and protected deployment', () => {
  const contexts = ['ubuntu-latest', 'macos-latest'].flatMap((os) => ['22.23.3', '24.22.1'].map((node) => `test (${os}, ${node})`));
  const branch = { enforce_admins: { enabled: true }, required_status_checks: { strict: true, contexts },
    required_pull_request_reviews: { required_approving_review_count: 1, dismiss_stale_reviews: true } };
  checkBranch(branch);
  assert.throws(() => checkBranch({ ...branch, enforce_admins: { enabled: false } }));
  assert.throws(() => checkBranch({ ...branch, required_status_checks: { strict: true, contexts: [] } }));
  assert.throws(() => checkBranch({ ...branch, required_pull_request_reviews: { required_approving_review_count: 0 } }));
  checkEnvironment({ protection_rules: [{ type: 'required_reviewers', reviewers: [{}] }],
    deployment_branch_policy: { protected_branches: true } });
  assert.throws(() => checkEnvironment({ protection_rules: [] }));
});

test('release workflow separates testing from stage permissions and never approves stages', async () => {
  const workflow = await readFile(new URL('../.github/workflows/npm-stage.yml', import.meta.url), 'utf8');
  const stage = workflow.split('  stage:\n')[1];
  assert.ok(stage.includes('id-token: write') && stage.includes('environment: npm'));
  assert.ok(stage.includes('sha256sum --check'));
  assert.ok(!/npm (?:run|ci|test)|stage approve|npm publish/.test(stage));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('cancel-in-progress: false'));
  assert.ok(workflow.includes('NPM_STAGING_ENABLED'));
});
