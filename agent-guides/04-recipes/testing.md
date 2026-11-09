# Writing and running the specs

Every generated file has a spec; keep it and extend it. A spec renders the component once with
a context and asserts on the DOM and the callbacks.

```ts
const fixture = TestBed.createComponent(AcmeContractApproveComponent);
fixture.componentRef.setInput('context', {
  document: { type: 'Contract' },
  noEdit: false,
  reportMessage,
} as DocumentActionContext);
fixture.detectChanges();
fixture.nativeElement.querySelector('button').click();
expect(reportMessage).toHaveBeenCalledOnceWith('acme.contract.approved', 'Contract approved');
```

- Build the context from the catalog's property list; `jasmine.createSpy` for the callbacks;
  cast with `as Context` (or `as unknown as Context` for a partial object).
- A template that reads a property of a context field (`selectedDocuments.length`) needs that
  field in the spec: the generated spec passes `{}` and only checks the label.
- Layout specs stub the gateway with pending promises and spy on the host:
  `{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } }`,
  `{ provide: DOCUMENT_LAYOUT_HOST, useValue: host }`, and build the context with
  `documentLayoutContext({ documentType, mode, document | parentDocument })`. Import layouts
  provide `DOCUMENT_IMPORT_DRAFT`.
- Labels through the `webuiMessage` pipe render their fallback in a spec, so asserting the
  English text works without a catalog.
- Async actions: `await fixture.componentInstance.run()` and assert the call order of the spies.

Run one spec while iterating, then everything:

```sh
npx ng test --watch=false --browsers=ChromeHeadless --include='custom/**/*.spec.ts'
npm run verify
```

A failing spec under `custom/` is your component's test; fix the component or the expectation,
never delete the spec. Examples: [acme.contract.approve.component.spec.ts](../../examples/acme/custom/contributions/document-actions/acme.contract.approve.component.spec.ts),
[acme.selection.mark-reviewed.component.spec.ts](../../examples/acme/custom/contributions/results-selection-actions/acme.selection.mark-reviewed.component.spec.ts),
[contract.edit.layout.spec.ts](../../examples/acme/custom/layouts/Contract/contract.edit.layout.spec.ts),
[contract.import.layout.spec.ts](../../examples/acme/custom/layouts/Contract/contract.import.layout.spec.ts).
