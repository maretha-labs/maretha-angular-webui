# Maretha Angular Web UI

[![CI](https://github.com/maretha-labs/maretha-angular-webui/actions/workflows/ci.yml/badge.svg)](https://github.com/maretha-labs/maretha-angular-webui/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/badge/licence-Apache--2.0-blue.svg)](LICENSE)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/maretha-labs/maretha-angular-webui/badge)](https://scorecard.dev/viewer/?uri=github.com/maretha-labs/maretha-angular-webui)

An Angular 22 user interface for Nuxeo LTS 2025 that behaves like the stock Nuxeo Web UI.
Customize it in one writable zone, through the extension SDK `@maretha/webui-sdk` and with
instructions written for coding agents; a hash lock keeps the core untouched. Upgrade by merging
the next release tag.

## What it does

- Browsing, a dashboard, Quick Search and compiled searches (default search, Assets, Expired,
  Trash and administrator NXQL) with declared forms, result views, table columns and paired
  navigation; table and thumbnail listings with saved display settings.
- Document views and editors: metadata layouts, comments, contributors, history, versions and
  snapshot comparison, attachments, tags, permissions, publications, workflow tasks, clipboard,
  collections and favorites; renderers for images, video, audio, PDF, notes, picture books and
  3D models.
- Administration: users and groups, vocabularies, OAuth2 cloud clients, providers and accounts,
  audit, analytics, content management, retention rules and metadata policies.
- Four themes, seven language catalogs with right-to-left layout for Arabic, and accessibility
  scans (axe, IBM Equal Access) on every pull request.
- A server bundle for authenticated media playback and file and ZIP delivery, and the startup
  registration of the UI's public OAuth2 client.
- 26 named contribution slots, document layouts in five modes, results projections, and every
  default contribution of the Polymer Nuxeo Web UI mapped to its Angular id
  ([docs/polymer-parity.md](docs/polymer-parity.md)).

The [changelog](CHANGELOG.md) has the full list, the limitations and what is not there yet.

## Tested with

| Component           | Version                                                  |
| ------------------- | -------------------------------------------------------- |
| Nuxeo               | LTS 2025, target platform `[2025.0,2026.0)`              |
| Node                | 24.18.0 (`.nvmrc`); `engines` accepts 22.12+ or any 24.x |
| Angular             | 21.2                                                     |
| Server bundle build | JDK 21, Maven 3.9                                        |

## Quick start

Clone the release tag, build the Nuxeo package (Node, JDK 21 and Maven 3.9) and install it:

```sh
git clone --branch v1.0.0 https://github.com/maretha-labs/maretha-angular-webui.git
cd maretha-angular-webui
npm ci
npm run package:nuxeo
```

With Nuxeo stopped, run
`nuxeoctl mp-install dist/nuxeo/maretha-angular-webui-package-1.0.0.zip --accept=true`, set
`nuxeo.url` in `nuxeo.conf`, start Nuxeo and open `https://<host>/nuxeo/ng/`. Requirements,
configuration, upgrade and rollback: [nuxeo/README.md](nuxeo/README.md).

## Customize it with your agent

Keep your copy private: clone a release tag into a repository you own. Do not use GitHub's
**Fork** button for your copy: a fork of a public repository is always public. See
[docs/customizing.md](docs/customizing.md).

Point your coding agent at [AGENTS.md](AGENTS.md): it is the complete instruction set, and the
Claude, Gemini, Copilot and Cursor files only point to it. Three commands do the work:

```sh
npm run new:contribution -- --slot DOCUMENT_ACTIONS --id acme.contract.approve
npm run new:layout -- --type Contract --modes view,edit
npm run verify
```

The [slot catalog](agent-guides/02-slot-catalog.md) names every slot, the
[recipes](agent-guides/04-recipes/README.md) walk through each task, and
[examples/acme](examples/acme/README.md) is a complete customization of every slot and layout
mode.

## Deploy

- Inside Nuxeo, as a package served at `/nuxeo/ng/`: [nuxeo/README.md](nuxeo/README.md).
- On any web server, built with npm: [docs/standalone.md](docs/standalone.md). Experimental and
  not qualified; the Nuxeo package is the supported deployment.

## Build and test

- [docs/build.md](docs/build.md): prerequisites, development server, production build, SDK
  and Nuxeo package.
- [docs/testing.md](docs/testing.md): every check, the three verification modes, the CI jobs
  and where the reports are.
- [docs/releasing.md](docs/releasing.md): how a release is cut.

## Security notes

- Release files carry GitHub artifact attestations. Check a download with
  `gh attestation verify <file> --repo maretha-labs/maretha-angular-webui`.
- Media playback and file delivery work only over HTTPS on the same origin as Nuxeo. A UI
  hosted on another origin needs a CORS contribution with credentials off and loses those
  paths.
- Further trade-offs, and how to report a vulnerability: [SECURITY.md](SECURITY.md).

## Project

- [CONTRIBUTING.md](CONTRIBUTING.md): how to send a change; product changes need a confirmed
  issue.
- [GOVERNANCE.md](GOVERNANCE.md): who decides and how.
- [SUPPORT.md](SUPPORT.md): questions, bugs and paid help.
- [ACCESSIBILITY.md](ACCESSIBILITY.md): what is tested and how to report a barrier.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): how everyone taking part behaves.

## Licence and trademarks

Apache-2.0 ([LICENSE](LICENSE)); third-party notices in [NOTICE](NOTICE) and
[docs/third-party](docs/third-party/README.md).

Nuxeo is a trademark of Hyland Software, Inc. Maretha is a Hyland partner but otherwise
unaffiliated.
