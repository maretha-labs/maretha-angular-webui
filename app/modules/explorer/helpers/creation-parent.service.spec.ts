import { DocumentCreationError } from './document-creation-error';
import { of, throwError } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreationParentService, allowsCreateType } from './creation-parent.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DocumentsManagerService } from './documents-manager.service';
import { environment } from 'environments/environment';
const parent = {
	uid: 'parent',
	path: '/Folder & One',
	facets: ['Folderish'],
	contextParameters: {
		permissions: ['AddChildren'],
		subtypes: [
			{ type: 'File', facets: [] },
			{ type: 'Hidden', facets: ['HiddenInCreation'] },
		],
	},
};
describe('Creation destinations', () => {
	it('preserves exact default repository path and ID endpoints for omitted and explicit arguments', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		const service = TestBed.inject(CreationParentService);
		for (const repository of [undefined, 'default']) {
			service.read(parent.path, repository).subscribe();
			http.expectOne(`${environment.nuxeoUrl}/api/v1/path/Folder%20%26%20One`).flush(parent);
			service.readId('parent/#?', repository).subscribe();
			http.expectOne(`${environment.nuxeoUrl}/api/v1/id/parent%2F%23%3F`).flush(parent);
		}
		http.verify();
	});
	it('encodes nondefault repositories and document locations while keeping type configuration global', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		const service = TestBed.inject(CreationParentService);
		const repository = 'archive /?#';
		const scopedApi = `${environment.nuxeoUrl}/api/v1/repo/archive%20%2F%3F%23`;
		let result: any;
		service.load('/Folder & One/Ü? #%2F', repository).subscribe((value) => (result = value));
		const read = http.expectOne(`${scopedApi}/path/Folder%20%26%20One/%C3%9C%3F%20%23%252F`);
		expect(read.request.headers.get('enrichers-document')).toBe('permissions,subtypes');
		read.flush({ ...parent, repository });
		http
			.expectOne(`${environment.nuxeoUrl}/api/v1/config/types/File`)
			.flush({ schemas: [{ name: 'file' }] });
		expect(result.document.repository).toBe(repository);
		expect(result.allowed).toBeTrue();
		expect(result.types).toEqual([{ name: 'File', label: 'File', file: true, folder: false }]);
		service.readId('parent/#?', repository).subscribe();
		const readId = http.expectOne(`${scopedApi}/id/parent%2F%23%3F`);
		expect(readId.request.headers.get('properties')).toBe('dublincore');
		readId.flush({ ...parent, repository });
		http.verify();
	});
	it('encodes paths, loads schema-based type options and excludes hidden types', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		let result: any;
		TestBed.inject(CreationParentService)
			.load(parent.path)
			.subscribe((x) => (result = x));
		http.expectOne(`${environment.nuxeoUrl}/api/v1/path/Folder%20%26%20One`).flush(parent);
		http
			.expectOne((r) => r.url.endsWith('/config/types/File'))
			.flush({ schemas: [{ name: 'file' }] });
		expect(result.types).toEqual([{ name: 'File', label: 'File', file: true, folder: false }]);
		expect(result.allowed).toBeTrue();
		http.verify();
	});
	it('offers Note from files while leaving other non-blob types out of the import picker', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		let result: any;
		TestBed.inject(CreationParentService)
			.load(parent.path)
			.subscribe((x) => (result = x));
		http
			.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One'))
			.flush({
				...parent,
				contextParameters: {
					...parent.contextParameters,
					subtypes: [
						{ type: 'Note', facets: [] },
						{ type: 'Workspace', facets: [] },
					],
				},
			});
		http
			.expectOne((r) => r.url.endsWith('/config/types/Note'))
			.flush({ schemas: [{ name: 'note' }] });
		http
			.expectOne((r) => r.url.endsWith('/config/types/Workspace'))
			.flush({ schemas: [{ name: 'common' }] });
		expect(result.types).toEqual([
			{ name: 'Note', label: 'Note', file: true, folder: false },
			{ name: 'Workspace', label: 'Workspace', file: false, folder: false },
		]);
		http.verify();
	});
	it('treats question marks and fragments in repository names as encoded path data', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		TestBed.inject(CreationParentService).read('/Folder?#One').subscribe();
		const request = http.expectOne((r) => r.url.endsWith('/path/Folder%3F%23One'));
		expect(request.request.method).toBe('GET');
		request.flush(parent);
		http.verify();
	});
	it('notifies an off-parent creation through the freshly checked ID without injecting rows into another view', () => {
		TestBed.configureTestingModule({ providers: legacyTestProviders() });
		const manager = TestBed.inject(DocumentsManagerService);
		const http = TestBed.inject(HttpTestingController);
		const created = { uid: 'created', parentRef: 'parent', properties: {} };
		spyOn(manager, 'getDocumentInfo').and.returnValue(of(created));
		const existingRows = [...manager.documents];
		const existingCount = manager.totalCount;
		const committed = jasmine.createSpy('committed');
		const rowsChanged = jasmine.createSpy('rowsChanged');
		manager.documentCreated$.subscribe(committed);
		manager.documentsUpdated$.subscribe(rowsChanged);
		let result: any;
		manager
			.createDocument(parent.path, 'File', { 'dc:title': 'Test' }, 'parent')
			.subscribe((d) => (result = d));
		http.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One')).flush(parent);
		const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/id/parent'));
		expect(post.request.body.type).toBe('File');
		post.flush({ uid: 'created' });
		expect(result).toEqual(created);
		expect(manager.documents).toEqual(existingRows);
		expect(manager.totalCount).toBe(existingCount);
		expect(committed).toHaveBeenCalledOnceWith({
			repository: 'default',
			document: { uid: 'created' },
		});
		expect(rowsChanged).not.toHaveBeenCalled();
	});
	it('preserves a confirmed creation ID when its follow-up read fails', () => {
		TestBed.configureTestingModule({ providers: legacyTestProviders() });
		const manager = TestBed.inject(DocumentsManagerService),
			http = TestBed.inject(HttpTestingController);
		spyOn(manager, 'getDocumentInfo').and.returnValue(
			throwError(() => new Error('read unavailable')),
		);
		let failure: any;
		manager
			.createDocument(parent.path, 'File', { 'dc:title': 'Created' }, 'parent')
			.subscribe({ error: (e) => (failure = e) });
		http.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One')).flush(parent);
		http
			.expectOne((r) => r.url.endsWith('/id/parent') && r.method === 'POST')
			.flush({ uid: 'acknowledged' });
		expect(failure instanceof DocumentCreationError).toBeTrue();
		expect(failure.documentId).toBe('acknowledged');
	});
	it('distinguishes rejected writes, uncertain writes and failed preflight reads', () => {
		TestBed.configureTestingModule({ providers: legacyTestProviders() });
		const manager = TestBed.inject(DocumentsManagerService),
			http = TestBed.inject(HttpTestingController);
		const committed = jasmine.createSpy('committed');
		manager.documentCreated$.subscribe(committed);
		for (const status of [403, 500]) {
			let failure: any;
			manager
				.createDocument(parent.path, 'File', { 'dc:title': 'Test' }, 'parent')
				.subscribe({ error: (e) => (failure = e) });
			http.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One')).flush(parent);
			http
				.expectOne((r) => r.url.endsWith('/id/parent') && r.method === 'POST')
				.flush({}, { status, statusText: 'Failed' });
			expect(failure instanceof DocumentCreationError).toBe(status === 500);
			if (status === 500) expect(failure.documentId).toBeUndefined();
		}
		let failure: any;
		manager
			.createDocument(parent.path, 'File', {}, 'parent')
			.subscribe({ error: (e) => (failure = e) });
		http
			.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One'))
			.flush({}, { status: 500, statusText: 'Read failed' });
		expect(failure instanceof DocumentCreationError).toBeFalse();
		expect(http.match((r) => r.url.endsWith('/id/parent') && r.method === 'POST').length).toBe(0);
		expect(committed).not.toHaveBeenCalled();
	});
	it('denies types after permission, lifecycle or subtype changes', () => {
		expect(allowsCreateType(parent, 'File')).toBeTrue();
		expect(allowsCreateType(parent, 'Hidden')).toBeFalse();
		for (const patch of [
			{ isTrashed: true },
			{ isVersion: true },
			{ isProxy: true },
			{ hasLegalHold: true },
			{ facets: [] },
			{ contextParameters: { permissions: [], subtypes: parent.contextParameters.subtypes } },
		])
			expect(allowsCreateType({ ...parent, ...patch }, 'File')).toBeFalse();
	});
	it('rechecks the destination at save time and never posts into a replaced or forbidden parent', () => {
		TestBed.configureTestingModule({ providers: legacyTestProviders() });
		const manager = TestBed.inject(DocumentsManagerService);
		const http = TestBed.inject(HttpTestingController);
		let errors = 0;
		manager
			.createDocument(parent.path, 'File', { 'dc:title': 'Test' }, 'expected-parent')
			.subscribe({ error: () => errors++ });
		http.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One')).flush(parent);
		expect(errors).toBe(1);
		manager
			.createDocument(parent.path, 'File', { 'dc:title': 'Test' }, 'parent')
			.subscribe({ error: () => errors++ });
		http
			.expectOne((r) => r.url.endsWith('/path/Folder%20%26%20One'))
			.flush({ ...parent, contextParameters: { permissions: [], subtypes: [] } });
		expect(errors).toBe(2);
		expect(
			http.match((r) => r.method === 'POST' && /\/api\/v1\/(id|path)\//.test(r.url)).length,
		).toBe(0);
	});
	it('rejects relative creation destinations locally with a retained message identity', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		let error: any;
		try {
			TestBed.inject(CreationParentService).read('customer/path');
		} catch (caught) {
			error = caught;
		}
		expect(error.key).toBe('app.state.enter-an-absolute-repository-path-d6ebeb');
		expect(error.message).toBe('Enter an absolute repository path.');
		TestBed.inject(HttpTestingController).expectNone(() => true);
	});
});
