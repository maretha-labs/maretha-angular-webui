# Administration visual evidence

Reference captures: `/private/tmp/maretha-parity-reference-admin-audit.png`,
`maretha-parity-reference-admin-search.png`, `maretha-parity-reference-admin-workflow.png`,
`maretha-parity-reference-admin-nature.png`, and `maretha-parity-reference-admin-mobile.png`.

Source correspondence: `nuxeo-audit/nuxeo-audit-search.js` establishes the username, date,
action, and category filter order and audit columns. `nuxeo-admin/nuxeo-search-analytics.js`
and `nuxeo-workflow-analytics.js` establish date-filter cards and three-column analytics cards.

This pass keeps the 300px desktop Administration rail and 54px headers, makes Audit and
vocabulary controls/table rows follow the reference density, keeps analytics unavailable states
explicit, resolves chart paint from the four runtime theme tokens, and uses a local Administration
chooser on narrow pages. Its “Main navigation” action opens the otherwise hidden shared sidebar
control, preventing the two controls from occupying the same top-left hit target.
