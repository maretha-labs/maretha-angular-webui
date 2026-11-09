import { DestroyRef, Directive, effect, inject, input } from '@angular/core';
import { SuggestionLimits, suggestionMinCharsText, WebUiMessages } from '@maretha/webui-sdk';
import { NgSelectComponent } from '@ng-select/ng-select';

/**
 * Suggestion limits on an ng-select typeahead, as stock nuxeo-selectivity: below `minChars` it
 * searches nothing and asks for more characters, and a term shortened below it clears the old
 * results. The component's typeahead pipeline applies the pause (`suggestionTerms`).
 */
@Directive({ selector: 'ng-select[nxSuggestionLimits]' })
export class SuggestionLimitsDirective {
	readonly limits = input.required<SuggestionLimits>({ alias: 'nxSuggestionLimits' });
	private readonly select = inject(NgSelectComponent);
	private readonly messages = inject(WebUiMessages);

	constructor() {
		effect(() => {
			const { minChars } = this.limits();
			this.select.minTermLength.set(minChars);
			// Empty restores ng-select's own text: with no minimum there is nothing to ask for.
			this.select.typeToSearchText.set(
				minChars > 0 ? suggestionMinCharsText(this.messages, minChars) : '',
			);
		});
		// ng-select forwards only long-enough terms; a shorter one reaches the pipeline from here.
		const subscription = this.select.searchEvent.subscribe(({ term }) => {
			if ((term ?? '').trim().length < this.limits().minChars) this.select.typeahead()?.next(term);
		});
		inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
	}
}
