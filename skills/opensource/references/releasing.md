# Preparing a release

The generator includes docs/RELEASING.md for the selected profile/publication intent.
GitHub-staged mode includes a disabled npm-stage.yml workflow; manual and
no-publication modes do not. Common-only output has no npm tooling.
Read the generated guide for the concrete project setup.

Deferred is the default for npm profiles. It blocks publication through private
manifests, a rejecting local release check, and an unconditional workflow guard.
Do not remove guards to make tests pass. Enable release only in an approved,
reviewed configuration change after the relevant product/account checks.

Before enabling release, inspect real product behavior, package contents, license,
repository metadata, private vulnerability reporting, main branch protection,
GitHub environment reviewers, and exact npm trusted-publisher configuration.
Do not mark account-side setup complete because a template mentions it.

The prepared release method is npm staging with separate maintainer approval through
2FA. Staging a new name can create a public placeholder. Staging is therefore an
external write, not a harmless local dry run. Approval makes the package public.

Build, test, and pack in the read-only verification job. The OIDC job consumes
those checksummed archives; it does not run project tests or approve stages.
Workspace roots are private. Review each child archive and its separate npm trust
configuration. Staging multiple children is not atomic; report partial failures.

Do not request or read tokens, browser session files, OTPs, or unrelated accounts.
Use explicit approval for external steps. Stop after authentication/permission
failure and explain what the owner must change. Confirm public version, tags,
archive, and provenance after release. Do not claim stable or production-ready
until the relevant product criteria have been met.

Official sources:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/staged-publishing/
