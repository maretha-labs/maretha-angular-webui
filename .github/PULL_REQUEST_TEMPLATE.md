<!--
Routes and requirements: CONTRIBUTING.md. In short:
- `fix:` or `feat:`: an open issue carrying `confirmed:bug` or `confirmed:feature`, applied after
  triage, named below (`Closes #123`);
- `docs:` or `test:`: documentation or tests only; every other type is maintenance and names a
  confirmed issue when product files change;
- the title follows Conventional Commits and becomes the squash commit message; every commit is
  signed off (`git commit -s`);
- `core.manifest.json` is regenerated last with `npm run release:core-manifest`, never edited.
Branches on forks may have any name. The `contribution-gate` check explains anything missing.
-->

Closes #

## What changed and why

## Checks run locally

- [ ] `npm run verify:upstream` (everything the public CI runs)
- [ ] Server code under `nuxeo/server` changed: said so above; `npm run package:nuxeo` runs before merging

## Contract changes

- [ ] None
- [ ] Public SDK API (`contracts/webui-sdk.api.md`, regenerated with `npm run update:sdk-api`)
- [ ] Contribution identities (`contracts/contribution-identities.json`)
- [ ] Polymer parity (`contracts/polymer-*.json`, `docs/polymer-parity.md`)
- [ ] Coverage baseline (`contracts/coverage-baseline.json`; it only ever rises)

## Screenshots

<!-- UI changes: before and after, light and dark theme. Delete this section otherwise. -->
