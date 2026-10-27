# Project conventions

Generate root README, LICENSE, CONTRIBUTING, and SECURITY files plus selected
AGENTS and/or CLAUDE instructions. Honor the chosen header, CI, release, and DCO settings.
Put other maintained guidance under docs/. Keep local evidence and temporary
development helpers under ignored .opensource/. Include tests in the public repo;
do not put tests or private evidence in the npm runtime package.

The renderer in scripts/templates.mjs owns the deterministic file templates.
It produces the selected README header style, available CI links, actual local
usage, and an unpublished status. Do not add fake download badges or testimonials.

Use direct, short writing for operational steps. STE-inspired language helps
where ambiguity matters. Do not enforce a restricted vocabulary on design work
or claim ASD-STE100 certification.

Apache-2.0 and MIT are supported. Copyright ownership is an explicit user choice.
Do not infer ownership from an account handle or generate a fabricated DCO identity.
Review requirements depend on risk, not the number used by an unrelated project.

Skill installers support managed install, upgrade, uninstall, and restore.
Receipts and file hashes establish the package identity; they are not signatures
or proof against a malicious local user. Upgrades and removals refuse local edits.
Old payloads remain in `.opensource/skills/<host>/` for recovery. Restore only
handles a completed uninstall into an absent target. Mid-operation failure may
require inspecting the recovery journal and preserving partial/new files.
Bundles preflight collisions but are not atomic. Never force adoption of an
unmanaged skill or delete backups to bypass ownership checks.

Run filesystem operations on macOS/Linux in a trusted local directory.
Symlink rejection and identity checks are safeguards, not a security boundary
against hostile same-user races. Native Windows is not supported in this release.
