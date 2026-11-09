# A command in Quick Search or the header

Slots `QUICK_SEARCH_ACTIONS` (`QuickSearchContext`) and `SHELL_ACTIONS` (`ShellActionContext`).
Both exist only in the Angular UI.

```sh
npm run new:contribution -- --slot QUICK_SEARCH_ACTIONS --id acme.quick-search.contracts
npm run new:contribution -- --slot SHELL_ACTIONS --id acme.shell.contract-register
```

A Quick Search command sees `searchTerm`, `user`, `document`, `locale`, `route`, `navigate(url)`
(a promise of whether navigation happened, after the departure guards) and `close()`. Match the
term in `when` (exact, prefix or regular expression) and close the overlay only when `navigate`
resolved to `true`. Instead of a component, the SDK's `QuickSearchCommandComponent` renders an
accessible result from `inputs: { label, icon, run }`, where `run` may return `false` to keep the
overlay open.

A header action has the same context without the term and the close callback. The default
`maretha.shell.quick-search` opens the overlay; disable or replace it like any default
([visibility.md](visibility.md)). Server highlight snippets are rendered as text.

Examples: [acme.quick-search.contracts.component.ts](../../examples/acme/custom/contributions/quick-search-actions/acme.quick-search.contracts.component.ts),
[acme.shell.contract-register.component.ts](../../examples/acme/custom/contributions/shell-actions/acme.shell.contract-register.component.ts);
both open the page in [page.md](page.md).

Then `npm run verify`. Reference: [Global Quick Search](../../app/extensions/README.md#global-quick-search).
