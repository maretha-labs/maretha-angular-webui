import { provideDefaultDrawer } from './default-drawer';
import { provideDefaultAdministration } from 'app/modules/settings/default-administration';
import {
	DRAWER_ITEMS_SLOT,
	DRAWER_PAGES_SLOT,
	DrawerItemComponent,
	DrawerContext,
	ViewNavigation,
	WebUiLocale,
} from '@maretha/webui-sdk';
import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import {
	faBars,
	faBookmark,
	faChevronLeft,
	faClipboard,
	faClockRotateLeft,
	faFolderClosed,
	faSearch,
	faSitemap,
	faUserGear,
	faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { faStar } from '@fortawesome/free-regular-svg-icons';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, EMPTY, NEVER, of } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastService } from 'app/helpers/toast.service';
import {
	defineContribution,
	ExtensionRegistry,
	USER_MENU_SLOT,
	UserMenuContext,
} from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { SidebarService } from 'app/helpers/sidebar.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { UserInfo } from 'app/models/user-info';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { SearchQueueService } from 'app/modules/search/helpers/search-queue.service';
import { SidebarComponent } from './sidebar.component';
import { provideDefaultUserMenu } from './user-menu/default-user-menu';

@Component({
	selector: 'nx-menu-route-test',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '',
})
class RoutePage {}

@Component({
	selector: 'nx-menu-context-test',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: `<button type="button" (click)="clicks = clicks + 1">
		{{ context().user?.displayName }}|{{ context().locale }}|{{ context().route }}|{{
			context().document?.['uid']
		}}|{{ clicks }}
	</button>`,
})
class ContextEntry {
	readonly context = input.required<UserMenuContext>();
	clicks = 0;
}

@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		'Client drawer content {{context().activeKey}}<input aria-label="Client draft" [value]="draft" (input)="draft = $any($event.target).value" />',
})
class ClientDrawerPage {
	readonly context = input.required<DrawerContext>();
	draft = '';
	readonly canDeactivate = jasmine.createSpy('canDeactivate').and.returnValue(true);
	hasPendingChanges(): boolean {
		return !!this.draft;
	}
}

describe('Sidebar USER_MENU integration', () => {
	let fixture: ComponentFixture<SidebarComponent>;
	let sidebar: SidebarService;
	let modal: jasmine.Spy;
	let logout: jasmine.Spy;
	const initialUser: UserInfo = {
		id: 'alice',
		firstName: 'Alice',
		lastName: 'Example',
		isAdministrator: true,
		groups: [],
	};
	let user = signal<UserInfo | null>(initialUser);
	let documentState = signal<Record<string, unknown> | null>(null);
	let search: any;
	let queue: any;

	async function settle(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	}
	function menu(): HTMLElement {
		return fixture.nativeElement.querySelector('nav[aria-label="User menu"]');
	}
	function button(label: string): HTMLButtonElement {
		return [...menu().querySelectorAll('button')].find(
			(entry) => entry.textContent?.trim() === label,
		)!;
	}
	async function openMenu(): Promise<HTMLButtonElement> {
		const triggers = [
			...fixture.nativeElement.querySelectorAll('button[aria-label="User menu"]'),
		] as HTMLButtonElement[];
		const trigger =
			triggers.find((entry) => entry.getBoundingClientRect().width > 0) ?? triggers[0];
		trigger.click();
		await settle();
		return trigger;
	}

	beforeEach(async () => {
		user = signal<UserInfo | null>(initialUser);
		documentState = signal<Record<string, unknown> | null>(null);
		queue = {
			active: signal(false),
			rows: signal([]),
			loading: signal(false),
			error: signal(''),
			hasMore: signal(false),
			total: signal<number | null>(null),
			epoch: signal(0),
			selectedUid: signal<string | null>(null),
			reopenRequired: signal(false),
			open: jasmine.createSpy('open'),
			close: jasmine.createSpy('close').and.callFake(() => queue.active.set(false)),
			retry: jasmine.createSpy('retry'),
			more: jasmine.createSpy('more'),
			select: jasmine.createSpy('select'),
		};
		const visibility = new BehaviorSubject(false);
		search = {
			searchPaneVisibility: signal(false),
			pageProvidersUpdated$: EMPTY,
			pageProviderChanged$: EMPTY,
			pageProviderUpdated$: EMPTY,
			saveAsRequested$: EMPTY,
			searchPaneVisibilityChanged$: visibility,
			fetchingDocuments$: EMPTY,
			currentPageProviderKey: undefined,
			pageProviders: {},
			searchParameters: { query: 'invoice', quickFilters: { nofolder: true } },
			showSearchPaneVisibility: jasmine.createSpy('showSearchPaneVisibility').and.callFake(() => {
				search.searchPaneVisibility.set(true);
				visibility.next(true);
			}),
			hideSearchPaneVisibility: jasmine.createSpy('hideSearchPaneVisibility').and.callFake(() => {
				search.searchPaneVisibility.set(false);
				visibility.next(false);
			}),
			getSavedSearches: () => of([]),
			useTrashedDocumentsSearchProvider: () => of(false),
		};
		modal = jasmine.createSpy('show').and.returnValue({ content: {} });
		logout = jasmine.createSpy('logOff');
		TestBed.configureTestingModule({
			imports: [SidebarComponent, TranslateModule.forRoot()],
			providers: [
				provideDefaultUserMenu(),
				provideDefaultDrawer(),
				provideDefaultAdministration(),
				provideRouter([{ path: '**', component: RoutePage }]),
				{
					provide: AuthService,
					useValue: { userInfo: user, userInfoUpdated$: of(initialUser), logOff: logout },
				},
				{ provide: BsModalService, useValue: { show: modal } },
				{ provide: WorkflowsService, useValue: { getUserTasks: () => NEVER } },
				{
					provide: DocumentSearchService,
					useValue: search,
				},
				{ provide: SearchQueueService, useValue: queue },
				{ provide: ToastService, useValue: { success: jasmine.createSpy('success') } },
				{
					provide: DocumentsManagerService,
					useValue: {
						documentFetched: documentState,
						documentFetched$: EMPTY,
						showOnlyTrashedDocuments: false,
						documentInfo: { ng: { isFolder: true }, path: '/', parentRef: 'root' },
					},
				},
				{ provide: DocumentHistoryService, useValue: { documentHistory: signal([]) } },
				{ provide: DocumentClipboardService, useValue: { documentClipboard: signal([]) } },
				{ provide: DocumentCollectionsService, useValue: { documentCollectionsUpdated$: EMPTY } },
			],
		});
		TestBed.inject(FaIconLibrary).addIcons(
			faBars,
			faSitemap,
			faFolderClosed,
			faClockRotateLeft,
			faSearch,
			faBookmark,
			faStar,
			faClipboard,
			faUsers,
			faUserGear,
			faChevronLeft,
		);
		await TestBed.compileComponents();
		sidebar = TestBed.inject(SidebarService);
		fixture = TestBed.createComponent(SidebarComponent);
		await settle();
	});

	it('changes the shared locale only for supported user-menu choices', () => {
		fixture.componentInstance.changeLanguage('it');
		expect(TestBed.inject(WebUiLocale).locale()).toBe('it');
		fixture.componentInstance.changeLanguage('not-supported');
		expect(TestBed.inject(WebUiLocale).locale()).toBe('it');
		fixture.componentInstance.changeLanguage('en-US');
	});
	it('loads the existing profile dialog only when requested and keeps its modal options', async () => {
		const opening = fixture.componentInstance.editUserProfile();
		expect(modal).not.toHaveBeenCalled();
		await opening;
		expect(modal).toHaveBeenCalledOnceWith(
			jasmine.any(Function),
			jasmine.objectContaining({ class: 'modal-md', initialState: {} }),
		);
		expect(modal.calls.mostRecent().returnValue.content.closeBtnName).toBe('Close');
	});
	it('does not open a delayed profile dialog for a replaced user or destroyed sidebar', async () => {
		const opening = fixture.componentInstance.editUserProfile();
		user.set({ ...initialUser, id: 'another-user' });
		await opening;
		expect(modal).not.toHaveBeenCalled();
		const delayed = fixture.componentInstance.editUserProfile();
		fixture.destroy();
		await delayed;
		expect(modal).not.toHaveBeenCalled();
	});
	it('renders account actions without waiting for the task request to complete', async () => {
		await openMenu();
		expect(button('Profile')).toBeDefined();
		expect(button('Sign Out')).toBeDefined();
		expect(fixture.componentInstance.userMenuContext().user?.displayName).toBe('Alice Example');
	});
	it('keeps account actions visible while overflowing navigation scrolls at short heights', async () => {
		const rail = fixture.nativeElement.querySelector('.nx-sidebar') as HTMLElement;
		// Exercise the actual rail styles independently of the test runner viewport.
		rail.style.display = 'flex';
		rail.style.height = '640px';
		rail.style.setProperty('--nuxeo-sidebar-width', '52px');
		rail.style.setProperty('--nuxeo-header-height', '60px');
		const navigation = rail.querySelector('.nx-sidebar__nav') as HTMLElement;
		const footer = rail.querySelector('.nx-sidebar__nav--bottom') as HTMLElement;
		const account = footer.querySelector('[aria-label="User menu"]') as HTMLElement;
		const lastItem = navigation.lastElementChild as HTMLElement;
		expect(navigation.scrollHeight).toBeGreaterThan(navigation.clientHeight);
		expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			rail.getBoundingClientRect().bottom,
		);
		expect(account.getBoundingClientRect().height).toBe(48);
		navigation.scrollTop = navigation.scrollHeight;
		expect(lastItem.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			navigation.getBoundingClientRect().bottom + 1,
		);
		account.click();
		await settle();
		expect(button('Profile')).toBeDefined();
		expect(button('Sign Out')).toBeDefined();
	});

	it('keeps closed drawer content inert and restores the trigger focus on Escape', async () => {
		const trigger = await openMenu();
		const drawer: HTMLElement = fixture.nativeElement.querySelector('#nx-sidebar-drawer');
		expect(drawer.hasAttribute('inert')).toBeFalse();
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(sidebar.drawerOpen()).toBeFalse();
		await openMenu();
		button('Profile').focus();
		button('Profile').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(sidebar.drawerOpen()).toBeFalse();
		expect(drawer.hasAttribute('inert')).toBeTrue();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	it('navigates to the profile page and delegates sign-out to the authentication service', async () => {
		await openMenu();
		button('Profile').click();
		await settle();
		expect(TestBed.inject(Router).url).toBe('/profile');
		expect(sidebar.drawerOpen()).toBeTrue();
		button('Sign Out').click();
		await settle();
		expect(logout).toHaveBeenCalledTimes(1);
		expect(sidebar.drawerOpen()).toBeFalse();
	});

	it('checks all mounted view guards afresh before explicit sign out', async () => {
		const guard = jasmine.createSpy('document draft').and.resolveTo(false);
		const unregister = TestBed.inject(ViewNavigation).register(guard);
		await openMenu();
		button('Sign Out').click();
		await settle();
		expect(logout).not.toHaveBeenCalled();
		expect(sidebar.drawerOpen()).toBeTrue();
		guard.and.resolveTo(true);
		button('Sign Out').click();
		await settle();
		expect(logout).toHaveBeenCalledTimes(1);
		expect(guard).toHaveBeenCalledTimes(2);
		unregister();
	});

	it('updates contribution context for locale, route and document changes without remounting', async () => {
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.account',
			contributions: [
				defineContribution(USER_MENU_SLOT, {
					id: 'client.context',
					component: ContextEntry,
					order: 1,
				}),
			],
		});
		await openMenu();
		const entry: HTMLButtonElement = menu().querySelector('nx-menu-context-test button')!;
		entry.click();
		await settle();
		expect(fixture.componentInstance.userMenuContext()).toBe(
			fixture.componentInstance.userMenuContext(),
		);
		TestBed.inject(WebUiLocale).setLocale('ro');
		await TestBed.inject(Router).navigateByUrl('/client-account');
		documentState.set({ uid: 'document-2' });
		await settle();
		expect(menu().querySelector('nx-menu-context-test button')).toBe(entry);
		expect(entry.textContent?.replace(/\s/g, '')).toContain(
			'AliceExample|ro|/client-account|document-2|1',
		);
		expect(button('Română').disabled).toBeTrue();
	});

	it('re-evaluates client eligibility when the authenticated user changes', async () => {
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.admin',
			contributions: [
				defineContribution(USER_MENU_SLOT, {
					id: 'client.admin',
					component: ContextEntry,
					when: (context) => context.user?.isAdministrator === true,
				}),
			],
		});
		await openMenu();
		expect(menu().querySelector('nx-menu-context-test')).not.toBeNull();
		user.set({ ...initialUser, isAdministrator: false });
		await settle();
		expect(menu().querySelector('nx-menu-context-test')).toBeNull();
		expect(button('Profile')).toBeDefined();
		user.set(null);
		await settle();
		expect(fixture.nativeElement.querySelector('nav[aria-label="User menu"]')).toBeNull();
	});
	it('adds client drawer pages and removes orphaned items when a page is disabled', async () => {
		const registry = TestBed.inject(ExtensionRegistry);
		registry.register({
			id: 'client.drawer',
			contributions: [
				defineContribution(DRAWER_ITEMS_SLOT, {
					id: 'client.drawer',
					pairKey: 'client',
					component: DrawerItemComponent,
					inputs: { pageId: 'client', label: 'Client drawer', icon: 'nuxeo:browse' },
				}),
				defineContribution(DRAWER_PAGES_SLOT, {
					id: 'client.drawer',
					pairKey: 'client',
					component: ClientDrawerPage,
				}),
			],
		});
		await settle();
		const trigger = fixture.nativeElement.querySelector(
			'button[aria-label="Client drawer"]',
		) as HTMLButtonElement;
		trigger.click();
		await settle();
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(fixture.nativeElement.textContent).toContain('Client drawer content client');
		const restore = registry.register({
			id: 'client.hide',
			overrides: [{ slot: 'DRAWER_PAGES', id: 'client.drawer', disabled: true }],
		});
		await settle();
		expect(fixture.nativeElement.querySelector('button[aria-label="Client drawer"]')).toBeNull();
		expect(sidebar.drawerOpen()).toBeFalse();
		restore();
		await settle();
		expect(
			fixture.nativeElement.querySelector('button[aria-label="Client drawer"]'),
		).not.toBeNull();
	});
	it('opens the contributed navigation rail on mobile and closes it on Escape', async () => {
		const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('.nx-mobile-toggle');
		trigger.click();
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(
			fixture.nativeElement.querySelector('.nx-sidebar').classList.contains('mobile-open'),
		).toBeTrue();
		trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(fixture.componentInstance.mobileNavigationOpen()).toBeFalse();
	});
	it('marks the mobile navigation landmark for the Settings local chooser', async () => {
		const trigger = fixture.nativeElement.querySelector('.nx-mobile-toggle') as HTMLButtonElement;
		expect(trigger.isConnected).toBeTrue();
		const navigation = trigger.closest('nav')!;
		expect(navigation.getAttribute('aria-label')).toBe('Application navigation');
		expect(navigation.classList.contains('nx-mobile-toggle--settings-route')).toBeFalse();
		await TestBed.inject(Router).navigateByUrl('/settings?admin=analytics');
		await settle();
		expect(navigation.classList.contains('nx-mobile-toggle--settings-route')).toBeTrue();
	});
	it('keeps the mounted applied search and queue while documents change, then closes it explicitly', async () => {
		const searchButton = fixture.nativeElement.querySelector(
			'button[aria-label="Search"]',
		) as HTMLButtonElement;
		searchButton.click();
		await settle();
		const mountedSearch = fixture.nativeElement.querySelector('nx-search');
		expect(mountedSearch).not.toBeNull();
		expect(search.showSearchPaneVisibility).toHaveBeenCalled();

		queue.active.set(true);
		await settle();
		expect(fixture.nativeElement.querySelector('nx-search-queue')).not.toBeNull();
		const appliedParameters = search.searchParameters;
		documentState.set({ uid: 'document-a', repository: 'default' });
		await settle();
		documentState.set({ uid: 'document-b', repository: 'default' });
		await settle();
		expect(fixture.nativeElement.querySelector('nx-search')).toBe(mountedSearch);
		expect(search.searchParameters).toBe(appliedParameters);

		queue.close();
		await settle();
		expect(fixture.nativeElement.querySelector('nx-search-queue')).toBeNull();
		fixture.componentInstance.closeNavigation();
		await settle();
		expect(search.searchPaneVisibility()).toBeFalse();
		expect(search.hideSearchPaneVisibility).toHaveBeenCalled();
	});
	it('retains a custom drawer draft and honors departure guards on tabs, closing and routes', async () => {
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.retained-drawer',
			contributions: [
				defineContribution(DRAWER_ITEMS_SLOT, {
					id: 'client.retained',
					pairKey: 'client',
					component: DrawerItemComponent,
					inputs: { pageId: 'client', label: 'Client editor', icon: 'nuxeo:edit' },
				}),
				defineContribution(DRAWER_PAGES_SLOT, {
					id: 'client.retained',
					pairKey: 'client',
					retain: true,
					component: ClientDrawerPage,
				}),
			],
		});
		await settle();
		fixture.componentInstance.onSidebarClick('client');
		await settle();
		const editor = fixture.debugElement.query(By.directive(ClientDrawerPage))
			.componentInstance as ClientDrawerPage;
		editor.draft = 'Keep my draft';
		editor.canDeactivate.and.returnValue(false);
		fixture.componentInstance.onSidebarClick('profile');
		await settle();
		expect(sidebar.activeTab()).toBe('client');
		fixture.componentInstance.closeNavigation();
		await settle();
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(await TestBed.inject(ViewNavigation).canNavigate('/other', 10)).toBeFalse();
		expect(await TestBed.inject(ViewNavigation).canLeave(TestBed.inject(Router).url)).toBeTrue();
		editor.canDeactivate.and.returnValue(true);
		fixture.componentInstance.onSidebarClick('profile');
		await settle();
		const retained = fixture.nativeElement.querySelector(
			'.drawer-retained-page[hidden]',
		) as HTMLElement;
		expect(retained.hasAttribute('inert')).toBeTrue();
		expect(editor.context().activeKey).toBe('client');
		fixture.componentInstance.onSidebarClick('client');
		await settle();
		expect(fixture.debugElement.query(By.directive(ClientDrawerPage)).componentInstance).toBe(
			editor,
		);
		expect(editor.draft).toBe('Keep my draft');
	});
	it('opens Administration before navigating and hides it from ordinary users', async () => {
		const router = TestBed.inject(Router);
		const original = router.url;
		const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
			'[aria-label="Administration"]',
		)!;
		trigger.click();
		await settle();
		expect(router.url).toBe(original);
		expect(sidebar.activeTab()).toBe('administration');
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(fixture.nativeElement.querySelector('nx-administration-drawer')).not.toBeNull();
		trigger.click();
		await settle();
		expect(sidebar.drawerOpen()).toBeFalse();
		user.set({ ...initialUser, isAdministrator: false, groups: [] });
		await settle();
		expect(fixture.nativeElement.querySelector('[aria-label="Administration"]')).toBeNull();
	});
});
