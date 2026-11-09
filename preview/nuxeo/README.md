# Local Nuxeo connection

These files configure a development server at `http://localhost:8080/nuxeo` for the complete Angular application at `http://localhost:4200/#`. The sample component preview on port 4300 is independent of this setup.

## OAuth client

`oauth-client.json` registers one enabled public client, `maretha-angular-webui-dev`, with the exact redirect `http://localhost:4200/#`. It has no client secret and keeps user consent enabled (`isAutoGrant: false`). The installed LTS 2025 OAuth JSON reader uses `id`, `secret`, `isAutoGrant` and `isEnabled`; the directory API uses a different representation.

After approving the registration, an administrator can run this from the repository root. Curl prompts for the password; the response body is discarded to keep credential fields out of the terminal output.

```sh
curl --fail-with-body --silent --show-error --user YOUR_ADMIN_USERNAME \
  -H 'Content-Type: application/json' \
  --data-binary @preview/nuxeo/oauth-client.json \
  --output /dev/null --write-out 'HTTP %{http_code}\n' \
  http://localhost:8080/nuxeo/api/v1/oauth2/client
```

Expected status: `201`. Check an existing registration before making changes; do not blindly replace it. The authorization callback currently matches `environments/environment.ts`, including the hash fragment. This documents the existing development flow, not a production OAuth qualification.

## CORS

Install `maretha-angular-dev-cors-config.xml` as a new file with the same name in the development server's `nxserver/config/` directory, then restart that server. Preserve any existing file instead of overwriting it. Nuxeo loads standalone contributions only when their filenames end in `-config.xml` or `-bundle.xml`.

The rule permits exactly `http://localhost:4200`, with no subdomains or null origin. It supports the HTTP methods and custom headers used by the client and its extensions. The `Location` response header is exposed for asynchronous selection downloads. Cookie-based cross-origin credentials remain disabled; Angular sends OAuth bearer headers. It does not enable Nuxeo's global development mode. See Nuxeo's [CORS configuration reference](https://doc.nuxeo.com/nxdoc/cross-origin-resource-sharing-cors/) for the contribution attributes.

Verify both token exchange and a repository request after restarting:

```sh
curl --silent --show-error --include --request OPTIONS \
  -H 'Origin: http://localhost:4200' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type,x-requested-with' \
  http://localhost:8080/nuxeo/oauth2/token

curl --silent --show-error --include --request OPTIONS \
  -H 'Origin: http://localhost:4200' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization,properties,enrichers-document,x-requested-with' \
  http://localhost:8080/nuxeo/api/v1/path/
```

Both must return a successful response with `Access-Control-Allow-Origin: http://localhost:4200` and the requested methods/headers allowed. An unrelated origin must not receive an allow-origin header. API authorization still requires a valid user token.

Run `npm start`, open <http://localhost:4200/#>, sign in through Nuxeo's built-in login page and approve the application consent. A separate Nuxeo WebUI installation is not needed for login. Full feature testing may reveal dependencies on server-side packages or page providers; installing Polymer later provides the visual comparison reference.

To undo this setup, remove only this CORS contribution and restart, then remove the specific OAuth client registration. Removing the registration invalidates its use by the development app; do not remove other clients.
