# Standalone UI

To run the UI outside Nuxeo, build it with npm and deploy it like any static web application. No Nuxeo package is installed. To install the UI inside Nuxeo instead, see the [Nuxeo package](../nuxeo/README.md).

Standalone hosting is experimental and not qualified; the Nuxeo package ([nuxeo/README.md](../nuxeo/README.md)) is the supported deployment.

## Build

With Node 22 or 24:

```sh
npm ci
npm run build:prod -- --base-href /<path>/
```

`--base-href` is the path the UI is served from, with a leading and a trailing slash (`/` at the root of a host). Without it, the build expects `/nuxeo/ng/`. Output: `dist/maretha-angular-webui/`. The `*.map` files are hidden source maps; leave them out of the deployment.

## Deploy

Copy `dist/maretha-angular-webui/` to the web server at that path. Serve `index.html` for every request under the path that matches no file, so deep links such as `/<path>/browse/...` open the application.

Set the runtime settings in the deployed `env.js`:

- `nuxeoUrl`: the Nuxeo URL, for example `https://nuxeo.example.com/nuxeo`;
- `webAppUrl`: the UI URL followed by `#`, for example `https://ui.example.com/<path>/#`;
- `authClientId`: the id of the OAuth2 client below.

Edit the deployed copy only. The `env.js` in the source tree is core, locked by `core.manifest.json`, and derives both URLs from `window.location.origin`.

## Connect to Nuxeo

Use one of the two set-ups.

**Same origin, through a reverse proxy.** Serve the UI and Nuxeo from one HTTPS origin, for example the UI at `https://example.com/<path>/` and Nuxeo proxied at `https://example.com/nuxeo/`. Every request stays on that origin, so Nuxeo needs no CORS contribution, and the default `nuxeoUrl` (`<origin>/nuxeo`) already fits.

**Separate origin, with CORS.** Serve the UI from its own origin and allow exactly that origin in Nuxeo. Save this contribution as `nxserver/config/maretha-angular-webui-cors-config.xml` (Nuxeo loads files whose names end in `-config.xml`), set `allowOrigin` to the UI origin and restart Nuxeo:

```xml
<?xml version="1.0"?>
<component name="io.maretha.webui.cors">
  <require>org.nuxeo.ecm.platform.ui.web.cors</require>
  <extension target="org.nuxeo.ecm.platform.web.common.requestcontroller.service.RequestControllerService" point="corsConfig">
    <corsConfig name="maretha-angular-webui"
      allowOrigin="https://ui.example.com"
      allowSubdomains="false"
      supportsCredentials="false"
      supportedMethods="GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS"
      supportedHeaders="*"
      exposedHeaders="Location,Content-Disposition,Content-Length,Content-Range,Accept-Ranges"
      maxAge="60">
      <pattern>/nuxeo/.*</pattern>
    </corsConfig>
  </extension>
</component>
```

`supportsCredentials` stays `false`: the UI sends OAuth bearer tokens, not cookies. [Local Nuxeo connection](../preview/nuxeo/README.md#cors) shows how to check the rule with `curl`.

## OAuth2 client

When the [Nuxeo package](../nuxeo/README.md#configure) is also installed on the server, set `maretha.webui.url` in `nuxeo.conf` to the UI URL (`webAppUrl` without the `#`) and the server bundle registers the client at startup. Otherwise an administrator registers a public OAuth2 client in Nuxeo whose redirect URI equals `webAppUrl`, for example with a `POST` of this body to `<nuxeoUrl>/api/v1/oauth2/client`:

```json
{
  "entity-type": "oauth2Client",
  "name": "Maretha Angular WebUI",
  "id": "maretha-angular-webui",
  "secret": "",
  "redirectURIs": ["https://ui.example.com/<path>/#"],
  "isAutoGrant": true,
  "isEnabled": true
}
```

Set `isAutoGrant` to `false` to ask each user for consent.

## Media and downloads

Media playback and file and ZIP downloads use the delivery endpoint that the [Nuxeo package](../nuxeo/README.md) installs on the Nuxeo server, and it requires the UI and Nuxeo to share an HTTPS origin ([blob delivery](blob-delivery.md)). With the UI on a separate origin, or without the Nuxeo package on the server, they report an error.
