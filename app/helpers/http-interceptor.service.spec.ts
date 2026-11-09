import {
	HttpContext,
	HttpErrorResponse,
	HttpHandler,
	HttpHeaders,
	HttpRequest,
	HttpResponse,
} from '@angular/common/http';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { environment } from 'environments/environment';
import { ToastrService } from 'ngx-toastr';
import { defer, of, Subject, throwError } from 'rxjs';
import { HttpInterceptorService, UNAUTHORIZED_IS_FORM_ERROR } from './http-interceptor.service';
import { TokenService } from './token.service';

describe('HttpInterceptorService transport boundary', () => {
	let service: HttpInterceptorService;
	let tokenUpdates: Subject<string | null>;
	let tokenService: {
		accessToken: string | null;
		isAccessTokenValid: boolean;
		tokenUpdated$: Subject<string | null>;
	};
	let next: jasmine.SpyObj<HttpHandler>;
	let toastr: jasmine.SpyObj<ToastrService>;
	let login: jasmine.Spy;
	let errors: jasmine.Spy;
	let requests: HttpRequest<unknown>[];
	let failure: HttpErrorResponse | Error | undefined;
	let configuredUrl: string;
	const originalNuxeoUrl = environment.nuxeoUrl;

	beforeEach(() => {
		configuredUrl = new URL('/nuxeo', document.baseURI).href;
		environment.nuxeoUrl = configuredUrl;
		tokenUpdates = new Subject<string | null>();
		tokenService = {
			accessToken: 'test-access-token',
			isAccessTokenValid: true,
			tokenUpdated$: tokenUpdates,
		};
		toastr = jasmine.createSpyObj<ToastrService>('ToastrService', ['error']);
		next = jasmine.createSpyObj<HttpHandler>('HttpHandler', ['handle']);
		errors = jasmine.createSpy('error');
		requests = [];
		failure = undefined;
		next.handle.and.callFake((request) =>
			defer(() => {
				requests.push(request);
				return failure ? throwError(() => failure) : of(new HttpResponse({ status: 200 }));
			}),
		);
		service = TestBed.runInInjectionContext(
			() =>
				new HttpInterceptorService(tokenService as unknown as TokenService, {} as Router, toastr),
		);
		login = spyOn<any>(service, 'logIn');
	});

	afterEach(() => {
		environment.nuxeoUrl = originalNuxeoUrl;
		tokenUpdates.complete();
	});

	function request(url = `${configuredUrl}/api/v1/id/document`, method = 'GET') {
		return service.intercept(new HttpRequest(method, url, null), next).subscribe({ error: errors });
	}

	it('attaches Nuxeo credentials and headers inside the configured context', () => {
		request();
		expect(requests[0].headers.get('Authorization')).toBe('Bearer test-access-token');
		expect(requests[0].headers.get('X-Requested-With')).toBe('XMLHttpRequest');
	});

	it('matches root-relative Nuxeo URLs and a configured trailing slash', () => {
		environment.nuxeoUrl = `${configuredUrl}/`;
		request('/nuxeo/api/v1/id/document');
		expect(requests[0].headers.has('Authorization')).toBeTrue();
	});

	it('resolves relative URLs and relative configuration against the document base', () => {
		environment.nuxeoUrl = '.';
		request('api/v1/id/document');
		expect(requests[0].headers.has('Authorization')).toBeTrue();
	});

	for (const suffix of ['/nuxeo-other/api/v1', '/other/api/v1', '/nuxeo/../other/api/v1']) {
		it(`does not attach credentials outside the context path: ${suffix}`, () => {
			request(new URL(suffix, document.baseURI).href);
			expect(requests[0].headers.has('Authorization')).toBeFalse();
			expect(requests[0].headers.has('X-Requested-With')).toBeFalse();
		});
	}

	for (const url of [
		'https://extension.example/nuxeo/api/v1',
		'//extension.example/nuxeo/api/v1',
		'https://localhost.invalid/nuxeo/api/v1',
		'http://[invalid',
	]) {
		it(`passes through unrelated or invalid URLs unchanged: ${url}`, () => {
			const original = new HttpRequest('GET', url, {
				headers: new HttpHeaders({ Authorization: 'Client-owned authorization' }),
			});
			service.intercept(original, next).subscribe({ error: errors });
			expect(requests[0]).toBe(original);
			expect(toastr.error).not.toHaveBeenCalled();
			expect(login).not.toHaveBeenCalled();
		});
	}

	it('requires the configured protocol and port as well as hostname', () => {
		environment.nuxeoUrl = 'https://nuxeo.example:8443/nuxeo';
		request('https://nuxeo.example/nuxeo/api/v1');
		request('http://nuxeo.example:8443/nuxeo/api/v1');
		expect(requests.every((entry) => !entry.headers.has('Authorization'))).toBeTrue();
	});

	it('does not broaden credential scope when configuration is missing or invalid', () => {
		for (const value of ['', 'http://[invalid', 'file:///nuxeo']) {
			environment.nuxeoUrl = value;
			request('/nuxeo/api/v1');
		}
		expect(requests.every((entry) => !entry.headers.has('Authorization'))).toBeTrue();
	});

	it('does not hold extension requests until authentication completes', () => {
		tokenService.accessToken = null;
		tokenService.isAccessTokenValid = false;
		request('https://extension.example/data');
		expect(requests.length).toBe(1);
		expect(login).not.toHaveBeenCalled();
	});

	it('does not expire a Nuxeo session because of an unrelated 401 response', () => {
		tokenService.isAccessTokenValid = false;
		failure = new HttpErrorResponse({ status: 401 });
		request('https://extension.example/data');
		expect(requests.length).toBe(1);
		expect(errors).toHaveBeenCalledWith(failure);
		expect(login).not.toHaveBeenCalled();
		expect(toastr.error).not.toHaveBeenCalled();
	});

	it('leaves a 401 flagged as a form error to the caller instead of expiring the session', () => {
		failure = new HttpErrorResponse({ status: 401 });
		service
			.intercept(
				new HttpRequest('PUT', `${configuredUrl}/api/v1/me/changepassword`, null, {
					context: new HttpContext().set(UNAUTHORIZED_IS_FORM_ERROR, true),
				}),
				next,
			)
			.subscribe({ error: errors });
		expect(errors).toHaveBeenCalledWith(failure);
		expect(login).not.toHaveBeenCalled();
		expect(toastr.error).not.toHaveBeenCalled();
		request(`${configuredUrl}/api/v1/me/changepassword`, 'PUT');
		expect(login).toHaveBeenCalled();
	});
	it('does not retry failures from unrelated services', fakeAsync(() => {
		failure = new HttpErrorResponse({ status: 503 });
		request('https://extension.example/data');
		tick(10000);
		expect(requests.length).toBe(1);
	}));

	it('lets token exchanges proceed without a token and preserves the configuration error', () => {
		tokenService.accessToken = null;
		tokenService.isAccessTokenValid = false;
		failure = new HttpErrorResponse({ status: 403 });
		request('/nuxeo/oauth2/token?source=callback', 'POST');
		expect(requests.length).toBe(1);
		expect(requests[0].headers.has('Authorization')).toBeFalse();
		expect(requests[0].headers.get('X-Requested-With')).toBe('XMLHttpRequest');
		expect(toastr.error).toHaveBeenCalled();
		expect(errors).toHaveBeenCalledWith(failure);
		expect(login).not.toHaveBeenCalled();
	});

	it('never retries token exchanges or adds a stored bearer token', fakeAsync(() => {
		failure = new HttpErrorResponse({ status: 503 });
		request(`${configuredUrl}/oauth2/token`, 'POST');
		tick(10000);
		expect(requests.length).toBe(1);
		expect(requests[0].headers.has('Authorization')).toBeFalse();
	}));

	it('preserves the existing expired-session redirect before a Nuxeo request', () => {
		tokenService.isAccessTokenValid = false;
		request();
		expect(requests.length).toBe(0);
		expect(login).toHaveBeenCalledTimes(1);
		expect(toastr.error).toHaveBeenCalled();
		expect(errors).toHaveBeenCalled();
	});

	it('preserves the existing redirect for an established Nuxeo session rejected with 401', () => {
		failure = new HttpErrorResponse({ status: 401 });
		request();
		expect(requests.length).toBe(1);
		expect(login).toHaveBeenCalledTimes(1);
		expect(errors).toHaveBeenCalledWith(failure);
	});

	it('waits for one valid token and never replays a write on token refresh', () => {
		tokenService.accessToken = null;
		tokenService.isAccessTokenValid = false;
		const completed = jasmine.createSpy('complete');
		service
			.intercept(new HttpRequest('POST', `${configuredUrl}/api/v1/automation`, {}), next)
			.subscribe({ complete: completed, error: errors });
		tokenUpdates.next(null);
		tokenUpdates.next('stale-token');
		expect(requests.length).toBe(0);
		tokenService.isAccessTokenValid = true;
		tokenUpdates.next('first-valid-token');
		tokenUpdates.next('refreshed-token');
		expect(requests.length).toBe(1);
		expect(requests[0].headers.get('Authorization')).toBe('Bearer first-valid-token');
		expect(completed).toHaveBeenCalledTimes(1);
	});

	it('cancels a waiting request before token acquisition', () => {
		tokenService.accessToken = null;
		const subscription = request();
		subscription.unsubscribe();
		tokenUpdates.next('new-token');
		expect(requests.length).toBe(0);
	});

	it('propagates an initial authentication failure without logging credentials or another redirect', () => {
		const consoleError = spyOn(console, 'error');
		tokenService.accessToken = null;
		failure = new HttpErrorResponse({ status: 401 });
		request();
		tokenUpdates.next('new-token');
		expect(errors).toHaveBeenCalledWith(failure);
		expect(consoleError).not.toHaveBeenCalled();
		expect(login).not.toHaveBeenCalled();
	});

	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
		it(`does not retry ${method} after a potentially committed write`, fakeAsync(() => {
			failure = new HttpErrorResponse({ status: 503 });
			request(undefined, method);
			tick(10000);
			expect(requests.length).toBe(1);
			expect(errors).toHaveBeenCalledWith(failure);
		}));
	}

	for (const method of ['GET', 'HEAD']) {
		it(`retries transient ${method} failures at most three times`, fakeAsync(() => {
			failure = new HttpErrorResponse({ status: 503 });
			request(undefined, method);
			expect(requests.length).toBe(1);
			tick(1000);
			expect(requests.length).toBe(2);
			tick(2000);
			expect(requests.length).toBe(3);
			tick(3000);
			expect(requests.length).toBe(4);
			expect(errors).toHaveBeenCalledWith(failure);
		}));
	}

	it('stops retrying after a successful read', fakeAsync(() => {
		failure = new HttpErrorResponse({ status: 0 });
		request();
		failure = undefined;
		tick(1000);
		tick(10000);
		expect(requests.length).toBe(2);
		expect(errors).not.toHaveBeenCalled();
	}));

	for (const status of [400, 403, 404, 409, 422]) {
		it(`does not retry non-transient HTTP ${status} errors`, fakeAsync(() => {
			failure = new HttpErrorResponse({ status });
			request();
			tick(10000);
			expect(requests.length).toBe(1);
			expect(login).not.toHaveBeenCalled();
		}));
	}

	it('does not retry non-HTTP programming errors', fakeAsync(() => {
		failure = new Error('Response processing failed');
		request();
		tick(10000);
		expect(requests.length).toBe(1);
		expect(errors).toHaveBeenCalledWith(failure);
	}));
});
