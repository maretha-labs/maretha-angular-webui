import {
	LocalizedUiError,
	WebUiMessages,
	WebUiLocale,
	provideDocumentFieldExtensions,
} from '@maretha/webui-sdk';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DocumentLayoutGatewayService } from './document-layout-gateway.service';

describe('Nuxeo layout transport', () => {
	it('loads dynamic facet definitions only for attached registered document fields', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideDocumentFieldExtensions({
					id: 'test.ai',
					schema: 'ai',
					documentTypes: ['File'],
					modes: ['edit'],
					fields: [{ property: 'ai:altText', label: 'Alt Text' }],
				}),
			],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const read = gateway.readDocumentType(
			'File',
			{ type: 'File', properties: { 'ai:altText': '' } },
			'edit',
		);
		http
			.expectOne((request) => request.url.endsWith('/config/types/File'))
			.flush({
				name: 'File',
				schemas: [{ name: 'dublincore', prefix: 'dc', fields: { title: 'string' } }],
			});
		await Promise.resolve();
		http
			.expectOne((request) => request.url.endsWith('/config/schemas/ai'))
			.flush({ name: 'ai', prefix: 'ai', fields: { altText: 'string' } });
		expect((await read).schemas.map((schema) => schema.name)).toEqual(['dublincore', 'ai']);
		// The type definition is session state: a second reader sends no request.
		const plain = gateway.readDocumentType('File', { type: 'File', properties: {} }, 'edit');
		http.expectNone((request) => request.url.endsWith('/config/types/File'));
		expect((await plain).schemas.map((schema) => schema.name)).toEqual(['dublincore']);
		const failed = gateway.readType('Note');
		http
			.expectOne((request) => request.url.endsWith('/config/types/Note'))
			.flush('missing', { status: 404, statusText: 'Not Found' });
		await expectAsync(failed).toBeRejected();
		await Promise.resolve();
		const retried = gateway.readType('Note');
		http
			.expectOne((request) => request.url.endsWith('/config/types/Note'))
			.flush({ name: 'Note', schemas: [] });
		expect((await retried).name).toBe('Note');
		http.verify();
	});
	it('rejects unsafe writes with localizable identities before sending transport and handles absent directory metadata', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const messages = TestBed.inject(WebUiMessages);
		const http = TestBed.inject(HttpTestingController);
		const failures = [
			gateway.update({ uid: 'doc', type: 'File', properties: {} }, {}),
			gateway.create('', 'File', 'name', {}),
			gateway.create('parent', 'File', ' ', {}),
			gateway.create('parent', 'File', 'unsafe/name', {}),
		];
		const errors = await Promise.all(failures.map((promise) => promise.catch((error) => error)));
		expect(errors.every((error) => error instanceof LocalizedUiError)).toBeTrue();
		expect(errors[0].key).toBe('app.gateway.changeToken');
		expect(errors[1].key).toBe('app.gateway.createTarget');
		messages.register('gateway-test', { fr: { 'app.gateway.changeToken': 'Jeton nécessaire.' } });
		messages.locale.set('fr');
		expect(messages.format(errors[0].key, errors[0].values, errors[0].message)).toBe(
			'Jeton nécessaire.',
		);
		const field = {
			property: 'custom:value',
			label: 'Customer',
			type: 'directory' as const,
			multiple: false,
		};
		expect(await gateway.resolveReference(field, 'saved-id')).toBeNull();
		expect(await gateway.searchReferences(field, 'customer')).toEqual([]);
		http.verify();
	});

	it('cancels directory transport on unsubscribe and prefers localized labels', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		let result: any;
		const subscription = gateway
			.resolveReference$(
				{
					property: '',
					label: '',
					type: 'directory',
					multiple: false,
					directoryName: 'l10nsubjects',
				},
				'architecture',
			)
			.subscribe((value) => (result = value));
		const request = http.expectOne((item) =>
			item.url.endsWith('/directory/l10nsubjects/architecture'),
		);
		request.flush({
			properties: { id: 'architecture', label: 'Fallback', label_en: 'Architecture' },
		});
		expect(result).toEqual({ id: 'architecture', label: 'Architecture' });
		const pending = gateway
			.resolveReference$(
				{
					property: '',
					label: '',
					type: 'directory',
					multiple: false,
					directoryName: 'l10ncoverage',
				},
				'emea',
			)
			.subscribe();
		const pendingRequest = http.expectOne((item) =>
			item.url.endsWith('/directory/l10ncoverage/emea'),
		);
		pending.unsubscribe();
		expect(pendingRequest.cancelled).toBeTrue();
		subscription.unsubscribe();
		http.verify({ ignoreCancelled: true });
	});
	it('selects regional and language directory labels while preserving saved IDs', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const locale = TestBed.inject(WebUiLocale);
		const field = {
			property: 'dc:coverage',
			label: 'Coverage',
			type: 'directory' as const,
			multiple: false,
			directoryName: 'l10ncoverage',
		};
		locale.locale.set('pt-PT');
		const result = gateway.resolveReference(field, 'europe/portugal');
		http
			.expectOne((request) => request.url.endsWith('/europe%2Fportugal'))
			.flush({
				properties: {
					id: 'europe/portugal',
					label_en: 'Portugal English',
					label_pt: 'Portugal',
					label_pt_PT: 'Portugal regional',
				},
			});
		expect(await result).toEqual({ id: 'europe/portugal', label: 'Portugal regional' });
		locale.locale.set('fr');
		const search = gateway.searchReferences(field, 'français');
		http
			.expectOne((request) => request.url.endsWith('/directory/l10ncoverage'))
			.flush({
				entries: [{ properties: { id: 'stable', label_en: 'English', label_fr: 'Français' } }],
				isNextPageAvailable: false,
			});
		expect(await search).toEqual([{ id: 'stable', label: 'Français' }]);
		http.verify();
	});
	it('resolves document references without recursively subscribing and cancels on unsubscribe', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		let result: any;
		gateway
			.resolveReference$(
				{ property: 'related', label: 'Related', type: 'reference', multiple: false },
				'doc-1',
			)
			.subscribe((value) => (result = value));
		const request = http.expectOne((item) => item.url.endsWith('/id/doc-1'));
		expect(request.request.headers.get('properties')).toBe('*');
		request.flush({ uid: 'doc-1', properties: { 'dc:title': 'Contract one' } });
		expect(result).toEqual({ id: 'doc-1', label: 'Contract one' });
		const pending = gateway
			.resolveReference$(
				{ property: 'related', label: 'Related', type: 'reference', multiple: false },
				'doc-2',
			)
			.subscribe();
		const pendingRequest = http.expectOne((item) => item.url.endsWith('/id/doc-2'));
		pending.unsubscribe();
		expect(pendingRequest.cancelled).toBeTrue();
		http.verify({ ignoreCancelled: true });
	});
	it('sends optimistic locking information and preserves the server response', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const document = {
			uid: 'contract-id',
			type: 'Contract',
			changeToken: 'original',
			properties: {},
		};
		const result = gateway.update(document, { 'contract:amount': 10 });
		const request = http.expectOne((req) => req.url.endsWith('/id/contract-id'));
		expect(request.request.url).not.toContain('/repo/');
		expect(request.request.method).toBe('PUT');
		expect(request.request.headers.get('enrichers-document')).toBe('permissions');
		expect(request.request.body.changeToken).toBe('original');
		expect(request.request.body.properties).toEqual({ 'contract:amount': 10 });
		request.flush({ ...document, changeToken: 'next', properties: { 'contract:amount': 10 } });
		expect((await result).changeToken).toBe('next');
		http.verify();
	});
	it('updates an explicit repository only when the scoped caller opts in', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const document = { uid: 'note-id', type: 'Note', changeToken: 'original', properties: {} };
		const result = gateway.update(document, { 'note:note': 'Updated' }, 'archive/media');
		const request = http.expectOne((req) => req.url.endsWith('/repo/archive%2Fmedia/id/note-id'));
		expect(request.request.body.changeToken).toBe('original');
		expect(request.request.body.properties).toEqual({ 'note:note': 'Updated' });
		request.flush({ ...document, changeToken: 'next' });
		expect((await result).changeToken).toBe('next');
		http.verify();
	});
	it('uploads a blob as a Nuxeo batch descriptor instead of serializing file contents', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const file = new File(['hello'], 'contract.txt', { type: 'text/plain' });
		const result = gateway.uploadBlob(file);
		const batch = http.expectOne((req) => req.url.endsWith('/upload'));
		expect(batch.request.method).toBe('POST');
		batch.flush({ batchId: 'batch-1' });
		await Promise.resolve();
		const upload = http.expectOne((req) => req.url.endsWith('/upload/batch-1/0'));
		expect(upload.request.body).toBe(file);
		expect(upload.request.headers.get('X-File-Name')).toBe('contract.txt');
		upload.flush({});
		expect(await result).toEqual(
			jasmine.objectContaining({
				'upload-batch': 'batch-1',
				'upload-fileId': '0',
				_name: 'contract.txt',
			}),
		);
		http.verify();
	});
	it('reads the Nuxeo directory entries envelope and bounds lookup paging', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.searchReferences(
			{
				property: 'nature',
				label: 'Nature',
				type: 'directory',
				multiple: false,
				directoryName: 'nature',
			},
			'fin',
		);
		const request = http.expectOne((item) => item.url.endsWith('/directory/nature'));
		expect(request.request.params.get('pageSize')).toBe('100');
		request.flush({
			'entity-type': 'directoryEntries',
			entries: [{ properties: { id: 'finance', label: 'Finance' } }],
			resultsCount: 1,
			isNextPageAvailable: false,
		});
		expect(await result).toEqual([{ id: 'finance', label: 'Finance' }]);
		http.verify();
	});
	it('continues through directory pages so a later matching entry is reachable', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.searchReferences(
			{
				property: 'nature',
				label: 'Nature',
				type: 'directory',
				multiple: false,
				directoryName: 'nature',
			},
			'later',
		);
		const first = http.expectOne((request) => request.url.endsWith('/directory/nature'));
		expect(first.request.params.get('currentPageIndex')).toBe('0');
		first.flush({
			entries: [{ properties: { id: 'early', label: 'Early' } }],
			totalSize: 37,
			isNextPageAvailable: true,
		});
		await Promise.resolve();
		const second = http.expectOne((request) => request.url.endsWith('/directory/nature'));
		expect(second.request.params.get('currentPageIndex')).toBe('1');
		second.flush({
			entries: [{ properties: { id: 'later', label: 'Later result' } }],
			totalSize: 2,
			isNextPageAvailable: false,
		});
		expect(await result).toEqual([{ id: 'later', label: 'Later result' }]);
		http.verify();
	});
	it('keeps server-computed hierarchy values and absolute localized labels for directory controls', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.searchReferences(
			{
				property: 'subjects',
				label: 'Subjects',
				type: 'directory',
				multiple: true,
				directoryName: 'l10nsubjects',
			},
			'',
		);
		const request = http.expectOne((item) => item.url.endsWith('/directory/l10nsubjects'));
		request.flush({
			entries: [
				{
					properties: {
						id: 'architecture',
						computedId: 'art/architecture',
						label: 'architecture',
						label_en: 'Architecture',
						absoluteLabel: 'Art / Architecture',
					},
				},
			],
			isNextPageAvailable: false,
		});
		expect(await result).toEqual([{ id: 'art/architecture', label: 'Art / Architecture' }]);
		http.verify();
	});
	it('loads complete bounded bulk choices through the Nuxeo hierarchy suggestion contract', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.bulkDirectoryChoices('l10nsubjects', true);
		const request = http.expectOne((item) =>
			item.url.endsWith('/automation/Directory.SuggestEntries'),
		);
		expect(request.request.method).toBe('POST');
		expect(request.request.body.params).toEqual(
			jasmine.objectContaining({
				directoryName: 'l10nsubjects',
				dbl10n: true,
				localize: true,
				lang: 'en',
				canSelectParent: false,
				searchTerm: '',
				limit: 1000,
			}),
		);
		request.flush([
			{
				displayLabel: 'Art',
				children: [
					{ id: 'architecture', computedId: 'art/architecture', absoluteLabel: 'Art/Architecture' },
				],
			},
		]);
		expect(await result).toEqual([{ id: 'art/architecture', label: 'Art/Architecture' }]);
		http.verify();
	});
	it('fails closed when the non-paginated suggestion operation reaches its bulk choice limit', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.bulkDirectoryChoices('l10nsubjects', true);
		const request = http.expectOne((item) =>
			item.url.endsWith('/automation/Directory.SuggestEntries'),
		);
		request.flush(Array.from({ length: 1000 }, (_, index) => ({ id: `entry-${index}` })));
		await expectAsync(result).toBeRejectedWithError(/1000-entry bulk choice limit/);
		http.verify();
	});
	it('rejects a repeated directory page instead of looping or reporting no matches', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.searchReferences(
			{
				property: 'nature',
				label: 'Nature',
				type: 'directory',
				multiple: false,
				directoryName: 'nature',
			},
			'missing',
		);
		const first = http.expectOne((request) => request.url.endsWith('/directory/nature'));
		expect(first.request.params.get('currentPageIndex')).toBe('0');
		first.flush({
			entries: [{ properties: { id: 'same', label: 'Same page' } }],
			isNextPageAvailable: true,
		});
		await Promise.resolve();
		const repeated = http.expectOne((request) => request.url.endsWith('/directory/nature'));
		expect(repeated.request.params.get('currentPageIndex')).toBe('1');
		repeated.flush({
			entries: [{ properties: { id: 'same', label: 'Same page' } }],
			isNextPageAvailable: true,
		});
		await expectAsync(result).toBeRejectedWithError(/repeated a page/);
		http.verify();
	});
	it('deletes an allocated upload batch when the file transfer fails', async () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const gateway = TestBed.inject(DocumentLayoutGatewayService);
		const http = TestBed.inject(HttpTestingController);
		const result = gateway.uploadBlob(new File(['x'], 'broken.txt'));
		http.expectOne((request) => request.url.endsWith('/upload')).flush({ batchId: 'broken' });
		await Promise.resolve();
		http
			.expectOne((request) => request.url.endsWith('/upload/broken/0'))
			.error(new ProgressEvent('error'));
		await Promise.resolve();
		const cleanup = http.expectOne((request) => request.url.endsWith('/upload/broken'));
		expect(cleanup.request.method).toBe('DELETE');
		cleanup.flush(null);
		await expectAsync(result).toBeRejected();
		http.verify();
	});
});
