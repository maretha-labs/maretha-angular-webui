# Moving a Polymer customization

The playbook is [05-polymer-migration.md](../05-polymer-migration.md): copy the Polymer sources
into `migration/polymer-source/`, inventory every `nuxeo-slot-content` and non-slot resource,
record each in `migration/mapping.json`, then port one row at a time with the generators and the
recipes here. Both `migration/` paths are in the customization zone.

Mapping in one line: `slot=` becomes the `<SLOT>_SLOT` constant, `name=` the id, `order=` the
order, `<nuxeo-filter>` a `nuxeoFilter({...})` predicate ([visibility.md](visibility.md)),
per-type layouts `npm run new:layout` ([layouts.md](layouts.md)), themes a `THEMES`
contribution ([theme.md](theme.md)), a disabled or replaced stock contribution an override or a
same-id contribution. Search forms become a drawer page or a routed page that queries the page
provider ([drawer.md](drawer.md), [page.md](page.md)).

Example: [examples/acme/migration/mapping.json](../../examples/acme/migration/mapping.json) maps
a ported action, a ported layout, a pending search and a waived element. The id of every stock
Polymer contribution is in [polymer-parity.md](../../docs/polymer-parity.md).

Then `npm run verify`.
