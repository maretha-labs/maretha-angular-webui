import {
	Directive,
	Input,
	ElementRef,
	AfterViewInit,
	OnChanges,
	SimpleChanges,
} from '@angular/core';

@Directive({ selector: '[nxAutofocus]' })
export class AutofocusDirective implements AfterViewInit, OnChanges {
	@Input()
	nxAutofocus = false;

	@Input()
	nxAutofocusDelay = 0;

	@Input()
	nxFocusAnyElement = false;

	private focusElement: any;

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly element: ElementRef) {}

	// --------------------------------------------------------------------------------------------------
	ngAfterViewInit(): void {
		if (
			this.element.nativeElement.nodeName === 'INPUT' ||
			this.element.nativeElement.nodeName === 'TEXTAREA' ||
			this.element.nativeElement.nodeName === 'SELECT'
		)
			this.focusElement = this.element.nativeElement;
		else
			this.focusElement = this.nxFocusAnyElement
				? this.element.nativeElement
				: this.element.nativeElement.querySelector('select, textarea, input');

		this.setFocus();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(_changes: SimpleChanges): void {
		this.setFocus();
	}

	// --------------------------------------------------------------------------------------------------
	private setFocus() {
		if (!this.nxAutofocus) return;

		const scheduledFrom = document.activeElement;
		setTimeout(() => {
			if (!this.focusElement) return;
			// A field the user moved to during the delay keeps the focus (and what they type).
			const active = document.activeElement;
			const field =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				active instanceof HTMLSelectElement ||
				(active instanceof HTMLElement && active.isContentEditable);
			if (field && active !== scheduledFrom && active !== this.focusElement) return;

			this.focusElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

			try {
				this.focusElement.select();
			} catch (_e) {
				this.focusElement.focus();
			}
		}, this.nxAutofocusDelay | 0);
	}
}
