# Independent SDK consumer

This Angular 21 app imports only `@maretha/webui-sdk`. It does not extend the runtime's TypeScript configuration or reference its source aliases. It demonstrates a client-owned assembly, an additional editable view, replacement, reversible hiding/reordering, retained drafts and an asynchronous departure guard. Its content is sample data, with no Nuxeo session.

From the runtime repository:

```sh
npm run pack:sdk
node scripts/verify-sdk-consumer.mjs
```

The verification script copies this app and the SDK archive into a new temporary directory, installs dependencies, repeats installation using the generated lockfile with `npm ci`, and builds the production application. It records the SDK SHA-256 and verification time in `verification.json`. The resulting lockfile and build stay in the reported directory for inspection. The script never publishes a package or modifies the application checkout.

To use the example directly, copy the generated SDK archive to `vendor/sdk.tgz` in a separate copy of this folder, then run `npm install` and `npm run build`. Serve `dist/browser` with a local HTTP server. Client code uses its own component prefix; the runtime and consumer share the SDK's registry and Angular peer dependencies.

This verifies the packaged extension boundary. Packaging all of the Nuxeo application's default feature libraries and consuming them as a separate full application remains an additional acceptance gate.
