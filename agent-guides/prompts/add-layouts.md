# Add document layouts

```text
Read AGENTS.md. We are customizing a release of the Maretha Angular Web UI; only the customization zone
may change.

Give the document type <Type> its own forms. Generate them with
`npm run new:layout -- --type <Type> --modes <create,edit,view,metadata,import>`, then edit the
shared fields file: the properties are <schema:property list with labels, required flags and
limits>. The server schema is the source of truth for types; the layout adds presentation only
(agent-guides/03-document-layouts.md). Keep the generated host wiring: dialogs complete through
DOCUMENT_LAYOUT_HOST, the import layout edits DOCUMENT_IMPORT_DRAFT and never saves.

Labels go through custom/i18n with `labelKey`. Keep and extend the generated specs.

Done means `npm run verify` is green and you list the files you changed. If <Type> does not
exist on the server, say so: the type and its schema are server configuration, not UI code.
```
