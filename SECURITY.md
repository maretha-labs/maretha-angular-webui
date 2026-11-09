# Security policy

## Supported versions

| Version | Security fixes |
| ------- | -------------- |
| 1.0.x   | Yes            |
| < 1.0   | No             |

A fix ships as a new patch tag on the supported line. When `main` has moved past an older
line, a `release/x.y` branch carries the patch.

## Reporting a vulnerability

Do not open a public issue, discussion or pull request for a security problem.

1. **Preferred:** GitHub private vulnerability reporting. Open the repository's **Security**
   tab and choose **Report a vulnerability**.
2. **If you cannot use GitHub:** email [maretha@maretha.io](mailto:maretha@maretha.io) with
   "Security" in the subject.

Include the affected version or commit, the deployment shape (served by Nuxeo or
standalone), steps to reproduce and the impact you observed. Do not include credentials,
personal data or content from a production repository.

We acknowledge a report within 14 days, keep you informed while we work on it, and credit
you in the advisory unless you ask us not to.

## Scope

In scope: the code in this repository, and the Nuxeo package and SDK built from it.

Out of scope: Nuxeo Platform itself and the stock Nuxeo Web UI (report those to Hyland),
and customizations in the `custom/` zone.

## Known trade-offs

- **Development OAuth client.** The OAuth client configuration used for local development
  is a public client with an empty secret. It carries no credential.
- **Same-origin file delivery.** The delivery servlet serves files only to the same origin
  over HTTPS. When the UI is hosted on its own origin, media and ZIP downloads degrade.
- **Standalone hosting needs CORS.** Hosting the UI on another origin needs a CORS
  contribution on the Nuxeo server for that origin, with credentials off (bearer tokens).

Release files carry GitHub artifact attestations. Check a download with
`gh attestation verify <file> --repo maretha-labs/maretha-angular-webui`.
