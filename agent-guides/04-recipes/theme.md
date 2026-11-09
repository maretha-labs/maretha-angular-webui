# A theme

Slot `THEMES`; no component.

```sh
npm run new:contribution -- --slot THEMES --id acme.theme.corporate --label "ACME corporate"
```

It writes `custom/contributions/themes/acme.theme.corporate.theme.ts`, a `WebUiThemeDefinition`
(`id`, `label`, `labelKey`, `order`, `tokens`), and registers `defineWebUiTheme(...)`. Tokens are
the Polymer `--nuxeo-*` variables (`POLYMER_THEME_TOKENS` in the SDK lists the four stock maps
with every name); values are scalar CSS declarations or `url(assets/...)` references. Remote
URLs and executable CSS are rejected when the theme is defined.

The theme appears on the Themes page and in the account menu picker; the application applies the
selected tokens to the root. Hide or reorder a stock theme (`maretha.theme.dark`, `.default`,
`.kawaii`, `.light`) with an override ([visibility.md](visibility.md)).

Example: [acme.theme.corporate.theme.ts](../../examples/acme/custom/contributions/themes/acme.theme.corporate.theme.ts).

Then `npm run verify`. Reference: [Theme selection](../../app/extensions/README.md#theme-selection).
