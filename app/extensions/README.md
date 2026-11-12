# WebUI extension foundation

This directory builds the **`@maretha/webui-sdk`** Angular 22 package. Import from `@maretha/webui-sdk`. The repository maps that public name to this source during development; external consumers install the partial-compiled package and need no source aliases. This is an initial local package, not a published release or an independently installable plugin system.

Run `npm run pack:sdk` to produce `dist/maretha-webui-sdk-2.0.0.tgz`. See the [SDK release notes and migration instructions](CHANGELOG.md) before upgrading. The [independent consumer example](../../examples/client-webui/README.md) verifies an isolated production build, including Angular linking and registry identity. SDK and host must share their Angular peer dependencies and the same package instance.

All 24 baseline named slot families now have connected hosts. This means clients can target each family; complete source-default behavior and every host occurrence still require parity qualification. [Polymer slot parity](../../docs/polymer-parity.md) maps every Polymer default contribution to its Angular IDs or records it as a gap, and lists the non-slot customizations (searches, workflow task layouts, themes, page providers, custom elements) with migration guidance.

| Family               | Slots                                                           | Context                                                        |
| -------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| Shell                | DRAWER_ITEMS, DRAWER_PAGES                                      | DrawerContext                                                  |
| Application          | PAGES                                                           | PageContext                                                    |
| Account / appearance | USER_MENU, THEMES                                               | UserMenuContext / WebUiThemeContext                            |
| Administration       | ADMINISTRATION_MENU, ADMINISTRATION_PAGES                       | AdministrationContext                                          |
| Documents            | DOCUMENT_ACTIONS, DOCUMENT_VIEWS_ITEMS, DOCUMENT_VIEWS_PAGES    | DocumentActionContext / DocumentViewContext                    |
| Notices / files      | DOCUMENT_INFO_BAR, BLOB_ACTIONS, FILE_UPLOAD_ACTIONS            | DocumentInfoBarContext / BlobActionContext / FileUploadContext |
| Results              | RESULTS_ACTIONS, RESULTS_SELECTION_ACTIONS, COLLECTION_ACTIONS  | ResultsToolbarContext                                          |
| Trash                | TRASH_RESULTS_SELECTION_ACTIONS                                 | ResultsSelectionContext                                        |
| Creation             | DOCUMENT_CREATE_ACTIONS, CREATE_POPUP_ITEMS, CREATE_POPUP_PAGES | DocumentCreateContext                                          |
| Publishing           | PUBLISH_ITEMS, PUBLISH_PAGES                                    | PublishContext                                                 |
| Analytics            | ANALYTICS_ITEMS, ANALYTICS_PAGES                                | AdministrationContext                                          |

## Register a compiled Angular contribution

Register defaults first, then client extensions, once in the application bootstrap providers:

```ts
import {
  defineContribution,
  DOCUMENT_ACTIONS_SLOT,
  provideWebUiExtensions,
} from '@maretha/webui-sdk';

provideWebUiExtensions({
  id: 'client.contract-actions',
  contributions: [
    defineContribution(DOCUMENT_ACTIONS_SLOT, {
      id: 'client.contract.review',
      order: 20,
      loadComponent: () => import('./review-action.component').then((m) => m.ReviewActionComponent),
      when: (context) => context.document?.['type'] === 'Contract' && !context.noEdit,
    }),
  ],
});
```

The component must declare an Angular input named `context`:

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DocumentActionContext } from '@maretha/webui-sdk';

@Component({
  selector: 'client-review-action',
  template: '<button type="button">Review {{context().document?.["title"]}}</button>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewActionComponent {
  readonly context = input.required<DocumentActionContext>();
}
```

Use either `component` for an eager reference or `loadComponent` for a compiled lazy import. Exactly one is required. Optional `inputs` supplies other declared component inputs; `context` is reserved for the host. Component dependencies use the host's Angular injector.

`DocumentActionContext` is an adapter over the existing document object and `noEdit` flag. Its readonly types are shallow compile-time guidance. Conditions and context guards must be pure; they can run repeatedly. They control visibility, not Nuxeo authorization. The current toolbar mounts only when its legacy `document.ng` state exists.

## Disable, reorder, replace and restore

Metadata overrides do not require a replacement component:

```ts
provideWebUiExtensions({
  id: 'client.document-policy',
  overrides: [{ slot: 'DOCUMENT_ACTIONS', id: 'maretha.document.info', disabled: true }],
});
```

Use `order` in the same override shape to change position, and `disabled: false` to re-enable. To replace implementation, register a contribution with the same **slot and contribution ID** in a later extension. Different slots may reuse an ID. Use namespaced IDs for new client code.

Resolution rules:

1. Contributions are processed in explicit extension registration order. Async load completion never chooses precedence.
2. The highest `priority` wins a same-slot/same-ID replacement; a later extension wins a tie. Defaults are priority 0.
3. Metadata overrides apply at their extension's position, after that extension's contributions. A later component replacement supplies its own metadata. Register final policy overrides last when they must control the final assembly.
4. Visible contributions sort by ascending `order` (default 0), retaining first registration position for ties.
5. Invalid updates throw before changing the last valid snapshot. Unknown targets in a newly registered override are rejected; register its base first.

For reversible preview work, `ExtensionRegistry.register(extension)` returns a disposer. Removing a client extension restores underlying defaults. Registering the **same extension ID** updates that owner atomically at its original layer position; it does not push another restorable version. An old disposer cannot remove a newer update. Use distinct IDs for distinct owners, and register each provider once at bootstrap. There is no scoped multi-owner stack for the same extension ID.

If a base extension is removed while another owner still overrides it, the override becomes an `unknown-target` diagnostic and is skipped. Unrelated changes remain possible. Re-registering the base at its original position restores that override. Positions remain reserved for the registry's lifetime.

## Hosts, diagnostics and lifetime

`WebUiSlotComponent` has selector `nx-webui-slot`, a required `name` input and a `context` input. `defineSlot(name, typeGuard)` supports client-defined slots.

Slots use an inline layout by default. Set `layout="stack"` for full-width vertical contributions such as account rows. Switching layout preserves mounted component instances. Page outlets separately stretch their content to fill the available width, including components with positioned virtual viewports.

Pass a stable context object and replace it when its data changes. Avoid a template getter that allocates a new object on every change-detection pass. The toolbar now updates its adapter in `ngOnChanges`; changes to client eligibility data should provide a new document/context reference rather than relying on in-place mutation.

The host exposes `resolution()` and `diagnostics()` signals. The registry exposes a readonly `snapshot()` of effective contributions, including disabled entries. Invalid contexts and throwing predicates hide only the affected contribution and produce a sanitized diagnostic. Ordinary false conditions produce no error.

Mounted component state survives host context changes, reordering and unrelated registrations. Replacement of the component source/configuration remounts it. Removal destroys it. A late lazy import cannot replace a newer contribution or mount after destruction. Each host has independent component instances and context.

Lazy loading failures, invalid input names, initial rendering failures, host-driven context rendering failures and teardown failures are handled locally. A failed initialization displays “Extension unavailable”; healthy neighbors remain available. This is **not complete isolation of arbitrary Angular code**: later component-owned change detection, event handlers and asynchronous callbacks can still reach Angular's global error handler. Extensions execute as trusted compiled application code. Sandboxed code, runtime template compilation and remote executable plugins are not supported.

## Paired document views

`defineDocumentView()` generates linked contributions for `DOCUMENT_VIEWS_ITEMS` and `DOCUMENT_VIEWS_PAGES`. Register them with the same provider API:

```ts
import { defineDocumentView, provideWebUiExtensions } from '@maretha/webui-sdk';

provideWebUiExtensions({
  id: 'client.contract-views',
  contributions: defineDocumentView({
    id: 'client.contract.summary',
    viewId: 'contract-summary',
    label: 'Contract summary',
    order: 20,
    when: (context) => context.document?.['type'] === 'Contract',
    loadComponent: () =>
      import('./contract-summary.component').then((m) => m.ContractSummaryComponent),
  }),
});
```

The page receives a `DocumentViewContext` input named `context`. The helper supplies the standard accessible tab. The `viewId` is the stable navigation/pairing key; it is independent of the display label and the contribution ID. Contributions in both slots use an explicit `pairKey`. Advanced clients can use `defineContribution()` with either typed slot to replace the item or body separately. A custom item receives `DocumentViewItemContext`, including `selected`, `tabId`, `panelId`, `tabIndex` and `select()`; it must implement the tab role and those ARIA/focus attributes.

Exactly one eligible item and page must match each pair key. Missing keys, missing eligible counterparts, and duplicate eligible counterparts produce `invalid-pair` diagnostics and exclude that view. This intentionally rejects ambiguous native declarations; importing Polymer's overlapping `name="view"` renderers will require explicit normalization into a single selected body. Metadata overrides can disable either member, which makes the pair unavailable. Disable both members to remove a view without an orphan diagnostic. Removing the override restores the defaults.

`DocumentViewsComponent` supports independent hosts, ordered tabs, lazy page loading, selected-page teardown, keyboard focus, and fallback when a selected view becomes unavailable. Arrow keys and Home/End move focus; Enter/Space activate through the native tab button. Page instances survive context updates and reordering. By default, switching tabs destroys the previous page. Set `retain: true` on a page definition to keep its mounted instance while inactive; its panel becomes hidden and inert. Retention is scoped to the current document and repository, ends when the host is destroyed, and is not disk persistence. A same-document refresh updates context without resetting the page; a different document or repository starts fresh instances. Removing eligibility or unregistering a view destroys it immediately, even when it has drafts. `DocumentViewTabComponent` is the default tab for a view item; a custom item can render it with `context`, `label` and optional `labelKey` and `icon`.

The main viewer binds selection to `?view=<viewId>` within its existing document URL. `view` is the default page key. Browser navigation updates the selected view; a user selection creates history, while invalid/removed-view fallback replaces the current entry. Other query parameters and the fragment are preserved. This is Maretha's URL contract; Polymer's `p` parameter is not imported automatically. Register client pairs at bootstrap so fresh deep links can resolve before their component chunks load.

The registered default delegates to the existing folder and document-type renderers, including the five specialized types. Folder pages hydrate cached results and busy state when created after a result event. View-only URL changes no longer refetch documents or clear folder results. The context is an adapter over the current Nuxeo document model; full schema/layout APIs, the other default tabs and persisted Contract editing are outside this contract.

## Icons, labels and theme source catalogs

`provideWebUiIcons(owner, icons)` registers a reversible icon layer. `NUXEO_ICONS` contains all 76 pinned `nuxeo:*` icons, including original path data, group attributes and transforms. Render them with `WebUiIconComponent` (`name` plus optional accessible `label`); omit the label for a decorative icon inside an already labelled control. Client layers can override a name and restore its original geometry by disposing their registration. The renderer accepts a bounded set of SVG geometry/text nodes and attributes; it does not inject HTML or accept scripts, event handlers or remote paint references.

`provideWebUiMessages(owner, catalog)` registers flat label dictionaries by locale. `WebUiMessages.locale` drives lookup; explicit locale, base language, then `en-US` are checked before a supplied fallback. Document views accept `labelKey` and optional `icon` in addition to the fallback `label`. Account entries also accept a `labelKey`. The application bridges its current translation locale to this catalog. This label API does not replace the existing application's ICU/plural formatting service.

`POLYMER_MESSAGES` contains the merged reference WebUI and shared-element labels in English and Arabic. The pinned source has no Romanian catalog; Romanian falls back to English for these labels. Client catalogs can supply it. `POLYMER_THEME_TOKENS` exposes the four source theme maps, including all 105 default scalar values. Importing the maps alone does not implement theme selection or translate Polymer style mixins.

`scripts/import-polymer-assets.py` reproduces these catalogs from the pinned source revisions. See `polymer-assets.provenance.json` and `NOTICE` for attribution and the single malformed source-tag repair. The sidebar now uses the imported Nuxeo glyphs for its primary navigation entries; remaining FontAwesome consumers still need migration.

## Editable view lifecycle

A page can implement the exported `GuardedView` interface. Its `canDeactivate(departure)` returns a boolean or `Promise<boolean>`; only `true` allows departure. Exceptions and rejected promises cancel navigation. The departure identifies a tab switch or route navigation and supplies the next view ID and, for navigation, URL. Use an in-page confirmation/save flow to resolve the promise. Stale responses cannot supersede a newer request or document.

The host checks the active page before switching tabs and all retained pages before leaving the document. Implement optional `hasPendingChanges()` for synchronous browser unload protection; browser policies determine whether a reload/close warning appears. Async work cannot run during unload. Drafts should be saved or explicitly discarded before approving departure.

For routed hosts, bind `navigationPath` to the current document route path and install `documentViewsNavigationGuard` on destination routes with `runGuardsAndResolvers: 'always'`, including reused route parents. The application does this for all top-level routes. This checks query changes, history navigation and document changes before the URL commits. Standalone hosts still guard tab selection and incoming `selectedView` changes. A direct context replacement is authoritative: the parent must guard it before supplying another document.

Registry removal or loss of eligibility is authoritative and cannot be vetoed by an editor. Retention keeps inactive components mounted, including their subscriptions; editors must manage expensive work accordingly. It is not an authorization mechanism or a durable offline draft store.

## Account menu

The live sidebar mounts `USER_MENU` as a vertical slot inside a navigation region. Entries use native links/buttons with normal Tab navigation, rather than an ARIA menu with a separate arrow-key contract. The drawer exposes its expanded state, keeps closed content inert, and restores the opening button's focus when closed with Escape or its close button.

`UserMenuContext` includes a small `ApplicationContext`: the current user (`id`, `displayName`, `isAdministrator`, group IDs), locale, route URL and document. It also includes available languages and callbacks for `close()`, `openProfile()`, `changeLanguage(key)` and `signOut()`. Context references remain stable until these values change. The rest of Polymer's application model is in `WebUiAppState`, which any component can inject: read-only signals for the user, locale, route and query, clipboard documents, open task count, the task being viewed, the personal workspace path, and the Nuxeo URL. Slot contexts carry only their host's data. No tokens or authentication-service objects are passed to contributions. These readonly interfaces provide compile-time guidance, not an isolation boundary.

`provideDefaultUserMenu()` is installed at bootstrap before client extensions. Its owner is `maretha.core.user-menu`:

| Contribution ID                        | Order | Behavior                            |
| -------------------------------------- | ----- | ----------------------------------- |
| `maretha.user.profile`                 | 10    | Opens the existing profile dialog   |
| `maretha.user.drive`                   | 20    | Disabled placeholder                |
| `maretha.user.authorized-applications` | 30    | Disabled placeholder                |
| `maretha.user.cloud-services`          | 40    | Disabled placeholder                |
| `maretha.user.themes`                  | 50    | Opens the theme contribution picker |
| `maretha.user.language`                | 60    | Changes the application locale      |
| `maretha.user.sign-out`                | 70    | Uses the existing sign-out flow     |

Every default is conditional on a signed-in user. The three disabled placeholders render disabled buttons; a registry override with `disabled: true` instead removes a contribution from the slot. Clients can replace any entry's component with the same slot/ID. Hiding a menu entry does not remove a route or authorize access to it. Registering a menu entry does not create its destination page; the `PAGES` contract is separate.

For example, remove a placeholder entry and move sign-out to the beginning:

```ts
provideWebUiExtensions({
  id: 'client.account-policy',
  overrides: [
    { slot: 'USER_MENU', id: 'maretha.user.themes', disabled: true },
    { slot: 'USER_MENU', id: 'maretha.user.sign-out', order: 0 },
  ],
});
```

Add a client component with `defineContribution(USER_MENU_SLOT, { id, order, component, when })`. Its required input is `context: UserMenuContext`; a `when` predicate can use the projected user, route or document. Predicates only control visibility and never replace server authorization. The [interactive component preview](../../preview/README.md) demonstrates reversible changes and a new client entry without modifying the running Nuxeo application.

The default menu keeps the Angular entry order. Its row styling follows the Polymer account drawer, with text rows, full-width borders and a primary-color focus indicator. Account labels use the public catalog, Profile opens a dialog, and three destination pages are disabled placeholders; this is not complete Polymer account-feature parity. Language selection and sign-out are Maretha contributions even though Polymer does not contribute them through this slot.

## Verification

Focused browser tests cover registry precedence and validation, reversible overrides, independent hosts, retained state, lazy races, local failures, the real document-info action, and the account menu defaults and sidebar integration. Run with quoted glob arguments so the shell does not expand them:

```sh
npx tsc --noEmit -p tsconfig.spec.json
npx ng test --watch=false --browsers=ChromeHeadless --progress=false \
  '--include=app/extensions/*.spec.ts' \
  '--include=app/modules/explorer/components/viewers/document-actions-toolbar/*.spec.ts' \
  '--include=app/modules/shared/components/sidebar/sidebar-user-menu.spec.ts' \
  '--include=app/modules/shared/components/sidebar/user-menu/*.spec.ts'
```

## Theme selection

`defineWebUiTheme({ id, label, tokens, order })` contributes a choice to `THEMES`. Install `provideWebUiThemeApplication()` to apply the selected tokens to the application root and `WebUiThemePickerComponent` to render the choices. Registry overrides can hide, reorder or replace individual themes. Removal falls back to the first available choice; removing all choices restores prior inline styles. External style writes made after theme application are preserved on disposal. CSS values accept scalar declarations and local `assets/` resource references; remote URLs and executable CSS are rejected. Clients distributing the Kawaii theme must also copy its local background asset.

## Legacy view normalization

`documentViewParameter(params)` reads `view`, then Polymer's `p` if absent. The app emits canonical `view` links and removes `p` on selection. `defineDocumentViewVariants(definition, variants)` is an explicit first-match adapter for source bodies that overlap; list specialized candidates before their generic fallback. A failed predicate fails closed. Ordinary `defineDocumentView()` and native pairing retain strict ambiguity diagnostics.

## Schema-bound scalar layouts

Provide `DOCUMENT_LAYOUT_GATEWAY` with a `DocumentLayoutGateway` implementation. `SchemaLayoutComponent` receives a `DocumentLayout`, a document ID for existing records, or parent ID/name for creation. Modes are `create`, `edit`, `view`, `metadata` and `import`. Fields are verified against the Nuxeo `/config/types/{type}` schema response, including its nested `fields` maps for complex values and `type[]` list notation. Strings, booleans, safe integers, doubles, dates, complex values and lists are editable; structured values use JSON so their server shape round-trips without flattening.

Blob fields use a file control only when the gateway implements `uploadBlob(file)`. The included application adapter creates a Nuxeo upload batch, uploads the file, and saves the resulting `upload-batch` / `upload-fileId` descriptor. Reference and directory layouts opt in with `widget: 'reference'` or `'directory'`; they require `resolveReference(field, value)` so an arbitrary text value cannot be saved as a reference. Client code can register a trusted Angular widget with `provideDocumentLayoutWidget({ id, component })`. Its component receives a `props: WidgetProps` input and calls `props.commit(value)`; it is responsible for its own presentation while the host still owns validation, draft isolation, permissions and persistence.

Editing requires fresh server `WriteProperties` and a change token. The application adapter includes `uid` and `changeToken` in PUT bodies, sends only changed fields, and returns server errors to the editor. A conflict preserves the draft. Reload prompts before discarding changes. The component implements `GuardedView`; wrappers must forward that contract, as the [Contract example](../../examples/contract/contract-view.component.ts) does. Its `saved` output can call the optional document context `refreshDocument()` callback to update other document surfaces. Retention remains in-memory only.

## Paired publishing and administration pages

`definePairedView({ items, pages }, definition)` applies the same one-item/one-page pairing contract to typed slot families. `nx-paired-views` is the generic selector for the shared host; set `itemSlot`, `pageSlot`, and its accessible `label`. `navigationParameter` defaults to `view`; administration uses `admin`. `canDeactivate(departure)` lets an enclosing view include nested editors in its own departure decision. The host isolates nested tab keyboard handling and retained state by slot family.

Publishing exposes `PUBLISH_ITEMS_SLOT` and `PUBLISH_PAGES_SLOT`, with `maretha.publish.section` as the default. Their `PublishContext` extends the single-document context with optional explicit `selectedDocuments`. A client publishing page must support or explicitly exclude selection contexts. Administration exposes `ADMINISTRATION_MENU_SLOT` and `ADMINISTRATION_PAGES_SLOT`; `AdministrationContext` includes the authenticated user and enabled feature flags. These conditions control presentation; server authorization remains authoritative.

## Drawer contributions

`DRAWER_ITEMS_SLOT` and `DRAWER_PAGES_SLOT` use `DrawerContext`. Items with a `pairKey` require exactly one matching page and item. Route-only items may omit the pair key. `DrawerItemComponent` is a reusable native button for either a page ID or a route. Removal of the current page closes the drawer; missing/ambiguous pairs hide their icon. Stable default IDs use `maretha.drawer.<key>` (tree, recents, search, collections, favorites, clipboard, tasks, and the route-only browse entry). Custom keys are accepted without editing a core union type. `ContributionOutletComponent` is public for hosts with separate item/page placement.

## Document notices and commands

`DOCUMENT_INFO_BAR_SLOT` carries document, loading and search state. Lock, legal hold, retention and workflow notices are independently replaceable as `maretha.document.notice.<kind>`. Document row commands now use `DOCUMENT_ACTIONS`: info, edit, clipboard, collect, remove-collection, pdf, xml, zip, trash, restore and purge. Permanent deletion requires confirmation for the current target; mutations check fresh permission data and respect read-only, version and retention states. The explorer toolbar also uses public result, selection, collection and creation contributions. Query-wide bulk mutations remain unavailable until a verified query scope can be supplied; actions operate on explicitly selected displayed documents.

The public English/Arabic catalogs contain all 1,891 merged reference entries per locale. `WebUiMessagePipe` performs text-only positional `{0}` interpolation and follows locale changes. It never interprets catalog or argument values as HTML.

## Results, creation and attachments

`ResultsToolbarContext` supplies the displayed/selected counts, command availability, workflow models and an `execute` callback. A host rechecks eligibility when a command executes. `maretha.toolbar.*` defaults use the same context as client commands. Result settings, snapshots and collections mount through contributed panels.

`DocumentCreateContext` supplies allowed document types and callbacks for creation, import and opening the modal. `CREATE_POPUP_ITEMS` / `CREATE_POPUP_PAGES` use the shared paired-view host; clients can replace either the type chooser or import page. The host rechecks the current parent and allowed type before opening an editor.

`FILE_UPLOAD_ACTIONS_SLOT` exposes a validated `choose()` callback through `FileUploadContext`. Its default `ChooseFilesActionComponent` preserves the existing projected template. `BLOB_ACTIONS_SLOT` exposes authenticated download and draft replacement/removal callbacks, the document, property XPath and accepted MIME types. Read-only attachments omit mutation callbacks. Clients must use these callbacks to retain the host's disabled state, MIME checks and upload lifecycle.

## Custom extensions

The canonical application calls `provideCustomExtensions()` from `custom/index.ts` after the first-party defaults. `custom/` is the only writable zone: its code may import only its own files, `@maretha/webui-sdk` and npm packages, never core files; core imports nothing from it except `custom/index.ts`. `npm run lint` enforces both directions and ignores inline `eslint-disable` comments under `custom/`. Selectors there use the prefix from `custom/owner.json`.

Scaffold contributions and layouts with the generators. Each writes the component, its spec and the registration in `custom/index.ts`:

```sh
npm run new:contribution -- --slot DOCUMENT_ACTIONS --id custom.contract.approve
npm run new:layout -- --type Contract --modes view,edit,create
```

Contribution IDs start with the owner prefix. Paired slots (`*_ITEMS` / `*_PAGES`, `ADMINISTRATION_MENU`) generate the page and register both halves. `new:layout` covers `create`, `edit`, `view`, `metadata` and `import`. List and grid cards are result projections, not layouts (see Result projections).

A layout that a host opens in a dialog (create, edit, metadata) can inject `DOCUMENT_LAYOUT_HOST`: `complete(documents)` reports the saved documents, refreshes the listing and closes the dialog, and `cancel()` closes it. Inline hosts provide none, so inject it with `{ optional: true }`. Dialog hosts assign inputs directly, so layouts declare `layoutContext` as an `@Input()` property rather than a signal input.

An `import` layout edits the properties of one dropped file, as in Polymer's `nuxeo-document-import`. The import dialog owns the files, the per-file navigation, "Apply properties to other files", the upload and the document creation, and mounts the layout again for each selected file. The layout injects `DOCUMENT_IMPORT_DRAFT`: `file`, `properties` (a snapshot taken at mount; `dc:title` starts as the file name), `update(properties)` to merge edits and `setValid(valid)`; the dialog creates no documents while a layout reports invalid values. `SchemaLayoutComponent` with `mode="import"`, `[draftOnly]="true"` and `[initialValues]="draft.properties"` renders the fields without saving, which is what the generated template does. Types with no import layout keep the shared-metadata import form.

Client registrations execute as trusted compiled Angular code. They are not separately downloaded executable plugins.

Drawer pages can also set `retain: true` and implement `GuardedView`. Inactive retained pages remain hidden and inert within their user/repository/document scope. Route departure and explicit sign out check all mounted view guards; tab changes and drawer closing check the active page. Registry removal and eligibility changes remain authoritative.

The default document toolbar also contributes `maretha.document.favorite`, `notifications`, `lock`, `download` and `publish` (all using the same `maretha.document.` prefix). These can be removed or replaced independently. Mutation preflights re-read the document and check current eligibility; lock removal checks ownership. The shared notification enricher determines subscription state.

### Polymer filters

`nuxeoFilter()` builds a `when` predicate with `<nuxeo-filter>` semantics, so a migrated filter maps attribute for attribute:

```ts
defineContribution(DOCUMENT_ACTIONS_SLOT, {
  id: 'custom.contract.approve',
  when: nuxeoFilter({
    type: 'Contract',
    permission: 'Write',
    expression: (document, user, filters) => !filters.isTrashed(document),
  }),
  loadComponent: () => import('./approve.component').then((m) => m.ApproveComponent),
});
```

`type`, `facet`, `schema`, `state`, `permission` and `group` take comma-separated values and pass when any value matches. `path` is one prefix and, as in Polymer, a regular expression source. Every condition that is set must pass. `group` reads the context `user` (SDK `groups` or Nuxeo `extendedGroups`). The Polymer string `expression` becomes a typed function; `NUXEO_FILTERS` supplies the `FiltersBehavior` helpers that expressions called as `this.*`. Unknown conditions or wrong value types throw when the filter is defined. A throwing expression fails closed with a `condition-failed` diagnostic.

### Named visibility rules

Compile predicates into SDK extension providers. Overrides refer to a rule by ID.
Rules restrict UI visibility and do not grant server permissions. Existing contribution `when`
predicates remain in force.

```ts
import { DOCUMENT_ACTIONS_SLOT, provideWebUiExtensions } from '@maretha/webui-sdk';

provideWebUiExtensions({
  id: 'client.review',
  visibilityRules: [
    {
      id: 'client.review.allowed',
      evaluate: (context) => DOCUMENT_ACTIONS_SLOT.isContext(context) && !context.noEdit,
    },
  ],
});
```

The predicate receives the selected slot's context. Use fields supplied by that slot's host,
validate their shape, and return a synchronous boolean. A rule designed for one slot may be
inapplicable to another. The registry never evaluates predicates when producing catalog metadata.
Rule IDs must be unique across registered extension layers; use an extension-owned prefix.
Replacing a layer replaces its rules, and unregistering it removes them.

A compiled override can select a registered rule:

```ts
provideWebUiExtensions({
  id: 'client.review.visibility',
  overrides: [
    {
      slot: 'DOCUMENT_ACTIONS',
      id: 'client.contract.review',
      visibilityRule: 'client.review.allowed',
    },
  ],
});
```

An unknown `visibilityRule` skips the entire override row, including `disabled` and `order`,
with an `unknown-visibility-rule` registry diagnostic. The existing compiled contribution
remains effective.
A known rule returning anything other than `true`, or throwing, hides the contribution; thrown
exceptions produce a sanitized diagnostic. Rules always combine with the original `when`.

For a guard that overrides must never remove, put `requiredVisibilityRule` on the compiled
contribution definition. It is evaluated independently of the optional override rule. Missing,
false, throwing, and asynchronous required rules all hide that contribution. Overrides cannot
set or clear this field. The bundled administration page requires `maretha.administration-access`,
which uses the existing administrator/powerusers predicate against the page context's user.
This preserves the existing administration condition and server authorization checks.

`app/ui-catalog/ui-catalog.json` lists bundled rule IDs and required-rule references. It describes the default
provider composition, not custom client providers or current user access. Refresh it with
`node scripts/update-ui-catalog.mjs`; the focused catalog test checks the entire default
registration inventory in both directions. It documents registrations, not behaviour.

### Repository navigation and search defaults

The drawer includes replaceable `maretha.drawer.personal-workspace`, `maretha.drawer.trash`, `maretha.drawer.expired`, and `maretha.drawer.assets` item/page pairs. Search results are independently replaceable `PAGES` contributions (`maretha.page.trash`, `.expired`, `.assets`); administrator NXQL search is `maretha.admin.nxql`. Search criteria use the URL (`q`, `path`, `nxql`, `facets`), explicit displayed-document selection, repository-scoped requests, paginated results, and retryable failures. Saved-search authoring, reference result grids/queues, and automatic-search controls remain parity work.

`maretha.document.share` copies an application-base-aware permanent link without changing permissions. `maretha.blob.preview` displays local draft files and authenticated persisted blobs; image/audio/video/PDF/text renderers release resources when closed. HTML is displayed as text. Other persisted formats request the server's `any2pdf` converter; conversion availability and specialized rendition parity depend on the server profile. Save attachment drafts before requesting server conversion, because draft positions may no longer match saved blob XPaths.

`maretha.selection.download` is available in result-selection and collection-action slots. It submits explicit selected IDs to `Blob.BulkDownload/@async` and polls the returned status URL. Cross-origin development must expose the `Location` response header. “Stop waiting” cancels browser requests, not an already-running server job.

`maretha.selection.publish` opens the same publishing slots for a snapshot of selected IDs. The internal page rechecks each source immediately before publishing, shows partial progress, skips known successful IDs on retry, and can stop after the current operation. An interrupted request has an unknown outcome: inspect the destination before retrying that document. It blocks navigation while a mutation is in flight. Collection clipboard actions are independently configurable through `COLLECTION_ACTIONS`.

Retained editors with pending changes are temporarily revealed while their asynchronous departure guard runs. Accepted selection and URL remain stable until the navigation decision resolves.

### Result projections

`ResultsProjectionComponent` is the public renderer for the Nuxeo result, data-list, data-grid and data-table template family. Table mode uses AG Grid Community and keeps the existing projected `cell:<id>`, checkbox, action, settings and detail hooks; its header remains visible for an empty result. SDK consumers need the `ag-grid-angular` and `ag-grid-community` peers. It accepts rows, selected IDs, column metadata, a `contextEpoch`, a scope value and optional permission predicate. Set `selectionEnabled="false"` for a read-only listing without the checkbox column; this does not suppress projected actions. Set `columnChooser` to render the stock column-settings gear as the last header cell of the table; `columnChooserOpen` then emits the gear button when it is clicked, so the host opens its Columns Settings dialog and restores focus to it. `loadMore` emits once at the loaded bottom and resets when the context or loaded row count changes. Its default height is `min(60vh, 600px)` and hosts can override `--nx-results-projection-grid-height`. Grid sorting and text filtering apply only to rows currently loaded by the host; retain server-backed controls when a query requires complete-result ordering or filtering. Use `nxResultsTemplate` on an `ng-template` to replace `default`, `item`, `selectiontoolbar`, `selectionActions`, `actions`, `cell`, `rowdetail`, `checkbox`, `settings`, `detail`, `action`, `form` or `empty`. Row templates receive `row`, `index`, `column`, `value`, `selection`, `readonly`, `loading`, `toggleSelection()` and `invokeAction()`; host templates receive rows, selection, columns and guarded selection/action callbacks. Increment `contextEpoch` whenever the backing row objects are replaced so retained callback references cannot act on a newer result scope. The `mode` input takes a `ResultsProjectionMode`: `table` (the default), `list` or `grid`.

```html
<nx-results-projection
  [rows]="rows"
  [selection]="selectedIds"
  [columns]="columns"
  [contextEpoch]="resultEpoch"
  (selectionChange)="selectedIds = $event"
>
  <ng-template nxResultsTemplate="cell" let-row="row" let-column="column" let-value="value">
    {{ column?.id === 'title' ? row.title : value }}
  </ng-template>
</nx-results-projection>
```

Hosts own their templates; `custom/` replaces them through `provideResultsProjections()`. A registered component wins over the host's template of the same name and receives the same context as its `context` input. Narrow it with `hostId` (`generic-folderish`, `picturebook-content`, …), `mode` and `when`; the highest `priority`, then the earliest registration, wins. Polymer hardcoded its grid card (`nuxeo-document-grid-thumbnail`) in each folder view layout; a per-type card is an `item` projection:

```ts
provideResultsProjections({
  id: 'custom.contract.card',
  projection: 'item',
  mode: 'grid',
  when: (context) => (context as ResultsProjectionContext).row.type === 'Contract',
  component: ContractCardComponent, // @Input() context: ResultsProjectionContext
});
```

### Complete query exports

`ResultsToolbarContext.queryScope` optionally carries the complete applied `ResultsQueryScope`: repository, provider name, positional query parameters and named filters. Hosts must omit it if any active filter or repository constraint cannot be represented. It does not authorize query-wide mutations or change explicit selection semantics. The repository search workbench supplies it from the same parameter builder as its result request.

`maretha.results.csv-export` uses this scope in `RESULTS_ACTIONS`, snapshots it before submitting `Bulk.RunAction/@async` with `csvExport`, and offers a file link after completion. It exports dublincore fields across the full matching result set. Status and result URLs must stay within the configured Nuxeo origin/context; external blob delivery profiles need a qualified adapter. “Stop waiting” cancels browser requests only. Known partial failures are reported instead of presenting a successful export. Legacy browse/search hosts without a complete scope do not show this action yet.

`ResultsToolbarContext.columns` optionally lists the visible result columns that show one document field (`field`, `label`, `labelKey`). `maretha.results.spreadsheet` (Polymer's `spreadsheetButton`, enabled by default) loads every page of the snapshotted scope into an AG Grid Community grid with those columns, or Title, Modified, Last contributor and State when the host supplies none. Rows without Write permission, user and document references, multi-valued directories, blobs and complex fields are read-only. Saving sends each changed document with its change token; closing after a save calls `refresh()`.

`columns` and `queryScope` are declared on `ResultsSelectionContext`, which `ResultsToolbarContext` extends, so `TRASH_RESULTS_SELECTION_ACTIONS` receives them too. That context also carries `items`, the host's loaded results in display order (its own array, not a copy), and `displayMode` (`table`, `list` or `grid`). Both trash views supply `items`, `columns` and, once loaded, `queryScope`; the document toolbar above folder listings supplies `items` and the listing's mode but no columns.

### Global Quick Search

`SHELL_ACTIONS` contains the replaceable `maretha.shell.quick-search` default. Disable it with a standard override, or supply another component with `ShellActionContext`. Its `navigate(url)` uses the application router and existing departure guards.

`QUICK_SEARCH_ACTIONS` adds client command results to the search overlay. It is an additional Maretha slot; the 24 Polymer baseline slot names are unchanged. Commands receive `QuickSearchContext`, including `searchTerm`, user, current document, locale, guarded `navigate()` and `close()`. Use `when` for exact/prefix/regex matching, and ordinary contribution order/overrides for composition. `QuickSearchCommandComponent` supplies accessible result presentation and awaits the command; return `false` to keep the overlay open after a canceled action.

```ts
import {
  defineContribution,
  QUICK_SEARCH_ACTIONS_SLOT,
  QuickSearchCommandComponent,
  QuickSearchContext,
} from '@maretha/webui-sdk';

const helpCommand = defineContribution(QUICK_SEARCH_ACTIONS_SLOT, {
  id: 'client.quick-search.help',
  component: QuickSearchCommandComponent,
  when: (context) => context.searchTerm.trim().toLowerCase() === 'help',
  inputs: {
    label: 'Open help',
    icon: 'nuxeo:search',
    run: (context: QuickSearchContext) => context.navigate('/page/help'),
  },
});
```

Register that contribution in a client extension and supply the corresponding `PAGES` page. User/group result pages are independently replaceable defaults `maretha.page.user` and `maretha.page.group`. They show read-only identity and membership; advanced profile editing and administration are separate surfaces. Quick Search supports the default repository document route. Suggestions from another repository report an explicit unsupported-route message rather than opening the same UID in the wrong repository. Server highlight snippets are rendered as text, never injected as HTML.

## Native fields and host services

`provideDocumentFieldExtensions({ id, schema, documentTypes, modes, fields })` adds schema-verified fields to native create/edit/metadata forms. Existing documents must actually carry the schema; create forms use the server's type schemas. The native form retains one dirty state and save transaction, schema constraints, metadata policy, retention checks and permission checks. Registered layout widgets also apply to these fields. A missing schema does not fabricate fields or a document type.

`DOCUMENT_CONTENT_RENDERER` supplies the host's authenticated content viewer to document layouts; pass its `document` input through `NgComponentOutlet`. `RESULTS_COMMAND_GATEWAY` reuses the host's permitted selection commands and takes a current-scope callback so stale selections cannot execute. `SAVED_SEARCH_GATEWAY` provides saved-search listing, persistence and permission operations without exposing the host's private service implementations. These ports are provided by the application; add-on packages depend only on the public SDK and Angular peers.
