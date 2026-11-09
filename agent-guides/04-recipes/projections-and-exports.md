# Result cards, cells and exports

## A card or cell per document type

Listings render through `ResultsProjectionComponent`; `custom/` replaces one of its templates
with a component:

```ts
provideResultsProjections({
  id: 'acme.contract.card',
  projection: 'item', // or 'cell', 'rowdetail', 'checkbox', 'action', 'empty', ...
  mode: 'grid', // 'list' | 'table'
  when: (context) => (context as ResultsProjectionContext).row.type === 'Contract',
  component: AcmeContractCardComponent,
}),
```

The component declares a `context` input of type `ResultsProjectionContext`: `row` (`uid`,
`title`, `type`, `properties`), `index`, `selected`, `selection`, `readonly`, `loading`,
`columns` and, for cells, `column` and `value`, plus guarded callbacks `toggleSelection()`,
`selectRow(event)`, `activateRow()` and `invokeAction(name)`. Narrow with `hostId`
(`generic-folderish`, `picturebook-content`, ...) or `searchId`; the highest `priority`, then
the earliest registration, wins. There is no generator; write the component next to
`custom/projections/` with its spec.

Example: [acme.contract-card.component.ts](../../examples/acme/custom/projections/acme.contract-card.component.ts)
and its registration in [index.ts](../../examples/acme/custom/index.ts).

## An action over the complete query

`ResultsToolbarContext.queryScope` is the complete applied query (repository, provider,
parameters, named filters); hosts omit it when any active filter cannot be represented, so an
export disables itself without it. `columns` lists the visible document fields (`field`,
`label`, `labelKey`) when the host knows them; `items` is the loaded page in display order;
`displayMode` is `table`, `list` or `grid`. The stock `maretha.results.csv-export` and
`maretha.results.spreadsheet` use the same scope. `TRASH_RESULTS_SELECTION_ACTIONS` receives the
same fields.

Example: [acme.results.export-register.component.ts](../../examples/acme/custom/contributions/results-actions/acme.results.export-register.component.ts).

Then `npm run verify`. Reference: [Result projections](../../app/extensions/README.md#result-projections),
[Complete query exports](../../app/extensions/README.md#complete-query-exports).
