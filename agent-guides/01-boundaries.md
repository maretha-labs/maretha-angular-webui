# Boundaries

Who may change what, and how the repository enforces it.

## Two zones

Every tracked file is in the customization zone or in core. The customization zone:

<!-- customer-paths -->

- `custom/`
- `migration/mapping.json`
- `migration/polymer-source/`

<!-- /customer-paths -->

Core is everything else: `app/`, `styles/`, `assets/`, `nuxeo/`, `scripts/`, `e2e/`, the
configuration files and the documentation. `core.manifest.json` records the SHA-256 of every core
file at the release, except `package.json`, `package-lock.json` and `.github/`, so dependency and
workflow updates need no regeneration. `npm run verify` recomputes the hashes and lists every core
file that was changed, removed or added, untracked files included. The manifest is a lockfile for a
customized copy, not an approval mechanism: regenerating it with `npm run release:core-manifest` is
the last step of an upstream change before its pull request, after review, and never a step of a
customization.

## Inside custom/

- `custom/index.ts` is the one file core imports from the zone: `main.ts` registers its
  `provideCustomExtensions()` after the default extensions. It carries three marker comments
  (`<custom:imports>`, `<custom:contributions>`, `<custom:layouts>`); the generators insert
  above them. Keep the markers.
- `custom/owner.json` holds the owner prefix: lowercase letters, digits and hyphens, not
  `maretha`. Contribution ids start with `<prefix>.` and element selectors with `<prefix>-`;
  the generators and the lint rules enforce both.
- `custom/` imports only its own files, `@maretha/webui-sdk` and npm packages, never core
  files. Installing a package changes `package.json` and `package-lock.json`, which are core,
  so `npm run verify` reports them: treat a new dependency as a request upstream, or as a core
  change you knowingly re-apply at every upgrade.
- The generators lay the zone out as `custom/contributions/<slot>/<id>.component.ts` with its
  spec, and `custom/layouts/<Type>/<type>.<mode>.layout.ts` with its spec next to a shared
  `<type>.fields.ts`.
- Inline `eslint-disable` comments are ignored and reported under `custom/`. Fix the finding.
- `ag-grid-enterprise`, `@ag-grid-enterprise/*` and `ag-charts-enterprise` are rejected
  everywhere; the UI uses the MIT-licensed Community packages.

## The boundary in both directions

The `maretha/custom-boundaries` lint rule rejects an import from `custom/` into anything outside
the list above, and an import from core into `custom/` other than `main.ts` importing
`custom/index.ts`. The `maretha/no-credential-default` rule rejects a credential-named
environment variable read with a hard-coded fallback. Both run in `npm run lint`, in every
verify mode and in CI.

## The migration drop zone

`migration/polymer-source/` and `migration/mapping.json` are writable so an existing Polymer Web
UI customization can be checked in next to its Angular replacement while the migration runs.
Nothing builds from them. [docs/polymer-parity.md](../docs/polymer-parity.md) lists the Angular
id of every Polymer default contribution; a Polymer override that named one targets that id.

## Why core is read-only for a customization

- A core edit is lost at the next upgrade: `git merge v<next>` conflicts on it or reverts it,
  and `npm run verify` fails until it is undone.
- Every Polymer slot has an Angular slot, and the common document forms have layout modes
  ([02-slot-catalog.md](02-slot-catalog.md)). What cannot be done inside the zone is a gap to
  report upstream with the use case, not a reason to patch core.

## Upgrades

Add the public repository as the `upstream` remote, `git fetch upstream --tags`,
`git merge v<next>`, `npm run verify`. The merge touches core only; the zone is yours.
