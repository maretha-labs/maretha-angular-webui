import {
	HttpClient,
	HttpErrorResponse,
	HttpEventType,
	HttpHeaders,
	HttpResponse,
	HttpHeaderResponse,
} from '@angular/common/http';
import { catchError, Observable, Subscription, throwError, timeout } from 'rxjs';
import { pdfRangeHttpContext } from 'app/helpers/pdf-range-http';

export const PDF_INITIAL_RANGE_BYTES = 64 * 1024;
export const PDF_MAX_FALLBACK_BYTES = 8 * 1024 * 1024;
export const PDF_RANGE_IDLE_TIMEOUT_MS = 30_000;

export interface PdfInitialData {
	readonly bytes: Uint8Array;
	readonly length: number;
	readonly complete: boolean;
}

interface PdfResponseMetadata {
	readonly length: number;
	readonly bytes: number;
	readonly complete: boolean;
	readonly validator: string | null;
}

class PdfUnclippedRange extends Error {
	constructor(readonly length: number) {
		super();
	}
}

export class PdfRangeSource {
	private readonly requests = new Set<Subscription>();
	private metadata?: PdfResponseMetadata;
	private closed = false;

	/** `knownLength`: the blob's declared size (`file:content.length`), so the first range never
	 *  runs past a small file. A range past the end makes a proxy in front of Nuxeo (Cloudflare)
	 *  answer 520 or hang, which the stock viewer never triggers because it loads files whole. */
	constructor(
		private readonly http: HttpClient,
		private readonly url: string,
		private readonly knownLength: number | null = null,
	) {}

	load(): Observable<PdfInitialData> {
		const initialEnd =
			this.knownLength && Number.isSafeInteger(this.knownLength) && this.knownLength > 0
				? Math.min(PDF_INITIAL_RANGE_BYTES, this.knownLength)
				: PDF_INITIAL_RANGE_BYTES;
		return new Observable((observer) =>
			this.request(0, initialEnd, true)
				.pipe(
					catchError((error: unknown) => {
						if (error instanceof PdfUnclippedRange) return this.request(0, error.length, true);
						// A proxy in front of Nuxeo (Cloudflare, observed on a hosted Nuxeo) answers 520 when the first range
						// ends past a small file. Stock loads the file whole, so do the same once, bounded
						// by PDF_MAX_FALLBACK_BYTES.
						if (
							error instanceof HttpErrorResponse &&
							![401, 403, 404].includes(error.status) &&
							(error.status === 0 || error.status === 416 || error.status >= 500)
						)
							return this.request(0, PDF_MAX_FALLBACK_BYTES, true, false);
						return throwError(() => error);
					}),
				)
				.subscribe({
					next: (bytes) => {
						const metadata = this.metadata!;
						observer.next({ bytes, length: metadata.length, complete: metadata.complete });
					},
					error: (error: unknown) => observer.error(error),
					complete: () => observer.complete(),
				}),
		);
	}

	read(begin: number, end: number): Observable<Uint8Array> {
		return this.request(begin, end, false);
	}

	abort(): void {
		this.closed = true;
		for (const request of this.requests) request.unsubscribe();
		this.requests.clear();
	}

	private request(
		begin: number,
		end: number,
		initial: boolean,
		ranged = true,
	): Observable<Uint8Array> {
		return new Observable((observer) => {
			const request = new Subscription();
			this.requests.add(request);
			const fail = (error: unknown) => {
				observer.error(error);
				request.unsubscribe();
			};
			try {
				const target = new URL(this.url, document.baseURI);
				if (
					this.closed ||
					!['http:', 'https:'].includes(target.protocol) ||
					target.username ||
					target.password ||
					target.searchParams.has('access_token') ||
					!Number.isSafeInteger(begin) ||
					!Number.isSafeInteger(end) ||
					begin < 0 ||
					end <= begin ||
					(!initial && (!this.metadata || end > this.metadata.length))
				)
					throw new Error('PDF range request is unavailable.');

				let headers = ranged
					? new HttpHeaders({ Range: `bytes=${begin}-${end - 1}` })
					: new HttpHeaders();
				if (ranged && !initial && this.metadata?.validator)
					headers = headers.set('If-Range', this.metadata.validator);
				let responseMetadata: PdfResponseMetadata | undefined;
				request.add(
					this.http
						.get(this.url, {
							headers,
							context: pdfRangeHttpContext(),
							responseType: 'arraybuffer',
							observe: 'events',
							reportProgress: true,
							redirect: 'error',
						})
						.pipe(timeout({ each: PDF_RANGE_IDLE_TIMEOUT_MS }))
						.subscribe({
							next: (event) => {
								try {
									if (
										event.type === HttpEventType.ResponseHeader ||
										event.type === HttpEventType.Response
									)
										responseMetadata = this.validateResponse(event, begin, end, initial);
									if (event.type === HttpEventType.DownloadProgress) {
										if (!responseMetadata || event.loaded > responseMetadata.bytes)
											throw new Error('PDF response exceeded its declared range.');
									}
									if (event.type === HttpEventType.Response) {
										if (!event.body || event.body.byteLength !== responseMetadata!.bytes)
											throw new Error('PDF response did not match its declared range.');
										if (initial) this.metadata = responseMetadata;
										observer.next(new Uint8Array(event.body));
										observer.complete();
									}
								} catch (error) {
									fail(error);
								}
							},
							error: fail,
						}),
				);
			} catch (error) {
				fail(error);
			}
			return () => {
				request.unsubscribe();
				this.requests.delete(request);
			};
		});
	}

	private validateResponse(
		response: HttpHeaderResponse | HttpResponse<ArrayBuffer>,
		begin: number,
		end: number,
		initial: boolean,
	): PdfResponseMetadata {
		const headers = response.headers;
		const encoding = headers.get('Content-Encoding');
		if (encoding && encoding.toLowerCase() !== 'identity')
			throw new Error('PDF byte ranges require an unencoded response.');
		const rawLength = headers.get('Content-Length');
		const contentLength = rawLength && /^\d+$/.test(rawLength) ? Number(rawLength) : null;
		if (rawLength !== null && (contentLength === null || !Number.isSafeInteger(contentLength)))
			throw new Error('The PDF response has an invalid content length.');
		const etag = headers.get('ETag');
		const validator = etag && /^"[^"\r\n]+"$/.test(etag) ? etag : null;

		const rawRange = headers.get('Content-Range');
		if (initial && response.status === 200 && rawRange === null) {
			// A server may ignore Range. Only accept a declared small response; never retry unbounded.
			if (
				!contentLength ||
				!Number.isSafeInteger(contentLength) ||
				contentLength > PDF_MAX_FALLBACK_BYTES
			)
				throw new Error('This server does not support bounded PDF range loading.');
			return { length: contentLength, bytes: contentLength, complete: true, validator };
		}

		// Nuxeo's rendition endpoint sends HTTP 200 even when honoring Range. Validate its
		// Content-Range just as strictly as 206, including the clipped-range retry below.
		const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(rawRange ?? '');
		if (![200, 206].includes(response.status) || !range)
			throw new Error('The server did not return a readable PDF byte range.');
		const [, start, last, total] = range.map(Number);
		// Nuxeo LTS 2025 echoes a first range that ends past a small file and declares bytes it
		// cannot send. Stop at the headers; load() then requests the exact file once.
		if (initial && start === begin && last === end - 1 && total > begin && total < end)
			throw new PdfUnclippedRange(total);
		const bytes = last - start + 1;
		if (
			![start, last, total].every(Number.isSafeInteger) ||
			start !== begin ||
			total <= begin ||
			last !== Math.min(end, total) - 1 ||
			(contentLength !== null && contentLength !== bytes) ||
			(bytes < total && !validator) ||
			(!initial && (total !== this.metadata!.length || validator !== this.metadata!.validator))
		)
			throw new Error('The PDF changed or the server returned an inconsistent byte range.');
		return { length: total, bytes, complete: initial && bytes === total, validator };
	}
}
