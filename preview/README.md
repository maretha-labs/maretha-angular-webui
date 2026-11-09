# Extension preview

From the repository root, run:

```sh
npm run preview
```

Open <http://127.0.0.1:4300/>. Keep the development server running while using the preview. Opening an Angular component's `.html` file directly displays its source; it does not start Angular.

This development-only entry point renders the actual `DocumentViewsComponent` and extension registry with fictional document content. The controls demonstrate adding/removing a client-contributed tab, disabling/restoring the default tab, and selection fallback. It does not require a Nuxeo server, make repository requests, or render the complete WebUI.

The account-menu section uses the actual `USER_MENU` host and default contributions. Open <http://127.0.0.1:4300/#user-menu-preview> to hide/restore Themes, reorder Sign Out, add/remove a client support entry, and exercise sample profile/locale/sign-out callbacks. These changes are isolated to this sample app.

The preview has its own HTML, styles and build configuration. Its separate bootstrap does not replace the connected application or its authentication flow.

## Connected application

Use `npm start` and <http://localhost:4200/#> for the complete application. Its current development configuration in `environments/environment.ts` expects:

| Setting                            | Current value                 |
| ---------------------------------- | ----------------------------- |
| Nuxeo server                       | `http://localhost:8080/nuxeo` |
| UI URL / configured OAuth redirect | `http://localhost:4200/#`     |
| OAuth client ID                    | `maretha-angular-webui-dev`   |

A fresh server needs matching OAuth registration and cross-origin request configuration. Use the `localhost` UI address consistently for that flow.

The [local Nuxeo setup files](nuxeo/README.md) provide the matching OAuth registration, CORS contribution and verification requests.
