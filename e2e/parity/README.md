# Shared-feature visual parity inventory

[`scenarios.json`](scenarios.json) is the machine-readable capture inventory:
scenarios, fixtures, targets and acceptance prerequisites.
[`scenarios.schema.json`](scenarios.schema.json) defines its v1 contract. It keeps
the Polymer reference read-only and confines source changes to Angular.

`runnable` means the target has a capture recipe, not that it passed a
comparison. `requiredExpansionMatrix` and `inventoryCoverage` record the scope
the inventory does not instantiate.

## Run capture

Use the repository's pinned Node/dependencies and existing browser setup described
in [`e2e/README.md`](../README.md). Run from the repository root:

```sh
node e2e/parity/run.mjs
```

The default mode serves the existing deterministic Angular a11y entry point on
the runner's independent loopback port 4314. It writes a fresh run beneath
`dist/verification/parity/<run-id>/`. Local captures remain component evidence;
hosted-only inventory rows remain explicitly unverified.

Capture one declared scenario or choose a fresh run identity:

```sh
node e2e/parity/run.mjs --scenario=shell.rest.en-default
node e2e/parity/run.mjs --run-id=review-shell-001
```

Run IDs must be new; the runner refuses to overwrite an existing evidence
directory. A fixed comparison uses an existing capture root, for example:

```sh
node e2e/parity/run.mjs --baseline=dist/verification/parity/reference-shell-001 --run-id=candidate-shell-001
```

Supply the actual reviewed reference directory in place of that example. The
command does not approve or update a baseline, and a local pixel match remains a
local regression result.

Hosted capture additionally requires the two origins, `PARITY_REFERENCE_ORIGIN`
(the Polymer Web UI, served at `/nuxeo/ui/`) and `PARITY_CANDIDATE_ORIGIN` (this UI,
served at `/nuxeo/ng/`; the same origin when both are installed on one server), the
`PARITY_USERNAME` and `PARITY_PASSWORD` variables already supplied privately in the
process environment, plus explicit read-only mode. Each origin is `https://` plus a
host, nothing else; an unset or malformed origin stops the run:

```sh
PARITY_REFERENCE_ORIGIN=https://nuxeo.example PARITY_CANDIDATE_ORIGIN=https://nuxeo.example \
  PARITY_ALLOW_HOSTED=read-only node e2e/parity/run.mjs --mode=hosted
```

Bind the documented safe
data/identity/route prerequisites before enabling any target; unbound rows must
remain unverified. Do not put credentials in CLI arguments, shell history,
committed files, or uploaded artifacts. The runner allows only its declared
loopback origin or the two configured hosted origins and rejects unapproved operations
and redirects. This does not replace authorization for changing hosted data or
deploying a package.

## What each result can establish

- **Capture integrity:** the declared component/state rendered; regions, metrics,
  assets, browser settings, and screenshots were captured under the declared
  conditions. A local fixture capture establishes component evidence only.
- **Identity verification:** the actual loaded asset path and SHA-256 match an
  explicitly supplied expected identity with recorded provenance. Capturing an
  asset hash alone does not establish that it is the intended reference/candidate.
- **Accepted parity:** equivalent reference/candidate data, permissions,
  rendering, and UI states were compared against an existing fixed reference,
  and each visible difference was corrected or explicitly classified. Neither a
  successful capture nor an asset identity match alone establishes parity.

The fixture content includes a visible notice and synthetic data. Never compare
that content against a hosted page and label the result visual parity. The
`component-only` and `shared-feature` scope labels are deliberate.

## Manifest shape

Every scenario has a stable `id`, one or more plan inventory IDs, an explicit
status/coverage scope, prerequisites, semantic fixture keys, exact rendering
settings, evidence provenance, targets, and acceptance requirements.

`evidenceBasis.kind` distinguishes:

- `deployed-observed`: a representative observation of a deployed Web UI. Its
  `scope` states what was observed; it is not a complete acceptance run.
- `source-only`: an implementation or pinned contribution contract. Its presence
  does not prove deployed availability or visual correctness.
- `local-fixture`: an existing deterministic fixture using actual Angular
  components and controlled providers. It is not a native Nuxeo backend test.

Targets are separate `reference`, `candidate`, and optional `local` records. A
target with `runnable: false` must have a concrete `blockedBy` reason. It must be
reported as unverified/blocked, never silently omitted from a complete coverage
claim or counted as a match.

For a runnable target:

1. Resolve `route` beneath the selected application/fixture root. Routes are
   application-relative and must not escape to a protocol-relative or remote URL.
2. Match principal, semantic fixture identities, rendering, and requested state.
   The local runner first requires `[data-fixture-notice]` on its own independent
   loopback origin.
3. Execute `steps` in order. Only hover, focus, safe click, and key press are
   allowed. A step may declare its own readiness checks. `safe: true` attests that
   the action is read-only presentation/navigation; it does not authorize a
   repository save, upload, delete, permission change, or external connection.
4. Evaluate target `ready` **after all steps**. Require exact declared targets;
   missing or ambiguous regions/measurement selectors must fail or block capture.
5. Wait for fonts, visible images, finite animations, and stable geometry. Capture
   the full viewport/page, each named region, computed measurements, loaded asset
   identities, and provenance without private request data.

`measurements` contains a stable ID, selector, property, expected value, and
optional absolute tolerance. Width/height use CSS-pixel DOM bounds. Numeric text
metrics use their declared pixel values; opacity and font weight are unitless.
Text/color values compare as normalized computed CSS strings. Unsupported
properties or malformed numeric values must fail rather than disappear from a
report. The 1 CSS px anchor tolerance still applies even when a screenshot
noise threshold is also used.

The first manifest has no screenshot masks or excluded regions. Its exclusions
describe missing capabilities; they do not hide pixels. The runner must preserve
reference captures and comparison inputs rather than replace a baseline to make
a failing candidate pass.

## Fixture and route binding

The two existing synthetic fixture contracts cite their actual source:

- `a11y-shell-reader`: `e2e/a11y/main.ts`, including `fixture-reader`, the empty
  provider lists, and the synthetic Quick Search document.
- `a11y-runtime-tree`: `e2e/a11y/runtime-tree-fixture.ts`, including its root,
  branch, and child identities.

Those IDs belong to local providers. They are not deployed document IDs and must
not be sent to a hosted Nuxeo API. The accessibility entry point supports only
English/Arabic and default/dark; broader languages use the separate existing
localization fixture. The parity runner may serve that existing Angular build on
its own port, independently of the original a11y/native harnesses.

Hosted fixtures use stable semantic keys such as `hosted-folder`, `hosted-pdf`,
and `hosted-dashboard-populated`. Their committed `identity` remains `null`.
Supply actual principal/document/native-path mappings privately at run time and
verify the same content revision and effective permissions on both UIs. Resolve
native document routes from the bound document metadata and exact application
root; do not guess a UUID, take the first search hit, or use similar titles as
identity proof. No fixture contract implies that a deployed account is an
administrator or that a compatible dataset already exists.

A hosted recipe stays nonrunnable until matched data, reference routes and
selectors, safe capture scope, and identities are bound; its null routes are
explicit unknowns. Existing native Nuxeo tests keep their loopback-only
boundary, private state handling, and fixture preconditions; this inventory does
not weaken or repurpose them.

Credentials, cookies, tokens, browser state, profiles, and HAR files must remain
outside the repository and report artifacts. Hosted screenshots need synthetic
or otherwise explicitly authorized safe data; a usable authentication session
does not by itself authorize publishing its visible contents.

## Bundle identity

`expectedBundleIdentities` uses `{path, sha256, source}` for each hosted target.
All three values are initially null. To bind an expected identity, supply all
three through the reviewed capture configuration and record its provenance; do
not silently bless whatever bundle happened to load.

`bundleIdentityPolicy` names the pinned source revision separately from the
deployed reference. The run captures its own actual loaded assets; the tree holds
no observed baseline. An observation at one viewport, device scale, locale, and
theme does not approve a different dataset, a full page, or every scenario.

## Extending coverage

For each new inventory row, confirm shared capability, define semantic data and role
preconditions, resolve exact routes/selectors, record the source or observed
evidence scope, and add a scenario with complete state/rendering settings. Promote
only its actually prepared targets to runnable. Record failures and unavailable
prerequisites instead of excluding them.

Keep every exclusion named with its reason, whether an observed extra or a
pinned source-contract add-on whose deployed presence is unverified. None
counts as a pass. Preserve any existing Angular equivalent when later evidence
shows that a capability is shared. Record reference bugs as intentional
differences; do not change Polymer or copy its defects into Angular.

Validate the JSON against its schema and validate cross references (unique
scenario/exclusion/region/measurement IDs, known fixture keys, existing source
paths, and supported action/metric contracts) whenever changing the inventory.
The capture runner's own guards and results are separate from that inventory
validation and from the existing a11y/localization/native checks.
