# Governance

Maretha maintains this project through the `@maretha-labs/maintainers` team.

## How work is decided

- **What gets built:** an issue is confirmed with the `confirmed:bug` or `confirmed:feature`
  label, applied by the team after triage. Only confirmed product work is merged. See
  [CONTRIBUTING.md](CONTRIBUTING.md).
- **What gets merged:** every required check passes for every pull request. A pull request from
  outside the team also needs one approval; one from the team merges on green checks alone.
- **What gets released:** the team tags releases after reviewing the candidate on a Nuxeo
  installation. See [docs/releasing.md](docs/releasing.md).
- **Disagreements:** consensus is sought in the issue or pull request. If there is none,
  Maretha decides.

## Joining the team

An invitation follows a record of sustained, good-quality contributions. Team membership carries
the labels that confirm work and the right to merge on green checks, and requires two-factor
authentication.

Releases stay with Maretha, which tags a release only after reviewing it on its own Nuxeo
installation.

## Direction

This project is an Angular web UI for Nuxeo Platform (LTS 2025) that behaves like the stock
Nuxeo Web UI. Customize it only in the customization zone, through an extension SDK and agent
guides, while a hash lock protects the core; upgrade by merging the next release.

It does not change Nuxeo Platform itself, and code from a customization zone never comes
upstream.

Planned work is tracked in open issues and milestones. Ideas start in
[Discussions](https://github.com/maretha-labs/maretha-angular-webui/discussions).

## Paid support

Maretha offers paid customization and support. That work never changes how this repository
decides, merges or releases. See [SUPPORT.md](SUPPORT.md).
