# A button or notice

One `defineContribution(<SLOT>_SLOT, { id, order, when, loadComponent })` entry. Slots of this
family: `DOCUMENT_ACTIONS`, `DOCUMENT_INFO_BAR` (a notice), `BLOB_ACTIONS`, `RESULTS_ACTIONS`,
`RESULTS_SELECTION_ACTIONS`, `TRASH_RESULTS_SELECTION_ACTIONS`, `COLLECTION_ACTIONS`,
`DOCUMENT_CREATE_ACTIONS`, `FILE_UPLOAD_ACTIONS`, `USER_MENU`, `SHELL_ACTIONS`,
`QUICK_SEARCH_ACTIONS`.

```sh
npm run new:contribution -- --slot DOCUMENT_ACTIONS --id acme.contract.approve --label Approve --order 15
```

The component gets `readonly context = input.required<Context>()`; the catalog lists each
context's properties. Rules that hold for every slot:

- Read the context; never mutate it. The host replaces it when its data changes.
- Act through the context's callbacks where it has them: `refreshDocument()`, `reportMessage(key,
fallback)`, `download()`, `create(type)`, `addFiles(files)`, `execute(command)`, `setBusy()`,
  `refresh()`, `navigate()`. They keep the host's disabled state, permission checks and lifecycle.
- A callback the host omits (`download`, `addFiles`, `refreshDocument`) means the action is not
  available there: disable the button.
- Call the server with Angular's `HttpClient` on the click, not at registration or in a
  constructor. The server decides permissions; `noEdit` and `when` only hide UI.
- Selection actions act on `selectedDocuments`; a query-wide action needs `queryScope`
  ([projections-and-exports.md](projections-and-exports.md)).

Examples: [acme.contract.approve.component.ts](../../examples/acme/custom/contributions/document-actions/acme.contract.approve.component.ts)
(report and refresh), [acme.selection.mark-reviewed.component.ts](../../examples/acme/custom/contributions/results-selection-actions/acme.selection.mark-reviewed.component.ts)
(busy state and refresh), [acme.contract.review-notice.component.ts](../../examples/acme/custom/contributions/document-info-bar/acme.contract.review-notice.component.ts)
(a notice), [acme.create.contract.component.ts](../../examples/acme/custom/contributions/document-create-actions/acme.create.contract.component.ts)
(the host's create flow).

Then `npm run verify`. Reference: [Register a compiled Angular contribution](../../app/extensions/README.md#register-a-compiled-angular-contribution),
[Document notices and commands](../../app/extensions/README.md#document-notices-and-commands),
[Results, creation and attachments](../../app/extensions/README.md#results-creation-and-attachments).
