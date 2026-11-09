# Changelog

Notable changes to this project, in the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
format. Versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and are
released as tags `v<version>` on `main`. The SDK package `@maretha/webui-sdk` carries the same
version; its own notes are in [app/extensions/CHANGELOG.md](app/extensions/CHANGELOG.md).

## [1.0.0] - 2026-11-09

First release.

### Added

- An Angular 21 user interface for Nuxeo LTS 2025, installed as a Nuxeo package that serves it
  at `/nuxeo/ng/` ([nuxeo/README.md](nuxeo/README.md)) or built with npm and hosted on any web
  server ([docs/standalone.md](docs/standalone.md)).
- Browsing, a dashboard, quick search and compiled searches (default search, Assets, Expired,
  Trash and administrator NXQL) with declared forms, result views, table columns and paired
  navigation ([docs/compiled-searches.md](docs/compiled-searches.md)); table and thumbnail
  listings with saved display settings ([docs/document-listing-ux.md](docs/document-listing-ux.md)).
- Document views and editors: metadata layouts, comments, contributors, history, versions and
  snapshot comparison, attachments, tags, permissions, publications, workflow tasks, clipboard,
  collections and favorites; renderers for images, video, audio, PDF, notes, picture books and
  3D models ([docs/dam-metadata-layouts.md](docs/dam-metadata-layouts.md),
  [docs/pdf-range-loading.md](docs/pdf-range-loading.md)).
- Administration: users and groups, vocabularies, OAuth2 cloud clients, providers and
  accounts, audit, analytics, content management, retention rules and metadata policies.
- A server bundle with authenticated media, file and ZIP delivery
  ([docs/blob-delivery.md](docs/blob-delivery.md)) and the startup registration of the UI's
  public OAuth2 client.
- Four themes (default, light, dark, kawaii), seven language catalogs (Arabic, English,
  Spanish, French, Italian, Portuguese, Romanian) with right-to-left layout for Arabic, and
  accessibility scans (axe, IBM Equal Access) in CI.
- The extension SDK `@maretha/webui-sdk`: named contribution slots in 24 families with
  connected hosts, a contribution registry, results projections and a compatibility report
  ([docs/sdk-compatibility.md](docs/sdk-compatibility.md)); every Polymer Nuxeo Web UI default
  contribution mapped to its Angular id or recorded as a gap
  ([docs/polymer-parity.md](docs/polymer-parity.md)).
- A customization zone (`custom/`) with generators (`npm run new:contribution`,
  `npm run new:layout`) and a hash-locked core (`core.manifest.json`,
  `npm run verify:core-manifest`) that keeps customizations apart from upstream code.
- Instructions for coding agents: `AGENTS.md` with one-line pointers for Claude, Gemini,
  Copilot and Cursor, and `agent-guides/` with the boundaries, a slot catalog generated from
  the SDK and the contracts, the verify loop and the list of things never to do.
- Reproducible packaging: the Nuxeo package is assembled in Node and two runs over one build
  are byte-identical; LICENSE and NOTICE ship in the package and in both bundles; a third-party
  inventory ([docs/third-party](docs/third-party/README.md)) and `npm run verify:licenses`
  cover the shipped components.
- Three verification modes with one report: `npm run verify` for a customized release,
  `npm run verify:upstream` for a contribution (kept equal to the public CI by a test) and
  `npm run verify:release` for a release ([docs/quality-checks.md](docs/quality-checks.md)).

### Compatibility

Tested with:

- Nuxeo LTS 2025, target platform `[2025.0,2026.0)`.
- Node 24.18.0 (`.nvmrc`; `engines` accepts Node 22.12 and later 22.x, or 24.x) and Angular 21.2.
- JDK 21 and Maven 3.9 to build the server bundle.

### Limitations

- Media playback and file and ZIP delivery work only over HTTPS on the same origin as Nuxeo;
  the rest of the UI also works over HTTP ([nuxeo/README.md](nuxeo/README.md)).
- Several Nuxeo nodes need a shared key-value store with TTL and compare-and-set for delivery
  grants ([docs/blob-delivery.md](docs/blob-delivery.md)).
- Hosting the UI outside Nuxeo ([docs/standalone.md](docs/standalone.md)) is experimental and not
  qualified; the Nuxeo package is the supported deployment.
- The UI reads no translation catalog from the server (`ui/i18n/messages*.json`): the labels a
  Nuxeo Studio project adds (document types, fields, vocabularies) are copied into `custom/i18n/`
  ([agent-guides/04-recipes/i18n.md](agent-guides/04-recipes/i18n.md#nuxeo-studio-translations)).

### Not yet

- An inventory tool for existing Polymer Web UI customizations.
- Scripted browser behaviour suites beyond the accessibility, language and compiled-search
  checks that CI runs.
- A published npm package for the verification commands.
- Automated quality checks for the review agent.
- Isolated execution workers for the automated pull-request review.
- A Nuxeo Marketplace listing.

[1.0.0]: https://github.com/maretha-labs/maretha-angular-webui/releases/tag/v1.0.0
