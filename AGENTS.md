# Agent instructions

Maretha Angular Web UI: an Angular 21 user interface for Nuxeo LTS 2025 with the extension SDK
`@maretha/webui-sdk`. This file is the complete instruction set for coding agents here; the
tool-specific files only point to it. Decide first which of the two jobs you are doing.

## Customizing a release

Work in your copy of a release tag; upstream never sees it. The customization zone is the only
writable area. Everything else is core, locked by `core.manifest.json`:

<!-- customer-paths -->

- `custom/`: contributions, layouts, labels, theme, owner prefix, dependency allowlist
- `migration/mapping.json`: Polymer-to-Angular mapping of an existing customization
- `migration/polymer-source/`: the Polymer sources being migrated

<!-- /customer-paths -->

1. Find the slot in [the slot catalog](agent-guides/02-slot-catalog.md), then
   `npm run new:contribution -- --slot <SLOT> --id <prefix>.<name>`. For a document type's
   forms: `npm run new:layout -- --type <Type> --modes view,edit`.
2. Edit the generated files under `custom/`. Keep the marker comments in `custom/index.ts`.
3. `npm run verify`: core untouched, lint, format, types, zone guards, slot catalog, unit tests;
   report in `dist/verification/verify-report.json`. Report completion only when it is green.

Ids and selectors start with the prefix in `custom/owner.json`, never `maretha`. `custom/`
imports only its own files, `@maretha/webui-sdk` and npm packages, never core files. Keep the
generated specs. Never run
`npm run release:core-manifest`, edit `core.manifest.json` or touch a file outside the zone;
when a task needs that, stop and say so: the change belongs upstream.

Deploy: [nuxeo/README.md](nuxeo/README.md) (Nuxeo package) or
[docs/standalone.md](docs/standalone.md) (any web server). Upgrade: merge the next release
tag, then `npm run verify`.

## Contributing upstream

You change core in a fork for a pull request. Any tracked file may change; `custom/` stays the
empty starter and examples go under `examples/`.

1. Make the change with its tests. Product changes need a confirmed issue (`CONTRIBUTING.md`).
2. `npm run verify:upstream`: every public CI check, in CI order, stopping at the first failure.
3. Stage files by name, then `npm run release:core-manifest` last; commit `core.manifest.json`
   with them. CI recomputes it. Two core pull requests: rebase, regenerate, commit.
4. Sign off each commit (`git commit -s`); Conventional Commits title matching the route.

## Where each question is answered

When documents disagree: this file, then `agent-guides/`, then the SDK README, then `docs/`.
The code and the checks decide behaviour; the documents describe it.

- What may I change, and how is it enforced: [01-boundaries.md](agent-guides/01-boundaries.md).
- Which slot, context, command, default ids: [02-slot-catalog.md](agent-guides/02-slot-catalog.md).
- Forms of a document type, the five modes: [03-document-layouts.md](agent-guides/03-document-layouts.md).
- Each task step by step, with its file in the ACME example: [recipes](agent-guides/04-recipes/README.md).
- Moving a Polymer customization: [05-polymer-migration.md](agent-guides/05-polymer-migration.md).
- How do I check my work, what a failure means: [06-verify-loop.md](agent-guides/06-verify-loop.md).
- What I must never do: [07-forbidden.md](agent-guides/07-forbidden.md).
- Prompts to hand an agent: [prompts](agent-guides/prompts/README.md).
- SDK API, registration, overrides, layouts, projections: [SDK README](app/extensions/README.md),
  [API surface](contracts/webui-sdk.api.md).
- Which Polymer default maps to which Angular id: [Polymer parity](docs/polymer-parity.md).
- A search backed by a Nuxeo page provider: [Compiled searches](docs/compiled-searches.md).
- Which checks exist and what each proves: [Quality checks](docs/quality-checks.md).
- A complete customization: [acme](examples/acme/README.md); a separate SDK consumer app:
  [client-webui](examples/client-webui/README.md).
