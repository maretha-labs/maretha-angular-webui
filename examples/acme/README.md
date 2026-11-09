# ACME example customization

ACME is fictional. `custom/` here is a complete customization zone for a release of
this UI: one contribution per slot (all 26), `Contract` and `Invoice` forms in every layout
mode, labels in English and French, a theme, a grid card, visibility filters and overrides, and
a spec per component. Each recipe in [agent-guides/04-recipes](../../agent-guides/04-recipes/README.md)
links the file here that does what it describes.

The generators wrote the tree (`npm run new:contribution` for each slot, `npm run new:layout`
for both types); the `when` predicates, the visibility rule, the overrides, the catalogs and
the projection were added by hand. Components keep server calls as comments at the point where
an `HttpClient` request belongs: the example proves the customization zone end to end, not a
business process.

## Use it as a starting point

In a private copy of a release tag:

```sh
rm -rf custom && cp -R examples/acme/custom custom
npm run verify
```

Then rename the prefix in `custom/owner.json` (ids and selectors follow it), delete what you do
not need and keep the specs. `custom/` is the only writable zone
([01-boundaries.md](../../agent-guides/01-boundaries.md)).

## What the server must have

The layouts and the filters expect two document types extending `File`:

| Type       | Schema (prefix) | Properties                                                                          |
| ---------- | --------------- | ----------------------------------------------------------------------------------- |
| `Contract` | `contract`      | `counterparty` string, `amount` double, `effectiveDate` date, `active` boolean      |
| `Invoice`  | `invoice`       | `number` string, `amount` double, `dueDate` date, `paid` boolean, `contract` string |

[nuxeo/](nuxeo/OSGI-INF/acme-types.xml) defines both for a test server as an OSGi bundle. Build
and install it from the repository root:

```sh
jar cfm /tmp/acme-types.jar examples/acme/nuxeo/META-INF/MANIFEST.MF -C examples/acme/nuxeo OSGI-INF -C examples/acme/nuxeo schemas
```

Copy the jar to the server's `nxserver/bundles/` and restart it. `Contract` is the same type as
in [examples/contract](../contract/README.md); install one of the two fixtures, not both. Both
types become creatable in Workspaces and Folders. No credentials or hosts are part of the
example.

## How it is verified

`npm run verify:examples` (part of `npm run verify:upstream` and the public CI) adds a worktree of
`HEAD`, replaces its `custom/` with this directory and requires: every slot and layout mode
covered with a file and a spec; every `maretha.*` id in `index.ts` present in the slot
catalog; lint as `custom/` with the `acme` prefix; strict template compilation; green specs;
and `core.manifest.json` unchanged. It then plants a missing spec, a template error and a file
outside `custom/`, each of which must fail.

## Files

- [custom/index.ts](custom/index.ts): registrations, filters, the named rule, overrides, the
  catalogs, the projection.
- [custom/contributions/](custom/contributions/document-actions/acme.contract.approve.component.ts):
  one directory per slot, `<id>.component.ts` with its spec (the theme is `<id>.theme.ts`).
- [custom/layouts/](custom/layouts/Contract/contract.fields.ts): `Contract/` and `Invoice/`,
  shared fields plus a component and spec per mode.
- [custom/projections/](custom/projections/acme.contract-card.component.ts): the grid card.
- [custom/i18n/](custom/i18n/en.json): `en.json`, `fr.json`.
- [migration/mapping.json](migration/mapping.json): the mapping file a Polymer migration keeps
  ([05-polymer-migration.md](../../agent-guides/05-polymer-migration.md)).
