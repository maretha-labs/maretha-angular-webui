import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { environment } from 'environments/environment';
import type { Observable } from 'rxjs';
import { BlobDeliveryService } from './blob-delivery.service';

describe('Blob delivery grants', () => {
	const target = {
		repository: 'default',
		documentId: 'one',
		xpath: 'file:content',
		expectedDigest: 'digest',
	};
	const base = 'https://app.example/nuxeo/maretha-ui-fixture-delivery/v1';
	let service: BlobDeliveryService;
	let http: HttpTestingController;
	let dom: {
		baseURI: string;
		location: { href: string };
		defaultView?: { navigator: { locks: { request: jasmine.Spy } } };
	};
	const oldNuxeo = environment.nuxeoUrl;
	const oldApplication = environment.applicationId;
	const grant = (id = 'opaque-id') => ({
		id,
		url: `/nuxeo/maretha-ui-fixture-delivery/v1/content/${id}`,
		expiresAt: Date.now() + 300_000,
	});

	beforeEach(() => {
		environment.nuxeoUrl = 'https://app.example/nuxeo';
		environment.applicationId = 'fixture';
		dom = {
			baseURI: 'https://app.example/nuxeo/ui/',
			location: { href: 'https://app.example/nuxeo/ui/' },
		};
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DOCUMENT, useValue: dom },
			],
		});
		service = TestBed.inject(BlobDeliveryService);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => {
		http.verify();
		environment.nuxeoUrl = oldNuxeo;
		environment.applicationId = oldApplication;
	});

	it('mints only the typed target and returns a normalized URL with credentials enabled', fakeAsync(() => {
		const next = jasmine.createSpy('next');
		service.createGrant(target, 'inline').subscribe(next);
		flushMicrotasks();
		const req = http.expectOne(base + '/grants');
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({ version: 1, target, disposition: 'inline' });
		expect(req.request.withCredentials).toBeTrue();
		expect(req.request.responseType).toBe('json');
		req.flush(grant());
		flushMicrotasks();
		expect(next).toHaveBeenCalledOnceWith({ ...grant(), url: base + '/content/opaque-id' });
	}));
	it('serializes concurrent first mints so the second request sees the established cookie', fakeAsync(() => {
		service.createGrant(target, 'inline').subscribe();
		service.createGrant(target, 'attachment').subscribe();
		flushMicrotasks();
		const first = http.expectOne(base + '/grants');
		http.expectNone(base + '/grants');
		first.flush(grant('first'));
		flushMicrotasks();
		const second = http.expectOne(base + '/grants');
		expect(second.request.body.disposition).toBe('attachment');
		second.flush(grant('second'));
		flushMicrotasks();
	}));
	it('coordinates cookie bootstrap through Web Locks when available', fakeAsync(() => {
		const lock = jasmine.createSpy('request').and.callFake((_name, callback) => callback());
		dom.defaultView = { navigator: { locks: { request: lock } } };
		service.createGrant(target, 'inline').subscribe();
		flushMicrotasks();
		expect(lock).toHaveBeenCalledWith('maretha-delivery:fixture', jasmine.any(Function));
		http.expectOne(base + '/grants').flush(grant());
		flushMicrotasks();
	}));
	it('skips a cancelled queued mint and cancels an active request', fakeAsync(() => {
		const first = service.createGrant(target, 'inline').subscribe();
		const second = service.createGrant(target, 'inline').subscribe();
		second.unsubscribe();
		flushMicrotasks();
		const req = http.expectOne(base + '/grants');
		first.unsubscribe();
		expect(req.cancelled).toBeTrue();
		flushMicrotasks();
		http.expectNone(base + '/grants');
	}));
	it('rejects insecure and cross-origin deployments without fetching a blob fallback', fakeAsync(() => {
		const error = jasmine.createSpy('error');
		environment.nuxeoUrl = 'http://app.example/nuxeo';
		service.createGrant(target, 'inline').subscribe({ error });
		flushMicrotasks();
		environment.nuxeoUrl = 'https://other.example/nuxeo';
		service.createGrant(target, 'inline').subscribe({ error });
		flushMicrotasks();
		expect(error).toHaveBeenCalledTimes(2);
		http.expectNone(() => true);
	}));
	for (const altered of [
		{ url: 'https://other.example/content/opaque-id' },
		{ url: base + '/content/opaque-id?access_token=secret' },
		{ url: base + '/content/other' },
		{ url: base + '/content/opaque-id#fragment' },
		{ id: '../escape' },
		{ expiresAt: '2026-10-01' },
		{ expiresAt: 0 },
	])
		it(
			'rejects malformed grant ' + JSON.stringify(altered),
			fakeAsync(() => {
				const error = jasmine.createSpy('error');
				service.createGrant(target, 'inline').subscribe({ error });
				flushMicrotasks();
				http.expectOne(base + '/grants').flush({ ...grant(), ...altered });
				flushMicrotasks();
				expect(error).toHaveBeenCalled();
			}),
		);
	it('renews the same URL and ID using a fresh authenticated POST', () => {
		const current = { ...grant(), url: base + '/content/opaque-id' };
		const next = jasmine.createSpy('next');
		service.renewGrant(current).subscribe(next);
		const req = http.expectOne(base + '/grants/opaque-id/renew');
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual({ version: 1 });
		expect(req.request.withCredentials).toBeTrue();
		req.flush({ ...grant(), expiresAt: current.expiresAt + 1000 });
		expect(next).toHaveBeenCalledWith({ ...current, expiresAt: current.expiresAt + 1000 });
	});
	it('rejects a renewal that replaces the media grant identity', () => {
		const error = jasmine.createSpy('error');
		service.renewGrant({ ...grant(), url: base + '/content/opaque-id' }).subscribe({ error });
		http.expectOne(base + '/grants/opaque-id/renew').flush(grant('other'));
		expect(error).toHaveBeenCalled();
	});
	it('cancels an overdue renewal before its grant expiry', fakeAsync(() => {
		const error = jasmine.createSpy('error');
		service
			.renewGrant({ ...grant(), url: base + '/content/opaque-id', expiresAt: Date.now() + 1000 })
			.subscribe({ error });
		const req = http.expectOne(base + '/grants/opaque-id/renew');
		tick(1000);
		expect(req.cancelled).toBeTrue();
		expect(error).toHaveBeenCalled();
	}));
	it('revokes this browser session even when it was established by another tab, cancelling pending work', fakeAsync(() => {
		const ended = jasmine.createSpy('ended');
		service.sessionEnded$.subscribe(ended);
		service.createGrant(target, 'inline').subscribe();
		flushMicrotasks();
		const req = http.expectOne(base + '/grants');
		service.revokeSession().subscribe();
		expect(req.cancelled).toBeTrue();
		expect(ended).toHaveBeenCalled();
		const deletion = http.expectOne(base + '/session');
		expect(deletion.request.method).toBe('DELETE');
		deletion.flush(null);
		flushMicrotasks();
		service.revokeSession().subscribe();
		http.expectOne(base + '/session').flush(null);
	}));
	it('revokes one expired lease with its unchanged ID', () => {
		service.revokeGrant({ ...grant(), url: base + '/content/opaque-id', expiresAt: 1 }).subscribe();
		const req = http.expectOne(base + '/grants/opaque-id');
		expect(req.request.method).toBe('DELETE');
		expect(req.request.withCredentials).toBeTrue();
		req.flush(null);
	});
	it('cancels queued mints on logout and rejects later subscriptions until a new app session', fakeAsync(() => {
		const later = service.createGrant(target, 'attachment');
		service.createGrant(target, 'inline').subscribe();
		service.createGrant(target, 'inline').subscribe();
		flushMicrotasks();
		const pending = http.expectOne(base + '/grants');
		service.revokeSession().subscribe();
		http.expectOne(base + '/session').flush(null);
		expect(pending.cancelled).toBeTrue();
		flushMicrotasks();
		const error = jasmine.createSpy('error');
		later.subscribe({ error });
		service.createGrant(target, 'attachment').subscribe({ error });
		service.renewGrant({ ...grant(), url: base + '/content/opaque-id' }).subscribe({ error });
		flushMicrotasks();
		expect(error).toHaveBeenCalledTimes(3);
		http.expectNone(() => true);
	}));
	const zipJob = (id = 'job') => ({
		id,
		state: 'queued',
		completed: 0,
		total: 0,
		bytesProcessed: 0,
		totalBytes: 0,
		expiresAt: Date.now() + 1_800_000,
		error: null,
	});
	const zipRequest = {
		repository: 'archive',
		documentIds: ['folder', 'file'],
		filename: 'selection.zip',
	};
	it('normalizes unsafe and long document titles into bounded ZIP request basenames', fakeAsync(() => {
		for (const [title, expected] of [
			['  ./Annual/Report\\2026:\u0000Draft.ZIP  ', 'Annual-Report-2026-Draft.zip'],
			['A'.repeat(200) + '.zip', 'A'.repeat(176) + '.zip'],
			['A'.repeat(175) + '.extra.zip', 'A'.repeat(175) + '.zip'],
			['...\u0000.zip', 'selection.zip'],
		]) {
			service.createBulkJob({ ...zipRequest, filename: title }).subscribe();
			flushMicrotasks();
			const request = http.expectOne(base + '/bulk-jobs');
			expect(request.request.body.filename).toBe(expected);
			request.flush(zipJob());
			flushMicrotasks();
		}
	}));
	it('serializes bulk creation, file minting and ready archive grants under the same browser cookie', fakeAsync(() => {
		service.createBulkJob(zipRequest).subscribe();
		service.createGrant(target, 'inline').subscribe();
		service.createBulkGrant('job').subscribe();
		flushMicrotasks();
		const create = http.expectOne(base + '/bulk-jobs');
		expect(create.request.body).toEqual({ version: 1, ...zipRequest });
		expect(create.request.withCredentials).toBeTrue();
		expect(create.request.responseType).toBe('json');
		http.expectNone(base + '/grants');
		create.flush(zipJob());
		flushMicrotasks();
		http.expectOne(base + '/grants').flush(grant());
		flushMicrotasks();
		const ready = http.expectOne(base + '/bulk-jobs/job/grant');
		expect(ready.request.body).toEqual({ version: 1 });
		ready.flush(grant('archive'));
		flushMicrotasks();
	}));
	it('reads JSON status only and sends explicit cancel/regenerate to the same opaque job', fakeAsync(() => {
		service.getBulkJob('job').subscribe();
		const status = http.expectOne(base + '/bulk-jobs/job');
		expect(status.request.method).toBe('GET');
		expect(status.request.responseType).toBe('json');
		expect(status.request.withCredentials).toBeTrue();
		status.flush(zipJob());
		service.cancelBulkJob('job').subscribe();
		const cancel = http.expectOne(base + '/bulk-jobs/job');
		expect(cancel.request.method).toBe('DELETE');
		cancel.flush(null);
		service.regenerateBulkJob('job').subscribe();
		flushMicrotasks();
		const regenerate = http.expectOne(base + '/bulk-jobs/job/regenerate');
		expect(regenerate.request.body).toEqual({ version: 1 });
		regenerate.flush(zipJob('new'));
		flushMicrotasks();
	}));
	it('rejects malformed or mismatched bulk status without requesting a content URL', () => {
		const error = jasmine.createSpy('error');
		service.getBulkJob('job').subscribe({ error });
		http.expectOne(base + '/bulk-jobs/job').flush(zipJob('wrong'));
		expect(error).toHaveBeenCalled();
		service.getBulkJob('job').subscribe({ error });
		http.expectOne(base + '/bulk-jobs/job').flush({ ...zipJob(), completed: -1 });
		expect(error).toHaveBeenCalledTimes(2);
		service.getBulkJob('../outside').subscribe({ error });
		expect(error).toHaveBeenCalledTimes(3);
		http.expectNone(() => true);
	});
	it('skips cancelled bulk creation while queued but retains an in-flight response for cleanup', fakeAsync(() => {
		service.createGrant(target, 'inline').subscribe();
		const queued = new AbortController();
		const error = jasmine.createSpy('error');
		service.createBulkJob(zipRequest, queued.signal).subscribe({ error });
		flushMicrotasks();
		const file = http.expectOne(base + '/grants');
		queued.abort();
		expect(error.calls.first().args[0].name).toBe('AbortError');
		file.flush(grant());
		flushMicrotasks();
		http.expectNone(base + '/bulk-jobs');
		const active = new AbortController();
		const next = jasmine.createSpy('next');
		service.createBulkJob(zipRequest, active.signal).subscribe(next);
		flushMicrotasks();
		const creating = http.expectOne(base + '/bulk-jobs');
		active.abort();
		expect(creating.cancelled).toBeFalse();
		creating.flush(zipJob());
		flushMicrotasks();
		expect(next).toHaveBeenCalled();
	}));
	it('rejects bulk status and grant requests after local session revocation without issuing HTTP', () => {
		service.revokeSession().subscribe();
		http.expectOne(base + '/session').flush(null);
		const requests: Observable<unknown>[] = [
			service.getBulkJob('job'),
			service.createBulkGrant('job'),
		];
		for (const request of requests) {
			const rejected = jasmine.createSpy();
			request.subscribe({ error: rejected });
			expect(rejected).toHaveBeenCalledWith(
				jasmine.objectContaining({
					key: 'app.errors.the-streaming-session-has-ended-sign-in--b8ce91',
				}),
			);
		}
		http.expectNone(() => true);
	});
});
