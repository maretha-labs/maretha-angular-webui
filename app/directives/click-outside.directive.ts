import {
	Directive,
	ElementRef,
	Renderer2,
	Input,
	OnChanges,
	SimpleChanges,
	OnDestroy,
	Output,
	EventEmitter,
} from '@angular/core';

@Directive({ selector: '[nxClickOutside]' })
export class ClickOutsideDirective implements OnChanges, OnDestroy {
	@Input() nxClickOutside = false;

	@Input() nxClickOutsideEventDelay = 0;

	@Output() nxClickedOutside = new EventEmitter();

	@Input() nxClickOutsideDisabledWhenParentSelectorIs: string | undefined;

	private removeListener: (() => void) | undefined;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly elementRef: ElementRef,
		private readonly renderer: Renderer2,
	) {}

	// --------------------------------------------------------------------------------------------------
	ngOnChanges(changes: SimpleChanges) {
		if (changes['nxClickOutside']?.currentValue) {
			this.removeListener = this.renderer.listen('window', 'mousedown', (e: PointerEvent) => {
				if (
					!this.nxClickOutside ||
					this.elementRef.nativeElement === e.target ||
					this.elementRef.nativeElement.contains(e.target as HTMLElement)
				)
					return;

				if (
					!this.nxClickOutsideDisabledWhenParentSelectorIs ||
					!Array.from(
						document.querySelectorAll(this.nxClickOutsideDisabledWhenParentSelectorIs),
					).find((x) => x.contains(e.target as HTMLElement))
				)
					setTimeout(() => this.nxClickedOutside.emit(''), this.nxClickOutsideEventDelay);
			});
		} else {
			if (this.removeListener) this.removeListener();
		}
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		if (this.removeListener) this.removeListener();
	}
}
