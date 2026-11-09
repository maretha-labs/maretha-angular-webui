import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { LayoutService } from '../../explorer/helpers/layout.service';

import {
	DocumentSearchService,
	isDefaultSearchUrl,
	savedSearchParameters,
} from './document-search.service';

describe('DocumentSearchService', () => {
	let service: DocumentSearchService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentSearchService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('sends only an explicit sort for an immutable applied-query request (stock parity)', () => {
		const http = TestBed.inject(HttpTestingController);
		const layout = TestBed.inject(LayoutService);
		// The browse layout sort must not leak into search requests.
		layout.sortFields = ['dc:title'];
		layout.sortAscending = true;
		service
			.loadAppliedQuery(
				{
					repository: 'default',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: { quickFilters: 'NoContainers' },
				},
				0,
				undefined,
				['dc:modified'],
				false,
			)
			.subscribe();
		const request = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/default_search/execute'),
		);
		expect(request.request.urlWithParams).toContain('quickFilters=NoContainers');
		expect(request.request.urlWithParams).toContain('sortBy=dc%3Amodified');
		expect(request.request.urlWithParams).toContain('sortOrder=desc');
		request.flush({ entries: [] });
	});

	it('captures result order and page size for a queue snapshot', () => {
		const http = TestBed.inject(HttpTestingController);
		const layout = TestBed.inject(LayoutService);
		(layout as any).pageSize = 25;
		layout.sortFields = ['dc:title'];
		layout.sortAscending = true;
		// The snapshot carries the order the results page actually applied, never the browse default.
		(service as any)._appliedView = {
			pageSize: 25,
			sortFields: ['dc:created'],
			sortAscending: false,
		};
		(service as any)._appliedQuery = {
			providerName: 'default_search',
			queryParams: [],
			namedParameters: {},
		};
		(service as any)._appliedQueryToken = 4;
		const snapshot = service.getAppliedQuerySnapshot();
		(layout as any).pageSize = 100;
		layout.sortFields = ['dc:title'];
		layout.sortAscending = true;
		service
			.loadAppliedQuery(
				snapshot!.scope,
				1,
				snapshot!.pageSize,
				snapshot!.sortFields,
				snapshot!.sortAscending,
			)
			.subscribe();
		const request = http.expectOne((candidate) => candidate.url.includes('currentPageIndex=1'));
		expect(request.request.urlWithParams).toContain('pageSize=25');
		expect(request.request.urlWithParams).toContain('sortBy=dc%3Acreated');
		expect(request.request.urlWithParams).toContain('sortOrder=desc');
		request.flush({ entries: [] });
	});

	it('does not send cleared range filters while preserving an applied range', () => {
		const http = TestBed.inject(HttpTestingController);
		(service as any)._currentPageProviderKey = 'default_search';
		(service as any)._pageProviders = {
			default_search: {
				key: 'default_search',
				enabled: true,
				userSelectable: true,
				fields: {},
				aggregations: {},
				quickFilters: {},
			},
		};
		service.searchParameters = {
			searchFields: { ecm_fulltext: 'invoice' },
			customFilters: { cleared: [], created: ['this-month'] } as any,
			quickFilters: { nofolder: false },
		};
		service.loadMore().subscribe();
		const request = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/default_search/execute'),
		);
		expect(request.request.urlWithParams).toContain('ecm_fulltext=invoice');
		expect(request.request.urlWithParams).toContain('created=%5B%22this-month%22%5D');
		expect(request.request.urlWithParams).not.toContain('cleared=');
		expect(request.request.urlWithParams).not.toContain('quickFilters=');
		request.flush({ entries: [], aggregations: {} });
		service.showSearchPaneVisibility();
		service.loadMore(0, 40, ['dc:title'], false, true).subscribe();
		http
			.expectOne((candidate) => candidate.url.includes('/search/pp/default_search/execute'))
			.flush({ entries: [], aggregations: {} });
		const snapshot = service.getAppliedQuerySnapshot();
		expect(snapshot?.pageSize).toBe(40);
		expect(snapshot?.sortFields).toEqual(['dc:title']);
		expect(snapshot?.sortAscending).toBeFalse();
	});

	it('normalizes full text and serializes selected collections and tags as page-provider arrays', () => {
		const http = TestBed.inject(HttpTestingController);
		(service as any)._currentPageProviderKey = 'default_search';
		(service as any)._pageProviders = {
			default_search: {
				key: 'default_search',
				enabled: true,
				userSelectable: true,
				fields: {},
				aggregations: {},
				quickFilters: {},
			},
		};
		service.searchParameters = {
			searchFields: {
				ecm_fulltext: 'release-notes',
				ecm_collections: ['collection-1'],
				ecm_tags: ['roadmap'],
			},
		};
		service.loadMore().subscribe();
		const request = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/default_search/execute'),
		);
		expect(request.request.urlWithParams).toContain('ecm_fulltext=release%20notes');
		expect(request.request.urlWithParams).toContain('ecm_collections=%5B%22collection-1%22%5D');
		expect(request.request.urlWithParams).toContain('ecm_tags=%5B%22roadmap%22%5D');
		expect(request.request.urlWithParams).toContain('highlight=');
		request.flush({ entries: [], aggregations: {}, quickFilters: [] });
	});

	it('selects a provider without a request; the drawer fetches facets unless a results view is attached', () => {
		const http = TestBed.inject(HttpTestingController);
		const provider = (key: string) => ({
			key,
			enabled: true,
			userSelectable: true,
			fields: {},
			aggregations: {},
			quickFilters: {},
		});
		(service as any)._pageProviders = {
			default_search: provider('default_search'),
			custom_search: provider('custom_search'),
		};
		const facets =
			(key = 'default_search') =>
			(candidate: any) =>
				candidate.url.includes(`/search/pp/${key}/execute`);
		const changes: string[] = [];
		service.pageProviderChanged$.subscribe((x) => changes.push(x.key));
		let selected: unknown;
		service.useSearchProvider('default_search').subscribe((value) => (selected = value));
		expect(selected).toBe(service.pageProviders['default_search']);
		expect(changes).toEqual(['default_search']);
		http.expectNone(facets());

		service.showSearchPaneVisibility();
		service.loadFilters().subscribe();
		const request = http.expectOne(facets());
		expect(request.request.urlWithParams).toContain('currentPageIndex=0&pageSize=1');
		request.flush({ entries: [], aggregations: {}, quickFilters: [] });
		// Every opening asks again, as stock does.
		service.loadFilters().subscribe();
		http.expectOne(facets()).flush({ entries: [], aggregations: {}, quickFilters: [] });

		const detach = service.attachResultsHost();
		service.useSearchProvider('custom_search').subscribe();
		expect(changes).toEqual(['default_search', 'custom_search']);
		service.loadFilters().subscribe();
		http.expectNone(facets('custom_search'));
		detach();
		detach();
		service.loadFilters().subscribe();
		http.expectOne(facets('custom_search')).flush({ entries: [], aggregations: {} });
	});

	it('publishes parameter changes as events only and applies saved searches as parameters', () => {
		(service as any)._currentPageProviderKey = 'default_search';
		(service as any)._pageProviders = {
			default_search: {
				key: 'default_search',
				enabled: true,
				userSelectable: true,
				fields: {},
				aggregations: {},
				quickFilters: {},
			},
		};
		const published: unknown[] = [];
		service.searchParametersChanged$.subscribe((x) => published.push(x));
		expect(published).toEqual([]);
		service.applySavedSearch(
			{
				id: 'saved',
				title: 'Saved',
				params: {
					local: true,
					ecm_fulltext: 'invoice',
					dc_creator_agg: ['bob'],
					empty_agg: [],
					quickFilters: 'noFolder,mostRecent',
				},
			},
			'/default-domain',
		);
		expect(service.selectedSavedSearch()?.id).toBe('saved');
		expect(published).toEqual([
			{
				location: '/default-domain',
				searchFields: { ecm_fulltext: 'invoice' },
				customFilters: { dc_creator_agg: ['bob'] },
				quickFilters: { noFolder: true, mostRecent: true },
			},
		]);
		service.applySavedSearch(undefined);
		expect(service.selectedSavedSearch()).toBeUndefined();
		expect(published.length).toBe(2);
		expect(published[1]).toEqual({});
		// A later subscriber gets no replay: it reads `searchParameters` instead.
		const late: unknown[] = [];
		service.searchParametersChanged$.subscribe((x) => late.push(x));
		expect(late).toEqual([]);
		expect(service.searchParameters).toEqual({});
	});

	it('reads one saved search by id and applies the current query without a request', () => {
		const http = TestBed.inject(HttpTestingController);
		let saved: any;
		service.getSavedSearch('abc/def').subscribe((x) => (saved = x));
		http
			.expectOne((candidate) => candidate.url.endsWith('/search/saved/abc%2Fdef'))
			.flush({ id: 'abc/def', title: 'T', params: { a: 1 }, query: 'q' });
		expect(saved).toEqual({ id: 'abc/def', title: 'T', params: { a: 1 }, query: 'q' });
		expect(service.applyCurrentQuery()).toBeFalse();
		(service as any)._currentPageProviderKey = 'default_search';
		(service as any)._pageProviders = {
			default_search: {
				key: 'default_search',
				enabled: true,
				userSelectable: true,
				fields: {},
				aggregations: {},
				quickFilters: {},
			},
		};
		service.searchParameters = { quickFilters: { noFolder: true } };
		expect(
			service.applyCurrentQuery({ pageSize: 25, sortFields: ['dc:title'], sortAscending: false }),
		).toBeTrue();
		const snapshot = service.getAppliedQuerySnapshot();
		expect(snapshot?.scope.namedParameters['quickFilters']).toBe('noFolder');
		expect(snapshot?.pageSize).toBe(25);
		http.expectNone((candidate) => candidate.url.includes('/search/pp/'));
	});

	it('loads selectable collections through the reference automation operation', () => {
		const http = TestBed.inject(HttpTestingController);
		let collections: unknown;
		service.getUserCollections().subscribe((result) => (collections = result));
		const request = http.expectOne((candidate) =>
			candidate.url.endsWith('/api/v1/automation/User.GetCollections'),
		);
		expect(request.request.method).toBe('POST');
		expect(request.request.body).toEqual({ params: { searchTerm: '' }, context: {} });
		request.flush({ entries: [{ uid: 'collection-1', title: 'Contracts' }] });
		expect(collections).toEqual([{ uid: 'collection-1', title: 'Contracts' }]);
	});
});

describe('DocumentSearchService query scopes, saved searches and facets', () => {
	let service: DocumentSearchService;
	let http: HttpTestingController;
	const provider = (key: string) => ({
		key,
		enabled: true,
		userSelectable: true,
		fields: {},
		aggregations: {},
		quickFilters: {},
	});
	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [...legacyTestProviders()] });
		service = TestBed.inject(DocumentSearchService);
		http = TestBed.inject(HttpTestingController);
		(service as any)._pageProviders = {
			default_search: provider('default_search'),
			nxql_search: provider('nxql_search'),
		};
	});
	afterEach(() => {
		// The authentication service reads the current user on construction.
		http.match((candidate) => candidate.url.endsWith('/me/'));
		http.verify();
	});

	it('recognizes the routed default search page', () => {
		expect(isDefaultSearchUrl('/search/default')).toBeTrue();
		expect(isDefaultSearchUrl('/search/default/saved-1?x=1#top')).toBeTrue();
		expect(isDefaultSearchUrl('/search/default/saved-1/extra')).toBeFalse();
		expect(isDefaultSearchUrl('/browse/default')).toBeFalse();
	});

	it('describes no scope without a provider, and an NXQL scope only once a query is typed', () => {
		expect(service.getCurrentQueryScope()).toBeUndefined();
		expect(service.getAppliedQueryScope()).toBeUndefined();
		let completed = false;
		service.loadMore().subscribe({ complete: () => (completed = true) });
		expect(completed).toBeTrue();
		service.useSearchProvider('nxql_search').subscribe();
		expect(service.getCurrentQueryScope()).toBeUndefined();
		service.loadMore().subscribe({ complete: () => (completed = true) });
		http.expectNone((candidate) => candidate.url.includes('/search/pp/'));
		expect(service.loadFilters()).toBeDefined();
		service.loadFilters().subscribe({ complete: () => (completed = true) });
		service.searchParameters = { queryParams: "SELECT * FROM Document WHERE dc:title = 'x'" };
		expect(service.getCurrentQueryScope('archive')).toEqual({
			repository: 'archive',
			providerName: 'nxql_search',
			queryParams: ["SELECT * FROM Document WHERE dc:title = 'x'"],
			namedParameters: {},
		});
		service.showSearchPaneVisibility();
		const token = service.getCurrentQueryToken();
		service.loadMore(0, -5).subscribe();
		const request = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/nxql_search/execute'),
		);
		expect(request.request.urlWithParams).toContain('queryParams=SELECT%20*');
		expect(request.request.urlWithParams).toContain(
			`pageSize=${TestBed.inject(LayoutService).pageSize}`,
		);
		request.flush({ entries: [], aggregations: { ignored: {} } });
		// An NXQL response never rewrites the provider's facets.
		expect(service.pageProviders['nxql_search'].aggregations).toEqual({});
		expect(service.getAppliedQueryToken()).toBe(token);
		expect(service.getAppliedQueryScope()?.providerName).toBe('nxql_search');
		expect(service.getAppliedQuerySnapshot()?.sortAscending).toBeTrue();
	});

	it('fills facets and quick filters from a response, including open-ended range buckets', () => {
		service.useSearchProvider('default_search').subscribe();
		service.searchParameters = { location: '/default-domain', searchFields: { ecm_fulltext: '' } };
		const updated: string[] = [];
		service.pageProviderUpdated$.subscribe((key) => updated.push(key));
		service.loadMore().subscribe();
		const request = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/default_search/execute'),
		);
		expect(request.request.urlWithParams).toContain('ecm_path=%5B%22%2Fdefault-domain%22%5D');
		expect(request.request.urlWithParams).not.toContain('ecm_fulltext');
		request.flush({
			entries: [],
			aggregations: {
				dc_modified_agg: {
					type: 'date_range',
					field: 'dc:modified',
					selection: ['last_week'],
					extendedBuckets: [
						{ key: 'older', docCount: 0, from: '-Infinity', to: 'now-1M' },
						{ key: 'last_week', docCount: 4, from: 'now-7d', to: 'Infinity' },
					],
				},
				dc_creator_agg: { type: 'terms', field: 'dc:creator', selection: [] },
			},
			quickFilters: [
				{ name: 'noFolder', active: true },
				{ name: 'mostRecent', active: false },
			],
		});
		const aggregations = service.pageProviders['default_search'].aggregations;
		expect(aggregations['dc_modified_agg'].buckets.map((bucket) => bucket.disabled)).toEqual([
			true,
			false,
		]);
		expect(aggregations['dc_modified_agg'].buckets[1]).toEqual(
			jasmine.objectContaining({ key: 'last_week', docCount: 4, from: 'now-7d', to: 'Infinity' }),
		);
		expect(aggregations['dc_modified_agg'].selection).toEqual(['last_week']);
		expect(aggregations['dc_creator_agg'].buckets).toBeUndefined();
		expect(service.pageProviders['default_search'].quickFilters).toEqual({
			noFolder: true,
			mostRecent: false,
		});
		expect(updated).toEqual(['default_search']);
		// A response for a query that is no longer current leaves the facets alone.
		service.loadMore().subscribe();
		const stale = http.expectOne((candidate) =>
			candidate.url.includes('/search/pp/default_search/execute'),
		);
		service.searchParameters = { searchFields: { ecm_fulltext: 'changed' } };
		stale.flush({ entries: [], aggregations: {}, quickFilters: [] });
		expect(service.pageProviders['default_search'].quickFilters).toEqual({
			noFolder: true,
			mostRecent: false,
		});
		expect(updated.length).toBe(1);
		service.loadMore().subscribe();
		http
			.expectOne((candidate) => candidate.url.includes('/search/pp/default_search/execute'))
			.flush({ entries: [] });
		expect(service.pageProviders['default_search'].aggregations).toEqual({});
		expect(service.pageProviders['default_search'].quickFilters).toEqual({});
	});

	it('toggles the search pane and invalidates an applied query when the pane or the layout changes', () => {
		service.useSearchProvider('default_search').subscribe();
		const invalidations: number[] = [];
		service.appliedQueryInvalidated$.subscribe(() => invalidations.push(1));
		expect(service.searchPaneVisibility()).toBeFalse();
		service.toggleSearchPaneVisibility();
		expect(service.searchPaneVisibility()).toBeTrue();
		expect(invalidations.length).toBe(0);
		expect(service.applyCurrentQuery()).toBeTrue();
		expect(service.getAppliedQuerySnapshot()?.sortFields).toEqual([]);
		service.toggleSearchPaneVisibility();
		expect(service.searchPaneVisibility()).toBeFalse();
		expect(invalidations.length).toBe(1);
		expect(service.getAppliedQuerySnapshot()).toBeUndefined();
		service.applyCurrentQuery();
		// toObservable delivers the layout settings on the next effect flush.
		TestBed.inject(LayoutService).emitUpdateEvents();
		TestBed.tick();
		expect(invalidations.length).toBe(2);
		expect(service.getAppliedQuerySnapshot()).toBeUndefined();
		expect(service.useDefaultSearchProvider()).toBeDefined();
		let emitted = false;
		service.useDefaultSearchProvider().subscribe(() => (emitted = true));
		expect(emitted).toBeFalse();
		service.useTrashedDocumentsSearchProvider().subscribe(() => (emitted = true));
		expect(emitted).toBeFalse();
		expect(service.currentPageProviderKey).toBe('default_search');
	});

	it('saves, updates, lists, shares and deletes saved searches for the current provider', () => {
		service.useSearchProvider('default_search').subscribe();
		service.saveSearch('Invoices', { ecm_fulltext: 'invoice' }).subscribe();
		const save = http.expectOne((candidate) => candidate.url.endsWith('/search/saved'));
		expect(save.request.method).toBe('POST');
		expect(save.request.body).toEqual({
			'entity-type': 'savedSearch',
			pageProviderName: 'default_search',
			params: { ecm_fulltext: 'invoice' },
			title: 'Invoices',
		});
		save.flush({ id: 's1' });
		service.updateSavedSearch({ id: 's/1', title: 'Old', params: {} }, 'New', { a: 1 }).subscribe();
		const update = http.expectOne((candidate) => candidate.url.endsWith('/search/saved/s%2F1'));
		expect(update.request.method).toBe('PUT');
		expect(update.request.body.title).toBe('New');
		update.flush({ id: 's/1' });
		let listed: any[] = [];
		service.getSavedSearches().subscribe((value) => (listed = value));
		const list = http.expectOne((candidate) =>
			candidate.url.endsWith('/search/saved?pageProvider=default_search'),
		);
		list.flush({
			entries: [
				{ id: 'b', title: 'Zebra', query: 'q', params: {}, extra: true },
				{ id: 'a', title: 'Apple', params: {} },
			],
		});
		expect(listed).toEqual([
			{ id: 'a', title: 'Apple', query: undefined, params: {} },
			{ id: 'b', title: 'Zebra', query: 'q', params: {} },
		]);
		service.shareSavedSearch('s1', 'bob').subscribe();
		const share = http.expectOne((candidate) =>
			candidate.url.endsWith('/automation/Document.AddPermission'),
		);
		expect(share.request.body).toEqual({
			input: 's1',
			params: { username: 'bob', permission: 'Read', begin: null, end: null, notify: false },
		});
		share.flush({});
		service.getSavedSearchPermissions('s1').subscribe();
		const permissions = http.expectOne((candidate) => candidate.url.endsWith('/id/s1'));
		expect(permissions.request.headers.get('enrichers-document')).toBe('permissions');
		permissions.flush({});
		service.deleteSavedSearch('s1').subscribe();
		const remove = http.expectOne((candidate) => candidate.url.endsWith('/search/saved/s1'));
		expect(remove.request.method).toBe('DELETE');
		remove.flush(null);
	});

	it('accepts collection lists as arrays and drops entries without a usable id', () => {
		let collections: unknown;
		service.getUserCollections('con').subscribe((value) => (collections = value));
		const request = http.expectOne((candidate) => candidate.url.endsWith('/User.GetCollections'));
		expect(request.request.body.params.searchTerm).toBe('con');
		request.flush([{ uid: 'c1' }, null, 'text', { title: 'no id' }, { uid: 'c2', title: 'Named' }]);
		expect(collections).toEqual([
			{ uid: 'c1', title: 'c1' },
			{ uid: 'c2', title: 'Named' },
		]);
		service.getUserCollections().subscribe((value) => (collections = value));
		http.expectOne((candidate) => candidate.url.endsWith('/User.GetCollections')).flush({});
		expect(collections).toEqual([]);
	});

	it('maps saved-search parameters, ignoring a local scope without a location', () => {
		expect(savedSearchParameters({ id: 's', title: 'S', params: null })).toEqual({
			location: undefined,
			searchFields: {},
			customFilters: {},
			quickFilters: {},
		});
		expect(
			savedSearchParameters({
				id: 's',
				title: 'S',
				params: {
					local: true,
					quickFilters: null,
					dc_title: 'x',
					off: false,
					none: null,
					empty: '',
				},
			}),
		).toEqual({
			location: undefined,
			searchFields: { dc_title: 'x' },
			customFilters: {},
			quickFilters: {},
		});
	});
});
