# WebUI SDK release notes

## 1.0.0 — 2026-11-09

This release changes the public result-projection contract: consumers that
construct a `ResultsProjectionContext` must supply a new required callback. From
1.0.0 the SDK version moves in lockstep with the application's version.

### Breaking change and migration

`ResultsProjectionContext.activateRow: () => void` is required. Contexts created
by `ResultsProjectionComponent` already provide this callback and apply the
host's loading, read-only, row-activation and stale-context guards. Components
that only receive these contexts require no migration.

Custom hosts and test fixtures that construct a context object must add
`activateRow`. A custom host should delegate to its existing guarded row-opening
handler. A test fixture can supply a spy and assert that a custom card invokes it:

```ts
const activateRow = jasmine.createSpy('activateRow');
const context: ResultsProjectionContext = {
  ...existingFixtureContext,
  activateRow,
};
```

Update the consuming application's SDK dependency to `1.0.0` (or `^1.0.0`) and
regenerate its lockfile. An existing `^0.1.2` range does not select this
breaking release. The Angular peer versions and contribution identities
remain unchanged.

### Added projection hooks

- `ResultsProjectionComponent.searchId` and `components` inputs identify a search
  and supply its lazy item or table-cell components.
- `ResultsProjectionComponentLoader` and `ResultsProjectionComponents` describe
  these compiled loaders. Components receive a typed `context` input. Registered
  projection add-ons retain precedence over these instance defaults.
- `searchId` is optional on row/host projection contexts and
  `ResultsProjectionDefinition`. An add-on can target one search while existing
  `hostId` registrations continue working.
- The public API report now includes the existing `pageScroll` component input.

The package includes these notes. The frozen upgrade-test baseline
(`contracts/sdk-baseline`, 0.1.0) is unchanged until after 1.0.0.
