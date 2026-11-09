# A drawer icon with its panel

Slots `DRAWER_ITEMS` (the icon bar) and `DRAWER_PAGES` (the panel), context `DrawerContext`.

```sh
npm run new:contribution -- --slot DRAWER_ITEMS --id acme.drawer.contracts --label Contracts
```

Either slot name generates both halves: a `DrawerItemComponent` item and a lazy page sharing one
`pairKey`. The item's `inputs` take `pageId`, `label`, `labelKey`, `icon` (a `nuxeo:*` name) and
optionally `route`; a route-only item navigates instead of opening a panel and may omit the pair
key. Exactly one item and one page must share a pair key, or the icon is hidden.

The page reads `DrawerContext`: `recentDocuments`, `collections`, `clipboard`, `tasks`,
`taskCount`, the current `document`, `user`, `locale` and `route`, and callbacks `navigate(path)`,
`open(key)`, `close()`, `clearHistory()`, `clearClipboard()`. `navigate` goes through the router
and the departure guards. Pages may set `retain: true` and implement `GuardedView` to keep drafts
while inactive.

Example: [acme.drawer.contracts.component.ts](../../examples/acme/custom/contributions/drawer-items/acme.drawer.contracts.component.ts)
lists the recent Contracts and opens one by its uid route; its registration with `labelKey` is in
[index.ts](../../examples/acme/custom/index.ts).

Then `npm run verify`. Reference: [Drawer contributions](../../app/extensions/README.md#drawer-contributions).
