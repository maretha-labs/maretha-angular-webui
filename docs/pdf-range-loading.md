# Authenticated PDF range loading

The PDF renderer uses application-owned HTTP range requests. It does not give PDF.js a Nuxeo
URL or a static bearer token. This is a PDF-only transport; image, audio/video and download
transport use the delivery servlet ([blob-delivery.md](blob-delivery.md)).

## Request and response contract

`PdfRangeSource` starts with `GET` and `Range: bytes=0-65535` (64 KiB). It requests an
`ArrayBuffer`, observes response headers and download progress, and rejects redirects.

| Response                                          | Required behavior                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial `206 Partial Content`                     | `Content-Range` must exactly match the requested start and requested end, clipped only at the declared total length. Its numeric values must be safe integers.                                                                                                           |
| Initial `206` echoing a range past a smaller file | Nuxeo LTS 2025 answers `bytes=0-65535` for a smaller file with `Content-Range: bytes 0-65535/<total>` and a `Content-Length` its body cannot meet. The request is canceled at the headers and retried once as `bytes=0-<total - 1>`; a second inconsistent answer fails. |
| A `206` that supplies only part of the file       | A readable, strong quoted `ETag` is required. Weak or absent validators are rejected. A complete small initial `206` needs no validator because no later chunks are needed.                                                                                              |
| Subsequent `206`                                  | Exact requested offsets, the same total length, and the same strong ETag are required before bytes reach PDF.js.                                                                                                                                                         |
| Initial `200 OK` because the server ignored Range | Accepted only with a valid positive `Content-Length` no greater than 8 MiB. This bounded fallback returns the complete file. There is no unbounded retry.                                                                                                                |
| `200 OK` for a later range                        | Rejected. It cannot silently replace part of an in-progress document.                                                                                                                                                                                                    |
| Declared compression                              | `Content-Encoding` must be absent or `identity`. Compressed byte offsets are not accepted.                                                                                                                                                                               |
| Invalid length or body                            | A malformed present `Content-Length`, inconsistent range, excessive progress, or short/long final body fails the load. An absent Content-Length is allowed for `206` only because Content-Range supplies the exact expected byte count.                                  |

Unacceptable declared metadata cancels the request at the header event. An oversized transfer
is canceled when progress first exceeds the declared byte count; the final body is also checked
before delivery. Cancellation cannot claim that the browser never allocated a network chunk.

Each later request sends `If-Range` with the original ETag. This is advisory: the inspected
Nuxeo LTS 2025 `DownloadServiceImpl` does not implement If-Range or If-Match. The client checks
every response's validator and total itself. Last-Modified alone is not used to prove that the
same PDF is still being read.

## Memory boundary

The 8 MiB limit applies only to the initial ignored-range `200` fallback. PDF.js may explicitly
request coalesced spans larger than 8 MiB for printing, search, or document processing. The
adapter accepts an exactly validated span and delivers it in one `onDataRange` callback; it
does not split a PDF.js request into unsolicited callbacks.

This avoids an unconditional whole-file preload for servers that meet the range contract.
It does **not** cap total PDF.js worker, parser, cache, rendered-page, search, or print memory.
PDF.js's chunked stream allocates a worker buffer the size of the whole file, however little of it
is downloaded.
An explicit coalesced request may itself cover most or all of a file.

## Authentication and transport routing

The PDF request goes through the existing authentication and progress interceptors. A dedicated
final interceptor routes only opted-in PDF requests to Angular's `FetchBackend`, allowing header
and progress rejection before the complete body is buffered. Other HTTP requests retain their
existing backend. Non-success response headers become `HttpErrorResponse` within the existing
authentication chain, preserving its error handling.

Every newly issued range request uses the current authentication state. For Nuxeo-origin and
context-path matches, the interceptor attaches the current bearer and `X-Requested-With` header;
waiting for the initial token remains cancelable. The existing transient-read retry policy is
unchanged: retries of an individual request reuse the token captured for that request, rather
than refreshing credentials between retry attempts. A new range or explicit viewer retry goes
through authentication again.

Only HTTP(S) resource URLs are accepted. URLs with embedded user information or an `access_token`
query parameter are rejected. A direct HTTP(S) storage URL outside the configured Nuxeo endpoint
receives no Nuxeo bearer token. It must already be usable under its own delivery contract.

Fetch uses `redirect: 'error'`. This intentionally rejects Nuxeo-to-S3 redirects as well as other
redirects; the application does not resolve or trust an arbitrary redirect destination. A direct,
preauthorized storage URL can work if it independently meets the response and CORS requirements.
No storage-signing or server streaming-grant endpoint is implemented here.

## Cross-origin deployment requirements

A cross-origin PDF endpoint must allow the application's actual origin and the headers it uses:
`Range` and `If-Range`, plus `Authorization` and `X-Requested-With` for authenticated Nuxeo
requests. Expose `Content-Range`, `ETag`, and `Content-Length` to JavaScript, and expose
`Content-Encoding` when present. Merely returning these headers is insufficient if CORS hides
them. Storage endpoints need their own compatible policy.

No Nuxeo, storage, reverse-proxy, or CORS configuration is changed by this implementation. Native
session cookies are not a substitute for the existing bearer-only application path.

## Viewer integration and lifecycle

`PdfRangeBridge` uses the loader and `PDFDataRangeTransport` constructor from the installed
`ngx-extended-pdf-viewer` 32.0.1 assets (PDF.js 6.5.1524, in `assets` and in the configured
`bleeding-edge` build). Real-asset tests exercise range extraction, cancellation, and retained localization
with both exact builds. The locale adapter accepts those two tested versions and declines unknown
versions. It does not import a second PDF.js bundle: PDF.js checks transport constructor identity.
Unavailable viewer assets fail after 15 seconds
instead of leaving the loading state indefinitely pending.

While a range transport is active, the bridge leases the wrapper's shared defaults:
`disableAutoFetch: true`, `disableStream: true`, and `disableRange: false`. Overlapping transports
share the lease; the previous values are restored after the last transport aborts. This is a
shared-options integration boundary, not an isolated per-viewer wrapper API.

Range requests are dispatched in a microtask so PDF.js can register its reader first. Source
changes, failures, and destruction cancel outstanding HTTP subscriptions and abort the transport.
Generation checks prevent obsolete script-loading completions and callbacks from replacing the
current document. Abort is idempotent, releases the options lease, and suppresses late delivery.

The toolbar page box is PDF.js's own `pageNumber` input; ngx would otherwise insert a hidden
placeholder with that ID. PDF.js commits an entry on Enter or blur, validates it against the page
count and page labels, and restores the current page for invalid input. Typing `2398` therefore
requests only page 2398, not pages 2, 23 and 239 on the way. PDF.js then fetches that page's
dictionary, content stream and resources on demand; `currentPage` follows through the viewer's
`page` binding.

## Measuring range cost

`app/testing/pdf-range-measurement.ts` opens a PDF through the 64 KiB first request,
`PdfRangeBridge` and the installed bleeding-edge PDF.js with the viewer's range options, displays
page 1, then displays a target page. It answers PDF.js range requests in lockstep waves, so
_rounds_ count dependent round trips under unlimited concurrency, independent of latency.
_Display_ means the operator list, text content and annotations; canvas painting, viewer DOM work
and server latency are not measured. Synthetic files are generated on demand with a classic xref
table, so a gigabyte-sized document costs only the bytes PDF.js requests.

`pdf-range-measurement.spec.ts` runs a 300-page version in the normal test suite. It asserts that
a jump fetches only the target page in a flat page tree, and only the target's leaf node in a
balanced tree.

`npm run measure:pdf-ranges` runs 10,000-page scenarios locally and writes
`dist/verification/pdf-range-measurement.{json,md,log}`. Options: `--page` (default 2398),
`--pages` (10000), `--scan-bytes` (100000), `--quiet-ms`, `--port`, `--report`, and the repeatable
`--pdf <file>` to measure real documents through a local range server, for example
`npm run measure:pdf-ranges -- --pdf ~/samples/statements.pdf --page 2398`.

What the structure costs:

- Opening walks the page tree to the first and last pages. PDF.js prefetches every child of the
  root `/Pages` node, so a flat tree fetches every page dictionary before page 1 appears. When
  dictionaries sit between page contents, as in scans, that is most of the file.
- In a balanced tree, PDF.js reads the dictionaries that precede the target in its leaf node one
  at a time: about one round trip per earlier sibling.
- A classic xref table is parsed sequentially, one 64 KiB chunk per round trip.
- After opening, a jump in a flat tree costs one to three round trips.

Documents that must open and jump quickly should use a balanced page tree with small leaf nodes
and keep page dictionaries together. Object streams group dictionaries by design; the synthetic
documents do not use them.

## Verification scope

Focused tests cover response validation, early cancellation, large explicit ranges, authentication
routing, the bridge's lifecycle contract, the single exact retry after an unclipped first range,
committed page entry and synthetic page locality. They do not establish deployed CORS behavior,
large-document viewer/print memory, or installed browser acceptance. Those need a deployed
server and its endpoints.
