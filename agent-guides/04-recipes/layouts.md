# Forms for a document type

Not a slot. `npm run new:layout` writes the shared fields and one component per mode:

```sh
npm run new:layout -- --type Contract --modes create,edit,view,metadata,import
```

Edit `custom/layouts/Contract/contract.fields.ts`: one entry per `schema:property` with `label`,
`labelKey`, `required`, `readOnly`, `min`, `max`, `maxLength`, `widget`; optional `sections`. The
server schema types and validates the values. The mode components, the dialog host, the import
draft, narrowing with `when` and the fallback for unknown types are in
[03-document-layouts.md](../03-document-layouts.md).

Example: [contract.fields.ts](../../examples/acme/custom/layouts/Contract/contract.fields.ts),
[invoice.fields.ts](../../examples/acme/custom/layouts/Invoice/invoice.fields.ts), and the ten
mode components under [layouts/](../../examples/acme/custom/layouts/Contract/contract.edit.layout.ts).
The types they expect are defined for a test server in
[examples/acme/nuxeo](../../examples/acme/nuxeo/OSGI-INF/acme-types.xml).

Then `npm run verify`.
