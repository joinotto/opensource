# Releasing OpenSource

The target is @ottoai/opensource@0.1.0 under latest. The manifest is still private.
Do not stage or publish it yet.
Complete the public-release checks in ROADMAP.md first.

Copyright holder: Anurag Patel.
Security and release-review maintainer: @geekfarmer.
These role assignments do not establish a completed review or an enabled reporting
route. Record an actual review reference before release. Under the one-approval
branch rule, a PR authored by @geekfarmer needs another qualifying reviewer;
GitHub does not allow an author to approve their own PR.

Run `npm ci --ignore-scripts` and `npm run check`. Inspect the actual packed archive.
Review the confirmed copyright notices and license text before release.

The generator includes npm-stage.yml when GitHub staging is selected for a package
profile. Common-only and no-publication modes do not add it.
Its account-side setup is described in
[the skill release guide](../skills/opensource/references/releasing.md).
The public repository is joinotto/opensource. Private reporting is enabled and
the npm environment names @geekfarmer as reviewer. This project's workflow is
prepared, but its npm trusted publisher is not configured. NPM_STAGING_ENABLED
is false. Repository setup does not authorize npm staging or publication.

## Readiness

Run `npm run release:check` from a clean reviewed checkout with GitHub CLI access
and npm 12.2.1. It reads the public repository, reporting status, branch protections,
environment reviewers, and package-specific npm publisher settings. It never
creates repositories, logs in, changes settings, stages, or approves.
Failure is a blocker, not permission to weaken a check.

Store actual host traces and review references under ignored `.opensource/`.
`release-evidence.json` records Codex/Claude versions and passed behavior cases,
the actual maintainer-review identity/reference, confirmed ownership/reporting,
and the verified npm-trust reference. Assertions in that file require evidence;
they do not create independent review or security certification.

The new npm package must exist before its trusted publisher can be configured.
If the package does not exist, arrange a separately authorized bootstrap stage
with the owner. That operation creates a public 0.0.0-stage placeholder. Do not
advertise the real 0.1.0 version until it has been approved and verified.

## Stage-only workflow

Configure the exact npm trust relationship: repository joinotto/opensource,
workflow npm-stage.yml, environment npm, permission createStagedPackage only.
Do not allow direct createPackage publication. Confirm that every publisher on
this package is stage-only. Confirm main protections and environment reviewers.

After readiness review and separate authority, remove private in a reviewed
change, run the CI matrix, and enable NPM_STAGING_ENABLED. Dispatch npm-stage.yml
on main with the full reviewed source SHA. The workflow requires that SHA to match
the checkout. Verification has no publishing permission; the OIDC job receives only
the reviewed tarball and checksum file. It stages with npm 12.2.1 and provenance.
It does not approve the stage or create a GitHub release.

An owner must review and approve the stage through npm's 2FA flow. Never paste
OTPs, account tokens, or private browser state into project files or this chat.
Stop after authentication or permission failure.

Do not use another project's trust configuration or credentials. Do not stage,
approve, publish, or create the repository without authority. Staging a new npm
name can create a public placeholder. Keep preview releases under `next`.

After publication, verify the public archive, provenance, version, and tags before
documenting a version-pinned npx command. Update the README's local-preview status
only when the verified public version is usable.
