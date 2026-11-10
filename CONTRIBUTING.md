# Contributing

Thank you for helping. This project merges only confirmed work, and every check that guards
`main` applies to every pull request.

## Customizing versus contributing

- **Customizing a release:** work only in the customization zone listed in
  [AGENTS.md](AGENTS.md). Nothing there comes back upstream. Start from
  [docs/customizing.md](docs/customizing.md).
- **Contributing upstream:** you change core files and send a pull request here. The rest of
  this page is for you.

Examples of customizations belong in `examples/`, never in `custom/` or the other
customization paths.

## Which route fits your change

| Change                                                 | Requirement                                                                                                                   | Title type                                                             |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Product bug or feature                                 | An open issue carrying `confirmed:bug` or `confirmed:feature`, applied after triage, named in the description (`Closes #123`) | `fix:` or `feat:`                                                      |
| Documentation or isolated tests                        | A clear pull request description; the changed files must be documentation or tests only                                       | `docs:` or `test:`                                                     |
| Maintenance (build, CI, tooling, dependencies by hand) | Clear scope; name a confirmed issue when product files change                                                                 | `chore:`, `build:`, `ci:`, `refactor:`, `perf:`, `style:` or `revert:` |
| Dependabot                                             | Handled by the bot                                                                                                            | Dependabot's                                                           |
| Security report                                        | Never a public pull request: see [SECURITY.md](SECURITY.md)                                                                   | Coordinated privately                                                  |

The type in your pull request title picks the route. Your branch name doesn't matter: name
the branch on your fork anything you like. (Branches in this repository itself use
`<route>/<slug>`, for example `fix/123-drawer-toggle`.)

The `contribution-gate` check enforces this table on every pull request and explains in one
comment what is missing. Push a fix or edit the pull request and it runs again; `/gate`
in a comment from an account with write access runs it too.

New issues are triaged within 14 days. New here? Issues labelled
`good first issue` are confirmed and small enough for a first pull request.

## Workflow

1. Fork the repository and create a branch from `main`. Any name works.
2. Make the change. Keep it to one concern.
3. Run the upstream checks: `npm run verify:upstream`. It runs everything the public CI runs.
4. Regenerate the core manifest as the **last** change, after staging your files by name:
   `npm run release:core-manifest`. Commit the regenerated `core.manifest.json`. CI recomputes
   it and fails on any difference. Never edit it by hand. A change limited to `package.json`,
   `package-lock.json` or `.github/` leaves it unchanged.
5. Sign off every commit (Developer Certificate of Origin): `git commit -s`. The DCO check
   fails on a commit without a `Signed-off-by` line matching its author. To fix that without
   rewriting history, push a follow-up commit, itself signed off, whose message contains one
   line per unsigned commit:
   `I, Your Name <you@example.com>, hereby add my Signed-off-by to this commit: <full SHA>`.
6. Open the pull request with a [Conventional Commits](https://www.conventionalcommits.org/)
   title whose type matches the route, for example
   `fix: keep the drawer toggle clear of the selection column`. Name the confirmed issue in
   the description (`Closes #123`) and fill in the template.

Pull requests are squash-merged; the title becomes the commit message.

### When the manifest conflicts

Concurrent pull requests that touch core files both change `core.manifest.json`. Do not
resolve that conflict by hand: rebase on `main`, run `npm run release:core-manifest` again,
commit, push.

### Server bundle changes

CI does not compile the Nuxeo server bundle (`nuxeo/server`). Say in the description that
you changed server code; `npm run package:nuxeo` builds it and runs its Java tests before
merging. See
[nuxeo/README.md](nuxeo/README.md).

## Review

- Every pull request is reviewed; CODEOWNERS routes it.
- An automated review agent may comment. It is advisory: it never approves, blocks or
  merges, and its comments are not requirements. See
  [.github/review-agent.md](.github/review-agent.md).
- With write access, a pull request merges on green required checks alone; otherwise it also
  needs one approval.
- How work is decided, merged and released: [GOVERNANCE.md](GOVERNANCE.md).

## Licensing

Contributions are licensed under the project licence ([LICENSE](LICENSE), Apache-2.0).

## Conduct

Everyone taking part follows the [Code of Conduct](CODE_OF_CONDUCT.md).
