# Rulesets

The branch and tag protection of this repository, as JSON for the rulesets API. Applied once,
right after the first push to `main`, with:

```bash
gh api -X POST repos/maretha-labs/maretha-angular-webui/rulesets --input <file>.json
```

| File                  | Target         | Bypass             | Purpose                                                                                                |
| --------------------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `main-a-checks.json`  | default branch | none               | PR required, required checks, linear history, no force-push, no deletion. Applies to everyone.         |
| `main-b-review.json`  | default branch | `maintainers` team | One approval, CODEOWNERS review, stale approvals dismissed. The `maintainers` team bypasses only this. |
| `tags-create.json`    | `refs/tags/v*` | `maintainers` team | Only the `maintainers` team creates release tags.                                                      |
| `tags-immutable.json` | `refs/tags/v*` | none               | No one moves or deletes a published tag.                                                               |

Before applying:

- Team id: `20545490` is the `maintainers` team. Recheck with
  `gh api orgs/maretha-labs/teams/maintainers --jq .id`.
- Required check contexts: the job names of `ci.yml`, `codeql.yml` and `dependency-review.yml`,
  the `contribution-gate` check run and the DCO app's check. The first CI run on the public
  repository shows the exact names the workflows emit; the list must match them character for character.

To confirm when applying them to the public repository:

- `allowed_merge_methods` in the `pull_request` rule (squash only).
- `bypass_mode: "always"` for a team leaves ruleset A in force for that team: the two-ruleset
  design depends on bypass being per ruleset.
- Rulesets are unavailable on the free plan for private repositories (HTTP 403); public
  repositories are expected to work.
