# Compiled repository searches

Default search, Assets, Expired, Trash and admin NXQL use the compiled
`SearchDefinition` contract in `app/modules/search/helpers/repository-search-definitions.ts`.
A definition declares request bindings, lazy form and row components, available
views, table columns, layout and search identity. Stock forms and results remain
the defaults. Search-specific presentation belongs in components, not name checks
inside the shared host.

Default search keeps its existing `DocumentSearchService` adapter because its
saved-search routes, highlights and queue already have different state ownership.
Its `DefaultSearchResultsComponent` consumes the same definition for view modes,
columns, page size, CSV schemas and result component hooks. Its drawer loads the
stock `SearchComponent` through the same lazy form outlet. The route remains
`/search/default[/<savedSearchId>]`, and the contribution remains
`maretha.drawer.search` with pair key `search`. The other four searches continue
using `RepositorySearchComponent` and `RepositorySearchService`. This change does
not introduce another request coordinator or fetch during component registration.

The core page and drawer providers use the contribution builders in
`repository-search-providers.ts`. An application assembly can register additional
compiled searches with `provideRepositorySearches`. This is an application-level
extension point, not part of the separately versioned `@maretha/webui-sdk` API.
It requires rebuilding Angular; searches cannot be installed at runtime.

## Add a search

Define a search in application-owned code, for example
`app/application-searches.ts`, then add its provider alongside
`provideDefaultUiProviders()` in `main.ts`. The guarded `custom/` zone imports only
the public SDK and cannot import these application-internal helpers. This
contract is not part of the packaged SDK.

```ts
import { defineSearch } from 'app/modules/search/helpers/repository-search-definitions';
import { DEFAULT_RESULT_COLUMNS } from 'app/modules/search/helpers/repository-search-columns';
import { provideRepositorySearches } from 'app/modules/search/helpers/repository-search-providers';

const teamDocuments = defineSearch({
  id: 'team-documents',
  provider: 'default_search',
  label: 'Team documents',
  labelKey: 'team.documents',
  drawer: { order: 120, icon: 'nuxeo-navigation:search' },
  request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
  form: { submission: 'explicit' },
  facets: [],
  defaultMode: 'list',
  views: { list: {}, table: { columns: DEFAULT_RESULT_COLUMNS } },
});

// Add this to the application provider array in main.ts.
provideRepositorySearches('team.searches', [teamDocuments]);
```

Register the `team.documents` translation through the normal message provider.
The helper creates the `/page/team-documents` results page and a paired drawer.
Under the standard Nuxeo deployment the path is `/nuxeo/ng/page/team-documents`.
The provider must already exist in Nuxeo and accept the declared parameters.
The helper does not install a provider or change server permissions.

Search IDs must be unique. The additive helper rejects built-in IDs and requires
a drawer placement. Contribution IDs use the supplied extension ID as a prefix.
Application initialization also rejects page-ID collisions across extensions or
with existing application pages. Default provider owners, contribution IDs and
drawer/page pairings stay stable.
NXQL retains its separate administration registration and administrator check.

## Definition behavior

| Property                        | Purpose                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request`                       | Page size and allowed text, path, expiration-cutoff or NXQL parameter bindings. Undeclared repository-search criteria are ignored.                               |
| `form.loadComponent`            | Optional lazy form component. The shared stock filters form is used when omitted.                                                                                |
| `form.submission`               | Explicit submit, immediate submission or debounced submission. Existing loading policy stays explicit.                                                           |
| `form.criteria`                 | `url` (default) carries applied criteria in the page URL; `memory` keeps stock's bare page address and holds them for the app session (built-in searches).       |
| `layout`                        | `layout.results` is the single declaration for standard/stock geometry and controls; form placement is inline/drawer. Neither depends on a search ID.            |
| `facets`                        | Provider aggregation names accepted by the controller. A custom form decides how to present them.                                                                |
| `views`, `defaultMode`          | Supported views, optional lazy grid card/list row, table columns/cell components and column chooser. Unsupported stored modes fall back to the declared default. |
| `views.grid.layout`             | Fixed grid by default, or justified rows for a presentation such as the stock Assets tile.                                                                       |
| `results`                       | Existing sorting, scrolling, size field, CSV schema and trashed-row behavior, plus the results projection `hostId`.                                              |
| `savedSearches`, `quickFilters` | Opt-ins for Nuxeo capabilities; existing saved criteria policies preserve draft/applied behavior.                                                                |
| `access`                        | Authenticated or administrator-only host access. Server permissions remain authoritative.                                                                        |
| `queue`                         | Optional integration with the existing Assets or Expired queue.                                                                                                  |

Sort, paging and mode changes operate on applied criteria. An explicit-submit form
keeps its draft separate until Search is pressed. Changing between supported
views reuses the loaded rows. Preferences retain the same search ID, user and
repository keys.

## Per-search component hooks

Declare presentation alongside the provider. No new runtime settings or search-ID
branches are needed for a form with its own controls or a differently styled card:

```ts
const teamDocuments = defineSearch({
  id: 'team-documents',
  provider: 'default_search',
  label: 'Team documents',
  labelKey: 'team.documents',
  drawer: { order: 120, icon: 'nuxeo-navigation:search' },
  request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
  form: {
    submission: 'explicit',
    loadComponent: () =>
      import('./team-search-form.component').then((m) => m.TeamSearchFormComponent),
  },
  layout: { form: 'drawer', results: 'standard' },
  facets: [],
  defaultMode: 'grid',
  views: {
    grid: {
      loadComponent: () => import('./team-card.component').then((m) => m.TeamCardComponent),
    },
    list: {
      loadComponent: () => import('./team-row.component').then((m) => m.TeamRowComponent),
    },
    table: {
      columns: DEFAULT_RESULT_COLUMNS,
      cells: {
        title: () => import('./team-title-cell.component').then((m) => m.TeamTitleCellComponent),
      },
    },
  },
});
```

A repository search form receives a required `search` input containing its mounted
`RepositorySearchComponent` controller. It binds to that controller's draft fields
and calls its existing `submit()`, `reset()` and facet actions. It must not issue
its own duplicate search request. The stock form can be composed with ordinary
Angular content projection: Trash and Expired supply an Authors component, and
Assets supplies its auto-search form. The shared filters form no longer recognizes
any facet ID. Default search's form receives its definition and continues using
its existing injected `DocumentSearchService` adapter.

Grid cards, list rows and table cells receive a required `context` input typed as
`ResultsProjectionContext`. It contains `row`, `selected`, `loading`, `searchId`,
`column`/`value` for cells, and guarded `toggleSelection()`, `selectRow(event)` and
`activateRow()` callbacks. Components use those callbacks instead of duplicating
selection or navigation state. Only the active view's declared components load;
changing views does not fetch results. Omitting a hook preserves the existing
stock grid card, list row, Assets tile or table cell.

While a first-use form chunk loads, the outlet reserves space and announces
loading. It does not initialize a second controller or issue a provider request.

Every search page carries `nx-search--<id>`. The common page uses declared layout
classes; search-specific rules belong in that search's form and result components.
A component's own stylesheet provides Angular style encapsulation. The search ID
class also provides an explicit integration anchor without putting ID-dependent
rules in the shared page.

The old form auto-control setting is now a form component choice. Saved-search
settings still describe existing persistence semantics (draft versus applied
criteria, reset and loading policy); they are not a growing collection of visual
switches. Additional per-search controls or behavior should use a component hook.

## Add-ons scoped to one search

The SDK results registry supports `searchId` independently of its existing
`hostId`, so an add-on can replace only Expired's grid card:

```ts
provideResultsProjections({
  id: 'team.expired-card',
  searchId: 'expired',
  projection: 'item',
  mode: 'grid',
  component: ExpiredCardComponent,
});
```

The existing `default-search` and `repository-search` host IDs remain unchanged.
Row and host contexts carry `searchId`, including contexts passed to `when`
predicates. A matching registered add-on takes precedence over a definition's
component; definition components take precedence over the host's stock template.
The registry's existing priority and registration ordering still apply. A table
cell map is keyed by column ID, for example `cells.title` becomes the
`cell:title` projection.

## Verification and visual parity

`npm run test:ci` includes definition validation, native request assertions,
host behavior, contribution registration and production-provider exclusion tests.
`npm run test:e2e:compiled-search` uses a separate Angular entry and exercises the
`example-documents` search through real routing, registration, a custom form, a custom
card and results. Default-search unit coverage checks the same lazy row/cell hooks,
search identity and unchanged request counts while selecting rows or changing views.
Those browser tests use synthetic Nuxeo HTTP responses and a synthetic reader.
They do not verify live Nuxeo authentication or page-provider execution.

`npm run verify:compiled-search-production` builds optimized production output
and checks emitted JavaScript and source maps for the fixture. It uses the normal
production budgets, including the 8 KB stylesheet ceiling. The search styles are
split into ordered stylesheets with the same encapsulation and rule order.
Both commands run in the compiled-search CI job.

The shared search drawer form uses the stock 13px scale, including its footer
controls. This intentionally changes main's inherited 15px footer controls; the
input fields retain their existing 16px sizing.

PR #29 corrected Trash's previously unstyled List button through the shared mode picker.
That shortens the Angular toolbar row by 4 px relative to the previous main
implementation, as observed in the architecture review. Stock Web UI's
`elements/nuxeo-results/nuxeo-results.js` renders every mode, including Trash's
List mode, with the same `paper-icon-button.displayMode` template and CSS.
The correction follows that shared-button rule. This source comparison does not
claim a new pixel comparison against a running stock instance.
