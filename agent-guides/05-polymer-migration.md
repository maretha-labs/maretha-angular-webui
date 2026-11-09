# Polymer migration

Moving an existing Nuxeo Web UI (Polymer) customization into `custom/`. The migration is manual:
no inventory tool for an existing Polymer customization ships. `npm run inventory:polymer-slots` inventories the
_stock_ Web UI for the parity contracts and takes a Web UI source checkout, not a customization.

## 1. Inventory the customization

Copy the Polymer sources into the drop zone `migration/polymer-source/` (writable; nothing builds
from it). Then list every slot contribution:

```sh
grep -rn "nuxeo-slot-content" migration/polymer-source | sort
```

Each `<nuxeo-slot-content name="..." slot="..." order="...">` with its `<template>` is one
row of the mapping. Add the non-slot resources: per-type layouts
(`nuxeo-<type>-<mode>-layout.html`), search forms and results (`search/<name>/`), workflow task
layouts, themes and custom elements.

## 2. Map each row

| Polymer                                                              | Angular                                                                                                              |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `slot="DOCUMENT_ACTIONS"`                                            | `DOCUMENT_ACTIONS_SLOT` in `defineContribution(...)`; every slot name is in [02-slot-catalog.md](02-slot-catalog.md) |
| `name="acmeApprove"`                                                 | `id: '<prefix>.contract.approve'`                                                                                    |
| `order="10"`                                                         | `order: 10`                                                                                                          |
| `<nuxeo-filter type="Contract" permission="Write" expression="...">` | `when: nuxeoFilter({ type: 'Contract', permission: 'Write', expression: (document, user, filters) => ... })`         |
| `disabled` on a stock contribution                                   | `overrides: [{ slot, id: 'maretha.<...>', disabled: true }]`; the id from the catalog's "Defaults" line              |
| `nuxeo-<type>-<mode>-layout.html`                                    | `npm run new:layout -- --type <Type> --modes <mode>` ([03-document-layouts.md](03-document-layouts.md))              |
| `search/<name>/*-search-form.html`                                   | A drawer page or a routed page whose component queries the page provider; no form registry exists                    |
| `nuxeo-<task>-layout.html`                                           | `provideWorkflowLayout({ id, taskKey, component, priority })`                                                        |
| A theme                                                              | `npm run new:contribution -- --slot THEMES`; the tokens keep their `--nuxeo-*` names                                 |
| A custom element                                                     | An Angular component under `custom/`, registered as one of the above                                                 |
| A stock contribution the customization replaced                      | A contribution with the same slot and id, at a higher `priority`                                                     |

Polymer's string `expression` referenced `this.*` helpers; the typed function receives them as
`filters` (`isTrashed`, `hasFacet`, `hasPermission` and the rest of `NUXEO_FILTERS`). Elements
read `document`, `user` and the slot model; the Angular context of each slot lists the same data
by name in the catalog. The default ids each Polymer stock contribution maps to are in
[polymer-parity.md](../docs/polymer-parity.md).

## 3. Record the mapping

`migration/mapping.json` is writable and documents the migration next to the code. Suggested
shape, one entry per Polymer resource:

```json
{
  "version": 1,
  "source": "migration/polymer-source",
  "entries": [
    {
      "polymer": {
        "file": "elements/acme-approve.html",
        "slot": "DOCUMENT_ACTIONS",
        "name": "acmeApprove"
      },
      "angular": {
        "slot": "DOCUMENT_ACTIONS",
        "id": "acme.contract.approve",
        "file": "custom/contributions/document-actions/acme.contract.approve.component.ts"
      },
      "status": "ported"
    }
  ]
}
```

`status` is `ported`, `pending` or `waived` (with a `note`). Example:
[examples/acme/migration/mapping.json](../examples/acme/migration/mapping.json).

## 4. Port, one row at a time

Generate the target with `npm run new:contribution` or `npm run new:layout`, move the template's
markup into the component, replace Polymer bindings with the context properties, keep the spec,
run `npm run verify`. Stock behaviour you relied on is a default contribution: disable, reorder or
replace it by id instead of copying it.

## What does not port

Polymer elements do not run in the Angular UI. Search-form layouts have no registry
([guidance](../docs/polymer-parity.md#guidance)). Server contributions (page providers, schemas,
types, Studio configuration) need no UI migration. Studio translations do: the UI reads no catalog
from the server, so the project's labels move into `custom/i18n/`
([recipe](04-recipes/i18n.md#nuxeo-studio-translations)).
