# Roadmap

## Initial local preview

- [x] Standalone `@ottoai/opensource` project.
- [x] Interactive wizard and validated JSON configuration.
- [x] Complete supported-option questions, conditional prompts, and pre-generation confirmation.
- [x] Skills, TypeScript, and common-only profiles; skip unrelated tooling.
- [x] Skills: one/multiple payloads, selected hosts, optional installer and validation.
- [x] TypeScript: single/workspace, npm/pnpm, ESM/declaration exports and archive checks.
- [x] Shared defaults/customization and default deferred publication guards.
- [x] Self-contained Codex and Claude Code skill installation.
- [x] Collision refusal, dry run, sample behavior tests.
- [x] Isolated skill-package and SDK-workspace smoke checks against public reference structures.
- [x] Disabled npm staging workflow and account setup guide.

## Before a public release

- [x] Test actual skill discovery and common-only generation in fresh Codex and Claude Code sessions; compare generated files byte for byte.
- [ ] Review templates with maintainers of real projects; record gaps and fixes.
- [x] Add generated archive inventory enforcement.
- [x] Add path/symlink, hard-link, cooperative-concurrency, and replacement tests; document the trusted-filesystem boundary.
- [x] Add installed-skill receipts, guarded upgrade/uninstall, preserved backups, and completed-uninstall restore.
- [x] Add read-only release readiness checks for external account protections.
- [x] Enable private vulnerability reporting, assign @geekfarmer, and add public community/support files.
- [ ] Configure repository protection and stage-only npm trusted publishing.
- [x] Review packed inventory and local archive execution without publishing.
- [ ] Obtain explicit staging/publication authority after readiness checks pass.

## 0.1.0 release candidate

- [x] Confirm copyright holder Anurag Patel and assign @geekfarmer to security/release review.
- [x] Dependency-free runtime, stable candidate version/tag metadata, private publication guard.
- [x] Public archive allowlist and obvious credential-pattern checks.
- [x] Stage-only workflow: reviewed source, checksummed artifact, protected environment, no approval command.
- [x] macOS/Linux and Node 22/24 CI matrix prepared.
- [x] Public issue/PR templates and dependency-update configuration.
- [x] Recovery documentation and explicit native-Windows/filesystem limitations.
- [ ] Run the CI matrix in the intended public repository.
- [ ] Confirm actual ownership, a monitored reporting route, maintainer review, and package-specific npm trust.

Account or human-review items stay incomplete until verified. A candidate version
and prepared workflow are not a completed release.

## After authorized publication

- [ ] Verify the public archive, provenance, tags, and pinned npx usage.
- [ ] Record the verified release and update the unpublished status.

## Later, after demonstrated need

- [ ] Cross-package dependencies and independent workspace versioning/Changesets.
- [ ] Optional module formats beyond ESM, after a real consumer need.
- [ ] Optional stronger review policies for higher-risk packages.

Do not call this production-ready because the starter's sample tests pass.
Stable distribution and product readiness are separate decisions.
Reference smoke checks compare starter conventions and execute generated tooling.
They do not reproduce the reference projects' product code, every CI gate, or live
agent behavior. Private development evidence stays under ignored `.opensource/`.
