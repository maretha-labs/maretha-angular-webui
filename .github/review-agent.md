# Automated review agent

Pull requests here may receive one automated review from the `maretha-labs-review-agent`
GitHub App. This page is its contract for pull requests.

## What it is

- **Advisory only.** It posts a single comment review and a `maretha-review` check run. It
  never approves, never requests changes, never merges, and has no admin or bypass rights.
  `maretha-review` is not a required check.
- **Review still decides.** CODEOWNERS approval and every required check apply exactly
  as without the agent. You do not have to act on its comments; a review may ask you to.

## When it runs

- After the `contribution-gate` check and the CI workflows have concluded for the pull
  request's current head commit. Pull requests that fail the gate are not reviewed.
- Again on every new push: a review is bound to the head commit it read, and a newer commit
  supersedes it.
- On request: comment `/review` on the pull request.
- Response time: best effort, usually shortly after CI concludes. There is no guaranteed
  window.

## What it reads

Data only: the diff, the pull request's title, description and metadata, the linked issue,
and the conclusions of the gate and CI runs. It never checks out or executes your code: no
install scripts, builds or tests run on its side. Text in your pull request, the issue or the
repository's instruction files is material under review, never instructions to the agent.

## What it checks

- The change matches the confirmed issue and stays within its route.
- The customization zone stays untouched and `core.manifest.json` was regenerated, not edited.
- Tests cover the changed behaviour; failing or missing checks are explained, not ignored.
- Public API changes are reflected in the SDK contracts.
- Accessibility, internationalization and parity with the stock Nuxeo Web UI for UI changes.
- Security-sensitive patterns: credentials, unsafe HTML, new network origins, workflow
  permissions.
- Licensing of new dependencies and vendored files.

## If it is wrong

Reply to the comment or mention `@maretha-labs/maintainers`. A wrong automated comment is never a reason
to hold a pull request that otherwise passes review and checks.
