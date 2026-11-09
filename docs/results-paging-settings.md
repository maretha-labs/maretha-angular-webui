# Optional scroll paging

Folder and search results use manual paging by default. Scrolling must not request
additional result pages unless the application explicitly enables
`scrollPagingEnabled`. The same setting covers result tables, Assets thumbnails,
the Assets queue, and the Favorites/Collections result drawers. Load more and
explicit navigation controls remain available regardless of the setting.
The existing Auto-search filter control is independent: it controls when edited
criteria are submitted, not whether scrolling fetches another page.

The public SDK exports `ResultsPagingOptions`, `RESULTS_PAGING_OPTIONS`, and
`ResultsPagingSettings` as the integration boundary for administrative
configuration. This implementation adds no admin page, document type, API,
browser preference, or persisted configuration.

An application can opt in at bootstrap using an Angular provider:

```ts
import { RESULTS_PAGING_OPTIONS } from '@maretha/webui-sdk';

{ provide: RESULTS_PAGING_OPTIONS, useValue: { scrollPagingEnabled: true } }
```

A loader for the admin styling document can replace the effective setting
at runtime through the application-root service:

```ts
import { inject } from '@angular/core';
import { ResultsPagingSettings } from '@maretha/webui-sdk';

const paging = inject(ResultsPagingSettings);
paging.apply({ scrollPagingEnabled: true }); // opt in
paging.apply({ scrollPagingEnabled: false }); // restore manual paging
paging.apply(); // reset when configuration is absent
```

Only the boolean `true` enables scroll paging; missing, null, and invalid values
leave it disabled. `apply` replaces rather than merges settings, so a new empty
configuration cannot retain an earlier opt-in. Existing views read the current
setting at each scroll event. Disabling prevents subsequent scroll requests; it
does not discard loaded rows or cancel a request already started. A loader
should reset the setting when its configuration scope is cleared or changes.

This controls fetching additional result pages, not ordinary scrolling, rendering
already loaded rows, lazy thumbnail images, initial queries, explicit queue Next,
CSV export, or user-requested selection across an entire query. Those operations
retain their existing behavior.
