# A tab on the document page

Slots `DOCUMENT_VIEWS_ITEMS` and `DOCUMENT_VIEWS_PAGES`, context `DocumentViewContext` (the
document, `noEdit`, `user`, `refreshDocument`, `reportMessage`).

```sh
npm run new:contribution -- --slot DOCUMENT_VIEWS_ITEMS --id acme.contract.terms --label Terms
```

`...defineDocumentView({ id, viewId, label, labelKey, icon, order, when, retain, loadComponent })`
registers the tab and its page. `viewId` is the navigation key: the main viewer binds the
selection to `?view=<viewId>`, so register at bootstrap for deep links to resolve. Narrow the tab
to a type with `when: nuxeoFilter({ type: 'Contract' })`.

Switching tabs destroys the previous page unless the definition sets `retain: true`; a retained
page implementing `GuardedView` (`canDeactivate(departure)`, `hasPendingChanges()`) can keep a
draft and veto tab switches and route changes. Removal from the registry or lost eligibility is
authoritative. To change a stock tab, name its id from the catalog's "Defaults" line in an
override, or register your own view with the same slot and id.

Example: [acme.contract.terms.component.ts](../../examples/acme/custom/contributions/document-views-items/acme.contract.terms.component.ts)
renders the Contract properties; the editing variant is
[examples/contract/contract-view.component.ts](../../examples/contract/contract-view.component.ts).

Then `npm run verify`. Reference: [Paired document views](../../app/extensions/README.md#paired-document-views),
[Editable view lifecycle](../../app/extensions/README.md#editable-view-lifecycle).
