import {
	Directive,
	AfterViewInit,
	HostBinding,
	Input,
	ElementRef,
	Output,
	EventEmitter,
	OnChanges,
	SimpleChanges,
	OnDestroy,
	ChangeDetectorRef,
} from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { LazyCacheService } from 'app/helpers/lazy-cache.service';

@Directive({ selector: '[nxLazyLoad]' })
export class LazyLoadDirective implements AfterViewInit, OnChanges, OnDestroy {
	@HostBinding('attr.src') srcAttr: SafeResourceUrl | undefined;
	@HostBinding('attr.alt') altAttr: string | undefined;
	@Input() src: string | undefined;
	@Output() willLoadMedia = new EventEmitter();
	@Output() didLoadMedia = new EventEmitter();
	@Output() loadError = new EventEmitter();
	private observer?: IntersectionObserver;
	private request?: Subscription;
	private ready = false;
	constructor(
		private readonly el: ElementRef,
		private readonly cache: LazyCacheService,
		private readonly cdr: ChangeDetectorRef = undefined!,
	) {}
	private observe(): void {
		this.observer?.disconnect();
		this.request?.unsubscribe();
		this.srcAttr = undefined;
		if (!this.src) return;
		if (typeof IntersectionObserver === 'undefined') {
			this.load();
			return;
		}
		this.observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				this.observer?.disconnect();
				this.load();
			}
		});
		this.observer.observe(this.el.nativeElement);
	}
	private load(): void {
		if (!this.src) return;
		this.willLoadMedia.emit();
		this.request = this.cache.getBlob(this.src, false, true).subscribe({
			next: (value) => {
				this.srcAttr = value;
				this.cdr?.markForCheck();
			},
			error: () => this.failed(),
		});
	}
	private failed(): void {
		this.srcAttr = undefined;
		this.loadError.emit(this.el.nativeElement);
		this.cdr?.markForCheck();
	}
	ngAfterViewInit(): void {
		this.ready = true;
		this.el.nativeElement.onload = () => {
			this.didLoadMedia.emit();
			this.cdr?.markForCheck();
		};
		this.el.nativeElement.onerror = () => this.failed();
		this.observe();
	}
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['src'] && this.ready) this.observe();
	}
	ngOnDestroy(): void {
		this.observer?.disconnect();
		this.request?.unsubscribe();
		this.el.nativeElement.onload = null;
		this.el.nativeElement.onerror = null;
	}
}
