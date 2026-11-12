import {
	FetchBackend,
	HTTP_INTERCEPTORS,
	HttpClient,
	HttpErrorResponse,
	HttpEventType,
	HttpInterceptorFn,
	provideHttpClient,
	withInterceptors,
	withInterceptorsFromDi,
	withXhr,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from 'environments/environment';
import { ToastService } from 'app/helpers/toast.service';
import { firstValueFrom, Subject, Subscription, toArray } from 'rxjs';
import { HttpInterceptorService } from './http-interceptor.service';
import { pdfRangeHttpContext, pdfRangeHttpInterceptor } from './pdf-range-http';
import { TokenService } from './token.service';
import { PdfRangeSource } from 'app/modules/explorer/components/viewers/pdf-renderer/pdf-range-source';

describe('PDF range Fetch transport', () => {
	let http: HttpClient;
	let xhr: HttpTestingController;
	let fetch: jasmine.Spy<typeof globalThis.fetch>;
	let url: string;
	let progressRequests: number;
	let login: jasmine.Spy;
	let tokens: {
		accessToken: string | null;
		isAccessTokenValid: boolean;
		tokenUpdated$: Subject<string | null>;
	};
	const originalNuxeoUrl = environment.nuxeoUrl;

	beforeEach(() => {
		environment.nuxeoUrl = new URL('/nuxeo', document.baseURI).href;
		url = environment.nuxeoUrl + '/api/v1/id/doc/@blob/file:content';
		tokens = {
			accessToken: 'first-token',
			isAccessTokenValid: true,
			tokenUpdated$: new Subject<string | null>(),
		};
		progressRequests = 0;
		const progress: HttpInterceptorFn = (request, next) => {
			progressRequests++;
			return next(request);
		};
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(
					withXhr(),
					withInterceptorsFromDi(),
					withInterceptors([progress, pdfRangeHttpInterceptor]),
				),
				provideHttpClientTesting(),
				FetchBackend,
				HttpInterceptorService,
				{ provide: HTTP_INTERCEPTORS, useExisting: HttpInterceptorService, multi: true },
				{ provide: TokenService, useValue: tokens },
				{ provide: Router, useValue: {} },
				{ provide: ToastService, useValue: { error: jasmine.createSpy('error') } },
			],
		});
		http = TestBed.inject(HttpClient);
		xhr = TestBed.inject(HttpTestingController);
		login = spyOn<any>(TestBed.inject(HttpInterceptorService), 'logIn');
		fetch = spyOn(globalThis, 'fetch').and.callFake(() =>
			Promise.resolve(
				new Response(new Uint8Array([1, 2, 3]), {
					status: 206,
					headers: { 'Content-Range': 'bytes 0-2/3', 'Content-Length': '3' },
				}),
			),
		);
	});

	afterEach(() => {
		xhr.verify();
		tokens.tokenUpdated$.complete();
		environment.nuxeoUrl = originalNuxeoUrl;
	});

	it('retains authentication and progress while enforcing Fetch redirects and early headers', async () => {
		const events = await firstValueFrom(
			http
				.get(url, {
					context: pdfRangeHttpContext(),
					responseType: 'arraybuffer',
					observe: 'events',
					redirect: 'follow',
					headers: { Range: 'bytes=0-2' },
				})
				.pipe(toArray()),
		);
		const options = fetch.calls.mostRecent().args[1]!;
		const headers = new Headers(options.headers);
		expect(headers.get('Authorization')).toBe('Bearer first-token');
		expect(headers.get('X-Requested-With')).toBe('XMLHttpRequest');
		expect(headers.get('Range')).toBe('bytes=0-2');
		expect(options.redirect).toBe('error');
		expect(progressRequests).toBe(1);
		expect(events.map((event) => event.type)).toEqual([
			HttpEventType.Sent,
			HttpEventType.ResponseHeader,
			HttpEventType.DownloadProgress,
			HttpEventType.Response,
		]);
	});

	it('uses the current bearer for a new range after token refresh', async () => {
		const options = { context: pdfRangeHttpContext(), responseType: 'arraybuffer' as const };
		await firstValueFrom(http.get(url, options));
		tokens.accessToken = 'refreshed-token';
		await firstValueFrom(http.get(url, options));
		expect(new Headers(fetch.calls.argsFor(0)[1]!.headers).get('Authorization')).toBe(
			'Bearer first-token',
		);
		expect(new Headers(fetch.calls.argsFor(1)[1]!.headers).get('Authorization')).toBe(
			'Bearer refreshed-token',
		);
	});

	it('leaves unmarked requests on the ordinary backend', () => {
		http.get(url, { responseType: 'arraybuffer' }).subscribe();
		const request = xhr.expectOne(url);
		expect(request.request.headers.get('Authorization')).toBe('Bearer first-token');
		expect(request.request.reportProgress).toBeFalse();
		request.flush(new ArrayBuffer(0));
		expect(fetch).not.toHaveBeenCalled();
	});

	it('cancels a marked request while it waits for a valid token', () => {
		tokens.accessToken = null;
		tokens.isAccessTokenValid = false;
		const request = http
			.get(url, { context: pdfRangeHttpContext(), responseType: 'arraybuffer' })
			.subscribe();
		request.unsubscribe();
		tokens.isAccessTokenValid = true;
		tokens.tokenUpdated$.next('late-token');
		expect(fetch).not.toHaveBeenCalled();
	});

	function pendingBodyResponse(status: number): { aborted: () => boolean } {
		let signal: AbortSignal | undefined;
		fetch.and.callFake((_url, options) => {
			signal = options!.signal!;
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					signal!.addEventListener('abort', () =>
						controller.error(new DOMException('Aborted', 'AbortError')),
					);
				},
			});
			return Promise.resolve(new Response(body, { status }));
		});
		return { aborted: () => signal?.aborted === true };
	}

	it('aborts the Fetch body when the reader rejects a successful response at its headers', async () => {
		const transport = pendingBodyResponse(200);
		let subscription: Subscription;
		await new Promise<void>((resolve, reject) => {
			subscription = http
				.get(url, {
					context: pdfRangeHttpContext(),
					responseType: 'arraybuffer',
					observe: 'events',
				})
				.subscribe({
					next: (event) => {
						if (event.type === HttpEventType.ResponseHeader) {
							subscription.unsubscribe();
							resolve();
						}
					},
					error: reject,
				});
		});
		expect(transport.aborted()).toBeTrue();
	});

	it('passes a header-level 401 through the existing authentication failure handler', async () => {
		const transport = pendingBodyResponse(401);
		const error = await firstValueFrom(
			http.get(url, { context: pdfRangeHttpContext(), responseType: 'arraybuffer' }),
		).catch((failure: unknown) => failure);
		expect(error instanceof HttpErrorResponse).toBeTrue();
		expect((error as HttpErrorResponse).status).toBe(401);
		expect(login).toHaveBeenCalledTimes(1);
		expect(transport.aborted()).toBeTrue();
	});

	it('rejects an oversized PDF fallback before pulling any response body bytes', async () => {
		let pulledBytes = 0;
		let signal: AbortSignal | undefined;
		fetch.and.callFake((_url, options) => {
			signal = options!.signal!;
			const body = new ReadableStream<Uint8Array>(
				{
					start(controller) {
						signal!.addEventListener('abort', () =>
							controller.error(new DOMException('Aborted', 'AbortError')),
						);
					},
					pull(controller) {
						pulledBytes += 64 * 1024;
						controller.enqueue(new Uint8Array(64 * 1024));
						controller.close();
					},
				},
				{ highWaterMark: 0 },
			);
			return Promise.resolve(
				new Response(body, { status: 200, headers: { 'Content-Length': String(9 * 1024 * 1024) } }),
			);
		});
		await expectAsync(firstValueFrom(new PdfRangeSource(http, url).load())).toBeRejected();
		expect(signal?.aborted).toBeTrue();
		expect(pulledBytes).toBe(0);
	});

	it('reloads a small PDF exactly without reading the body of an echoed Nuxeo first range', async () => {
		const pdf = new Uint8Array(3000).fill(7);
		const signals: AbortSignal[] = [];
		let pulledBytes = 0;
		fetch.and.callFake((_url, options) => {
			const signal = options!.signal!;
			signals.push(signal);
			if (new Headers(options!.headers).get('Range') === 'bytes=0-2999')
				return Promise.resolve(
					new Response(pdf, {
						status: 206,
						headers: {
							'Content-Range': 'bytes 0-2999/3000',
							'Content-Length': '3000',
							ETag: '"small-pdf"',
						},
					}),
				);
			const body = new ReadableStream<Uint8Array>(
				{
					start(controller) {
						signal.addEventListener('abort', () =>
							controller.error(new DOMException('Aborted', 'AbortError')),
						);
					},
					pull(controller) {
						pulledBytes += pdf.length;
						controller.enqueue(pdf);
					},
				},
				{ highWaterMark: 0 },
			);
			return Promise.resolve(
				new Response(body, {
					status: 206,
					headers: {
						'Content-Range': 'bytes 0-65535/3000',
						'Content-Length': '65536',
						ETag: '"small-pdf"',
					},
				}),
			);
		});
		const data = await firstValueFrom(new PdfRangeSource(http, url).load());
		expect(data).toEqual({ bytes: pdf, length: 3000, complete: true });
		expect(
			fetch.calls.allArgs().map(([, options]) => new Headers(options!.headers).get('Range')),
		).toEqual(['bytes=0-65535', 'bytes=0-2999']);
		expect(signals[0].aborted).toBeTrue();
		expect(pulledBytes).toBe(0);
	});

	it('retires every pending Fetch body over repeated PDF replacement', async () => {
		const active = new Set<AbortSignal>();
		fetch.and.callFake((_url, options) => {
			const signal = options!.signal!;
			active.add(signal);
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					signal.addEventListener('abort', () => {
						active.delete(signal);
						controller.error(new DOMException('Aborted', 'AbortError'));
					});
				},
			});
			return Promise.resolve(
				new Response(body, {
					status: 206,
					headers: {
						'Content-Range': `bytes 0-65535/${8 * 1024 * 1024 * 1024}`,
						'Content-Length': '65536',
						ETag: '"large-pdf"',
					},
				}),
			);
		});
		for (let cycle = 0; cycle < 25; cycle++) {
			const source = new PdfRangeSource(http, url);
			const received = jasmine.createSpy('received');
			const subscription = source.load().subscribe({ next: received, error: () => undefined });
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(active.size).toBe(1);
			expect(new Headers(fetch.calls.mostRecent().args[1]!.headers).get('Range')).toBe(
				'bytes=0-65535',
			);
			source.abort();
			expect(active.size).toBe(0);
			expect(received).not.toHaveBeenCalled();
			subscription.unsubscribe();
		}
		expect(fetch).toHaveBeenCalledTimes(25);
	});
});
