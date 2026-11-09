# A routed page

Slot `PAGES`, context `PageContext`, route `/page/<pageId>`.

```sh
npm run new:contribution -- --slot PAGES --id acme.page.contract-register
```

`definePage({ id, pageId, loadComponent })` registers the page; `pageId` defaults to the id. The
component reads `PageContext`: `pageId`, `params`, `query` (the URL query parameters), `route`,
`locale`, `user`, `document` and `noEdit`. Load data from a server page provider
(`/api/v1/search/pp/<name>/execute`) with Angular's `HttpClient` when the page shows or the user
applies a filter, never at registration.

Link to the page from other contributions: `context.navigate('/page/<pageId>')` in a shell or
Quick Search action, a `#/page/<pageId>` link in the account menu, a route-only drawer item
([drawer.md](drawer.md)). Page ids must not collide with the application's pages; initialization
rejects a collision.

Example: [acme.page.contract-register.component.ts](../../examples/acme/custom/contributions/pages/acme.page.contract-register.component.ts)
filters by `?counterparty=`; [acme.shell.contract-register.component.ts](../../examples/acme/custom/contributions/shell-actions/acme.shell.contract-register.component.ts)
and [acme.user.contract-register.component.ts](../../examples/acme/custom/contributions/user-menu/acme.user.contract-register.component.ts)
open it.

Then `npm run verify`. Reference: [Repository navigation](../../app/extensions/README.md#repository-navigation-and-search-defaults).
