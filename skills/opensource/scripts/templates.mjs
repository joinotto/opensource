import { readFile } from 'node:fs/promises';
import { localCommands, profileFiles, workflows } from './profiles.mjs';

const escape = (value) => value.replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

export function header(title, subtitle) {
  const fontSize = Math.max(20, Math.min(52, Math.floor(800 / (title.length * 0.6))));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300" viewBox="0 0 1200 300" role="img" aria-labelledby="title description">
  <title id="title">${escape(title)}</title>
  <desc id="description">${escape(subtitle)}</desc>
  <rect width="1200" height="300" rx="20" fill="#0c111b"/>
  <path d="M0 248H1200M920 0V300" stroke="#233348" stroke-width="1"/>
  <circle cx="1040" cy="142" r="57" fill="none" stroke="#5eead4" stroke-width="8"/>
  <path d="m1015 142 18 18 36-36" fill="none" stroke="#5eead4" stroke-width="8"/>
  <text x="58" y="94" fill="#5eead4" font-family="sans-serif" font-size="18" letter-spacing="4">OPEN SOURCE · BUILT WITH INTENT</text>
  <text x="58" y="173" fill="#f3f6fb" font-family="sans-serif" font-size="${fontSize}">${escape(title)}</text>
  <text x="58" y="217" fill="#a5b4c8" font-family="sans-serif" font-size="20">A clear start. A reviewed release.</text>
</svg>\n`;
}

export const conventions = `# Project conventions

Keep README, LICENSE, CONTRIBUTING, SECURITY, AGENTS, and CLAUDE at the root.
Put product documentation under docs/. Keep private development notes, temporary
scripts, runtime downloads, and evidence under ignored .opensource/.
Tests and maintained tools that support contributors are public project files.

Use a centered SVG README header, CI/license links, a short purpose statement,
working usage examples, and an honest status section. Do not add download badges
for an unpublished package or imply that a placeholder feature is complete.

Write short, direct steps for installation, release, and security procedures.
Use STE-inspired writing where ambiguity matters. Do not force restricted words
on design discussions or claim ASD-STE100 certification.

Use the selected license. Keep required third-party notices. Do not copy unrelated
project names, email addresses, credentials, or organization-specific policies.
Real authors own their contributions. A DCO signoff must represent the actual
contributor's certification; do not invent it.

Review needs depend on risk. A normal small library does not inherit a fixed
number of independent approvals from another project. Add specialist review when
handling credentials, security boundaries, financial data, or destructive actions.
`;

export const releasing = `# npm release setup

The starter has not been published. Generated sample code is not a finished product.
The workflow is disabled until NPM_STAGING_ENABLED is set to true.

1. Implement the product and review tests, package metadata, license, and npm pack inventory.
2. Create the intended public GitHub repository and protect main. Use real DCO signoffs.
3. Establish the correct npm account/scope access with 2FA. New-package staging creates
   a public 0.0.0-stage placeholder. Ask for authority before this external action.
4. Configure the package's npm trusted publisher for the exact GitHub owner,
   repository, workflow filename npm-stage.yml, and environment npm.
   Prefer stage-only permission. Never copy another package's trust configuration.
5. Create GitHub environment npm with required reviewers and main-only deployment.
   An environment name in YAML does not configure those protections. Check them
   in GitHub before enabling NPM_STAGING_ENABLED.
6. Dispatch npm-stage.yml on the reviewed main revision. It runs tests without
   publishing credentials, then stages the preview under next. The job does not approve it.
7. Inspect the stage, download and review its archive, then approve it through your
   own authenticated npm session with 2FA. Do not give tokens or OTPs to an agent.
8. Verify the public version, dist-tags, and provenance; smoke-test the public archive.

Use Node 22.14+ and modern npm; this workflow pins Node 22.23.3 and npm 12.2.1.
After setup, use npm stage list, npm stage view <stage-id>,
npm stage download <stage-id>, and npm stage approve <stage-id>.

For a stable release, decide readiness separately, choose a stable version, and
change both publishConfig.tag and the workflow tag from next to latest in a reviewed
change. Do not relabel a preview to imply stable quality. Check first-publication
tag behavior; do not assume an unwanted latest tag can be removed.

If authentication fails, inspect configuration and permissions. Stop and report
the blocker. Do not weaken protection, publish with copied tokens, or retry MFA
indefinitely. Staging and approving require separate authorization.

Primary sources:
- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/staged-publishing/
- https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions
`;

function releaseGuide(c) {
  if (c.profile === 'none') {
    return '# Project lifecycle\n\nOnly common repository structure was generated. No npm manifest, skill payload,\ncompiler, runtime, dependency lockfile, or publishing workflow was added.\nChoose implementation and product checks later. Account changes and publication\nstill require separate authorization.\n';
  }
  if (c.releaseMode === 'none') {
    return '# Release configuration\n\nnpm publication is disabled (`private: true`). No publishing workflow was generated.\n\nTo enable publication later, review the product and license, remove the private flag,\nchoose a reviewed version/tag, and configure the intended npm account and release path.\nThis local setup does not authorize publication or account changes.\n';
  }
  const blocked = c.publication === 'deferred'
    ? '# Publication is deferred\n\nPublishable manifests are private. The release checker rejects publication, and\nthe generated staging workflow (if selected) has an unconditional false guard.\nNo package is staged or published. Enable publication only in an approved change:\nreview the private flags, release checker, and workflow guard together; verify\naccount protections before enabling NPM_STAGING_ENABLED.\n\n'
    : '# Publication is configured, not authorized\n\nTemplates are prepared for staging. Account setup and each external publication\nstill require separate authorization. No stage or publish action has run.\n\n';
  const workspace = c.profile === 'typescript' && c.layout === 'workspace'
    ? '\n## Workspace releases\n\nThe root is permanently private and must not be published. Review every child\narchive separately. Each npm package needs its own trusted-publisher configuration.\nStaging several packages is not atomic; stop and report a partial failure. Approve\neach stage separately. This starter does not include Changesets or independent\npackage versioning; all initial package versions match the selected version.\n' : '';
  if (c.releaseMode === 'manual') {
    return blocked + `# Manual npm release setup

No publishing workflow was generated. The selected version is \`${c.version}\`
and the selected tag is \`${c.releaseTag}\`. Neither implies readiness or authority to publish.

1. Implement and review the actual product, license, metadata, and tests.
2. Run the selected package-manager checks in the README and inspect each archive.
   Run node scripts/check-release.mjs before any staging.
3. Inspect the archive and confirm npm account/scope permissions with 2FA.
4. With separate authority, run npm stage publish --access public --tag ${c.releaseTag} --ignore-scripts.
   A new name can create a public 0.0.0-stage placeholder.
5. Inspect and download the stage, then approve it in your own npm session with 2FA.
6. Verify public version, tags, archive, and provenance before adding install instructions.

Use Node ${c.nodeVersion} or later and npm 11.15.0 or later for staging.
Never provide tokens or OTPs to an agent. Stop on authentication/permission failure.
Private reporting and repository protections still require account-side setup.
See https://docs.npmjs.com/staged-publishing/.
` + workspace;
  }
  return blocked + releasing
    .replace(/\bmain\b/g, c.defaultBranch)
    .replace('Use real DCO signoffs.', c.dco ? 'Use real DCO signoffs.' : 'Use your actual author identity.')
    .replace('under next', `under ${c.releaseTag}`)
    .replace('Node 22.14+', `Node ${c.nodeVersion}+`)
    .replace('Node 22.23.3', `Node ${c.nodeVersion}`)
    .replace(/For a stable release,[\s\S]*?can be removed\./,
      `Selected version: ${c.version}; selected tag: ${c.releaseTag}.\nStable distribution is not a production-readiness claim. Verify readiness separately.\nKeep preview versions under next and stable versions under latest. Do not assume an\nunwanted first-publication latest tag can be removed.`) +
    '\nBuilds, tests, and archive creation run in the read-only verification job. The\nOIDC job verifies archive checksums and stages those archives; it does not execute\nproject tests or approve stages. Pin all actions and inspect artifacts before approval.\n' + workspace;
}

export async function render(c) {
  const repository = `https://github.com/${c.owner}/${c.repo}`;
  const copyright = `Copyright ${c.copyrightYear} ${c.copyright}`;
  const checks = c.profile === 'none' ? 'Define and run product checks once an implementation is chosen.'
    : `Run ${c.packageManager} run check after code changes.`;
  const agentInstructions = `# Project instructions\n\nPreserve existing work. Implement the requested scope. ${checks}\nInspect public outputs before release. Keep private notes under ignored\n.opensource/. Do not create repositories, change account settings, push, stage,\nor publish without authorization. Report missing evidence; do not invent reviews.\n`;
  const readmeOpening = c.readmeHeader
    ? `<p align="center">\n  <img src="./docs/assets/header.svg" alt="${escape(c.displayName)}" width="100%">\n</p>`
    : `<h1>${escape(c.displayName)}</h1>`;
  const ciLink = c.ci ? `<a href="${repository}/actions/workflows/ci.yml">CI</a> ·\n  ` : '';
  const dcoInstructions = c.dco
    ? 'Use your actual\nauthor identity and git commit -s for DCO certification. Human contributors remain\nresponsible for generated code. See https://developercertificate.org/.\n'
    : 'Use your actual author identity. Human contributors remain responsible for generated code.\nDCO signoffs are not required by this project configuration.\n';
  const license = c.license === 'Apache-2.0'
    ? await readFile(new URL('../assets/Apache-2.0.txt', import.meta.url), 'utf8')
    : `${copyright}\n\n${await readFile(new URL('../assets/MIT.txt', import.meta.url), 'utf8')}`;
  const files = {
    'LICENSE': license,
    'NOTICE': `${c.name}\n${copyright}\n`,
    'README.md': `${readmeOpening}\n\n<p align="center">\n  ${ciLink}<a href="./LICENSE">License</a> ·\n  <a href="./CONTRIBUTING.md">Contributing</a> ·\n  <a href="./SECURITY.md">Security</a>\n</p>\n\n${escape(c.description)}\n\n## Status\n\n${c.profile === 'none' ? 'Common repository structure only. No package implementation or publishing tooling was generated.' : `Local ${c.profile} scaffold, version \`${c.version}\`. Not yet published.\nReplace the sample implementation/instructions and verify real product behavior.\nPublication setting: \`${c.publication}\`. A configured version is not a readiness claim.`}\n\n## Local use\n\n${c.profile === 'none' ? 'Select implementation and product checks when needed.' : `Requires Node.js ${c.nodeVersion} or later.${c.packageManager === 'pnpm' ? ' Use pnpm 10.34.9.' : ''}`}\n\n\`\`\`sh\n${localCommands(c)}\n\`\`\`\n\n## Release\n\nSee [release setup](docs/RELEASING.md). No npm install command is advertised until\nan actual public version has been verified.\n`,
    ...(c.readmeHeader ? { 'docs/assets/header.svg': header(c.displayName, c.description) } : {}),
    'docs/RELEASING.md': releaseGuide(c),
    'docs/CONVENTIONS.md': conventions
      .replace('SECURITY, AGENTS, and CLAUDE', 'SECURITY, and selected agent instruction files')
      .replace('Use a centered SVG README header, CI/license links,', 'Use the selected README header style, available CI/license links,'),
    '.gitignore': (c.profile === 'none' ? '' : 'node_modules/\ncoverage/\ndist/\n*.tgz\n') +
      '.opensource/\n.DS_Store\n.env\n.env.*\n!.env.example\n.npmrc\n*.pem\n*.key\n*.p12\n',
    '.gitattributes': '* text=auto eol=lf\n',
    ...(c.agents.includes('codex') ? { 'AGENTS.md': agentInstructions } : {}),
    ...(c.agents.includes('claude-code') ? {
      'CLAUDE.md': c.agents.includes('codex')
        ? '# Project instructions\n\nRead AGENTS.md and follow its project instructions.\n' : agentInstructions,
    } : {}),
    'CONTRIBUTING.md': `# Contributing\n\nDiscuss large changes first. Keep pull requests focused. Add tests for behavior\nchanges. ${checks}\n\nDo not commit credentials, private data, or development evidence. ${dcoInstructions}`,
    'SECURITY.md': `# Security\n\nNo production support or security certification is claimed.\nDo not put sensitive vulnerability details in a public issue.\n\n${c.securityContact ? `Report privately to <${escape(c.securityContact)}>.\nMaintainers must confirm that this address is monitored before release.` : `Maintainers must enable GitHub private vulnerability reporting before public use.\nIf enabled, use ${repository}/security/advisories/new. If unavailable,\nrequest a private reporting route without disclosing vulnerability details.`}\n\nBefore release, define supported versions and a monitored private reporting route.\n`,
    '.github/pull_request_template.md': '## Change\n\nDescribe scope and reason.\n\n## Verification\n\nList commands and results. State missing checks.\n\n## Checklist\n\n- [ ] Tests cover the change.\n- [ ] Public files contain no private data or credentials.\n' +
      (c.dco ? '- [ ] DCO signoff uses the real contributor identity.\n' : ''),
    '.github/ISSUE_TEMPLATE/bug.yml': 'name: Bug report\ndescription: Report a reproducible bug without sensitive data.\nbody:\n  - type: textarea\n    id: reproduction\n    attributes:\n      label: Reproduction and expected result\n      description: Include version and minimal steps. Do not include credentials.\n    validations:\n      required: true\n',
    ...(c.dependabot ? {
      '.github/dependabot.yml': 'version: 2\nupdates:\n' +
        (c.ci ? '  - package-ecosystem: github-actions\n    directory: /\n    schedule:\n      interval: weekly\n' : '') +
        (c.profile !== 'none' ? '  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n' : ''),
    } : {}),
  };
  Object.assign(files, await profileFiles(c, files), workflows(c));
  return files;
}
