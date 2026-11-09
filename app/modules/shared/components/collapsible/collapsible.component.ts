import {
	Component,
	AfterViewInit,
	Input,
	ElementRef,
	HostBinding,
	ChangeDetectionStrategy,
} from '@angular/core';

@Component({
	selector: 'nx-collapsible',
	templateUrl: './collapsible.component.html',
	styleUrls: ['./collapsible.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapsibleComponent implements AfterViewInit {
	@Input()
	@HostBinding('class.collapsed')
	collapsed = false;

	@Input()
	@HostBinding('class.vertical')
	vertical = true;

	@HostBinding('style.max-height')
	maxHeight = this.vertical ? '0px' : 'auto';

	@HostBinding('style.max-width')
	maxWidth = this.vertical ? 'auto' : '0px';

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly elementRef: ElementRef) {}

	// --------------------------------------------------------------------------------------------------
	ngAfterViewInit() {
		setTimeout(() => {
			this.maxHeight = `${this.elementRef.nativeElement.scrollHeight}px`;
			this.maxWidth = `${this.elementRef.nativeElement.scrollWidth}px`;
		});
	}
}
