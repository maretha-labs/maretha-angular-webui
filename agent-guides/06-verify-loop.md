# The verify loop

One command per task. Each runs its checks in a fixed order, stops at the first failure,
prints the failing command and the files it named, and writes
`dist/verification/verify-report.json`.

| You are               | Run                       | It proves                                                                            |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------ |
| customizing a release | `npm run verify`          | core untouched, lint, formatting, types, zone guards, slot catalog, unit tests       |
| contributing upstream | `npm run verify:upstream` | every check the public CI runs, in its order                                         |
| releasing             | `npm run verify:release`  | upstream, plus the identity and notices of the built archives, and the release files |

## Prerequisites

Node from `.nvmrc` (`nvm use`), Git, and a Chromium-family browser for the unit tests
(`CHROME_BIN` selects one; CI sets it). `npm ci` once per checkout.

## The customization loop

1. Generate with `npm run new:contribution` or `npm run new:layout`, or edit under `custom/`.
2. `npm run verify`.
3. Read the first failure, fix it, run again. Report completion only on a green run.

What a failure means:

- `Core files differ from core.manifest.json (<version>)`, then `changed:`, `removed:` or
  `added:` lines: a file outside the zone changed. Revert it (`git checkout -- <file>`; delete
  an added file). Never regenerate the manifest to make this pass.
- `maretha/custom-boundaries`: an import outside the allowed list. Use the SDK API, or see the
  dependency note in [01-boundaries.md](01-boundaries.md).
- `@angular-eslint/component-selector` or `directive-selector`: the selector does not start
  with the owner prefix.
- `--id must be "<prefix>." followed by ...`: the generator rejected the id.
- `custom/index.ts already registers <id>` or `Refusing to overwrite ...`: choose another id, or
  edit the existing file instead of generating again.
- Prettier: `npm run format` writes the formatting; the checks only read.
- A failing spec under `custom/`: the component's own test. The generated spec renders the
  component once with an empty context; extend it rather than deleting it.
- `agent-guides/02-slot-catalog.md is stale`: the SDK or a contract changed, which is core. In
  a customization this follows a manifest failure; an upstream change runs `npm run render:slot-catalog`.

While iterating on one component, run its spec alone:
`npx ng test --watch=false --browsers=ChromeHeadless --include='custom/**/*.spec.ts'`.

## The upstream loop

`npm run verify:upstream` runs the public CI list: the customization checks, then the test
applications' templates, the projection template contract, translations and their guards, the
coverage guards, the generated-code proofs, the example customization in a fresh worktree
(`npm run verify:examples`), the Polymer parity contracts, the Nuxeo package
assembly, unit tests with coverage and the ratchet, transfer budgets, the production build, the
`--ui-only` package, licences, the SDK pack with its identity, API, identity and consumer
checks, the compiled-search, accessibility and language browser suites, and the public-tree
guard. Several checks first prove that they catch a planted defect; a passing run that proved
nothing is a failure.

Then stage your files by name and run `npm run release:core-manifest` as the last change;
commit `core.manifest.json` with them. CI recomputes it and fails on any difference. A
hand-edited manifest fails the same way.

## The report

`dist/verification/verify-report.json`:

```json
{
  "mode": "customization",
  "startedAt": "...",
  "finishedAt": "...",
  "node": "v24.18.0",
  "versions": { "app": "2.0.0", "sdk": "2.0.0", "manifest": "2.0.0" },
  "tree": { "commit": "<sha>", "dirty": true, "fingerprint": "<sha256>" },
  "checks": [{ "id": "core-manifest", "command": "...", "status": "pass", "durationMs": 0 }]
}
```

`status` is `pass`, `fail` or `not-run` (with a `reason`: a later check after a failure, or a
check that needs CI-only input such as a pull request base commit). `fingerprint` hashes the
commit and every uncommitted change, so two reports from the same tree compare equal. CI keeps
`dist/verification/` as a workflow artifact.
