# Nuxeo package

`npm run package:nuxeo` builds `maretha-angular-webui-package-<version>.zip`, a Nuxeo LTS 2025 package (target platform `[2025.0,2026.0)`) with two bundles:

- `maretha-angular-webui-ui`: the production build in `nuxeo.war/ng`, served at `/nuxeo/ng/` to signed-in users. Nuxeo returns to it after login, and deep links to the top-level routes get the application shell. Hidden source maps are left out.
- `maretha-angular-webui-server`: the [delivery servlet](../docs/blob-delivery.md) at `/nuxeo/maretha-ui-maretha-angular-webui-delivery/v1` for media playback and file and ZIP downloads, and the startup registration of the UI's OAuth2 client.

## Build

Build the package with Node 22 or 24, JDK 21 and Maven 3.9:

```sh
npm ci
npm run package:nuxeo
```

The build checks that the lockfile, the SDK and `nuxeo/` carry the `package.json` version and that the rewrite rule covers every top-level route, runs the production build, builds the server bundle with `mvn -f nuxeo/pom.xml -pl server -am clean package` (Java tests included), and assembles both bundles and the package in Node. Output: `dist/nuxeo/maretha-angular-webui-package-<version>.zip`. Two runs over one production build are byte-identical; `--no-build` reuses an existing production build. `npm run verify:release-identity` then checks that the package and the SDK archive in `dist/` are named after that version and carry it inside.

To run the UI outside Nuxeo, without this package, see [Standalone UI](../docs/standalone.md).

Maven can still build the whole package (`npm run build:prod`, then `mvn -f nuxeo/pom.xml package`). Its UI bundle differs from the Node one only by Maven's `META-INF/maven/` metadata, an empty `doc/` folder and two manifest headers (`Created-By`, `Build-Jdk-Spec`).

## Install

With Nuxeo stopped:

```sh
nuxeoctl mp-install maretha-angular-webui-package-<version>.zip --accept=true
```

To replace an installed build of the same version, run `nuxeoctl mp-uninstall maretha-angular-webui --accept=true` first.

## Configure

Set the public URL in `nuxeo.conf`:

```properties
nuxeo.url=https://<host>/nuxeo
# Only when the UI is not at <nuxeo.url>/ng/:
# maretha.webui.url=https://<host>/nuxeo/ng/
```

At startup the server bundle creates the public OAuth2 client `maretha-angular-webui`: no secret, automatic grant (as for Nuxeo Drive and Nuxeo Mobile), redirect URI `<UI URL>#`, which is what `env.js` sends. If the client already exists, only a missing redirect URI is added; other administrator changes are kept. Without either property, or with a plain-HTTP URL other than `http://localhost`, it logs a warning and registers nothing.

Delivery works only over HTTPS on the same origin as Nuxeo; everything else in the UI also works over HTTP. When TLS ends at a reverse proxy:

- send `X-Forwarded-Proto: https`. Nuxeo's Tomcat honors it from loopback and private-network proxies (`RemoteIpValve` in `templates/common-base/conf/server.xml.nxftl`), so the servlet sees a secure request;
- keep `Range` and validator headers, and turn off buffering and compression for `/nuxeo/maretha-ui-maretha-angular-webui-delivery/`.

Several Nuxeo nodes need a shared key-value store with TTL and compare-and-set for delivery grants; see [blob delivery](../docs/blob-delivery.md).

`nxserver/nuxeo.war/ng/env.js` holds the UI's runtime settings: Nuxeo URL, OAuth client, dashboard statistics document types and add-ons. The defaults assume the UI at `<origin>/nuxeo/ng/`. A reinstall replaces the file.

Open `https://<host>/nuxeo/ng/`.

## Upgrade, uninstall and rollback

With Nuxeo stopped, remove the installed version and install the new one; `nuxeoctl mp-list` shows what is installed:

```sh
nuxeoctl mp-uninstall maretha-angular-webui --accept=true
nuxeoctl mp-install maretha-angular-webui-package-<new version>.zip --accept=true
```

Keep the zip of the version you replace: a rollback is the same two commands with it. The `nuxeo.conf` properties and the OAuth2 client survive both (startup only adds a missing redirect URI); edits to `nxserver/nuxeo.war/ng/env.js` do not, so re-apply them after every install. Uninstalling alone removes the UI, the rewrite rule and the delivery servlet; the OAuth2 client stays until an administrator deletes it.

Release builds use the plain package version in all Maven POMs and bundle manifests. Snapshot builds may use the matching `-SNAPSHOT` / `.SNAPSHOT` suffix consistently; the packaging check accepts both and rejects mixed versions.
