# Runtime quality checks

## Verification modes

`scripts/verify.mjs` runs the checks of one mode in a fixed order, stops at the first
failure, prints the failing command and writes `dist/verification/verify-report.json` (mode,
Node, application, SDK and manifest versions, the commit with a fingerprint of every
uncommitted change, and one pass, fail or not-run entry per check). It repairs nothing.

- `npm run verify` (customizing a release): core manifest, lint, formatting, typecheck, zone
  guards, slot catalog, unit tests.
- `npm run verify:upstream` (contributing): every command the public CI jobs run, in CI order,
  with the core manifest last, regenerated as the final step of an upstream change.
  `scripts/verify.test.mjs` parses `.github/workflows/ci.yml` and fails when the two lists
  differ; a step that needs a pull request base commit is recorded as not run locally.
- `npm run verify:release` (releasing): upstream plus `npm run verify:release-artifacts`:
  LICENSE and NOTICE in the package, its bundles and the SDK archive, and `3rdpartylicenses.txt`
  in the production build. `npm run release:files` then copies the SDK archive and
  `core.manifest.json` to `dist/release/` with `sha256sums`.

`npm run verify:public-tree` fails when a tracked path belongs to the private `maintainers/`
overlay (its files and the sync workflow); it runs in CI and in the upstream mode.

The runtime CI runs on GitHub-hosted `ubuntu-latest` with the pinned Node version
for every pull request, forks included. The local Nuxeo critical paths are a
self-hosted harness: they need a dedicated runner with the prepared
fixture described in `e2e/nuxeo/fixture/README.md` and are not a required check.
These checks are local source verification; they do not establish
installed-package acceptance or multi-GB performance.

## Transfer and cleanup guards

`npm run verify:transfer-contract` runs focused browser tests for the 64 KiB
initial PDF request and its exact retry when a server does not clip it, page
numbers committed by PDF.js rather than per keystroke, the 8 MiB ignored-range
fallback limit, header-first
rejection, cancellation, repeated media teardown, native file downloads and
bulk ZIP JSON polling. It checks application transport and cleanup, not total
PDF.js or browser heap use. Image/text previews and separate export operations
such as CSV retain their supported authenticated Blob paths.

`npm run verify:transfer-check-failures` first verifies the pristine source, then
introduces eight regressions into isolated temporary copies. Each mutation must
fail its named browser test; a compiler or browser-startup failure does not count
as detection. Original source hashes are checked afterward. CI runs this proof,
and reports are written under `dist/verification/transfer-*.json` with logs.

`npm run measure:pdf-ranges` is a local, opt-in measurement of PDF.js range
traffic for large documents; CI does not run it. See
[PDF range loading](pdf-range-loading.md#measuring-range-cost).

## Coverage and exclusions

Run `npm run test:coverage`, then `npm run verify:coverage`. The collector runs
the complete browser suite in a deterministic order and binds the result to
source/configuration hashes taken before and after the run. Editing source during
or after collection requires a fresh run. `npm run verify:coverage-guard` tests
the ratchet itself, including deliberate drops and attempts to hide code.

The report in `dist/verification/coverage.md` shows statements, branches,
functions and lines alongside the physical source lines excluded from each
percentage. `coverage.json` contains the complete file inventory, hashes and
uncovered executable line numbers. Coverage percentages describe instrumented
runtime TypeScript. HTML templates, styles and assets are outside these percentages.
Uninstrumented executable files are explicitly listed; they are
not counted as covered. Type-only declarations are listed separately. Test files
and `app/testing` are outside the runtime scope, and production imports into
those paths are rejected.

`contracts/coverage-baseline.json` is the reviewed floor for overall and per-file
coverage. Comparisons use full precision, even when display percentages round to
the same value. New or expanded uninstrumented source, changed executable code
inside an excluded file, missing formerly measured files, coverage-ignore
directives and nonempty Angular coverage-exclusion globs fail the check.

After improving coverage, `npm run update:coverage-baseline` records the higher
floor. It cannot lower an existing floor. PR verification also compares the
baseline with the exact base commit (`COVERAGE_BASE_REF`), so editing the baseline
in the same PR cannot conceal a reduction. Adding coverage to previously
uninstrumented code retires that exclusion.

## Customization zone

`npm run verify:custom-guards` tests the `custom/` import-boundary lint rule, the
`new:contribution` / `new:layout` generators, the core manifest, the verify runner and the agent-file
pointers.
`npm run verify:custom-scaffold` generates a contribution for each of the 26 slots and
every supported layout mode into `out-tsc/custom-scaffold`, compiles the output with
strict templates and lints it as `custom/` code. It then plants a template error, a
core import and a credential default, and requires all three to fail.

`npm run verify:examples` verifies `examples/acme` the way a release is received: it adds a
worktree of `HEAD`, replaces its `custom/` with `examples/acme/custom` and requires every slot
and layout mode covered with a file and a spec, every `maretha.*` id in `index.ts` present in
the slot catalog, lint as `custom/` with the example's owner prefix, strict template
compilation, green specs (Karma, headless, from a configuration written into the ignored
`out-tsc/`) and `core.manifest.json` unchanged. It then plants a missing spec, a template error
and a file outside `custom/`, each of which must fail. The example is excluded from the
application's own lint, typecheck and test discovery (`eslint.config.js`, `tsconfig.spec.json`,
`angular.json`) and verified only this way. Report: `dist/verification/examples.json`.

The `maretha/no-credential-default` lint rule rejects a credential-named environment
variable (`*_USER`, `*_PASSWORD`, `*_TOKEN`, `*_AUTH`, `*_API_KEY` and similar) read with a
hard-coded fallback: `??`, `||`, `??=`, `||=`, a ternary, a destructuring default from
`process.env`, or a same-file `const`. An unset variable must stop the code, not sign it
in as a default account. It runs on TypeScript everywhere and on the `.mjs`/`.cjs` files
under `scripts/` and `e2e/`. An empty-string fallback is allowed. It does not see values
reached through calls or imports, a renamed `env` object, or workflow `run:` steps.

Lint rejects imports of `ag-grid-enterprise`, `@ag-grid-enterprise/*` and
`ag-charts-enterprise` in core and `custom/` code: the spreadsheet editor uses the
MIT-licensed AG Grid Community packages only.

`npm run release:core-manifest` writes `core.manifest.json`: the package version and
the SHA-256 of every tracked file outside `custom/`, `migration/mapping.json` and
`migration/polymer-source/`. `npm run verify:core-manifest` lists core files changed,
removed or added since. Hashes cover raw bytes, so a checkout that converts line
endings reports converted text files as changed.

`npm run verify:slot-catalog` checks that `agent-guides/02-slot-catalog.md` is the rendering
of the SDK entry point, the generator's slot table and the contracts, and that those four agree
on the 26 slots and their context types. `npm run render:slot-catalog` rewrites it after an
SDK or contract change.

`scripts/agent-guides/pointers.test.mjs` (in `verify:custom-guards`) keeps `AGENTS.md` the one
instruction set for coding agents: the four tool-specific files point at it in one line, its
customization zone equals `CUSTOMER_PATHS` in `scripts/core-manifest.mjs`, its links and the
guides' links resolve, the npm scripts it names exist, and it refers to nothing outside the
public tree.

## Dependency and code scanning

`.github/workflows/dependency-review.yml` fails a pull request that adds or updates a
dependency with a known moderate-or-higher vulnerability, or adds an AG Grid or AG Charts
Enterprise package. `.github/workflows/codeql.yml` runs CodeQL over the TypeScript and
JavaScript sources, the workflows themselves (expression injection into `run:` steps) and
the Java server module, on pull requests, pushes to `main` and weekly. Both need GitHub
Advanced Security on a private repository, where the code-scanning and dependency-graph
APIs otherwise return 403, so both skip on a private copy and run on the public repository. Dependabot alerts are a
repository setting; Dependabot pull requests are not enabled.

## Polymer parity

`npm run verify:polymer-parity` checks that `contracts/polymer-contribution-map.json`
maps every default contribution and search in `contracts/polymer-slots.json` exactly once,
that its Angular targets exist in `contracts/contribution-identities.json`, that every
Polymer workflow task layout and theme has an Angular default, that each non-slot surface
has a status and guidance, and that `docs/polymer-parity.md` matches its rendering. It also
checks that `contracts/polymer-slot-hosts.json` lists the Angular components that host each
slot, accounts for every Polymer slot-model field once, and maps fields only to properties of
the slot's SDK context type, read with the TypeScript checker. When the pinned Web UI revision changes,
regenerate the inventory with `npm run inventory:polymer-slots -- --source <nuxeo-web-ui
checkout> --out contracts/polymer-slots.json`, update both maps, then run
`npm run render:polymer-parity`.

## Accessibility and local Nuxeo

`npm run test:a11y` runs Playwright against local Angular fixtures that render
real runtime shell, dialog, menu, tooltip, editor, upload, document-tab and tree
components. The declared matrix contains 64 tests and 84 paired scan states
(168 axe/IBM engine scans) across English/Arabic and default/dark themes.
Keyboard cases cover focus recovery, draft preservation and save/upload
announcements. Subject-backed upload/save outcomes exercise the production
editor without sending bytes or writes to Nuxeo. Matrix sizes are expectations;
the fresh `dist/verification/a11y/summary.json` records whether the run passed.
Raw findings and narrowly reviewed third-party exceptions remain visible there.

Visual checks include a 320 CSS-pixel viewport, 200% root-font enlargement,
text-spacing overrides and browser forced-colors emulation. These are bounded
proxies, not actual browser zoom, a native Windows high-contrast session or a
screen-reader speech check. Real VoiceOver/NVDA, complete reflow and installed
Nuxeo acceptance remain separate. See `e2e/README.md` for exact fixture scope.

`npm run verify:a11y-guards` tests the narrow finding exceptions, engine report
validation, exact language/theme/surface coverage, stale-report and process-failure
handling, sanitized assertions, exact document routes and the local request boundary.
The runner clears prior results before starting and always records a failing result
when browser startup, a scenario, or evidence validation fails.

The credential form belongs to Nuxeo. `npm run test:e2e:nuxeo` targets an
explicitly configured local server and audits its anonymous login page, then
checks authenticated runtime navigation, search and an existing readable
document. It uses a user-prepared Playwright authentication-state file; it does
not discover or submit credentials. Set these variable names without committing
the authentication file:

- `NUXEO_E2E_BASE_URL`: installed Web UI root.
- `NUXEO_E2E_API_URL`: Nuxeo context root.
- `NUXEO_E2E_STORAGE_STATE`: authentication-state file path, kept outside the checkout.
- `NUXEO_E2E_SESSION_STATE`: scoped OAuth session-state companion path, also outside the checkout. Ordinary Playwright storage state does not preserve the runtime's session storage. Use `npm run prepare:e2e:nuxeo` and sign in manually as described in `e2e/README.md`.
- `NUXEO_E2E_DOCUMENT_ID`: existing readable test document.
- `NUXEO_E2E_SEARCH_TERM`: optional search term; defaults to the document ID.

Only loopback HTTP(S) URLs are accepted. Use final URLs without redirects: this
initial harness rejects redirects, disables service workers and closes WebSockets.
Missing configuration, server, state or
authentication produces **PRECONDITION NOT MET** and a nonzero exit status,
with a report under `dist/verification/nuxeo/`. Live traces, screenshots and video
are disabled. The suite does not deploy a package or create/delete repository
content. The CI job runs for trusted same-repository PRs and manual runs;
untrusted fork PRs do not receive access to a runner's authentication state.

`CHROME_BIN` can select the installed Chromium-family browser. CI supplies it
from its Chrome setup step. RTL auditing does not establish complete Arabic
translation coverage, which is a separate workstream. Automated scans do not
replace assistive-technology or installed-browser acceptance.
