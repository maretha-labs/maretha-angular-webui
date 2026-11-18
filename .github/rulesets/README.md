# Rulesets

The branch and tag protection of this repository, as JSON for the rulesets API. Applied once,
right after the first push to `main`, with:

```bash
gh api -X POST repos/maretha-labs/maretha-angular-webui/rulesets --input <file>.json
```

| File                  | Target         | Bypass             | Purpose                                                                                                |
| --------------------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `main-a-checks.json`  | default branch | `maintainers` team | PR required, the `Runtime checks` job and DCO, linear history, no force-push, no deletion.             |
| `main-b-review.json`  | default branch | `maintainers` team | One approval, CODEOWNERS review, stale approvals dismissed. The `maintainers` team bypasses only this. |
| `tags-create.json`    | `refs/tags/v*` | `maintainers` team | Only the `maintainers` team creates release tags.                                                      |
| `tags-immutable.json` | `refs/tags/v*` | none               | No one moves or deletes a published tag.                                                               |

Before applying:

- Team id: `20545490` is the `maintainers` team. Recheck with
  `gh api orgs/maretha-labs/teams/maintainers --jq .id`.
- Required check contexts: the `Runtime checks` job of `ci.yml` and the DCO app's check. The other
  jobs and the `contribution-gate` check run on every pull request without being required. The first CI run on the public
  repository shows the exact names the workflows emit; the list must match them character for character.

To confirm when applying them to the public repository:

- `allowed_merge_methods` in the `pull_request` rule (squash only).
- Bypass is per ruleset: the `maintainers` team bypasses the checks ruleset and the review ruleset.
- Rulesets are unavailable on the free plan for private repositories (HTTP 403); public
  repositories are expected to work.
