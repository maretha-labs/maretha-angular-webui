# Document listing controls

- Display settings → Create button location chooses **Lower right** (default) or **Document actions toolbar**. The preference is saved in this browser, applies immediately, and renders one Create button. Toolbar placement uses the `maretha.document.create` contribution in `DOCUMENT_ACTIONS`.
- Folder listings switch between table (default) and thumbnail grid, like Polymer's `nuxeo-document-content`. Each user's choice is saved per folder in this browser. A `ResultsProjectionRegistry` `item` projection with `hostId: 'generic-folderish'` replaces the grid card.
- Default folder listings have no per-row Actions column. Select documents for bulk actions; open a document for its actions. Client contributions can still supply row actions through results projections.
- Checked rows are highlighted and the header checkbox indicates partial selection. Toolbar counts follow selection changes.
- Short lists fit their rows; long lists retain scrolling and virtualization. Empty lists retain their headers.
- Thumbnail loading uses authenticated requests, fresh browser cache keys, and an in-memory cache. A file-type icon is displayed if the server preview is unavailable.
