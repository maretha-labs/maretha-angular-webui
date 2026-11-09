# Third-party material

[inventory.json](inventory.json) lists every third-party component in this repository and its builds: where it came from, its version or digest, its SPDX licence expression, where its notice lives and what attribution it needs. [NOTICE](../../NOTICE) repeats the notices that Apache-2.0 material requires.

`npm run verify:licenses` checks, in CI and locally:

- every npm production dependency declares a licence expression that the allowlist in `scripts/verify-licenses.mjs` satisfies (`AND` needs every operand allowed, `OR` any); unknown, missing and copyleft licences fail;
- every file under `assets/js/` appears in an inventory component's `files`;
- with `--dist <dir>`, the production build carries `3rdpartylicenses.txt`.

A package outside the allowlist needs an entry in `docs/third-party/exceptions.json` (`{ "packages": [{ "name", "version", "reason" }] }`) approved by a maintainer. The check flags exceptions that are no longer needed.

When you add vendored code, an image or other material copied from another project, add an inventory component and keep the source's licence and notice files. Material under Apache-2.0 with a NOTICE also goes into the root NOTICE.
