import { DOCUMENT } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	DestroyRef,
	Directive,
	ElementRef,
	Injectable,
	ViewContainerRef,
	effect,
	inject,
	input,
	output,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AriaDescriber } from '@angular/cdk/a11y';
import {
	Overlay,
	OverlayContainer,
	OverlayPositionBuilder,
	OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { NavigationStart, Router } from '@angular/router';
import { WebUiLocale } from './i18n/webui-locale';

/** Keep rail labels above the drawer without changing other CDK overlays. */
@Injectable({ providedIn: 'root' })
class RailTooltipOverlayContainer extends OverlayContainer {
	protected override _createContainer(): void {
		super._createContainer();
		const container = this._containerElement;
		if (container) {
			container.classList.add('nx-rail-tooltip-container');
			container.style.zIndex = '1061';
		}
	}
}

@Injectable({ providedIn: 'root' })
class RailTooltipCoordinator {
	private current?: RailTooltipDirective;
	claim(tooltip: RailTooltipDirective): void {
		if (this.current === tooltip) return;
		this.current?.dismiss();
		this.current = tooltip;
	}
	release(tooltip: RailTooltipDirective): void {
		if (this.current === tooltip) this.current = undefined;
	}
}

@Component({
	selector: 'nx-rail-tooltip',
	template: '<span class="tooltip-inner">{{ text() }}</span>',
	host: {
		class: 'nx-rail-tooltip',
		role: 'tooltip',
		'aria-hidden': 'true',
		'[id]': 'tooltipId()',
		'(mouseenter)': 'entered.emit()',
		'(mouseleave)': 'left.emit($event)',
	},
	styles: `
		:host {
			display: block;
			max-width: calc(100vw - 16px);
			opacity: 0;
			animation: nx-rail-tooltip-in 500ms ease-in forwards;
		}
		.tooltip-inner {
			display: block;
			box-sizing: border-box;
			max-width: calc(100vw - 16px);
			padding: 8px;
			border: 0;
			border-radius: 2px;
			background: var(--nuxeo-sidebar-background, #060826);
			color: #fff;
			font:
				400 13px / 13px Inter,
				sans-serif;
			letter-spacing: 0.16px;
			text-align: center;
			white-space: normal;
			overflow-wrap: anywhere;
		}
		@keyframes nx-rail-tooltip-in {
			to {
				opacity: 0.9;
			}
		}
		@media (prefers-reduced-motion: reduce) {
			:host {
				animation: none;
				opacity: 0.9;
			}
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class RailTooltipComponent {
	readonly text = input('');
	readonly tooltipId = input('');
	readonly entered = output<void>();
	readonly left = output<MouseEvent>();
}

let nextTooltipId = 0;

/** A label for icon-only rail actions; navigation and accessible names stay on the trigger. */
@Directive({
	selector: '[nxRailTooltip]',
	providers: [
		Overlay,
		OverlayPositionBuilder,
		{ provide: OverlayContainer, useExisting: RailTooltipOverlayContainer },
	],
	host: {
		'[attr.title]': 'null',
		'(mouseenter)': 'onMouseEnter()',
		'(mouseleave)': 'onMouseLeave($event)',
		'(pointerenter)': 'onPointerEnter($event)',
		'(pointerdown)': 'onPointerDown($event)',
		'(focus)': 'onFocus()',
		'(blur)': 'onBlur()',
		'(click)': 'dismiss()',
		'(keydown)': 'onKeydown($event)',
	},
})
export class RailTooltipDirective {
	readonly nxRailTooltip = input<string | undefined>('');
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
	private readonly document = inject(DOCUMENT);
	private readonly overlay = inject(Overlay);
	private readonly viewContainer = inject(ViewContainerRef);
	private readonly locale = inject(WebUiLocale);
	private readonly ariaDescriber = inject(AriaDescriber);
	private readonly coordinator = inject(RailTooltipCoordinator);
	private readonly tooltipId = `nx-rail-tooltip-${++nextTooltipId}`;
	private overlayRef?: OverlayRef;
	private componentRef?: ComponentRef<RailTooltipComponent>;
	private observer?: MutationObserver;
	private hovering = false;
	private focused = false;
	private overLabel = false;
	private touch = false;
	private pointerFocus = false;
	private describedText?: string;
	private readonly documentKeydown = (event: KeyboardEvent) => {
		if (
			this.contains(this.element, event.target) ||
			this.contains(this.overlayRef?.overlayElement, event.target)
		)
			this.onKeydown(event);
		else if (event.key === 'Escape') this.dismiss();
	};
	private readonly windowResize = () => {
		if (!this.available()) this.dismiss();
	};

	constructor() {
		effect(() => {
			const text = this.nxRailTooltip()?.trim();
			const direction = this.locale.direction();
			if (!this.overlayRef) return;
			if (!text || !this.available()) {
				this.dismiss();
				return;
			}
			this.componentRef?.setInput('text', text);
			this.componentRef?.changeDetectorRef.detectChanges();
			this.describe(text);
			this.overlayRef.setDirection(direction);
			this.overlayRef.updatePosition();
		});
		inject(Router, { optional: true })
			?.events.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				if (event instanceof NavigationStart) this.dismiss();
			});
		inject(DestroyRef).onDestroy(() => this.dismiss());
	}

	onPointerEnter(event: PointerEvent): void {
		this.touch = event.pointerType === 'touch';
	}

	onPointerDown(event: PointerEvent): void {
		this.touch = event.pointerType === 'touch';
		this.pointerFocus = true;
		this.dismiss();
	}

	onMouseEnter(): void {
		if (this.touch) return;
		this.hovering = true;
		this.show();
	}

	onMouseLeave(event: MouseEvent): void {
		this.hovering = false;
		this.overLabel = this.contains(this.overlayRef?.overlayElement, event.relatedTarget);
		this.hideWhenInactive();
	}

	onFocus(): void {
		this.focused = true;
		if (!this.pointerFocus && !this.touch) this.show();
	}

	onBlur(): void {
		this.focused = false;
		this.pointerFocus = false;
		this.touch = false;
		this.hideWhenInactive();
	}

	onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.overlayRef) {
			event.preventDefault();
			event.stopPropagation();
			this.dismiss();
		} else if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
			this.dismiss();
		}
	}

	dismiss(): void {
		const ref = this.overlayRef;
		this.overlayRef = undefined;
		this.componentRef = undefined;
		this.overLabel = false;
		this.observer?.disconnect();
		this.observer = undefined;
		this.document.removeEventListener('keydown', this.documentKeydown, true);
		this.document.defaultView?.removeEventListener('resize', this.windowResize);
		this.describe();
		this.coordinator.release(this);
		ref?.dispose();
	}

	private show(): void {
		const text = this.nxRailTooltip()?.trim();
		if (this.overlayRef || !text || !this.available()) return;
		this.coordinator.claim(this);
		const position = this.overlay
			.position()
			.flexibleConnectedTo(this.element)
			.withPositions([
				{ originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center' },
				{ originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center' },
			])
			.withFlexibleDimensions(false)
			.withPush(true)
			.withViewportMargin(8);
		const ref = this.overlay.create({
			positionStrategy: position,
			direction: this.locale.direction(),
			scrollStrategy: this.overlay.scrollStrategies.reposition({ autoClose: true }),
			panelClass: 'nx-rail-tooltip-pane',
			usePopover: false,
		});
		this.overlayRef = ref;
		const component = ref.attach(new ComponentPortal(RailTooltipComponent, this.viewContainer));
		this.componentRef = component;
		component.setInput('text', text);
		component.setInput('tooltipId', this.tooltipId);
		component.changeDetectorRef.detectChanges();
		component.instance.entered.subscribe(() => (this.overLabel = true));
		component.instance.left.subscribe((event) => {
			this.overLabel = false;
			this.hovering = this.contains(this.element, event.relatedTarget);
			this.hideWhenInactive();
		});
		ref.detachments().subscribe(() => this.dismiss());
		ref.updatePosition();
		this.describe(text);
		// Capture this trigger's Escape before its drawer, without consuming other controls' keys.
		this.document.addEventListener('keydown', this.documentKeydown, true);
		this.document.defaultView?.addEventListener('resize', this.windowResize);
		this.observeVisibility();
	}

	private hideWhenInactive(): void {
		if (!this.hovering && !this.focused && !this.overLabel) this.dismiss();
	}

	private available(): boolean {
		if (
			!this.element.isConnected ||
			!this.element.getClientRects().length ||
			this.element.matches(':disabled') ||
			this.element.closest('[hidden], [inert], [aria-hidden="true"]')
		)
			return false;
		const style = this.document.defaultView?.getComputedStyle(this.element);
		const bounds = this.element.getBoundingClientRect();
		const viewport = this.document.documentElement;
		return (
			style?.display !== 'none' &&
			style?.visibility !== 'hidden' &&
			style?.visibility !== 'collapse' &&
			bounds.right > 0 &&
			bounds.bottom > 0 &&
			bounds.left < viewport.clientWidth &&
			bounds.top < viewport.clientHeight
		);
	}

	private observeVisibility(): void {
		this.observer = new MutationObserver(() => {
			if (!this.available()) this.dismiss();
		});
		for (
			let ancestor: HTMLElement | null = this.element;
			ancestor;
			ancestor = ancestor.parentElement
		)
			this.observer.observe(ancestor, {
				attributes: true,
				attributeFilter: ['disabled', 'hidden', 'inert', 'aria-hidden', 'class', 'style'],
			});
	}

	private contains(element: HTMLElement | undefined, target: EventTarget | null): boolean {
		return !!element && target instanceof Node && element.contains(target);
	}

	private describe(text?: string): void {
		if (this.describedText === text) return;
		if (this.describedText)
			this.ariaDescriber.removeDescription(this.element, this.describedText, 'tooltip');
		this.describedText = text;
		// Use CDK's hidden description so the body overlay is not duplicate screen-reader content.
		if (text) this.ariaDescriber.describe(this.element, text, 'tooltip');
	}
}
