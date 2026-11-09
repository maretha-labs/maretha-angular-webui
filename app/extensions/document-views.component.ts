import { WebUiLocale } from './i18n/webui-locale';
import { localizedState } from './i18n/localized-state';
import { WebUiMessagePipe, WebUiMessages } from './webui-messages';
import { NavigationCancel, NavigationError, NavigationSkipped, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { documentViewParameter } from './document-view';
import {
	afterNextRender,
	Injector,
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	ElementRef,
	inject,
	input,
	model,
	OnChanges,
	SimpleChanges,
	output,
	signal,
	untracked,
	viewChildren,
} from '@angular/core';
import { ContributionOutletComponent } from './contribution-outlet.component';
import { WebUiAppState, withSharedSlotModel } from './app-state';
import {
	DocumentViewChange,
	DocumentViewContext,
	DocumentViewItemContext,
	ResolvedDocumentView,
	resolveDocumentViews,
} from './document-view';
import { ExtensionRegistry } from './extension-registry.service';
import { ViewDeparture, ViewNavigation } from './view-navigation';

let nextHostId = 0;

@Component({
	selector: 'nx-document-views, nx-paired-views',
	standalone: true,
	imports: [ContributionOutletComponent, WebUiMessagePipe],
	templateUrl: './document-views.component.html',
	styleUrl: './document-views.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentViewsComponent implements OnChanges {
	private readonly messages = inject(WebUiMessages);
	private readonly locale = inject(WebUiLocale);
	private labelProvided = false;
	ngOnChanges(changes: SimpleChanges): void {
		if (changes['label']) this.labelProvided = true;
	}
	effectiveLabel(): string {
		return this.labelProvided
			? this.label()
			: this.messages.format('sdk.views.label', {}, 'Document views');
	}
	readonly context = input.required<DocumentViewContext>();
	private readonly user = inject(WebUiAppState).user;
	readonly slotContext = computed(
		() => withSharedSlotModel(this.context(), this.user()) as DocumentViewContext,
	);
	readonly itemSlot = input('DOCUMENT_VIEWS_ITEMS');
	readonly pageSlot = input('DOCUMENT_VIEWS_PAGES');
	readonly label = input('Document views');
	readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
	readonly presentation = input<'default' | 'administration'>('default');
	readonly navigationParameter = input('view');
	/** Administration uses the shell drawer; other hosts retain their own tabs. */
	readonly navigationVisible = input(true);
	readonly selectedView = model<string | null>(null);
	readonly navigationPath = input<string | null>(null);
	readonly viewChange = output<DocumentViewChange>();
	readonly pending = signal(false);
	readonly departureMessage = localizedState(null);
	private readonly guardViewId = signal<string | null>(null);
	readonly visibleViewId = computed(() => this.guardViewId() ?? this.active()?.viewId ?? null);
	private readonly injector = inject(Injector);
	private readonly registry = inject(ExtensionRegistry);
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly destroyRef = inject(DestroyRef);
	private readonly focusedView = signal<string | null>(null);
	private readonly acceptedView = signal<string | null>(null);
	private readonly visited = signal<ReadonlySet<string>>(new Set());
	private lastScope: string | undefined;
	private requestId = 0;
	private approved?: { viewId: string | null; scope: string };
	private readonly hostId = `nx-document-views-${++nextHostId}`;
	private readonly outlets = viewChildren(ContributionOutletComponent);
	readonly resolution = computed(() =>
		resolveDocumentViews(this.registry, this.slotContext(), {
			items: this.itemSlot(),
			pages: this.pageSlot(),
		}),
	);
	readonly scope = computed(() => {
		const document = this.slotContext().document;
		return JSON.stringify([
			this.itemSlot(),
			this.pageSlot(),
			document?.['repository'] ?? 'default',
			document?.['uid'] ?? document?.['path'] ?? null,
		]);
	});
	readonly active = computed<ResolvedDocumentView | null>(
		() =>
			this.resolution().views.find((view) => view.viewId === this.acceptedView()) ??
			this.resolution().views[0] ??
			null,
	);
	readonly activeLabel = computed(() => {
		const inputs = this.active()?.item.inputs;
		const label = inputs?.['label'];
		const key = inputs?.['labelKey'];
		return this.messages.text(
			typeof key === 'string' ? key : undefined,
			typeof label === 'string' ? label : this.effectiveLabel(),
		);
	});
	readonly pages = computed(() =>
		this.resolution()
			.views.filter(
				(view) =>
					view.viewId === this.active()?.viewId ||
					(view.page.retain && this.visited().has(view.viewId)),
			)
			.map((view) => ({ ...view, renderKey: this.scope() + ':' + view.viewId })),
	);
	/** Empty panel shells keep every tab's aria-controls reference valid before lazy activation. */
	protected readonly panels = computed(() =>
		this.resolution().views.map((view) => ({
			...view,
			renderKey: this.scope() + ':' + view.viewId,
			mounted: this.pages().some((page) => page.viewId === view.viewId),
		})),
	);
	readonly tabs = computed(() =>
		this.resolution().views.map((view) => ({
			...view,
			context: {
				...this.slotContext(),
				viewId: view.viewId,
				selected: view.viewId === this.visibleViewId(),
				tabId: this.tabId(view.viewId),
				panelId: this.panelId(view.viewId),
				tabIndex:
					view.viewId === (this.guardViewId() ?? this.focusedView() ?? this.active()?.viewId)
						? 0
						: -1,
				select: () => {
					void this.select(view.viewId);
				},
			} satisfies DocumentViewItemContext,
		})),
	);
	readonly diagnostics = computed(() => [
		...this.resolution().diagnostics,
		...this.outlets().flatMap((outlet) => (outlet.diagnostic() ? [outlet.diagnostic()!] : [])),
	]);

	constructor() {
		inject(Router, { optional: true })
			?.events.pipe(takeUntilDestroyed())
			.subscribe((event) => {
				if (
					event instanceof NavigationCancel ||
					event instanceof NavigationError ||
					event instanceof NavigationSkipped
				)
					this.approved = undefined;
			});
		this.destroyRef.onDestroy(inject(ViewNavigation).register((url) => this.canNavigate(url)));
		const window = this.element.nativeElement.ownerDocument.defaultView;
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (!this.outlets().some((outlet) => outlet.hasPendingChanges())) return;
			event.preventDefault();
			event.returnValue = '';
		};
		window?.addEventListener('beforeunload', beforeUnload);
		this.destroyRef.onDestroy(() => window?.removeEventListener('beforeunload', beforeUnload));
		effect(() => {
			const scope = this.scope();
			const selected = this.selectedView();
			const views = this.resolution().views;
			untracked(() => {
				const target =
					views.find((view) => view.viewId === selected)?.viewId ?? views[0]?.viewId ?? null;
				if (this.lastScope !== scope) {
					this.lastScope = scope;
					this.requestId++;
					this.pending.set(false);
					this.guardViewId.set(null);
					this.approved = undefined;
					this.visited.set(new Set());
					this.commit(target, selected !== target ? true : undefined);
				} else if (!views.some((view) => view.viewId === this.acceptedView())) {
					const ownsFocus = this.element.nativeElement.contains(
						this.element.nativeElement.ownerDocument.activeElement,
					);
					this.requestId++;
					this.pending.set(false);
					this.guardViewId.set(null);
					this.commit(target, true);
					if (ownsFocus) this.focus(target);
				} else if (selected !== this.acceptedView()) {
					if (this.approved?.viewId === target && this.approved.scope === scope) {
						this.approved = undefined;
						this.commit(target, selected !== target ? true : undefined);
					} else void this.change(target, selected !== target ? true : undefined);
				}
				const available = new Set(views.map((view) => view.viewId));
				this.visited.update((visited) => new Set([...visited].filter((id) => available.has(id))));
			});
		});
		effect(() => {
			const focused = this.focusedView();
			if (focused && !this.resolution().views.some((view) => view.viewId === focused)) {
				const ownsFocus = this.element.nativeElement.contains(
					this.element.nativeElement.ownerDocument.activeElement,
				);
				this.focusedView.set(this.active()?.viewId ?? null);
				if (ownsFocus) this.focus(this.active()?.viewId ?? null);
			}
		});
	}

	async select(viewId: string): Promise<boolean> {
		if (!this.resolution().views.some((view) => view.viewId === viewId)) return false;
		this.focusedView.set(viewId);
		return this.change(viewId, false);
	}

	private async change(viewId: string | null, replaceUrl?: boolean): Promise<boolean> {
		if (this.acceptedView() === viewId) {
			this.requestId++;
			this.pending.set(false);
			this.guardViewId.set(null);
			this.commit(viewId, replaceUrl);
			return true;
		}
		const allowed = await this.checkDeparture({ reason: 'tab', nextViewId: viewId }, false);
		if (
			allowed &&
			(viewId === null || this.resolution().views.some((view) => view.viewId === viewId))
		) {
			this.commit(viewId, replaceUrl);
			return true;
		}
		if (!this.pending() && !this.destroyRef.destroyed) {
			this.selectedView.set(this.acceptedView());
			this.focusedView.set(this.acceptedView());
			this.viewChange.emit({ viewId: this.acceptedView(), replaceUrl: true });
			this.focus(this.acceptedView());
		}
		return false;
	}

	private commit(viewId: string | null, replaceUrl?: boolean): void {
		this.acceptedView.set(viewId);
		this.selectedView.set(viewId);
		this.focusedView.set(viewId);
		this.departureMessage.set(null);
		if (viewId) this.visited.update((visited) => new Set([...visited, viewId]));
		if (replaceUrl !== undefined) this.viewChange.emit({ viewId, replaceUrl });
	}

	canDeactivate(departure: ViewDeparture): Promise<boolean> {
		return this.checkDeparture(departure, true);
	}

	private async canNavigate(url: string): Promise<boolean> {
		if (!this.navigationPath()) return true;
		const destination = new URL(url, 'http://local.invalid');
		const sameDocument = destination.pathname === this.navigationPath();
		const requested =
			this.navigationParameter() === 'view'
				? documentViewParameter(destination.searchParams)
				: destination.searchParams.get(this.navigationParameter());
		const nextViewId = sameDocument
			? (this.resolution().views.find((view) => view.viewId === requested)?.viewId ??
				this.resolution().views[0]?.viewId ??
				null)
			: null;
		if (sameDocument && nextViewId === this.acceptedView()) return true;
		const allowed = await this.checkDeparture(
			{ reason: 'navigation', nextViewId, nextUrl: url },
			!sameDocument,
		);
		if (allowed && sameDocument) this.approved = { viewId: nextViewId, scope: this.scope() };
		return allowed;
	}

	private async checkDeparture(departure: ViewDeparture, allPages: boolean): Promise<boolean> {
		const request = ++this.requestId;
		const scope = this.scope();
		const snapshot = this.registry.snapshot();
		const activeKey = this.active()?.page.key;
		const pages = this.outlets().filter(
			(outlet) =>
				outlet.contribution().slot === this.pageSlot() &&
				(allPages || outlet.contribution().key === activeKey),
		);
		this.pending.set(true);
		this.guardViewId.set(null);
		this.departureMessage.set(null);
		let allowed = true;
		for (const page of pages) {
			if (allPages && page.contribution().key !== activeKey && page.hasPendingChanges()) {
				const owner = this.resolution().views.find(
					(view) => view.page.key === page.contribution().key,
				);
				if (owner) {
					this.guardViewId.set(owner.viewId);
					this.departureMessage.setMessage(
						'sdk.views.unsaved',
						'Review this view’s unsaved changes before leaving.',
					);
					afterNextRender(
						() => {
							if (
								!this.destroyRef.destroyed &&
								this.requestId === request &&
								this.guardViewId() === owner.viewId
							)
								this.element.nativeElement
									.querySelector<HTMLElement>('#' + this.panelId(owner.viewId))
									?.focus();
						},
						{ injector: this.injector },
					);
				}
			}
			if (!(await page.canDeactivate(departure))) {
				allowed = false;
				break;
			}
			if (request !== this.requestId || this.destroyRef.destroyed || scope !== this.scope())
				return false;
		}
		if (request !== this.requestId || this.destroyRef.destroyed || scope !== this.scope())
			return false;
		this.pending.set(false);
		this.guardViewId.set(null);
		if (snapshot !== this.registry.snapshot()) allowed = false;
		if (allowed) this.departureMessage.set(null);
		if (!allowed)
			this.departureMessage.setMessage(
				'sdk.views.cancelled',
				'Navigation cancelled. Your changes are still available.',
			);
		return allowed;
	}

	protected onTabFocus(event: FocusEvent): void {
		const tab = (event.target as HTMLElement).closest('[role="tab"]');
		const view = this.resolution().views.find((view) => tab?.id === this.tabId(view.viewId));
		if (view) this.focusedView.set(view.viewId);
	}
	keyDown(event: KeyboardEvent): void {
		const tabs = [
			...this.element.nativeElement.querySelectorAll<HTMLElement>(
				':scope > .view-tabs [role="tab"]',
			),
		];
		const index = tabs.findIndex(
			(tab) => tab === event.target || tab.contains(event.target as Node),
		);
		const vertical = this.orientation() === 'vertical';
		const rtl = this.locale.direction() === 'rtl';
		const previous = vertical ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
		const next = vertical ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight';
		if (index < 0 || ![previous, next, 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		const nextIndex =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? tabs.length - 1
					: (index + (event.key === next ? 1 : -1) + tabs.length) % tabs.length;
		const view = this.resolution().views[nextIndex];
		if (!view) return;
		this.focusedView.set(view.viewId);
		tabs[nextIndex].focus();
	}

	tabId(viewId: string): string {
		return `${this.hostId}-tab-${viewId}`;
	}
	panelId(viewId: string): string {
		return `${this.hostId}-panel-${viewId}`;
	}

	private focus(viewId: string | null): void {
		queueMicrotask(() => {
			if (this.destroyRef.destroyed) return;
			if (!viewId) {
				this.element.nativeElement.querySelector<HTMLElement>('.view-empty')?.focus();
				return;
			}
			this.element.nativeElement
				.querySelectorAll<HTMLElement>(':scope > .view-tabs [role="tab"]')
				.forEach((tab) => {
					if (tab.id === this.tabId(viewId)) tab.focus();
				});
		});
	}
}
