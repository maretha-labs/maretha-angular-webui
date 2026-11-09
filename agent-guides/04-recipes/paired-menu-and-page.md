# A menu entry with its page

Paired slots: `ADMINISTRATION_MENU` / `ADMINISTRATION_PAGES` (`AdministrationContext`),
`ANALYTICS_ITEMS` / `ANALYTICS_PAGES` (`AdministrationContext`), `PUBLISH_ITEMS` /
`PUBLISH_PAGES` (`PublishContext`), `CREATE_POPUP_ITEMS` / `CREATE_POPUP_PAGES`
(`DocumentCreateContext`).

```sh
npm run new:contribution -- --slot ADMINISTRATION_MENU --id acme.admin.contract-settings
```

Either slot name generates the same `...definePairedView({ items, pages }, { id, viewId, label,
labelKey, icon, order, when, loadComponent })` entry: the standard accessible tab in the items
slot and the page in the pages slot, paired by `viewId`. The URL parameter is `view`, or `admin`
for administration. Exactly one item and one page per key; a `disabled` override on either hides
the pair, so disable both to remove a stock view cleanly.

- Administration pages get `features` (server flags) and `user`; the settings page itself already
  requires the administration visibility rule, and the server stays authoritative.
- Publishing pages get one `document` or an explicit `selectedDocuments` snapshot; support both or
  say in the page that selections are excluded.
- Create dialog pages get `types` (allowed in the current folder), `create(type)`,
  `importFiles()` and `busy`; the host rechecks the parent and the type before opening an editor.

Examples: [acme.admin.contract-settings.component.ts](../../examples/acme/custom/contributions/administration-menu/acme.admin.contract-settings.component.ts),
[acme.publish.partner-portal.component.ts](../../examples/acme/custom/contributions/publish-items/acme.publish.partner-portal.component.ts),
[acme.create.from-template.component.ts](../../examples/acme/custom/contributions/create-popup-items/acme.create.from-template.component.ts).

Then `npm run verify`. Reference: [Paired publishing and administration pages](../../app/extensions/README.md#paired-publishing-and-administration-pages).
