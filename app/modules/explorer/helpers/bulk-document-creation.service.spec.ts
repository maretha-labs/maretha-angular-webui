import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { ViewNavigation } from '@maretha/webui-sdk';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { BulkDocumentCreation } from './bulk-document-creation.service';
import { CreationParentService } from './creation-parent.service';
import { DocumentAttachmentsService, FileUploadError } from './document-attachments.service';
import { DocumentsManagerService } from './documents-manager.service';
import { DocumentCreationError } from './document-creation-error';
import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
const parent = {
	uid: 'parent',
	path: '/parent',
	facets: ['Folderish'],
	contextParameters: {
		permissions: ['AddChildren'],
		subtypes: [{ type: 'File' }, { type: 'Note' }],
	},
};
const file = (name: string, content = name) => new File([content], name, { type: 'text/plain' });
describe('Per-file creation recovery', () => {
	let batch: BulkDocumentCreation;
	let manager: jasmine.SpyObj<DocumentsManagerService>;
	let uploads: jasmine.SpyObj<DocumentAttachmentsService>;
	let parents: jasmine.SpyObj<CreationParentService>;
	beforeEach(() => {
		manager = jasmine.createSpyObj('manager', ['createDocument', 'getDocumentInfo', 'importFiles']);
		uploads = jasmine.createSpyObj('uploads', ['uploadFiles', 'removeBatchJob']);
		parents = jasmine.createSpyObj('parents', ['readId']);
		parents.readId.and.returnValue(of(parent));
		uploads.uploadFiles.and.callFake((files) =>
			of({
				batchId: 'batch-' + uploads.uploadFiles.calls.count(),
				uploadedFiles: { [files[0].name]: 0 },
			}),
		);
		manager.createDocument.and.callFake((_path, _type, properties) =>
			of({ uid: properties['dc:title'], properties }),
		);
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				BulkDocumentCreation,
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: CreationParentService, useValue: parents },
				{ provide: DocumentAttachmentsService, useValue: uploads },
			],
		});
		batch = TestBed.inject(BulkDocumentCreation);
	});
	it('keeps structured failures reactive while retaining English API text and literal server errors', async () => {
		TestBed.inject(WebUiMessages).register('import-message-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.locale.set('es');
		const english =
			'The files could not be uploaded. Check your connection and permissions, then retry.';
		uploads.uploadFiles.and.returnValue(
			throwError(
				() =>
					new FileUploadError(
						english,
						new Error('offline'),
						'app.services.attachments.upload-failed',
					),
			),
		);
		batch.configure(parent, [file('Customer {count}.txt')], () => 'File');
		await batch.run();
		const item = batch.items()[0];
		expect(item.message).toBe(english);
		expect(batch.messageFor(item)).toBe(
			'No se pudieron cargar los archivos. Comprueba tu conexión y tus permisos e inténtalo de nuevo.',
		);
		locale.locale.set('ar');
		expect(batch.messageFor(item)).toBe(
			'تعذّر رفع الملفات. تحقّق من اتصالك وصلاحياتك ثم أعد المحاولة.',
		);
		const customer = 'Customer error {count} <b>literal</b>';
		uploads.uploadFiles.and.returnValue(throwError(() => new Error(customer)));
		await batch.run();
		expect(batch.messageFor(batch.items()[0])).toBe(customer);
		expect(batch.items()[0].messageDescriptor).toBeUndefined();
	});
	it('isolates same-name files and captures destination and custom metadata once', async () => {
		const first = file('same.txt', 'one'),
			second = file('same.txt', 'two');
		const properties = { 'dc:description': 'Original', 'client:field': ['value'] };
		const destination = { ...parent };
		batch.configure(destination, [first, second], () => 'File', properties);
		properties['dc:description'] = 'Changed';
		properties['client:field'].push('changed');
		destination.path = '/elsewhere';
		await batch.run();
		expect(uploads.uploadFiles.calls.allArgs()).toEqual([[[first]], [[second]]]);
		const calls = manager.createDocument.calls.allArgs();
		expect(calls[0][0]).toBe('/parent');
		expect(calls[0][3]).toBe('parent');
		expect(calls[0][2]['dc:description']).toBe('Original');
		expect(calls[0][2]['client:field']).toEqual(['value']);
		expect(calls.map((c) => c[2]['file:content']['upload-batch'])).toEqual(['batch-1', 'batch-2']);
		expect(batch.complete()).toBeTrue();
		await batch.run();
		expect(manager.createDocument).toHaveBeenCalledTimes(2);
	});
	it('creates a Note clob from UTF-8 text without uploading a blob and preserves its selected format', async () => {
		batch.configure(
			parent,
			[file('meeting.md')],
			() => 'Note',
			{ 'note:mime_type': 'text/x-web-markdown' },
			() => ({ kind: 'utf8-text', property: 'note:note' }),
			() => 'Meeting note',
		);
		await batch.run();
		const properties = manager.createDocument.calls.mostRecent().args[2];
		expect(properties['dc:title']).toBe('Meeting note');
		expect(properties['note:mime_type']).toBe('text/x-web-markdown');
		expect(properties['note:note']).toBe('meeting.md');
		expect(properties['file:content']).toBeUndefined();
		expect(uploads.uploadFiles).not.toHaveBeenCalled();
	});
	it('keeps an unreadable Note pending for retry and does not upload it', async () => {
		const note = file('broken.txt');
		spyOn(note, 'arrayBuffer').and.returnValues(
			Promise.reject(new Error('read failed')),
			Promise.resolve(new TextEncoder().encode('recovered').buffer as ArrayBuffer),
		);
		batch.configure(
			parent,
			[note],
			() => 'Note',
			{ 'note:mime_type': 'text/plain' },
			() => ({ kind: 'utf8-text', property: 'note:note' }),
		);
		await batch.run();
		expect(batch.items()[0].state).toBe('failed');
		expect(batch.retryable()).toBeTrue();
		expect(uploads.uploadFiles).not.toHaveBeenCalled();
		expect(manager.createDocument).not.toHaveBeenCalled();
		await batch.run();
		expect(batch.items()[0].state).toBe('created');
		expect(manager.createDocument.calls.mostRecent().args[2]['note:note']).toBe('recovered');
		expect(uploads.uploadFiles).not.toHaveBeenCalled();
	});
	it('leaves a Note pending when stopped while its text body is still being read', async () => {
		let resolveBody!: (body: ArrayBuffer) => void;
		const note = file('deferred.txt');
		spyOn(note, 'arrayBuffer').and.returnValue(
			new Promise<ArrayBuffer>((resolve) => (resolveBody = resolve)),
		);
		batch.configure(
			parent,
			[note],
			() => 'Note',
			{ 'note:mime_type': 'text/plain' },
			() => ({ kind: 'utf8-text', property: 'note:note' }),
		);
		const running = batch.run();
		await Promise.resolve();
		expect(batch.items()[0].state).toBe('reading');
		batch.stop();
		resolveBody(new TextEncoder().encode('body').buffer as ArrayBuffer);
		await running;
		expect(batch.items()[0].state).toBe('pending');
		expect(manager.createDocument).not.toHaveBeenCalled();
		expect(uploads.uploadFiles).not.toHaveBeenCalled();
		expect(batch.retryable()).toBeTrue();
	});
	it('retries only rejected or acknowledged unfinished items and never repeats successful or uncertain writes', async () => {
		manager.createDocument.and.callFake((_path, _type, properties) => {
			switch (properties['dc:title']) {
				case 'rejected':
					return throwError(() => ({ status: 403 }));
				case 'unknown':
					return throwError(() => new DocumentCreationError());
				case 'acknowledged':
					return throwError(() => new DocumentCreationError('known-id'));
				default:
					return of({ uid: 'success' });
			}
		});
		batch.configure(
			parent,
			['success', 'rejected', 'unknown', 'acknowledged'].map((name) => file(name)),
			() => 'File',
		);
		await batch.run();
		expect(batch.items().map((i) => i.state)).toEqual(['created', 'failed', 'unknown', 'failed']);
		expect(batch.createdCount()).toBe(2);
		expect(batch.unknownCount()).toBe(1);
		manager.createDocument.and.returnValue(of({ uid: 'retried-id' }));
		manager.getDocumentInfo.and.returnValue(of({ uid: 'known-id' }));
		await batch.run();
		expect(manager.createDocument).toHaveBeenCalledTimes(5);
		expect(uploads.uploadFiles).toHaveBeenCalledTimes(5);
		expect(manager.getDocumentInfo).toHaveBeenCalledOnceWith('known-id');
		expect(batch.items().map((i) => i.state)).toEqual(['created', 'created', 'unknown', 'created']);
		expect(batch.retryable()).toBeFalse();
		expect(batch.complete()).toBeFalse();
	});
	it('stops after the in-flight file and resumes pending files without concurrent runs', async () => {
		const upload = new Subject<any>();
		uploads.uploadFiles.and.returnValue(upload);
		batch.configure(parent, [file('first'), file('second')], () => 'File');
		const running = batch.run();
		await Promise.resolve();
		expect(batch.working()).toBeTrue();
		expect(batch.canLeave()).toBeFalse();
		batch.stop();
		await batch.run();
		upload.next({ batchId: 'first', uploadedFiles: { first: 0 } });
		upload.complete();
		await running;
		expect(manager.createDocument).toHaveBeenCalledTimes(1);
		expect(batch.items().map((i) => i.state)).toEqual(['created', 'pending']);
		uploads.uploadFiles.and.returnValue(of({ batchId: 'second', uploadedFiles: { second: 0 } }));
		await batch.run();
		expect(batch.complete()).toBeTrue();
		expect(batch.canLeave()).toBeTrue();
	});
	it('checks fresh type permission before uploading and preserves failures for retry', async () => {
		parents.readId.and.returnValue(
			of({ ...parent, contextParameters: { permissions: [], subtypes: [] } }),
		);
		batch.configure(parent, [file('forbidden')], () => 'File');
		await batch.run();
		expect(uploads.uploadFiles).not.toHaveBeenCalled();
		expect(manager.createDocument).not.toHaveBeenCalled();
		expect(batch.items()[0].state).toBe('failed');
		expect(batch.retryable()).toBeTrue();
	});
	it('keeps a repeatedly failed read attached to its known created document', async () => {
		manager.createDocument.and.returnValue(throwError(() => new DocumentCreationError('created')));
		manager.getDocumentInfo.and.returnValue(throwError(() => new Error('offline')));
		batch.configure(parent, [file('one')], () => 'File');
		await batch.run();
		await batch.run();
		expect(manager.createDocument).toHaveBeenCalledTimes(1);
		expect(uploads.uploadFiles).toHaveBeenCalledTimes(1);
		expect(batch.items()[0].documentId).toBe('created');
		expect(batch.items()[0].state).toBe('failed');
	});
	it('marks a write interrupted by dialog destruction as uncertain and starts no further files', async () => {
		const write = new Subject<any>();
		manager.createDocument.and.returnValue(write);
		batch.configure(parent, [file('one'), file('two')], () => 'File');
		const running = batch.run();
		await Promise.resolve();
		await Promise.resolve();
		expect(write.observed).toBeTrue();
		TestBed.resetTestingModule();
		await running;
		expect(write.observed).toBeFalse();
		expect(batch.items()[0].state).toBe('unknown');
		expect(batch.items()[1].state).toBe('pending');
	});
	describe('Add Properties with the batch the dialog uploaded', () => {
		beforeEach(() => uploads.removeBatchJob.and.returnValue(of(null)));
		it('reads the destination once per Create, keeps the shared batch for the other files and removes it at the end', async () => {
			const files = [file('a'), file('b')];
			batch.configure(parent, files, () => 'File');
			batch.adoptUploads({ batchId: 'chosen', indexOf: (f) => files.indexOf(f) });
			await batch.run();
			expect(parents.readId).toHaveBeenCalledTimes(1);
			expect(uploads.uploadFiles).not.toHaveBeenCalled();
			const calls = manager.createDocument.calls.allArgs();
			expect(calls.map((c) => c[2]['file:content'])).toEqual([
				{ 'upload-batch': 'chosen', 'upload-fileId': '0' },
				{ 'upload-batch': 'chosen', 'upload-fileId': '1' },
			]);
			// The fresh destination is handed to the write, which does not read it again.
			expect(calls.map((c) => c[4])).toEqual([
				{ parent, keepBatch: true },
				{ parent, keepBatch: true },
			]);
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('chosen');
		});
		it('keeps the shared batch while a stopped file still needs it', async () => {
			const files = [file('a'), file('b')];
			batch.configure(parent, files, () => 'File');
			batch.adoptUploads({ batchId: 'chosen', indexOf: (f) => files.indexOf(f) });
			manager.createDocument.and.callFake((_path, _type, properties) => {
				batch.stop();
				return of({ uid: properties['dc:title'], properties });
			});
			await batch.run();
			expect(batch.items().map((item) => item.state)).toEqual(['created', 'pending']);
			expect(uploads.removeBatchJob).not.toHaveBeenCalled();
			await batch.run();
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('chosen');
		});
		it('fails every remaining file with one failed destination read', async () => {
			parents.readId.and.returnValue(throwError(() => new Error('offline')));
			batch.configure(parent, [file('a'), file('b')], () => 'File');
			await batch.run();
			expect(parents.readId).toHaveBeenCalledTimes(1);
			expect(batch.items().map((item) => item.state)).toEqual(['failed', 'failed']);
			expect(manager.createDocument).not.toHaveBeenCalled();
		});
	});
	describe('default import through FileManager.Import', () => {
		beforeEach(() => uploads.removeBatchJob.and.returnValue(of(null)));
		it('uploads one batch, takes each type from the server and removes the batch once', async () => {
			const files = [file('note.txt'), file('scan.pdf')];
			manager.importFiles.and.returnValue(
				of([
					{ uid: 'note', type: 'Note' },
					{ uid: 'scan', type: 'File' },
				]),
			);
			batch.configureImport(parent, files);
			expect(batch.items().map((item) => item.type)).toEqual(['', '']);
			await batch.run();
			expect(parents.readId).not.toHaveBeenCalled();
			expect(manager.createDocument).not.toHaveBeenCalled();
			expect(uploads.uploadFiles).toHaveBeenCalledOnceWith(files);
			expect(manager.importFiles).toHaveBeenCalledOnceWith('/parent', 'batch-1');
			expect(batch.items().map((item) => [item.type, item.state, item.documentId])).toEqual([
				['Note', 'created', 'note'],
				['File', 'created', 'scan'],
			]);
			expect(batch.complete()).toBeTrue();
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
		});
		it('keeps a rejected batch for the retry and removes it after the retry succeeds', async () => {
			manager.importFiles.and.returnValues(
				throwError(() => ({ status: 403 })),
				of([{ uid: 'note', type: 'Note' }]),
			);
			batch.configureImport(parent, [file('note.txt')]);
			await batch.run();
			expect(batch.items()[0].state).toBe('failed');
			expect(batch.retryable()).toBeTrue();
			expect(uploads.removeBatchJob).not.toHaveBeenCalled();
			await batch.run();
			expect(uploads.uploadFiles).toHaveBeenCalledTimes(1);
			expect(manager.importFiles.calls.allArgs()).toEqual([
				['/parent', 'batch-1'],
				['/parent', 'batch-1'],
			]);
			expect(batch.items()[0].state).toBe('created');
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
		});
		it('uploads again when the server no longer has the batch', async () => {
			manager.importFiles.and.returnValues(
				throwError(() => ({ status: 404 })),
				of([{ uid: 'note', type: 'Note' }]),
			);
			batch.configureImport(parent, [file('note.txt')]);
			await batch.run();
			await batch.run();
			expect(manager.importFiles.calls.allArgs()).toEqual([
				['/parent', 'batch-1'],
				['/parent', 'batch-2'],
			]);
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-2');
		});
		it('marks an uncertain import unknown, never repeats it and removes its batch', async () => {
			manager.importFiles.and.returnValue(throwError(() => new DocumentCreationError()));
			batch.configureImport(parent, [file('a.txt'), file('b.txt')]);
			await batch.run();
			expect(batch.items().map((item) => item.state)).toEqual(['unknown', 'unknown']);
			expect(batch.retryable()).toBeFalse();
			await batch.run();
			expect(manager.importFiles).toHaveBeenCalledTimes(1);
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
		});
		it('imports the batch the dialog uploaded when the files were chosen, then removes it', async () => {
			const files = [file('note.txt'), file('scan.pdf')];
			manager.importFiles.and.returnValue(
				of([
					{ uid: 'note', type: 'Note' },
					{ uid: 'scan', type: 'File' },
				]),
			);
			batch.configureImport(parent, files);
			batch.adoptUploads({ batchId: 'chosen', indexOf: (f) => files.indexOf(f) });
			await batch.run();
			expect(uploads.uploadFiles).not.toHaveBeenCalled();
			expect(manager.importFiles).toHaveBeenCalledOnceWith('/parent', 'chosen');
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('chosen');
		});
		it('removes a kept batch when the dialog closes', async () => {
			manager.importFiles.and.returnValue(throwError(() => ({ status: 403 })));
			batch.configureImport(parent, [file('note.txt')]);
			await batch.run();
			TestBed.resetTestingModule();
			expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
		});
	});
});
describe('Import configuration guards and departure protection', () => {
	let batch: BulkDocumentCreation;
	let manager: jasmine.SpyObj<DocumentsManagerService>;
	let uploads: jasmine.SpyObj<DocumentAttachmentsService>;
	let parents: jasmine.SpyObj<CreationParentService>;
	let routerEvents: Subject<unknown>;
	let navigation: { register: jasmine.Spy };
	let unregister: jasmine.Spy;
	beforeEach(() => {
		manager = jasmine.createSpyObj('manager', ['createDocument', 'getDocumentInfo', 'importFiles']);
		uploads = jasmine.createSpyObj('uploads', ['uploadFiles', 'removeBatchJob']);
		parents = jasmine.createSpyObj('parents', ['readId']);
		parents.readId.and.returnValue(of(parent));
		uploads.removeBatchJob.and.returnValue(of(null));
		manager.createDocument.and.callFake((_path, _type, properties) =>
			of({ uid: properties['dc:title'], properties }),
		);
		routerEvents = new Subject<unknown>();
		unregister = jasmine.createSpy('unregister');
		navigation = { register: jasmine.createSpy('register').and.returnValue(unregister) };
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				BulkDocumentCreation,
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: CreationParentService, useValue: parents },
				{ provide: DocumentAttachmentsService, useValue: uploads },
				{ provide: Router, useValue: { events: routerEvents.asObservable() } },
				{ provide: ViewNavigation, useValue: navigation },
			],
		});
		batch = TestBed.inject(BulkDocumentCreation);
	});
	it('rejects an invalid destination or selection and ignores reconfiguration once started', () => {
		expect(() =>
			batch.configure({ uid: '', path: '/x' }, [file('a')], () => 'File'),
		).toThrowMatching((error) => error.key === 'app.services.import.invalid-input');
		expect(() => batch.configure(parent, ['not a file' as any], () => 'File')).toThrowMatching(
			(error) => error.key === 'app.services.import.invalid-input',
		);
		expect(batch.started()).toBeFalse();
		expect(batch.destinationId).toBeUndefined();
		const files = [file('a')];
		batch.configure(parent, files, () => 'File');
		expect(batch.destinationId).toBe('parent');
		batch.configureImport({ uid: 'other', path: '/other' }, [file('b')]);
		batch.configure({ uid: 'other', path: '/other' }, [file('b')], () => 'Note');
		expect(batch.items().map((item) => item.file)).toEqual(files);
		expect(batch.destinationId).toBe('parent');
		expect(batch.documents).toEqual([]);
	});
	it('adopts an uploaded batch once and never while nothing was uploaded', async () => {
		const files = [file('a'), file('b')];
		batch.configure(parent, files, () => 'File');
		batch.adoptUploads(undefined);
		expect(batch.items().every((item) => item.upload === undefined)).toBeTrue();
		batch.adoptUploads({ batchId: 'first', indexOf: (f) => (f === files[0] ? 0 : undefined) });
		batch.adoptUploads({ batchId: 'second', indexOf: (f) => files.indexOf(f) });
		expect(batch.items().map((item) => item.upload)).toEqual([
			{ batchId: 'first', fileId: '0' },
			undefined,
		]);
		uploads.uploadFiles.and.returnValue(of({ batchId: 'single', uploadedFiles: { b: 0 } }));
		await batch.run();
		expect(uploads.uploadFiles).toHaveBeenCalledOnceWith([files[1]]);
		expect(batch.complete()).toBeTrue();
		expect(batch.documents.map((document) => document.uid)).toEqual(['a', 'b']);
	});
	it('fails a file whose upload returns no reference and keeps it retryable', async () => {
		uploads.uploadFiles.and.returnValue(of({ batchId: 'batch', uploadedFiles: {} }));
		batch.configure(parent, [file('a')], () => 'File');
		await batch.run();
		expect(batch.items()[0].state).toBe('failed');
		expect(batch.items()[0].messageDescriptor?.key).toBe(
			'app.services.import.missing-upload-reference',
		);
		expect(manager.createDocument).not.toHaveBeenCalled();
		expect(batch.retryable()).toBeTrue();
	});
	it('refuses a Note larger than the text import limit before reading it', async () => {
		const large = new File(
			[new Uint8Array(BulkDocumentCreation.MAX_TEXT_IMPORT_BYTES + 1)],
			'big.txt',
		);
		batch.configure(
			parent,
			[large],
			() => 'Note',
			{},
			() => ({ kind: 'utf8-text', property: 'note:note' }),
		);
		await batch.run();
		expect(batch.items()[0].state).toBe('failed');
		expect(batch.items()[0].messageDescriptor?.key).toBe('app.services.import.too-large');
		expect(batch.messageFor(batch.items()[0])).toContain('5 MB');
		expect(manager.createDocument).not.toHaveBeenCalled();
	});
	it('fails a default import whose upload returns no batch, keeps files pending when stopped, and marks unidentified results unknown', async () => {
		uploads.uploadFiles.and.returnValue(of({ batchId: '', uploadedFiles: {} }));
		batch.configureImport(parent, [file('a'), file('b')]);
		await batch.run();
		expect(batch.items().map((item) => item.state)).toEqual(['failed', 'failed']);
		expect(batch.items()[0].messageDescriptor?.key).toBe(
			'app.services.import.missing-upload-reference',
		);
		uploads.uploadFiles.and.callFake(() => {
			batch.stop();
			return of({ batchId: 'stopped', uploadedFiles: {} });
		});
		await batch.run();
		expect(batch.items().map((item) => item.state)).toEqual(['pending', 'pending']);
		expect(manager.importFiles).not.toHaveBeenCalled();
		manager.importFiles.and.returnValue(of([{ uid: 'a', type: 'File' }, { error: 'skipped' }]));
		await batch.run();
		expect(uploads.uploadFiles).toHaveBeenCalledTimes(2);
		expect(manager.importFiles).toHaveBeenCalledOnceWith('/parent', 'stopped');
		expect(batch.items().map((item) => item.state)).toEqual(['created', 'unknown']);
		expect(batch.items()[1].messageDescriptor instanceof DocumentCreationError).toBeTrue();
		expect(batch.retryable()).toBeFalse();
		expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('stopped');
	});
	it('asks before leaving an unfinished import and releases its guards with the dialog', async () => {
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		const close = jasmine.createSpy('close');
		let draft = false;
		const listeners = spyOn(window, 'addEventListener').and.callThrough();
		const removals = spyOn(window, 'removeEventListener').and.callThrough();
		batch.watchDeparture(() => draft, close);
		const unloadCall = listeners.calls.allArgs().find((args) => args[0] === 'beforeunload')!;
		const handler = unloadCall[1] as (event: BeforeUnloadEvent) => void;
		expect(navigation.register).toHaveBeenCalledTimes(1);
		const guard = navigation.register.calls.mostRecent().args[0] as () => Promise<boolean>;
		expect(batch.canLeave()).toBeTrue();
		await expectAsync(guard()).toBeResolvedTo(true);
		// Karma treats a dispatched beforeunload as a page reload, so the handler is called directly.
		const unload = () => {
			const event = {
				defaultPrevented: false,
				returnValue: 'unset',
			} as unknown as BeforeUnloadEvent;
			(event as any).preventDefault = () => ((event as any).defaultPrevented = true);
			handler(event);
			return event.defaultPrevented && event.returnValue === '';
		};
		expect(unload()).toBeFalse();
		draft = true;
		expect(unload()).toBeTrue();
		await expectAsync(guard()).toBeResolvedTo(false);
		expect(confirm).toHaveBeenCalledTimes(1);
		draft = false;
		uploads.uploadFiles.and.returnValue(throwError(() => new Error('offline')));
		batch.configure(parent, [file('a')], () => 'File');
		await batch.run();
		expect(batch.started() && !batch.complete()).toBeTrue();
		expect(unload()).toBeTrue();
		expect(batch.canLeave()).toBeFalse();
		confirm.and.returnValue(true);
		expect(batch.canLeave()).toBeTrue();
		routerEvents.next(new NavigationStart(1, '/elsewhere'));
		expect(close).not.toHaveBeenCalled();
		routerEvents.next(new NavigationEnd(1, '/elsewhere', '/elsewhere'));
		expect(close).toHaveBeenCalledTimes(1);
		TestBed.resetTestingModule();
		expect(unregister).toHaveBeenCalledTimes(1);
		expect(
			removals.calls.allArgs().some((args) => args[0] === 'beforeunload' && args[1] === handler),
		).toBeTrue();
		routerEvents.next(new NavigationEnd(2, '/again', '/again'));
		expect(close).toHaveBeenCalledTimes(1);
	});
});
