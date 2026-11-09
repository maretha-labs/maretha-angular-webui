import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	afterNextRender,
	computed,
	inject,
	signal,
} from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';

const STORAGE_KEY = 'nuxeo.documentPage.sidePaneWidth';

@Component({
	selector: 'nx-document-pane-resize-handle',
	template: '',
	styleUrl: './document-pane-resize-handle.component.scss',
	host: {
		role: 'separator',
		'aria-orientation': 'vertical',
		'[attr.tabindex]': 'active() ? 0 : -1',
		'[hidden]': '!active()',
		'[attr.aria-label]': 'label()',
		'[attr.title]': 'label()',
		'[attr.aria-valuemin]': 'minWidth',
		'[attr.aria-valuemax]': 'maxWidth()',
		'[attr.aria-valuenow]': 'width()',
		'(pointerdown)': 'startResize($event)',
		'(pointermove)': 'moveResize($event)',
		'(pointerup)': 'finishResize($event)',
		'(pointercancel)': 'cancelResize()',
		'(lostpointercapture)': 'cancelResize()',
		'(keydown)': 'resizeWithKeyboard($event)',
		'(dblclick)': 'resetWidth()',
	},
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentPaneResizeHandleComponent {
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
	private readonly messages = inject(WebUiMessages);
	private preferredWidth: number | null = null;
	private drag: { id: number; x: number; width: number; rtl: boolean } | null = null;
	readonly minWidth = 280;
	readonly maxWidth = signal(280);
	readonly width = signal(360);
	readonly active = signal(false);
	readonly label = computed(() =>
		this.messages.text(
			'documentPage.resize.side',
			'Resize the information pane. Use Left/Right arrow keys to adjust width, Home or End for minimum or maximum, Enter or Space to reset.',
		),
	);

	constructor() {
		const destroy = inject(DestroyRef);
		afterNextRender(() => {
			try {
				const stored = this.element.ownerDocument.defaultView?.localStorage.getItem(STORAGE_KEY);
				const width = stored === null || stored === undefined ? NaN : Number(stored);
				if (Number.isFinite(width) && width > 0) this.preferredWidth = width;
			} catch {
				// The pane remains resizable when storage is unavailable.
			}
			const layout = this.layout();
			const pane = this.pane();
			const observer = new ResizeObserver(() => this.measure());
			if (layout) observer.observe(layout);
			if (pane) observer.observe(pane);
			const window = this.element.ownerDocument.defaultView;
			const resize = () => this.measure();
			window?.addEventListener('resize', resize);
			this.measure();
			destroy.onDestroy(() => {
				observer.disconnect();
				window?.removeEventListener('resize', resize);
			});
		});
		destroy.onDestroy(() => this.cancelResize());
	}

	measure(): void {
		const layout = this.layout();
		const pane = this.pane();
		if (!layout || !pane) return;
		const window = this.element.ownerDocument.defaultView;
		const style = window?.getComputedStyle(layout);
		const available = Math.max(
			0,
			layout.clientWidth -
				parseFloat(style?.paddingInlineStart || '0') -
				parseFloat(style?.paddingInlineEnd || '0') -
				parseFloat(style?.columnGap || '0'),
		);
		const active = !pane.hidden && (window?.innerWidth ?? 0) > 1024 && available >= 520;
		this.active.set(active);
		if (!active) {
			this.cancelResize();
			return;
		}
		const main = Math.max(240, Math.min(640, Math.floor(available * 0.5)));
		this.maxWidth.set(Math.max(this.minWidth, Math.floor(available - main)));
		if (!this.drag) this.applyWidth(this.preferredWidth);
		this.width.set(Math.round(pane.getBoundingClientRect().width));
	}

	startResize(event: PointerEvent): void {
		this.measure();
		if (event.button !== 0 || this.drag || !this.active()) return;
		event.preventDefault();
		this.element.focus({ preventScroll: true });
		this.element.setPointerCapture(event.pointerId);
		this.drag = {
			id: event.pointerId,
			x: event.clientX,
			width: this.width(),
			rtl: this.rtl(),
		};
	}

	moveResize(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || drag.id !== event.pointerId) return;
		this.measure();
		if (!this.drag || !this.active()) return;
		this.applyWidth(drag.width + (event.clientX - drag.x) * (drag.rtl ? 1 : -1));
	}

	finishResize(event: PointerEvent): void {
		this.measure();
		if (this.drag?.id !== event.pointerId) return;
		this.preferredWidth = this.width();
		this.persist();
		this.cancelResize();
	}

	cancelResize(): void {
		const drag = this.drag;
		this.drag = null;
		if (!drag) return;
		this.applyWidth(this.preferredWidth);
		if (this.element.hasPointerCapture(drag.id)) this.element.releasePointerCapture(drag.id);
	}

	resizeWithKeyboard(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.drag) {
			event.preventDefault();
			this.cancelResize();
			return;
		}
		this.measure();
		if (!this.active()) return;
		const step = event.shiftKey ? 50 : 10;
		let next: number;
		switch (event.key) {
			case 'ArrowLeft':
				next = this.width() + (this.rtl() ? -step : step);
				break;
			case 'ArrowRight':
				next = this.width() + (this.rtl() ? step : -step);
				break;
			case 'Home':
				next = this.minWidth;
				break;
			case 'End':
				next = this.maxWidth();
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				event.stopPropagation();
				this.resetWidth();
				return;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
		this.cancelResize();
		this.preferredWidth = this.clamp(next);
		this.applyWidth(this.preferredWidth);
		this.persist();
	}

	resetWidth(): void {
		this.measure();
		if (!this.active()) return;
		this.cancelResize();
		this.preferredWidth = null;
		this.applyWidth(null);
		this.persist();
	}

	private applyWidth(width: number | null): void {
		const layout = this.layout();
		if (!layout) return;
		if (width === null) layout.style.removeProperty('--nx-document-side-width');
		else {
			const clamped = this.clamp(width);
			layout.style.setProperty('--nx-document-side-width', `${clamped}px`);
			this.width.set(clamped);
		}
	}
	private clamp(width: number): number {
		return Math.round(Math.max(this.minWidth, Math.min(this.maxWidth(), width)));
	}
	private persist(): void {
		try {
			const storage = this.element.ownerDocument.defaultView?.localStorage;
			if (this.preferredWidth === null) storage?.removeItem(STORAGE_KEY);
			else storage?.setItem(STORAGE_KEY, String(this.preferredWidth));
		} catch {
			// An unavailable preference store must not interrupt resizing.
		}
	}
	private pane(): HTMLElement | null {
		return this.element.closest('.details-side');
	}
	private layout(): HTMLElement | null {
		return this.element.closest('.page-layout');
	}
	private rtl(): boolean {
		return (
			this.element.ownerDocument.defaultView?.getComputedStyle(this.element).direction === 'rtl'
		);
	}
}
