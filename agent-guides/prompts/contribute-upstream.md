# Contribute upstream

```text
Read AGENTS.md, section "Contributing upstream", and CONTRIBUTING.md. We are changing core in a
fork for a pull request to the Maretha Angular Web UI.

Change: <what, and the confirmed issue number>. Keep custom/ the empty starter; an example of the
new behaviour, if one is useful, goes under examples/. Add or extend the tests next to the code;
a check that proves it catches a planted defect is preferred over one that only passes.

Run `npm run verify:upstream`; fix the first failure and run again until it is green. Then stage
the changed files by name, run `npm run release:core-manifest` as the last change and include
core.manifest.json in the commit. Sign off the commit (`git commit -s`) with a Conventional
Commits title.

Done means verify:upstream is green on the final tree, the pull request description names the
issue and what the tests prove, and no file under maintainers/ or named after a deployment,
host or account is in the change.
```
