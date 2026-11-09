# Never

Each item is caught by a check, a lint rule or the next upgrade. Doing it anyway fails
`npm run verify`, fails CI, or loses the work.

## Customizing a release

- Edit a file outside the customization zone ([01-boundaries.md](01-boundaries.md)).
- Run `npm run release:core-manifest`, or edit `core.manifest.json` by hand.
- Use the prefix `maretha`, or an id or selector without your prefix.
- Import from `custom/` anything but your own files, `@maretha/webui-sdk`, `@angular/*`,
  `rxjs`, `tslib` and the allowlist; import an `app/...` path; import AG Grid or AG Charts
  Enterprise.
- Silence a lint finding with `eslint-disable`.
- Read a credential-named environment variable with a hard-coded fallback; commit a host, an
  account, a token or a `.env` file.
- Treat a `when` predicate or a visibility rule as authorization. It hides UI; Nuxeo decides
  permissions, and the host rechecks them before a mutation.
- Mutate the `context` object a slot passes in. Replace it with a new object.
- Fork the public repository on GitHub for your copy: a fork of a public repository is
  public. Clone the release tag into a private repository.
- Delete a generated spec, or edit the markers out of `custom/index.ts`.
- Mention a deployment, a host or an account in a committed file.

## Contributing upstream

- Put a customization in `custom/`. Examples go under `examples/`.
- Commit a hand-edited `core.manifest.json`, or regenerate it before staging the rest of the
  change.
- Lower a coverage floor, add a coverage-ignore directive or widen a coverage exclusion;
  `npm run verify:coverage` fails and compares against the base commit in CI.
- Rename, remove or re-pair a default contribution without the compatibility review that
  `npm run verify:sdk-ids` asks for; change the SDK surface without regenerating
  `contracts/webui-sdk.api.md`.
- Add a production dependency whose licence is outside the allowlist without a reasoned entry
  in `docs/third-party/exceptions.json`; copy third-party material without an inventory entry.
- Name a deployment, a host, a runner or an account in the public tree.
