import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
	HTTP_INTERCEPTORS,
	provideHttpClient,
	withInterceptorsFromDi,
	withXhr,
} from '@angular/common/http';
import { HttpInterceptorService } from 'app/helpers/http-interceptor.service';
import { ToastService } from 'app/helpers/toast.service';
import { environment } from 'environments/environment';
import { DocumentsManagerService } from './documents-manager.service';
import { BlobDeliveryGrant, BlobDeliveryService } from 'app/helpers/blob-delivery.service';
import { of, Subject, throwError } from 'rxjs';
import {
	DocumentAttachmentsService,
	FileUploadError,
	UploadedBatch,
} from './document-attachments.service';

describe('DocumentAttachmentsService upload integrity', () => {
	let service: DocumentAttachmentsService;
	let http: HttpTestingController;
	let toast: ToastService;
	const url = environment.nuxeoUrl + '/api/v1/upload';
	const file = (name = 'file.txt', body = 'body') => new File([body], name, { type: 'text/plain' });
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders(), { provide: DocumentsManagerService, useValue: {} }],
		});
		service = TestBed.inject(DocumentAttachmentsService);
		http = TestBed.inject(HttpTestingController);
		toast = TestBed.inject(ToastService);
		spyOn(toast, 'info').and.returnValue({ toastId: 7 } as any);
		spyOn(toast, 'remove');
		spyOn(toast, 'success');
		spyOn(toast, 'error');
	});
	afterEach(() => http.verify());
	it('lets an editor own successful upload announcements without creating any toast', fakeAsync(() => {
		const selected = file('Customer {file}.txt');
		let result: UploadedBatch | undefined;
		service
			.uploadFiles([selected], undefined, 5 * 1024 * 1024, { notifications: false })
			.subscribe((value) => (result = value));
		http.expectOne(url).flush({ batchId: 'inline-success' });
		flushMicrotasks();
		http.expectOne(url + '/inline-success/0').flush({});
		expect(result?.entries?.[0].file).toBe(selected);
		expect(toast.info).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(toast.remove).not.toHaveBeenCalled();
	}));
	it('preserves failure and cancellation behavior when the calling editor owns notifications', () => {
		let failure: FileUploadError | undefined;
		service
			.uploadFiles([file()], undefined, 5 * 1024 * 1024, { notifications: false })
			.subscribe({ error: (error) => (failure = error) });
		http.expectOne(url).error(new ProgressEvent('error'));
		expect(failure instanceof FileUploadError).toBeTrue();
		expect(failure?.key).toBe('app.services.attachments.upload-start-failed');
		const subscription = service
			.uploadFiles([file()], undefined, 5 * 1024 * 1024, { notifications: false })
			.subscribe();
		const request = http.expectOne(url);
		subscription.unsubscribe();
		expect(request.cancelled).toBeTrue();
		expect(toast.info).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.error).not.toHaveBeenCalled();
		expect(toast.remove).not.toHaveBeenCalled();
	});
	it('reformats the active upload toast and releases its locale subscription on cancellation', async () => {
		TestBed.inject(WebUiMessages).register('upload-locale-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		const component = { message: '', title: '' };
		(toast.info as jasmine.Spy).and.returnValue({
			toastId: 8,
			update(message: string, title?: string) {
				component.message = message;
				if (title !== undefined) component.title = title;
			},
		});
		locale.locale.set('es');
		const subscription = service.uploadFiles([file()]).subscribe();
		const request = http.expectOne(url);
		TestBed.tick();
		expect(component.message).toBe('Cargando archivos…');
		locale.locale.set('ar');
		TestBed.tick();
		expect(component.message).not.toBe('Cargando archivos…');
		const lastMessage = component.message;
		subscription.unsubscribe();
		expect(request.cancelled).toBeTrue();
		locale.locale.set('es');
		TestBed.tick();
		expect(component.message).toBe(lastMessage);
		expect(toast.remove).toHaveBeenCalledWith(8);
	});

	it('is lazy and reports initialization failure without completing silently', () => {
		const upload = service.uploadFiles([file()]);
		expect(toast.info).not.toHaveBeenCalled();
		let error: FileUploadError | undefined;
		upload.subscribe({ error: (value) => (error = value) });
		http.expectOne(url).error(new ProgressEvent('error'));
		expect(error instanceof FileUploadError).toBeTrue();
		expect(error?.message).toContain('could not be started');
		expect(error?.originalError).toBeDefined();
		expect(toast.info).toHaveBeenCalledTimes(1);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(toast.remove).toHaveBeenCalledWith(7);
		expect(toast.success).not.toHaveBeenCalled();
	});
	it('preserves the upload failure even if batch cleanup also fails', fakeAsync(() => {
		let error: FileUploadError | undefined;
		service.uploadFiles([file()]).subscribe({ error: (value) => (error = value) });
		http.expectOne(url).flush({ batchId: 'failed' });
		flushMicrotasks();
		http.expectOne(url + '/failed/0').flush({}, { status: 413, statusText: 'Too large' });
		expect(error).toBeUndefined();
		http.expectOne(url + '/failed').flush({}, { status: 500, statusText: 'Cleanup failed' });
		expect(error?.message).toContain('could not be uploaded');
		expect((error?.originalError as any).status).toBe(413);
		expect(error?.cleanupFailed).toBeTrue();
		expect(toast.success).not.toHaveBeenCalled();
		expect(toast.remove).toHaveBeenCalledWith(7);
	}));
	it('bounds cleanup waiting and preserves the original error on timeout', fakeAsync(() => {
		let error: FileUploadError | undefined;
		service.uploadFiles([file()]).subscribe({ error: (value) => (error = value) });
		http.expectOne(url).flush({ batchId: 'stalled' });
		flushMicrotasks();
		http.expectOne(url + '/stalled/0').error(new ProgressEvent('error'));
		const cleanup = http.expectOne(url + '/stalled');
		tick(10_000);
		expect(cleanup.cancelled).toBeTrue();
		expect(error?.cleanupFailed).toBeTrue();
		expect(error?.message).toContain('could not be uploaded');
	}));
	it('limits combined small-file and chunk requests to four and returns ordered identity receipts', fakeAsync(() => {
		const files = [
			file('same.txt', '123456789'),
			file('same.txt', 'abcdefghi'),
			file('last.txt', 'x'),
		];
		let result: UploadedBatch | undefined;
		const progress = jasmine.createSpy('progress');
		service.uploadFiles(files, progress, 2).subscribe((value) => (result = value));
		http.expectOne(url).flush({ batchId: 'chunks' });
		flushMicrotasks();
		const active = http.match((request) => request.url.startsWith(url + '/chunks/'));
		expect(active.length).toBe(4);
		expect(progress).toHaveBeenCalledTimes(4);
		const seen: string[] = [];
		while (active.length) {
			const current = active.shift()!;
			seen.push(current.request.url + ':' + current.request.headers.get('X-Upload-Chunk-Index'));
			current.flush({});
			flushMicrotasks();
			active.push(...http.match((request) => request.url.startsWith(url + '/chunks/')));
			expect(active.length).toBeLessThanOrEqual(4);
		}
		expect(seen.length).toBe(11);
		expect(new Set(seen).size).toBe(11);
		expect(result?.entries?.map((entry) => entry.file)).toEqual(files);
		expect(result?.entries?.map((entry) => entry.fileIdx)).toEqual([0, 1, 2]);
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(toast.remove).toHaveBeenCalledWith(7);
		http.expectNone(url + '/chunks');
	}));
	it('cancels sibling chunks on failure and never emits a successful receipt', () => {
		let error: unknown;
		const next = jasmine.createSpy('uploaded');
		service
			.uploadFiles([file('large', '123456789012')], undefined, 2)
			.subscribe({ next, error: (value) => (error = value) });
		http.expectOne(url).flush({ batchId: 'cancel-siblings' });
		const chunks = http.match((request) => request.url.startsWith(url + '/cancel-siblings/'));
		expect(chunks.length).toBe(4);
		chunks[0].error(new ProgressEvent('error'));
		expect(chunks.slice(1).every((request) => request.cancelled)).toBeTrue();
		http.expectOne(url + '/cancel-siblings').flush(null);
		expect(error instanceof FileUploadError).toBeTrue();
		expect(next).not.toHaveBeenCalled();
	});
	it('releases its persistent toast and cleans a known batch on cancellation', () => {
		const sub = service.uploadFiles([file('large', '1234567890')], undefined, 2).subscribe();
		http.expectOne(url).flush({ batchId: 'abandoned' });
		const chunks = http.match((request) => request.url.startsWith(url + '/abandoned/'));
		sub.unsubscribe();
		expect(chunks.every((request) => request.cancelled)).toBeTrue();
		const cleanup = http.expectOne(url + '/abandoned');
		expect(cleanup.request.method).toBe('DELETE');
		cleanup.flush(null);
		expect(toast.remove).toHaveBeenCalledWith(7);
		expect(toast.success).not.toHaveBeenCalled();
	});
	it('rejects invalid chunk sizes and malformed initialization without leaking a toast', () => {
		let error: unknown;
		service.uploadFiles([file()], undefined, 0).subscribe({ error: (value) => (error = value) });
		expect(error instanceof Error).toBeTrue();
		http.expectNone(url);
		service.uploadFiles([file()]).subscribe({ error: (value) => (error = value) });
		http.expectOne(url).flush({});
		expect(error instanceof FileUploadError).toBeTrue();
		expect(toast.remove).toHaveBeenCalledWith(7);
	});
	it('does not start a batch for an empty selection', () => {
		let result: UploadedBatch | undefined;
		service.uploadFiles([]).subscribe((value) => (result = value));
		expect(result?.entries).toEqual([]);
		expect(toast.info).not.toHaveBeenCalled();
		http.expectNone(url);
	});
});

describe('DocumentAttachmentsService authenticated downloads', () => {
	let service: DocumentAttachmentsService;
	let http: HttpTestingController;
	const url = environment.nuxeoUrl + '/nxfile/default/uid/file:content/file.pdf';

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				provideHttpClient(withXhr(), withInterceptorsFromDi()),
				provideHttpClientTesting(),
				{ provide: HTTP_INTERCEPTORS, useClass: HttpInterceptorService, multi: true },
				{ provide: DocumentsManagerService, useValue: {} },
			],
		});
		service = TestBed.inject(DocumentAttachmentsService);
		http = TestBed.inject(HttpTestingController);
		spyOn(TestBed.inject(ToastService), 'info');
		spyOn(TestBed.inject(ToastService), 'error');
	});
	afterEach(() => http.verify({ ignoreCancelled: true }));

	it('uses bearer authentication and releases the downloaded object URL', fakeAsync(() => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		spyOn(URL, 'createObjectURL').and.returnValue('blob:download');
		const revoke = spyOn(URL, 'revokeObjectURL');

		service.downloadAttachment(url, 'file.pdf').subscribe();
		const request = http.expectOne(url);
		expect(request.request.headers.get('Authorization')).toBe('Bearer fixture-token');
		expect(request.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
		request.flush(new Blob(['pdf']));

		const anchor = click.calls.mostRecent().object as HTMLAnchorElement;
		expect(anchor.href).toBe('blob:download');
		expect(anchor.download).toBe('file.pdf');
		expect(revoke).not.toHaveBeenCalled();
		tick(60_000);
		expect(revoke).toHaveBeenCalledOnceWith('blob:download');
	}));

	it('cancels the authenticated fetch before allocating a blob URL', () => {
		const create = spyOn(URL, 'createObjectURL');
		const subscription = service.downloadAttachment(url, 'file.pdf').subscribe();
		const request = http.expectOne(url);

		subscription.unsubscribe();

		expect(request.cancelled).toBeTrue();
		expect(create).not.toHaveBeenCalled();
	});

	it('reports a denied download without opening an unauthenticated browser URL', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		service.downloadAttachment(url, 'file.pdf').subscribe();

		http.expectOne(url).flush(null, { status: 403, statusText: 'Forbidden' });

		expect(TestBed.inject(ToastService).error).toHaveBeenCalled();
		expect(click).not.toHaveBeenCalled();
	});
});

describe('DocumentAttachmentsService native blob delivery', () => {
	let service: DocumentAttachmentsService;
	let delivery: jasmine.SpyObj<BlobDeliveryService>;
	let toast: ToastService;
	const blob = { name: 'report.pdf', digest: 'abc123', 'mime-type': 'application/pdf' };
	const model = { uid: 'document-id', repository: 'default', properties: { 'file:content': blob } };
	const grant: BlobDeliveryGrant = {
		id: 'grant-id',
		url: 'https://example.test/nuxeo/maretha-ui-app-delivery/v1/content/grant-id',
		expiresAt: Date.now() + 300_000,
	};

	beforeEach(() => {
		delivery = jasmine.createSpyObj<BlobDeliveryService>('delivery', [
			'createGrant',
			'revokeGrant',
		]);
		delivery.createGrant.and.returnValue(of(grant));
		delivery.revokeGrant.and.returnValue(of(undefined));
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentsManagerService, useValue: {} },
				{ provide: BlobDeliveryService, useValue: delivery },
			],
		});
		service = TestBed.inject(DocumentAttachmentsService);
		toast = TestBed.inject(ToastService);
		spyOn(toast, 'info');
		spyOn(toast, 'error');
	});

	it('starts a native attachment download without allocating a Blob and retains its grant', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		const objectUrl = spyOn(URL, 'createObjectURL');
		const download = service.downloadDocumentBlob(model, blob);
		expect(delivery.createGrant).not.toHaveBeenCalled();
		download.subscribe();
		expect(delivery.createGrant).toHaveBeenCalledWith(
			{
				repository: 'default',
				documentId: 'document-id',
				xpath: 'file:content',
				expectedDigest: 'abc123',
			},
			'attachment',
		);
		expect(objectUrl).not.toHaveBeenCalled();
		const link = click.calls.mostRecent().object as HTMLAnchorElement;
		expect(link.href).toBe(grant.url);
		expect(link.download).toBe('report.pdf');
		expect(document.body.contains(link)).toBeFalse();
		expect(delivery.revokeGrant).not.toHaveBeenCalled();
		TestBed.inject(HttpTestingController).expectNone(grant.url);
	});

	it('does not open a URL after a canceled pending grant', () => {
		const pending = new Subject<BlobDeliveryGrant>();
		delivery.createGrant.and.returnValue(pending);
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		const subscription = service.downloadDocumentBlob(model, blob).subscribe();
		subscription.unsubscribe();
		pending.next(grant);
		expect(pending.observed).toBeFalse();
		expect(click).not.toHaveBeenCalled();
	});

	it('reports a denied grant without falling back to buffered or unauthenticated downloads', () => {
		delivery.createGrant.and.returnValue(throwError(() => new Error('Forbidden')));
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		service.downloadDocumentBlob(model, blob).subscribe();
		expect(click).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalled();
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});

	it('rejects an unpersisted blob before requesting a grant', () => {
		service.downloadDocumentBlob(model, { name: 'draft.pdf' }).subscribe();
		expect(delivery.createGrant).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalled();
	});

	it('revokes a grant if the browser download cannot be initiated', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click').and.throwError('Blocked');
		service.downloadDocumentBlob(model, blob).subscribe();
		expect(delivery.revokeGrant).toHaveBeenCalledWith(grant);
		expect(toast.error).toHaveBeenCalled();
		expect(
			document.body.contains(click.calls.mostRecent().object as HTMLAnchorElement),
		).toBeFalse();
	});
	it('keeps repeated native file downloads free of application byte requests and detached links', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		const objectUrl = spyOn(URL, 'createObjectURL');
		const before = document.body.querySelectorAll('a').length;
		for (let cycle = 0; cycle < 32; cycle++) service.downloadDocumentBlob(model, blob).subscribe();
		expect(click).toHaveBeenCalledTimes(32);
		expect(document.body.querySelectorAll('a').length).toBe(before);
		for (const call of click.calls.all()) {
			const link = call.object as HTMLAnchorElement;
			expect(link.href).toBe(grant.url);
			expect(link.isConnected).toBeFalse();
		}
		expect(objectUrl).not.toHaveBeenCalled();
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
});

describe('DocumentAttachmentsService exports, batches and attachment operations', () => {
	let service: DocumentAttachmentsService;
	let http: HttpTestingController;
	let toast: ToastService;
	let manager: { reloadDocument: jasmine.Spy };
	const api = environment.nuxeoUrl + '/api/v1';
	const automation = environment.nuxeoUrl + '/site/automation';

	beforeEach(() => {
		manager = {
			reloadDocument: jasmine.createSpy('reloadDocument').and.returnValue(of('reloaded')),
		};
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentsManagerService, useValue: manager },
			],
		});
		service = TestBed.inject(DocumentAttachmentsService);
		http = TestBed.inject(HttpTestingController);
		toast = TestBed.inject(ToastService);
		spyOn(toast, 'info').and.returnValue({ toastId: 11 } as any);
		spyOn(toast, 'remove');
		spyOn(toast, 'success');
		spyOn(toast, 'error');
	});
	afterEach(() => http.verify());

	it('exports every document that has an export URL for the format and names each download after its title', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		const objectUrls = spyOn(URL, 'createObjectURL').and.callFake(
			(blob: Blob) => 'blob:' + blob.size,
		);
		const documents = [
			{ uid: 'one', title: 'First', ng: { exportUrlForXml: '/export/one.xml' } },
			{ uid: 'two', ng: { exportUrlForXml: '/export/two.xml' } },
			{ uid: 'three', title: 'No export', ng: {} },
			{ uid: 'four', title: 'No ng' },
		];
		let results: any;
		service.exportAsXml(documents).subscribe((value) => (results = value));
		http.expectOne('/export/one.xml').flush(new Blob(['1']));
		http.expectOne('/export/two.xml').flush(new Blob(['22']));
		http.expectNone(() => true);
		expect(Object.keys(results)).toEqual(['one', 'two']);
		expect(objectUrls).toHaveBeenCalledTimes(2);
		expect(click).toHaveBeenCalledTimes(2);
		const anchor = click.calls.mostRecent().object as HTMLAnchorElement;
		expect(anchor.download).toBe('two');
		expect(toast.info).toHaveBeenCalledTimes(1);
		expect((toast.info as jasmine.Spy).calls.mostRecent().args[0]).toContain('XML');
		expect(toast.error).not.toHaveBeenCalled();
	});

	it('routes PDF and ZIP exports to their own URLs and reports a failed export once without downloading', () => {
		const click = spyOn(HTMLAnchorElement.prototype, 'click');
		const document = {
			uid: 'doc',
			title: 'Doc',
			ng: { exportUrlForPdf: '/export/doc.pdf', exportUrlForZip: '/export/doc.zip' },
		};
		let pdfResult: any = 'unset';
		service.exportAsPdf([document]).subscribe((value) => (pdfResult = value));
		http.expectOne('/export/doc.pdf').flush(null, { status: 500, statusText: 'Server error' });
		expect(pdfResult).toBeNull();
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(click).not.toHaveBeenCalled();
		spyOn(URL, 'createObjectURL').and.returnValue('blob:zip');
		service.exportAsZip([document]).subscribe();
		http.expectOne('/export/doc.zip').flush(new Blob(['zip']));
		expect(click).toHaveBeenCalledTimes(1);
		expect((toast.info as jasmine.Spy).calls.mostRecent().args[0]).toContain('ZIP');
	});

	it('clears the main attachment or the attachment list through Blob.RemoveFromDocument', () => {
		service.clearAttachments('doc-1', true).subscribe();
		const main = http.expectOne(automation + '/Blob.RemoveFromDocument');
		expect(main.request.method).toBe('POST');
		expect(main.request.body).toEqual({
			context: {},
			params: { save: true, xpath: 'content' },
			input: 'doc-1',
		});
		main.flush({});
		service.clearAttachments('doc-1', false).subscribe();
		const files = http.expectOne(automation + '/Blob.RemoveFromDocument');
		expect(files.request.body.params.xpath).toBe('files');
		files.flush({});
	});

	it('creates an empty upload batch and rejects a response without a batch id', () => {
		let batchId: string | undefined;
		service.createUploadBatch().subscribe((value) => (batchId = value));
		const request = http.expectOne(api + '/upload');
		expect(request.request.method).toBe('POST');
		expect(request.request.headers.get('X-NXRepository')).toBe('default');
		request.flush({ batchId: 'fresh' });
		expect(batchId).toBe('fresh');
		let error: Error | undefined;
		service.createUploadBatch().subscribe({ error: (value) => (error = value) });
		http.expectOne(api + '/upload').flush({ batchId: '' });
		expect(error?.message).toContain('did not return an upload batch');
	});

	it('uploads a small file into an existing batch in one request carrying its name, size and type', fakeAsync(() => {
		const file = new File(['hello'], 'greeting.txt', { type: 'text/plain' });
		const emitted: unknown[] = [];
		let completed = false;
		service.uploadToBatch('batch-a', file, 3).subscribe({
			next: (value) => emitted.push(value),
			complete: () => (completed = true),
		});
		flushMicrotasks();
		const request = http.expectOne(api + '/upload/batch-a/3');
		expect(request.request.method).toBe('POST');
		expect(request.request.headers.get('X-File-Name')).toBe('greeting.txt');
		expect(request.request.headers.get('X-File-Size')).toBe('5');
		expect(request.request.headers.get('X-File-Type')).toBe('text/plain');
		expect(request.request.headers.get('X-Upload-Type')).toBeNull();
		expect(request.request.body).toBe(file);
		request.flush({});
		expect(emitted).toEqual([undefined]);
		expect(completed).toBeTrue();
	}));

	it('uploads a large file into an existing batch as indexed chunks, at most four at a time', () => {
		const file = new File(['1234567890'], 'large.bin', { type: '' });
		let completed = false;
		service.uploadToBatch('batch-b', file, 0, 2).subscribe({ complete: () => (completed = true) });
		const inFlight = http.match((request) => request.url === api + '/upload/batch-b/0');
		expect(inFlight.length).toBe(4);
		const indexes: string[] = [];
		for (const request of inFlight) {
			expect(request.request.headers.get('X-Upload-Type')).toBe('chunked');
			expect(request.request.headers.get('X-Upload-Chunk-Count')).toBe('5');
			expect(request.request.headers.get('X-File-Type')).toBe('application/octet-stream');
			indexes.push(request.request.headers.get('X-Upload-Chunk-Index')!);
			request.flush({});
		}
		const last = http.expectOne(api + '/upload/batch-b/0');
		indexes.push(last.request.headers.get('X-Upload-Chunk-Index')!);
		expect(last.request.body.size).toBe(2);
		last.flush({});
		expect(indexes.sort()).toEqual(['0', '1', '2', '3', '4']);
		expect(completed).toBeTrue();
	});

	it('sniffs the type of a file the browser did not type before uploading it', async () => {
		const file = new File(['%PDF-1.4 content'], 'untyped', { type: '' });
		service.uploadToBatch('batch-c', file, 0).subscribe();
		await new Promise((resolve) => setTimeout(resolve, 100));
		const request = http.expectOne(api + '/upload/batch-c/0');
		expect(request.request.headers.get('X-File-Type')).toBe('application/octet-stream');
		request.flush({});
	});

	it('removes one batch file, removes a batch, and skips the request for an unknown batch', () => {
		service.removeBatchFile('batch d', 2).subscribe();
		const file = http.expectOne(api + '/upload/batch%20d/2');
		expect(file.request.method).toBe('DELETE');
		file.flush(null);
		service.removeBatchJob('batch d').subscribe();
		const batch = http.expectOne(api + '/upload/batch%20d');
		expect(batch.request.method).toBe('DELETE');
		batch.flush(null);
		let result: unknown = 'unset';
		service.removeBatchJob(undefined).subscribe((value) => (result = value));
		expect(result).toBeNull();
		http.expectNone(api + '/upload/undefined');
	});

	it('attaches an uploaded batch to a document through Blob.AttachOnDocument with the chosen xpath', () => {
		service.attachUploadedFilesToDocument('doc-2', undefined, 'batch-e').subscribe();
		const main = http.expectOne(automation + '/batch/execute');
		expect(main.request.headers.get('properties')).toBe('*');
		expect(main.request.body).toEqual({
			context: {},
			params: {
				document: 'doc-2',
				operationId: 'Blob.AttachOnDocument',
				batchId: 'batch-e',
				xpath: 'file:content',
				save: true,
			},
		});
		main.flush({});
		service.attachUploadedFilesToDocument('doc-2', 'files:files', 'batch-f').subscribe();
		const files = http.expectOne(automation + '/batch/execute');
		expect(files.request.body.params.xpath).toBe('files:files');
		files.flush({});
	});

	it('uploads a single file as a multipart automation request and reloads the document on success', () => {
		const file = new File(['body'], 'single.txt', { type: 'text/plain' });
		let result: unknown;
		(service as any)
			.uploadSingleFile(file, 'doc-3')
			.subscribe((value: unknown) => (result = value));
		const request = http.expectOne(automation + '/Blob.AttachOnDocument');
		expect(request.request.method).toBe('POST');
		expect(request.request.headers.get('X-NXVoidOperation')).toBe('false');
		expect(request.request.body instanceof FormData).toBeTrue();
		expect((request.request.body as FormData).get('single.txt')).toBe(file);
		const operation = (request.request.body as FormData).get('request') as Blob;
		expect(operation.type).toBe('application/json+nxrequest');
		request.flush('ok');
		expect(toast.remove).toHaveBeenCalledWith(11);
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('doc-3');
		expect(result).toBe('reloaded');
	});

	it('explains a failed single-file upload by size and does not reload the document', () => {
		const small = new File(['body'], 'small.txt', { type: 'text/plain' });
		let completed = false;
		(service as any)
			.uploadSingleFile(small, 'doc-4', 'files:files', 10)
			.subscribe({ complete: () => (completed = true) });
		http
			.expectOne(automation + '/Blob.AttachOnDocument')
			.flush('denied', { status: 403, statusText: 'Forbidden' });
		expect(completed).toBeTrue();
		expect((toast.error as jasmine.Spy).calls.mostRecent().args[0]).toContain(
			'could not be uploaded.',
		);
		const large = new File(['twelve bytes'], 'large.txt', { type: 'text/plain' });
		(service as any).uploadSingleFile(large, 'doc-4', 'files:files', 10).subscribe();
		http.expectOne(automation + '/Blob.AttachOnDocument').error(new ProgressEvent('timeout'));
		expect((toast.error as jasmine.Spy).calls.mostRecent().args[0]).toContain('too large');
		expect(toast.remove).toHaveBeenCalledTimes(2);
		expect(toast.success).not.toHaveBeenCalled();
		expect(manager.reloadDocument).not.toHaveBeenCalled();
	});
});

describe('DocumentAttachmentsService grant revocation failures', () => {
	it('still reports the download error when revoking the grant fails too', () => {
		const delivery = jasmine.createSpyObj<BlobDeliveryService>('delivery', [
			'createGrant',
			'revokeGrant',
		]);
		const grant: BlobDeliveryGrant = {
			id: 'grant',
			url: 'https://example.test/nuxeo/maretha-ui-app-delivery/v1/content/grant',
			expiresAt: Date.now() + 300_000,
		};
		delivery.createGrant.and.returnValue(of(grant));
		delivery.revokeGrant.and.returnValue(throwError(() => new Error('revoke failed')));
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: DocumentsManagerService, useValue: {} },
				{ provide: BlobDeliveryService, useValue: delivery },
			],
		});
		const service = TestBed.inject(DocumentAttachmentsService);
		const toast = TestBed.inject(ToastService);
		spyOn(toast, 'error');
		spyOn(HTMLAnchorElement.prototype, 'click').and.throwError('Blocked');
		const blob = { name: 'report.pdf', digest: 'abc123', 'mime-type': 'application/pdf' };
		const model = {
			uid: 'document-id',
			repository: 'default',
			properties: { 'file:content': blob },
		};
		let completed = false;
		service.downloadDocumentBlob(model, blob).subscribe({ complete: () => (completed = true) });
		expect(delivery.revokeGrant).toHaveBeenCalledWith(grant);
		expect(toast.error).toHaveBeenCalledTimes(1);
		expect(completed).toBeTrue();
	});
});
