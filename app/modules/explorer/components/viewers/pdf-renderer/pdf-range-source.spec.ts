import {
	HttpClient,
	HttpEventType,
	HttpHeaderResponse,
	HttpHeaders,
	provideHttpClient,
	withXhr,
} from '@angular/common/http';
import {
	HttpTestingController,
	provideHttpClientTesting,
	TestRequest,
} from '@angular/common/http/testing';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import {
	PDF_INITIAL_RANGE_BYTES,
	PDF_MAX_FALLBACK_BYTES,
	PDF_RANGE_IDLE_TIMEOUT_MS,
	PdfRangeSource,
} from './pdf-range-source';

const URL = 'http://localhost:8080/nuxeo/nxfile/default/document/file:content/report.pdf';
const FIRST = PDF_INITIAL_RANGE_BYTES;
const TOTAL = FIRST * 3;
const ETAG = '"original-blob"';

function observe<T>(stream: Observable<T>) {
	const next = jasmine.createSpy('next');
	const error = jasmine.createSpy('error');
	const complete = jasmine.createSpy('complete');
	return { next, error, complete, subscription: stream.subscribe({ next, error, complete }) };
}

function rangeHeaders(
	begin = 0,
	end = FIRST,
	total = TOTAL,
	changes: Record<string, string | null> = {},
) {
	let headers = new HttpHeaders({
		'Content-Range': `bytes ${begin}-${end - 1}/${total}`,
		'Content-Length': String(end - begin),
		ETag: ETAG,
	});
	for (const [name, value] of Object.entries(changes))
		headers = value === null ? headers.delete(name) : headers.set(name, value);
	return headers;
}

function responseHeaders(request: TestRequest, headers: HttpHeaders, status = 206): void {
	request.event(new HttpHeaderResponse({ status, headers, url: URL }));
}

describe('PdfRangeSource', () => {
	let http: HttpTestingController;
	let client: HttpClient;
	let source: PdfRangeSource;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
		client = TestBed.inject(HttpClient);
		source = new PdfRangeSource(client, URL);
	});

	afterEach(() => {
		source.abort();
		http.verify({ ignoreCancelled: true });
	});

	function prime(total = TOTAL): void {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		const headers = rangeHeaders(0, FIRST, total);
		responseHeaders(request, headers);
		request.flush(new Uint8Array(FIRST).buffer, {
			status: 206,
			statusText: 'Partial Content',
			headers,
		});
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next).toHaveBeenCalledTimes(1);
	}

	it('clips a Nuxeo rendition range returned with HTTP 200 before reading its short body', () => {
		const result = observe(source.load());
		const oversized = http.expectOne(URL);
		responseHeaders(oversized, rangeHeaders(0, FIRST, 30459), 200);
		expect(oversized.cancelled).toBeTrue();
		const exact = http.expectOne(URL);
		expect(exact.request.headers.get('Range')).toBe('bytes=0-30458');
		const headers = rangeHeaders(0, 30459, 30459);
		responseHeaders(exact, headers, 200);
		exact.flush(new Uint8Array(30459).buffer, { status: 200, statusText: 'OK', headers });
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next.calls.mostRecent().args[0]).toEqual({
			bytes: new Uint8Array(30459),
			length: 30459,
			complete: true,
		});
	});

	it('validates and streams HTTP 200 rendition ranges with the original validator', () => {
		const result = observe(source.load());
		const first = http.expectOne(URL);
		first.flush(new Uint8Array(FIRST).buffer, {
			status: 200,
			statusText: 'OK',
			headers: rangeHeaders(),
		});
		expect(result.next.calls.mostRecent().args[0].complete).toBeFalse();
		const later = observe(source.read(FIRST, FIRST * 2));
		const next = http.expectOne(URL);
		expect(next.request.headers.get('If-Range')).toBe(ETAG);
		next.flush(new Uint8Array(FIRST).buffer, {
			status: 200,
			statusText: 'OK',
			headers: rangeHeaders(FIRST, FIRST * 2),
		});
		expect(later.error).not.toHaveBeenCalled();
		expect(later.next).toHaveBeenCalledTimes(1);
	});

	it('cancels a stalled response and reports failure instead of leaving the preview loading', fakeAsync(() => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		responseHeaders(request, rangeHeaders());
		tick(PDF_RANGE_IDLE_TIMEOUT_MS);
		expect(request.cancelled).toBeTrue();
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(result.next).not.toHaveBeenCalled();
	}));

	it('starts with only 64 KiB and returns the total length without fetching the remaining file', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		expect(request.request.headers.get('Range')).toBe('bytes=0-65535');
		expect(request.request.headers.has('If-Range')).toBeFalse();
		expect(request.request.responseType).toBe('arraybuffer');
		expect(request.request.reportProgress).toBeTrue();
		expect(request.request.redirect).toBe('error');
		const headers = rangeHeaders();
		responseHeaders(request, headers);
		expect(result.next).not.toHaveBeenCalled();
		const body = new Uint8Array(FIRST).fill(37);
		request.flush(body.buffer, { status: 206, statusText: 'Partial Content', headers });
		expect(result.next).toHaveBeenCalledOnceWith({ bytes: body, length: TOTAL, complete: false });
		expect(result.complete).toHaveBeenCalledTimes(1);
		expect(result.error).not.toHaveBeenCalled();
		http.expectNone(URL);
	});

	it('requests exact later offsets with the initial strong ETag in If-Range', () => {
		prime();
		const result = observe(source.read(FIRST, FIRST + 8));
		const request = http.expectOne(URL);
		expect(request.request.headers.get('Range')).toBe(`bytes=${FIRST}-${FIRST + 7}`);
		expect(request.request.headers.get('If-Range')).toBe(ETAG);
		const headers = rangeHeaders(FIRST, FIRST + 8);
		responseHeaders(request, headers);
		const body = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
		request.flush(body.buffer, { status: 206, statusText: 'Partial Content', headers });
		expect(result.next).toHaveBeenCalledOnceWith(body);
		expect(result.complete).toHaveBeenCalledTimes(1);
	});

	for (const [description, changes] of [
		['a changed ETag', { ETag: '"replacement-blob"' }],
		['a missing ETag', { ETag: null }],
		['a weak ETag', { ETag: 'W/"original-blob"' }],
		['a changed total length', { 'Content-Range': `bytes ${FIRST}-${FIRST + 7}/${TOTAL + 1}` }],
	] as const) {
		it(`rejects ${description} before another chunk body is received`, () => {
			prime();
			const result = observe(source.read(FIRST, FIRST + 8));
			const request = http.expectOne(URL);
			responseHeaders(request, rangeHeaders(FIRST, FIRST + 8, TOTAL, changes));
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
			expect(request.cancelled).toBeTrue();
		});
	}

	for (const etag of [null, 'W/"weak"', 'unquoted']) {
		it(`refuses a partial initial response without a strong validator (${etag})`, () => {
			const result = observe(source.load());
			const request = http.expectOne(URL);
			responseHeaders(request, rangeHeaders(0, FIRST, TOTAL, { ETag: etag }));
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(request.cancelled).toBeTrue();
		});
	}

	it('accepts a complete small 206 response without requiring a later-chunk validator', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		const headers = rangeHeaders(0, 3, 3, { ETag: null });
		responseHeaders(request, headers);
		const bytes = new Uint8Array([1, 2, 3]);
		request.flush(bytes.buffer, { status: 206, statusText: 'Partial Content', headers });
		expect(result.next).toHaveBeenCalledOnceWith({ bytes, length: 3, complete: true });
	});

	it('re-requests the exact file once when the server echoes a first range past a small file', () => {
		const result = observe(source.load());
		const first = http.expectOne(URL);
		responseHeaders(first, rangeHeaders(0, FIRST, 3000));
		expect(first.cancelled).toBeTrue();
		expect(result.error).not.toHaveBeenCalled();
		const retry = http.expectOne(URL);
		expect(retry.request.headers.get('Range')).toBe('bytes=0-2999');
		const headers = rangeHeaders(0, 3000, 3000);
		responseHeaders(retry, headers);
		const bytes = new Uint8Array(3000).fill(7);
		retry.flush(bytes.buffer, { status: 206, statusText: 'Partial Content', headers });
		expect(result.next).toHaveBeenCalledOnceWith({ bytes, length: 3000, complete: true });
		expect(result.complete).toHaveBeenCalledTimes(1);
		http.expectNone(URL);
	});

	it('fails instead of retrying an echoed first range a second time', () => {
		const result = observe(source.load());
		responseHeaders(http.expectOne(URL), rangeHeaders(0, FIRST, 3000));
		const retry = http.expectOne(URL);
		responseHeaders(retry, rangeHeaders(0, 3000, 2000));
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(result.next).not.toHaveBeenCalled();
		expect(retry.cancelled).toBeTrue();
		http.expectNone(URL);
	});

	it('accepts an exactly matched 9 MiB explicit range coalesced by PDF.js for print or search', () => {
		const size = 9 * 1024 * 1024;
		const total = FIRST + size;
		prime(total);
		const result = observe(source.read(FIRST, total));
		const request = http.expectOne(URL);
		expect(request.request.headers.get('Range')).toBe(`bytes=${FIRST}-${total - 1}`);
		expect(request.request.headers.get('If-Range')).toBe(ETAG);
		const headers = rangeHeaders(FIRST, total, total);
		responseHeaders(request, headers);
		expect(request.cancelled).toBeFalse();
		const bytes = new Uint8Array(size);
		request.flush(bytes.buffer, { status: 206, statusText: 'Partial Content', headers });
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next).toHaveBeenCalledTimes(1);
		const delivered = result.next.calls.mostRecent().args[0] as Uint8Array;
		expect(delivered.byteLength).toBe(size);
		expect(delivered.buffer).toBe(bytes.buffer);
		expect(result.complete).toHaveBeenCalledTimes(1);
	});

	it('accepts an ignored Range only when the full 200 response declares at most 8 MiB', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		const headers = new HttpHeaders({ 'Content-Length': String(PDF_MAX_FALLBACK_BYTES) });
		responseHeaders(request, headers, 200);
		expect(request.cancelled).toBeFalse();
		const bytes = new Uint8Array(PDF_MAX_FALLBACK_BYTES);
		request.flush(bytes.buffer, { status: 200, statusText: 'OK', headers });
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next.calls.mostRecent().args[0].length).toBe(PDF_MAX_FALLBACK_BYTES);
		expect(result.next.calls.mostRecent().args[0].complete).toBeTrue();
	});

	for (const length of [
		null,
		String(PDF_MAX_FALLBACK_BYTES + 1),
		'0',
		'-1',
		'8e6',
		'9007199254740992',
	]) {
		it(`cancels a 200 fallback with invalid or excessive declared length (${length}) at headers`, () => {
			const result = observe(source.load());
			const request = http.expectOne(URL);
			const headers =
				length === null ? new HttpHeaders() : new HttpHeaders({ 'Content-Length': length });
			responseHeaders(request, headers, 200);
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
			expect(request.cancelled).toBeTrue();
		});
	}

	for (const contentRange of [
		null,
		'garbage',
		`bytes 1-${FIRST}/${TOTAL}`,
		`bytes 0-${FIRST - 2}/${TOTAL}`,
		`bytes 0-${FIRST - 1}/*`,
		`bytes 0-${FIRST - 1}/0`,
		`bytes 0-${FIRST - 1}/9007199254740992`,
	]) {
		it(`cancels inconsistent Content-Range at headers (${contentRange})`, () => {
			const result = observe(source.load());
			const request = http.expectOne(URL);
			responseHeaders(request, rangeHeaders(0, FIRST, TOTAL, { 'Content-Range': contentRange }));
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
			expect(request.cancelled).toBeTrue();
		});
	}

	for (const length of ['garbage', '-1', '65536.0', String(FIRST - 1)]) {
		it(`rejects malformed or inconsistent Content-Length on 206 (${length})`, () => {
			const result = observe(source.load());
			const request = http.expectOne(URL);
			responseHeaders(request, rangeHeaders(0, FIRST, TOTAL, { 'Content-Length': length }));
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(request.cancelled).toBeTrue();
		});
	}

	it('accepts a range without Content-Length when Content-Range bounds the exact body', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		const headers = rangeHeaders(0, FIRST, TOTAL, { 'Content-Length': null });
		responseHeaders(request, headers);
		request.flush(new Uint8Array(FIRST).buffer, {
			status: 206,
			statusText: 'Partial Content',
			headers,
		});
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next).toHaveBeenCalledTimes(1);
	});

	it('rejects compressed responses before accepting byte offsets', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		responseHeaders(request, rangeHeaders(0, FIRST, TOTAL, { 'Content-Encoding': 'gzip' }));
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(request.cancelled).toBeTrue();
	});

	it('cancels excessive download progress before accepting a body', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		responseHeaders(request, rangeHeaders());
		request.event({ type: HttpEventType.DownloadProgress, loaded: FIRST + 1 });
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(result.next).not.toHaveBeenCalled();
		expect(request.cancelled).toBeTrue();
	});

	it('rejects progress before readable response headers', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		request.event({ type: HttpEventType.DownloadProgress, loaded: 1 });
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(request.cancelled).toBeTrue();
	});

	for (const length of [FIRST - 1, FIRST + 1]) {
		it(`rejects a body whose actual length is ${length} rather than the declared range`, () => {
			const result = observe(source.load());
			const request = http.expectOne(URL);
			const headers = rangeHeaders();
			responseHeaders(request, headers);
			request.flush(new Uint8Array(length).buffer, {
				status: 206,
				statusText: 'Partial Content',
				headers,
			});
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
		});
	}

	it('never accepts an unbounded 200 response to a later range request', () => {
		prime();
		const result = observe(source.read(FIRST, FIRST + 8));
		const request = http.expectOne(URL);
		responseHeaders(request, new HttpHeaders({ 'Content-Length': '8', ETag: ETAG }), 200);
		expect(result.error).toHaveBeenCalledTimes(1);
		expect(request.cancelled).toBeTrue();
	});

	it('rejects reads before initial metadata and invalid indexes without making HTTP requests', () => {
		const early = observe(source.read(0, 8));
		expect(early.error).toHaveBeenCalledTimes(1);
		http.expectNone(URL);
		prime(PDF_MAX_FALLBACK_BYTES * 2);
		for (const [begin, end] of [
			[-1, 1],
			[0, 0],
			[2, 1],
			[0.5, 2],
			[0, 1.5],
			[0, Number.NaN],
			[0, Number.POSITIVE_INFINITY],
			[0, Number.MAX_SAFE_INTEGER + 1],
			[PDF_MAX_FALLBACK_BYTES * 2, PDF_MAX_FALLBACK_BYTES * 2 + 1],
		]) {
			const result = observe(source.read(begin, end));
			expect(result.error).withContext(`${begin}:${end}`).toHaveBeenCalledTimes(1);
			http.expectNone(URL);
		}
	});

	it('cancels every active request on abort and rejects subsequent reads', () => {
		prime();
		const first = observe(source.read(FIRST, FIRST + 8));
		const firstRequest = http.expectOne(URL);
		const second = observe(source.read(FIRST + 8, FIRST + 16));
		const secondRequest = http.expectOne(URL);
		source.abort();
		expect(firstRequest.cancelled).toBeTrue();
		expect(secondRequest.cancelled).toBeTrue();
		expect(first.next).not.toHaveBeenCalled();
		expect(second.next).not.toHaveBeenCalled();
		const later = observe(source.read(0, 8));
		expect(later.error).toHaveBeenCalledTimes(1);
		http.expectNone(URL);
	});

	it('cancels the initial request when the load subscriber unsubscribes', () => {
		const result = observe(source.load());
		const request = http.expectOne(URL);
		result.subscription.unsubscribe();
		expect(request.cancelled).toBeTrue();
	});

	for (const url of [
		'https://user:secret@example.test/file.pdf',
		'https://user@example.test/file.pdf',
		'file:///tmp/file.pdf',
		'data:application/pdf;base64,AAAA',
		URL + '?access_token=secret',
	]) {
		it(`rejects an unsafe source URL without requesting it (${url.split(':')[0]})`, () => {
			const result = observe(new PdfRangeSource(client, url).load());
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
			http.expectNone(() => true);
		});
	}
	it('loads the whole file once, unranged and bounded, after a proxy rejects the first range', () => {
		const result = observe(source.load());
		http.expectOne(URL).flush(null, { status: 520, statusText: 'Origin Error' });
		const fallback = http.expectOne(URL);
		expect(fallback.request.headers.has('Range')).toBeFalse();
		const headers = new HttpHeaders({ 'Content-Length': String(FIRST) });
		responseHeaders(fallback, headers, 200);
		fallback.flush(new Uint8Array(FIRST).buffer, { status: 200, statusText: 'OK', headers });
		expect(result.error).not.toHaveBeenCalled();
		expect(result.next).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ length: FIRST, complete: true }),
		);
		expect(result.complete).toHaveBeenCalledTimes(1);
	});

	for (const status of [401, 403, 404, 400]) {
		it(`reports a ${status} first range as a failure without loading the file whole`, () => {
			const result = observe(source.load());
			http.expectOne(URL).flush(null, { status, statusText: 'Refused' });
			http.expectNone(URL);
			expect(result.error).toHaveBeenCalledTimes(1);
			expect(result.next).not.toHaveBeenCalled();
		});
	}

	it('clips the first range to a declared blob length and ignores unusable declared lengths', () => {
		for (const [length, range] of [
			[1000, 'bytes=0-999'],
			[FIRST * 4, `bytes=0-${FIRST - 1}`],
			[0, `bytes=0-${FIRST - 1}`],
			[-5, `bytes=0-${FIRST - 1}`],
			[12.5, `bytes=0-${FIRST - 1}`],
			[Number.MAX_SAFE_INTEGER + 2, `bytes=0-${FIRST - 1}`],
		] as [number, string][]) {
			const sized = new PdfRangeSource(client, URL, length);
			observe(sized.load());
			expect(http.expectOne(URL).request.headers.get('Range'))
				.withContext(String(length))
				.toBe(range);
			sized.abort();
		}
	});
});
