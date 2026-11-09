import { localizedText, messageText } from 'app/helpers/localized-message';
import {
	Component,
	ChangeDetectionStrategy,
	DestroyRef,
	computed,
	inject,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import {
	AdministrationContext,
	ExtensionRegistry,
	resolveDocumentViews,
	WebUiMessagePipe,
	WebUiMessages,
	WebUiIconComponent,
	ContributionOutletComponent,
	DocumentViewItemContext,
	DocumentViewTabComponent,
} from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { toApplicationUser } from 'app/helpers/application-user';
import { SidebarService } from 'app/helpers/sidebar.service';
import { environment } from 'environments/environment';

@Component({
	selector: 'nx-administration-drawer',
	imports: [WebUiMessagePipe, WebUiIconComponent, ContributionOutletComponent],
	template: `<header class="nx-drawer__header">
			<h6>{{ 'app.administration' | webuiMessage: 'Administration' }}</h6>
		</header>
		<nav
			[attr.aria-label]="
				'app.modules.administration-drawer.administration-d96529' | webuiMessage: 'Administration'
			"
			tabindex="-1"
			(keydown)="onKeydown($event)"
		>
			@for (view of menuViews(); track view.viewId) {
				@if (view.item.component === defaultMenuComponent) {
					<button
						type="button"
						[id]="view.context.tabId"
						[disabled]="pending()"
						[attr.aria-current]="view.context.selected ? 'page' : null"
						(click)="select(view.viewId)"
					>
						@if (icon(view); as name) {
							<nx-webui-icon [name]="name" />
						}
						{{ label(view) }}
					</button>
				} @else {
					<nx-contribution-outlet [contribution]="view.item" [context]="view.context" />
				}
			}
		</nav>
		@if (error()) {
			<p role="alert">{{ error() }}</p>
		}`,
	styleUrls: ['./sidebar.component.scss'],
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			flex: 1;
			min-height: 0;
		}
		nav {
			overflow: auto;
		}
		nav button {
			display: flex;
			align-items: center;
			gap: 8px;
			width: 100%;
			text-align: start;
			border: 0;
			background: transparent;
			color: inherit;
			padding: 12px 16px;
			min-height: 48px;
			border-radius: 24px;
		}
		nav button:hover,
		nav button[aria-current='page'] {
			background: var(--nuxeo-pill-background, #eee);
		}
		nav button:focus-visible {
			outline: 2px solid var(--nuxeo-primary-color);
			outline-offset: -2px;
		}
		p {
			padding: 16px;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdministrationDrawerComponent {
	readonly defaultMenuComponent = DocumentViewTabComponent;
	private readonly messages = inject(WebUiMessages);
	private readonly auth = inject(AuthService);
	private readonly registry = inject(ExtensionRegistry);
	private readonly router = inject(Router);
	private readonly sidebar = inject(SidebarService);
	private readonly destroyRef = inject(DestroyRef);
	private readonly route = toSignal(
		this.router.events.pipe(
			filter((event): event is NavigationEnd => event instanceof NavigationEnd),
			map((event) => event.urlAfterRedirects),
		),
		{ initialValue: this.router.url },
	);
	readonly pending = signal(false);
	readonly error = localizedText('');
	readonly context = computed<AdministrationContext>(() => {
		const user = this.auth.userInfo();
		return {
			document: null,
			noEdit: false,
			user: toApplicationUser(user),
			features: {
				retention: environment.addons.retention,
			},
		};
	});
	readonly views = computed(
		() =>
			resolveDocumentViews(this.registry, this.context(), {
				items: 'ADMINISTRATION_MENU',
				pages: 'ADMINISTRATION_PAGES',
			}).views,
	);
	readonly selected = computed(() =>
		/^\/(settings|page\/administration)(?:[/?#]|$)/.test(this.route())
			? (this.router.parseUrl(this.route()).queryParams['admin'] ?? null)
			: null,
	);
	readonly menuViews = computed(() =>
		this.views().map((view) => ({
			...view,
			context: {
				...this.context(),
				viewId: view.viewId,
				selected: this.selected() === view.viewId,
				tabId: `nx-administration-drawer-${encodeURIComponent(view.viewId)}`,
				// Drawer items navigate routes; the page host owns its panel IDs.
				panelId: '',
				tabIndex: 0,
				select: () => {
					void this.select(view.viewId);
				},
			} satisfies DocumentViewItemContext,
		})),
	);
	label(view: ReturnType<typeof resolveDocumentViews>['views'][number]): string {
		const key = view.item.inputs?.['labelKey'];
		return this.messages.text(
			typeof key === 'string' ? key : undefined,
			String(view.item.inputs?.['label'] ?? view.viewId),
		);
	}
	icon(view: ReturnType<typeof resolveDocumentViews>['views'][number]): string | null {
		const value = view.item.inputs?.['icon'];
		return typeof value === 'string' && value ? value : null;
	}
	async select(viewId: string): Promise<void> {
		if (this.pending() || !this.views().some((view) => view.viewId === viewId)) return;
		const userId = this.context().user?.id;
		this.pending.set(true);
		this.error.set('');
		try {
			const tree = this.router.createUrlTree(['/settings'], { queryParams: { admin: viewId } });
			const same = this.router.serializeUrl(tree) === this.router.url;
			if (
				(same || (await this.router.navigateByUrl(tree))) &&
				!this.destroyRef.destroyed &&
				this.context().user?.id === userId &&
				this.sidebar.activeTab() === 'administration' &&
				window.matchMedia('(max-width: 720px)').matches
			)
				this.sidebar.closeDrawer();
		} catch {
			this.error.set(
				messageText(
					'app.state.this-administration-page-could-not-be-opened-218a4c',
					'This administration page could not be opened. Try again.',
				),
			);
		} finally {
			this.pending.set(false);
		}
	}
	onKeydown(event: KeyboardEvent): void {
		if (
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
		)
			return;
		const buttons = Array.from(
			(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
				'button:not(:disabled)',
			),
		);
		const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
		const index = target ? buttons.indexOf(target) : -1;
		if (index < 0) return;
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? buttons.length - 1
					: Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
		event.preventDefault();
		buttons[next]?.focus();
	}
}
