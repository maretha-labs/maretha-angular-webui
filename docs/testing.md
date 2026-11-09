# Testing and verification

## One command per audience

| You are               | Run                       | It proves                                                                            |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| customizing a release | `npm run verify`          | core untouched, lint, formatting, types, zone guards, slot catalog, unit tests       |
| contributing upstream | `npm run verify:upstream` | every check the public CI runs, in its order                                         |
| releasing             | `npm run verify:release`  | upstream, plus the identity and notices of the built archives, and the release files |

Each mode runs its checks in a fixed order, stops at the first failure, prints the failing
command and writes `dist/verification/verify-report.json`.
`node scripts/verify.mjs --list [--upstream|--release]` prints a mode's checks, and a test keeps
the upstream list equal to `.github/workflows/ci.yml`. What each failure means:
[the verify loop](../agent-guides/06-verify-loop.md). What each check proves:
[quality checks](quality-checks.md).

## The npm scripts

Build and run

- `start`, `preview`, `watch`, `build`, `build:prod`, `build:sourcemaps`: [build.md](build.md).
- `build:sdk`, `pack:sdk`: the SDK package. `package:nuxeo`: the Nuxeo package.

Static checks

- `lint` (`lint:fix` repairs): ESLint with `--max-warnings=0`, including the `custom/` boundary
  rule, the credential-default rule and the AG Grid Enterprise ban.
- `format:check` (`format` writes): Prettier over the repository.
- `typecheck`: the application and the spec projects.
- `verify:test-apps`: every test application's Angular templates compile.
- `verify:results-projection-template-context`: the projection template contract.

Unit tests and coverage

- `test`: Karma in watch mode; `test:ci`: one headless run.
- `test:coverage`, then `verify:coverage`: the complete suite with coverage bound to source
  hashes, compared with `contracts/coverage-baseline.json`. `update:coverage-baseline` records a
  higher floor and never a lower one; `verify:coverage-guard` tests the ratchet itself.

Customization zone and agent guides

- `new:contribution`, `new:layout`: the generators ([customizing.md](customizing.md#generate)).
- `verify:core-manifest`: the core files changed since `core.manifest.json`;
  `release:core-manifest` rewrites it (upstream changes only, as the last change).
- `verify:custom-guards`: the boundary rule, the generators, the manifest, the verify runner,
  the agent-file pointers. `verify:custom-scaffold`: a contribution per slot and a layout
  per mode compile and lint, and three planted defects fail. `verify:examples`: `examples/acme`
  in a fresh worktree, then planted defects.
- `verify:slot-catalog` (`render:slot-catalog` rewrites): the catalog matches the SDK and the
  contracts.

Translations

- `verify:i18n`: the catalogs and the reviewed source coverage; `verify:i18n-guards`: the
  guards' own tests; `i18n:inventory`: the inventory of translatable source text.
- `i18n:pseudo` generates the development pseudo-language; `test:i18n` runs the browser checks
  for every locale and both themes.

Browser suites

- `test:e2e:compiled-search`: the test-only compiled search with synthetic Nuxeo responses;
  `verify:compiled-search-production`: the fixture is absent from the production output.
- `test:a11y`: axe and IBM Equal Access scans and keyboard paths over local fixtures;
  `verify:a11y-guards`: the scanner exceptions and the local request boundary.
- `verify:transfer-contract`: PDF range requests, media teardown, downloads and ZIP polling;
  `verify:transfer-check-failures`: eight planted regressions must each fail;
  `measure:pdf-ranges`: an opt-in local measurement.
- `test:e2e:nuxeo`, `prepare:e2e:nuxeo`, `verify:nuxeo-state`: critical paths against an
  explicitly configured local Nuxeo with a user-prepared authentication state
  ([quality-checks.md](quality-checks.md#accessibility-and-local-nuxeo)).

SDK boundary, after `npm run pack:sdk` ([sdk-compatibility.md](sdk-compatibility.md))

- `verify:sdk-api` (`update:sdk-api` accepts a reviewed change): the public API report.
- `verify:sdk-ids` (`update:sdk-ids`): the contribution identities.
- `verify:sdk-consumer`: `examples/client-webui` installs the archive and builds in a temporary
  directory. `verify:sdk-upgrade`: a frozen client extension keeps its meaning from the baseline
  SDK in `contracts/sdk-baseline` to the candidate. `verify:sdk-check-failures`: those checks
  catch planted defects.

Polymer parity

- `verify:polymer-parity` (`render:polymer-parity` rewrites): the contribution map and the parity
  document; `inventory:polymer-slots` regenerates the inventory from a Web UI checkout.

Packaging and release

- `verify:nuxeo-package`: versions, deep-link routes and assembly.
- `verify:licenses`: production dependencies and vendored files against the allowlist and the
  [third-party inventory](third-party/README.md).
- `verify:release-identity`, `verify:release-artifacts`: the archives in `dist/` carry the
  version and the notices.
- `release:files`: the SDK archive and `core.manifest.json` copied to `dist/release/` with
  `sha256sums`, the files a release tag publishes and attests.
- `verify:public-tree`: nothing from the private `maintainers/` overlay is tracked.

## CI

`.github/workflows/ci.yml` runs on every pull request, on demand and on `v*` tags, on
GitHub-hosted runners with the Node version from `.nvmrc`, forks included:

| Job                                                            | What it runs                                                                                                                                                                             |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime checks                                                 | The static checks through the SDK upgrade rehearsal, in the order `npm run verify:upstream` uses                                                                                         |
| Compiled searches with synthetic Nuxeo responses               | `test:e2e:compiled-search` and the production exclusion guard                                                                                                                            |
| Accessibility scans and keyboard paths                         | `test:a11y`, its guards and, on pull requests, the theme comparison                                                                                                                      |
| Languages, Arabic direction and pseudo-language browser checks | `test:i18n`                                                                                                                                                                              |
| Release files and attestation                                  | On a `v*` tag only: `npm run verify:release`, then `dist/release/` (SDK archive, `core.manifest.json`, `sha256sums`) as the `release-files` artifact with a build-provenance attestation |

Alongside it, `codeql.yml` scans the TypeScript and JavaScript sources, the workflows and the
Java server module on pull requests, pushes to `main` and weekly, and `dependency-review.yml`
fails a pull request that adds a dependency with a known moderate-or-higher vulnerability or an
AG Grid or AG Charts Enterprise package. `contribution-gate.yml` evaluates every pull request
against the routes in [CONTRIBUTING.md](../CONTRIBUTING.md) and publishes the
`contribution-gate` check from the base branch's code; `scorecard.yml` runs OpenSSF Scorecard
weekly for the README badge. CI does not compile the Nuxeo server bundle: its Java tests run
inside `npm run package:nuxeo`, which runs before a server change merges. The local Nuxeo
harness under `e2e/nuxeo/` runs outside CI on a dedicated runner.

## Reports

Everything is written under `dist/verification/`, which CI keeps as a workflow artifact:
`verify-report.json` (the mode run), `examples.json`, `coverage.md` and `coverage.json`,
`a11y/summary.json` with the raw engine reports, `transfer-*.json`,
`compiled-search/production-exclusion.json`, `nuxeo/` for the local Nuxeo suite, and the SDK
consumer, upgrade and negative-check reports.

## Browsers

The unit tests and the browser suites need a Chromium-family browser. `CHROME_BIN` selects one;
without it, the accessibility runner uses the macOS Chrome when present, then Playwright's
installed Chromium. On a fresh machine run `npx playwright install chromium`; nothing downloads a
browser implicitly. The accessibility fixture serves on `127.0.0.1:4310`, and the browser suites
accept loopback HTTP(S) URLs only, with redirects rejected, service workers blocked and
WebSockets closed.
