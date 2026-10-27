const field = (key, label, fallback, extra = {}) => ({ key, label, fallback, ...extra });
const yesNo = (value) => {
  if (/^(yes|y|true)$/i.test(value)) return true;
  if (/^(no|n|false)$/i.test(value)) return false;
  throw new Error('Answer yes or no.');
};
const list = (value) => value.split(',').map((item) => item.trim()).filter(Boolean);
const choice = (...choices) => (value) => {
  const match = choices.find((option) => option.toLowerCase() === value.toLowerCase());
  if (!match) throw new Error(`Choose ${choices.join(' or ')}.`);
  return match;
};

// The wizard and configuration validator share this supported-option inventory.
export const questions = [
  field('profile', 'Package kind: skills, typescript, or none (common structure only)', undefined, { parse: choice('skills', 'typescript', 'none') }),
  field('layout', 'TypeScript layout: single or workspace', 'single',
    { when: (c) => c.profile === 'typescript', inactive: 'single', parse: choice('single', 'workspace') }),
  field('name', 'Project/package name; npm scope if applicable', undefined),
  field('description', 'Raw product description', undefined),
  field('skills', 'Skill names, comma-separated', (c) => [{
    name: c.name?.split('/').at(-1).toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/g, '') || 'my-skill', description: c.description,
  }], {
    when: (c) => c.profile === 'skills', inactive: [],
    parse: (value) => list(value).map((name) => ({ name, description: '' })),
  }),
  field('hosts', 'Supported coding hosts: codex, claude-code, or both', ['codex', 'claude-code'], {
    when: (c) => c.profile === 'skills', inactive: [],
    parse: (value) => value.toLowerCase() === 'both' ? ['codex', 'claude-code'] : list(value),
  }),
  field('distribution', 'Skill distribution: npm, repository, or both', 'both',
    { when: (c) => c.profile === 'skills', inactive: (c) => c.profile === 'none' ? 'repository' : 'npm', parse: choice('npm', 'repository', 'both') }),
  field('packages', 'Workspace npm package names, comma-separated', undefined, {
    when: (c) => c.profile === 'typescript' && c.layout === 'workspace', inactive: [],
    parse: (value) => list(value).map((name) => ({ name, description: '' })),
  }),
  field('packageManager', 'Package manager: npm or pnpm',
    (c) => c.layout === 'workspace' ? 'pnpm' : 'npm', {
      when: (c) => c.profile === 'typescript', inactive: (c) => c.profile === 'none' ? 'none' : 'npm', parse: choice('npm', 'pnpm'),
    }),
  field('license', 'License: MIT or Apache-2.0', 'Apache-2.0', { parse: choice('MIT', 'Apache-2.0') }),
  field('copyright', 'Actual copyright holder (public)', undefined),
  field('owner', 'GitHub owner', undefined),
  field('repo', 'GitHub repository name', undefined),
  field('publication', 'npm publication: deferred, configured, or none',
    (c) => c.distribution === 'repository' ? 'none' : 'deferred',
    { when: (c) => c.profile !== 'none', inactive: 'none', parse: choice('deferred', 'configured', 'none') }),
  field('conventions', 'Shared conventions: defaults or customize', 'defaults', { parse: choice('defaults', 'customize') }),
  field('displayName', 'Public display name', (c) => c.name?.split('/').at(-1).slice(0, 64) || 'My package', { shared: true }),
  field('cliName', 'npm skill installer command name', (c) => c.name?.split('/').at(-1).slice(0, 64) || 'my-package',
    { when: (c) => c.profile === 'skills' && c.distribution !== 'repository', shared: true }),
  field('copyrightYear', 'Copyright year', () => String(new Date().getUTCFullYear()), { shared: true }),
  field('author', 'Public author metadata; blank to omit', '', { when: (c) => c.profile !== 'none', shared: true }),
  field('defaultBranch', 'Default branch name', 'main', { shared: true }),
  field('keywords', 'npm keywords, comma-separated; blank for none', [], { when: (c) => c.profile !== 'none', parse: list, shared: true }),
  field('nodeVersion', 'Exact Node runtime for CI: 22.14+ or 24.x', '22.23.3', { when: (c) => c.profile !== 'none', shared: true }),
  field('version', 'Initial version; preview recommended', '0.1.0-preview.1', { when: (c) => c.profile !== 'none', shared: true }),
  field('ci', 'Generate GitHub Actions CI? yes/no', (c) => c.profile !== 'none', { parse: yesNo, shared: true }),
  field('releaseMode', 'Prepared npm release method: manual or github-staged',
    (c) => c.publication === 'none' ? 'none' : c.ci === false ? 'manual' : 'github-staged', {
      when: (c) => c.publication !== 'none', inactive: 'none',
      parse: choice('manual', 'github-staged'), shared: true,
    }),
  field('releaseTag', 'npm release tag: next or latest',
    (c) => (c.version || '').split('+')[0].includes('-') ? 'next' : 'latest',
    { when: (c) => c.publication !== 'none', parse: choice('next', 'latest'), shared: true }),
  field('dependabot', 'Generate dependency-update configuration? yes/no', (c) => c.profile !== 'none', {
    when: (c) => c.profile !== 'none' || c.ci, inactive: false, parse: yesNo, shared: true,
  }),
  field('dco', 'Require contributor DCO signoffs? yes/no', true, { parse: yesNo, shared: true }),
  field('securityContact', 'Public security-reporting email; blank for GitHub private reporting', '', { shared: true }),
  field('agents', 'Agent instruction files: codex, claude-code, both, or none',
    ['codex', 'claude-code'], {
      shared: true,
      parse: (value) => value === 'both' ? ['codex', 'claude-code']
        : value === 'none' ? [] : list(value),
    }),
  field('readmeHeader', 'Generate the SVG README header? yes/no', true, { parse: yesNo, shared: true }),
];

export function fallbackFor(question, config) {
  return typeof question.fallback === 'function' ? question.fallback(config) : question.fallback;
}

export function inactiveFor(question, config) {
  return typeof question.inactive === 'function' ? question.inactive(config) : question.inactive;
}

export async function gatherConfig(ask, provided = {}, report = console.error) {
  const config = structuredClone(provided);
  for (const key of Object.keys(config)) {
    if (!questions.some((question) => question.key === key)) throw new Error(`Unknown configuration field: ${key}`);
  }
  for (const question of questions) {
    const fallback = fallbackFor(question, config);
    if (!Object.hasOwn(config, question.key)) {
      if ((question.when && !question.when(config)) || (question.shared && config.conventions === 'defaults')) {
        config[question.key] = question.when && !question.when(config) && Object.hasOwn(question, 'inactive')
          ? inactiveFor(question, config) : fallback;
      } else {
        const display = Array.isArray(fallback)
          ? fallback.map((item) => typeof item === 'object' ? item.name : item).join(',') : fallback;
        const suffix = fallback === undefined ? '' : ` [${display === '' ? 'omit' : display}]`;
        while (true) {
          const answer = (await ask(`${question.label}${suffix}: `)).trim();
          try {
            if (!answer && fallback === undefined) throw new Error('This field is required.');
            config[question.key] = !answer ? fallback : question.parse ? question.parse(answer) : answer;
            break;
          } catch (error) {
            report(error.message);
          }
        }
      }
    }
    if (['skills', 'packages'].includes(question.key) && Array.isArray(config[question.key])) {
      for (const item of config[question.key]) {
        if (!item.description) {
          item.description = (await ask(`Purpose of ${item.name}: `)).trim();
        }
      }
    }
  }
  return config;
}
