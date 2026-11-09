### Define a layout for a custom type

Types without a pinned resource (Studio and add-on types, whatever their names) get no view, create, edit or import layout and are served in `metadata` mode by the wildcard layout `default.document-layout.any.metadata` (`FALLBACK_METADATA_LAYOUT` in `default-document-layouts.ts`). It mounts `DefaultDocumentMetadataLayoutComponent`, which lists the document's properties from the server schema (`/api/v1/config/types/{type}`), grouped by schema in server order, with labels humanised from property names. When it is used, the browser console shows one `[maretha-angular-webui]` notice per type and session. Types that stock Web UI registers with `no-layout` (`Document`, `Comment`, `SavedSearch`, `UserProfile`, `TemplateBasedFile` and the rest of `STOCK_NO_LAYOUT_TYPES` in `helpers/fallback-document-layouts.ts`) are excluded: no wildcard layout serves them, matching stock.

To give a type its own layout, register a `DocumentLayoutExtension` with `provideDocumentLayoutExtensions()` from the SDK:

```ts
provideDocumentLayoutExtensions({
  id: 'acme.invoice-layouts',
  layouts: [
    {
      id: 'acme.invoice.metadata',
      documentType: 'AcmeInvoice',
      mode: 'metadata',
      component: InvoiceMetadataComponent,
    },
    {
      id: 'acme.invoice.view',
      documentType: 'AcmeInvoice',
      mode: 'view',
      component: InvoiceViewComponent,
    },
  ],
});
```

A metadata component must declare `layoutContext`, `document`, `embedded`, `noEdit` and `externalToolbar` inputs (extend `DefaultDocumentMetadataLayoutComponent` to inherit them). Typed entries always beat the wildcard; use `priority` to order several entries for one type and `when(context)` to narrow by facet or document state. See the schema-bound layouts in `app/extensions/README.md` for field-level rendering.
