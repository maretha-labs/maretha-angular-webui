import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { LayoutService } from '../../explorer/helpers/layout.service';
import { environment } from 'environments/environment';
import {
	asyncScheduler,
	EMPTY,
	filter,
	finalize,
	map,
	Observable,
	observeOn,
	of,
	Subject,
	tap,
} from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { ResultsQueryScope } from '@maretha/webui-sdk';

/** `/search/default[/<savedSearchId>]`: the routed results page that owns default-search loads. */
export function isDefaultSearchUrl(url: string): boolean {
	return /^\/search\/default(\/[^/]+)?$/.test(url.split(/[?#]/, 1)[0]);
}

@Injectable({
	providedIn: 'root',
})
export class DocumentSearchService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private _searchParameters: ISearchParameters = {};
	private _currentPageProviderKey?: string;
	private _pageProviders: IPageProviders = {};
	private _appliedQuery?: Omit<ResultsQueryScope, 'repository'>;
	private _appliedQueryToken?: number;
	private _appliedView?: Pick<AppliedSearchSnapshot, 'pageSize' | 'sortFields' | 'sortAscending'>;
	private _queryGeneration = 0;
	/** Mounted results views that load the current query themselves. */
	private _resultsHosts = 0;

	private readonly _searchPaneVisibility = signal(false);
	private readonly _pageProvidersUpdated = signal<IPageProviders | null>(null);
	readonly appliedQueryInvalidated$ = new Subject<void>();
	readonly saveAsRequested$ = new Subject<void>();
	readonly saveAsOpen = signal(false);
	/** Saved-search state shared between the drawer form and the results header, as in stock. */
	readonly selectedSavedSearch = signal<ISavedSearch | undefined>(undefined);
	readonly searchFormDirty = signal(false);
	readonly savedSearchWritable = signal(false);
	readonly savedSearchAction = signal<SavedSearchAction | null>(null);

	readonly searchPaneVisibility = this._searchPaneVisibility.asReadonly();
	readonly searchPaneVisibilityChanged$ = toObservable(this._searchPaneVisibility).pipe(
		observeOn(asyncScheduler),
	);
	fetchingDocuments$ = new Subject<boolean>();
	/**
	 * Another page provider was selected. An event, not state: a new subscriber reads
	 * `currentPageProviderKey` and `pageProviders` for the current selection.
	 */
	readonly pageProviderChanged$ = new Subject<IPageProvider>();
	/** A page-provider response refreshed that provider's aggregates and quick filters. */
	readonly pageProviderUpdated$ = new Subject<string>();
	readonly pageProvidersUpdated$: Observable<IPageProviders> = toObservable(
		this._pageProvidersUpdated,
	).pipe(filter((x): x is IPageProviders => x !== null));
	/**
	 * New search parameters were published. An event, not state: a new subscriber reads
	 * `searchParameters` for the current ones instead of expecting a replay.
	 */
	readonly searchParametersChanged$ = new Subject<ISearchParameters>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly layoutService: LayoutService,
		private readonly httpClient: HttpClient,
		private readonly authService: AuthService,
	) {
		authService.userInfoUpdated$
			.pipe(filter((x) => x != null))
			.subscribe((x) => this.configurePageProviders(x?.isAdministrator));
		layoutService.settingsUpdated$.subscribe(() => this.clearAppliedQuery());
	}

	// --------------------------------------------------------------------------------------------------
	get pageProviders() {
		return this._pageProviders;
	}

	// --------------------------------------------------------------------------------------------------
	private configurePageProviders(enableAdminFeatures = false) {
		this._pageProviders = {
			default_search: {
				key: 'default_search',
				userSelectable: true,
				enabled: true,
				fields: {
					ecm_fulltext: {
						// system_fulltext
						type: 'string',
						visible: true,
					},
					ecm_collections: {
						type: 'collection',
						value: [],
						visible: true,
					},
					ecm_tags: {
						type: 'tag',
						value: [],
						visible: true,
					},
				},
				aggregations: {},
				quickFilters: {},
			},
			default_trash_search: {
				key: 'default_trash_search',
				enabled: true,
				userSelectable: false,
				fields: {
					ecm_fulltext: {
						type: 'string',
						visible: true,
					},
				},
				aggregations: {},
				quickFilters: {},
			},
			nxql_search: {
				key: 'nxql_search',
				enabled: true,
				userSelectable: enableAdminFeatures,
				fields: {},
				aggregations: {},
				quickFilters: {},
			},
		};

		// Additional search providers
		if (environment.addons.retention)
			this.pageProviders['retention_search'] = {
				key: 'retention_search',
				enabled: true,
				userSelectable: true,
				fields: {
					ecm_fulltext: {
						// system_fulltext
						type: 'string',
						visible: true,
					},
				},
				aggregations: {},
				quickFilters: {},
			};

		this._pageProvidersUpdated.set(this.pageProviders);

		// Implicitly select the default search provider
		this.useSearchProvider(Object.keys(this.pageProviders)[0]).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	showSearchPaneVisibility = () => {
		this.clearAppliedQuery();
		this._searchPaneVisibility.set(true);
	};

	// --------------------------------------------------------------------------------------------------
	hideSearchPaneVisibility = () => {
		this.clearAppliedQuery();
		this._searchPaneVisibility.set(false);
	};

	// --------------------------------------------------------------------------------------------------
	toggleSearchPaneVisibility = () =>
		this.searchPaneVisibility() ? this.hideSearchPaneVisibility() : this.showSearchPaneVisibility();

	// --------------------------------------------------------------------------------------------------
	set searchParameters(value: ISearchParameters) {
		this._searchParameters = { ...value };
		this.clearAppliedQuery();

		this.searchParametersChanged$.next({ ...this.searchParameters });
	}

	// --------------------------------------------------------------------------------------------------
	get searchParameters() {
		return this._searchParameters;
	}

	getAppliedQueryScope(repository = 'default'): ResultsQueryScope | undefined {
		const applied = this._appliedQuery;
		if (!applied) return undefined;
		return { repository, ...applied };
	}

	/** Describes the live default-search form for a results host that owns its own route. */
	getCurrentQueryScope(repository = 'default'): ResultsQueryScope | undefined {
		const scope = this.describeQuery();
		return scope ? { repository, ...scope } : undefined;
	}

	getCurrentQueryToken(): number {
		return this._queryGeneration;
	}

	getAppliedQueryToken(): number | undefined {
		return this._appliedQueryToken;
	}

	/** Returns an immutable description of the results currently shown by the default search. */
	getAppliedQuerySnapshot(repository = 'default'): AppliedSearchSnapshot | undefined {
		const scope = this.getAppliedQueryScope(repository);
		const token = this.getAppliedQueryToken();
		return scope && token !== undefined
			? {
					scope: {
						...scope,
						queryParams: [...scope.queryParams],
						namedParameters: { ...scope.namedParameters },
					},
					token,
					pageSize: this._appliedView?.pageSize ?? this.layoutService.pageSize,
					sortFields: [...(this._appliedView?.sortFields ?? [])],
					sortAscending: this._appliedView?.sortAscending ?? true,
				}
			: undefined;
	}

	/**
	 * Fetches a previously applied search without reading the live form.  Consumers use this
	 * for result queues so navigation cannot accidentally turn a queue into a new query.
	 */
	loadAppliedQuery(
		scope: ResultsQueryScope,
		currentPage = 0,
		pageSize?: number,
		sortFields: readonly string[] = [],
		sortAscending = true,
	) {
		const query = this.buildQuery(scope, currentPage, pageSize, sortFields, sortAscending);
		return this.httpClient.get(
			`${this.apiUrl}/search/pp/${encodeURIComponent(scope.providerName)}/execute${query}`,
			{ headers: this.searchHeaders() },
		);
	}

	private describeQuery(): Omit<ResultsQueryScope, 'repository'> | undefined {
		const providerName = this.currentPageProviderKey;
		if (!providerName) return undefined;
		const params = this.searchParameters;
		const namedParameters: Record<string, string> = {};
		if (providerName === 'nxql_search')
			return params.queryParams
				? { providerName, queryParams: [params.queryParams], namedParameters }
				: undefined;
		if (params.location) namedParameters['ecm_path'] = JSON.stringify([params.location]);
		for (const [key, value] of Object.entries(params.searchFields ?? {})) {
			if (!this.hasFilterValue(value)) continue;
			if (key === 'ecm_fulltext') {
				namedParameters[key] = String(value).replace(/-/g, ' ');
				namedParameters['highlight'] =
					'dc:title.fulltext,ecm:binarytext,dc:description.fulltext,ecm:tag,note:note.fulltext,file:content.name';
			} else namedParameters[key] = Array.isArray(value) ? JSON.stringify(value) : String(value);
		}
		for (const [key, value] of Object.entries(params.customFilters ?? {}))
			if (this.hasFilterValue(value)) namedParameters[key] = String(JSON.stringify(value));
		const quick = Object.entries(params.quickFilters ?? {})
			.filter(([, value]) => value)
			.map(([key]) => key);
		if (quick.length) namedParameters['quickFilters'] = quick.join(',');
		return { providerName, queryParams: [], namedParameters };
	}

	private hasFilterValue(value: unknown): boolean {
		return (
			value != null &&
			value !== false &&
			value !== '' &&
			(!Array.isArray(value) || value.length > 0)
		);
	}

	private clearAppliedQuery(): void {
		const hadAppliedQuery =
			this._appliedQuery !== undefined || this._appliedQueryToken !== undefined;
		this._queryGeneration++;
		this._appliedQuery = undefined;
		this._appliedQueryToken = undefined;
		this._appliedView = undefined;
		if (hadAppliedQuery) this.appliedQueryInvalidated$.next();
	}

	// --------------------------------------------------------------------------------------------------
	/**
	 * One page of the current query. Every call sends one request; the caller is the action that
	 * asked for it (a results view loading, a drawer fetching its facets, a user paging).
	 */
	loadMore(
		currentPage = 0,
		pageSize?: number,
		sortFields: readonly string[] = [],
		sortAscending = true,
		captureAppliedView = false,
	) {
		if (!this.currentPageProviderKey) return EMPTY;

		if (this.currentPageProviderKey === 'nxql_search' && !this.searchParameters.queryParams)
			return EMPTY;

		this.fetchingDocuments$.next(true);

		const scope = this.describeQuery();
		const generation = this._queryGeneration;

		const query = this.buildQuery(
			{ repository: 'default', ...scope! },
			currentPage,
			pageSize,
			sortFields,
			sortAscending,
		);
		const url = `${this.apiUrl}/search/pp/${this.currentPageProviderKey}/execute${query}`;

		return this.httpClient.get(url, { headers: this.searchHeaders() }).pipe(
			tap((result: any) => {
				if (this.searchPaneVisibility() && generation === this._queryGeneration)
					this._appliedView = captureAppliedView
						? {
								pageSize: pageSize ?? this.layoutService.pageSize,
								sortFields: [...sortFields],
								sortAscending,
							}
						: undefined;
				if (this.searchPaneVisibility() && generation === this._queryGeneration)
					this._appliedQuery = scope;
				if (this.searchPaneVisibility() && generation === this._queryGeneration)
					this._appliedQueryToken = generation;
				if (this.currentPageProviderKey === 'nxql_search') return;
				// Aggregates describe the query that produced them. A slower response for an older
				// query must not replace the drawer's facets for the current one.
				if (JSON.stringify(scope) !== JSON.stringify(this.describeQuery())) return;

				this.fillPageProviderAggregation(result.aggregations);

				this.fillPageProviderQuickFilters(result.quickFilters);

				this.pageProviderUpdated$.next(this.currentPageProviderKey!);
			}),
			finalize(() => this.fetchingDocuments$.next(false)),
		);
	}

	/**
	 * Records the current query as the applied one without a request, for a host that loads it
	 * itself right after (the search queue reopening on a quick-filter change). `view` is the
	 * page size and order that host will use.
	 */
	applyCurrentQuery(
		view?: Pick<AppliedSearchSnapshot, 'pageSize' | 'sortFields' | 'sortAscending'>,
	): boolean {
		const scope = this.describeQuery();
		if (!scope) return false;
		this._appliedQuery = scope;
		this._appliedQueryToken = this._queryGeneration;
		this._appliedView = view
			? {
					pageSize: view.pageSize,
					sortFields: [...view.sortFields],
					sortAscending: view.sortAscending,
				}
			: undefined;
		return true;
	}

	private buildQuery(
		scope: ResultsQueryScope,
		currentPage: number,
		pageSize?: number,
		sortFields: readonly string[] = [],
		sortAscending = true,
	): string {
		const size = pageSize && pageSize >= 0 ? pageSize : this.layoutService.pageSize;
		let query = `?currentPageIndex=${currentPage}&pageSize=${size}`;
		if (scope.queryParams.length)
			query += scope.queryParams
				.map((value) => `&queryParams=${encodeURIComponent(value)}`)
				.join('');
		else
			for (const [key, value] of Object.entries(scope.namedParameters))
				query += `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
		if (sortFields.length)
			query += `&sortBy=${encodeURIComponent(sortFields.join(','))}&sortOrder=${sortAscending ? 'asc' : 'desc'}`;
		return query;
	}

	private searchHeaders(): HttpHeaders {
		return new HttpHeaders({
			'enrichers-document': 'thumbnail,permissions,highlight,favorites',
			'fetch-aggregate': 'key',
			'fetch-document': 'properties',
			// Stock nuxeo-search-form: vocabulary parents feed the Nature/Coverage/Subjects tags.
			'fetch-directoryEntry': 'parent',
			properties: '*',
			'translate-directoryEntry': 'label',
		});
	}

	getUserCollections(searchTerm = ''): Observable<SearchCollection[]> {
		return this.httpClient
			.post<unknown>(`${this.apiUrl}/automation/User.GetCollections`, {
				params: { searchTerm },
				context: {},
			})
			.pipe(
				map((response) => {
					const entries = Array.isArray(response)
						? response
						: ((response as { entries?: unknown[] }).entries ?? []);
					return entries.flatMap((entry): SearchCollection[] => {
						if (!entry || typeof entry !== 'object') return [];
						const collection = entry as { uid?: unknown; title?: unknown };
						return typeof collection.uid === 'string'
							? [{ uid: collection.uid, title: String(collection.title ?? collection.uid) }]
							: [];
					});
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	saveSearch(title: string, params: any): Observable<ISavedSearch> {
		const url = `${this.apiUrl}/search/saved`;
		const payload = {
			'entity-type': 'savedSearch',
			pageProviderName: this.currentPageProviderKey,
			params: params,
			title,
		};

		return this.httpClient.post<ISavedSearch>(url, payload);
	}

	updateSavedSearch(
		savedSearch: ISavedSearch,
		title: string,
		params: any,
	): Observable<ISavedSearch> {
		const url = `${this.apiUrl}/search/saved/${encodeURIComponent(savedSearch.id)}`;
		return this.httpClient.put<ISavedSearch>(url, {
			'entity-type': 'savedSearch',
			pageProviderName: this.currentPageProviderKey,
			params,
			title,
		});
	}

	// --------------------------------------------------------------------------------------------------
	deleteSavedSearch(savedSearchId: string) {
		const url = `${this.apiUrl}/search/saved/${savedSearchId}`;

		return this.httpClient.delete(url);
	}

	getSavedSearchPermissions(savedSearchId: string) {
		return this.httpClient.get<{ contextParameters?: { permissions?: string[] } }>(
			`${this.apiUrl}/id/${encodeURIComponent(savedSearchId)}`,
			{ headers: new HttpHeaders({ 'enrichers-document': 'permissions' }) },
		);
	}

	shareSavedSearch(savedSearchId: string, principal: string, notify = false) {
		return this.httpClient.post(`${this.apiUrl}/automation/Document.AddPermission`, {
			input: savedSearchId,
			params: {
				username: principal,
				permission: 'Read',
				begin: null,
				end: null,
				notify,
			},
		});
	}

	/** One saved search by id, for a results view that restores the search its URL names. */
	getSavedSearch(savedSearchId: string): Observable<ISavedSearch> {
		return this.httpClient
			.get<any>(`${this.apiUrl}/search/saved/${encodeURIComponent(savedSearchId)}`)
			.pipe(map((y) => ({ id: y.id, title: y.title, query: y.query, params: y.params })));
	}

	/**
	 * Selects a saved search and publishes its criteria as the search parameters, or clears both.
	 * `location` is the document path a saved search marked `local` is scoped to.
	 */
	applySavedSearch(savedSearch: ISavedSearch | undefined, location?: string): void {
		this.selectedSavedSearch.set(savedSearch);
		this.searchParameters = savedSearch ? savedSearchParameters(savedSearch, location) : {};
	}

	// --------------------------------------------------------------------------------------------------
	getSavedSearches(): Observable<ISavedSearch[]> {
		const url = `${this.apiUrl}/search/saved?pageProvider=${this.currentPageProviderKey}`;

		return this.httpClient.get(url).pipe(
			map((x: any) =>
				x.entries
					.map((y: any) => ({
						id: y.id,
						title: y.title,
						query: y.query,
						params: y.params,
					}))
					.sort((a: ISavedSearch, b: ISavedSearch) => a.title.localeCompare(b.title)),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private fillPageProviderAggregation(aggregations: any) {
		this.pageProviders[this.currentPageProviderKey!].aggregations = {};

		if (!aggregations) return;

		for (const key in aggregations) {
			if (!Object.prototype.hasOwnProperty.call(aggregations, key)) continue;

			this.pageProviders[this.currentPageProviderKey!].aggregations[key] = {
				label: key,
				type: aggregations[key].type,
				field: aggregations[key].field,
				selection: aggregations[key].selection,
				buckets: aggregations[key].extendedBuckets?.map((bucket: any) => {
					if (bucket.from === '-Infinity')
						bucket.from.replace('-Infinity', Number.NEGATIVE_INFINITY);

					if (bucket.to === 'Infinity') bucket.to.replace('Infinity', Number.POSITIVE_INFINITY);

					return {
						key: bucket.key,
						fetchedKey: bucket.fetchedKey,
						docCount: bucket.docCount,
						from: bucket.from,
						to: bucket.to,
						disabled: !bucket.docCount,
					};
				}),
			};
		}
	}

	// --------------------------------------------------------------------------------------------------
	private fillPageProviderQuickFilters(quickFilters: any) {
		this.pageProviders[this.currentPageProviderKey!].quickFilters = {};

		if (!quickFilters) return;

		this.pageProviders[this.currentPageProviderKey!].quickFilters = quickFilters.reduce(
			(quickFilters: IQuickFilters, value: any) => {
				quickFilters[value.name] = value.active;

				return quickFilters;
			},
			{},
		);
	}

	// --------------------------------------------------------------------------------------------------
	useDefaultSearchProvider() {
		return this.useSearchProvider('default_search');
	}

	// --------------------------------------------------------------------------------------------------
	useTrashedDocumentsSearchProvider() {
		return this.useSearchProvider('default_trash_search');
	}

	// --------------------------------------------------------------------------------------------------
	useSearchProvider(searchProviderKey: string) {
		if (
			!searchProviderKey ||
			!Object.keys(this.pageProviders).includes(searchProviderKey) ||
			this._currentPageProviderKey === searchProviderKey
		)
			return of();

		this._currentPageProviderKey = searchProviderKey;
		this.clearAppliedQuery();

		this.pageProviders[searchProviderKey].aggregations = {};

		this.pageProviders[searchProviderKey].quickFilters = {};

		this._searchParameters = {
			customFilters: {},
			quickFilters: {},
			queryParams: '',
		};
		this.selectedSavedSearch.set(undefined);

		// State is settled before the event: a subscriber reads the new provider and its empty
		// parameters. No request here; a mounted results view reloads on the event and an open
		// drawer asks for its facets through `loadFilters()`.
		this.pageProviderChanged$.next(this.pageProviders[searchProviderKey]);

		return of(this.pageProviders[searchProviderKey]);
	}

	// --------------------------------------------------------------------------------------------------
	/**
	 * Facets and quick filters for the drawer form, fetched when the drawer opens as stock fetches
	 * its form provider. A mounted results view owns the current query and its response carries
	 * the facets, so the drawer sends nothing while one is attached.
	 */
	loadFilters(): Observable<unknown> {
		const scope = this.describeQuery();
		if (!scope || scope.providerName === 'nxql_search' || this._resultsHosts > 0) return EMPTY;
		return this.loadMore(0, 1);
	}

	/**
	 * A results view that loads the current query on its own. While one is attached the drawer
	 * sends no facets request. Returns the detach callback for the view's destruction.
	 */
	attachResultsHost(): () => void {
		this._resultsHosts++;
		let attached = true;
		return () => {
			if (!attached) return;
			attached = false;
			this._resultsHosts--;
		};
	}

	// --------------------------------------------------------------------------------------------------
	get currentPageProviderKey() {
		return /*localStorage.getItem('currentSearchProvider') ||*/ this._currentPageProviderKey;
	}
}

export type IPageProviders = Record<string, IPageProvider>;

export interface IPageProvider {
	key: string;
	enabled: boolean;
	userSelectable: boolean;
	fields: IPageProviderFields;
	aggregations: IPageProviderAggregations;
	quickFilters: IQuickFilters;
}

export type IPageProviderFields = Record<string, IPageProviderField>;

export interface IPageProviderField {
	type: string;
	value?: any;
	visible?: boolean;
	reversed?: boolean;
}

export type IPageProviderAggregations = Record<string, IPageProviderAggregation>;

export interface IPageProviderAggregation {
	label: string;
	type: string;
	field: string;
	buckets: IAggregationBucket[];
	properties?: IAggregationProperty;
	selection: any[];
}

export type IQuickFilters = Record<string, boolean>;

export interface IAggregationProperty {
	size?: number;
	order?: string;
	format?: string;
}

export interface IAggregationBucket {
	key: string;
	docCount?: number;
	from?: number;
	to?: number;
	disabled?: boolean;
}

export type ISearchFields = Record<string, string | number | boolean | string[]>;

export interface SearchCollection {
	uid: string;
	title: string;
}

export type SavedSearchAction = 'saveAs' | 'save' | 'rename' | 'share' | 'delete';

export interface ISavedSearch {
	id: string;
	title: string;
	params: any;
	query?: string;
}

export interface ISearchParameters {
	location?: string;
	searchFields?: ISearchFields;
	/** Aggregation key to selected bucket keys. */
	customFilters?: Record<string, unknown>;
	quickFilters?: IQuickFilters;
	queryParams?: string;
}

/**
 * The search parameters a saved search describes. Stored keys ending in `_agg` are aggregation
 * selections, `quickFilters` is a comma-separated list of active quick filters, `local` scopes the
 * search to `location`, and every other key is a search field.
 */
export function savedSearchParameters(
	savedSearch: ISavedSearch,
	location?: string,
): ISearchParameters {
	const params: Record<string, unknown> =
		savedSearch.params && typeof savedSearch.params === 'object' ? savedSearch.params : {};
	const searchFields: ISearchFields = {};
	const customFilters: Record<string, unknown> = {};
	const quickFilters: IQuickFilters = {};
	for (const [key, value] of Object.entries(params)) {
		if (key === 'local') continue;
		if (key === 'quickFilters') {
			for (const name of String(value ?? '')
				.split(',')
				.filter(Boolean))
				quickFilters[name] = true;
			continue;
		}
		if (value == null || value === '' || value === false || (Array.isArray(value) && !value.length))
			continue;
		if (key.endsWith('_agg')) customFilters[key] = value;
		else searchFields[key] = value as ISearchFields[string];
	}
	return {
		location: params['local'] && location ? location : undefined,
		searchFields,
		customFilters,
		quickFilters,
	};
}

export interface AppliedSearchSnapshot {
	readonly scope: ResultsQueryScope;
	readonly token: number;
	readonly pageSize: number;
	readonly sortFields: readonly string[];
	readonly sortAscending: boolean;
}
