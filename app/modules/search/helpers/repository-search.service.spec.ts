import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RepositorySearchService, DEFAULT_NXQL } from './repository-search.service';
import { REPOSITORY_SEARCH, defineSearch } from './repository-search-definitions';
describe('Repository search transport', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		}),
	);
	it('uses named providers, repository scope and only the supported aggregate filters', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		service
			.search(
				REPOSITORY_SEARCH.trash,
				'other repo',
				{
					text: 'example-document',
					path: '/a & b',
					nxql: 'ignored',
					expiredAt: '',
					facets: {
						dc_creator_agg: ['alice'],
						queryParams: ['untrusted'],
						common_size_agg: ['small'],
					},
					sortBy: 'dc:modified',
					sortOrder: 'desc',
				},
				2,
			)
			.subscribe();
		const req = http.expectOne((r) =>
			r.url.endsWith('/repo/other%20repo/search/pp/default_trash_search/execute'),
		);
		expect(req.request.params.get('ecm_path')).toBe('["/a & b"]');
		expect(req.request.params.get('dc_creator_agg')).toBe('["alice"]');
		expect(req.request.params.get('queryParams')).toBeNull();
		expect(req.request.params.get('currentPageIndex')).toBe('2');
		expect(req.request.params.get('pageSize')).toBe('40');
		expect(req.request.params.get('ecm_fulltext')).toBe('example document');
		expect(req.request.params.get('sortBy')).toBe('dc:modified');
		expect(req.request.params.get('sortOrder')).toBe('desc');
		req.flush({ entries: [] });
		http.verify();
	});
	it('uses the default-repository provider paths and kind-specific parameters and page sizes', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const criteria = {
			text: 'test',
			path: '/',
			nxql: DEFAULT_NXQL,
			expiredAt: '2026-09-15T00:00:00Z',
			facets: {},
		};
		service.search(REPOSITORY_SEARCH.expired, 'default', criteria, 1).subscribe();
		let req = http.expectOne((r) => r.url.endsWith('/api/v1/search/pp/expired_search/execute'));
		expect(req.request.params.get('expired_max')).toBe(criteria.expiredAt);
		expect(req.request.params.get('title')).toBe('test');
		expect(req.request.params.get('pageSize')).toBe('40');
		req.flush({ entries: [] });
		service.search(REPOSITORY_SEARCH.nxql, 'default', criteria).subscribe();
		req = http.expectOne((r) => r.url.endsWith('/api/v1/search/pp/nxql_search/execute'));
		expect(req.request.params.get('queryParams')).toBe(DEFAULT_NXQL);
		expect(req.request.params.get('ecm_fulltext')).toBeNull();
		expect(req.request.params.get('pageSize')).toBe('40');
		req.flush({ entries: [] });
		service.search(REPOSITORY_SEARCH.assets, 'default', criteria, 2).subscribe();
		req = http.expectOne((r) => r.url.endsWith('/api/v1/search/pp/assets_search/execute'));
		expect(req.request.params.get('ecm_fulltext')).toBe('test');
		expect(req.request.params.get('pageSize')).toBe('50');
		expect(req.request.params.get('offset')).toBe('100');
		req.flush({ entries: [] });
		http.verify();
	});
	it('sorts by the stock Author column and asks for vocabulary parents as stock drawer forms do', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const criteria = {
			text: '',
			path: '/',
			nxql: DEFAULT_NXQL,
			expiredAt: '',
			facets: {},
			sortBy: 'dc:creator',
			sortOrder: 'asc' as const,
		};
		service.search(REPOSITORY_SEARCH.trash, 'default', criteria).subscribe();
		let req = http.expectOne((r) => r.url.endsWith('/search/pp/default_trash_search/execute'));
		expect(req.request.params.get('sortBy')).toBe('dc:creator');
		expect(req.request.params.get('sortOrder')).toBe('asc');
		// nuxeo-search-form headers: properties are fetched and vocabulary parents resolved.
		expect(req.request.headers.get('fetch-document')).toBe('properties');
		expect(req.request.headers.get('fetch-directoryEntry')).toBe('parent');
		req.flush({ entries: [] });
		service
			.search(REPOSITORY_SEARCH.nxql, 'default', { ...criteria, sortBy: 'unknown' })
			.subscribe();
		req = http.expectOne((r) => r.url.endsWith('/search/pp/nxql_search/execute'));
		expect(req.request.params.get('sortBy')).toBeNull();
		// The NXQL page's nuxeo-results-view does not fetch vocabulary parents.
		expect(req.request.headers.get('fetch-document')).toBe('properties');
		expect(req.request.headers.has('fetch-directoryEntry')).toBeFalse();
		req.flush({ entries: [] });
		http.verify();
	});
	it('describes the full applied query without page limits or unknown filters', () => {
		const service = TestBed.inject(RepositorySearchService);
		const criteria = {
			text: '  draft  ',
			path: '/a',
			nxql: "SELECT * FROM File WHERE dc:title IN ('one','two')",
			expiredAt: '2026-09-15T00:00:00Z',
			facets: { dc_creator_agg: ['alice'], unknown: ['ignore'] },
		};
		expect(service.queryScope(REPOSITORY_SEARCH.trash, 'other', criteria)).toEqual({
			repository: 'other',
			providerName: 'default_trash_search',
			queryParams: [],
			namedParameters: { ecm_fulltext: 'draft', ecm_path: '["/a"]', dc_creator_agg: '["alice"]' },
		});
		expect(service.queryScope(REPOSITORY_SEARCH.nxql, 'default', criteria).queryParams).toEqual([
			criteria.nxql,
		]);
		expect(
			service.queryScope(REPOSITORY_SEARCH.expired, 'default', criteria).namedParameters[
				'expired_max'
			],
		).toBe(criteria.expiredAt);
	});
	it('executes a full-text descriptor and exposes only its submitted criterion in the query scope', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const definition = defineSearch({
			...REPOSITORY_SEARCH.nxql,
			views: { list: {} },
			defaultMode: 'list',
			request: { pageSize: 25, text: { parameter: 'ecm_fulltext' } },
			provider: 'alternate_provider',
		});
		const criteria = {
			text: '  red-blue & green  ',
			path: '/hidden',
			nxql: DEFAULT_NXQL,
			expiredAt: '2026-11-03',
			facets: { dc_creator_agg: ['alice'] },
			quickFilters: ['noFolder'],
			sortBy: 'dc:title',
			sortOrder: 'asc',
		} as const;
		const scope = service.queryScope(definition, 'other repo', criteria);
		expect(scope).toEqual({
			repository: 'other repo',
			providerName: 'alternate_provider',
			queryParams: [],
			namedParameters: { ecm_fulltext: 'red blue & green' },
		});
		service.search(definition, 'other repo', criteria, 1).subscribe();
		const req = http.expectOne((r) =>
			r.url.endsWith('/repo/other%20repo/search/pp/alternate_provider/execute'),
		);
		expect(
			Object.fromEntries(
				req.request.params.keys().map((key) => [key, req.request.params.get(key)]),
			),
		).toEqual({
			...scope.namedParameters,
			currentPageIndex: '1',
			offset: '25',
			pageSize: '25',
			quickFilters: '',
			sortBy: 'dc:title',
			sortOrder: 'asc',
		});
		req.flush({ entries: [] });
		expect(
			service.queryScope(definition, 'default', { ...criteria, text: '  ' }).namedParameters,
		).toEqual({});
		http.verify();
	});
	it('keeps request behavior when a built-in definition is registered under a new ID', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const criteria = {
			text: 'draft-report',
			path: '/workspaces',
			nxql: DEFAULT_NXQL,
			expiredAt: '2026-11-03T12:00:00Z',
			facets: { dc_creator_agg: ['alice'], system_primaryType_agg: ['Picture'] },
			quickFilters: ['noFolder'],
		};
		for (const definition of Object.values(REPOSITORY_SEARCH)) {
			const renamed = { ...definition, id: `alternate-${definition.id}` };
			expect(service.queryScope(renamed, 'default', criteria)).toEqual(
				service.queryScope(definition, 'default', criteria),
			);
			service.search(definition, 'default', criteria, 2).subscribe();
			const original = http.expectOne(() => true);
			service.search(renamed, 'default', criteria, 2).subscribe();
			const alternate = http.expectOne(() => true);
			expect(alternate.request.urlWithParams).toBe(original.request.urlWithParams);
			original.flush({ entries: [] });
			alternate.flush({ entries: [] });
		}
		http.verify();
	});

	it('round-trips saved criteria through declared parameter bindings', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const definition = {
			...REPOSITORY_SEARCH.expired,
			id: 'archived-content',
			provider: 'archived_content',
			request: {
				pageSize: 30,
				text: { parameter: 'archive_title' },
				path: { parameter: 'archive_path' },
				expiredAt: { parameter: 'archive_before' },
			},
		};
		service
			.saveSavedSearch(definition, 'Reports', {
				text: 'report',
				path: '/archive',
				expiredAt: '2026-11-03T12:00:00Z',
				facets: { dc_creator_agg: ['alice'], unknown: ['ignored'] },
				quickFilters: ['noFolder'],
			})
			.subscribe();
		const req = http.expectOne((request) => request.url.endsWith('/api/v1/search/saved'));
		expect(req.request.body.pageProviderName).toBe('archived_content');
		expect(req.request.body.params).toEqual({
			archive_title: 'report',
			archive_path: '["/archive"]',
			archive_before: '2026-11-03T12:00:00Z',
			dc_creator_agg: '["alice"]',
			quickFilters: 'noFolder',
		});
		expect(
			service.criteriaFromSaved(definition, {
				id: 'saved',
				title: 'Reports',
				params: req.request.body.params,
			}),
		).toEqual({
			text: 'report',
			path: '/archive',
			nxql: DEFAULT_NXQL,
			expiredAt: '2026-11-03T12:00:00Z',
			facets: { dc_creator_agg: ['alice'] },
			quickFilters: ['noFolder'],
		});
		req.flush({ id: 'saved', title: 'Reports', params: req.request.body.params });
		http.verify();
	});

	it('persists provider-bound saved searches through the Nuxeo saved-search resource', () => {
		const service = TestBed.inject(RepositorySearchService);
		const http = TestBed.inject(HttpTestingController);
		const params = { text: 'draft', facets: { dc_creator_agg: ['alice'] } };
		service.saveSavedSearch(REPOSITORY_SEARCH.trash, 'Drafts', params).subscribe();
		let req = http.expectOne((request) => request.url.endsWith('/api/v1/search/saved'));
		expect(req.request.method).toBe('POST');
		expect(req.request.body).toEqual(
			jasmine.objectContaining({
				pageProviderName: 'default_trash_search',
				title: 'Drafts',
				params: { ecm_fulltext: 'draft', dc_creator_agg: '["alice"]' },
			}),
		);
		req.flush({ id: 'saved-id', title: 'Drafts', params });
		service.updateSavedSearch('saved/id', REPOSITORY_SEARCH.trash, 'Renamed', params).subscribe();
		req = http.expectOne((request) => request.url.endsWith('/api/v1/search/saved/saved%2Fid'));
		expect(req.request.method).toBe('PUT');
		expect(req.request.body.title).toBe('Renamed');
		req.flush({ id: 'saved/id', title: 'Renamed', params });
		service.deleteSavedSearch('saved/id').subscribe();
		req = http.expectOne((request) => request.url.endsWith('/api/v1/search/saved/saved%2Fid'));
		expect(req.request.method).toBe('DELETE');
		req.flush(null);
		http.verify();
	});
});
