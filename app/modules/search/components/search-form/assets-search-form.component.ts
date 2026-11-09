import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { RepositorySearchComponent } from '../repository-search/repository-search.component';
import { AssetsSearchFiltersComponent } from '../repository-search/assets-search-filters.component';

/** Assets owns its optional auto-search control; the shared form needs no search-name rules. */
@Component({
	selector: 'nx-assets-search-form',
	imports: [AssetsSearchFiltersComponent],
	template: `<nx-assets-search-filters [search]="search()" [autoControl]="true" />`,
	styles: ':host { display: contents; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsSearchFormComponent {
	readonly search = input.required<RepositorySearchComponent>();
}
