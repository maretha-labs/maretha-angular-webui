# Showing, hiding, moving and replacing

Everything here controls presentation. Nuxeo decides permissions; hosts recheck them before a
mutation.

## Your contribution: `when`

`when: (context) => boolean` on any definition. It must be pure and may run often; a throwing
predicate hides the contribution with a diagnostic. For a migrated `<nuxeo-filter>`:

```ts
when: nuxeoFilter({
  type: 'Contract',
  permission: 'Write',
  expression: (document, user, filters) => !filters.isTrashed(document),
}),
```

`type`, `facet`, `schema`, `state`, `permission`, `group` take comma-separated values (any
matches); `path` is one regular-expression prefix; every set condition must pass; an unknown
condition throws when the filter is defined.

## Named rules

`visibilityRules: [{ id: 'acme.rules.legal-team', evaluate: (context) => boolean }]` on the
extension, then an override `{ slot, id, visibilityRule: 'acme.rules.legal-team' }` applies it
to any contribution in that slot, yours or a default, combined with the contribution's own
`when`. Check the context shape first (`DOCUMENT_ACTIONS_SLOT.isContext(context)`). A rule your
contribution must never lose goes in its `requiredVisibilityRule`; overrides cannot clear it.

## Defaults: overrides

```ts
overrides: [
  { slot: 'DOCUMENT_ACTIONS', id: 'maretha.document.purge', disabled: true },
  { slot: 'USER_MENU', id: 'maretha.user.themes', order: 65 },
],
```

Ids come from the "Defaults" line of the slot in [02-slot-catalog.md](../02-slot-catalog.md). An
unknown target throws at startup, so `npm run verify:examples` checks the example's ids against
the catalog. Disabling one half of a paired view hides the pair; disable both. To replace a
default's implementation, register a contribution with the same slot and id (a higher
`priority` wins; defaults are 0).

Example: the `when`s, the rule and the overrides in [index.ts](../../examples/acme/custom/index.ts).

Then `npm run verify`. Reference: [Polymer filters](../../app/extensions/README.md#polymer-filters),
[Named visibility rules](../../app/extensions/README.md#named-visibility-rules),
[Disable, reorder, replace and restore](../../app/extensions/README.md#disable-reorder-replace-and-restore).
