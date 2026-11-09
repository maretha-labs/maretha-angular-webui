import { ChangeDetectorRef, Directive, effect, inject, input } from '@angular/core';
import { NgSelectComponent } from '@ng-select/ng-select';
import { WebUiMessages } from '@maretha/webui-sdk';

/** Explicit caller labels win; default widget chrome tracks the application locale. */
// Apply to each imported ng-select so default widget text follows the app language.
// eslint-disable-next-line @angular-eslint/directive-selector
@Directive({ selector: 'ng-select' })
export class LocalizedSelectDirective {
	readonly notFoundText = input<string>();
	readonly typeToSearchText = input<string>();
	readonly addTagText = input<string>();
	readonly loadingText = input<string>();
	readonly clearAllText = input<string>();
	readonly ariaLabelDropdown = input<string>();
	private readonly select = inject(NgSelectComponent);
	private readonly messages = inject(WebUiMessages);
	private readonly changeDetector = inject(ChangeDetectorRef);

	constructor() {
		effect(() => {
			this.select.notFoundText.set(
				this.notFoundText() ?? this.messages.text('widgets.select.notFound', 'No items found'),
			);
			this.select.typeToSearchText.set(
				this.typeToSearchText() ??
					this.messages.text('widgets.select.typeToSearch', 'Type to search'),
			);
			this.select.addTagText.set(
				this.addTagText() ?? this.messages.text('widgets.select.addTag', 'Add item'),
			);
			this.select.loadingText.set(
				this.loadingText() ?? this.messages.text('widgets.select.loading', 'Loading…'),
			);
			this.select.clearAllText.set(
				this.clearAllText() ?? this.messages.text('widgets.select.clearAll', 'Clear all'),
			);
			this.select.ariaLabelDropdown.set(
				this.ariaLabelDropdown() ?? this.messages.text('widgets.select.dropdown', 'Open options'),
			);
			this.changeDetector.markForCheck();
		});
	}
}
