import { StandardContentEditorComponent } from './editors/standard-content-editor.component';
import {
	DEFAULT_DOCUMENT_LAYOUT_EXTENSION,
	DEFAULT_DOCUMENT_LAYOUTS,
	FALLBACK_MEDIA_METADATA_LAYOUT,
	FALLBACK_METADATA_LAYOUT,
	reportFallbackMetadataLayout,
	resetFallbackMetadataLayoutReports,
} from './default-document-layouts';
import { DefaultDocumentMetadataLayoutComponent } from './default-document-metadata-layout.component';
import { DocumentLayoutRegistry, documentLayoutContext } from '@maretha/webui-sdk';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Subject, of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { Router } from '@angular/router';
import { CollectionDrawerNavigation } from 'app/helpers/collection-drawer-navigation.service';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentsManagerService } from '../helpers/documents-manager.service';
import { DocumentCollectionsService } from '../helpers/document-collections.service';
import { DocumentClipboardService } from '../helpers/document-clipboard.service';
import { DocumentTrashService } from '../helpers/document-trash.service';
import { DocumentEnhancerService } from '../helpers/document-enhancer.service';
import { PictureBookContentLayoutComponent } from './viewers/picturebook-content-layout.component';
import { FolderishDetailsLayoutComponent } from './viewers/folderish-details-layout.component';
import { StandardContentLayoutComponent } from './viewers/standard-content-layout.component';
import { StandardContentMetadataComponent } from './viewers/standard-content-metadata.component';
import { MetadataPolicyService } from '../helpers/metadata-policy.service';
import { DocumentLayoutGatewayService } from '../helpers/document-layout-gateway.service';
import { DocumentAttachmentsService } from '../helpers/document-attachments.service';

describe('default document layouts', () => {
	it('has one truthful default registration for each pinned document resource', () => {
		expect(DEFAULT_DOCUMENT_LAYOUTS.length).toBe(76);
		for (const layout of DEFAULT_DOCUMENT_LAYOUTS) {
			expect(layout.source).toMatch(/^elements\/document\/.+-layout\.html$/);
			expect(['create', 'edit', 'import', 'view', 'metadata']).toContain(layout.mode);
			if (layout.mode === 'edit') expect(layout.component).toBe(StandardContentEditorComponent);
		}
	});

	it('falls back to the native metadata layout for types without a pinned resource', () => {
		expect(FALLBACK_METADATA_LAYOUT.documentType).toBeUndefined();
		expect(DEFAULT_DOCUMENT_LAYOUT_EXTENSION.layouts).toContain(FALLBACK_METADATA_LAYOUT);
		const registry = new DocumentLayoutRegistry();
		registry.register(DEFAULT_DOCUMENT_LAYOUT_EXTENSION);
		const custom = registry.resolve(
			documentLayoutContext({ documentType: 'AcmeInvoice', mode: 'metadata' }),
		);
		expect(custom?.component).toBe(DefaultDocumentMetadataLayoutComponent);
		const picture = registry.resolve(
			documentLayoutContext({ documentType: 'Picture', mode: 'metadata' }),
		);
		expect(picture?.component).toBe(StandardContentMetadataComponent);
		expect(
			registry.resolve(documentLayoutContext({ documentType: 'AcmeInvoice', mode: 'view' })),
		).toBeUndefined();
	});

	it('serves stock media documents their typed metadata layout, not the media wildcard', () => {
		const registry = new DocumentLayoutRegistry();
		registry.register(DEFAULT_DOCUMENT_LAYOUT_EXTENSION);
		const resolve = (type: string, facets: string[]) =>
			registry.resolve(
				documentLayoutContext({
					documentType: type,
					mode: 'metadata',
					document: { type, facets } as never,
				}),
			)?.id;
		// Facets as the stock doctypes declare them (nuxeo-platform-video, -imaging-core, -audio-core).
		expect(
			resolve('Video', [
				'Commentable',
				'Versionable',
				'Publishable',
				'Video',
				'HasStoryboard',
				'HasVideoPreview',
				'NXTag',
			]),
		).toBe('default.document-layout.video.metadata');
		expect(
			resolve('Picture', [
				'Picture',
				'Versionable',
				'Publishable',
				'Commentable',
				'HasRelatedText',
				'NXTag',
			]),
		).toBe('default.document-layout.picture.metadata');
		expect(resolve('Audio', ['Audio', 'Commentable', 'Versionable', 'Publishable', 'NXTag'])).toBe(
			'default.document-layout.audio.metadata',
		);
		expect(resolve('AcmePhoto', ['Picture', 'Versionable'])).toBe(
			FALLBACK_MEDIA_METADATA_LAYOUT.id,
		);
		expect(resolve('AcmeInvoice', ['Versionable'])).toBe(FALLBACK_METADATA_LAYOUT.id);
	});

	it('never serves a type that stock Web UI declares no-layout', () => {
		const registry = new DocumentLayoutRegistry();
		registry.register(DEFAULT_DOCUMENT_LAYOUT_EXTENSION);
		for (const documentType of ['Document', 'TemplateBasedFile', 'UserProfile', 'SavedSearch']) {
			expect(registry.resolve(documentLayoutContext({ documentType, mode: 'metadata' })))
				.withContext(documentType)
				.toBeUndefined();
		}
		expect(
			registry.resolve(
				documentLayoutContext({
					documentType: 'Annotation',
					mode: 'metadata',
					document: { facets: ['Picture'] } as never,
				}),
			),
		).toBeUndefined();
	});

	it('tells developers once per type when the wildcard metadata layout serves a type', () => {
		resetFallbackMetadataLayoutReports();
		const info = spyOn(console, 'info');
		reportFallbackMetadataLayout('AcmeInvoice');
		reportFallbackMetadataLayout('AcmeInvoice');
		reportFallbackMetadataLayout('');
		expect(info).toHaveBeenCalledTimes(1);
		expect(info.calls.mostRecent().args[0]).toContain('AcmeInvoice');
		expect(info.calls.mostRecent().args[0]).toContain(FALLBACK_METADATA_LAYOUT.id);
		expect(info.calls.mostRecent().args[0]).toContain('docs/polymer-parity.md');
		resetFallbackMetadataLayoutReports();
	});

	it('preserves intentionally absent source modes', () => {
		expect(
			DEFAULT_DOCUMENT_LAYOUTS.some(
				(layout) => layout.documentType === 'Template' && layout.mode === 'view',
			),
		).toBeFalse();
		expect(
			DEFAULT_DOCUMENT_LAYOUTS.some(
				(layout) => layout.documentType === 'PictureBook' && layout.mode === 'create',
			),
		).toBeFalse();
	});

	it('mounts an intentionally empty WorkspaceRoot create resource without disabling creation', () => {
		const layout = DEFAULT_DOCUMENT_LAYOUTS.find(
			(item) => item.documentType === 'WorkspaceRoot' && item.mode === 'create',
		);
		expect(layout?.disabled).not.toBeTrue();
		expect(layout?.component).toBeDefined();
		expect(layout?.source).toBe(
			'elements/document/workspaceroot/nuxeo-workspaceroot-create-layout.html',
		);
	});

	it('uses stock folder surfaces while preserving binary viewer registrations', () => {
		for (const documentType of [
			'Collection',
			'Folder',
			'Favorites',
			'OrderedFolder',
			'Workspace',
			'Domain',
			'Root',
			'WorkspaceRoot',
			'SectionRoot',
			'TemplateRoot',
			'UserWorkspacesRoot',
			'Collections',
			'Section',
		])
			expect(
				DEFAULT_DOCUMENT_LAYOUTS.find(
					(layout) => layout.documentType === documentType && layout.mode === 'view',
				)?.component,
			).toBe(FolderishDetailsLayoutComponent);
		for (const documentType of ['File', 'Picture']) {
			const component = DEFAULT_DOCUMENT_LAYOUTS.find(
				(layout) => layout.documentType === documentType && layout.mode === 'view',
			)?.component;
			expect(component).not.toBe(PictureBookContentLayoutComponent);
			expect(component).not.toBe(FolderishDetailsLayoutComponent);
		}
	});
});

describe('scoped folderish provider state', () => {
	let http: HttpTestingController;
	let manager: { documentInfo: any; documents: any[]; documentsUpdated$: Subject<any[]> };
	const document = (uid: string, parentRef = 'parent', modified = '2026-09-17T10:00:00Z') => ({
		uid,
		parentRef,
		repository: 'default',
		type: 'Picture',
		title: uid,
		changeToken: '1-0',
		properties: { 'dc:modified': modified },
	});
	const request = (parent = 'parent') =>
		http.expectOne(
			(request) =>
				request.url.includes('/advanced_document_content/execute') &&
				request.params.get('ecm_parentId') === parent,
		);
	const mount = (uid = 'parent') => {
		const component = TestBed.runInInjectionContext(() => new PictureBookContentLayoutComponent());
		component.document = manager.documentInfo = { uid, type: 'Workspace', repository: 'default' };
		component.ngOnChanges();
		return component;
	};
	beforeEach(() => {
		manager = { documentInfo: null, documents: [], documentsUpdated$: new Subject<any[]>() };
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DocumentsManagerService, useValue: manager },
				{
					provide: DocumentCollectionsService,
					useValue: { documentsRemovedFromCollection$: new Subject() },
				},
				{
					provide: AuthService,
					useValue: { userInfo: () => ({ id: 'parity-test' }), userInfoUpdated$: new Subject() },
				},
				{
					provide: DocumentClipboardService,
					useValue: {
						documentsCopied$: new Subject(),
						documentsMoved$: new Subject(),
						drawerActionPerformed$: new Subject(),
						addToClipboard: jasmine.createSpy(),
					},
				},
				{
					provide: DocumentTrashService,
					useValue: {
						documentsMovedToTrash$: new Subject(),
						documentsPurged$: new Subject(),
						documentsRestoredFromTrash$: new Subject(),
					},
				},
				{
					provide: DocumentEnhancerService,
					useValue: {
						setDocumentCustomProperties: (document: any) => ({
							...document,
							ng: { canAddToCollection: true },
						}),
					},
				},
				{
					provide: Router,
					useValue: { navigate: jasmine.createSpy(), navigateByUrl: jasmine.createSpy() },
				},
			],
		});
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => {
		http.verify();
		for (const id of ['parent', 'other'])
			localStorage.removeItem(
				`maretha.content-results.v1:${JSON.stringify(['parity-test', 'default', id])}`,
			);
	});

	it('keeps contributor labels literal even when they match a built-in date bucket', async () => {
		const component = mount();
		request().flush({
			entries: [],
			aggregations: {
				dc_modified_agg: { buckets: [{ key: 'lastWeek', docCount: 1 }] },
				dc_last_contributor_agg: { buckets: [{ key: 'lastWeek', docCount: 1 }] },
			},
		});
		await Promise.resolve();
		expect(component.aggregateBuckets().dc_modified_agg[0].labelKey).toBe(
			'label.ui.aggregate.lastWeek',
		);
		expect(component.aggregateBuckets().dc_last_contributor_agg[0]).toEqual({
			key: 'lastWeek',
			label: 'lastWeek',
			count: 1,
		});
	});

	it('opens Collection member context only for exact Collection result activation', fakeAsync(() => {
		const component = mount();
		request().flush({ entries: [document('member')], totalSize: 1 });
		flushMicrotasks();
		const navigation = spyOn(
			TestBed.inject(CollectionDrawerNavigation),
			'navigate',
		).and.resolveTo();
		component.activateResult(component.rows()[0]);
		expect(navigation).not.toHaveBeenCalled();
		component.document = { uid: 'collection', type: 'Collection', repository: 'default' };
		component.activateResult(component.rows()[0]);
		expect(navigation).toHaveBeenCalledWith(component.document, component.rows()[0], 'parity-test');
		navigation.calls.reset();
		const modified = new MouseEvent('click', { ctrlKey: true, cancelable: true });
		component.activateCollectionLink(modified, component.rows()[0]);
		expect(modified.defaultPrevented).toBeFalse();
		expect(navigation).not.toHaveBeenCalled();
	}));

	it('supersedes an in-flight parent request and refreshes the toolbar scope', fakeAsync(() => {
		const component = mount();
		const old = request();
		component.document = manager.documentInfo = {
			uid: 'other',
			type: 'Workspace',
			repository: 'default',
		};
		component.ngOnChanges();
		const current = request('other');
		old.flush({ entries: [document('old')], totalSize: 1 });
		current.flush({ entries: [document('new', 'other')], totalSize: 1 });
		flushMicrotasks();
		expect(component.rows().map((row) => row.uid)).toEqual(['new']);
		expect(component.toolbarContext().queryScope?.namedParameters['ecm_parentId']).toBe('other');
		expect(component.toolbarContext().items).toBe(component.rows());
		expect(component.toolbarContext().displayMode).toBe(component.displayMode());
		expect(component.toolbarContext().columns).toBeDefined();
		component.document = manager.documentInfo = {
			uid: 'collection',
			type: 'Collection',
			repository: 'default',
			contextParameters: { permissions: ['WriteProperties'] },
		};
		component.ngOnChanges();
		const collectionRequest = http.expectOne((request) =>
			request.url.includes('/default_content_collection/execute'),
		);
		expect(collectionRequest.request.params.get('queryParams')).toBe('collection');
		expect(collectionRequest.request.params.has('ecm_parentId')).toBeFalse();
		expect(collectionRequest.request.params.get('pageSize')).toBe('40');
		expect(collectionRequest.request.headers.has('X-NXfetch-document')).toBeFalse();
		collectionRequest.flush({ entries: [document('member', 'different-parent')], totalSize: 1 });
		flushMicrotasks();
		component.projectedSelectionChange(['member']);
		expect(component.toolbarContext().collection?.['uid']).toBe('collection');
		expect(component.toolbarContext().availableCommands).toContain('remove-collection');
		expect(component.toolbarContext().availableCommands).not.toContain('trash');
		component.document = manager.documentInfo = {
			uid: 'ordered',
			type: 'OrderedFolder',
			repository: 'default',
			facets: ['Orderable'],
			contextParameters: { permissions: ['WriteProperties'] },
		};
		component.ngOnChanges();
		const orderedRequest = request('ordered');
		expect(orderedRequest.request.params.get('sortBy')).toBe('ecm:pos');
		orderedRequest.flush({
			entries: [document('first', 'ordered'), document('second', 'ordered')],
			totalSize: 2,
		});
		flushMicrotasks();
		component.projectedSelectionChange(['second']);
		expect(component.toolbarContext().availableCommands).toContain('move-up');
	}));

	it('applies only matching repository removal events to the exact collection host', fakeAsync(() => {
		const component = mount();
		request().flush({ entries: [document('member')], totalSize: 1 });
		flushMicrotasks();
		const removed = TestBed.inject(DocumentCollectionsService)
			.documentsRemovedFromCollection$ as Subject<any>;
		removed.next({ collectionUid: 'parent', documentUids: ['member'], repository: 'default' });
		expect(component.rows().length).toBe(1);
		component.document = manager.documentInfo = {
			uid: 'collection',
			type: 'Collection',
			repository: 'other',
		};
		component.ngOnChanges();
		http
			.expectOne((request) => request.url.includes('/default_content_collection/execute'))
			.flush({ entries: [{ ...document('member'), repository: 'other' }], totalSize: 1 });
		flushMicrotasks();
		spyOn<any>(component, 'scheduleMutationRefresh').and.stub();
		removed.next({ collectionUid: 'collection', documentUids: ['member'], repository: 'default' });
		expect(component.rows().length).toBe(1);
		removed.next({ collectionUid: 'collection', documentUids: ['member'], repository: 'other' });
		expect(component.rows()).toEqual([]);
		expect(component.total()).toBe(0);
	}));

	it('keeps an explicitly copied document visible with one reload while the index is stale', fakeAsync(() => {
		const component = mount();
		const original = document('old');
		request().flush({ entries: [original], totalSize: 1 });
		flushMicrotasks();
		const added = document('new', 'parent', '2026-09-17T11:00:00Z');
		TestBed.inject(DocumentClipboardService).documentsCopied$.next({
			destinationUid: 'parent',
			documents: [added],
		});
		expect(component.rows().map((row) => row.uid)).toEqual(['new', 'old']);
		tick(0);
		request().flush({ entries: [original], totalSize: 1 });
		flushMicrotasks();
		expect(component.rows().map((row) => row.uid)).toEqual(['new', 'old']);
		expect(component.total()).toBe(2);
		// One mutation, one search: no polling repeats it while the index catches up.
		tick(2100);
		http.expectNone((request) => request.url.includes('/advanced_document_content/execute'));
		expect(component.rows().map((row) => row.uid)).toEqual(['new', 'old']);
	}));

	it('scopes drawer moves and uses enriched provider rows instead of sparse operation responses', fakeAsync(() => {
		const component = mount();
		request().flush({ entries: [document('old')], totalSize: 1 });
		flushMicrotasks();
		component.projectedSelectionChange(['old']);
		const events = TestBed.inject(DocumentClipboardService).drawerActionPerformed$;
		const move = {
			operation: 'Move' as const,
			documents: [],
			sourceUids: ['old'],
			destinationUid: 'other',
			repository: 'archive',
		};
		events.next(move);
		expect(component.rows().map((row) => row.uid)).toEqual(['old']);
		events.next({ ...move, repository: 'default' });
		expect(component.rows()).toEqual([]);
		expect(component.selectedIds()).toEqual([]);
		expect(component.total()).toBe(0);
		tick(0);
		request().flush({ entries: [], totalSize: 0 });
		flushMicrotasks();
		events.next({
			operation: 'Copy',
			documents: [{ uid: 'new', parentRef: 'parent', repository: 'default', properties: {} }],
			sourceUids: ['copied-source'],
			destinationUid: 'parent',
			repository: 'default',
		});
		expect(component.rows()).toEqual([]);
		const enriched = {
			...document('new'),
			properties: { 'dc:modified': '2026-09-17T12:00:00Z', 'dc:lastContributor': 'Administrator' },
			contextParameters: { permissions: ['Remove'] },
		};
		tick(0);
		request().flush({ entries: [enriched], totalSize: 1 });
		flushMicrotasks();
		expect(component.rows().map((row) => row.uid)).toEqual(['new']);
		expect(component.contributor(component.rows()[0])).toBe('Administrator');
		expect(component.documentDate(component.rows()[0], 'dc:modified')).toBe('2026-09-17T12:00:00Z');
		component.projectedSelectionChange(['new']);
		expect(component.toolbarContext().availableCommands).toContain('trash');
		events.next({
			operation: 'Copy',
			documents: [],
			sourceUids: ['another-source'],
			destinationUid: 'parent',
			repository: 'default',
		});
		tick(0);
		request().flush({ entries: [enriched], totalSize: 1 });
		flushMicrotasks();
		component.document = null;
		component.ngOnChanges();
	}));

	it('invalidates a pending listing when the same parent UID changes repositories', fakeAsync(() => {
		const component = mount();
		const previous = request();
		component.document = manager.documentInfo = {
			uid: 'parent',
			type: 'Workspace',
			repository: 'archive',
		};
		component.ngOnChanges();
		const current = request();
		expect(current.request.headers.get('X-NXRepository')).toBe('archive');
		current.flush({
			entries: [{ ...document('archive-row'), repository: 'archive' }],
			totalSize: 1,
		});
		flushMicrotasks();
		previous.flush({ entries: [document('old-repository-row')], totalSize: 1 });
		flushMicrotasks();
		expect(component.rows().map((row) => row.uid)).toEqual(['archive-row']);
		expect(component.total()).toBe(1);
	}));

	it('does not infer mutations or inflate totals from a manager page arriving later', fakeAsync(() => {
		const component = mount();
		const first = Array.from({ length: 40 }, (_, index) => document(`row-${index}`));
		request().flush({ entries: first, totalSize: 43, isNextPageAvailable: true });
		flushMicrotasks();
		manager.documentsUpdated$.next([document('row-40'), document('row-41'), document('row-42')]);
		tick(0);
		expect(component.rows().length).toBe(40);
		expect(component.total()).toBe(43);
		http.expectNone((request) => request.url.includes('/advanced_document_content/execute'));
		component.projectedSelectionChange(first.map((row) => row.uid));
		expect(component.toolbarContext().allSelected).toBeFalse();
		component.selectAllMatching();
		expect(component.toolbarContext().allSelected).toBeTrue();
		expect(component.selectionCount()).toBe(43);
		component.projectedSelectionChange(first.slice(1).map((row) => row.uid));
		expect(component.toolbarContext().queryExclusions).toEqual(['row-0']);
		expect(component.selectionCount()).toBe(42);
	}));

	it('loads the next 40-row page and restores document-specific mode and column choices', fakeAsync(() => {
		const component = mount();
		const first = Array.from({ length: 40 }, (_, index) => document(`row-${index}`));
		request().flush({ entries: first, totalSize: 43, isNextPageAvailable: true });
		flushMicrotasks();
		component.more();
		const second = request();
		expect(second.request.params.get('currentPageIndex')).toBe('1');
		second.flush({
			entries: [document('row-40'), document('row-41'), document('row-42')],
			totalSize: 43,
			isNextPageAvailable: false,
		});
		flushMicrotasks();
		expect(component.rows().length).toBe(43);
		expect(component.hasMore()).toBeFalse();
		component.setDisplayMode('grid');
		component.toggleColumn('type');
		component.columnLayoutChanged([
			{ id: 'modified', width: 260 },
			{ id: 'title', width: 360 },
			{ id: 'lastContributor' },
			{ id: 'type' },
		]);
		component.document = manager.documentInfo = {
			uid: 'other',
			type: 'Workspace',
			repository: 'default',
		};
		component.ngOnChanges();
		request('other').flush({ entries: [], totalSize: 0 });
		flushMicrotasks();
		expect(component.displayMode()).toBe('table');
		expect(component.visibleColumnIds().has('type')).toBeFalse();
		component.document = manager.documentInfo = {
			uid: 'parent',
			type: 'Workspace',
			repository: 'default',
		};
		component.ngOnChanges();
		request().flush({ entries: first, totalSize: 43, isNextPageAvailable: true });
		flushMicrotasks();
		expect(component.displayMode()).toBe('grid');
		expect(component.visibleColumnIds().has('type')).toBeTrue();
		expect(
			component
				.resultColumns()
				.slice(0, 2)
				.map((column) => column.id),
		).toEqual(['modified', 'title']);
		expect(component.resultColumns()[0].width).toBe(260);
		// Columns Settings > Reset returns to the stock columns and widths of this document.
		component.resetColumns();
		expect([...component.visibleColumnIds()]).toEqual(['title', 'modified', 'lastContributor']);
		expect(component.columnLayout()).toEqual([]);
		expect(component.resultColumns()[0].width).toBeUndefined();
		// Outside a view there is no dialog to open; the gear handler tolerates that.
		expect(() => component.openColumnChooser()).not.toThrow();
	}));

	it('resets column choices in memory while no preference key is available', fakeAsync(() => {
		const component = mount();
		request().flush({ entries: [document('alpha')], totalSize: 1 });
		flushMicrotasks();
		(TestBed.inject(AuthService) as { userInfo: () => unknown }).userInfo = () => null;
		component.toggleColumn('type');
		expect(component.visibleColumnIds().has('type')).toBeTrue();
		component.resetColumns();
		expect([...component.visibleColumnIds()]).toEqual(['title', 'modified', 'lastContributor']);
	}));

	it('shows stock Title ascending on the folder sort bar until a sort is applied, then reverses it', fakeAsync(() => {
		const component = mount();
		const first = request();
		expect(first.request.params.has('sortBy')).toBeFalse();
		first.flush({ entries: [document('alpha')], totalSize: 1 });
		flushMicrotasks();
		expect(component.gridSort()).toEqual({ field: 'dc:title', ascending: true });
		component.toggleSortOrder();
		const reversed = request();
		expect(reversed.request.params.get('sortBy')).toBe('dc:title');
		expect(reversed.request.params.get('sortOrder')).toBe('desc');
		reversed.flush({ entries: [document('alpha')], totalSize: 1 });
		flushMicrotasks();
		expect(component.gridSort()).toEqual({ field: 'dc:title', ascending: false });
	}));

	it('retains mutated child documents across title, state and natural order sorting on PictureBookContentLayoutComponent', fakeAsync(() => {
		const component = mount();
		const alpha = {
			...document('alpha'),
			title: 'Alpha',
			state: 'project',
			properties: { 'dc:title': 'Alpha', 'dc:modified': '2026-09-17T10:00:00Z' },
		};
		const beta = {
			...document('beta'),
			title: 'Beta',
			state: 'approved',
			properties: { 'dc:title': 'Beta', 'dc:modified': '2026-09-17T11:00:00Z' },
		};
		request().flush({ entries: [alpha], totalSize: 1 });
		flushMicrotasks();
		spyOn<any>(component, 'scheduleMutationRefresh').and.stub();
		TestBed.inject(DocumentClipboardService).documentsCopied$.next({
			destinationUid: 'parent',
			documents: [beta],
		});
		expect(component.rows().map((row) => row.uid)).toEqual(['beta', 'alpha']);
		component.sortBy.set('dc:title');
		component.sortAscending.set(false);
		TestBed.inject(DocumentClipboardService).documentsCopied$.next({
			destinationUid: 'parent',
			documents: [beta],
		});
		expect(component.rows().map((row) => row.uid)).toEqual(['beta', 'alpha']);
		component.sortBy.set('state');
		component.sortAscending.set(true);
		TestBed.inject(DocumentClipboardService).documentsCopied$.next({
			destinationUid: 'parent',
			documents: [beta],
		});
		expect(component.rows().map((row) => row.uid)).toEqual(['beta', 'alpha']);
		component.naturalOrder.set(true);
		TestBed.inject(DocumentClipboardService).documentsCopied$.next({
			destinationUid: 'parent',
			documents: [
				{
					...alpha,
					title: 'Alpha Updated',
					properties: { ...alpha.properties, 'dc:title': 'Alpha Updated' },
				},
			],
		});
		expect(component.rows().find((row) => row.uid === 'alpha')?.title).toBe('Alpha Updated');
		expect(component.statePresentation(beta).fallback).toBe('Approved');
		TestBed.inject(DocumentClipboardService).documentsMoved$.next({
			destinationUid: 'other-folder',
			documents: [beta],
		});
		expect(component.rows().map((row) => row.uid)).toEqual(['alpha']);
	}));
});

describe('scoped Audio, Video and Note state', () => {
	let gateway: any;
	let manager: any;
	let http: HttpTestingController;
	const document = (type = 'Note', uid = 'note') => ({
		uid,
		type,
		repository: 'archive',
		changeToken: 'original',
		facets: ['Versionable'],
		contextParameters: { permissions: ['WriteProperties', 'WriteVersion'] },
		properties: {
			'dc:title': 'Original title',
			'note:note': 'Saved note',
			'note:mime_type': 'text/html',
		},
	});
	beforeEach(() => {
		gateway = {
			update: jasmine.createSpy().and.callFake((document: any, properties: any) =>
				Promise.resolve({
					...document,
					changeToken: 'committed',
					properties: { ...document.properties, ...properties },
				}),
			),
			uploadBlob: jasmine
				.createSpy()
				.and.resolveTo({ 'upload-batch': 'batch', 'upload-fileId': '0' }),
			releaseBlob: jasmine.createSpy().and.resolveTo(),
			readDocumentType: jasmine.createSpy().and.resolveTo({
				name: 'Note',
				schemas: [{ name: 'dublincore', prefix: 'dc', fields: { title: 'string' } }],
			}),
			resolveReference$: () => of(null),
		};
		manager = { reloadDocument: jasmine.createSpy().and.callFake(() => of(document())) };
		TestBed.configureTestingModule({
			imports: [StandardContentLayoutComponent, StandardContentMetadataComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{
					provide: DocumentAttachmentsService,
					useValue: { downloadDocumentBlob: () => of(undefined) },
				},
				{
					provide: MetadataPolicyService,
					useValue: {
						revision: signal(0),
						load: () => Promise.resolve(),
						canWrite: () => true,
						canRead: () => true,
						assertWritable: () => Promise.resolve(),
						visibleDocument: (value: any) => value,
						userPreferences: () => ({ metadataHidden: false, fieldOrder: [] }),
					},
				},
			],
		})
			.overrideComponent(StandardContentLayoutComponent, { set: { template: '', imports: [] } })
			.overrideComponent(StandardContentMetadataComponent, { set: { template: '', imports: [] } });
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('refreshes changed Note content and never exposes an unsaved draft as a read-only version', () => {
		const fixture = TestBed.createComponent(StandardContentLayoutComponent);
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		const component = fixture.componentInstance;
		expect(component.editing).toBeFalse();
		component.beginEdit();
		expect(component.editing).toBeTrue();
		component.draft = 'Unsaved draft';
		component.sourceMode = true;
		const refreshed = {
			...document(),
			properties: { ...document().properties, 'note:note': 'Server update' },
		};
		fixture.componentRef.setInput('document', refreshed);
		fixture.detectChanges();
		expect(component.draft).toBe('Server update');
		expect(component.editing).toBeFalse();
		component.draft = 'Another draft';
		fixture.componentRef.setInput('document', { ...refreshed, isVersion: true });
		fixture.detectChanges();
		expect(component.canEdit).toBeFalse();
		expect(component.editing).toBeFalse();
		expect(component.sourceMode).toBeFalse();
		expect(component.draft).toBe('Server update');
	});

	it('checks Note permissions first and only opens the inline editor by default when a writable Note is empty', async () => {
		const { NoteRichtextEditorComponent } =
			await import('./viewers/note-richtext-editor.component');
		const fixture = TestBed.createComponent(StandardContentLayoutComponent);
		const emptyNote = {
			...document(),
			properties: { ...document().properties, 'note:note': null },
		};
		// Read-only user on empty Note: always opens view without editor
		fixture.componentRef.setInput('document', {
			...emptyNote,
			contextParameters: { permissions: ['Read'] },
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.canEdit).toBeFalse();
		expect(fixture.componentInstance.editing).toBeFalse();

		// Write user on empty Note (null or ''): opens editor by default
		fixture.componentRef.setInput('document', emptyNote);
		fixture.detectChanges();
		expect(fixture.componentInstance.canEdit).toBeTrue();
		expect(fixture.componentInstance.editing).toBeTrue();

		fixture.componentRef.setInput('document', {
			...emptyNote,
			uid: 'note-empty-str',
			properties: { ...emptyNote.properties, 'note:note': '' },
		});
		fixture.detectChanges();
		expect(fixture.componentInstance.editing).toBeTrue();

		// Write user on populated Note: opens view without editor, beginEdit() opens editor
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		expect(fixture.componentInstance.canEdit).toBeTrue();
		expect(fixture.componentInstance.hasNoteValue).toBeTrue();
		expect(fixture.componentInstance.editing).toBeFalse();
		fixture.componentInstance.beginEdit();
		expect(fixture.componentInstance.editing).toBeTrue();
		fixture.componentInstance.cancelEdit();
		expect(fixture.componentInstance.editing).toBeFalse();

		// Rich-text editor normalizes leftover <br> on clear so data-placeholder remains visible
		const rtFixture = TestBed.createComponent(NoteRichtextEditorComponent);
		rtFixture.componentRef.setInput('placeholder', 'Write your note here');
		rtFixture.componentRef.setInput('value', '');
		rtFixture.detectChanges();
		const editorEl = rtFixture.nativeElement.querySelector('.editor') as HTMLElement;
		expect(editorEl.classList.contains('empty')).toBeTrue();
		editorEl.innerHTML = '<br>';
		rtFixture.componentInstance.changed();
		rtFixture.detectChanges();
		expect(rtFixture.componentInstance.isEmpty).toBeTrue();
		expect(editorEl.innerHTML).toBe('');
		expect(editorEl.classList.contains('empty')).toBeTrue();
	});

	it('keeps empty, proxy and retained media read-only and creates versions in the current repository', fakeAsync(() => {
		const fixture = TestBed.createComponent(StandardContentLayoutComponent);
		fixture.componentRef.setInput('document', { ...document('Audio'), isProxy: true });
		fixture.detectChanges();
		const component = fixture.componentInstance;
		expect(component.blob).toBeUndefined();
		expect(component.canEdit).toBeFalse();
		expect(component.canCreateVersion).toBeFalse();
		fixture.componentRef.setInput('document', {
			...document('Video'),
			isUnderRetentionOrLegalHold: true,
		});
		fixture.detectChanges();
		expect(component.canEdit).toBeFalse();
		fixture.componentRef.setInput('document', { ...document(), isRecord: true });
		fixture.detectChanges();
		expect(component.canCreateVersion).toBeFalse();
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		const dialog = { close: jasmine.createSpy() } as any;
		void component.createVersion(dialog);
		const request = http.expectOne((item) =>
			item.url.endsWith('/automation/Document.CreateVersion'),
		);
		expect(request.request.headers.get('X-NXRepository')).toBe('archive');
		request.flush({});
		flushMicrotasks();
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('note', 'archive');
		expect(dialog.close).toHaveBeenCalled();
	}));

	it('retains a failed Note draft and ignores a save completing after navigation', fakeAsync(() => {
		const fixture = TestBed.createComponent(StandardContentLayoutComponent);
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		const component = fixture.componentInstance;
		component.draft = 'My changes';
		gateway.update.and.rejectWith({ status: 409 });
		void component.saveNote();
		flushMicrotasks();
		expect(component.draft).toBe('My changes');
		expect(component.error).toContain('changed');
		let complete!: (value: any) => void;
		gateway.update.and.returnValue(new Promise((resolve) => (complete = resolve)));
		void component.saveNote();
		flushMicrotasks();
		expect(gateway.update).toHaveBeenCalledWith(
			document(),
			{ 'note:note': 'My changes' },
			'archive',
		);
		fixture.componentRef.setInput('document', document('Note', 'next'));
		fixture.detectChanges();
		complete({});
		flushMicrotasks();
		expect(manager.reloadDocument).not.toHaveBeenCalled();
		expect(component.document.uid).toBe('next');
		expect(component.saving).toBeFalse();
		expect(component.error).toBe('');
	}));

	it('retains attachment upload failures across locale switches without changing the document', fakeAsync(() => {
		const fixture = TestBed.createComponent(StandardContentMetadataComponent);
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		flushMicrotasks();
		const component = fixture.componentInstance;
		const original = structuredClone(component.document);
		gateway.uploadBlob.and.rejectWith(new Error('offline'));
		void component.uploadAttachments({
			target: { files: [new File(['content'], 'Customer.txt')], value: 'selected' },
		} as unknown as Event);
		flushMicrotasks();
		expect(component.attachmentError).toContain('attachments could not be saved');
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'app.state.the-attachments-could-not-be-saved-please-try-5a9bdd':
					'Pièces jointes non enregistrées.',
			},
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(component.attachmentError).toBe('Pièces jointes non enregistrées.');
		expect(component.document).toEqual(original);
		expect(component.uploading).toBeFalse();
		expect(gateway.update).not.toHaveBeenCalled();
	}));
	it('saves scoped metadata in its repository and discards stale attachment completion', fakeAsync(() => {
		const fixture = TestBed.createComponent(StandardContentMetadataComponent);
		fixture.componentRef.setInput('document', document());
		fixture.detectChanges();
		flushMicrotasks();
		const component = fixture.componentInstance;
		component.beginEdit();
		const title = component.allowedFields.find((field) => field.property === 'dc:title')!;
		component.widgetProps(title)!.commit('New title');
		void component.save();
		flushMicrotasks();
		expect(gateway.update).toHaveBeenCalledOnceWith(
			document(),
			{ 'dc:title': 'New title' },
			'archive',
		);
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('note', 'archive');
		expect(component.dirty).toBeFalse();
		gateway.update.calls.reset();
		manager.reloadDocument.calls.reset();
		let complete!: (value: any) => void;
		gateway.uploadBlob.and.returnValue(new Promise((resolve) => (complete = resolve)));
		void component.uploadAttachments({
			target: { files: [new File(['data'], 'attachment.txt')], value: 'attachment.txt' },
		} as any);
		fixture.componentRef.setInput('document', document('Audio', 'next'));
		fixture.detectChanges();
		complete({ 'upload-batch': 'batch', 'upload-fileId': '0' });
		flushMicrotasks();
		expect(gateway.update).not.toHaveBeenCalled();
		expect(manager.reloadDocument).not.toHaveBeenCalled();
		expect(gateway.releaseBlob).toHaveBeenCalled();
		expect(component.uploading).toBeFalse();
		expect(component.document.uid).toBe('next');
	}));

	it('keeps committed Note and metadata values when refresh fails without repeating the write', fakeAsync(() => {
		manager.reloadDocument.and.returnValue(throwError(() => new Error('Refresh failed')));
		const noteFixture = TestBed.createComponent(StandardContentLayoutComponent);
		noteFixture.componentRef.setInput('document', document());
		noteFixture.detectChanges();
		const note = noteFixture.componentInstance;
		note.draft = 'Committed note';
		void note.saveNote();
		flushMicrotasks();
		expect(note.document.properties['note:note']).toBe('Committed note');
		expect(note.document.changeToken).toBe('committed');
		expect(note.draft).toBe('Committed note');
		expect(note.error).toContain('Saved, but');
		void note.saveNote();
		flushMicrotasks();
		expect(gateway.update).toHaveBeenCalledTimes(1);
		gateway.update.calls.reset();
		const metadataFixture = TestBed.createComponent(StandardContentMetadataComponent);
		metadataFixture.componentRef.setInput('document', document());
		metadataFixture.detectChanges();
		flushMicrotasks();
		const metadata = metadataFixture.componentInstance;
		metadata.beginEdit();
		const title = metadata.allowedFields.find((field) => field.property === 'dc:title')!;
		metadata.widgetProps(title)!.commit('Committed title');
		void metadata.save();
		flushMicrotasks();
		expect(metadata.document.properties['dc:title']).toBe('Committed title');
		expect(metadata.document.changeToken).toBe('committed');
		expect(metadata.dirty).toBeFalse();
		expect(metadata.editing).toBeFalse();
		expect(metadata.saveError).toContain('Saved, but');
		void metadata.save();
		flushMicrotasks();
		expect(gateway.update).toHaveBeenCalledTimes(1);
	}));

	it('registers default document views by document type and facet and resolves their view components', async () => {
		const { provideDefaultDocumentViews } = await import('./viewers/default-document-views');
		const { ExtensionRegistry, DOCUMENT_VIEWS_PAGES_SLOT } = await import('@maretha/webui-sdk');
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			providers: [provideDefaultDocumentViews()],
		});
		const registry = TestBed.inject(ExtensionRegistry);
		const resolveFor = (document: Record<string, unknown>) =>
			registry.resolve(DOCUMENT_VIEWS_PAGES_SLOT.name, {
				document,
				noEdit: false,
				viewId: 'view',
				loading: false,
				searchActive: false,
			} as any).items;

		const fileViews = resolveFor({ uid: 'f1', type: 'File', facets: ['Publishable'] });
		expect(fileViews.map((item) => item.id)).toEqual([
			'maretha.document.content',
			'maretha.document.standard-permissions',
			'maretha.document.history',
			'maretha.document.standard-publication',
		]);
		const noteViews = resolveFor({ uid: 'n1', type: 'Note', facets: ['Publishable'] });
		expect(noteViews.map((item) => item.id)).toEqual([
			'maretha.document.content',
			'maretha.document.standard-permissions',
			'maretha.document.standard-history',
			'maretha.document.standard-publication',
		]);
		const folderViews = resolveFor({ uid: 'fol1', type: 'Folder', facets: ['Folderish'] });
		expect(folderViews.map((item) => item.id)).toEqual([
			'maretha.document.content',
			'maretha.document.standard-permissions',
			'maretha.document.standard-history',
			'maretha.document.standard-trash',
		]);
		for (const item of [...fileViews, ...noteViews, ...folderViews]) {
			const component = await item.loadComponent?.();
			expect(typeof component).toBe('function');
		}
	});

	it('computes Picture details panel version badge, contributor ids, tags, and initials', async () => {
		const { DocumentDetailsPanelComponent } =
			await import('./viewers/document-details-panel.component');
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			imports: [DocumentDetailsPanelComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{
					provide: MetadataPolicyService,
					useValue: {
						revision: signal(0),
						load: () => Promise.resolve(),
						canWrite: () => true,
						canRead: () => true,
						assertWritable: () => Promise.resolve(),
						visibleDocument: (value: any) => value,
						userPreferences: () => ({ metadataHidden: false, fieldOrder: [] }),
					},
				},
			],
		}).overrideComponent(DocumentDetailsPanelComponent, { set: { template: '', imports: [] } });
		const details = TestBed.createComponent(DocumentDetailsPanelComponent).componentInstance;
		details.document = {
			uid: 'pic-1',
			type: 'Picture',
			isCheckedOut: true,
			properties: {
				'uid:major_version': 1,
				'uid:minor_version': 2,
				'dc:contributors': [{ id: 'alice' }, 'bob'],
				'nxtag:tags': [{ label: 'featured' }, 'urgent'],
			},
		};
		expect(details.isPicture).toBeTrue();
		expect(details.initials('Alice Bob')).toBe('AB');
		expect(details.tags).toEqual(['featured', 'urgent']);
		expect(details.contributors).toEqual([{ id: 'alice' }, 'bob']);
		expect(details.version).toBe('1.2+');
		expect(details.hasVersions).toBeTrue();
		expect(details.metadataEditor).toBeNull();
	});
});
