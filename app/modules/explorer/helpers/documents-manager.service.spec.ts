import { Router } from '@angular/router';
import { DocumentTrashService } from './document-trash.service';
import { DocumentClipboardService } from './document-clipboard.service';
import { DocumentHistoryService } from './document-history.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { ToastService } from 'app/helpers/toast.service';

import { DocumentsManagerService } from './documents-manager.service';
import { DocumentCollectionsService } from './document-collections.service';
import { DocumentCreationError } from './document-creation-error';
import { of } from 'rxjs';

describe('DocumentsManagerService', () => {
	let service: DocumentsManagerService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentsManagerService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('refreshes open-document membership state after a drawer changes its favorites or collections', () => {
		spyOnProperty(TestBed.inject(Router), 'url', 'get').and.returnValue('/browse/documents/open');
		service.documentInfo = { uid: 'open', repository: 'default', ng: {}, contextParameters: {} };
		const reload = spyOn(service, 'reloadDocument').and.returnValue(of({}));
		const collections = TestBed.inject(DocumentCollectionsService) as any;
		collections.documentsRemovedFromCollection$.next({
			documentUids: ['open'],
			collectionUid: 'favorites',
		});
		TestBed.tick();
		expect(reload).toHaveBeenCalledWith('open', 'default');
		reload.calls.reset();
		collections.documentsAddedToCollection$.next({
			documentUids: ['open'],
			collectionUid: 'other',
			repository: 'archive',
		});
		TestBed.tick();
		expect(reload).not.toHaveBeenCalled();
	});
	it('invalidates the active document and navigates to its readable breadcrumb ancestor after trash', () => {
		const router = TestBed.inject(Router);
		const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
		const clipboard = spyOn(TestBed.inject(DocumentClipboardService), 'removeFromClipboard');
		const invalidate = spyOn(TestBed.inject(DocumentHistoryService), 'invalidatePaths');
		service.documentInfo = {
			uid: 'trashed-fixture',
			parentRef: 'unreadable-parent',
			repository: 'archive',
			ng: {},
			contextParameters: {
				breadcrumb: {
					entries: [
						{ uid: 'readable-ancestor', path: '/default-domain/workspaces' },
						{ uid: 'trashed-fixture', path: '/default-domain/workspaces/trashed-fixture' },
					],
				},
			},
		};
		TestBed.inject(DocumentTrashService).documentsMovedToTrash$.next(['trashed-fixture']);
		expect(service.documentInfo.isTrashed).toBeTrue();
		expect(navigate).toHaveBeenCalledWith('/browse/default-domain/workspaces?repository=archive');
		expect(clipboard).toHaveBeenCalledWith(['trashed-fixture'], false);
		expect(invalidate).toHaveBeenCalled();

		navigate.calls.reset();
		service.documentInfo = {
			uid: 'purged-fixture',
			path: '/default-domain/workspaces/purged-fixture',
			repository: 'default',
			ng: {},
			contextParameters: {},
		};
		TestBed.inject(DocumentTrashService).documentsPurged$.next(['purged-fixture']);
		expect(navigate).toHaveBeenCalledWith('/browse/default-domain/workspaces');
	});
	it('refreshes the viewed document when a save returns it, so the view needs no reload', () => {
		const http = TestBed.inject(HttpTestingController);
		service.documentInfo = {
			uid: 'note-1',
			repository: 'default',
			properties: { 'dc:description': '' },
		};
		service.updateDocument('note-1', { 'dc:description': 'updated' }).subscribe();
		http.expectOne((req) => req.method === 'PUT' && req.url.endsWith('/id/note-1')).flush({});
		const saved = { uid: 'note-1', properties: { 'dc:description': 'updated' } };
		http.expectOne((req) => req.method === 'GET' && req.url.endsWith('/id/note-1')).flush(saved);
		expect(service.documentInfo.properties['dc:description']).toBe('updated');
		expect(service.documentFetched()).toEqual(jasmine.objectContaining(saved));
	});

	it('syncs documents that a custom layout saved through the layout gateway', () => {
		const http = TestBed.inject(HttpTestingController);
		const created: unknown[] = [];
		service.documentCreated$.subscribe((event) => created.push(event));
		const saved = { uid: 'contract-1', type: 'Contract', parentRef: 'folder-1', properties: {} };
		service.syncSavedDocument('contract-1', true).subscribe();
		http.expectOne((req) => req.url.endsWith('/id/contract-1')).flush(saved);
		expect(created).toEqual([{ repository: 'default', document: jasmine.objectContaining(saved) }]);
		service.syncSavedDocument('contract-1', false).subscribe();
		http.expectOne((req) => req.url.endsWith('/id/contract-1')).flush(saved);
		expect(created.length).toBe(1);
	});
	it("imports a batch through stock's FileManager.Import and announces the loaded documents", () => {
		const http = TestBed.inject(HttpTestingController);
		const created: unknown[] = [];
		service.documentCreated$.subscribe((event) => created.push(event));
		let documents: any[] = [];
		service.importFiles('/folder', 'batch-1').subscribe((result) => (documents = result));
		const request = http.expectOne((req) =>
			req.url.endsWith('/api/v1/upload/batch-1/execute/FileManager.Import'),
		);
		expect(request.request.method).toBe('POST');
		expect(request.request.body).toEqual({ params: {}, context: { currentDocument: '/folder' } });
		expect(request.request.headers.get('X-Batch-No-Drop')).toBe('true');
		expect(request.request.headers.get('nx-es-sync')).toBe('true');
		expect(request.request.headers.get('enrichers-document')).toContain('thumbnail');
		const note = { uid: 'note-1', type: 'Note', parentRef: 'folder-1', properties: {} };
		request.flush({ 'entity-type': 'documents', entries: [note] });
		expect(documents.map((document) => document.type)).toEqual(['Note']);
		expect(created).toEqual([{ repository: 'default', document: jasmine.objectContaining(note) }]);
		// The response is already loaded: no follow-up read of the created document.
		http.expectNone((req) => req.url.includes('/id/note-1'));
	});
	it("creates with stock's sync-indexing and does not re-read a destination its caller just read", () => {
		const http = TestBed.inject(HttpTestingController);
		const parent = {
			uid: 'folder-1',
			path: '/folder',
			facets: ['Folderish'],
			contextParameters: { permissions: ['AddChildren'], subtypes: [{ type: 'File' }] },
		};
		service
			.createDocument('/folder', 'File', { 'dc:title': 'a' }, 'folder-1', {
				parent,
				keepBatch: true,
			})
			.subscribe();
		http.expectNone((req) => req.url.includes('/path/folder'));
		const create = http.expectOne(
			(req) => req.method === 'POST' && req.url.endsWith('/id/folder-1'),
		);
		expect(create.request.headers.get('nx-es-sync')).toBe('true');
		expect(create.request.headers.get('X-Batch-No-Drop')).toBe('true');
		service.createDocument('/folder', 'File', { 'dc:title': 'b' }, 'folder-1').subscribe();
		http.expectOne((req) => req.url.endsWith('/path/folder')).flush(parent);
		const plain = http.expectOne(
			(req) => req.method === 'POST' && req.url.endsWith('/id/folder-1'),
		);
		expect(plain.request.headers.get('nx-es-sync')).toBe('true');
		expect(plain.request.headers.has('X-Batch-No-Drop')).toBeFalse();
	});
	it('keeps a rejected import retryable and treats a lost response as uncertain', () => {
		const http = TestBed.inject(HttpTestingController);
		const failures: unknown[] = [];
		service.importFiles('/folder', 'batch-1').subscribe({ error: (error) => failures.push(error) });
		http
			.expectOne((req) => req.url.includes('/upload/batch-1/'))
			.flush(null, {
				status: 403,
				statusText: 'Forbidden',
			});
		service.importFiles('/folder', 'batch-1').subscribe({ error: (error) => failures.push(error) });
		http
			.expectOne((req) => req.url.includes('/upload/batch-1/'))
			.flush(null, {
				status: 504,
				statusText: 'Gateway Timeout',
			});
		expect((failures[0] as { status: number }).status).toBe(403);
		expect(failures[1]).toEqual(jasmine.any(DocumentCreationError));
	});
	it('reports the resulting legal-hold state without interpreting customer title text', async () => {
		TestBed.inject(WebUiMessages).register('notification-test', {
			es: await loadWebUiCatalog('es'),
		});
		TestBed.inject(WebUiLocale).locale.set('es');
		const toast = spyOn(TestBed.inject(ToastService), 'info');
		const http = TestBed.inject(HttpTestingController);
		const document = {
			uid: 'owned-document',
			title: 'Customer {count} <b>literal</b>',
			hasLegalHold: false,
		};
		service.toggleLegalHold(document)?.subscribe();
		http.expectOne((req) => req.url.endsWith('/Document.Hold')).flush({});
		expect(document.hasLegalHold).toBeTrue();
		expect(toast.calls.mostRecent().args).toEqual([
			'El documento «Customer {count} <b>literal</b>» está sujeto a una retención legal y no se puede modificar.',
			'Retención legal del documento modificada',
			{ enableHtml: false },
		]);
		service.toggleLegalHold(document)?.subscribe();
		http.expectOne((req) => req.url.endsWith('/Document.Unhold')).flush({});
		expect(document.hasLegalHold).toBeFalse();
		expect(toast.calls.mostRecent().args[0]).toBe(
			'El documento «Customer {count} <b>literal</b>» ya no está sujeto a una retención legal.',
		);
	});
});
