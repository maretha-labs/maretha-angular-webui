import type { Type } from '@angular/core';
import type {
	ResultsProjectionColumn,
	ResultsProjectionMode,
	ResultsProjectionComponentLoader,
} from '@maretha/webui-sdk';
import { DEFAULT_SEARCH_INPUT } from './default-search-definition';
import { DefaultSearchColumnHeaderComponent } from '../components/default-search-results/default-search-column-header.component';
import {
	ASSET_RESULT_COLUMNS,
	DEFAULT_RESULT_COLUMNS,
	NXQL_RESULT_COLUMNS,
} from './repository-search-columns';

interface SearchViews {
	readonly grid: {
		readonly item?: 'assetTile';
		readonly layout?: 'fixed' | 'justified';
		readonly loadComponent?: ResultsProjectionComponentLoader;
	};
	readonly list: { readonly loadComponent?: ResultsProjectionComponentLoader };
	readonly table: {
		readonly columns: readonly ResultsProjectionColumn[];
		readonly columnChooser?: boolean;
		readonly cells?: Readonly<Record<string, ResultsProjectionComponentLoader>>;
	};
}

/** Compiled criteria bindings. Only declared fields are read from routes or sent to Nuxeo. */
export interface SearchRequest {
	readonly pageSize: number;
	/** Stock full-text normalization trims whitespace and treats hyphens as word separators. */
	readonly text?: { readonly parameter: string };
	readonly path?: { readonly parameter: string };
	readonly expiredAt?: { readonly parameter: string };
	readonly nxql?: { readonly parameter: 'queryParams' };
}

export interface SearchForm {
	/** Lazy presentation hook; omitted forms use the shared stock filters. */
	readonly loadComponent?: () => Promise<Type<unknown>>;
	/** Explicit forms stage initial/URL criteria and resets until the user submits. */
	readonly submission: 'immediate' | 'debounced' | 'explicit';
	readonly submitWhileLoading?: boolean;
	readonly loadDrawer?: boolean;
	/**
	 * `url` (default): the route owns applied criteria. `memory`: stock's bare page address
	 * (`#!/search/<name>`); applied criteria stay with the app session, as in stock's drawer form,
	 * and a reload starts the default search.
	 */
	readonly criteria?: 'url' | 'memory';
}

export interface SearchResults {
	readonly hostId: string;
	readonly sortBar: boolean;
	readonly defaultSort: string;
	readonly pageScroll: boolean;
	readonly scrollPaging: boolean;
	readonly includeTrashed: boolean;
	readonly showType: boolean;
	readonly sizeField: 'common:size' | 'file:content/length';
	readonly csvSchemas: readonly string[];
	/** Stock Type cell: the localized type (`formatDocType`) or the type id (Assets, NXQL). */
	readonly typeLabel: 'localized' | 'id';
}

export interface SearchDefinition<Id extends string = string> {
	readonly id: Id;
	readonly provider: string;
	readonly label: string;
	readonly labelKey: string;
	readonly facets: readonly string[];
	readonly drawer?: { readonly order: number; readonly icon: string };
	readonly request: SearchRequest;
	readonly form: SearchForm;
	/** Page geometry is declared independently of provider bindings or search identity. */
	readonly layout: { readonly form: 'drawer' | 'inline'; readonly results: 'standard' | 'stock' };
	readonly results: SearchResults;
	readonly savedSearches:
		| false
		| {
				readonly useDraft?: boolean;
				readonly resetOnClear?: boolean;
				readonly loadWhileLoading?: boolean;
		  };
	readonly quickFilters: boolean;
	readonly access: 'authenticated' | 'administrator';
	readonly queue?: { readonly kind: 'assets' | 'expired'; readonly openByDefault?: boolean };
	readonly defaultMode: ResultsProjectionMode;
	readonly views: Partial<SearchViews>;
}

type SearchInput<Id extends string, Mode extends ResultsProjectionMode> = Omit<
	SearchDefinition<Id>,
	'views' | 'defaultMode' | 'results' | 'savedSearches' | 'quickFilters' | 'access' | 'layout'
> & {
	readonly views: Pick<SearchViews, Mode>;
	readonly defaultMode: NoInfer<Mode>;
	readonly results?: Partial<SearchResults>;
	readonly layout?: SearchDefinition['layout'];
	readonly savedSearches?: SearchDefinition['savedSearches'];
	readonly quickFilters?: boolean;
	readonly access?: SearchDefinition['access'];
};

/** The same authoring contract is used by built-ins and compiled application contributions. */
export function defineSearch<Id extends string, Mode extends ResultsProjectionMode>(
	definition: SearchInput<Id, Mode>,
): SearchDefinition<Id> {
	return {
		layout: { form: 'drawer', results: 'standard' },
		savedSearches: false,
		quickFilters: false,
		access: 'authenticated',
		...definition,
		results: {
			hostId: 'repository-search',
			sortBar: false,
			defaultSort: 'dc:created',
			pageScroll: false,
			scrollPaging: false,
			includeTrashed: false,
			showType: true,
			sizeField: 'common:size',
			csvSchemas: ['dublincore', 'common', 'uid'],
			typeLabel: 'localized',
			...definition.results,
		},
	};
}

export function indexSearches<D extends SearchDefinition<string>>(
	searches: readonly D[],
): Readonly<Record<D['id'], D>> {
	const byId: Record<D['id'], D> = Object.create(null);
	for (const search of searches) {
		const id: D['id'] = search.id;
		if (!id.trim() || Object.hasOwn(byId, id))
			throw new Error(`Empty or duplicate search ID: ${search.id}`);
		if (!Number.isInteger(search.request.pageSize) || search.request.pageSize < 1)
			throw new Error(`Search ${search.id} must declare a positive integer page size`);
		if (!search.views[search.defaultMode])
			throw new Error(
				`Search ${search.id} does not declare its default mode ${search.defaultMode}`,
			);
		if (search.views.table && !search.views.table.columns.length)
			throw new Error(`Table in ${search.id} must declare a column`);
		const columnIds = new Set<string>();
		for (const column of search.views.table?.columns ?? []) {
			if (!column.id.trim() || columnIds.has(column.id))
				throw new Error(`Empty or duplicate column ID in ${search.id}: ${column.id}`);
			columnIds.add(column.id);
		}
		byId[id] = search;
	}
	return byId;
}

/**
 * Stock nuxeo-trash-search-results table: its thirteen columns in order under the stock labels;
 * Title, Modified, Author and Path show until the user's Columns Settings change them; only the
 * columns stock declares with `sort-by` sort.
 */
const TRASH_TABLE = [
	['title', 'label.dublincore.title', true, true],
	['type', 'label.type', false, false],
	['modified', 'label.dublincore.modified', true, true],
	['lastContributor', 'label.dublincore.lastContributor', false, true],
	['state', 'label.state', false, false],
	['version', 'label.version', false, false],
	['created', 'label.dublincore.created', false, true],
	['author', 'label.dublincore.author', true, true],
	['nature', 'label.dublincore.nature', false, false],
	['coverage', 'label.dublincore.coverage', false, false],
	['subjects', 'label.dublincore.subjects', false, false],
	['path', 'label.path', true, false],
	['flags', 'documentContentView.datatable.header.flags', false, false],
] as const;
function trashResultColumns(): readonly ResultsProjectionColumn[] {
	// Fallback labels and values are the shared column definitions; trash orders and relabels them.
	const shared = [
		...ASSET_RESULT_COLUMNS,
		...NXQL_RESULT_COLUMNS,
		...DEFAULT_SEARCH_INPUT.views.table.columns,
	];
	return TRASH_TABLE.map(([id, labelKey, shown, sortable]) => {
		const { label, value } = shared.find((column) => column.id === id)!;
		return { id, label, labelKey, ...(value ? { value } : {}), hidden: !shown, sortable };
	});
}

export const REPOSITORY_SEARCH_DEFINITIONS = [
	defineSearch(DEFAULT_SEARCH_INPUT),
	defineSearch({
		id: 'trash',
		provider: 'default_trash_search',
		label: 'Trash',
		labelKey: 'app.trashSearch',
		request: { pageSize: 40, text: { parameter: 'ecm_fulltext' }, path: { parameter: 'ecm_path' } },
		form: {
			submission: 'immediate',
			criteria: 'memory',
			loadDrawer: true,
			loadComponent: () =>
				import('../components/search-form/author-search-form.component').then(
					(m) => m.AuthorSearchFormComponent,
				),
		},
		layout: { form: 'drawer', results: 'stock' },
		results: { sortBar: true, includeTrashed: true },
		savedSearches: {},
		quickFilters: true,
		drawer: { order: 110, icon: 'nuxeo-navigation:delete' },
		facets: ['dc_creator_agg', 'common_size_agg'],
		defaultMode: 'list',
		views: {
			grid: {},
			table: {
				columns: trashResultColumns(),
				columnChooser: true,
				cells: {
					flags: () =>
						import('../components/default-search-results/default-search-flags-cell.component').then(
							(m) => m.DefaultSearchFlagsCellComponent,
						),
				},
			},
			list: {
				loadComponent: () =>
					import('app/modules/shared/components/document-list-item/document-list-item.component').then(
						(m) => m.DocumentListItemComponent,
					),
			},
		},
	}),
	defineSearch({
		id: 'expired',
		provider: 'expired_search',
		label: 'Expired documents',
		labelKey: 'app.expiredSearch',
		request: {
			pageSize: 40,
			text: { parameter: 'title' },
			expiredAt: { parameter: 'expired_max' },
		},
		form: {
			submission: 'immediate',
			criteria: 'memory',
			submitWhileLoading: true,
			loadDrawer: true,
			loadComponent: () =>
				import('../components/search-form/author-search-form.component').then(
					(m) => m.AuthorSearchFormComponent,
				),
		},
		layout: { form: 'drawer', results: 'stock' },
		results: {
			sortBar: true,
			defaultSort: 'dc:expired',
			pageScroll: true,
			showType: false,
		},
		savedSearches: {},
		quickFilters: true,
		queue: { kind: 'expired', openByDefault: true },
		drawer: { order: 40, icon: 'nuxeo-navigation:expired' },
		facets: ['dc_creator_agg'],
		defaultMode: 'table',
		views: { grid: {}, table: { columns: DEFAULT_RESULT_COLUMNS, columnChooser: true } },
	}),
	defineSearch({
		id: 'assets',
		provider: 'assets_search',
		label: 'Assets',
		labelKey: 'dam.assets.heading',
		request: { pageSize: 50, text: { parameter: 'ecm_fulltext' } },
		form: {
			submission: 'debounced',
			criteria: 'memory',
			loadComponent: () =>
				import('../components/search-form/assets-search-form.component').then(
					(m) => m.AssetsSearchFormComponent,
				),
			submitWhileLoading: true,
			loadDrawer: true,
		},
		layout: { form: 'drawer', results: 'stock' },
		results: {
			scrollPaging: true,
			csvSchemas: ['dublincore', 'common', 'file', 'uid', 'thumbnail', 'picture'],
			typeLabel: 'id',
		},
		savedSearches: { useDraft: true, resetOnClear: true, loadWhileLoading: true },
		quickFilters: true,
		queue: { kind: 'assets' },
		drawer: { order: 50, icon: 'nuxeo-navigation:assets' },
		facets: [
			'system_primaryType_agg',
			'system_mimetype_agg',
			'asset_width_agg',
			'asset_height_agg',
			'color_profile_agg',
			'color_depth_agg',
			'video_duration_agg',
		],
		defaultMode: 'grid',
		views: {
			grid: { item: 'assetTile', layout: 'justified' },
			table: { columns: ASSET_RESULT_COLUMNS, columnChooser: true },
		},
	}),
	defineSearch({
		id: 'nxql',
		provider: 'nxql_search',
		label: 'NXQL Search',
		labelKey: 'nxqlSearch.heading',
		request: { pageSize: 40, nxql: { parameter: 'queryParams' } },
		form: {
			submission: 'explicit',
			criteria: 'memory',
			loadDrawer: true,
			loadComponent: () =>
				import('../components/search-form/nxql-search-form.component').then(
					(m) => m.NxqlSearchFormComponent,
				),
		},
		layout: { form: 'inline', results: 'stock' },
		results: {
			sizeField: 'file:content/length',
			csvSchemas: ['common', 'uid', 'dublincore', 'file'],
			typeLabel: 'id',
		},
		access: 'administrator',
		facets: [],
		defaultMode: 'table',
		views: {
			grid: {},
			table: {
				columns: NXQL_RESULT_COLUMNS.map((column) => ({
					...column,
					headerComponent: DefaultSearchColumnHeaderComponent,
				})),
				columnChooser: true,
				cells: {
					path: () =>
						import('../components/repository-search/nxql-path-cell.component').then(
							(m) => m.NxqlPathCellComponent,
						),
				},
			},
		},
	}),
] as const;

export const REPOSITORY_SEARCH = indexSearches(REPOSITORY_SEARCH_DEFINITIONS);
export type RepositorySearchKind = keyof typeof REPOSITORY_SEARCH;
export type CompiledSearchDefinition = SearchDefinition;

/** A drawer placement opts a search into both its paired drawer and its /page/:id results page. */
export function repositorySearchNavigation(definitions: readonly CompiledSearchDefinition[]) {
	return Object.values(indexSearches(definitions)).flatMap((definition) => {
		const { id, label, labelKey, drawer } = definition;
		if (!drawer) return [];
		const target = definition;
		return [{ id, label, labelKey, ...drawer, target }];
	});
}
