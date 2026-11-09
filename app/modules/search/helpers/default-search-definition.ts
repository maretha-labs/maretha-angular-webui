import type { ResultsProjectionColumn } from '@maretha/webui-sdk';
import { metadataLabel } from './repository-search-columns';

/** Default search keeps its saved-search/queue controller, but uses the common presentation contract. */
export const DEFAULT_SEARCH_INPUT = {
	id: 'default',
	provider: 'default_search',
	label: 'Search',
	labelKey: 'app.search',
	request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
	form: {
		submission: 'debounced',
		loadComponent: () =>
			import('../components/search-pane/search-pane.component').then((m) => m.SearchComponent),
	},
	layout: { form: 'drawer', results: 'stock' },
	results: {
		hostId: 'default-search',
		sortBar: true,
		csvSchemas: ['dublincore', 'common', 'file', 'uid'],
	},
	savedSearches: {},
	quickFilters: true,
	facets: [
		'dc_modified_agg',
		'dc_nature_agg',
		'dc_subjects_agg',
		'dc_coverage_agg',
		'common_size_agg',
		'dc_creator_agg',
	],
	defaultMode: 'list',
	views: {
		grid: {},
		list: {
			loadComponent: () =>
				import('app/modules/shared/components/document-list-item/document-list-item.component').then(
					(m) => m.DocumentListItemComponent,
				),
		},
		table: {
			columns: defaultSearchColumns(),
			columnChooser: true,
			cells: {
				flags: () =>
					import('../components/default-search-results/default-search-flags-cell.component').then(
						(m) => m.DefaultSearchFlagsCellComponent,
					),
			},
		},
	},
} as const;

/** Stock nuxeo-default-search-results: only Title, Modified, Last contributor, Created and Author
 *  declare `sort-by`. */
function defaultSearchColumns(): readonly ResultsProjectionColumn<any>[] {
	return [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.columns.title',
			flex: 100,
			value: (row) => row.title ?? '',
		},
		{
			id: 'type',
			label: 'Type',
			labelKey: 'app.columns.type',
			value: (row) => row.type ?? '',
			hidden: true,
			sortable: false,
		},
		{
			id: 'modified',
			flex: 50,
			label: 'Modified',
			labelKey: 'app.columns.modified',
			value: (row) => row.properties?.['dc:modified'] ?? '',
		},
		{
			id: 'lastContributor',
			flex: 50,
			label: 'Last contributor',
			labelKey: 'app.columns.last-contributor',
			value: (row) => row.properties?.['dc:lastContributor'] ?? '',
		},
		{
			id: 'state',
			label: 'State',
			labelKey: 'app.columns.state',
			value: (row) => row.state ?? '',
			hidden: true,
			sortable: false,
		},
		{
			id: 'version',
			label: 'Version',
			labelKey: 'app.columns.version',
			value: (row) => row.versionLabel ?? '',
			hidden: true,
			sortable: false,
		},
		{
			id: 'created',
			flex: 50,
			label: 'Created',
			labelKey: 'app.columns.created',
			value: (row) => row.properties?.['dc:created'] ?? '',
			hidden: true,
		},
		{
			id: 'author',
			label: 'Author',
			labelKey: 'app.columns.author',
			value: (row) => metadataLabel(row.properties?.['dc:creator'], 'mixed'),
			hidden: true,
		},
		{
			id: 'nature',
			label: 'Nature',
			labelKey: 'app.columns.nature',
			value: (row) => metadataLabel(row.properties?.['dc:nature'], 'mixed'),
			hidden: true,
			sortable: false,
		},
		{
			id: 'coverage',
			label: 'Coverage',
			labelKey: 'app.columns.coverage',
			value: (row) => metadataLabel(row.properties?.['dc:coverage'], 'mixed'),
			hidden: true,
			sortable: false,
		},
		{
			id: 'subjects',
			label: 'Subjects',
			labelKey: 'app.columns.subjects',
			value: (row) => metadataLabel(row.properties?.['dc:subjects'], 'mixed'),
			hidden: true,
			sortable: false,
		},
		{
			id: 'flags',
			label: 'Flags',
			labelKey: 'app.columns.flags',
			hidden: true,
			sortable: false,
		},
	];
}
