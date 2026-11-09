# Dedicated native CI fixture

`Local Nuxeo critical paths` is a self-hosted harness, not a required check: a real-server browser job that runs only on a dedicated runner that holds this fixture. It prepares fresh native OAuth authentication and installs the exact current checkout before running the existing five critical-path cases. Missing or unhealthy fixture prerequisites fail the job; no native test is skipped or replaced with mocks.

## Runner contract

The repository variable `NUXEO_E2E_FIXTURE_CONFIG` names an explicit JSON descriptor outside the checkout, for example `/srv/nuxeo-ci/fixture.json` on the runner. The descriptor has this shape (the credential value is never in the descriptor):

```json
{
  "format": "maretha.nuxeo-ci-fixture",
  "version": 1,
  "id": "maretha-runtime-ci",
  "nonce": "<64 lowercase hexadecimal characters>",
  "api": "http://localhost:18080/nuxeo",
  "app": "http://localhost:18080/nuxeo/authoring",
  "applicationId": "maretha-authoring-demo",
  "clientId": "maretha-runtime-ci",
  "documentId": "<exact synthetic File UID>",
  "searchTerm": "MarethaNativeCIUniqueDocument",
  "configurationVersion": "0.0",
  "webRoot": "/srv/nuxeo-ci/server/nxserver/nuxeo.war/authoring",
  "credentials": "/srv/nuxeo-ci/credentials.json"
}
```

The owner-only credential file contains `username` and `password` for the separately provisioned synthetic `maretha_ci_runner` account. Only a `maretha_ci_` username and a long credential qualify. The browser preparer never discovers credentials in other files or records their values in logs, screenshots, traces, videos or artifacts. The fixture database has synthetic data only. The public distribution's default Administrator password is rotated during initial provisioning.

`maretha-ci-fixture.json` exists both beside the application directory and inside it, with `format: "maretha.nuxeo-ci-instance"`, `version: 1`, and the descriptor's exact `id` and `nonce`. Nuxeo permits anonymous **GET only** at the exact `/nuxeo/authoring/maretha-ci-fixture.json` marker route. The marker is an operator declaration of a dedicated fixture, not an authentication secret or an isolation mechanism for hostile code.

## What every job proves

1. Validate exact loopback URLs, the instance marker, the explicit external credential file and private state locations.
2. Build this checkout in production mode with the fixture's actual base href.
3. Swap only the dedicated application's static directory. Record the checkout revision and SHA-256 of every output file, then fetch and compare every file through the actual native server. Protected static JSON is fetched using the synthetic fixture account only after the public instance marker matches. Failed verification restores the previous candidate.
4. Use a fresh browser for the real native login and authorization-code exchange. The provisioned public OAuth client has the exact callback `http://localhost:18080/nuxeo/authoring/#`; automatic grant is disabled. Only this exact loopback origin is allowed. Native same-origin document 301/302/303 responses use a checked navigation bridge so every next hop is intercepted. Other redirect kinds, external destinations and WebSockets fail closed. The native test suite itself still rejects every redirect.
5. Run the unchanged native login, shell/search/document/menu, creation-cancel, dashboard and configuration-editor cases. They use native repository identity, permissions and the synthetic indexed File; writes are not part of these five tests.
6. Always remove the current job's private authentication directory. Reports contain candidate hashes and test results, never the credential files or session-state values.

The workflow serializes this fixture with a concurrency group. It does not install or restart Nuxeo, mutate production configuration, or use a hosted deployment as a substitute. Human local acceptance can continue to use `e2e/nuxeo/prepare-state.mjs` separately.

## Fixture infrastructure

The fixture is a dedicated Nuxeo LTS 2025 installation with its own repository, user, OAuth client and synthetic File, bound to loopback only, with MongoDB and OpenSearch as bounded dependencies: `dependencies.yml` records their deployments, persistent volumes and quota, and there is no Ingress, NodePort or hostPort. The candidate backend supplies the application configuration schema/bootstrap. Keep production content and credentials out of this fixture. The dependency manifest is intended configuration, not a proven network-isolation boundary, and these trusted synthetic dependencies do not qualify a hostile-code sandbox. The runner's host set-up, service units and upgrade procedure are documented outside this repository.

Before updating the fixture baseline, inspect only its own service, package inventory and synthetic data; preserve other namespaces and installations. Upgrade the native package baseline through the package manager with target/dependency checks intact. Reconfirm the exact marker, OAuth callback, saved configuration version, indexed File and all five browser results afterward. The fixture currently omits optional media conversion executables; this gate does not claim to verify video/PDF conversion or the complete native delivery backend.

Focused guards:

```sh
CHROME_BIN=/path/to/chrome node --test e2e/nuxeo/fixture/contract.test.mjs e2e/nuxeo/fixture/redirect-boundary.test.mjs
```
