# Releasing

How a release is cut. Not needed for customizing or contributing.

## Release model

- Releases are tags `v1.x.y` on `main`. Upgrade a copy by merging the next tag into it and
  running `npm run verify` ([customizing.md](customizing.md#upgrade-to-a-new-release)).
- A `release/x.y` branch exists only when an older line needs a patch after `main` has moved on.
- Published tags never move.
- A release publishes no package zip: users build from the tag with
  [nuxeo/README.md](../nuxeo/README.md) or [standalone.md](standalone.md). The tag run publishes
  the SDK archive, `core.manifest.json` and their digests.

## Steps for every release

1. `CHANGELOG.md`: the new version's entry (Keep a Changelog) and the matching
   [SDK release notes](../app/extensions/CHANGELOG.md).
2. Version bump on every release surface: `package.json` and the lockfile root, the SDK, the four
   poms, both `MANIFEST.MF` files (72-byte wrapping kept) and `package.xml` through `@VERSION@`.
   `npm run verify:nuxeo-package` and `npm run verify:release-identity` check that they agree.
3. Build the Nuxeo package with `npm run package:nuxeo` (it runs the server bundle's Java tests)
   for qualification.
4. `npm run release:core-manifest` as the last change of the pull request.
5. Merge the release pull request on green checks.
6. Deploy the candidate to a Nuxeo server and review it.
7. Tag `v<version>` on the merge commit and push the tag. The tag run executes
   `npm run verify:release`, uploads `dist/release/` (the SDK tarball, `core.manifest.json` and
   `sha256sums`) as the `release-files` artifact, and attests every file listed in `sha256sums`
   (build provenance).
8. Download the assets; check versions, notices and digests. Build the Nuxeo package from the tag.
   Run `gh attestation verify <file> --repo maretha-labs/maretha-angular-webui` on each asset.
   Smoke-install the package built from the tag.
9. GitHub Release with the CHANGELOG notes, supported platforms, limitations and the assets.

After a major or minor release, refreeze `contracts/sdk-baseline` at it for the next line's
upgrade rehearsals ([sdk-compatibility.md](sdk-compatibility.md#upgrade-rehearsal)).

## `maretha-labs` release checklist

Every `maretha-labs` repository passes the
[release checklist](https://github.com/maretha-labs/.github/blob/main/RELEASING.md). How this
project meets each item, with the deviations it takes:

| #   | Checklist item                                    | How this project meets it                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Tracked files only (`git archive HEAD`)           | The release commit is exported with `git archive` into an empty directory; nothing is removed by hand after export.                                                                                                                                                                                                                  |
| 2   | Placeholder pass                                  | No hosts, IP addresses, bucket names, repository slugs outside `maretha-labs`, usernames, emails other than `maretha@maretha.io` or internal project names anywhere in the tree, README included. Parity origins are environment variables.                                                                                          |
| 3   | Required, not defaulted                           | Settings that name a server are required environment variables that fail loudly when unset; the `maretha/no-credential-default` lint rule rejects a credential read with a hard-coded fallback.                                                                                                                                      |
| 4   | LICENSE, SECURITY.md, README security notes       | **Deviation: Apache-2.0, not MIT.** It matches Nuxeo Platform and the Nuxeo Web UI and Nuxeo Elements material this project derives from, and adds an explicit patent grant; third-party licences and notices are preserved (NOTICE). SECURITY.md puts private vulnerability reporting first; the README carries the security notes. |
| 5   | No push-triggered CI                              | **Deviation:** CI runs on `pull_request`, `workflow_dispatch` and tag pushes `v*`; CodeQL also runs on pushes to `main` and weekly. Required checks need pull-request runs; release assets are built by the tag run.                                                                                                                 |
| 6   | Code still works after edits                      | `npm run verify:release` on the exported tree, then a fresh-clone build, package and customization walkthrough.                                                                                                                                                                                                                      |
| 7   | gitleaks on tree and history, plus a grep battery | gitleaks on the export and on the single-commit repository (`.gitleaks.toml` allows the manifest's digests); a grep over the export for every value class in item 2.                                                                                                                                                                 |
| 8   | Wording                                           | No README, notice, changelog, commit message or description calls this project a mirror, snapshot, export or rewrite of other code. Third-party sources (Polymer Web UI assets) are named with licence and provenance in the third-party inventory.                                                                                  |
| 9   | Single commit, company authorship                 | One commit on `main`, authored with the company identity and signed off.                                                                                                                                                                                                                                                             |
| 10  | Publish                                           | Push, description, topics (`nuxeo`, `angular`, `web-ui`, `enterprise-content-management`, `llm-agents`), entry in the `maretha-labs` profile README.                                                                                                                                                                                 |
