# Contract extension example

This client-owned source uses only `@maretha/webui-sdk`. It contributes a retained, guarded Contract page whose fields bind to live Nuxeo schema metadata. The application registers it in development; production assemblies opt in with `provideContractExample()` and a `DOCUMENT_LAYOUT_GATEWAY` provider.

The Nuxeo fixture adds a `Contract` type extending `File` and the `contract` schema. It is for the approved local development server. Build its bundle from the WebUI root:

```sh
jar cfm /tmp/maretha-contract-fixture.jar examples/contract/nuxeo/META-INF/MANIFEST.MF -C examples/contract/nuxeo OSGI-INF -C examples/contract/nuxeo schemas
```

Install the bundle under the development server's `nxserver/bundles` and restart that server. Create a Contract inside a Workspace or Folder, then open its `?view=contract` tab. Required fields are title, counterparty, amount and effective date. No credentials are included in the extension or bundle.

Validation uses live schema field types plus layout constraints. Saving requires current `WriteProperties` and uses Nuxeo's `changeToken` for optimistic locking. A conflicting save retains the draft; explicit discard/reload retrieves the latest server revision. The wrapper forwards deactivation/unload state to the host and refreshes the application document after a successful save.

This is a scalar layout example. It does not implement file import, complex lists, business workflow rules, or release-ready Contract domain validation.
