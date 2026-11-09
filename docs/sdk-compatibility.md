# SDK compatibility checks

The SDK boundary consists of the packed `@maretha/webui-sdk` package and stable contribution identities. Run the checks after building the package:

```sh
npm run pack:sdk
node scripts/check-sdk-api.mjs
node scripts/check-sdk-ids.mjs
node scripts/verify-sdk-consumer.mjs
node scripts/verify-sdk-upgrade.mjs
```

The consumer and upgrade checks install tarballs into isolated temporary workspaces, with no repository TypeScript aliases or inherited configuration. They run `npm install`, a clean `npm ci`, and the production Angular build of `examples/client-webui`. They need access to the npm registry or a populated npm cache. Each tarball gets a path containing its SHA-256 digest so replacing a same-version package cannot reuse stale package or Angular caches. Reports are written under `dist/verification`; `--keep` retains the temporary workspace for diagnosis.

## Public API review

`contracts/webui-sdk.api.md` records the built declaration entrypoint, package exports, and peer dependencies. Union members are recorded in sorted order, since the declaration bundler emits them in an order that changes between builds. The TypeScript printer removes comments and normalizes formatting; referenced support types and Angular component metadata remain included. Imports beginning with `node_modules/` are rejected before comparing or updating the report: exported members must use portable package types rather than inferred local installation paths. This is a conservative review gate, not an automatic semantic-version classifier. A report difference fails CI even for an additive change.

For an intentional API change, review the source and generated declaration changes, rebuild, and run:

```sh
node scripts/check-sdk-api.mjs --update
```

Commit the reviewed report alongside the implementation. Do not update snapshots merely to silence CI. Removing an export, narrowing an accepted input, changing a context contract, or removing a component input requires a migration and the appropriate breaking release policy.

## Versioning and release notes

The SDK version in `app/extensions/package.json` moves in lockstep with the
application's version in `package.json`; `npm run verify:nuxeo-package` rejects a
difference. Before merging a public contract change, review its compatibility,
document the migration in [`app/extensions/CHANGELOG.md`](../app/extensions/CHANGELOG.md)
under the next version, and mark **Public SDK API** in the pull request template. Package the release notes with the SDK and
verify the resulting tarball.

Version `1.0.0` adds a required `activateRow` callback to
`ResultsProjectionContext`. Context-producing custom hosts and test fixtures
must supply it; consumers of contexts supplied by the stock projection host
receive it automatically. Existing `^0.1.2` consumers do not select it
automatically. The release notes list the other projection additions.

## Contribution identities

New contribution IDs use `owner.surface.name`, for example `acme.document-actions.approve`. The owner is a stable extension namespace; surface names describe where the contribution belongs; the final name describes its function. Existing IDs remain valid even where older naming differs. Labels, translated text, array positions, component names, and display order are not identities.

Slot names and contribution IDs are the keys `custom/` overrides target. Renaming or removing an ID or slot is a breaking change. Changing its owner, slot context, or pair membership also requires explicit compatibility review. The identity snapshot excludes presentation defaults such as order and visibility, which may evolve while `custom/` overrides retain their meaning.

`contracts/contribution-identities.json` records the canonical catalog's identities, contexts, owners, and pairs. The catalog contract tests separately prove that this catalog matches runtime registrations. After reviewing an intentional addition or migration, update the identity snapshot explicitly:

```sh
node scripts/check-sdk-ids.mjs --update
```

Never recycle a removed ID for a different behavior. Registering an override of a removed target fails with an error naming that target.

## Upgrade rehearsal

`contracts/sdk-baseline` freezes a local SDK build taken after runtime UI configuration and editor integrations were removed. This is a local compatibility baseline, not a published release. Its manifest verifies the archive's hash. `contracts/sdk-upgrade` contains one independently authored client extension with code-level overrides; the rehearsal copies it once and leaves it unchanged through the upgrade.

The check builds the standalone example against the baseline, then installs and builds against the candidate. For each artifact, it compiles the same client extension with that artifact's SDK declarations, then executes the installed SDK registry in Node. Two controlled sets of compiled defaults represent consecutive application releases. Assertions verify that hide, show, and order overrides keep their meaning, an override of a removed target fails registration with an error naming its ID, the custom extension remains available, and deleting an override reveals the candidate's new default. The final report records both package hashes and the unchanged client extension hash.

The initial baseline is version `0.1.0`; the candidate uses the SDK version declared in its package manifest. Artifact hashes identify the exact builds tested, including repeated development builds of the same unreleased version. This rehearsal covers the exercised package contracts; it does not prove source compatibility for every context object a consumer might construct. Follow the release migration notes for breaking contract changes. Browser interaction and Nuxeo authentication acceptance remain separate checks.

Advance the frozen baseline only after a candidate is accepted as the new supported baseline: copy its tarball into `contracts/sdk-baseline`, update the manifest hash/version, and review the binary provenance. Keep the unchanged client extension fixture unless a separately documented migration requires changing it. Re-run the rehearsal before committing the baseline update.

## Proving that the guards fail

```sh
node scripts/verify-sdk-check-failures.mjs
```

This slower diagnostic works on temporary copies only. It first proves a nonportable declaration import is rejected even when updating the report. It removes a real public component export and proves both the API report and standalone consumer build fail. It then changes the packed registry's override behavior and proves the upgrade rehearsal fails its `custom/` override assertion. A nonzero process exit counts only when the expected diagnostic is present, so an unrelated dependency or network error cannot be mistaken for success. Logs and a machine-readable report are saved under `dist/verification`; the package and repository sources are untouched.
