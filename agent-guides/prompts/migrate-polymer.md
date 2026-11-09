# Migrate a Polymer customization

```text
Read AGENTS.md and agent-guides/05-polymer-migration.md. We are customizing a release of the
Maretha Angular Web UI; only the customization zone may change.

The Polymer Web UI customization is in migration/polymer-source/. Inventory every
nuxeo-slot-content, per-type layout, search form, workflow task layout, theme, custom element and
Studio translation file,
and write migration/mapping.json with one entry per resource (status ported, pending or waived
with a note). Then port the entries in this order: <order, or "slot contributions, then layouts,
then the rest">.

For each entry: generate the target with `npm run new:contribution` or `npm run new:layout`, map
the nuxeo-filter attributes to `nuxeoFilter`, map stock contributions you disabled or replaced to
overrides by the ids in agent-guides/02-slot-catalog.md, move the markup into the component, keep
the spec. Do not copy stock behaviour: disable, reorder or replace it by id. Studio translation
files go into custom/i18n as agent-guides/04-recipes/i18n.md describes.

Done means `npm run verify` is green, mapping.json has no entry without a status, and you report
the waived entries with their reasons.
```
