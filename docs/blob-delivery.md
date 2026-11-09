# Authenticated media, file and bulk ZIP delivery

Persisted video, audio and individual blob downloads use the
`/maretha-ui-<applicationId>-delivery/v1` endpoint under the Nuxeo context path,
served by the Nuxeo package's server bundle (`nuxeo/server`, see
[nuxeo/README.md](../nuxeo/README.md)). The UI and Nuxeo must share an HTTPS origin.
Local development needs an HTTPS proxy and the installed package. HTTP and
cross-origin delivery fail with an error.

`BlobDeliveryService` mints a five-minute, browser-bound resource grant through
the existing bearer-authenticated HTTP chain. The response contains an opaque
content URL and an expiry time in epoch milliseconds. A separate random browser
cookie is HttpOnly, Secure, SameSite=Strict, and scoped to this application's
delivery path. No bearer token or cookie secret appears in the URL.

`resolveDocumentBlobTarget` uses the original persisted document properties and
their original array indices. The supported targets are `file:content`,
`files:files/N/file`, `vid:transcodedVideos/N/content`, and
`picture:views/N/content`. A saved nonempty digest is required. Unsaved local
files, missing digests and ambiguous matches cannot mint grants. A blob URL does
not establish its identity.

`StreamMediaDirective` owns a player's grant, renews it before expiry, and keeps
the native URL stable for seeking. Source changes, component destruction and
logout clear the element and cancel requests; source changes and destruction
also revoke the individual grant. Renewal failure clears the player and reports
an error. Local unsaved file previews continue to use their local object URLs.

`downloadDocumentBlob` creates an attachment grant and initiates a native anchor
download without fetching the full file into JavaScript. The browser exposes no
reliable completion callback, so the grant remains until expiry. Built-in
persisted-blob download actions use this method. The legacy URL-based
`downloadAttachment` method remains for compatibility; CSV and separate generated
document export actions retain their existing transport. PDF preview uses the
separate [authenticated range adapter](pdf-range-loading.md).

Grant creation is serialized within a tab and across tabs when Web Locks are
available. Without Web Locks, concurrent first use in different tabs may issue
competing initial cookies and require retrying a player. Logout attempts session
revocation before clearing authentication, with a five-second timeout. Failure
leaves existing grants valid until their current expiry; another still-authenticated
tab can renew them. This endpoint does not revoke OAuth tokens. Requests authorized and already streaming
may finish after expiry or revocation; every new request must pass authorization.

The server refreshes the current principal, checks Read permission and native
download policies, and verifies the saved digest on grant creation, renewal and
each content request. Only audio/video MIME types support inline delivery. GET and HEAD work
without a normal Nuxeo browser session, but require the dedicated cookie and
grant. Job status and mutations retain normal Nuxeo authentication. Mutations
require an exact same-origin Origin header; status GET checks it when present,
because browsers normally omit it on same-origin GET requests. No global OAuth
session behavior is changed.

The servlet uses native Nuxeo byte transfer without redirect resolvers
or whole-file buffering. It closes its own repository session and transaction
before transferring bytes; it does not commit an outer transaction introduced by
a custom deployment filter. Single ranges, suffix ranges, HEAD, If-Range and
unsatisfiable ranges are supported. Unsupported units and multiple ranges are
ignored and return a full response.

Keep range and validator headers intact at the reverse proxy, disable response
buffering/compression for the delivery route, and configure Nuxeo's HTTPS scheme
correctly. The named key-value store `<configuration symbolic name>.delivery`
inherits the configured default backend with its own namespace unless explicitly
overridden. Clusters require shared storage with TTL and atomic compare-and-set;
node-local storage cannot propagate grants or revocations across nodes.

## Bulk ZIP preparation and delivery

Selection and folder ZIP actions create an authenticated `POST /bulk-jobs`
request at the same delivery endpoint. A dedicated Nuxeo WorkManager queue
prepares the archive in transient storage. The UI polls `GET /bulk-jobs/<id>`
for JSON state and progress; status never redirects to, reads, or consumes the
ZIP. Progress comes from the server's prepared file and byte counts. Preparation
can take up to a fixed 30-minute deadline; polling does not extend that deadline.

When ready, `POST /bulk-jobs/<id>/grant` mints a five-minute native attachment
grant. The first authorized content GET claims the archive once and streams the
complete ZIP. HEAD validates access without claiming it. Range and resume are
unsupported for this one-shot result. The browser does not buffer the ZIP in
JavaScript, and the UI reports **Download started**, not completion.

**Retry status** reads the existing job. It never starts a replacement job.
**Regenerate ZIP** explicitly creates a new preparation from the server's saved
original request, including after a blocked or interrupted native download.
Request and status tombstones remain for one hour. Uncertain create responses
do not trigger automatic retries, which could create duplicate work.

**Cancel preparation** sends `DELETE /bulk-jobs/<id>` and waits for confirmation.
Closing the action or logging out also attempts cancellation. Workers check
cancellation, expiry and browser-session revocation while copying ZIP entries
and before publishing. A native rendition converter can only be checked before
and after its conversion call. Cancellation cannot recall bytes from an already
authorized download. A worker interrupted by a server restart safely expires;
it does not automatically resume a partially prepared archive.

Readable folders and collection members are expanded explicitly under the job's
bounds, including folders selected through a collection. Archive paths
are sanitized and duplicate names disambiguated. Persisted main blobs retain
their saved digest; generated leaf renditions such as Note PDF and document XML
are bound to the source document's change token and the prepared bytes. Fresh
Read permission and native download policies are checked before delivery for
every included document. A document change token does not capture dependencies
outside the document used by a custom rendition implementation.

Initial limits are 1,000 selected IDs, 6,000 discovered documents including
containers, 5,000 archive entries, 20 GiB of source bytes, three active jobs per
owner and two preparation workers. Archives and
partial files need server disk and transient storage. The transient store
`<configuration symbolic name>.delivery.bulk` inherits the configured provider;
the default fallback is node-local. Clusters require shared job metadata and
archive storage accessible across workers and serving nodes. Configure cleanup
and queue persistence for the deployment; native transient-store expiry is the
fallback for orphaned archive files.

Local automated tests do not establish installed-browser acceptance. Before
rollout, verify large video/audio playback and seeking, native downloads,
large ZIP preparation, cancellation, interrupted-download regeneration,
permission removal, blob replacement, token renewal, logout and multi-node
revocation with the actual HTTPS/proxy/blob-provider configuration.
