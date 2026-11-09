# Add a contribution

```text
Read AGENTS.md. We are customizing a release of the Maretha Angular Web UI; only the customization zone
may change.

Add a <button | notice | page | tab | menu entry> that <what it does, for whom> at <where in the
UI>. Pick the slot from agent-guides/02-slot-catalog.md and generate it with
`npm run new:contribution -- --slot <SLOT> --id <prefix>.<name>` (the prefix is in
custom/owner.json). Show it only when <condition, such as the document type is Contract and the
user may write>, using `when` or `nuxeoFilter` as in agent-guides/04-recipes/visibility.md.

Read the slot's context for the data; never mutate it; call the server through Angular's
HttpClient on the user's action only, never at registration. Labels go through custom/i18n (see
agent-guides/04-recipes/i18n.md). Extend the generated spec to cover the behaviour you add.

Done means `npm run verify` is green, you list the files you changed, and you stop and say so if
the task needs a file outside the customization zone.
```
