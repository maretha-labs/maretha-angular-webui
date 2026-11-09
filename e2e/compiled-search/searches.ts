import { DEFAULT_RESULT_COLUMNS } from 'app/modules/search/helpers/repository-search-columns';
import { defineSearch } from 'app/modules/search/helpers/repository-search-definitions';

/** One additional authored search, composed with the production provider set in main.ts. */
export const fixtureSearches = [
	defineSearch({
		id: 'example-documents',
		label: 'Example documents',
		labelKey: 'fixture.exampleDocuments',
		provider: 'default_search',
		request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
		form: {
			submission: 'explicit',
			loadComponent: () => import('./example-form.component').then((m) => m.ExampleFormComponent),
		},
		drawer: { order: 120, icon: 'nuxeo-navigation:search' },
		facets: [],
		defaultMode: 'list',
		views: {
			grid: {
				loadComponent: () => import('./example-card.component').then((m) => m.ExampleCardComponent),
			},
			list: {
				loadComponent: () => import('./example-card.component').then((m) => m.ExampleCardComponent),
			},
			table: {
				columns: DEFAULT_RESULT_COLUMNS,
				cells: {
					title: () => import('./example-cell.component').then((m) => m.ExampleCellComponent),
				},
			},
		},
	}),
] as const;
