import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { BlobDeliveryService, BulkZipJob } from 'app/helpers/blob-delivery.service';
import { HttpTestingController } from '@angular/common/http/testing';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { pageTypeSchemas, SelectionDownloadService } from './selection-download.service';
import { environment } from 'environments/environment';
describe('Selection download transport', () => {
	beforeEach(() => TestBed.configureTestingModule({ providers: [...legacyTestProviders()] }));
	it('exports the complete pinned provider scope and follows only a local result URL', async () => {
		const http = TestBed.inject(HttpTestingController);
		const scope = {
			repository: 'other',
			providerName: 'default_trash_search',
			queryParams: [],
			namedParameters: {
				ecm_path: '["/workspace"]',
				ecm_fulltext: 'approved',
				common_size_agg: '["to_100_KB"]',
			},
		};
		const done = TestBed.inject(SelectionDownloadService).exportCsv(
			scope,
			new AbortController().signal,
		);
		const request = http.expectOne((req) => req.url.endsWith('/Bulk.RunAction/@async'));
		expect(request.request.body.params).toEqual({
			action: 'csvExport',
			providerName: scope.providerName,
			repositoryName: 'other',
			queryParams: [],
			namedParameters: scope.namedParameters,
			parameters: JSON.stringify({ schemas: ['dublincore'] }),
		});
		expect(request.request.headers.get('X-NXRepository')).toBe('other');
		request.flush(null, {
			status: 202,
			statusText: 'Accepted',
			headers: { Location: environment.nuxeoUrl + '/api/v1/csv/status' },
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		const resultJson = JSON.stringify({ url: environment.nuxeoUrl + '/api/v1/csv/result' });
		const resultBlob = new Blob([resultJson], { type: 'application/json+nxentity' });
		spyOn(resultBlob, 'text').and.resolveTo(resultJson);
		http.expectOne((req) => req.url.endsWith('/csv/status')).flush(resultBlob);
		await new Promise((resolve) => setTimeout(resolve, 0));
		const csv = new Blob(['title\nSynthetic']);
		const resultRequest = http.expectOne((req) => req.url.endsWith('/csv/result'));
		expect(resultRequest.request.responseType).toBe('arraybuffer');
		resultRequest.flush(await csv.arrayBuffer());
		const result = await done;
		expect(result.type).toBe('text/csv');
		expect(await result.text()).toBe('title\nSynthetic');
		http.verify();
	});
	it('exports scoped search filters, sort and schemas using provider-level quick filters', async () => {
		const http = TestBed.inject(HttpTestingController);
		const scope = {
			repository: 'default',
			providerName: 'default_search',
			queryParams: [],
			namedParameters: { quickFilters: 'noFolder', ecm_fulltext: 'sample' },
		};
		const done = TestBed.inject(SelectionDownloadService).exportCsv(
			scope,
			new AbortController().signal,
			{ schemas: ['dublincore', 'common', 'file', 'uid'], sortBy: 'dc:title', sortOrder: 'asc' },
			['common', 'files', 'invoice'],
		);
		const request = http.expectOne((req) => req.url.endsWith('/Bulk.RunAction/@async'));
		expect(request.request.body.params).toEqual({
			action: 'csvExport',
			providerName: 'default_search',
			repositoryName: 'default',
			queryParams: [],
			namedParameters: { ecm_fulltext: 'sample' },
			quickFilters: 'noFolder',
			sortBy: 'dc:title',
			sortOrder: 'asc',
			parameters: JSON.stringify({
				schemas: ['dublincore', 'common', 'file', 'uid', 'files', 'invoice'],
			}),
		});
		expect(scope.namedParameters.quickFilters).toBe('noFolder');
		const csv = new Blob(['title\nAudio sample'], { type: 'text/csv' });
		request.flush(csv);
		expect(await done).toBe(csv);
		http.verify();
	});
	it('rejects external CSV result URLs without forwarding credentials or fetching them', async () => {
		const http = TestBed.inject(HttpTestingController);
		const done = TestBed.inject(SelectionDownloadService).exportCsv(
			{
				repository: 'default',
				providerName: 'nxql_search',
				queryParams: ['SELECT * FROM File'],
				namedParameters: {},
			},
			new AbortController().signal,
		);
		http
			.expectOne((req) => req.method === 'POST')
			.flush(
				new Blob([JSON.stringify({ url: 'https://external.example/export' })], {
					type: 'application/json',
				}),
			);
		await expectAsync(done).toBeRejectedWithError('Invalid download status URL.');
		http.expectNone((req) => req.url.startsWith('https://external'));
		http.verify();
	});
	const job = (state: BulkZipJob['state'] = 'queued'): BulkZipJob => ({
		id: 'job',
		state,
		completed: 0,
		total: 2,
		bytesProcessed: 0,
		totalBytes: 10,
		expiresAt: Date.now() + 1_800_000,
		error: null,
	});
	const grant = {
		id: 'grant',
		url: 'https://app.example/content/grant',
		expiresAt: Date.now() + 300_000,
	};
	function bulk() {
		const delivery = {
			createBulkJob: jasmine.createSpy().and.returnValue(of(job())),
			getBulkJob: jasmine.createSpy().and.returnValue(of(job('ready'))),
			createBulkGrant: jasmine.createSpy().and.returnValue(of(grant)),
			cancelBulkJob: jasmine.createSpy().and.returnValue(of(undefined)),
			regenerateBulkJob: jasmine
				.createSpy()
				.and.returnValue(of({ ...job('ready'), id: 'regenerated' })),
			sessionEnded$: new Subject<void>(),
		};
		TestBed.overrideProvider(BlobDeliveryService, { useValue: delivery });
		return { delivery, service: TestBed.inject(SelectionDownloadService) };
	}
	it('pins selected IDs/repository and waits for preparation beyond ten seconds without loading ZIP bytes', fakeAsync(() => {
		const { delivery, service } = bulk();
		const ids = ['folder', 'two'];
		const progress = jasmine.createSpy('progress');
		const resolved = jasmine.createSpy('resolved');
		delivery.getBulkJob.and.returnValue(of(job('preparing')));
		service
			.download(ids, 'archive', new AbortController().signal, progress, 'archive.zip')
			.then(resolved);
		ids.push('later');
		flushMicrotasks();
		tick(12_000);
		expect(resolved).not.toHaveBeenCalled();
		expect(delivery.getBulkJob).toHaveBeenCalledTimes(12);
		expect(delivery.createBulkJob.calls.first().args[0]).toEqual({
			repository: 'archive',
			documentIds: ['folder', 'two'],
			filename: 'archive.zip',
		});
		delivery.getBulkJob.and.returnValue(of(job('ready')));
		tick(1000);
		expect(resolved).toHaveBeenCalledWith(grant);
		expect(delivery.createBulkGrant).toHaveBeenCalledOnceWith('job');
		TestBed.inject(HttpTestingController).expectNone(() => true);
	}));
	it('stops after a status failure and retries the existing job without submitting it again', fakeAsync(() => {
		const { delivery, service } = bulk();
		const failed = jasmine.createSpy('failed');
		delivery.getBulkJob.and.returnValue(throwError(() => new Error('Status unavailable')));
		service.download(['one'], 'default', new AbortController().signal).catch(failed);
		flushMicrotasks();
		tick(1000);
		tick(10_000);
		expect(failed).toHaveBeenCalled();
		expect(delivery.getBulkJob).toHaveBeenCalledTimes(1);
		delivery.getBulkJob.and.returnValue(of(job('ready')));
		const done = jasmine.createSpy('done');
		service.retryDownload(job(), new AbortController().signal, () => undefined).then(done);
		flushMicrotasks();
		expect(delivery.createBulkJob).toHaveBeenCalledTimes(1);
		expect(done).toHaveBeenCalledWith(grant);
	}));
	it('cancels an accepted preparation and stops status polling', fakeAsync(() => {
		const { delivery, service } = bulk();
		const controller = new AbortController();
		const failed = jasmine.createSpy('failed');
		service.download(['one'], 'default', controller.signal).catch(failed);
		flushMicrotasks();
		controller.abort();
		flushMicrotasks();
		tick(5000);
		expect(delivery.cancelBulkJob).toHaveBeenCalledOnceWith('job');
		expect(delivery.getBulkJob).not.toHaveBeenCalled();
		expect(delivery.createBulkGrant).not.toHaveBeenCalled();
		expect(failed.calls.first().args[0].name).toBe('AbortError');
	}));
	it('waits for a pending creation response solely to cancel its accepted job', fakeAsync(() => {
		const { delivery, service } = bulk();
		const accepted = new Subject<BulkZipJob>();
		delivery.createBulkJob.and.returnValue(accepted);
		const controller = new AbortController();
		const failed = jasmine.createSpy('failed');
		service.download(['one'], 'default', controller.signal).catch(failed);
		controller.abort();
		expect(accepted.observed).toBeTrue();
		accepted.next(job());
		accepted.complete();
		flushMicrotasks();
		expect(delivery.cancelBulkJob).toHaveBeenCalledOnceWith('job');
		expect(delivery.createBulkGrant).not.toHaveBeenCalled();
		expect(failed.calls.first().args[0].name).toBe('AbortError');
	}));
	it('reports unconfirmed server cancellation instead of claiming success', fakeAsync(() => {
		const { delivery, service } = bulk();
		delivery.cancelBulkJob.and.returnValue(throwError(() => new Error('offline')));
		const controller = new AbortController();
		const failed = jasmine.createSpy('failed');
		service.download(['one'], 'default', controller.signal).catch(failed);
		flushMicrotasks();
		controller.abort();
		flushMicrotasks();
		expect(failed.calls.first().args[0].message).toContain('could not be confirmed');
	}));
	it('uses explicit server-pinned regeneration and never retries a consumed result automatically', fakeAsync(() => {
		const { delivery, service } = bulk();
		delivery.createBulkJob.and.returnValue(of(job('consumed')));
		const failed = jasmine.createSpy('failed');
		service.download(['one'], 'default', new AbortController().signal).catch(failed);
		flushMicrotasks();
		expect(failed).toHaveBeenCalled();
		expect(delivery.createBulkGrant).not.toHaveBeenCalled();
		expect(delivery.regenerateBulkJob).not.toHaveBeenCalled();
		const done = jasmine.createSpy('done');
		service.regenerateDownload('job', new AbortController().signal, () => undefined).then(done);
		flushMicrotasks();
		expect(delivery.regenerateBulkJob.calls.first().args[0]).toBe('job');
		expect(delivery.createBulkGrant).toHaveBeenCalledOnceWith('regenerated');
		expect(done).toHaveBeenCalledWith(grant);
	}));
	it('releases in-flight bulk status subscriptions and abort listeners across repeated cancellations', fakeAsync(() => {
		const { delivery, service } = bulk();
		const objectUrl = spyOn(URL, 'createObjectURL');
		for (let cycle = 0; cycle < 25; cycle++) {
			const status = new Subject<BulkZipJob>();
			delivery.getBulkJob.and.returnValue(status);
			const controller = new AbortController();
			const add = spyOn(controller.signal, 'addEventListener').and.callThrough();
			const remove = spyOn(controller.signal, 'removeEventListener').and.callThrough();
			const rejected = jasmine.createSpy('rejected');
			service.download(['one'], 'default', controller.signal).catch(rejected);
			flushMicrotasks();
			tick(1000);
			expect(status.observed).toBeTrue();
			controller.abort();
			flushMicrotasks();
			expect(status.observed).toBeFalse();
			expect(delivery.sessionEnded$.observed).toBeFalse();
			expect(rejected).toHaveBeenCalled();
			expect(remove.calls.count()).toBe(add.calls.count());
			status.complete();
			flushMicrotasks();
		}
		tick(10_000);
		expect(delivery.getBulkJob).toHaveBeenCalledTimes(25);
		expect(delivery.cancelBulkJob).toHaveBeenCalledTimes(25);
		expect(delivery.createBulkGrant).not.toHaveBeenCalled();
		expect(objectUrl).not.toHaveBeenCalled();
		TestBed.inject(HttpTestingController).expectNone(() => true);
	}));
	it('rejects invalid archive selections and pre-cancelled attempts without starting work', async () => {
		const { service, delivery } = bulk();
		for (const ids of [[], ['bad,id'], Array.from({ length: 1001 }, (_, i) => String(i))])
			await expectAsync(
				service.download(ids, 'default', new AbortController().signal),
			).toBeRejectedWithError(/valid documents/);
		const cancelled = new AbortController();
		cancelled.abort();
		await expectAsync(service.download(['one'], 'default', cancelled.signal)).toBeRejectedWithError(
			/cancelled/,
		);
		await expectAsync(
			service.regenerateDownload('job', cancelled.signal, () => undefined),
		).toBeRejectedWithError(/cancelled/);
		expect(delivery.createBulkJob).not.toHaveBeenCalled();
		service.cancelDownload('job').subscribe();
		expect(delivery.cancelBulkJob).toHaveBeenCalledOnceWith('job');
	});
	it('rejects incomplete export responses using typed app errors instead of downloading invalid bytes', async () => {
		const service = TestBed.inject(SelectionDownloadService);
		const http = TestBed.inject(HttpTestingController);
		const scope = {
			repository: 'default',
			providerName: 'default_search',
			queryParams: [],
			namedParameters: {},
		};
		await expectAsync(
			service.exportCsv({ ...scope, providerName: '' }, new AbortController().signal),
		).toBeRejectedWithError(/complete query scope/);
		for (const [body, status, expected] of [
			[null, 202, /status URL/],
			[null, 200, /No downloadable content/],
			[new Blob(['<html>login</html>'], { type: 'text/html' }), 200, /unsupported export format/],
		] as const) {
			const done = service.exportCsv(scope, new AbortController().signal);
			const assertion = expectAsync(done).toBeRejectedWithError(expected);
			http
				.expectOne((r) => r.url.endsWith('/Bulk.RunAction/@async'))
				.flush(body, { status, statusText: 'fixture' });
			await assertion;
		}
		for (const [json, expected] of [
			[{ 'entity-type': 'bulkStatus', value: { state: 'ABORTED' } }, /stopped/],
			[{ 'entity-type': 'bulkStatus', value: {} }, /Missing export status/],
			['RUNNING', /Missing download status/],
			[{ state: 'UNKNOWN' }, /could not prepare/],
		] as const) {
			const done = service.exportCsv(scope, new AbortController().signal);
			const assertion = expectAsync(done).toBeRejectedWithError(expected);
			const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
			spyOn(blob, 'text').and.resolveTo(JSON.stringify(json));
			http.expectOne((r) => r.url.endsWith('/Bulk.RunAction/@async')).flush(blob);
			await assertion;
		}
		http.verify();
	});

	it('lists the schemas of the document types on the page once, ignoring unknown types', () => {
		expect(
			pageTypeSchemas(
				[{ type: 'File' }, { type: 'Note' }, { type: 'File' }, { type: 'constructor' }, {}],
				{ File: { schemas: ['file', 'common'] }, Note: { schemas: ['note', 'common', 3] } },
			),
		).toEqual(['file', 'common', 'note']);
		expect(pageTypeSchemas(undefined, undefined)).toEqual([]);
	});
});
