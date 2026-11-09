import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RepositorySearchComponent } from '../repository-search/repository-search.component';
import { AssetsSearchFiltersComponent } from '../repository-search/assets-search-filters.component';
import { SearchAuthorsFilterComponent } from './search-authors-filter.component';

/** Trash and Expired share the stock authors dropdown alongside ordinary checkbox facets. */
@Component({
	selector: 'nx-author-search-form',
	imports: [AssetsSearchFiltersComponent, SearchAuthorsFilterComponent],
	template: `
		<nx-assets-search-filters [search]="search()" [facets]="checkboxFacets()">
			<nx-search-authors-filter [search]="search()" />
		</nx-assets-search-filters>
	`,
	styles: ':host { display: contents; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorSearchFormComponent {
	readonly search = input.required<RepositorySearchComponent>();
	readonly checkboxFacets = computed(() =>
		this.search()
			.definition()
			.facets.filter((key) => key !== 'dc_creator_agg'),
	);
}
