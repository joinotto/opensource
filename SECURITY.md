# Security

This project is an unpublished 0.1.0 release candidate. It has not had an
independent security review.
Do not include credentials or sensitive vulnerability details in public issues.

Security maintainer: @geekfarmer.
Use the private reporting route below when it is enabled. Do not send sensitive
details through public issues, comments, or mentions.

GitHub private vulnerability reporting is enabled for joinotto/opensource.
Report privately at https://github.com/joinotto/opensource/security/advisories/new.
@geekfarmer is responsible for monitoring reports. No fixed response-time
commitment or independent security certification is claimed.
Once released, only the latest 0.1.x version will receive fixes during this phase.

The generator does not access account credentials, install dependencies, execute
project scripts, create repositories, push, stage, or approve releases. Running
the CLI or a copied skill is code execution; inspect the source first.

Use a trusted local filesystem. Symlink/identity checks and cooperative locks
reduce accidental overwrite risk; they do not isolate an actively malicious
process with the same user permissions. Native Windows and untrusted shared
directories are outside the 0.1.0 support boundary.
