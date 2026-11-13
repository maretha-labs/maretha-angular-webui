import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import {
	ChangeDetectorRef,
	Component,
	Input,
	signal,
	ChangeDetectionStrategy,
} from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import {
	RepositorySearchService,
	RepositorySearchKind,
} from '../../helpers/repository-search.service';
import { RepositorySearchComponent } from './repository-search.component';
import {
	REPOSITORY_SEARCH,
	defineSearch,
	type CompiledSearchDefinition,
} from '../../helpers/repository-search-definitions';
import { AssetsSearchFiltersComponent } from './assets-search-filters.component';
import {
	POLYMER_MESSAGES,
	ResultsPagingSettings,
	ResultsProjectionContext,
	ResultsProjectionRegistry,
} from '@maretha/webui-sdk';
import { HttpTestingController } from '@angular/common/http/testing';
import { DefaultSearchResultsComponent } from '../default-search-results/default-search-results.component';
import { DocumentSearchService } from '../../helpers/document-search.service';
import { AssetsSearchQueueService } from '../../helpers/assets-search-queue.service';
import { readSearchView, writeSearchView } from '../../helpers/search-view-preferences';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span class="client-results-action">{{ context?.scope?.providerName }}</span>',
})
class ClientResultsActionComponent {
	@Input() context: any;
}
@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span class="client-picture">{{ context.row.title }}</span>',
})
class ClientPictureCardComponent {
	@Input({ required: true }) context!: ResultsProjectionContext;
}
describe('Repository search workbench', () => {
	let query: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
	let search: jasmine.SpyObj<RepositorySearchService>;
	let assetsQueue: jasmine.SpyObj<AssetsSearchQueueService>;
	const context = {
		user: { id: 'admin', isAdministrator: true },
		document: { repository: 'default' },
		noEdit: false,
	};
	beforeEach(() => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith('maretha.search-view:')) localStorage.removeItem(key);
		query = new BehaviorSubject(convertToParamMap({}));
		search = jasmine.createSpyObj('search', [
			'search',
			'queryScope',
			'savedSearches',
			'saveSavedSearch',
			'updateSavedSearch',
			'deleteSavedSearch',
			'criteriaFromSaved',
		]);
		search.savedSearches.and.returnValue(of({ entries: [] }));
		assetsQueue = jasmine.createSpyObj('assetsQueue', ['open', 'consumeViewState']);
		search.search.and.returnValue(of({ entries: [], resultsCount: 0 }));
		search.queryScope.and.returnValue({
			repository: 'default',
			providerName: 'test',
			queryParams: [],
			namedParameters: {},
		});
		TestBed.configureTestingModule({
			imports: [RepositorySearchComponent, DefaultSearchResultsComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: RepositorySearchService, useValue: search },
				{ provide: AssetsSearchQueueService, useValue: assetsQueue },
				{
					provide: ActivatedRoute,
					useValue: {
						snapshot: { queryParamMap: query.value, paramMap: convertToParamMap({}) },
						queryParamMap: query.asObservable(),
						paramMap: of(convertToParamMap({})),
					},
				},
			],
		});
	});
	async function render(
		kind: RepositorySearchKind | CompiledSearchDefinition = 'trash',
		ctx = context,
	) {
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', ctx);
		f.componentRef.setInput(
			'definition',
			typeof kind === 'string' ? REPOSITORY_SEARCH[kind] : kind,
		);
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		return f;
	}
	/** Built-in searches keep stock's bare address; these copies exercise route-owned criteria. */
	const urlMode = <D extends CompiledSearchDefinition>(definition: D): D => ({
		...definition,
		form: { ...definition.form, criteria: 'url' as const },
	});
	const urlTrash = urlMode(REPOSITORY_SEARCH.trash);
	/** The drawer renders a results page's filter form bound to that page; pages draw none. */
	async function drawerForm(page: ComponentFixture<RepositorySearchComponent>, settle = true) {
		const formType =
			(await page.componentInstance.definition().form.loadComponent?.()) ??
			AssetsSearchFiltersComponent;
		const form = TestBed.createComponent(formType);
		form.componentRef.setInput('search', page.componentInstance);
		form.detectChanges();
		// NgModel connects its controls a microtask after the first check (a page whose search is
		// still pending never settles, so callers that only click buttons skip the wait).
		if (settle) await form.whenStable();
		form.detectChanges();
		return form;
	}
	function refresh(form: ComponentFixture<unknown>) {
		form.debugElement.injector.get(ChangeDetectorRef).markForCheck();
		form.detectChanges();
	}
	for (const [kind, defaultMode, labels] of [
		['assets', 'grid', ['Switch to Grid View', 'Switch to Table View']],
		['expired', 'table', ['Switch to Grid View', 'Switch to Table View']],
		['trash', 'list', ['Switch to Grid View', 'Switch to Table View', 'Switch to List View']],
		['nxql', 'table', ['Switch to Grid View', 'Switch to Table View']],
	] as const) {
		it(`opens ${kind} in ${defaultMode} with the supported display controls in order`, async () => {
			const f = await render(kind);
			const host = f.nativeElement as HTMLElement;
			expect(f.componentInstance.displayMode()).toBe(defaultMode);
			expect(
				Array.from(host.querySelectorAll('.mode-group button'), (button) =>
					button.getAttribute('aria-label'),
				),
			).toEqual([...labels]);
			expect(host.querySelector('.mode-group') !== null).toBe(labels.length > 0);
			expect(search.search).toHaveBeenCalledTimes(kind === 'nxql' ? 0 : 1);
		});
	}
	it('uses one layout declaration for both stock geometry and result controls', async () => {
		const definition = {
			...REPOSITORY_SEARCH.assets,
			layout: { ...REPOSITORY_SEARCH.assets.layout, results: 'standard' as const },
		};
		const fixture = await render(definition);
		expect(fixture.componentInstance.stockResults()).toBeFalse();
		expect(fixture.nativeElement.classList.contains('stock-layout')).toBeFalse();
		expect(fixture.nativeElement.classList.contains('stock-results')).toBeFalse();
		fixture.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.stockResults()).toBeTrue();
		expect(fixture.nativeElement.classList.contains('stock-layout')).toBeTrue();
		expect(fixture.nativeElement.classList.contains('stock-results')).toBeTrue();
		expect(search.search).toHaveBeenCalledTimes(1);
	});
	it('uses capabilities for a renamed built-in without changing the host', async () => {
		const definition = { ...REPOSITORY_SEARCH.assets, id: 'media-library' };
		const f = await render(definition);
		const component = f.componentInstance;
		expect(component.stockResults()).toBeTrue();
		expect(component.usesAssetTiles()).toBeTrue();
		expect(component.displayMode()).toBe('grid');
		expect(component.toolbarContext().csvSchemas).toEqual([...definition.results.csvSchemas]);
		expect(search.search.calls.mostRecent().args[0]).toBe(definition);
		expect(search.savedSearches).toHaveBeenCalledWith(definition);
		const form = await drawerForm(f);
		expect(form.nativeElement.querySelector('.auto-search-toggle').hidden).toBeFalse();
		expect(form.nativeElement.querySelector('.asset-queue-switch').hidden).toBeFalse();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		component.setAutoSearch(false);
		component.text = 'staged';
		component.filtersChanged();
		expect(search.search).toHaveBeenCalledTimes(1);
		await component.submit();
		f.detectChanges();
		await f.whenStable();
		// Stock keeps the address bare: the search applies in place.
		expect(router).not.toHaveBeenCalled();
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(search.search.calls.mostRecent().args[2].text).toBe('staged');
	});
	it('shares the stock form for an explicit search and keeps its draft out of sorting', async () => {
		const definition = defineSearch({
			id: 'documents',
			provider: 'default_search',
			label: 'Documents',
			labelKey: 'app.documents',
			request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
			form: { submission: 'explicit' },
			facets: [],
			defaultMode: 'list',
			views: { list: {}, table: { columns: REPOSITORY_SEARCH.trash.views.table!.columns } },
		});
		query.next(convertToParamMap({ q: 'applied', path: '/ignored', quickFilters: 'ignored' }));
		const f = await render(definition);
		await f.componentInstance.submit();
		const form = await drawerForm(f);
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.text = 'draft';
		f.componentInstance.filtersChanged();
		expect(router).not.toHaveBeenCalled();
		expect(form.nativeElement.querySelector('select[name="savedSearch"]')).toBeNull();
		expect(form.nativeElement.querySelector('.asset-queue-switch').hidden).toBeTrue();
		f.componentInstance.sortColumn({ columnId: 'title', direction: 'asc' });
		expect(router).toHaveBeenCalledWith(
			[],
			jasmine.objectContaining({
				queryParams: { sortBy: 'dc:title', sortOrder: 'asc' },
			}),
		);
		expect(f.componentInstance.text).toBe('draft');
		await f.componentInstance.submit();
		expect(router.calls.mostRecent().args[1]?.queryParams?.['q']).toBe('draft');
		expect(search.savedSearches).not.toHaveBeenCalled();
	});
	it('keeps explicit path and facet drafts separate when sorting the applied search', async () => {
		const definition = {
			...REPOSITORY_SEARCH.trash,
			id: 'review-documents',
			form: { submission: 'explicit' as const },
		};
		const routeCriteria = {
			q: 'applied',
			path: '/applied',
			facets: JSON.stringify({ dc_creator_agg: ['alice'] }),
		};
		query.next(convertToParamMap(routeCriteria));
		const f = await render(definition);
		const component = f.componentInstance;
		await component.submit();
		component.path = '/draft';
		component.facets = { dc_creator_agg: ['bob'] };
		component.filtersChanged();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.sortColumn({ columnId: 'title', direction: 'asc' });
		expect(router).toHaveBeenCalledWith(
			[],
			jasmine.objectContaining({
				queryParamsHandling: 'merge',
				queryParams: { sortBy: 'dc:title', sortOrder: 'asc' },
			}),
		);
		query.next(convertToParamMap({ ...routeCriteria, sortBy: 'dc:title', sortOrder: 'asc' }));
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({
				path: '/applied',
				facets: { dc_creator_agg: ['alice'] },
				sortBy: 'dc:title',
			}),
		);
		expect(component.path).toBe('/draft');
		expect(component.facets).toEqual({ dc_creator_agg: ['bob'] });
		await component.submit();
		expect(router.calls.mostRecent().args[1]?.queryParams).toEqual(
			jasmine.objectContaining({
				path: '/draft',
				facets: JSON.stringify({ dc_creator_agg: ['bob'] }),
			}),
		);
	});
	it('stages NXQL deep links, edits, sorting and Clear until Search is submitted', async () => {
		query.next(convertToParamMap({ nxql: 'SELECT * FROM File', sortBy: 'dc:title' }));
		const f = await render(urlMode(REPOSITORY_SEARCH.nxql));
		const component = f.componentInstance;
		expect(component.nxql).toBe('SELECT * FROM File');
		expect(component.sortBy).toBe('dc:title');
		expect(component.toolbarContext().queryScope).toBeUndefined();
		component.nxql = 'SELECT * FROM Picture';
		component.filtersChanged();
		await component.applySort();
		await component.selectMatchingQuery();
		component.retry();
		await component.toolbarContext().refresh?.();
		component.reset();
		await f.whenStable();
		expect(search.search).not.toHaveBeenCalled();
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.callFake(
			async (_commands, extras) => {
				query.next(convertToParamMap(extras?.queryParams ?? {}));
				return true;
			},
		);
		await component.submit();
		await f.whenStable();
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(search.search.calls.mostRecent().args[2].nxql).toBe(component.nxql);
		component.reset();
		await f.whenStable();
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(component.rows()).toEqual([]);
		expect(component.toolbarContext().queryScope).toBeUndefined();
		await component.submit();
		expect(search.search).toHaveBeenCalledTimes(2);
	});
	for (const hydrateBeforeNavigationResolves of [true, false]) {
		it(`executes a changed NXQL submission once with route effect first: ${hydrateBeforeNavigationResolves}`, async () => {
			const f = await render('nxql');
			const component = f.componentInstance;
			spyOn(TestBed.inject(Router), 'navigate').and.callFake(async (_commands, extras) => {
				query.next(convertToParamMap(extras?.queryParams ?? {}));
				if (hydrateBeforeNavigationResolves) f.detectChanges();
				return true;
			});
			component.nxql = 'SELECT * FROM Picture';
			await component.submit();
			await f.whenStable();
			f.detectChanges();
			expect(search.search).toHaveBeenCalledTimes(1);
			expect(search.search.calls.mostRecent().args[2].nxql).toBe('SELECT * FROM Picture');
			component.nxql = 'SELECT * FROM File';
			await component.submit();
			await f.whenStable();
			expect(search.search).toHaveBeenCalledTimes(2);
			expect(search.search.calls.mostRecent().args[2].nxql).toBe('SELECT * FROM File');
		});
	}
	it('preserves the executed query on cancelled navigation and stages later history changes', async () => {
		const response = {
			entries: [{ uid: 'report', title: 'Report' }],
			resultsCount: 2,
			isNextPageAvailable: true,
		};
		search.search.and.returnValue(of(response));
		const f = await render(urlMode(REPOSITORY_SEARCH.nxql));
		const component = f.componentInstance;
		await component.submit();
		expect(search.search).toHaveBeenCalledTimes(1);
		const applied = search.search.calls.mostRecent().args[2];
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		component.nxql = 'SELECT * FROM File';
		await component.submit();
		expect(component.rows()).toEqual(response.entries);
		expect(search.search).toHaveBeenCalledTimes(1);
		navigate.and.rejectWith(new Error('Navigation failed'));
		await expectAsync(component.submit()).toBeRejected();
		expect(component.rows()).toEqual(response.entries);
		component.more();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(applied);
		const calls = search.search.calls.count();
		query.next(convertToParamMap({ nxql: 'SELECT * FROM Note' }));
		f.detectChanges();
		await f.whenStable();
		expect(component.nxql).toBe('SELECT * FROM Note');
		expect(component.rows()).toEqual([]);
		expect(component.hasMore()).toBeFalse();
		expect(component.toolbarContext().queryScope).toBeUndefined();
		expect(search.search).toHaveBeenCalledTimes(calls);
		await component.submit();
		expect(search.search).toHaveBeenCalledTimes(calls + 1);
		expect(search.search.calls.mostRecent().args[2].nxql).toBe('SELECT * FROM Note');
	});
	it('does not issue an NXQL request for a non-administrator', async () => {
		const f = await render('nxql', { ...context, user: { id: 'reader', isAdministrator: false } });
		expect(search.search).not.toHaveBeenCalled();
		expect(f.nativeElement.textContent).toContain('not available');
	});
	it('renders the compact NXQL filter card with the required table columns', async () => {
		search.search.and.returnValue(
			of({
				entries: [
					{
						uid: 'report',
						title: 'Report',
						path: '/workspace/report',
						properties: {
							'common:size': 1024,
							'dc:modified': '2026-09-16T12:00:00.000Z',
							'dc:lastContributor': {
								'entity-type': 'user',
								id: 'admin',
								properties: { firstName: 'Ada', lastName: 'Lovelace' },
							},
						},
					},
				],
				resultsCount: 1,
			}),
		);
		const f = await render('nxql');
		expect(search.search).not.toHaveBeenCalled();
		(f.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement).click();
		await f.whenStable();
		f.detectChanges();
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(f.nativeElement.querySelector('.search-workspace--inline')).not.toBeNull();
		expect(f.nativeElement.textContent).toContain('NXQL Query');
		expect(f.nativeElement.textContent).toContain('Ctrl+Enter to run');
		expect(
			(f.nativeElement.querySelector('textarea[name="nxql"]') as HTMLTextAreaElement).rows,
		).toBe(1);
		expect(
			f.componentInstance
				.resultColumns()
				.filter((column) => !column.hidden)
				.map((column) => column.label),
		).toEqual(['Path', 'Size', 'Modified', 'Last contributor']);
		expect(f.nativeElement.querySelector('.document-path')?.getAttribute('href')).toContain(
			'/browse/workspace/report',
		);
		expect(f.nativeElement.textContent).toContain('1 KB');
		expect(f.nativeElement.querySelector('.contributor-chip')?.textContent).toContain(
			'Ada Lovelace',
		);
		expect(f.nativeElement.querySelector('[aria-label="Result view"]')).toBeNull();
		expect(f.nativeElement.textContent).toContain('1 result');
	});
	it('runs NXQL with Ctrl+Enter and can collapse its filters without changing applied criteria', async () => {
		const f = await render('nxql');
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.nxql = 'SELECT * FROM Document';
		(f.nativeElement.querySelector('textarea[name="nxql"]') as HTMLTextAreaElement).dispatchEvent(
			new KeyboardEvent('keydown', {
				bubbles: true,
				cancelable: true,
				ctrlKey: true,
				key: 'Enter',
			}),
		);
		await f.whenStable();
		// Stock NXQL (#!/admin/nxql) runs in place: one request, no address change.
		expect(router).not.toHaveBeenCalled();
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(search.search.calls.mostRecent().args[2].nxql).toBe('SELECT * FROM Document');
		(f.nativeElement.querySelector('.filters-card__toggle') as HTMLButtonElement).click();
		f.detectChanges();
		await f.whenStable();
		expect(f.nativeElement.querySelector('textarea[name="nxql"]')).toBeNull();
		expect(search.search).toHaveBeenCalledTimes(1);
	});
	it('hydrates deep-link filters, ignores unrecognized facets and reloads on history navigation', async () => {
		query.next(
			convertToParamMap({
				q: 'Contract',
				path: '/workspace',
				facets: JSON.stringify({ dc_creator_agg: ['alice'], queryParams: ['bad'] }),
			}),
		);
		const f = await render(urlTrash);
		expect(search.search.calls.mostRecent().args[2].facets).toEqual({ dc_creator_agg: ['alice'] });
		expect(f.componentInstance.text).toBe('Contract');
		expect(f.componentInstance.path).toBe('/workspace');
		query.next(convertToParamMap({ q: 'Next' }));
		await f.whenStable();
		f.detectChanges();
		expect(search.search.calls.mostRecent().args[2].text).toBe('Next');
		expect(f.componentInstance.selection().size).toBe(0);
	});
	it('uses applied criteria for pagination, deduplicates and retries the same failed page', async () => {
		search.search.and.returnValue(
			of({ entries: [{ uid: 'first', title: 'First' }], isNextPageAvailable: true }),
		);
		const f = await render();
		f.componentInstance.text = 'unapplied';
		search.search.and.returnValue(throwError(() => new Error('offline')));
		f.componentInstance.more();
		await f.whenStable();
		expect(f.componentInstance.rows().length).toBe(1);
		expect(f.componentInstance.error()).toContain('failed');
		search.search.and.returnValue(
			of({ entries: [{ uid: 'first' }, { uid: 'second' }], isNextPageAvailable: false }),
		);
		f.componentInstance.retry();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[3]).toBe(1);
		expect(search.search.calls.mostRecent().args[2].text).toBe('');
		expect(f.componentInstance.rows().map((r) => r.uid)).toEqual(['first', 'second']);
	});
	it('keeps document navigation and explicit row selection in the projected result host', async () => {
		search.search.and.returnValue(
			of({
				entries: [
					{
						uid: 'first',
						title: 'First',
						type: 'File',
						facets: ['Versionable'],
						contextParameters: { permissions: ['Remove', 'WriteProperties'] },
					},
				],
				resultsCount: 1,
			}),
		);
		const f = await render('assets');
		const open = f.nativeElement.querySelector(
			'nx-results-projection .asset-open',
		) as HTMLButtonElement;
		expect(open.textContent).toContain('First');
		const router = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		open.click();
		expect(router).toHaveBeenCalledWith('/browse/documents/first');
		const checkbox = f.nativeElement.querySelector(
			'nx-results-projection input[type="checkbox"]',
		) as HTMLInputElement;
		checkbox.checked = true;
		checkbox.dispatchEvent(new Event('change'));
		f.detectChanges();
		expect(f.componentInstance.selection().has('first')).toBeTrue();
		expect(f.componentInstance.toolbarContext().availableCommands).toContain('clipboard');
		expect(f.componentInstance.toolbarContext().availableCommands).toContain('collect');
		expect(f.componentInstance.toolbarContext().availableCommands).toContain('trash');
		expect(f.componentInstance.toolbarContext().items).toBe(f.componentInstance.rows());
		expect(f.componentInstance.toolbarContext().displayMode).toBe(
			f.componentInstance.displayMode(),
		);
		expect(f.componentInstance.toolbarContext().columns?.[0]?.field).toBe('dc:title');
	});
	it('replaces an in-flight default search and keeps grid selection scoped to the new results', async () => {
		const changed = new Subject<void>();
		const oldRequest = new Subject<any>();
		const currentRequest = new Subject<any>();
		const loadMore = jasmine.createSpy('loadMore').and.returnValues(oldRequest, currentRequest);
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: changed,
				pageProviderChanged$: new Subject<void>(),
				loadMore,
				getCurrentQueryScope: () => ({
					repository: 'default',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: { ecm_fulltext: 'new' },
				}),
				getCurrentQueryToken: () => 2,
			},
		});
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		fixture.detectChanges();
		await new Promise((resolve) => setTimeout(resolve));
		changed.next();
		await new Promise((resolve) => setTimeout(resolve));
		expect(loadMore.calls.count()).toBe(2);
		currentRequest.next({
			entries: [
				{
					uid: 'new',
					title: 'New result',
					facets: ['Versionable'],
					contextParameters: { permissions: ['Remove'] },
				},
			],
			resultsCount: 1,
		});
		oldRequest.next({ entries: [{ uid: 'old', title: 'Old result' }] });
		await fixture.whenStable();
		fixture.componentInstance.setDisplayMode('grid');
		fixture.detectChanges();
		expect(fixture.componentInstance.rows().map((row) => row.uid)).toEqual(['new']);
		const checkbox = fixture.nativeElement.querySelector(
			'nx-results-projection input[type="checkbox"]',
		) as HTMLInputElement;
		checkbox.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.componentInstance.selectedIds()).toEqual(['new']);
		expect(
			fixture.componentInstance.toolbarContext().queryScope?.namedParameters['ecm_fulltext'],
		).toBe('new');
		expect(fixture.componentInstance.toolbarContext().items).toBe(fixture.componentInstance.rows());
		expect(fixture.componentInstance.toolbarContext().displayMode).toBe('grid');
	});
	it('runs one default search at construction and one per published change', async () => {
		const changed = new Subject<unknown>();
		const loadMore = jasmine
			.createSpy('loadMore')
			.and.callFake(() => of({ entries: [], resultsCount: 0 }));
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: changed,
				pageProviderChanged$: new Subject<unknown>(),
				loadMore,
				getCurrentQueryScope: () => undefined,
				getCurrentQueryToken: () => 0,
			},
		});
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		expect(loadMore.calls.count()).toBe(1);
		await new Promise((resolve) => setTimeout(resolve));
		expect(loadMore.calls.count()).toBe(1);
		expect(fixture.componentInstance.initialLoading()).toBeFalse();
		changed.next({ searchFields: { ecm_fulltext: 'test' } });
		expect(loadMore.calls.count()).toBe(2);
	});
	it('waits for a page provider, then applies the saved search its route names before loading', async () => {
		const published: unknown[] = [];
		const provider = new Subject<unknown>();
		const changed = new Subject<unknown>();
		const search: any = {
			searchPaneVisibility: () => true,
			currentPageProviderKey: undefined,
			searchParametersChanged$: changed,
			pageProviderChanged$: provider,
			loadMore: jasmine
				.createSpy('loadMore')
				.and.callFake(() => of({ entries: [], resultsCount: 0 })),
			getCurrentQueryScope: () => undefined,
			getCurrentQueryToken: () => 0,
			selectedSavedSearch: signal<any>(undefined),
			getSavedSearch: jasmine
				.createSpy('getSavedSearch')
				.and.callFake((id: string) =>
					of({ id, title: 'Saved', params: { ecm_fulltext: 'saved' } }),
				),
			applySavedSearch: jasmine.createSpy('applySavedSearch').and.callFake((saved: any) => {
				search.selectedSavedSearch.set(saved);
				published.push(saved);
				changed.next({});
			}),
		};
		TestBed.overrideProvider(DocumentSearchService, { useValue: search });
		TestBed.overrideProvider(ActivatedRoute, {
			useValue: {
				snapshot: { paramMap: convertToParamMap({ savedSearchId: 'saved-1' }) },
				paramMap: of(convertToParamMap({ savedSearchId: 'saved-1' })),
			},
		});
		TestBed.createComponent(DefaultSearchResultsComponent);
		expect(search.loadMore).not.toHaveBeenCalled();
		search.currentPageProviderKey = 'default_search';
		provider.next({ key: 'default_search' });
		expect(search.getSavedSearch).toHaveBeenCalledOnceWith('saved-1');
		expect(published.map((saved: any) => saved.id)).toEqual(['saved-1']);
		expect(search.loadMore.calls.count()).toBe(1);
	});
	it('mounts and disposes a client actions projection with the live query scope', async () => {
		const registry = TestBed.inject(ResultsProjectionRegistry);
		const dispose = registry.register({
			id: 'client.repository.actions',
			hostId: 'repository-search',
			projection: 'actions',
			component: ClientResultsActionComponent,
		});
		const f = await render('assets');
		expect(f.nativeElement.querySelector('.client-results-action')?.textContent).toContain('test');
		dispose();
		f.detectChanges();
		expect(f.nativeElement.querySelector('.client-results-action')).toBeNull();
	});
	it('prefers a matching client grid card over the Assets tile and keeps the tile for other rows', async () => {
		TestBed.inject(ResultsProjectionRegistry).register({
			id: 'client.picture.card',
			hostId: 'repository-search',
			mode: 'grid',
			projection: 'item',
			when: (context) => (context as ResultsProjectionContext).row.type === 'Picture',
			component: ClientPictureCardComponent,
		});
		search.search.and.returnValue(
			of({
				entries: [
					{ uid: 'one', title: 'One', type: 'Picture' },
					{ uid: 'two', title: 'Two', type: 'File' },
				],
			}),
		);
		const host = (await render('assets')).nativeElement as HTMLElement;
		expect(host.querySelector('.client-picture')?.textContent).toBe('One');
		expect(
			Array.from(host.querySelectorAll('nx-assets-search-tile .asset-open'), (tile) =>
				tile.textContent?.trim(),
			),
		).toEqual(['Two']);
	});
	it('cancels obsolete criteria and clears selection on a new search', async () => {
		const pending = new Subject<any>();
		search.search.and.returnValue(pending);
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		f.detectChanges();
		search.search.and.returnValue(of({ entries: [{ uid: 'new' }] }));
		f.componentInstance.text = 'new';
		void f.componentInstance.submit();
		f.detectChanges();
		pending.next({ entries: [{ uid: 'old' }] });
		pending.complete();
		await f.whenStable();
		expect(f.componentInstance.rows().map((r) => r.uid)).toEqual(['new']);
	});
	it('uses route navigation for applied filters and guards departure during a selection action', async () => {
		const f = await render(urlTrash);
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.text = 'draft';
		await f.componentInstance.submit();
		expect(router).toHaveBeenCalled();
		expect(search.search).toHaveBeenCalledTimes(1);
		f.componentInstance.toolbarContext().setBusy(true);
		expect(f.componentInstance.canDeactivate()).toBeFalse();
		await f.componentInstance.submit();
		expect(router).toHaveBeenCalledTimes(1);
	});

	it('opens the actual results route from a standalone drawer without carrying document query state', async () => {
		const fixture = await render('assets');
		fixture.componentRef.setInput('drawerOnly', true);
		fixture.detectChanges();
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		await fixture.componentInstance.submit();
		expect(navigate.calls.mostRecent().args).toEqual([['/page', 'assets'], {}]);
		fixture.componentInstance.text = 'Birdy';
		await fixture.componentInstance.submit();
		// The bare results page opens on the drawer's applied criteria.
		expect(navigate.calls.mostRecent().args).toEqual([['/page', 'assets'], {}]);
		await render('assets');
		expect(search.search.calls.mostRecent().args[2].text).toBe('Birdy');
	});
	it('opens the results page from the drawer with the filter groups the drawer had open', async () => {
		const drawer = await render('assets');
		drawer.componentRef.setInput('drawerOnly', true);
		drawer.detectChanges();
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		drawer.componentInstance.toggleFacetExpanded('system_primaryType_agg');
		await drawer.componentInstance.submit();
		// A refused navigation opens no page: a later page opens with every group closed.
		let page = await render('assets');
		expect(page.componentInstance.facetExpanded('system_primaryType_agg')).toBeFalse();
		page.destroy();
		navigate.and.resolveTo(true);
		await drawer.componentInstance.submit();
		page = await render('assets');
		expect(page.componentInstance.facetExpanded('system_primaryType_agg')).toBeTrue();
		expect(page.componentInstance.facetExpanded('system_mimetype_agg')).toBeFalse();
		page.destroy();
		// The groups go to the page that first pick opens, once.
		page = await render('assets');
		expect(page.componentInstance.facetExpanded('system_primaryType_agg')).toBeFalse();
	});
	it('keeps the newer explicit drawer submission when its earlier navigation is superseded', async () => {
		const definition = {
			...REPOSITORY_SEARCH.trash,
			id: 'handoff-documents',
			form: { submission: 'explicit' as const },
		};
		const drawer = TestBed.createComponent(RepositorySearchComponent);
		drawer.componentRef.setInput('context', context);
		drawer.componentRef.setInput('definition', definition);
		drawer.componentRef.setInput('drawerOnly', true);
		drawer.detectChanges();
		await drawer.whenStable();
		const router = TestBed.inject(Router);
		const completions: ((accepted: boolean) => void)[] = [];
		const navigate = spyOn(router, 'navigate').and.callFake(
			() => new Promise<boolean>((resolve) => completions.push(resolve)),
		);
		const first = drawer.componentInstance.submit('first');
		const second = drawer.componentInstance.submit('second');
		completions[0](false);
		await first;
		expect(search.search).not.toHaveBeenCalled();

		const [commands, extras] = navigate.calls.mostRecent().args;
		spyOnProperty(router, 'url', 'get').and.returnValue(
			router.createUrlTree(commands, extras).toString(),
		);
		query.next(convertToParamMap(extras?.queryParams ?? {}));
		completions[1](true);
		await second;
		drawer.destroy();
		const page = await render(definition);
		expect(search.search).toHaveBeenCalledTimes(1);
		expect(search.search.calls.mostRecent().args[2].text).toBe('second');
		page.destroy();
		// The successful handoff is consumed, so a later visit cannot replay the Search.
		await render(definition);
		expect(search.search).toHaveBeenCalledTimes(1);
	});
	it('offers Columns Settings on the Expired and Trash tables, as stock', async () => {
		for (const kind of ['expired', 'trash'] as const) {
			const f = await render(kind);
			f.componentInstance.setDisplayMode('table');
			f.detectChanges();
			await f.whenStable();
			f.detectChanges();
			expect(f.nativeElement.querySelector('.nx-results-projection__settings-button'))
				.withContext(kind)
				.not.toBeNull();
			f.destroy();
		}
	});
	it('refreshes repository data when Search is submitted with unchanged filters', async () => {
		const f = await render();
		search.search.and.returnValue(of({ entries: [{ uid: 'new' }], resultsCount: 1 }));
		await f.componentInstance.submit();
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(f.componentInstance.rows().map((row) => row.uid)).toEqual(['new']);
	});
	it('keeps the optional explicit expired cutoff in provider state while rendering stock Authors', async () => {
		query.next(convertToParamMap({ expiredAt: '2026-09-01T10:30' }));
		const f = await render(urlMode(REPOSITORY_SEARCH.expired));
		expect(f.componentInstance.expiredAt).toBe('2026-09-01T10:30');
		expect(search.search.calls.mostRecent().args[2].expiredAt).toBe(
			new Date('2026-09-01T10:30').toISOString(),
		);
		expect(f.nativeElement.querySelector('input[name="expiredAt"]')).toBeNull();
		expect(f.nativeElement.querySelector('nx-assets-search-filters, form')).toBeNull();
		expect(
			(await drawerForm(f)).nativeElement.querySelector('ng-select[name="authors"]'),
		).not.toBeNull();
	});
	it('keeps an explicit expired cutoff in the provider and query scope on a second native Search', async () => {
		query.next(convertToParamMap({ expiredAt: '2026-09-01T10:30' }));
		search.queryScope.and.callFake((_kind, _repository, criteria) => ({
			repository: 'default',
			providerName: 'expired_search',
			queryParams: [],
			namedParameters: { expired_max: criteria.expiredAt },
		}));
		const f = await render(urlMode(REPOSITORY_SEARCH.expired));
		const cutoff = new Date('2026-09-01T10:30').toISOString();
		((await drawerForm(f)).nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
			new Event('submit', { bubbles: true, cancelable: true }),
		);
		await f.whenStable();
		f.detectChanges();
		expect(search.search.calls.mostRecent().args[2].expiredAt).toBe(cutoff);
		expect(f.componentInstance.toolbarContext().queryScope?.namedParameters['expired_max']).toBe(
			cutoff,
		);
	});
	it('keeps the Expired Reset disabled until the form holds input, then clears it and searches', async () => {
		const f = await render('expired');
		const form = await drawerForm(f);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		const reset = form.nativeElement.querySelector(
			'.asset-filter-actions .buttons > button',
		) as HTMLButtonElement;
		expect(reset.classList).toContain('button--stock');
		expect(reset.disabled).toBeTrue();
		const input = form.nativeElement.querySelector('input[name="text"]') as HTMLInputElement;
		input.value = 'a';
		input.dispatchEvent(new Event('input'));
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		refresh(form);
		expect(search.search.calls.mostRecent().args[2].text).toBe('a');
		expect(reset.disabled).toBeFalse();
		reset.click();
		refresh(form);
		expect(f.componentInstance.text).toBe('');
		expect(reset.disabled).toBeTrue();
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ text: '', facets: {} }),
		);
		expect(navigate).not.toHaveBeenCalled();
	});
	it('runs the Expired search from Reset while the previous search is still pending', async () => {
		const pending = new Subject<any>();
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', REPOSITORY_SEARCH.expired);
		f.detectChanges();
		await f.whenStable();
		search.search.and.returnValue(pending);
		f.componentInstance.text = 'b';
		await f.componentInstance.submit();
		f.detectChanges();
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		expect(f.componentInstance.loading()).toBeTrue();
		const reset = (await drawerForm(f, false)).nativeElement.querySelector(
			'.asset-filter-actions .buttons > button',
		) as HTMLButtonElement;
		expect(reset.disabled).toBeFalse();
		search.search.and.returnValue(of({ entries: [], resultsCount: 0 }));
		reset.click();
		expect(f.componentInstance.text).toBe('');
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2].text).toBe('');
		expect(f.componentInstance.loading()).toBeFalse();
		expect(navigate).not.toHaveBeenCalled();
		f.destroy();
	});
	it('keeps the Assets Reset disabled until a facet or text is entered, then clears the form and searches', async () => {
		search.search.and.returnValue(
			of({
				entries: [],
				aggregations: { system_primaryType_agg: { buckets: [{ key: 'Picture', docCount: 3 }] } },
			}),
		);
		const f = await render('assets');
		const form = await drawerForm(f);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		const host = form.nativeElement as HTMLElement;
		const reset = host.querySelector(
			'.asset-filter-actions .buttons > button',
		) as HTMLButtonElement;
		expect(reset.classList).toContain('button--stock');
		expect(reset.disabled).toBeTrue();
		(host.querySelector('.asset-facet__toggle') as HTMLButtonElement).click();
		refresh(form);
		const facet = host.querySelector(
			'.asset-facet__options input[type="checkbox"]',
		) as HTMLInputElement;
		facet.click();
		refresh(form);
		expect(reset.disabled).toBeFalse();
		facet.click();
		refresh(form);
		expect(reset.disabled).toBeTrue();
		const input = host.querySelector('input[name="text"]') as HTMLInputElement;
		input.value = 'bird';
		input.dispatchEvent(new Event('input'));
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		refresh(form);
		expect(reset.disabled).toBeFalse();
		reset.click();
		refresh(form);
		expect(f.componentInstance.text).toBe('');
		expect(f.componentInstance.facets).toEqual({});
		expect(reset.disabled).toBeTrue();
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ text: '', facets: {} }),
		);
		expect(navigate).not.toHaveBeenCalled();
		f.destroy();
	});
	it('draws no filter column on the Assets, Expired and Trash pages: their filters live in the drawer', async () => {
		for (const kind of ['assets', 'expired', 'trash'] as const) {
			const f = await render(kind);
			expect(f.nativeElement.querySelector('nx-assets-search-filters, form'))
				.withContext(kind)
				.toBeNull();
			expect(f.nativeElement.querySelector('.asset-filters-toggle')).withContext(kind).toBeNull();
			f.destroy();
			const drawer = TestBed.createComponent(RepositorySearchComponent);
			drawer.componentRef.setInput('context', context);
			drawer.componentRef.setInput(
				'definition',
				typeof kind === 'string' ? REPOSITORY_SEARCH[kind] : kind,
			);
			drawer.componentRef.setInput('drawerOnly', true);
			drawer.detectChanges();
			await drawer.whenStable();
			drawer.detectChanges();
			expect(drawer.nativeElement.querySelector('nx-assets-search-filters'))
				.withContext(kind)
				.not.toBeNull();
			drawer.destroy();
		}
	});
	it('gives the Trash drawer the stock trash form: Full Text, Path, Authors and Size, no queue or Auto-search', async () => {
		search.search.and.returnValue(
			of({
				entries: [],
				aggregations: { common_size_agg: { buckets: [{ key: 'tiny', docCount: 1 }] } },
			}),
		);
		const f = await render('trash');
		const form = await drawerForm(f);
		const host = form.nativeElement as HTMLElement;
		expect(host.querySelector('input[name="text"]')).not.toBeNull();
		expect(host.querySelector('ng-select[name="authors"]')).not.toBeNull();
		expect(
			[...host.querySelectorAll('.asset-facet__toggle')].map((toggle) =>
				toggle.textContent?.replace(/\s+/g, ' ').trim(),
			),
		).toEqual(['Size']);
		expect((host.querySelector('.asset-queue-switch') as HTMLElement).hidden).toBeTrue();
		expect((host.querySelector('.auto-search-toggle') as HTMLElement).hidden).toBeTrue();
		const reset = host.querySelector(
			'.asset-filter-actions .buttons > button',
		) as HTMLButtonElement;
		expect(reset.disabled).toBeTrue();
		const path = host.querySelector('input[name="path"]') as HTMLInputElement;
		path.value = '/default-domain';
		path.dispatchEvent(new Event('input'));
		refresh(form);
		expect(f.componentInstance.path).toBe('/default-domain');
		expect(reset.disabled).toBeFalse();
		f.destroy();
	});
	it('shows Assets results in the stock nuxeo-results view: CSV beside the view switcher, blue selection bar', async () => {
		const rows = [
			{ uid: 'one', title: 'One' },
			{ uid: 'two', title: 'Two' },
		];
		search.search.and.returnValue(of({ entries: rows, resultsCount: 2 }));
		const f = await render('assets');
		const host = f.nativeElement as HTMLElement;
		expect(host.classList).toContain('stock-results');
		const controls = host.querySelector('.result-controls') as HTMLElement;
		expect(controls.firstElementChild?.getAttribute('name')).toBe('RESULTS_ACTIONS');
		expect(host.querySelector('.results-actions')).toBeNull();
		expect(
			f.debugElement
				.queryAll(By.css('.result-controls .mode-button nx-webui-icon'))
				.map((icon) => icon.componentInstance.name()),
		).toEqual(['nuxeo:view-thumbnails', 'nuxeo:view-list']);
		expect(host.querySelector('.stock-selection')).toBeNull();
		f.componentInstance.projectedSelectionChange(['one']);
		f.detectChanges();
		expect(host.querySelector('.stock-selection')).not.toBeNull();
		expect(host.querySelector('.search-heading')?.hasAttribute('inert')).toBeTrue();
		expect(host.querySelector('.selection-action-group')).toBeNull();
		f.componentInstance.clearSelectionView();
		f.detectChanges();
		expect(host.querySelector('.stock-selection')).toBeNull();
	});
	it('opens Trash on the stock page: stock sort label, trash actions in the blue selection bar', async () => {
		search.search.and.returnValue(of({ entries: [{ uid: 'one', title: 'One' }], resultsCount: 1 }));
		const f = await render('trash');
		const host = f.nativeElement as HTMLElement;
		expect(host.classList).toContain('stock-results');
		expect(host.querySelector('.results-toolbar__count')?.textContent?.trim()).toBe('1 result(s)');
		// Stock nuxeo-sort-select shows Created ascending before any sort, without sorting by it.
		const select = host.querySelector('nx-results-sort-bar select') as HTMLSelectElement;
		expect(select.value).toBe('dc:created');
		expect(Array.from(select.options, (option) => option.value)).not.toContain('');
		expect(
			f.debugElement
				.query(By.css('nx-results-sort-bar .nx-sort-bar__order nx-webui-icon'))
				.componentInstance.name(),
		).toBe('icons:arrow-upward');
		expect(search.search.calls.mostRecent().args[2].sortBy).toBeFalsy();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		f.componentInstance.reverseSort();
		f.detectChanges();
		await f.whenStable();
		// Stock sorts in place: the address stays bare.
		expect(router).not.toHaveBeenCalled();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ sortBy: 'dc:created', sortOrder: 'desc' }),
		);
		f.componentInstance.projectedSelectionChange(['one']);
		f.detectChanges();
		expect(
			f.debugElement.query(By.css('.stock-selection nx-webui-slot')).componentInstance.name(),
		).toBe('TRASH_RESULTS_SELECTION_ACTIONS');
	});
	it('keeps the Trash address bare, as stock: criteria apply in place and stay with the session', async () => {
		// Stock routes every search to `#!/search/<name>`; its drawer form holds the criteria.
		query.next(convertToParamMap({ q: 'ignored', facets: '{"dc_creator_agg":["ignored"]}' }));
		const f = await render('trash');
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ text: '', path: '/', facets: {} }),
		);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		f.componentInstance.toggleFacet('dc_creator_agg', 'Administrator');
		f.detectChanges();
		await f.whenStable();
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ path: '/', facets: { dc_creator_agg: ['Administrator'] } }),
		);
		f.componentInstance.sortColumn({ columnId: 'title', direction: 'desc' });
		f.detectChanges();
		await f.whenStable();
		expect(search.search).toHaveBeenCalledTimes(3);
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({
				facets: { dc_creator_agg: ['Administrator'] },
				sortBy: 'dc:title',
				sortOrder: 'desc',
			}),
		);
		f.destroy();
		// Back on the page in the same session: the applied criteria, one request.
		const back = await render('trash');
		expect(search.search).toHaveBeenCalledTimes(4);
		expect(back.componentInstance.facets).toEqual({ dc_creator_agg: ['Administrator'] });
		expect(search.search.calls.mostRecent().args[2].sortBy).toBe('dc:title');
		expect(navigate).not.toHaveBeenCalled();
	});
	it('opens the bare Trash page from its drawer with the drawer criteria; a refused one keeps none', async () => {
		const drawer = TestBed.createComponent(RepositorySearchComponent);
		drawer.componentRef.setInput('context', context);
		drawer.componentRef.setInput('definition', REPOSITORY_SEARCH.trash);
		drawer.componentRef.setInput('drawerOnly', true);
		drawer.detectChanges();
		await drawer.whenStable();
		expect(search.search).toHaveBeenCalledTimes(1);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		drawer.componentInstance.path = '/default-domain';
		await drawer.componentInstance.submit();
		expect(navigate).toHaveBeenCalledOnceWith(['/page', 'trash'], {});
		const refused = await render('trash');
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(search.search.calls.mostRecent().args[2].path).toBe('/');
		refused.destroy();
		navigate.and.resolveTo(true);
		await drawer.componentInstance.submit();
		drawer.detectChanges();
		await drawer.whenStable();
		// The drawer's own form does not rerun its own submission; the page it opens does.
		expect(search.search).toHaveBeenCalledTimes(2);
		await render('trash');
		expect(search.search).toHaveBeenCalledTimes(3);
		expect(search.search.calls.mostRecent().args[2].path).toBe('/default-domain');
		expect(navigate.calls.mostRecent().args).toEqual([['/page', 'trash'], {}]);
	});
	it('renders the stock Trash table: its thirteen columns, thumbnail titles, author tags and paths', async () => {
		const path =
			"/default-domain/workspaces/Nature/2023's Best Photos/480 (79).jpeg._1793999319852_.trashed";
		search.search.and.returnValue(
			of({
				entries: [
					{
						uid: 'one',
						title: '480 (79).jpeg',
						type: 'Picture',
						path,
						contextParameters: { thumbnail: { url: 'data:image/png;base64,thumbnail' } },
						properties: {
							'dc:modified': '2025-05-01T10:00:00Z',
							'dc:creator': {
								'entity-type': 'user',
								id: 'Administrator',
								properties: { username: 'Administrator', email: 'devnull@nuxeo.com' },
							},
						},
					},
				],
				resultsCount: 1,
			}),
		);
		const f = await render('trash');
		const host = f.nativeElement as HTMLElement;
		host.style.cssText = 'display:block;width:1200px;height:700px';
		document.body.append(host);
		f.componentInstance.setDisplayMode('table');
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		const stock = [
			['title', 'Title', true],
			['type', 'Type', false],
			['modified', 'Modified', true],
			['lastContributor', 'Last contributor', false],
			['state', 'State', false],
			['version', 'Version', false],
			['created', 'Created', false],
			['author', 'Author', true],
			['nature', 'Nature', false],
			['coverage', 'Coverage', false],
			['subjects', 'Subjects', false],
			['path', 'Path', true],
			['flags', 'Flags', false],
		];
		expect(
			f.componentInstance
				.resultColumns()
				.map((column) => [column.id, column.label, !column.hidden]),
		).toEqual(stock);
		expect(
			Array.from(host.querySelectorAll('.ag-header-cell[col-id]:not([col-id^="__"])'), (cell) =>
				cell.textContent?.trim(),
			),
		).toEqual(['Title', 'Modified', 'Author', 'Path']);
		const cell = (id: string) =>
			host.querySelector(`[role="gridcell"][col-id="${id}"]`) as HTMLElement;
		expect(cell('title').querySelector('img.result-thumbnail')?.getAttribute('src')).toBe(
			'data:image/png;base64,thumbnail',
		);
		expect(cell('title').querySelector('a.plain-link')?.textContent?.trim()).toBe('480 (79).jpeg');
		expect(cell('author').querySelector('nx-user-tag')?.textContent).toContain('devnull@nuxeo.com');
		expect(cell('path').querySelector('.result-path')?.textContent).toBe(path);
		expect(cell('path').querySelector('a, nx-webui-icon')).toBeNull();
		// Stock cells wrap: the thumbnail sits beside the title, and the path takes two lines.
		const thumbnail = cell('title').querySelector('img')!.getBoundingClientRect();
		expect(thumbnail.right).toBeLessThanOrEqual(
			cell('title').querySelector('a')!.getBoundingClientRect().left,
		);
		const pathText = cell('path').querySelector('.result-path') as HTMLElement;
		expect(getComputedStyle(pathText).whiteSpace).toBe('normal');
		expect(pathText.getBoundingClientRect().height).toBeGreaterThan(16);
		expect(pathText.getBoundingClientRect().height).toBeLessThanOrEqual(32);
		host.querySelector<HTMLButtonElement>('.nx-results-projection__settings-button')!.click();
		f.detectChanges();
		const dialog = host.querySelector('nx-search-column-chooser dialog') as HTMLDialogElement;
		expect(
			Array.from(dialog.querySelectorAll('label'), (label) => [
				label.textContent?.trim(),
				label.querySelector('input')!.checked,
			]),
		).toEqual(stock.map(([, label, shown]) => [label, shown]));
		f.destroy();
	});
	it('sorts only the columns stock declares with sort-by, on every search table', () => {
		const sortable = (kind: RepositorySearchKind) =>
			REPOSITORY_SEARCH[kind].views
				.table!.columns.filter((column) => column.sortable !== false)
				.map((column) => column.id);
		// The `sort-by` columns of each nuxeo-*-search-results.html table.
		expect(sortable('trash')).toEqual([
			'title',
			'modified',
			'lastContributor',
			'created',
			'author',
		]);
		expect(sortable('expired')).toEqual(['title', 'modified', 'lastContributor']);
		expect(sortable('assets')).toEqual(['title', 'modified', 'lastContributor']);
		expect(sortable('nxql')).toEqual([
			'title',
			'path',
			'size',
			'modified',
			'lastContributor',
			'created',
			'author',
		]);
		expect(sortable('default')).toEqual([
			'title',
			'modified',
			'lastContributor',
			'created',
			'author',
		]);
	});
	it('renders the stock hidden cells: type tags, long dates, vocabulary tags, flag icons and plain user ids', async () => {
		TestBed.inject(WebUiMessages).register('polymer-test', POLYMER_MESSAGES);
		const http = TestBed.inject(HttpTestingController);
		const entry = (id: string, label: string, parent?: object) => ({
			'entity-type': 'directoryEntry',
			properties: { id, label, ...(parent ? { parent } : {}) },
		});
		const row = (uid: string, type: string) => ({
			uid,
			title: uid,
			type,
			path: `/${uid}`,
			isRecord: true,
			properties: {
				'dc:created': '2025-04-01T10:00:00Z',
				'dc:nature': entry('article', 'Article'),
				'dc:coverage': entry('france', 'France', entry('europe', 'Europe')),
				'dc:subjects': [entry('art', 'Art'), entry('science', 'Science')],
				// A principal the server could not resolve stays a string: stock shows the id.
				'dc:lastContributor': 'ghost',
			},
		});
		search.search.and.returnValue(
			of({ entries: [row('one', 'Picture'), row('two', 'MyType')], resultsCount: 2 }),
		);
		const table = async (kind: RepositorySearchKind) => {
			const f = await render(kind);
			const host = f.nativeElement as HTMLElement;
			host.style.cssText = 'display:block;width:2400px;height:700px';
			document.body.append(host);
			const shown = ['title', 'type', 'created', 'lastContributor', 'nature', 'coverage'];
			for (const column of f.componentInstance.columnChoices())
				if (
					f.componentInstance.columnVisible(column.id) !==
					[...shown, 'subjects', 'flags'].includes(column.id)
				)
					f.componentInstance.toggleColumn(column.id);
			f.componentInstance.setDisplayMode('table');
			f.detectChanges();
			await f.whenStable();
			f.detectChanges();
			// AG Grid creates its cell renderers after its own first render.
			for (
				let wait = 0;
				wait < 50 && !host.querySelector('[role="gridcell"] nx-ag-grid-projection-cell > *');
				wait++
			) {
				await new Promise((resolve) => setTimeout(resolve, 20));
				f.detectChanges();
			}
			const cells = (id: string) =>
				Array.from(
					host.querySelectorAll(`[role="gridcell"][col-id="${id}"]`),
					(cell) => cell as HTMLElement,
				);
			const tags = (id: string) =>
				cells(id).map((cell) =>
					Array.from(cell.querySelectorAll('.tag'), (tag) => tag.textContent!.trim()),
				);
			return { f, cells, tags };
		};
		const trash = await table('trash');
		// formatDocType: the catalog label, else the lowercased type, as stock `_getI18nWithPrefix`.
		expect(trash.tags('type')).toEqual([['Picture'], ['mytype']]);
		expect(trash.cells('created').map((cell) => cell.textContent!.trim())).toEqual([
			'April 1, 2025',
			'April 1, 2025',
		]);
		expect(trash.tags('nature')[0]).toEqual(['Article']);
		expect(trash.tags('coverage')[0]).toEqual(['Europe/France']);
		expect(trash.tags('subjects')[0]).toEqual(['Art', 'Science']);
		const flag = trash.cells('flags')[0].querySelector('.flag') as HTMLElement;
		expect(flag.getAttribute('aria-label')).toBe('Under retention');
		expect(trash.cells('lastContributor')[0].textContent!.trim()).toBe('ghost');
		trash.f.destroy();
		// Stock Assets and NXQL type tags show the type id.
		const assets = await table('assets');
		expect(assets.tags('type')).toEqual([['Picture'], ['MyType']]);
		assets.f.destroy();
		http.expectNone((request) => request.url.includes('/user/'));
	});
	it('sorts the Trash table by stock Author and Created, never by Path', async () => {
		search.search.and.returnValue(
			of({ entries: [{ uid: 'one', title: 'One', path: '/one' }], resultsCount: 1 }),
		);
		const f = await render('trash');
		const host = f.nativeElement as HTMLElement;
		host.style.cssText = 'display:block;width:1600px;height:700px';
		document.body.append(host);
		f.componentInstance.toggleColumn('created');
		f.componentInstance.setDisplayMode('table');
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		const sortableHeader = (id: string) =>
			host
				.querySelector(`.ag-header-cell[col-id="${id}"]`)!
				.classList.contains('ag-header-cell-sortable');
		expect(sortableHeader('author')).toBeTrue();
		expect(sortableHeader('created')).toBeTrue();
		expect(sortableHeader('path')).toBeFalse();
		f.componentInstance.sortColumn({ columnId: 'author', direction: 'asc' });
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ sortBy: 'dc:creator', sortOrder: 'asc' }),
		);
		f.componentInstance.sortColumn({ columnId: 'created', direction: 'desc' });
		f.detectChanges();
		await f.whenStable();
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({ sortBy: 'dc:created', sortOrder: 'desc' }),
		);
		f.destroy();
	});
	it('keeps the Expired, Assets and NXQL criteria out of the address for the session, as stock', async () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		// Stock routes ignore query strings: an old address carries no criteria.
		query.next(convertToParamMap({ q: 'ignored', nxql: 'SELECT * FROM Ignored' }));
		for (const kind of ['expired', 'assets'] as const) {
			const f = await render(kind);
			expect(search.search.calls.mostRecent().args[2].text).withContext(kind).toBe('');
			f.componentInstance.text = kind;
			await f.componentInstance.submit();
			f.detectChanges();
			await f.whenStable();
			expect(search.search.calls.mostRecent().args[2].text).withContext(kind).toBe(kind);
			f.destroy();
			const requests = search.search.calls.count();
			await render(kind);
			expect(search.search.calls.count())
				.withContext(kind)
				.toBe(requests + 1);
			expect(search.search.calls.mostRecent().args[2].text).withContext(kind).toBe(kind);
		}
		const nxql = await render('nxql');
		expect(nxql.componentInstance.nxql).not.toContain('Ignored');
		nxql.componentInstance.nxql = 'SELECT * FROM Note';
		await nxql.componentInstance.submit();
		expect(search.search.calls.mostRecent().args[2].nxql).toBe('SELECT * FROM Note');
		nxql.destroy();
		const requests = search.search.calls.count();
		// Back on the page: stock keeps the query in the form; Search still runs it explicitly.
		const back = await render('nxql');
		expect(back.componentInstance.nxql).toBe('SELECT * FROM Note');
		expect(search.search.calls.count()).toBe(requests);
		expect(navigate).not.toHaveBeenCalled();
	});
	// Applied-filter chips belong to the standard results layout; stock pages (Trash too) show none.
	const standardTrash = {
		...urlTrash,
		layout: { ...REPOSITORY_SEARCH.trash.layout, results: 'standard' as const },
	};
	it('renders an applied facet chip and removes it through the native button', async () => {
		query.next(convertToParamMap({ facets: JSON.stringify({ dc_creator_agg: ['alice'] }) }));
		const f = await render(standardTrash);
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		const chip = f.nativeElement.querySelector(
			'[aria-label="Applied filters"] button',
		) as HTMLButtonElement;
		expect(chip.textContent).toContain('Authors: alice');
		chip.click();
		await f.whenStable();
		expect(router).toHaveBeenCalledWith(
			[],
			jasmine.objectContaining({ queryParams: jasmine.objectContaining({ facets: null }) }),
		);
	});
	it('keeps chips on the applied filters when navigation rejects a drafted filter', async () => {
		query.next(convertToParamMap({ facets: JSON.stringify({ dc_creator_agg: ['alice'] }) }));
		const f = await render(standardTrash);
		spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.facets = { dc_creator_agg: ['bob'] };
		await f.componentInstance.submit();
		f.detectChanges();
		const chips = f.nativeElement.querySelector('[aria-label="Applied filters"]')?.textContent;
		expect(chips).toContain('Authors: alice');
		expect(chips).not.toContain('Authors: bob');
	});
	it('collects every query page for an explicit selection and gives actions the complete records', async () => {
		search.search.and.callFake((_kind, _repository, _criteria, page) =>
			of(
				page === 0
					? { entries: [{ uid: 'one', title: 'One' }], isNextPageAvailable: true, resultsCount: 2 }
					: {
							entries: [{ uid: 'two', title: 'Two' }],
							isNextPageAvailable: false,
							resultsCount: 2,
						},
			),
		);
		const f = await render();
		expect(f.componentInstance.excludedResultActions()).toContain('maretha.results.query-trash');
		await f.componentInstance.selectMatchingQuery();
		expect(f.componentInstance.selection().size).toBe(2);
		expect(f.componentInstance.toolbarContext().selectedDocuments.map((row) => row['uid'])).toEqual(
			['one', 'two'],
		);
		expect(f.componentInstance.selectionOutcome()).toContain('all 2');
		expect(f.componentInstance.excludedResultActions()).not.toContain(
			'maretha.results.query-trash',
		);
		f.componentInstance.projectedSelectionChange([]);
		expect(f.componentInstance.excludedResultActions()).toContain('maretha.results.query-trash');
	});
	it('caps an explicit query selection before a following page can grow an action without bounds', async () => {
		const firstPage = Array.from({ length: 501 }, (_, index) => ({ uid: `doc-${index}` }));
		search.search.and.returnValue(
			of({ entries: firstPage, isNextPageAvailable: false, resultsCount: 501 }),
		);
		const f = await render();
		await f.componentInstance.selectMatchingQuery();
		expect(f.componentInstance.selection().size).toBe(500);
		expect(search.search.calls.count()).toBe(2);
		expect(f.componentInstance.selectionOutcome()).toContain('first 500');
		expect(f.componentInstance.excludedResultActions()).toContain('maretha.results.query-trash');
	});
	it('reports a partial selection instead of treating malformed pagination as complete', async () => {
		search.search.and.callFake((_kind, _repository, _criteria, page) =>
			of(
				page === 0
					? { entries: [{ uid: 'one' }], isNextPageAvailable: true, resultsCount: 2 }
					: { entries: [], isNextPageAvailable: true, resultsCount: 2 },
			),
		);
		const f = await render();
		await f.componentInstance.selectMatchingQuery();
		expect(f.componentInstance.selection().size).toBe(1);
		expect(f.componentInstance.selectionOutcome()).toContain('partial selection');
		expect(f.componentInstance.selectionOutcome()).toContain('without returning documents');
	});
	it('selects default-search pages using the applied scope and stops safely at the selection cap', async () => {
		const changed = new Subject<void>();
		const scope = {
			repository: 'default',
			providerName: 'default_search',
			queryParams: [],
			namedParameters: { ecm_fulltext: 'pinned' },
		};
		const pending = new Subject<any>();
		const page = jasmine.createSpy('loadAppliedQuery').and.callFake((_scope, index) =>
			of({
				entries: index === 0 ? [{ uid: 'one', title: 'One' }] : [{ uid: 'two', title: 'Two' }],
				isNextPageAvailable: index === 0,
			}),
		);
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: changed,
				pageProviderChanged$: new Subject<void>(),
				loadMore: () => of({ entries: [{ uid: 'one', title: 'One' }], resultsCount: 2 }),
				loadAppliedQuery: page,
				getCurrentQueryScope: () => scope,
				getCurrentQueryToken: () => 2,
			},
		});
		const fixture = TestBed.createComponent(DefaultSearchResultsComponent);
		fixture.detectChanges();
		await new Promise((resolve) => setTimeout(resolve));
		await fixture.whenStable();
		await fixture.componentInstance.selectMatchingQuery();
		expect(fixture.componentInstance.selectedIds()).toEqual(['one', 'two']);
		expect(page.calls.allArgs().map((args) => args.slice(0, 5))).toEqual([
			[scope, 0, 40, ['dc:created'], true],
			[scope, 1, 40, ['dc:created'], true],
		]);
		expect(fixture.componentInstance.matchingQuerySelected()).toBeTrue();
		page.and.returnValue(
			of({
				entries: Array.from({ length: 501 }, (_, index) => ({ uid: `capped-${index}` })),
				isNextPageAvailable: false,
			}),
		);
		await fixture.componentInstance.selectMatchingQuery();
		expect(fixture.componentInstance.selectedIds().length).toBe(500);
		expect(fixture.componentInstance.matchingQuerySelected()).toBeFalse();
		expect(fixture.componentInstance.selectionOutcome()).toContain('first 500');
		page.and.returnValue(pending);
		const selecting = fixture.componentInstance.selectMatchingQuery();
		changed.next();
		pending.next({ entries: [{ uid: 'stale' }], isNextPageAvailable: false });
		await selecting;
		expect(fixture.componentInstance.selectedIds()).toEqual([]);
		expect(fixture.componentInstance.matchingQuerySelected()).toBeFalse();
	});
	it('switches the loaded rows without a request, clears selection, pages on and restores the saved mode', async () => {
		search.search.and.returnValue(
			of({ entries: [{ uid: 'one', title: 'One' }], isNextPageAvailable: true }),
		);
		const first = await render('assets');
		const component = first.componentInstance;
		component.projectedSelectionChange(['one']);
		const rows = component.rows();
		component.setDisplayMode('table');
		first.detectChanges();
		await first.whenStable();
		expect(first.nativeElement.querySelector('ag-grid-angular')).not.toBeNull();
		expect(component.selectedIds()).toEqual([]);
		expect(component.rows()).toBe(rows);
		expect(search.search).toHaveBeenCalledTimes(1);
		search.search.and.returnValue(of({ entries: [{ uid: 'two', title: 'Two' }] }));
		component.more();
		await first.whenStable();
		expect(search.search.calls.mostRecent().args[3]).toBe(1);
		expect(component.rows().map((row) => row.uid)).toEqual(['one', 'two']);
		first.destroy();
		const restored = await render('assets');
		expect(restored.componentInstance.displayMode()).toBe('table');
		const otherSearch = await render('trash');
		expect(otherSearch.componentInstance.displayMode()).toBe('list');
	});
	it('falls back from an unsupported stored mode and ignores attempts to switch to it', async () => {
		writeSearchView('assets', 'admin', 'default', { displayMode: 'list' });
		search.search.and.returnValue(of({ entries: [{ uid: 'one', title: 'One' }] }));
		const { componentInstance } = await render('assets');
		expect(componentInstance.displayMode()).toBe('grid');
		componentInstance.projectedSelectionChange(['one']);
		componentInstance.setDisplayMode('list');
		expect(componentInstance.displayMode()).toBe('grid');
		expect(componentInstance.selectedIds()).toEqual(['one']);
		expect(search.search).toHaveBeenCalledTimes(1);
	});
	it('stops an in-flight query selection and refuses row mutations until it has settled', async () => {
		const pending = new Subject<any>();
		search.search.and.callFake((_kind, _repository, _criteria, page) =>
			page === 0 ? of({ entries: [{ uid: 'one' }], isNextPageAvailable: true }) : pending,
		);
		const f = await render();
		const selecting = f.componentInstance.selectMatchingQuery();
		await Promise.resolve();
		f.componentInstance.select('one', { target: { checked: true } } as unknown as Event);
		expect(f.componentInstance.selection().size).toBe(1);
		f.componentInstance.stopSelectingQuery();
		await selecting;
		expect(f.componentInstance.selectionOutcome()).toContain('stopped after 1');
	});
	it('stages assets text and facet edits with Auto-search off and debounces the latest draft when enabled', fakeAsync(() => {
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		f.detectChanges();
		tick();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		const component = f.componentInstance;
		const requests = search.search.calls.count();
		const settle = (ms: number) => {
			tick(ms);
			f.detectChanges();
		};
		expect(component.autoSearch()).toBeTrue();
		component.setAutoSearch(false);
		component.text = 'leopard';
		component.filtersChanged();
		component.toggleFacet('system_primaryType_agg', 'Picture');
		settle(400);
		expect(search.search.calls.count()).toBe(requests);
		expect(component.facets['system_primaryType_agg']).toEqual(['Picture']);
		component.setAutoSearch(true);
		settle(200);
		component.text = 'leopard portrait';
		component.filtersChanged();
		settle(299);
		expect(search.search.calls.count()).toBe(requests);
		settle(1);
		expect(search.search.calls.count()).toBe(requests + 1);
		expect(search.search.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({
				text: 'leopard portrait',
				facets: { system_primaryType_agg: ['Picture'] },
			}),
		);
		expect(router).not.toHaveBeenCalled();
		f.destroy();
	}));
	it('does not drop a debounced assets draft while the previous result request is pending', fakeAsync(() => {
		const pending = new Subject<any>();
		search.search.and.returnValue(pending);
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		f.detectChanges();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.text = 'new';
		f.componentInstance.filtersChanged();
		search.search.and.returnValue(of({ entries: [{ uid: 'new', title: 'New' }] }));
		tick(300);
		f.detectChanges();
		tick();
		expect(search.search.calls.mostRecent().args[2].text).toBe('new');
		pending.next({ entries: [{ uid: 'obsolete' }] });
		expect(f.componentInstance.rows().map((row) => row.uid)).toEqual(['new']);
		expect(router).not.toHaveBeenCalled();
		f.destroy();
	}));
	it('cancels scheduled assets searches on manual submit, history navigation, toggle-off and destruction', fakeAsync(() => {
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', urlMode(REPOSITORY_SEARCH.assets));
		f.detectChanges();
		tick();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		const component = f.componentInstance;
		component.text = 'manual';
		component.filtersChanged();
		void component.submit();
		tick(400);
		expect(router).toHaveBeenCalledTimes(1);
		component.text = 'discard';
		component.filtersChanged();
		query.next(convertToParamMap({ q: 'history' }));
		f.detectChanges();
		tick(400);
		expect(component.text).toBe('history');
		expect(router).toHaveBeenCalledTimes(1);
		component.text = 'toggle-off';
		component.filtersChanged();
		component.setAutoSearch(false);
		tick(400);
		expect(router).toHaveBeenCalledTimes(1);
		component.setAutoSearch(true);
		f.destroy();
		tick(400);
		expect(router).toHaveBeenCalledTimes(1);
	}));
	it('saves the manual assets draft and clears saved-search selection on placeholder and Reset', async () => {
		search.saveSavedSearch.and.returnValue(of({ id: 'saved', title: 'Draft', params: {} }));
		const f = await render('assets');
		const component = f.componentInstance;
		component.setAutoSearch(false);
		component.text = 'draft';
		component.toggleFacet('system_primaryType_agg', 'Picture');
		component.savedSearchTitle = 'Draft';
		await component.saveSearch();
		expect(search.saveSavedSearch).toHaveBeenCalledWith(
			REPOSITORY_SEARCH.assets,
			'Draft',
			jasmine.objectContaining({ text: 'draft', facets: { system_primaryType_agg: ['Picture'] } }),
		);
		expect(component.selectedSavedSearch).toBe('saved');
		spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		await component.loadSavedSearch('');
		expect(component.selectedSavedSearch).toBe('');
		expect(component.text).toBe('');
		expect(component.facets).toEqual({});
		component.selectedSavedSearch = 'saved';
		component.text = 'reset this draft';
		component.reset();
		expect(component.selectedSavedSearch).toBe('');
		expect(component.text).toBe('');
		expect(component.facets).toEqual({});
	});
	it('does not restore a previous user’s saved searches after sign-out and cancels their pending auto-search', fakeAsync(() => {
		const pending = new Subject<any>();
		search.savedSearches.and.returnValue(pending);
		const f = TestBed.createComponent(RepositorySearchComponent);
		f.componentRef.setInput('context', context);
		f.componentRef.setInput('definition', REPOSITORY_SEARCH.assets);
		f.detectChanges();
		tick();
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		f.componentInstance.text = 'private draft';
		f.componentInstance.filtersChanged();
		f.componentInstance.openSaveSearch();
		f.componentRef.setInput('context', { ...context, user: null });
		f.detectChanges();
		pending.next({ entries: [{ id: 'old-user', title: 'Private', params: {} }] });
		pending.complete();
		tick(400);
		expect(f.componentInstance.savedSearches()).toEqual([]);
		expect(f.componentInstance.saveDialog()).toBeFalse();
		expect(router).not.toHaveBeenCalled();
		f.destroy();
	}));
	it('keeps assets scroll paging off by default while Load more remains available', async () => {
		search.search.and.returnValues(
			of({ entries: [{ uid: 'first' }], isNextPageAvailable: true }),
			of({ entries: [{ uid: 'last' }], isNextPageAvailable: false }),
		);
		const f = await render('assets');
		const viewport = f.nativeElement.querySelector('.search-results-panel') as HTMLElement;
		expect(viewport).not.toBeNull();
		Object.defineProperties(viewport, {
			clientHeight: { value: 400 },
			scrollHeight: { value: 1000 },
			scrollTop: { value: 600 },
		});
		viewport.dispatchEvent(new Event('scroll'));
		expect(search.search).toHaveBeenCalledTimes(1);
		const loadMore = Array.from(f.nativeElement.querySelectorAll('button')).find(
			(button) => (button as HTMLButtonElement).textContent?.trim() === 'Load more',
		) as HTMLButtonElement;
		expect(loadMore).toBeDefined();
		loadMore.click();
		await f.whenStable();
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(f.componentInstance.rows().map((row) => row.uid)).toEqual(['first', 'last']);
	});
	it('loads the next assets page near the scroll bottom only while opted in and suppresses duplicate inflight loads', async () => {
		search.search.and.returnValue(of({ entries: [{ uid: 'first' }], isNextPageAvailable: true }));
		const f = await render('assets');
		const settings = TestBed.inject(ResultsPagingSettings);
		settings.apply({ scrollPagingEnabled: true });
		const viewport = document.createElement('div');
		Object.defineProperties(viewport, {
			clientHeight: { value: 400 },
			scrollHeight: { value: 1000 },
			scrollTop: { value: 0, writable: true },
		});
		const event = { currentTarget: viewport } as unknown as Event;
		f.componentInstance.text = 'unapplied';
		f.componentInstance.onResultsScroll(event);
		expect(search.search).toHaveBeenCalledTimes(1);
		const pending = new Subject<any>();
		search.search.and.returnValue(pending);
		viewport.scrollTop = 500;
		settings.apply({ scrollPagingEnabled: false });
		f.componentInstance.onResultsScroll(event);
		expect(search.search).toHaveBeenCalledTimes(1);
		settings.apply({ scrollPagingEnabled: true });
		f.componentInstance.onResultsScroll(event);
		f.componentInstance.onResultsScroll(event);
		expect(search.search).toHaveBeenCalledTimes(2);
		expect(search.search.calls.mostRecent().args[3]).toBe(1);
		expect(search.search.calls.mostRecent().args[2].text).toBe('');
		pending.next({ entries: [{ uid: 'last' }], isNextPageAvailable: false });
		pending.complete();
		await f.whenStable();
		expect(f.componentInstance.rows().map((row) => row.uid)).toEqual(['first', 'last']);
	});
	it('opens assets normally, toggles tiles while a selection exists and ignores stale or loading tiles', async () => {
		const rows = [
			{ uid: 'one', title: 'One' },
			{ uid: 'two', title: 'Two' },
		];
		search.search.and.returnValue(of({ entries: rows, resultsCount: 2 }));
		const f = await render('assets');
		const router = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		f.componentInstance.activateAsset(rows[0]);
		expect(router).toHaveBeenCalledTimes(1);
		f.componentInstance.projectedSelectionChange(['one']);
		f.componentInstance.activateAsset(rows[1]);
		expect(f.componentInstance.selectedIds()).toEqual(['one', 'two']);
		f.componentInstance.activateAsset(rows[0]);
		expect(f.componentInstance.selectedIds()).toEqual(['two']);
		f.componentInstance.loading.set(true);
		f.componentInstance.activateAsset(rows[1]);
		f.componentInstance.loading.set(false);
		f.componentInstance.activateAsset({ uid: 'stale' });
		expect(f.componentInstance.selectedIds()).toEqual(['two']);
		expect(router).toHaveBeenCalledTimes(1);
	});
	it('persists optional assets columns without affecting another repository and preserves usable table columns', async () => {
		const first = await render('assets');
		expect(first.componentInstance.columnVisible('subjects')).toBeFalse();
		first.componentInstance.toggleColumn('subjects');
		expect(first.componentInstance.columnVisible('subjects')).toBeTrue();
		first.componentInstance.columnLayoutChanged([{ id: 'subjects', width: 220 }]);
		first.destroy();
		const restored = await render('assets');
		expect(restored.componentInstance.columnVisible('subjects')).toBeTrue();
		expect(restored.componentInstance.resultColumns()[0]).toEqual(
			jasmine.objectContaining({ id: 'subjects', width: 220 }),
		);
		const other = await render('assets', { ...context, document: { repository: 'other' } });
		expect(other.componentInstance.columnVisible('subjects')).toBeFalse();
		for (const column of other.componentInstance.columnChoices())
			if (other.componentInstance.columnVisible(column.id))
				other.componentInstance.toggleColumn(column.id);
		expect(other.componentInstance.resultColumns().filter((column) => !column.hidden).length).toBe(
			1,
		);
	});
	it('keeps the column dialog open through changes and resets only this search column preferences', async () => {
		const f = await render('assets');
		document.body.append(f.nativeElement);
		f.componentInstance.setDisplayMode('table');
		f.detectChanges();
		await f.whenStable();
		f.detectChanges();
		const requested = search.search.calls.count();
		writeSearchView('assets', 'admin', 'other', {
			displayMode: 'grid',
			columns: { subjects: true },
		});
		const trigger: HTMLButtonElement = f.nativeElement.querySelector(
			'.nx-results-projection__settings-button',
		);
		trigger.click();
		f.detectChanges();
		const dialog: HTMLDialogElement = f.nativeElement.querySelector(
			'nx-search-column-chooser dialog',
		);
		expect(dialog.open).toBeTrue();
		const choice = [...dialog.querySelectorAll('label')].find(
			(label) => label.textContent?.trim() === 'Subjects',
		)!;
		choice.querySelector('input')!.click();
		f.detectChanges();
		expect(dialog.open).toBeTrue();
		expect(f.componentInstance.columnVisible('subjects')).toBeTrue();
		f.componentInstance.columnLayoutChanged([{ id: 'subjects', width: 220 }]);
		dialog.querySelector<HTMLButtonElement>('.search-column-chooser__reset')!.click();
		f.detectChanges();
		expect(dialog.open).toBeTrue();
		expect(f.componentInstance.columnVisible('subjects')).toBeFalse();
		expect(f.componentInstance.resultColumns().map((column) => column.id)).toEqual(
			REPOSITORY_SEARCH.assets.views.table!.columns.map((column) => column.id),
		);
		expect(f.componentInstance.columnLayout()).toEqual([]);
		expect(f.componentInstance.displayMode()).toBe('table');
		expect(readSearchView('assets', 'admin', 'default')).toEqual(
			jasmine.objectContaining({ displayMode: 'table', columns: {}, columnLayout: [] }),
		);
		expect(readSearchView('assets', 'admin', 'other')).toEqual(
			jasmine.objectContaining({ displayMode: 'grid', columns: { subjects: true } }),
		);
		dialog.querySelector<HTMLButtonElement>('.search-column-chooser__close')!.click();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(dialog.open).toBeFalse();
		// The column changes rebuilt the grid header: focus returns to the gear that exists now,
		// once the rebuilt header has rendered.
		const gear = () => f.nativeElement.querySelector('.nx-results-projection__settings-button');
		for (let attempt = 0; attempt < 50 && document.activeElement !== gear(); attempt++)
			await new Promise((resolve) => setTimeout(resolve, 20));
		expect(document.activeElement).toBe(gear());
		expect(search.search.calls.count()).toBe(requested);
	});
	it('opens the assets queue with an applied snapshot, leaving unsubmitted filters out', async () => {
		const f = await render('assets');
		f.componentInstance.text = 'applied';
		await f.componentInstance.submit();
		f.detectChanges();
		await f.whenStable();
		f.componentInstance.text = 'draft';
		f.componentInstance.openQueue();
		expect(assetsQueue.open).toHaveBeenCalledWith(
			'admin',
			'default',
			jasmine.objectContaining({ text: 'applied' }),
			TestBed.inject(Router).url,
			{ autoSearch: true, selectedSavedSearch: '' },
			'assets',
		);
		f.componentInstance.loading.set(true);
		f.componentInstance.openQueue();
		expect(assetsQueue.open).toHaveBeenCalledTimes(1);
	});
	it('restores manual search and saved-search selection once after returning from the assets queue', async () => {
		const first = await render('assets');
		first.componentInstance.setAutoSearch(false);
		first.componentInstance.selectedSavedSearch = 'saved-picture-search';
		first.componentInstance.openQueue();
		const viewState = assetsQueue.open.calls.mostRecent().args[4]!;
		expect(viewState).toEqual({ autoSearch: false, selectedSavedSearch: 'saved-picture-search' });
		first.destroy();
		assetsQueue.consumeViewState.and.returnValue(viewState);
		const returned = await render('assets');
		expect(assetsQueue.consumeViewState).toHaveBeenCalledWith(
			'admin',
			'default',
			TestBed.inject(Router).url,
		);
		expect(returned.componentInstance.autoSearch()).toBeFalse();
		expect(returned.componentInstance.selectedSavedSearch).toBe('saved-picture-search');
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		returned.componentInstance.text = 'unsubmitted after return';
		returned.componentInstance.filtersChanged();
		await returned.whenStable();
		expect(router).not.toHaveBeenCalled();
		returned.destroy();
		assetsQueue.consumeViewState.and.returnValue(undefined);
		const fresh = await render('assets');
		expect(fresh.componentInstance.autoSearch()).toBeTrue();
		expect(fresh.componentInstance.selectedSavedSearch).toBe('');
	});
	it('keeps long asset facets collapsed initially and can reveal choices beyond the first eight without submitting', async () => {
		search.search.and.returnValue(
			of({
				entries: [],
				aggregations: {
					system_mimetype_agg: {
						buckets: Array.from({ length: 10 }, (_, index) => ({
							key: `format-${index}`,
							docCount: index,
						})),
					},
				},
			}),
		);
		const f = await render('assets');
		const component = f.componentInstance;
		const router = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(false);
		expect(component.facetExpanded('system_mimetype_agg')).toBeFalse();
		component.toggleFacetExpanded('system_mimetype_agg');
		expect(component.assetBuckets('system_mimetype_agg').length).toBe(8);
		expect(component.hasExtraBuckets('system_mimetype_agg')).toBeTrue();
		component.toggleFacetShowAll('system_mimetype_agg');
		expect(component.assetBuckets('system_mimetype_agg').length).toBe(10);
		component.toggleFacetExpanded('system_mimetype_agg');
		component.toggleFacetExpanded('system_mimetype_agg');
		expect(component.assetBuckets('system_mimetype_agg').length).toBe(10);
		expect(router).not.toHaveBeenCalled();
	});

	it('renders localized stock quick-filter labels while retaining literal provider IDs and custom names', async () => {
		search.search.and.returnValue(
			of({
				entries: [],
				resultsCount: 0,
				quickFilters: [
					'noFolder',
					'mostRecent',
					'onlyValidated',
					'approved',
					'Customer Filter',
				].map((name) => ({ name, active: false })),
			}),
		);
		const fixture = await render('assets'),
			component = fixture.componentInstance;
		expect(
			component.quickFilterOptions().map((filter) => component.quickFilterLabel(filter.name)),
		).toEqual(['No Containers', 'Most Recent', 'Validated', 'Approved', 'Customer Filter']);
		expect(fixture.nativeElement.querySelector('.results-toolbar').textContent).toContain(
			'No Containers',
		);
		TestBed.inject(WebUiMessages).register('quick-filter-label-test', {
			es: await loadWebUiCatalog('es'),
		});
		TestBed.inject(WebUiLocale).setLocale('es');
		fixture.detectChanges();
		expect(component.quickFilterLabel('noFolder')).toBe('Sin contenedores');
		expect(component.quickFilterLabel('mostRecent')).toBe('Más Reciente');
		expect(component.quickFilterLabel('onlyValidated')).toBe('Validado');
		expect(component.quickFilterLabel('Customer Filter')).toBe('Customer Filter');
		expect(component.quickFilterOptions().map((filter) => filter.name)).toEqual([
			'noFolder',
			'mostRecent',
			'onlyValidated',
			'approved',
			'Customer Filter',
		]);
	});
	it('translates built-in facet labels without translating customer bucket IDs and follows the active locale', async () => {
		TestBed.inject(WebUiMessages).register('repository-locale-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.locale.set('es');
		search.search.and.returnValue(
			of({
				entries: [],
				aggregations: {
					dc_creator_agg: { buckets: [{ key: 'lastWeek', docCount: 1 }] },
					common_size_agg: { buckets: [{ key: 'tiny', docCount: 1 }] },
				},
			}),
		);
		const f = await render('trash');
		const form = await drawerForm(f);
		(form.nativeElement.querySelector('.asset-facet__toggle') as HTMLButtonElement).click();
		refresh(form);
		const options = () => {
			refresh(form);
			return Array.from(form.nativeElement.querySelectorAll('.asset-facet__options label')).map(
				(option: any) => option.textContent.replace(/\s+/g, ' ').trim(),
			);
		};
		// Size buckets are built-in (translated); customer author IDs stay literal.
		const spanishSize = options()[0];
		expect(spanishSize).toMatch(/ \(1\)$/);
		expect(spanishSize).not.toContain('tiny');
		expect(f.componentInstance.buckets('dc_creator_agg').map((bucket) => bucket.label)).toContain(
			'lastWeek',
		);
		expect(f.componentInstance.labels['dc_creator_agg']).toBe('Autores');
		expect(f.componentInstance.formatBytes(1.5 * 1024 ** 2)).toBe('1,5 MB');
		const spanishDate = f.componentInstance.formatModified('2026-09-16T12:00:00Z');
		locale.locale.set('ar');
		f.detectChanges();
		expect(options()[0]).not.toBe(spanishSize);
		expect(f.componentInstance.buckets('dc_creator_agg').map((bucket) => bucket.label)).toContain(
			'lastWeek',
		);
		expect(f.componentInstance.labels['dc_creator_agg']).not.toBe('Autores');
		expect(f.componentInstance.formatBytes(1.5 * 1024 ** 2)).toBe(
			new Intl.NumberFormat('ar', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
				1.5,
			) + ' MB',
		);
		expect(f.componentInstance.formatModified('2026-09-16T12:00:00Z')).not.toBe(spanishDate);
		expect(f.componentInstance.formatModified('Customer {date}')).toBe('Customer {date}');
	});
	it('retains localized toolbar errors in default results and leaves external errors literal', () => {
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: new Subject<void>(),
				pageProviderChanged$: new Subject<void>(),
				loadMore: () => of({ entries: [], resultsCount: 0 }),
				getCurrentQueryScope: () => undefined,
				getCurrentQueryToken: () => 0,
			},
		});
		const component = TestBed.createComponent(DefaultSearchResultsComponent).componentInstance;
		TestBed.inject(WebUiMessages).register('toolbar-test', {
			es: { 'test.failure': 'No se puede abrir {name}' },
			ar: { 'test.failure': 'تعذر فتح {name}' },
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		component
			.toolbarContext()
			.reportMessage?.('test.failure', 'Cannot open {name}', { name: 'Customer {name}' });
		expect(component.error()).toBe('No se puede abrir Customer {name}');
		locale.setLocale('ar');
		expect(component.error()).toBe('تعذر فتح Customer {name}');
		component.toolbarContext().reportError('test.failure');
		expect(component.error()).toBe('test.failure');
		expect(component.toolbarContext().columns?.map((column) => column.field)).toEqual([
			'dc:title',
			'dc:modified',
			'dc:lastContributor',
		]);
	});
	it('rejects relative trash paths locally and keeps validation reactive without changing the draft', async () => {
		const f = await render('trash');
		const component = f.componentInstance;
		const key = 'app.state.enter-an-absolute-repository-path-d6ebeb';
		TestBed.inject(WebUiMessages).register('path-test', {
			es: { [key]: 'Introduzca una ruta absoluta.' },
			ar: { [key]: 'أدخل مسارًا مطلقًا.' },
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		search.search.calls.reset();
		component.path = 'Customer/{path}';
		await component.submit();
		expect(search.search).not.toHaveBeenCalled();
		expect(component.path).toBe('Customer/{path}');
		expect(component.error()).toBe('Introduzca una ruta absoluta.');
		locale.setLocale('ar');
		expect(component.error()).toBe('أدخل مسارًا مطلقًا.');
	});

	it('follows favorites changes made anywhere on the result stars, as stock removed-from-favorites', async () => {
		const { FavoriteChanges } =
			await import('app/modules/explorer/helpers/favorite-changes.service');
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				saveAsOpen: { set: () => undefined },
				searchParameters: {},
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: new Subject<void>(),
				pageProviderChanged$: new Subject<void>(),
				loadMore: () => of({ entries: [], resultsCount: 0 }),
				getCurrentQueryScope: () => undefined,
				getCurrentQueryToken: () => 0,
			},
		});
		const changes = TestBed.inject(FavoriteChanges).changes$;
		const rows = [
			{ uid: 'a', title: 'A', contextParameters: { favorites: { isFavorite: true } } },
			{ uid: 'b', title: 'B', contextParameters: {} },
		];
		const resultsFixture = TestBed.createComponent(DefaultSearchResultsComponent);
		resultsFixture.detectChanges();
		await resultsFixture.whenStable();
		const results = resultsFixture.componentInstance;
		const expiredFixture = await render('expired');
		await expiredFixture.whenStable();
		const expired = expiredFixture.componentInstance;
		results.rows.set(rows);
		expired.rows.set(rows as any);
		// Removed in the Favorites drawer: the star turns back to an outline.
		changes.next({ documentUids: ['a'], favorite: false, repository: 'default' });
		changes.next({ documentUids: ['b'], favorite: true });
		for (const view of [results, expired] as any[]) {
			expect(
				view.rows().map((row: any) => row.contextParameters?.favorites?.isFavorite === true),
			).toEqual([false, true]);
		}
		const untouched = results.rows();
		changes.next({ documentUids: ['elsewhere'], favorite: true });
		expect(results.rows()).toBe(untouched);
	});
	it('evaluates default search result columns, quick filters, save-as action, and SearchSelectionActions commands', async () => {
		const { SearchSelectionActions } =
			await import('../../helpers/search-selection-actions.service');
		const saveAsOpen = { set: jasmine.createSpy('set') } as any;
		TestBed.overrideProvider(DocumentSearchService, {
			useValue: {
				saveAsOpen,
				searchParameters: {},
				searchPaneVisibility: () => true,
				currentPageProviderKey: 'default_search',
				searchParametersChanged$: new Subject<void>(),
				pageProviderChanged$: new Subject<void>(),
				loadMore: () => of({ entries: [], resultsCount: 0 }),
				getCurrentQueryScope: () => undefined,
				getCurrentQueryToken: () => 0,
			},
		});
		const defComp = TestBed.createComponent(DefaultSearchResultsComponent).componentInstance;
		defComp.openSaveAs();
		expect(saveAsOpen.set).toHaveBeenCalledWith(true);
		defComp.toggleQuickFilter('noFolder');
		expect(defComp.quickFilters()['noFolder']).toBeTrue();
		expect(defComp.quickFilterLabel('noFolder')).toBe('No Containers');
		expect(defComp.quickFilterLabel('customFilter')).toBe('customFilter');
		expect(defComp.quickFilterKeys()).toEqual(['noFolder']);
		expect(defComp.statePresentation({ state: 'project' }).fallback).toBeTruthy();
		defComp.columnLayoutChanged([{ id: 'title', width: 220 }]);
		expect(defComp.columnLayout().length).toBe(1);

		const sampleRow = {
			uid: 'row-1',
			title: 'Doc 1',
			type: 'File',
			path: '/Workspace/Doc 1',
			state: 'project',
			versionLabel: '1.0',
			isRecord: true,
			hasLegalHold: true,
			facets: ['ColdStorage'],
			contextParameters: { favorites: { isFavorite: true } },
			properties: {
				'dc:modified': '2026-10-01',
				'dc:lastContributor': 'Alice',
				'dc:created': '2026-09-01',
				'dc:creator': { properties: { firstName: 'Alice', lastName: 'Smith' } },
				'dc:nature': { id: 'report', label: 'Report' },
				'dc:coverage': { id: 'europe', properties: { label: 'Europe' } },
				'dc:subjects': [{ id: 'art', label: 'Art' }],
				'coldstorage:coldContent': { data: '/cold' },
			},
		};
		const byId = Object.fromEntries(defComp.resultColumns().map((col: any) => [col.id, col]));
		expect(byId['title'].value(sampleRow)).toBe('Doc 1');
		expect(byId['lastContributor'].value(sampleRow)).toBe('Alice');
		expect(byId['nature'].value(sampleRow)).toBe('Report');
		expect(byId['coverage'].value(sampleRow)).toBe('Europe');
		expect(byId['subjects'].value(sampleRow)).toBe('Art');
		for (const col of defComp.resultColumns()) {
			if (col.value) expect(col.value(sampleRow)).toBeDefined();
			else expect(defComp.definition().views.table?.cells?.[col.id]).toBeDefined();
		}

		// Also evaluate RepositorySearchComponent ASSET_RESULT_COLUMNS and NXQL_RESULT_COLUMNS
		const repoFixture = await render('assets');
		const assetById = Object.fromEntries(
			repoFixture.componentInstance.resultColumns().map((col) => [col.id, col]),
		);
		expect(assetById['title'].value?.(sampleRow)).toBe('Doc 1');
		for (const col of repoFixture.componentInstance.resultColumns()) {
			expect(col.value?.(sampleRow)).toBeDefined();
		}

		// Exercise SearchSelectionActions clipboard, compare, and trash commands
		const actions = TestBed.inject(SearchSelectionActions);
		const navSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		const ctx: any = {
			busy: false,
			availableCommands: ['clipboard', 'compare', 'trash'],
			selectedDocuments: [{ uid: 'd1' }, { uid: 'd2' }],
			document: { repository: 'default' },
			setBusy: jasmine.createSpy('setBusy'),
		};
		await actions.execute('clipboard', ctx, () => true);
		await actions.execute('compare', ctx, () => true);
		expect(navSpy).toHaveBeenCalledWith(
			['/page/compare'],
			jasmine.objectContaining({
				queryParams: jasmine.objectContaining({ left: 'd2', right: 'd1' }),
			}),
		);
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(true);
		const { DocumentTrashService } =
			await import('../../../explorer/helpers/document-trash.service');
		const trashService = TestBed.inject(DocumentTrashService);
		spyOn(trashService, 'moveDocumentsToTrash').and.returnValue(of([]));
		const trashed = await actions.execute('trash', ctx, () => true);
		expect(trashed).toEqual(['d1', 'd2']);
	});
});
