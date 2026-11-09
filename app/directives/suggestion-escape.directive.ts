import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { NgSelectComponent } from '@ng-select/ng-select';

/**
 * Escape in an open suggestion list closes only the list, as stock's autocompletes do: the typed
 * text stays and the key goes no further, so the drawer or dialog around the picker stays open.
 * ng-select's own Escape clears a multiple picker's text and lets the key bubble on.
 */
@Directive({ selector: 'ng-select[nxSuggestionEscape]' })
export class SuggestionEscapeDirective {
	constructor() {
		const select = inject(NgSelectComponent);
		const host: HTMLElement = inject(ElementRef).nativeElement;
		const dismiss = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape' || event.isComposing || !select.isOpen()) return;
			event.preventDefault();
			event.stopPropagation();
			select.isOpen.set(false);
			select.itemsList.unmarkItem();
			select.closeEvent.emit();
		};
		// The capture phase runs before ng-select's own keydown handler on the same element.
		host.addEventListener('keydown', dismiss, true);
		inject(DestroyRef).onDestroy(() => host.removeEventListener('keydown', dismiss, true));
	}
}
