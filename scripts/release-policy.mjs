import assert from 'node:assert/strict';

export function parseTrustOutput(text) {
  const values = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') { if (depth++ === 0) start = index; }
    else if (char === '}') {
      if (--depth < 0) throw new Error('Invalid npm trust output.');
      if (!depth) values.push(JSON.parse(text.slice(start, index + 1)));
    } else if (!depth && char.trim()) throw new Error('Unexpected npm trust output.');
  }
  if (depth || quoted || !values.length) throw new Error('No verified npm trust configuration.');
  return values;
}

export function checkPublisher(publishers) {
  assert.ok(publishers.length, 'No publisher configured.');
  for (const publisher of publishers) {
    assert.ok(Array.isArray(publisher.permissions), 'Publisher permissions are unknown.');
    assert.deepEqual(publisher.permissions, ['createStagedPackage'], 'Every publisher must be stage-only.');
  }
  assert.ok(publishers.some((item) => item.type === 'github' &&
    item.repository === 'joinotto/opensource' && item.file === 'npm-stage.yml' &&
    item.environment === 'npm'), 'No matching repository/workflow/environment publisher.');
}

export function checkBranch(branch) {
  assert.equal(branch.enforce_admins?.enabled, true, 'Admin bypass is not allowed.');
  assert.equal(branch.required_status_checks?.strict, true, 'Checks must be current.');
  const contexts = branch.required_status_checks?.contexts || [];
  for (const os of ['ubuntu-latest', 'macos-latest']) {
    for (const node of ['22.23.3', '24.22.1']) assert.ok(contexts.includes(`test (${os}, ${node})`), `Missing required CI: ${os}/${node}`);
  }
  assert.ok(branch.required_pull_request_reviews?.required_approving_review_count >= 1, 'Require a real approving review.');
  assert.equal(branch.required_pull_request_reviews?.dismiss_stale_reviews, true, 'Dismiss stale approvals.');
  assert.notEqual(branch.allow_force_pushes?.enabled, true);
  assert.notEqual(branch.allow_deletions?.enabled, true);
}

export function checkEnvironment(env) {
  assert.ok(env.protection_rules?.some((rule) => rule.type === 'required_reviewers' && rule.reviewers?.length),
    'Require an environment reviewer.');
  assert.equal(env.deployment_branch_policy?.protected_branches, true, 'Only protected branches may stage.');
}
