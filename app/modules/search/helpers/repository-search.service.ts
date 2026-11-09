import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { ResultsQueryScope } from '@maretha/webui-sdk';
import type { SearchDefinition } from './repository-search-definitions';

export { REPOSITORY_SEARCH, type RepositorySearchKind } from './repository-search-definitions';

export const DEFAULT_NXQL =
	"SELECT * FROM Document WHERE ecm:mixinType != 'HiddenInNavigation' AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0";
export interface RepositorySearchParameters {
	text: string;
	path: string;
	nxql: string;
	expiredAt: string;
	facets: Readonly<Record<string, readonly string[]>>;
	quickFilters?: readonly string[];
	sortBy?: string;
	sortOrder?: 'asc' | 'desc';
}
export const REPOSITORY_SEARCH_SORTS = [
	{ field: 'ecm:path', label: 'Path', labelKey: 'app.columns.path' },
	{ field: 'common:size', label: 'Size', labelKey: 'app.columns.size' },
	{ field: 'file:content/length', label: 'File size', labelKey: 'app.columns.file-size' },
	{ field: 'dc:title', label: 'Title', labelKey: 'app.columns.title' },
	{ field: 'dc:created', label: 'Created', labelKey: 'app.columns.created' },
	{ field: 'dc:modified', label: 'Modified', labelKey: 'app.columns.modified' },
	{ field: 'dc:expired', label: 'Expired', labelKey: 'searchResults.sort.field.expired' },
	{
		field: 'dc:lastContributor',
		label: 'Last contributor',
		labelKey: 'searchResults.sort.field.lastContributor',
	},
	{ field: 'dc:nature', label: 'Nature', labelKey: 'app.columns.nature' },
	{ field: 'dc:coverage', label: 'Coverage', labelKey: 'app.columns.coverage' },
] as const;
/** Fields a request may sort by: the sort bar's, plus the stock Author column's `sort-by`. */
export const REPOSITORY_SEARCH_SORT_FIELDS: readonly string[] = [
	...REPOSITORY_SEARCH_SORTS.map((sort) => sort.field),
	'dc:creator',
];
export interface RepositorySavedSearch {
	id: string;
	title: string;
	params: Record<string, unknown>;
}
@Injectable({ providedIn: 'root' })
export class RepositorySearchService {
	private readonly http = inject(HttpClient);
	queryScope(
		definition: SearchDefinition,
		repository: string,
		criteria: RepositorySearchParameters,
	): ResultsQueryScope {
		const params = this.parameters(definition, criteria);
		return {
			repository,
			providerName: definition.provider,
			queryParams: definition.request.nxql ? [criteria.nxql] : [],
			namedParameters: Object.fromEntries(
				params
					.keys()
					.filter((key) => key !== 'queryParams')
					.map((key) => [key, params.get(key)!]),
			),
		};
	}
	private parameters(
		definition: SearchDefinition,
		criteria: RepositorySearchParameters,
	): HttpParams {
		const { request } = definition;
		let params = new HttpParams();
		if (request.nxql) params = params.set(request.nxql.parameter, criteria.nxql);
		if (request.text && criteria.text.trim())
			params = params.set(request.text.parameter, criteria.text.trim().replace(/-/g, ' '));
		if (request.path && criteria.path)
			params = params.set(request.path.parameter, JSON.stringify([criteria.path]));
		if (request.expiredAt) params = params.set(request.expiredAt.parameter, criteria.expiredAt);
		for (const key of definition.facets) {
			const values = criteria.facets[key];
			if (values?.length) params = params.set(key, JSON.stringify(values));
		}
		if (definition.quickFilters && criteria.quickFilters?.length)
			params = params.set('quickFilters', criteria.quickFilters.join(','));
		return params;
	}
	search(
		definition: SearchDefinition,
		repository: string,
		criteria: RepositorySearchParameters,
		page = 0,
	) {
		const { pageSize } = definition.request;
		// Stock nuxeo-page-provider request shape: currentPageIndex, offset, pageSize, and the
		// quickFilters parameter always present (empty when none).
		let params = this.parameters(definition, criteria)
			.set('currentPageIndex', page)
			.set('offset', page * pageSize)
			.set('pageSize', pageSize);
		if (!params.has('quickFilters')) params = params.set('quickFilters', '');
		if (criteria.sortBy && REPOSITORY_SEARCH_SORT_FIELDS.includes(criteria.sortBy))
			params = params
				.set('sortBy', criteria.sortBy!)
				.set('sortOrder', criteria.sortOrder === 'desc' ? 'desc' : 'asc');
		return this.http.get<{
			entries: any[];
			aggregations?: Record<string, any>;
			quickFilters?: { name: string; active: boolean }[];
			isNextPageAvailable?: boolean;
			resultsCount?: number;
		}>(
			// Stock addresses the default repository without the `repo/` prefix.
			`${environment.nuxeoUrl}/api/v1${repository === 'default' ? '' : `/repo/${encodeURIComponent(repository)}`}/search/pp/${encodeURIComponent(definition.provider)}/execute`,
			{
				params,
				headers: {
					properties: '*',
					'enrichers-document': 'permissions,thumbnail,favorites',
					'fetch-aggregate': 'key',
					'fetch-document': 'properties',
					// Stock drawer forms (nuxeo-search-form) fetch vocabulary parents for their labels;
					// the inline NXQL page (nuxeo-results-view) does not.
					...(definition.layout.form === 'drawer' ? { 'fetch-directoryEntry': 'parent' } : {}),
					'translate-directoryEntry': 'label',
				},
			},
		);
	}
	private savedParameters(
		definition: SearchDefinition,
		criteria: Partial<RepositorySearchParameters>,
	) {
		const params = this.parameters(definition, {
			text: '',
			path: '',
			nxql: DEFAULT_NXQL,
			expiredAt: new Date().toISOString(),
			facets: {},
			...criteria,
		});
		return Object.fromEntries(params.keys().map((key) => [key, params.get(key)]));
	}
	criteriaFromSaved(
		definition: SearchDefinition,
		saved: RepositorySavedSearch,
	): Partial<RepositorySearchParameters> {
		const params = saved.params ?? {};
		const values = (key: string): string[] => {
			try {
				const raw =
					typeof params[key] === 'string' ? JSON.parse(params[key] as string) : params[key];
				return Array.isArray(raw)
					? raw.filter((value): value is string => typeof value === 'string')
					: [];
			} catch {
				return [];
			}
		};
		return {
			quickFilters: definition.quickFilters
				? String(params['quickFilters'] ?? '')
						.split(',')
						.filter(Boolean)
				: [],
			text: definition.request.text ? String(params[definition.request.text.parameter] ?? '') : '',
			path: definition.request.path ? (values(definition.request.path.parameter)[0] ?? '/') : '/',
			nxql: definition.request.nxql
				? String(params[definition.request.nxql.parameter] ?? DEFAULT_NXQL)
				: DEFAULT_NXQL,
			expiredAt: definition.request.expiredAt
				? String(params[definition.request.expiredAt.parameter] ?? '')
				: '',
			facets: Object.fromEntries(definition.facets.map((key) => [key, values(key)])),
		};
	}

	savedSearches(definition: SearchDefinition) {
		return this.http.get<{ entries: RepositorySavedSearch[] }>(
			`${environment.nuxeoUrl}/api/v1/search/saved`,
			{
				params: { pageProvider: definition.provider },
			},
		);
	}
	saveSavedSearch(
		definition: SearchDefinition,
		title: string,
		params: Partial<RepositorySearchParameters>,
	) {
		return this.http.post<RepositorySavedSearch>(`${environment.nuxeoUrl}/api/v1/search/saved`, {
			'entity-type': 'savedSearch',
			pageProviderName: definition.provider,
			title,
			params: this.savedParameters(definition, params),
		});
	}
	updateSavedSearch(
		id: string,
		definition: SearchDefinition,
		title: string,
		params: Partial<RepositorySearchParameters>,
	) {
		return this.http.put<RepositorySavedSearch>(
			`${environment.nuxeoUrl}/api/v1/search/saved/${encodeURIComponent(id)}`,
			{
				'entity-type': 'savedSearch',
				pageProviderName: definition.provider,
				title,
				params: this.savedParameters(definition, params),
			},
		);
	}
	deleteSavedSearch(id: string) {
		return this.http.delete<void>(
			`${environment.nuxeoUrl}/api/v1/search/saved/${encodeURIComponent(id)}`,
		);
	}
}
