import { localizedText, messageText } from 'app/helpers/localized-message';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	OnDestroy,
	DestroyRef,
	ElementRef,
	PendingTasks,
	viewChildren,
	computed,
	ChangeDetectionStrategy,
	inject,
	effect,
	untracked,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { toApplicationUser } from 'app/helpers/application-user';
import { SidebarService, SidebarTab } from 'app/helpers/sidebar.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { WorkflowInboxService } from 'app/helpers/workflow-inbox.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import {
	UserMenuContext,
	WebUiLocale,
	WebUiMessages,
	SUPPORTED_WEB_UI_LOCALES,
	WebUiSlotComponent,
	WebUiIconComponent,
	DrawerContext,
	ExtensionRegistry,
	ContributionOutletComponent,
	ViewNavigation,
	ViewDeparture,
} from '@maretha/webui-sdk';
import { documentUrl, documentRouteMatches } from 'app/helpers/document-route';
import {
	CollectionDrawerNavigation,
	CollectionMemberNavigation,
} from 'app/helpers/collection-drawer-navigation.service';
import { BsModalRef, BsModalService, ModalOptions } from 'ngx-bootstrap/modal';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { combineLatest, Subject, filter, map, takeUntil } from 'rxjs';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { RailTooltipDirective } from 'app/extensions/rail-tooltip.directive';
import { hasAdministrationAccess } from 'app/helpers/administration-access';
import { AdministrationDrawerComponent } from './administration-drawer.component';
import { DrawerResizeHandleComponent } from './drawer-resize-handle.component';

@Component({
	selector: 'nx-sidebar',
	templateUrl: './sidebar.component.html',
	styleUrls: ['./sidebar.component.scss'],
	imports: [
		FontAwesomeModule,
		RailTooltipDirective,
		WebUiSlotComponent,
		WebUiIconComponent,
		ContributionOutletComponent,
		AdministrationDrawerComponent,
		DrawerResizeHandleComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarComponent implements OnDestroy {
	private readonly destroy$ = new Subject<void>();
	private bsModalRef?: BsModalRef;
	private menuTrigger: HTMLElement | null = null;
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private readonly tasks = inject(PendingTasks);
	private readonly viewNavigation = inject(ViewNavigation);
	private readonly destroyRef = inject(DestroyRef);
	private readonly drawerOutlets = viewChildren('drawerOutlet', {
		read: ContributionOutletComponent,
	});
	private readonly visitedDrawers = signal<ReadonlySet<string>>(new Set());
	private departureSequence = 0;
	readonly drawerDepartureMessage = localizedText('');
	readonly drawerScope = computed(() =>
		JSON.stringify([
			this.userInfo()?.id,
			this.documentsManagerService.documentFetched()?.repository ?? 'default',
			this.currentDocUid(),
		]),
	);
	readonly searchDrawerScope = computed(() =>
		JSON.stringify([
			this.userInfo()?.id,
			this.documentsManagerService.documentFetched()?.repository ?? 'default',
		]),
	);

	readonly userInfo = this.authService.userInfo;
	readonly canAccessAdministration = computed(() => hasAdministrationAccess(this.userInfo()));
	private readonly inbox = inject(WorkflowInboxService);
	readonly mobileNavigationOpen = signal(false);
	readonly drawerOpen = this.sidebarService.drawerOpen;
	readonly activeTab = this.sidebarService.activeTab;
	readonly activeRoute = toSignal(
		this.router.events.pipe(
			filter((event): event is NavigationEnd => event instanceof NavigationEnd),
			map((event) => event.urlAfterRedirects),
		),
		{ initialValue: this.router.url },
	);
	readonly documentHistory = this.documentHistoryService.documentHistory;
	readonly clipboardDocuments = this.documentClipboardService.documentClipboard;
	readonly currentDocUid = computed(
		() => this.documentsManagerService.documentFetched()?.uid ?? null,
	);

	private readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	readonly languages = SUPPORTED_WEB_UI_LOCALES;
	readonly currentLanguage = this.locale.locale;
	private readonly closeMenu = () => this.closeUserMenu();
	private readonly openProfile = () => {
		if (globalThis.matchMedia('(max-width: 720px)').matches) this.closeUserMenu();
		this.editUserProfile();
	};
	private readonly setMenuLanguage = (key: string) => this.changeLanguage(key);
	private readonly signOut = () => this.logOff();
	readonly userMenuContext = computed<UserMenuContext>(() => {
		const user = this.userInfo();
		return {
			user: toApplicationUser(user),
			locale: this.currentLanguage(),
			route: this.activeRoute(),
			document: this.documentsManagerService.documentFetched() ?? null,
			languages: this.languages,
			close: this.closeMenu,
			openProfile: this.openProfile,
			changeLanguage: this.setMenuLanguage,
			signOut: this.signOut,
		};
	});

	private readonly collectionNavigation = inject(CollectionDrawerNavigation);
	private readonly drawerRevision = signal(0);
	private readonly registry = inject(ExtensionRegistry);
	readonly drawerContext = computed<DrawerContext>(() => ({
		...this.userMenuContext(),
		...{ revision: this.drawerRevision() },
		noEdit: false,
		activeKey: this.activeTab(),
		opened: this.drawerOpen(),
		open: (key) => this.onSidebarClick(key),
		close: () => this.closeNavigation(),
		navigate: (path) => this.navigateFromDrawer(path),
		recentDocuments: this.documentHistory(),
		collections: this.documentCollectionsService.documentCollectionsList?.() ?? [],
		clipboard: this.clipboardDocuments(),
		tasks: this.inbox.tasks(),
		taskCount: this.inbox.count(),
		clearHistory: () => this.clearHistory(),
		clearClipboard: () => this.clearClipboard(),
	}));
	readonly drawerItems = computed(() => {
		const context = this.drawerContext();
		const items = this.registry.resolve('DRAWER_ITEMS', context).items;
		const pages = this.registry.resolve('DRAWER_PAGES', context).items;
		return items.filter(
			(item) =>
				!item.pairKey ||
				(items.filter((other) => other.pairKey === item.pairKey).length === 1 &&
					pages.filter((page) => page.pairKey === item.pairKey).length === 1),
		);
	});
	readonly drawerPage = computed(() => {
		const context = this.drawerContext();
		const items = this.drawerItems().filter((item) => item.pairKey === context.activeKey);
		const pages = this.registry
			.resolve('DRAWER_PAGES', context)
			.items.filter((page) => page.pairKey === context.activeKey);
		return items.length === 1 && pages.length === 1 ? pages[0] : null;
	});
	readonly renderedDrawerPages = computed(() => {
		const context = this.drawerContext();
		const paired = new Set(
			this.drawerItems()
				.map((item) => item.pairKey)
				.filter(Boolean),
		);
		const pages = this.registry.resolve('DRAWER_PAGES', context).items;
		return pages
			.filter(
				(page) =>
					paired.has(page.pairKey) &&
					pages.filter((other) => other.pairKey === page.pairKey).length === 1 &&
					(page.pairKey === context.activeKey ||
						(page.retain && this.visitedDrawers().has(page.key))),
			)
			.map((page) => ({
				page,
				renderKey:
					(['search', 'collections', 'favorites', 'clipboard'].includes(page.pairKey ?? '')
						? this.searchDrawerScope()
						: this.drawerScope()) + page.key,
				active: page.pairKey === context.activeKey,
				context: {
					...context,
					activeKey: page.pairKey!,
					opened: context.opened && page.pairKey === context.activeKey,
				},
			}));
	});
	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly authService: AuthService,
		private readonly router: Router,
		readonly sidebarService: SidebarService,
		private readonly documentSearchService: DocumentSearchService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly modalService: BsModalService,
		private readonly documentHistoryService: DocumentHistoryService,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly documentClipboardService: DocumentClipboardService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.destroyRef.onDestroy(
			this.viewNavigation.register((url) =>
				url === this.router.url
					? Promise.resolve(true)
					: this.checkDrawerDeparture(
							{ reason: 'navigation', nextViewId: null, nextUrl: url },
							true,
						),
			),
		);
		const window = this.element.nativeElement.ownerDocument.defaultView;
		const beforeUnload = (event: BeforeUnloadEvent) => {
			if (this.drawerOutlets().some((outlet) => outlet.hasPendingChanges())) {
				event.preventDefault();
				event.returnValue = '';
			}
		};
		window?.addEventListener('beforeunload', beforeUnload);
		this.destroyRef.onDestroy(() => window?.removeEventListener('beforeunload', beforeUnload));
		let previousScope: string | undefined;
		effect(() => {
			const scope = this.drawerScope();
			const page = this.drawerPage();
			untracked(() => {
				if (scope !== previousScope) {
					previousScope = scope;
					this.departureSequence++;
					this.visitedDrawers.set(new Set());
				}
				if (page) this.visitedDrawers.update((keys) => new Set([...keys, page.key]));
			});
		});
		effect(() => {
			const key = this.activeTab();
			if (
				key &&
				key !== 'profile' &&
				this.drawerOpen() &&
				(key === 'administration' ? !this.canAccessAdministration() : !this.drawerPage())
			)
				untracked(() => this.sidebarService.closeDrawer());
		});
		effect(() => {
			const request = this.collectionNavigation.pending();
			const context = this.drawerContext();
			if (
				request &&
				(context.user?.id !== request.userId ||
					!documentRouteMatches(this.router.url, request.member))
			) {
				untracked(() => this.collectionNavigation.pending.set(null));
				return;
			}
			if (
				request &&
				context.user?.id === request.userId &&
				(context.document?.['repository'] ?? 'default') === request.repository &&
				context.document?.['uid'] === request.member.uid
			) {
				untracked(() => this.tasks.run(() => this.openCollectionMembers(request)));
			}
		});
		// Sync search pane with drawer
		combineLatest([this.sidebarService.activeTab$, this.sidebarService.drawerOpen$])
			.pipe(takeUntil(this.destroy$))
			.subscribe(([tab, open]) => {
				if (tab === 'search' && open) this.documentSearchService.showSearchPaneVisibility();
				else this.documentSearchService.hideSearchPaneVisibility();
			});

		// Stock fetches the tasks list each time its drawer opens.
		effect(() => {
			if (this.activeTab() === 'tasks' && this.drawerOpen())
				untracked(() => this.inbox.refresh?.());
		});
	}

	// --------------------------------------------------------------------------------------------------
	clearHistory() {
		this.documentHistoryService.clear();
	}

	// --------------------------------------------------------------------------------------------------
	clearClipboard() {
		this.documentClipboardService.clearClipboard();
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy() {
		this.destroy$.next();
		this.destroy$.complete();
	}

	// --------------------------------------------------------------------------------------------------
	toggleMobileNavigation(event: Event): void {
		if (event.currentTarget instanceof HTMLElement) this.menuTrigger = event.currentTarget;
		if (this.mobileNavigationOpen() || this.drawerOpen()) this.closeNavigation();
		else this.mobileNavigationOpen.set(true);
	}

	closeNavigation(event?: Event): void {
		event?.preventDefault();
		event?.stopPropagation();
		void this.tasks.run(async () => {
			if (await this.checkDrawerDeparture({ reason: 'tab', nextViewId: null }))
				this.finishClosingNavigation();
		});
	}

	private finishClosingNavigation(): void {
		this.sidebarService.closeDrawer();
		this.mobileNavigationOpen.set(false);
		this.menuTrigger?.focus();
	}

	private async checkDrawerDeparture(departure: ViewDeparture, all = false): Promise<boolean> {
		const request = ++this.departureSequence;
		const scope = this.drawerScope();
		const active = this.activeTab();
		const outlets = this.drawerOutlets().filter(
			(outlet) => all || outlet.contribution().pairKey === active,
		);
		for (const outlet of outlets) {
			if (!(await outlet.canDeactivate(departure))) {
				if (request === this.departureSequence && !this.destroyRef.destroyed)
					this.drawerDepartureMessage.set(
						messageText(
							'app.state.save-or-discard-changes-in-the-open-drawer-be-7e7abf',
							'Save or discard changes in the open drawer before leaving.',
						),
					);
				return false;
			}
		}
		if (
			request !== this.departureSequence ||
			this.destroyRef.destroyed ||
			scope !== this.drawerScope() ||
			active !== this.activeTab()
		)
			return false;
		this.drawerDepartureMessage.set('');
		return true;
	}

	private async openCollectionMembers(request: CollectionMemberNavigation): Promise<void> {
		if (!(await this.checkDrawerDeparture({ reason: 'tab', nextViewId: 'collections' }))) {
			if (this.collectionNavigation.pending() === request)
				this.collectionNavigation.pending.set(null);
			return;
		}
		const context = this.drawerContext();
		if (
			this.destroyRef.destroyed ||
			context.user?.id !== request.userId ||
			(context.document?.['repository'] ?? 'default') !== request.repository ||
			context.document?.['uid'] !== request.member.uid ||
			!documentRouteMatches(this.router.url, request.member)
		)
			return;
		if (this.collectionNavigation.accept(request)) this.sidebarService.selectTab('collections');
	}

	/** Drawer navigation keeps the drawer open (stock: the Browse tree stays beside the page).
	 *  Only the rail icon of the active drawer and the handle close it; the mobile overlay
	 *  still closes because it covers the page. */
	private navigateFromDrawer(path: string): void {
		void this.router.navigateByUrl(path).then((allowed) => {
			if (allowed && this.mobileNavigationOpen()) this.finishClosingNavigation();
		});
	}

	onSidebarClick(tab: SidebarTab, event?: Event): void {
		const target = event?.currentTarget ?? this.element.nativeElement.ownerDocument.activeElement;
		if (target instanceof HTMLElement && this.element.nativeElement.contains(target))
			this.menuTrigger = target;
		if (tab === 'home' || tab === 'browse') {
			this.navigateFromDrawer(tab === 'home' ? '/dashboard' : '/browse');
			return;
		}
		void this.tasks.run(async () => {
			if (await this.checkDrawerDeparture({ reason: 'tab', nextViewId: tab }))
				this.sidebarService.toggleDrawer(tab);
		});
	}

	// --------------------------------------------------------------------------------------------------
	isRouteActive(path: string): boolean {
		return this.activeRoute().startsWith(path);
	}

	closeUserMenu(event?: Event): void {
		if (this.activeTab() !== 'profile' || !this.drawerOpen()) return;
		event?.preventDefault();
		event?.stopPropagation();
		this.sidebarService.closeDrawer();
		this.menuTrigger?.focus();
	}

	// --------------------------------------------------------------------------------------------------
	navigateToTask(taskDocId: string) {
		this.navigateFromDrawer(documentUrl(taskDocId));
	}

	// --------------------------------------------------------------------------------------------------
	navigateToSettings() {
		if (this.canAccessAdministration()) this.onSidebarClick('administration');
	}

	// --------------------------------------------------------------------------------------------------
	async editUserProfile(): Promise<void> {
		const owner = this.userInfo()?.id;
		const { UserProfileComponent } =
			await import('app/components/user-profile/user-profile.component');
		if (this.destroyRef.destroyed || owner !== this.userInfo()?.id) return;
		const initialState: ModalOptions = {
			initialState: {},
			class: 'modal-md',
		};
		this.bsModalRef = this.modalService.show(UserProfileComponent, initialState);
		this.bsModalRef.content.closeBtnName = this.messages.text('command.close', 'Close');
	}

	// --------------------------------------------------------------------------------------------------
	changeLanguage(language: string) {
		if (this.languages.some((entry) => entry.key === language)) this.locale.setLocale(language);
	}

	// --------------------------------------------------------------------------------------------------
	logOff() {
		void this.tasks.run(async () => {
			if (!(await this.viewNavigation.canLeave('/logout')) || this.destroyRef.destroyed) return;
			this.finishClosingNavigation();
			this.authService.logOff();
		});
	}
}
