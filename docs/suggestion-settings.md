# Search-as-you-type settings

Every field that searches as you type (user and group pickers, document and
vocabulary pickers, tags) waits for a minimum number of characters, then for
typing to pause, before it sends a search. Below the minimum it sends nothing
and shows stock's "Please enter 3 or more characters" (`selectivity.minChars`).
A newer term replaces a pending or running search.

The values live in the web UI, not on the Nuxeo server:
`custom/suggestions.json`, which the build copies unchanged to the same path in
the application. Edit the source before a build, or the copy in a deployed
application. On Nuxeo the copy is `nxserver/nuxeo.war/ng/custom/suggestions.json`,
and each server start replaces it with the packaged copy; edit the source there,
then rebuild and reinstall the package. `custom/` is the customization zone, so
`npm run verify:core-manifest` does not report edits to it. The app reads the
deployed copy once at startup; nothing waits for it. Until it has been read, or if it
cannot be read or is not a JSON object, the built-in values apply. They are
the values the file ships with, which reproduce stock Web UI. Besides the
values below, the file lists every built-in id from the table in Ids with an
empty entry, `{}`, which sets nothing until values are added to it:

```json
{
  "minChars": 3,
  "pauseMs": 300,
  "widgets": {
    "tag": { "minChars": 1 }
  },
  "fields": {
    "dc:nature": { "minChars": 0 },
    "dc:subjects": { "minChars": 0 },
    "dc:coverage": { "minChars": 0 }
  },
  "layouts": {
    "maretha.dialog.add-to-collection": { "minChars": 0 },
    "maretha.publish.section": { "minChars": 0 },
    "maretha.retention.attach-rule": { "minChars": 0 }
  }
}
```

- `minChars` is stock `min-chars` (nuxeo-selectivity `minChars`), 0 to 100.
  0 searches with an empty term, so vocabulary lists open populated.
- `pauseMs` is stock nuxeo-selectivity `frequency`, 0 to 10000 milliseconds.
- `widgets` sets the kinds: `user` (users and groups), `document` (documents,
  collections, publication sections, retention rules), `directory`
  (vocabularies), `tag`.
- `fields` sets a document property or form field, such as `dc:nature`.
- `layouts` sets a layout, dialog or page by id. A layout entry takes the same
  `minChars`, `pauseMs`, `widgets` and `fields` keys.

The file replaces the built-in values rather than merging with them; copy the
entries you keep. Invalid values are ignored. No test or formatting check reads
the file, so editing it never fails them; a file that cannot be read only logs
a console warning, and the built-in values apply. Each value is looked up from the
most specific level: the layout's field, the layout's widget kind, the layout,
then the application's field, widget kind and default.

## Ids

| Id                                                                                        | Fields                                                    |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `nuxeo.task38e`, `nuxeo.task2556`                                                         | Participants in the serial and parallel review task forms |
| `nuxeo.task542`, `nuxeo.task6d8`, `nuxeo.task328d`, `nuxeo.task2169`                      | Other built-in workflow task forms (no search field)      |
| `default.document-layout.<type>.<mode>`, such as `default.document-layout.workspace.edit` | Document create, edit, import, metadata and view layouts  |
| Layout ids from `custom/` registrations (not in the shipped file; add them when needed)   | Their own document and workflow layouts                   |
| `maretha.dialog.task-assignment`                                                          | Delegate and Reassign                                     |
| `maretha.dialog.add-to-collection`                                                        | Add to collection                                         |
| `maretha.publish.section`                                                                 | Publication location                                      |
| `maretha.retention.attach-rule`                                                           | Retention rule to attach                                  |
| `maretha.document.standard-permissions`                                                   | Permissions view                                          |
| `maretha.document.history`                                                                | Activity user filter                                      |
| `maretha.document.standard-history`                                                       | History view user filter                                  |
| `maretha.admin.audit`                                                                     | Audit user filter                                         |
| `maretha.admin.users`                                                                     | User and group editor                                     |

The shipped file lists all 78 document layout ids: the 76 built in, plus
`default.document-layout.any.metadata` and
`default.document-layout.any-media.metadata`, the metadata layouts of types
without their own.

The search pane's tag filter has no id; it uses the application levels. Fields that are not document properties use these
`fields` keys: `participants` (workflow participants), `principalName` (audit,
activity and history user filters), `nxtag:tags` (tag editor, details-panel tags), `ecm:tag` (search tag
filter). Quick search is not a suggestion field: like stock's suggester, it
searches from the first character.

## Extensions

The SDK exports `SuggestionSettings`, `SuggestionScope`,
`provideSuggestionScope`, `suggestionLimits`, `suggestionTerms` and
`SUGGESTION_OPTIONS`. A custom picker reads its limits in an injection context
and applies them to its terms:

```ts
readonly limits = suggestionLimits('user', () => 'my:approver');
readonly results$ = this.terms$.pipe(
	suggestionTerms(this.limits), // null: too short, search nothing
	switchMap((term) => (term === null ? of([]) : this.search(term))),
);
```

Hosts that mount layouts provide a `SuggestionScope` set to the layout id; a
custom dialog can provide its own with `provideSuggestionScope('my.dialog')`.
`SUGGESTION_OPTIONS` replaces the built-in values at bootstrap; the deployed
file still replaces them once read.
