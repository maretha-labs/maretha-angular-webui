import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	ElementRef,
	afterNextRender,
	computed,
	effect,
	inject,
	signal,
} from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import {
	DrawerWidthPreferences,
	MAX_DRAWER_WIDTH,
	MIN_DRAWER_WIDTH,
} from 'app/helpers/drawer-width-preferences.service';
import { SidebarService } from 'app/helpers/sidebar.service';

interface DrawerDrag {
	pointerId: number;
	scope: string;
	x: number;
	startWidth: number;
	width: number;
	rtl: boolean;
}

/** The same separator resizes any active core or contributed drawer. */
@Component({
	selector: 'nx-drawer-resize-handle',
	template: '',
	styleUrl: './drawer-resize-handle.component.scss',
	host: {
		class: 'nx-drawer-resize-handle',
		role: 'separator',
		tabindex: '0',
		'aria-orientation': 'vertical',
		'aria-controls': 'nx-sidebar-drawer',
		'[attr.aria-label]': 'label()',
		'[attr.title]': 'help()',
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
export class DrawerResizeHandleComponent {
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
	private readonly preferences = inject(DrawerWidthPreferences);
	private readonly sidebar = inject(SidebarService);
	private readonly messages = inject(WebUiMessages);
	private drag: DrawerDrag | null = null;
	readonly minWidth = MIN_DRAWER_WIDTH;
	readonly maxWidth = signal(MAX_DRAWER_WIDTH);
	readonly width = signal(MIN_DRAWER_WIDTH);
	readonly label = computed(() =>
		this.messages.text('shell.drawerResize', 'Resize navigation drawer'),
	);
	readonly help = computed(() =>
		this.messages.text(
			'shell.drawerResizeHelp',
			'Drag to resize. Use arrow keys to adjust; press Enter or double-click to reset.',
		),
	);

	constructor() {
		const destroy = inject(DestroyRef);
		effect(() => {
			const scope = this.preferences.scope();
			const open = this.sidebar.drawerOpen();
			if (this.drag && (!open || scope !== this.drag.scope)) this.cancelResize();
		});
		afterNextRender(() => {
			const panel = this.panel();
			const observer = new ResizeObserver(() => this.measure());
			if (panel) observer.observe(panel);
			const window = this.element.ownerDocument.defaultView;
			const resize = () => {
				if ((window?.innerWidth ?? 0) <= 720) this.cancelResize();
				this.measure();
			};
			window?.addEventListener('resize', resize);
			this.measure();
			destroy.onDestroy(() => {
				observer.disconnect();
				window?.removeEventListener('resize', resize);
			});
		});
		destroy.onDestroy(() => this.cancelResize());
	}

	startResize(event: PointerEvent): void {
		if (event.button !== 0 || this.drag || !this.desktop()) return;
		const scope = this.preferences.scope();
		if (!scope || !this.sidebar.drawerOpen()) return;
		this.measure();
		event.preventDefault();
		this.element.focus({ preventScroll: true });
		this.element.setPointerCapture(event.pointerId);
		this.drag = {
			pointerId: event.pointerId,
			scope,
			x: event.clientX,
			startWidth: this.width(),
			width: this.width(),
			rtl: this.rtl(),
		};
		this.preferences.previewWidth(this.width());
	}

	moveResize(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (drag.scope !== this.preferences.scope() || !this.sidebar.drawerOpen()) {
			this.cancelResize();
			return;
		}
		drag.width = this.clamp(drag.startWidth + (event.clientX - drag.x) * (drag.rtl ? -1 : 1));
		this.preferences.previewWidth(drag.width);
	}

	finishResize(event: PointerEvent): void {
		const drag = this.drag;
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (drag.scope === this.preferences.scope() && this.sidebar.drawerOpen()) {
			if (drag.width !== drag.startWidth) this.preferences.saveWidth(this.clamp(drag.width));
		}
		this.cancelResize();
	}

	cancelResize(): void {
		const drag = this.drag;
		this.drag = null;
		this.preferences.cancelPreview();
		if (drag && this.element.hasPointerCapture(drag.pointerId))
			this.element.releasePointerCapture(drag.pointerId);
	}

	resizeWithKeyboard(event: KeyboardEvent): void {
		if (event.key === 'Escape' && this.drag) {
			event.preventDefault();
			event.stopPropagation();
			this.cancelResize();
			return;
		}
		if (!this.desktop() || !this.sidebar.drawerOpen()) return;
		const step = event.shiftKey ? 50 : 10;
		let next: number;
		this.measure();
		// Repeated keys use the target, rather than an in-flight CSS transition.
		const width = this.clamp(this.preferences.preferredWidth() ?? this.width());
		switch (event.key) {
			case 'ArrowLeft':
				next = width + (this.rtl() ? step : -step);
				break;
			case 'ArrowRight':
				next = width + (this.rtl() ? -step : step);
				break;
			case 'Home':
				next = MIN_DRAWER_WIDTH;
				break;
			case 'End':
				next = this.maxWidth();
				break;
			case 'Enter':
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
		this.preferences.saveWidth(this.clamp(next));
	}

	resetWidth(): void {
		this.cancelResize();
		this.preferences.resetWidth();
	}

	private panel(): HTMLElement | null {
		return this.element.closest('nx-sidebar')?.querySelector('#nx-sidebar-drawer') ?? null;
	}

	private desktop(): boolean {
		return (this.element.ownerDocument.defaultView?.innerWidth ?? 0) > 720;
	}

	private rtl(): boolean {
		return (
			this.element.ownerDocument.defaultView?.getComputedStyle(this.element).direction === 'rtl'
		);
	}

	private clamp(width: number): number {
		return Math.round(Math.max(MIN_DRAWER_WIDTH, Math.min(this.maxWidth(), width)));
	}

	private measure(): void {
		const panel = this.panel();
		if (!panel) return;
		const rail = this.element.closest('nx-sidebar')?.querySelector('#nx-primary-navigation');
		const viewport = this.element.ownerDocument.defaultView?.innerWidth ?? 0;
		// Match the shell's CSS limit while leaving at least 320px for the page.
		this.maxWidth.set(
			Math.max(
				MIN_DRAWER_WIDTH,
				Math.min(
					MAX_DRAWER_WIDTH,
					Math.floor(viewport - (rail?.getBoundingClientRect().width ?? 52) - 320),
				),
			),
		);
		this.width.set(Math.round(panel.getBoundingClientRect().width));
	}
}
