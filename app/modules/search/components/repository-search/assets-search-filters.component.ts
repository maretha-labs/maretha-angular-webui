import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebUiIconComponent, WebUiMessagePipe } from '@maretha/webui-sdk';
import type { RepositorySearchComponent } from './repository-search.component';

/** Shared stock search form; the result host continues to own draft and applied criteria. */
@Component({
	selector: 'nx-assets-search-filters',
	imports: [WebUiNumberPipe, FormsModule, WebUiIconComponent, WebUiMessagePipe],
	templateUrl: './assets-search-filters.component.html',
	styleUrl: './assets-search-filters.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetsSearchFiltersComponent {
	readonly search = input.required<RepositorySearchComponent>();
	readonly facets = input<readonly string[]>();
	readonly facetKeys = computed(() => this.facets() ?? this.search().definition().facets);
	readonly autoControl = input(false);
}
