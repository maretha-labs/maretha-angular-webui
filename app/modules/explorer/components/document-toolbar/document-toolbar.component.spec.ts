import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ExtensionRegistry, WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { DocumentClipboardService } from '../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../helpers/document-collections.service';
import { DocumentEnhancerService } from '../../helpers/document-enhancer.service';
import { DocumentOrderService } from '../../helpers/document-order.service';
import { DocumentSnapshotsService } from '../../helpers/document-snapshots.service';
import { DocumentTrashService } from '../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { LayoutService } from '../../helpers/layout.service';
import { SelectionDownloadService } from '../../helpers/selection-download.service';
import { DocumentSearchService } from '../../../search/helpers/document-search.service';
import { SearchQueueService } from '../../../search/helpers/search-queue.service';
import { provideDefaultToolbar } from './default-toolbar';
import { DocumentToolbarComponent } from './document-toolbar.component';
import { QueryTrashComponent } from './query-trash.component';

describe('DocumentToolbarComponent search action host', () => {
	let fixture: ComponentFixture<DocumentToolbarComponent>;
	let toolbar: DocumentToolbarComponent;
	let search: DocumentSearchService;
	let http: HttpTestingController;
	let manager: any;
	let download: jasmine.SpyObj<SelectionDownloadService>;
	let queue: {
		toolbarSnapshot: jasmine.Spy;
		refresh: jasmine.Spy;
		active: ReturnType<typeof signal<boolean>>;
	};

	const button = (label: string): HTMLButtonElement =>
		[...fixture.nativeElement.querySelectorAll('button')].find(
			(element: HTMLButtonElement) => element.textContent?.trim() === label,
		) as HTMLButtonElement;

	async function render(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
		TestBed.tick();
		fixture.detectChanges();
		await fixture.whenStable();
		TestBed.tick();
		fixture.detectChanges();
	}

	function flushProviderRequests(): void {
		http
			.match((request) => request.method === 'GET' && request.url.includes('/search/pp/'))
			.forEach((request) => request.flush({ entries: [], aggregations: {}, quickFilters: [] }));
	}

	function applyCurrentSearch(): void {
		search.loadMore().subscribe();
		flushProviderRequests();
		manager.documentsUpdated$.next(manager.documents);
	}

	/** The search queue beside the folder shows the applied query; its scope drives query commands. */
	function openQueue(parameters: any, repository = 'repo-a') {
		search.searchParameters = parameters;
		search.showSearchPaneVisibility();
		applyCurrentSearch();
		const token = search.getAppliedQueryToken()!;
		const scope = search.getAppliedQueryScope(repository)!;
		queue.toolbarSnapshot.and.returnValue({ scope, token, total: 3 });
		queue.active.set(true);
		manager.documentFetched$.next(manager.documentInfo);
		return { scope, token };
	}

	beforeEach(async () => {
		TestBed.resetTestingModule();
		manager = {
			documentFetched$: new Subject<any>(),
			documentsUpdated$: new Subject<any[]>(),
			selectedDocumentsUpdated$: new Subject<any[]>(),
			fetchingDocuments$: new Subject<boolean>(),
			listingDisplayMode: signal<'table' | 'grid' | null>(null),
			documentInfo: {
				uid: 'folder-a',
				repository: 'repo-a',
				path: '/applied',
				ng: { facets: {}, subTypes: [], isFolder: true },
				contextParameters: {
					permissions: ['AddChildren'],
					runningWorkflows: [],
					runnableWorkflows: [],
				},
			},
			documents: [],
			selectionCount: 0,
			totalCount: 3,
			canLoadMore: false,
			showOnlyTrashedDocuments: false,
			fetchingDocuments: signal(false),
			clearSelection: jasmine.createSpy('clearSelection'),
			selectAllLoaded: jasmine.createSpy('selectAllLoaded'),
			clearDocuments: jasmine.createSpy('clearDocuments'),
			loadMore: jasmine.createSpy('loadMore').and.returnValue(of(null)),
			applySiblingOrder: jasmine.createSpy('applySiblingOrder'),
			toggleSelection: jasmine.createSpy('toggleSelection'),
			reloadDocument: jasmine.createSpy('reloadDocument').and.returnValue(of(null)),
		};
		download = jasmine.createSpyObj<SelectionDownloadService>('download', ['exportCsv']);
		queue = {
			active: signal(false),
			toolbarSnapshot: jasmine.createSpy('toolbarSnapshot').and.returnValue(undefined),
			refresh: jasmine.createSpy('refresh').and.returnValue(false),
		};
		download.exportCsv.and.resolveTo(new Blob(['id,title'], { type: 'text/csv' }));
		await TestBed.configureTestingModule({
			imports: [DocumentToolbarComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideDefaultToolbar(),
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: SearchQueueService, useValue: queue },
				{
					provide: DocumentClipboardService,
					useValue: { documentClipboardUpdated$: new Subject(), addToClipboard: () => undefined },
				},
				{ provide: DocumentCollectionsService, useValue: { removeFromCollection: () => of(null) } },
				{ provide: DocumentTrashService, useValue: { moveDocumentsToTrash: () => of(null) } },
				{ provide: DocumentSnapshotsService, useValue: { snapshotLoaded$: new Subject() } },
				{ provide: DocumentOrderService, useValue: { move: async () => null } },
				{ provide: WorkflowsService, useValue: { startWorkflow: () => of(null) } },
				{ provide: SelectionDownloadService, useValue: download },
				// The application shell loads config/types once; the CSV export reads that copy.
				{
					provide: DocumentEnhancerService,
					useValue: { loadDocumentTypes: () => Promise.resolve({}) },
				},
				{
					provide: LayoutService,
					useValue: {
						pageSize: 40,
						sortFields: [],
						sortAscending: true,
						settingsUpdated$: new Subject(),
					},
				},
				{ provide: AuthService, useValue: { userInfoUpdated$: of({ isAdministrator: false }) } },
				{
					provide: Router,
					useValue: {
						events: new Subject(),
						url: '/browse/documents/folder-a',
						isActive: () => true,
						navigateByUrl: () => Promise.resolve(true),
					},
				},
			],
		}).compileComponents();
		fixture = TestBed.createComponent(DocumentToolbarComponent);
		toolbar = fixture.componentInstance;
		search = TestBed.inject(DocumentSearchService);
		http = TestBed.inject(HttpTestingController);
		flushProviderRequests();
		search.useDefaultSearchProvider().subscribe();
		flushProviderRequests();
		(search as any)._searchParameters = {};
		search.hideSearchPaneVisibility();
	});

	afterEach(() => http.verify());
	it('passes the loaded documents and the folder listing mode to its results contexts', () => {
		expect(toolbar.context()!.items).toBe(manager.documents);
		expect(toolbar.context()!.displayMode).toBeUndefined();
		manager.listingDisplayMode.set('grid');
		TestBed.tick();
		expect(toolbar.context()!.displayMode).toBe('grid');
	});
	it('keeps descriptor errors reactive and customer errors literal through the public toolbar context', () => {
		TestBed.inject(WebUiMessages).register('test', { fr: { 'test.action': 'Refusé {name}' } });
		toolbar.context()!.reportMessage!('test.action', 'Denied {name}', { name: 'Customer title' });
		expect(toolbar.error()).toBe('Denied Customer title');
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(toolbar.error()).toBe('Refusé Customer title');
		toolbar.context()!.reportError('Customer server detail');
		TestBed.inject(WebUiLocale).setLocale('ar');
		expect(toolbar.error()).toBe('Customer server detail');
	});

	it('renders default query actions with only applied named parameters and keeps the running contribution', async () => {
		expect(search.getAppliedQueryScope('repo-a')).toBeUndefined();
		openQueue({ searchFields: { ecm_fulltext: 'applied' } });
		await render();
		(toolbar as any).updateContext();
		await render();
		expect(search.getAppliedQueryScope('repo-a')).toEqual({
			repository: 'repo-a',
			providerName: 'default_search',
			queryParams: [],
			namedParameters: {
				ecm_fulltext: 'applied',
				highlight:
					'dc:title.fulltext,ecm:binarytext,dc:description.fulltext,ecm:tag,note:note.fulltext,file:content.name',
			},
		});
		const queryTrash = fixture.debugElement.query(By.directive(QueryTrashComponent));
		expect(queryTrash).toBeTruthy();
		expect(queryTrash.componentInstance.context().queryScope).toEqual(
			toolbar.context()!.queryScope,
		);
		expect(button('Trash all matching')).toBeTruthy();
		button('Trash all matching').click();
		await render();
		button('Confirm').click();
		const request = http.expectOne(
			(next) => next.method === 'POST' && next.url.endsWith('/automation/Bulk.RunAction'),
		);
		expect(request.request.headers.get('X-NXRepository')).toBe('repo-a');
		expect(request.request.body.params).toEqual(
			jasmine.objectContaining({
				providerName: 'default_search',
				repositoryName: 'repo-a',
				namedParameters: {
					ecm_fulltext: 'applied',
					highlight:
						'dc:title.fulltext,ecm:binarytext,dc:description.fulltext,ecm:tag,note:note.fulltext,file:content.name',
				},
				parameters: JSON.stringify({ operationId: 'Document.Trash', parameters: {} }),
			}),
		);
		request.flush({ value: { commandId: 'job-1', state: 'RUNNING' } });
		await render();
		expect(button('Trash all matching')).toBeTruthy();
		expect(button('Trash all matching').disabled).toBeTrue();
		const status = http.expectOne(
			(next) => next.method === 'GET' && next.url.endsWith('/bulk/job-1'),
		);
		// The user searches again: the queue now shows a newer query, so the job no longer binds it.
		openQueue({ searchFields: { ecm_fulltext: 'applied' } });
		await render();
		expect(toolbar.context()!.busy).toBeFalse();
		status.flush({ commandId: 'job-1', state: 'COMPLETED', processed: 3 });
		await render();
		expect(manager.clearSelection).not.toHaveBeenCalled();
		expect(manager.clearDocuments).not.toHaveBeenCalled();
		expect(queue.refresh).not.toHaveBeenCalled();
		expect(fixture.nativeElement.textContent).toContain('Job job-1');
	});

	it('retries an accepted job status with GET only, without submitting the query again', async () => {
		openQueue({ searchFields: { ecm_fulltext: 'applied' } });
		await render();
		(toolbar as any).updateContext();
		await render();
		button('Trash all matching').click();
		await render();
		button('Confirm').click();
		http
			.expectOne((next) => next.method === 'POST')
			.flush({ commandId: 'job-2', state: 'RUNNING' });
		await render();
		http
			.expectOne((next) => next.method === 'GET' && next.url.endsWith('/bulk/job-2'))
			.flush('not available', { status: 503, statusText: 'Unavailable' });
		await render();
		expect(button('Retry status')).toBeTruthy();
		expect(toolbar.context()!.busy).toBeFalse();
		button('Retry status').click();
		http
			.expectOne((next) => next.method === 'GET' && next.url.endsWith('/bulk/job-2'))
			.flush({ commandId: 'job-2', state: 'COMPLETED', processed: 3 });
		await render();
		expect(http.match((next) => next.method === 'POST').length).toBe(0);
		expect(manager.clearSelection).toHaveBeenCalledTimes(1);
	});

	it('refreshes the captured queue and the still-viewed document after a terminal trash job', async () => {
		search.searchParameters = { searchFields: { ecm_fulltext: 'Maretha' } };
		search.showSearchPaneVisibility();
		applyCurrentSearch();
		const token = search.getAppliedQueryToken()!;
		const scope = search.getAppliedQueryScope('repo-a')!;
		queue.toolbarSnapshot.and.returnValue({ scope, token, total: 1 });
		queue.active.set(true);
		manager.documentInfo = {
			uid: '44cf6e17',
			type: 'CustomFolder',
			repository: 'repo-a',
			ng: { facets: {}, isFolder: true },
			contextParameters: { permissions: [], runningWorkflows: [], runnableWorkflows: [] },
		};
		manager.documentFetched$.next(manager.documentInfo);
		await render();
		button('Trash all matching').click();
		await render();
		button('Confirm').click();
		http
			.expectOne((next) => next.method === 'POST')
			.flush({ commandId: 'job-refresh', state: 'RUNNING' });
		await render();
		http
			.expectOne((next) => next.method === 'GET' && next.url.endsWith('/bulk/job-refresh'))
			.flush({ commandId: 'job-refresh', state: 'COMPLETED', processed: 1 });
		await render();
		expect(queue.refresh).toHaveBeenCalledWith(scope, token);
		expect(manager.clearDocuments).toHaveBeenCalledTimes(1);
		expect(manager.reloadDocument).toHaveBeenCalledWith('44cf6e17');
	});

	it('passes positional NXQL parameters to the rendered CSV contribution', async () => {
		search.useSearchProvider('nxql_search').subscribe();
		flushProviderRequests();
		openQueue({ queryParams: 'SELECT * FROM Document WHERE ecm:isTrashed = 0' });
		await render();
		(toolbar as any).updateContext();
		await render();
		expect(search.getAppliedQueryScope('repo-a')?.providerName).toBe('nxql_search');
		expect(toolbar.context()!.queryScope?.providerName).toBe('nxql_search');
		const exportButton = fixture.nativeElement.querySelector(
			'nx-results-csv-export button',
		) as HTMLButtonElement;
		expect(exportButton).toBeTruthy();
		exportButton.click();
		await render();
		expect(download.exportCsv).toHaveBeenCalledWith(
			{
				repository: 'repo-a',
				providerName: 'nxql_search',
				queryParams: ['SELECT * FROM Document WHERE ecm:isTrashed = 0'],
				namedParameters: {},
			},
			jasmine.any(AbortSignal),
			undefined,
			[],
		);
	});
	it('keeps query bulk actions out of a leaf document header while its search queue remains open', async () => {
		queue.toolbarSnapshot.and.returnValue({
			scope: {
				repository: 'repo-a',
				providerName: 'default_search',
				queryParams: [],
				namedParameters: { ecm_fulltext: 'Maretha' },
			},
			token: 44,
			total: 1,
		});
		queue.active.set(true);
		manager.documentInfo = {
			uid: '44cf6e17',
			type: 'File',
			repository: 'repo-a',
			ng: { facets: {} },
			contextParameters: { permissions: [], runningWorkflows: [], runnableWorkflows: [] },
		};
		manager.totalCount = 0;
		manager.documentFetched$.next(manager.documentInfo);
		await render();
		const queryTrash = fixture.debugElement.query(By.directive(QueryTrashComponent));
		expect(queryTrash).toBeNull();
		expect(toolbar.context()?.queryScope).toBeUndefined();
		expect(queue.active()).toBeTrue();
		expect(queue.toolbarSnapshot().total).toBe(1);
		expect(button('Export CSV')).toBeFalsy();
		expect(button('Trash all matching')).toBeFalsy();
	});

	it('navigates selection documents by path and resolves results, collection, and selection toolbar contributions', async () => {
		const nav = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		toolbar.openSelectionDocument({ uid: 'doc-1', path: '/Workspace/Doc' });
		expect(nav).toHaveBeenCalledWith('/browse/Workspace/Doc');

		const registry = TestBed.inject(ExtensionRegistry);
		const ctx = {
			...toolbar.context()!,
			queryScope: {
				repository: 'default',
				providerName: 'default_trash_search',
				queryParams: [],
				namedParameters: {},
			},
			collection: { uid: 'col-1' },
			selectedDocuments: [{ uid: 'doc-1', facets: ['Publishable'] }],
			availableCommands: ['clipboard'],
		} as any;
		const resultsItems = registry.resolve('RESULTS_ACTIONS', ctx).items;
		expect(resultsItems.map((item) => item.id)).toContain('maretha.results.query-trash');
		expect(resultsItems.map((item) => item.id)).toContain('maretha.results.query-restore');
		const collectionItems = registry.resolve('COLLECTION_ACTIONS', ctx).items;
		expect(collectionItems.map((item) => item.id)).toEqual([
			'maretha.selection.download',
			'maretha.toolbar.clipboard',
		]);
		const selectionItems = registry.resolve('RESULTS_SELECTION_ACTIONS', {
			...ctx,
			collection: null,
		}).items;
		expect(selectionItems.map((item) => item.id)).toEqual([
			'maretha.selection.download',
			'maretha.toolbar.clipboard',
		]);
		for (const item of [...resultsItems, ...collectionItems, ...selectionItems]) {
			expect(typeof (await item.loadComponent?.())).toBe('function');
		}
	});

	it('opens workflow and collection modals with selectedDocuments when ToolbarActionComponent is activated', async () => {
		const { ToolbarActionComponent } = await import('./toolbar-action.component');
		const modal = TestBed.inject(BsModalService);
		const showSpy = spyOn(modal, 'show').and.returnValue({ onHidden: of(undefined) } as any);
		const actionFixture = TestBed.createComponent(ToolbarActionComponent);
		const ctx = toolbar.context()!;
		actionFixture.componentRef.setInput('command', 'workflow');
		actionFixture.componentRef.setInput('label', 'Start Process');
		actionFixture.componentRef.setInput('labelKey', 'workflowButton.tooltip');
		actionFixture.componentRef.setInput('context', {
			...ctx,
			availableCommands: ['workflow', 'collect'],
			selectedDocuments: [{ uid: 'doc-1' }],
		});
		actionFixture.detectChanges();
		expect(actionFixture.componentInstance.actionLabel()).toBe('Start Process');
		expect(actionFixture.componentInstance.panelInjector()).toBeTruthy();
		actionFixture.componentInstance.activate();
		expect(showSpy).toHaveBeenCalledWith(
			jasmine.any(Function),
			jasmine.objectContaining({
				initialState: {
					context: jasmine.objectContaining({ selectedDocuments: [{ uid: 'doc-1' }] }),
				},
			}),
		);
		actionFixture.componentRef.setInput('command', 'collect');
		actionFixture.detectChanges();
		actionFixture.componentInstance.activate();
		expect(showSpy).toHaveBeenCalledTimes(2);
	});
});
