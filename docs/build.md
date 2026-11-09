# Building

## Prerequisites

- Node 24.18.0, the version in `.nvmrc` (`nvm use`); `engines` in `package.json` accepts 22.12
  and later 22.x, or any 24.x. npm comes with Node.
- JDK 21 and Maven 3.9, only to build the Nuxeo server bundle (`npm run package:nuxeo`).
- A Chromium-family browser for the unit and browser tests; `CHROME_BIN` selects one, and
  `npx playwright install chromium` installs one on a fresh machine
  ([testing.md](testing.md#browsers)).
- `npm ci` once per checkout. It installs the locked dependencies and, through `prepare`, the Git
  hooks in `.husky/`: every commit runs lint-staged and the typecheck.

## Development server

`npm start` serves the application at `http://localhost:4200/#` and reloads on every source
change. The hash is part of the URL: Nuxeo returns to `webAppUrl` after login, and that value ends
in `#`. The development settings are in `environments/environment.ts`: a Nuxeo at
`http://localhost:8080/nuxeo` with the CORS contribution and the public OAuth2 client described in
[preview/nuxeo/README.md](../preview/nuxeo/README.md). Sign in through Nuxeo's own login page;
the UI has no credential form.

`npm run preview` serves the sample component preview at `http://127.0.0.1:4300`, which needs no
Nuxeo. `npm run watch` rebuilds the development configuration on change without serving it.

## Production build

```sh
npm run build:prod
```

Output: `dist/maretha-angular-webui/`, compiled ahead of time with the base href `/nuxeo/ng/`,
hidden source maps (`*.map`, which stay out of deployments) and `3rdpartylicenses.txt`. For
another path add `-- --base-href /<path>/` ([standalone](standalone.md)).
`npm run build:sourcemaps` writes the same configuration to `localSourceMaps/`.

Runtime settings are not compiled in. `env.js` at the repository root is copied into the build
and read at startup as `window.__env`: `nuxeoUrl`, `webAppUrl`, `authClientId`, `applicationId`,
`dashboardStatisticsDocumentTypes` and `addons`. Its defaults derive both URLs from
`window.location.origin` and assume the UI at `<origin>/nuxeo/ng/`. Change the deployed copy,
never the source: `env.js` is core, locked by `core.manifest.json`
([customizing](customizing.md#deployment-time-configuration)).

## SDK package

`npm run build:sdk` compiles `app/extensions/` with ng-packagr into `dist/webui-sdk/`;
`npm run pack:sdk` also packs it as `dist/maretha-webui-sdk-<version>.tgz`. The SDK carries the
application's version. Its API, registration model and release notes:
[app/extensions/README.md](../app/extensions/README.md) and
[app/extensions/CHANGELOG.md](../app/extensions/CHANGELOG.md); the checks that guard its public
surface: [sdk-compatibility.md](sdk-compatibility.md).
[examples/client-webui](../examples/client-webui/README.md) is an application that installs the
archive and nothing else.

## Nuxeo package

```sh
npm run package:nuxeo
```

Output: `dist/nuxeo/maretha-angular-webui-package-<version>.zip`, assembled in Node from the
production build and the server bundle that Maven builds, Java tests included. Two runs over one
production build are byte-identical. Flags of `node scripts/nuxeo-package.mjs`: `--no-build`
reuses the existing production build, `--ui-only` leaves out the server bundle (CI's assembly
check), `--check` checks the versions and the deep-link routes only. Requirements, installation,
configuration, upgrade and rollback: [nuxeo/README.md](../nuxeo/README.md).

## After a build

After `npm run pack:sdk` and the Nuxeo package, `npm run verify:release-identity` checks that both
archives in `dist/` are named after the `package.json` version and carry it inside; it fails when
either is missing, and a zip left from an earlier version fails it too, so clear `dist/nuxeo/`
between versions. Every other check: [testing.md](testing.md).
