# Usage

## Configuration

The wizard asks package kind first, then essential profile/identity questions.
It offers shared conventions as defaults or customization, displays the full
configuration and file plan, then asks for confirmation. Blank accepts a displayed
default. License selection explicitly offers MIT and Apache-2.0.

To supply answers through JSON, these seven fields are required:

```json
{
  "name": "@your-scope/my-package",
  "description": "A short description of the actual product.",
  "owner": "your-github-owner",
  "repo": "my-package",
  "profile": "skills",
  "license": "Apache-2.0",
  "copyright": "The actual rights holder"
}
```

`profile` is `skills`, `typescript`, or `none`. Legacy `library`/`cli` values are
not accepted. `license` is `Apache-2.0` or `MIT`.

## Profile choices

- `skills`: `skills` is a list of `{ "name": "...", "description": "..." }`
  records. The default is one skill derived from the package identity. Choose
  `hosts: ["codex"]`, `["claude-code"]`, or both. Choose `distribution` as `npm`,
  `repository`, or `both` (default). Repository-only defaults to no npm publication.
- `typescript`: `layout` is `single` (default) or `workspace`. A workspace requires
  at least two `packages` records with npm names and descriptions. Each needs a
  unique unscoped directory name. `packageManager` is npm (single default) or pnpm
  (workspace default). Only ESM is implemented; output includes declarations.
- `none`: generate only common repository files. No package.json, skill payload,
  compiler, dependency lockfile, tests, or npm staging workflow is generated.
  Common-only CI defaults off; if explicitly selected, it checks Git whitespace,
  not product behavior.

Example TypeScript workspace extension:

```json
{
  "profile": "typescript",
  "layout": "workspace",
  "packageManager": "pnpm",
  "packages": [
    { "name": "@your-scope/core", "description": "Shared SDK functionality." },
    { "name": "@your-scope/provider", "description": "Provider-native integration." }
  ]
}
```

Combine this extension with the required identity/license fields above.
The workspace root is permanently private; each child has its own export map,
license, packed archive, and publication flag. Cross-package dependencies and
Changesets are not generated.

## Shared configuration

`conventions` is `defaults` (default) or `customize`. Defaults skip repetitive
questions, not the review summary. Explicit fields override accepted defaults.
The skill asks these choices in groups; the terminal wizard asks shared details
only in customization mode. Noninteractive JSON can set each directly.

| Field | Default | Effect |
| --- | --- | --- |
| `displayName` | Unscoped package name | README/header title |
| `cliName` | Unscoped package name | npm skill installer executable |
| `copyrightYear` | Current UTC year, as text | Ownership notice |
| `author` | `""` | Optional public npm author metadata |
| `keywords` | `[]` | Up to 12 public npm keywords |
| `defaultBranch` | `"main"` | CI and release branch |
| `nodeVersion` | `"22.23.3"` | Exact CI runtime and minimum engine |
| `version` | `"0.1.0-preview.1"` | Package and lockfile version |
| `ci` | `true` for packages; `false` for common-only | Profile-aware CI workflow |
| `publication` | `"deferred"` for npm profiles | `deferred`, `configured`, or `none` |
| `releaseMode` | `"github-staged"`; `"manual"` if CI is off | Prepared staging method; `none` when publication is unnecessary |
| `releaseTag` | `"next"` for preview; `"latest"` for stable | npm publication channel |
| `dependabot` | `true` for packages; `false` for common-only | Dependency-update configuration |
| `dco` | `true` | Contribution policy requires DCO signoffs |
| `securityContact` | `""` | Public email or GitHub private-reporting guidance |
| `agents` | `["codex", "claude-code"]` | Selected agent instruction files |
| `readmeHeader` | `true` | SVG header asset and README reference |

Runtime/version/keywords and npm settings do not apply to common-only output.
Node runtime input accepts exact 22.14+ or 24.x versions; validation does not prove
release availability. TypeScript 6.0.3 and pnpm 10.34.9 are pinned in generated files.

`publication: "deferred"` prepares packaging/staging but sets manifests private,
blocks the release checker, and adds a false guard to the staging workflow.
`configured` removes those local blockers, but account setup and separate approval
are still required; NPM_STAGING_ENABLED is not automatically enabled.
`none` sets package manifests private and omits publishing checks/workflows.
Repository-only and common-only default to none.

`manual` creates a staging guide without a publishing workflow. `github-staged`
requires CI. Preview versions use next; stable versions use latest. Neither proves
production readiness. Workspace staging is per package, not an atomic release.

Booleans must be actual JSON booleans. `agents` and `keywords` must be arrays.
Use `agents: []` for no agent files. Choosing DCO changes policy text; it does not
install a DCO-check service. Public reporting routes must be verified separately.

In a terminal, `--config` pre-fills supplied answers and asks remaining essential
questions plus the selected shared customization.
Without a terminal, omitted optional fields use the defaults above.
The agent skill asks in groups and confirms all choices before generation.

No account availability or permissions are implied by a valid name.
The target's parent directory must exist. Even an empty target is preserved.
Dry run reports files but creates nothing.

Input is data, never evaluated as shell or JavaScript. Do not put credentials in
configuration files. Keep local configuration and evidence under ignored
`.opensource/`, not in the package payload.

## Skill installation

`install --host codex --project <path>` installs into `.agents/skills/opensource`.
`install --host claude-code --project <path>` installs into `.claude/skills/opensource`.
The project must exist. This release supports macOS/Linux, not native Windows.
Symlinked host, state, and skill-parent directories are rejected.
No global configuration, hooks, API keys, or model settings are changed.

The copied skill includes scripts, templates, license, and references.
It can generate projects without the original checkout. Node.js is still required.
Host discovery may require a new session or skill reload. Discovery is not proof
that a model will follow every instruction correctly.

For installations made by this version:

```sh
node bin/opensource.mjs upgrade --host codex --project /path/to/project --dry-run
node bin/opensource.mjs upgrade --host codex --project /path/to/project
node bin/opensource.mjs uninstall --host codex --project /path/to/project
node bin/opensource.mjs restore --host codex --project /path/to/project
```

Use `--host claude-code` for Claude Code. Generated npm skill installers support
the same operations. The installing package name must match the stored receipt.
Older/unmanaged installs are not adopted automatically.

Upgrade verifies all installed file hashes. It refuses local edits, then retains
the old payload in a backup. Uninstall also refuses edits and moves the managed
payload to a backup; it does not delete it. Restore copies the most recently
removed payload into an absent destination after verifying the backup's hashes.
Restore does not overwrite an installed skill or automatically roll back an upgrade.

Receipts and recovery journals live in `.opensource/skills/<host>/`.
Keep this directory ignored and preserve it when moving a project.
Locks reject concurrent managed operations. Bundles preflight every destination;
unexpected mid-operation failures can still leave a partially processed bundle.
There is no all-or-nothing bundle guarantee.

After interruption, stop before retrying. Inspect the named transaction's
`journal.json`, its retained `payload` backup, and the installed destination.
Preserve local edits and partial new files. An interrupted operation may require
manual recovery; `restore` handles completed managed uninstalls only.
Remove an empty stale `.lock` directory only after confirming that no operation
is running. Never delete a payload or receipt to bypass a collision.

Filesystem operations reject symlinks and special payload files, use exclusive
file creation, and recheck directory identity. They are not an operating-system
security boundary against a malicious process with the same user permissions.
Run in a trusted local filesystem; do not use this CLI on attacker-controlled
shared directories. There is no automatic backup cleanup.

## Distribution

The CLI can run from a local checkout or an npm pack archive. There is no verified
public npm version yet. The intended release is `@ottoai/opensource@0.1.0`.
After authorized publication and public verification, add its version-pinned
npx installation examples. Do not advertise the unpublished name as usable.
`--ignore-scripts` disables npm lifecycle scripts, not explicitly invoked CLI code.

## Verification limits

Generated checks cover sample behavior, installer boundaries, compiled exports,
declarations, and archive inventory. They do not implement your product, scan every
possible secret, complete security review, configure accounts, or certify standards.
Generated skill validation covers the starter metadata format; real task behavior
must be evaluated in each chosen host.
