import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { NgSelectComponent } from '@ng-select/ng-select';
import { SuggestionEscapeDirective } from 'app/directives/suggestion-escape.directive';
import type { RepositorySearchComponent } from '../repository-search/repository-search.component';

/** The provider-specific authors binding belongs to the form composition, not the shared page. */
@Component({
	selector: 'nx-search-authors-filter',
	imports: [FormsModule, WebUiMessagePipe, NgSelectComponent, SuggestionEscapeDirective],
	template: `
		<label [attr.for]="search().definition().id + '-authors'"
			>{{ 'defaultSearch.authors' | webuiMessage: 'Authors'
			}}<ng-select
				name="authors"
				[labelForId]="search().definition().id + '-authors'"
				nxSuggestionEscape
				[items]="buckets()"
				[multiple]="true"
				bindLabel="label"
				bindValue="key"
				[placeholder]="'defaultSearch.authors.placeholder' | webuiMessage: 'Search for authors…'"
				[(ngModel)]="search().facets['dc_creator_agg']"
				(ngModelChange)="search().filtersChanged()"
		/></label>
	`,
	styleUrl: './search-authors-filter.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchAuthorsFilterComponent {
	readonly search = input.required<RepositorySearchComponent>();
	readonly buckets = computed(() => this.search().buckets('dc_creator_agg'));
}
