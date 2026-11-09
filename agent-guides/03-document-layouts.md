# Document layouts

The forms of one document type, in five modes. A layout is not a slot contribution: it registers
through `provideDocumentLayoutExtensions()` and the host picks it by type and mode.

| Mode       | Where it renders                                            | Host object             |
| ---------- | ----------------------------------------------------------- | ----------------------- |
| `create`   | The create dialog, after the type is chosen                 | `DOCUMENT_LAYOUT_HOST`  |
| `edit`     | The edit dialog of an existing document                     | `DOCUMENT_LAYOUT_HOST`  |
| `view`     | The document page, inline                                   | none                    |
| `metadata` | The metadata panel, inline or in a dialog                   | optional                |
| `import`   | The import dialog, once per dropped file, before any upload | `DOCUMENT_IMPORT_DRAFT` |

## Generate

```sh
npm run new:layout -- --type Contract --modes create,edit,view,metadata,import
```

It writes `custom/layouts/Contract/contract.fields.ts` (the shared `DocumentLayout`), one
`contract.<mode>.layout.ts` component with its spec per mode, and the registrations in
`custom/index.ts` at `priority: 10`, which outranks the defaults (priority 0) for the same type
and mode. A later run for another mode reuses the fields file. Types are Nuxeo type names
(`Contract`, not `contract`).

## The fields

`DocumentLayout.fields` lists properties as `schema:name`. The server's type schema
(`/api/v1/config/types/{type}`) decides each property's type and validation; a field adds
presentation only: `label` and `labelKey` ([i18n](04-recipes/i18n.md)), `required`, `readOnly`,
`min`, `max`, `maxLength`, and `widget`. `widget: 'reference'` and `'directory'` (with
`directoryName`) need a gateway that implements `resolveReference`; the bundled application
gateway does. A trusted Angular widget registers with `provideDocumentLayoutWidget({ id, component })`
and receives `props: WidgetProps`. `sections` groups properties under headings with `columns`
1 to 3; `preserveSchemaConstraints: true` stops a field from weakening a mandatory or read-only
schema constraint. Strings, booleans, integers, doubles, dates, complex values, lists and blobs
render natively; structured values round-trip as JSON.

Example: [contract.fields.ts](../examples/acme/custom/layouts/Contract/contract.fields.ts),
[invoice.fields.ts](../examples/acme/custom/layouts/Invoice/invoice.fields.ts).

## The components

Each mode component renders `<nx-schema-layout [layout] mode="...">` with the id it is given and
declares `@Input() layoutContext: DocumentLayoutContext | undefined` (dialog hosts assign inputs
directly, so this is a decorator input, not a signal). `DocumentLayoutContext` carries
`documentType`, `mode`, `document`, `parentDocument` and `noEdit`.

- `create` and `edit` inject `DOCUMENT_LAYOUT_HOST` with `{ optional: true }`: `complete([saved])`
  reports the saved documents, refreshes the listing and closes the dialog; `cancel()` closes it.
  The create template derives the Nuxeo document name from `dc:title`.
- `view` and `metadata` render inline; the metadata template shows a Close button only when a
  dialog hosts it.
- `import` injects `DOCUMENT_IMPORT_DRAFT`: `file`, `properties` (a snapshot; `dc:title` starts
  as the file name), `update(properties)` and `setValid(valid)`. It renders with
  `[draftOnly]="true"` and `[initialValues]="draft.properties"` and never saves: the import dialog
  owns the files, the upload and the creation, and creates nothing while a layout reports invalid
  values.

Saving needs fresh `WriteProperties` and uses the document's change token; a conflict keeps the
draft. The schema component implements `GuardedView`; a wrapper that embeds it forwards
`canDeactivate()` and `hasPendingChanges()`, as
[the Contract example](../examples/contract/contract-view.component.ts) does.

Example: [contract.create.layout.ts](../examples/acme/custom/layouts/Contract/contract.create.layout.ts),
[contract.import.layout.ts](../examples/acme/custom/layouts/Contract/contract.import.layout.ts)
and their specs.

## Narrowing and replacing

A layout definition takes `when: (context: DocumentLayoutContext) => boolean` to narrow by facet
or state, and `priority` to order several entries for one type. The registry matches the
lowercased type and the mode, then priority, then `when`. A `DocumentLayoutOverride`
(`{ id, disabled | priority }`) hides or reorders an existing layout by id. Types with no
layout are served in `metadata` mode by the wildcard default, which lists the server schema's
properties; the stock `no-layout` types are excluded
([polymer-parity.md](../docs/polymer-parity.md#define-a-layout-for-a-custom-type)).

## Not layouts

- Fields added to the stock create, edit and metadata forms of existing types:
  `provideDocumentFieldExtensions({ id, schema, documentTypes, modes, fields })`. The document must
  carry the schema; nothing is fabricated.
- List and grid cards and table cells: result projections
  ([projections-and-exports.md](04-recipes/projections-and-exports.md)).
- Workflow task forms: `provideWorkflowLayout({ id, taskKey, component, priority })`
  ([polymer-parity.md](../docs/polymer-parity.md#workflow-task-layouts)).

Reference: [Schema-bound scalar layouts](../app/extensions/README.md#schema-bound-scalar-layouts),
[Custom extensions](../app/extensions/README.md#custom-extensions).
