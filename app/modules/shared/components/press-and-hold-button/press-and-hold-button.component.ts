import {
	Component,
	OnDestroy,
	Input,
	Output,
	EventEmitter,
	ContentChild,
	TemplateRef,
	HostListener,
	ElementRef,
	ChangeDetectionStrategy,
} from '@angular/core';
import { PlaceholderTemplateDirective } from 'app/directives/placeholder-template.directive';
import { Subject, takeUntil, takeWhile, timer } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';

@Component({
	selector: 'nx-press-and-hold-button',
	templateUrl: './press-and-hold-button.component.html',
	styleUrls: ['./press-and-hold-button.component.scss'],
	imports: [NgTemplateOutlet, FontAwesomeModule],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PressAndHoldButtonComponent implements OnDestroy {
	private readonly end$ = new Subject();

	@Input() timeout = 1.5;
	@Output() readonly execute = new EventEmitter();

	@ContentChild(PlaceholderTemplateDirective, { read: TemplateRef, static: false })
	placeholderTemplate: TemplateRef<any> | null = null;

	progress = 0;

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly elementRef: ElementRef) {}

	// --------------------------------------------------------------------------------------------------
	@HostListener('mousedown', ['$event'])
	beginCountdown(_event: any) {
		const timeout = this.timeout * 10;

		timer(0, 100)
			.pipe(
				takeUntil(this.end$),
				takeWhile((x) => x <= timeout),
			)
			.subscribe((x) => {
				this.progress = (x / timeout) * 100;

				this.elementRef.nativeElement.style.setProperty('--progress', this.progress);

				if (this.progress === 100) {
					this.reset();

					this.execute.emit();
				}
			});
	}

	// --------------------------------------------------------------------------------------------------
	@HostListener('window:mouseup', ['$event'])
	@HostListener('mouseout', ['$event'])
	stopCountdown(_event: any) {
		this.end$.next(0);

		this.reset();
	}

	// --------------------------------------------------------------------------------------------------
	private reset() {
		this.progress = 0;
		this.elementRef.nativeElement.style.setProperty('--progress', 0);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.end$.next(0);
	}
}
