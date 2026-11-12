# Customizing a release

The human version of [AGENTS.md](../AGENTS.md): what you may change, how, and how the repository
checks it.

## Keep your copy private

Start from a release tag in a repository you own. Do not use GitHub's **Fork** button for
your copy: a fork of a public repository is always public, and GitHub shares Git data between
a fork and the repository it came from.

```sh
git clone --branch v2.0.0 https://github.com/maretha-labs/maretha-angular-webui.git my-webui
cd my-webui
git switch -c main
git remote rename origin upstream
git remote add origin <your private repository URL>
git push -u origin main
```

Contributing a fix back upstream is different: that uses a fork and a pull request. See
[CONTRIBUTING.md](../CONTRIBUTING.md).

## The customization zone

Every tracked file is in the customization zone or in core. The zone:

- `custom/`: contributions, layouts, labels, theme, the owner prefix and the dependency
  allowlist;
- `migration/mapping.json`: the Polymer-to-Angular mapping of an existing customization;
- `migration/polymer-source/`: the Polymer sources being migrated.

Core is everything else: `app/`, `styles/`, `assets/`, `nuxeo/`, `scripts/`, `e2e/`, the
configuration files and the documentation. `core.manifest.json` records the SHA-256 of every core
file at the release, except `package.json`, `package-lock.json` and `.github/` (dependency and
workflow updates need no regeneration), and `npm run verify` lists every core file that was changed,
removed or added, untracked files included. A core edit is lost at the next upgrade: the merge
conflicts on it or reverts it, and `npm run verify` fails until it is undone. What cannot be done
inside the zone is a gap to report upstream with the use case, not a reason to patch core. Details
and the rules the lint enforces: [agent-guides/01-boundaries.md](../agent-guides/01-boundaries.md).

## Generate

Set the owner prefix first in `custom/owner.json` (`{ "prefix": "custom" }` in a fresh checkout):
lowercase letters, digits and hyphens, not `maretha`. Contribution ids start with `<prefix>.` and
element selectors with `<prefix>-`; the generators and the lint rules enforce both.

```sh
npm run new:contribution -- --slot DOCUMENT_ACTIONS --id acme.contract.approve --label Approve --order 100
npm run new:layout -- --type Contract --modes create,edit,view,metadata,import
```

The first writes `custom/contributions/<slot>/<id>.component.ts` with its spec; the second writes
`custom/layouts/Contract/contract.fields.ts`, one `contract.<mode>.layout.ts` with its spec per
mode, and registers them above the defaults for that type. Both insert the registration into
`custom/index.ts` above its marker comments (`<custom:imports>`, `<custom:contributions>`,
`<custom:layouts>`): keep the markers, and keep the generated specs. Then edit the generated
files.

- Which slot, with which context and default ids:
  [the slot catalog](../agent-guides/02-slot-catalog.md).
- The five layout modes and the fields:
  [03-document-layouts.md](../agent-guides/03-document-layouts.md).
- One page per task, each pointing at the file in `examples/acme` that does it:
  [the recipes](../agent-guides/04-recipes/README.md).
- A theme, labels in another language, a grid card, a visibility rule, an override of a default
  contribution: all of these are files under `custom/`, written the same way.

## Check

```sh
npm run verify
```

It proves core untouched, then lints, formats, type-checks and tests `custom/`, checks the zone
guards and the slot catalog, and writes `dist/verification/verify-report.json`. Read the first
failure, fix it, run again; report completion only on a green run. The failure messages and what
each one means: [agent-guides/06-verify-loop.md](../agent-guides/06-verify-loop.md). While
iterating on one component, run its spec alone:
`npx ng test --watch=false --browsers=ChromeHeadless --include='custom/**/*.spec.ts'`.

## Dependencies

`custom/` imports only its own files, `@maretha/webui-sdk` and npm packages, never core files.
Installing a package changes `package.json` and `package-lock.json`, which are core, so
`npm run verify` reports them. Treat a new dependency as a request upstream, or as a core change
you knowingly re-apply at every upgrade. `ag-grid-enterprise`, `@ag-grid-enterprise/*` and
`ag-charts-enterprise` are rejected everywhere: the UI uses the MIT-licensed Community packages.

## Deployment-time configuration

Settings that differ between environments are not customizations and never go into the source
tree. The UI reads `env.js` at startup: `nuxeoUrl`, `webAppUrl` (the UI URL followed by `#`),
`authClientId`, `applicationId`, `dashboardStatisticsDocumentTypes` and `addons`. Edit the
deployed copy: `nxserver/nuxeo.war/ng/env.js` for the Nuxeo package (a reinstall replaces it) or
the `env.js` next to the deployed `index.html` for a standalone build. On the Nuxeo side,
`nuxeo.url` and `maretha.webui.url` in `nuxeo.conf` tell the server bundle where the UI is. The
source `env.js` and `environments/` are core: changing them fails `npm run verify`.

Details: [nuxeo/README.md](../nuxeo/README.md#configure) and [standalone.md](standalone.md).

## The examples

- [examples/acme](../examples/acme/README.md) is a copied customization: a complete `custom/`
  for the fictional ACME, one contribution per slot, two document types in every layout
  mode, labels, a theme, overrides and a spec per component. Replace your `custom/` with it to
  start from a working zone, then rename the prefix and delete what you do not need.
- [examples/client-webui](../examples/client-webui/README.md) is a separate SDK consumer: its own
  Angular application that installs the packed `@maretha/webui-sdk` and nothing else. It is for
  building another application on the SDK, not for customizing this one.
- [examples/contract](../examples/contract/README.md) is SDK extension source for one guarded
  document page with its Nuxeo type fixture; the application registers it in development.

## Migrating a Polymer customization

Drop the Polymer sources into `migration/polymer-source/`, write the mapping in
`migration/mapping.json` and follow
[05-polymer-migration.md](../agent-guides/05-polymer-migration.md). Every default contribution
of the Polymer Web UI has an Angular id in [polymer-parity.md](polymer-parity.md), so a Polymer
override that named one targets that id. Nuxeo Studio translations move as well: the UI reads no
`ui/i18n` catalog from the server, so a project's document type, field and vocabulary labels go
into `custom/i18n/` ([recipe](../agent-guides/04-recipes/i18n.md#nuxeo-studio-translations)). No
inventory tool for an existing Polymer customization ships with this release.

## Upgrade to a new release

```sh
git fetch upstream --tags
git merge v1.0.1
npm run verify
```

The merge touches core only; the zone is yours. `npm run verify` fails, naming the files, if a
merge left a change outside the customization zone. The SDK release notes
([app/extensions/CHANGELOG.md](../app/extensions/CHANGELOG.md)) list any contract change your
contributions must follow.

## Your agent

[AGENTS.md](../AGENTS.md) is the complete instruction set; the Claude, Gemini, Copilot and Cursor
files only point to it. [agent-guides/prompts](../agent-guides/prompts/README.md) holds prompts
to hand an agent for the common tasks, each with its acceptance line.
