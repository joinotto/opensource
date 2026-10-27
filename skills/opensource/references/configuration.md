# Configuration questions

Ask these in manageable groups. Reuse explicit answers already supplied.
Explain which fields will be public. Never ask for credentials.

## Product and identity

- `profile`: ask first: `skills`, `typescript`, or `none` (common structure only).
- Destination directory: must not already exist.
- `name`: project/package name; use a valid npm name/scope for package profiles.
- `description`: raw product description.
- `displayName`: public name used in the README/header.
- `license`: `MIT` or `Apache-2.0`. Offer a choice, do not infer it from another project.
- `copyright`: actual rights holder, not an assumed GitHub account.
- `copyrightYear`: four-digit year.
- `author`: optional public npm author metadata; blank omits it.
- `keywords`: public npm search keywords; an empty list omits them.

## Profile-specific questions

For skills, ask `skills`: one or more name/purpose records; `hosts`: Codex,
Claude Code, or both; and `distribution`: npm installer, repository, or both.
Installer command `cliName` is a shared customization. Skill names use lowercase
letters/digits and single hyphens. Confirm host support independently of model
provider/API configuration, which must stay untouched.

For TypeScript, ask `layout`: single or workspace; and `packageManager`: npm or pnpm.
A workspace requires at least two `packages` name/purpose records, with distinct
npm names and unscoped folder names. Single packages default to npm; workspaces
default to pnpm. All output is ESM with declarations. Do not offer CommonJS,
Changesets, or cross-package dependency design as implemented features.

For none, ask only shared project identity/license/conventions. Skip hosts, skills,
workspace packages, npm publication, version/runtime, and dependency tooling.
The output has no manifest, skill directory, compiler, or npm release workflow.

## Repository and runtime

- `owner` and `repo`: planned GitHub repository identity. No creation authority is implied.
- `defaultBranch`: simple branch name; defaults to `main`.
- `nodeVersion`: package profiles only; exact Node 22.14+ or 24.x version.
  Confirm release availability separately.
- `agents`: development instruction files for `codex`, `claude-code`, both,
  or neither. These are distinct from a skill package's supported `hosts`.

The current generator uses GitHub metadata and the named profiles. Explain limits
before substituting a requested stack.
Only the two named licenses are implemented. An alternative requires separate work.

## Release and maintenance

- `publication`: deferred (recommended), configured for a later approved release,
  or none. Repository-only skills and common-only output default to none.
- `conventions`: accept `defaults` as a group, or `customize`. Defaults do not
  skip explicit identity/license choices or final review. Preserve explicit overrides.
- `version`: valid semantic version; default `0.1.0-preview.1`.
- `ci`: generate GitHub Actions CI?
- `releaseMode`: `manual` (manual staging guide) or `github-staged`; it is
  `none` when publication is unnecessary.
  GitHub staging requires CI. No option actually stages or publishes during init.
- `releaseTag`: `next` for previews, `latest` for stable versions; irrelevant when
  publication is disabled. A stable version does not prove production readiness.
- `dependabot`: generate dependency-update configuration?
- `dco`: require contributor DCO signoffs in the contribution policy?
  This changes policy text; automatic DCO enforcement is not implemented.
- `securityContact`: optional monitored public email. Blank selects guidance for
  GitHub private vulnerability reporting, which must still be enabled in the account.
- `readmeHeader`: include the SVG README header?

Deferred publication sets publishable manifests private, blocks the local release
checker, and adds a false guard to the staging workflow. Configured publication
removes only these local blockers, not external account requirements or approval.
A workspace root stays private under every setting. Staging is per package and
requires one trusted-publisher configuration per npm package.

Supported defaults and prompt routing live in `scripts/questions.mjs`.
Validation is in `scripts/scaffold.mjs`. The CLI shows configuration and planned
files, then asks for confirmation. A dry run never writes project files.
Noninteractive JSON configurations may omit optional fields and use documented
defaults; an agent should record explicit choices or the user's acceptance of defaults.
