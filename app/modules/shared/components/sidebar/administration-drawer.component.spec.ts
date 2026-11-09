import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AdministrationDrawerComponent } from './administration-drawer.component';
import { provideDefaultAdministration } from 'app/modules/settings/default-administration';
import { AuthService } from 'app/helpers/auth.service';
import { SidebarService } from 'app/helpers/sidebar.service';
import {
	ExtensionRegistry,
	DocumentViewItemContext,
	ADMINISTRATION_MENU_SLOT,
	ADMINISTRATION_PAGES_SLOT,
	defineContribution,
	definePairedView,
	WebUiMessages,
} from '@maretha/webui-sdk';
@Component({ template: '' })
class PageStub {}
@Component({
	template: `<button
		class="client-menu"
		(click)="context().select()"
		[attr.aria-current]="context().selected ? 'page' : null"
	>
		{{ caption() }}
	</button>`,
})
class ClientMenu {
	readonly context = input.required<DocumentViewItemContext>();
	readonly caption = input.required<string>();
}
describe('Administration drawer', () => {
	const user = signal<any>({ id: 'admin', isAdministrator: true, groups: [] });
	beforeEach(() => {
		user.set({ id: 'admin', isAdministrator: true, groups: [] });
		TestBed.configureTestingModule({
			imports: [AdministrationDrawerComponent],
			providers: [
				provideDefaultAdministration(),
				provideRouter([{ path: '**', component: PageStub }]),
				{ provide: AuthService, useValue: { userInfo: user } },
			],
		});
	});
	async function setup() {
		const fixture = TestBed.createComponent(AdministrationDrawerComponent);
		fixture.detectChanges();
		await fixture.whenStable();
		return fixture;
	}
	it('moves keyboard focus through available administration actions without triggering navigation', async () => {
		const fixture = await setup();
		const buttons = Array.from(
			fixture.nativeElement.querySelectorAll('nav button'),
		) as HTMLButtonElement[];
		expect(buttons.length).toBeGreaterThan(2);
		const key = (button: HTMLButtonElement, value: string) => {
			const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true });
			button.dispatchEvent(event);
			return event;
		};
		buttons[0].focus();
		expect(key(buttons[0], 'ArrowDown').defaultPrevented).toBeTrue();
		expect(document.activeElement).toBe(buttons[1]);
		key(buttons[1], 'End');
		expect(document.activeElement).toBe(buttons.at(-1)!);
		key(buttons.at(-1)!, 'Home');
		expect(document.activeElement).toBe(buttons[0]);
		key(buttons[0], 'ArrowUp');
		expect(document.activeElement).toBe(buttons[0]);
		expect(key(buttons[0], 'Escape').defaultPrevented).toBeFalse();
		expect(
			key(fixture.nativeElement.querySelector('nav'), 'ArrowDown').defaultPrevented,
		).toBeFalse();
		expect(TestBed.inject(Router).url).toBe('/');
	});
	it('uses only eligible paired contributions, including power-user and client overrides', async () => {
		const fixture = await setup();
		const c = fixture.componentInstance;
		expect(c.views().map((v) => v.viewId)).toContain('audit');
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.admin',
			overrides: [{ slot: 'ADMINISTRATION_MENU', id: 'maretha.admin.cloud', disabled: true }],
		});
		expect(c.views().map((v) => v.viewId)).not.toContain('cloud');
		user.set({ id: 'power', isAdministrator: false, groups: [{ id: 'powerusers' }] });
		fixture.detectChanges();
		expect(c.views().map((v) => v.viewId)).toEqual(['users', 'directories', 'nxql']);
		await c.select('audit');
		expect(TestBed.inject(Router).url).toBe('/');
		user.set({ id: 'regular', isAdministrator: false, groups: [] });
		fixture.detectChanges();
		expect(c.views()).toEqual([]);
	});
	it('keeps the desktop drawer open while navigating and tracks browser history', async () => {
		spyOn(window, 'matchMedia').and.returnValue({ matches: false } as MediaQueryList);
		const fixture = await setup();
		const c = fixture.componentInstance;
		const sidebar = TestBed.inject(SidebarService);
		sidebar.selectTab('administration');
		await c.select('users');
		fixture.detectChanges();
		expect(TestBed.inject(Router).url).toBe('/settings?admin=users');
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(c.selected()).toBe('users');
		await TestBed.inject(Router).navigateByUrl('/settings?admin=directories');
		expect(c.selected()).toBe('directories');
	});
	it('leaves the drawer open on rejected navigation and closes it after compact navigation succeeds', async () => {
		spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
		const fixture = await setup();
		const sidebar = TestBed.inject(SidebarService);
		const router = TestBed.inject(Router);
		sidebar.selectTab('administration');
		const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(false);
		await fixture.componentInstance.select('users');
		expect(sidebar.drawerOpen()).toBeTrue();
		navigate.and.resolveTo(true);
		await fixture.componentInstance.select('users');
		expect(sidebar.drawerOpen()).toBeFalse();
	});
	it('does not close a different drawer after delayed compact navigation', async () => {
		spyOn(window, 'matchMedia').and.returnValue({ matches: true } as MediaQueryList);
		const fixture = await setup();
		const sidebar = TestBed.inject(SidebarService);
		let resolve!: (value: boolean) => void;
		spyOn(TestBed.inject(Router), 'navigateByUrl').and.returnValue(
			new Promise<boolean>((done) => (resolve = done)),
		);
		sidebar.selectTab('administration');
		const navigation = fixture.componentInstance.select('users');
		sidebar.selectTab('collections');
		resolve(true);
		await navigation;
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(sidebar.activeTab()).toBe('collections');
	});
	it('prevents duplicate navigation and retains a retryable error', async () => {
		const fixture = await setup();
		let reject!: (error: unknown) => void;
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.returnValue(
			new Promise<boolean>((_resolve, r) => (reject = r)),
		);
		const action = fixture.componentInstance.select('users');
		await fixture.componentInstance.select('audit');
		expect(navigate).toHaveBeenCalledTimes(1);
		reject(new Error('offline'));
		await action;
		expect(fixture.componentInstance.pending()).toBeFalse();
		expect(fixture.componentInstance.error()).toContain('Try again');
	});
	it('renders a custom menu contribution with its inputs and guarded selection context', async () => {
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.custom-menu',
			contributions: [
				defineContribution(ADMINISTRATION_MENU_SLOT, {
					id: 'maretha.admin.users',
					pairKey: 'users',
					priority: 100,
					component: ClientMenu,
					inputs: { caption: 'Client people menu' },
				}),
			],
		});
		const fixture = await setup();
		const custom = fixture.nativeElement.querySelector('.client-menu') as HTMLButtonElement;
		expect(custom?.textContent).toContain('Client people menu');
		custom.click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(TestBed.inject(Router).url).toBe('/settings?admin=users');
		expect(custom.getAttribute('aria-current')).toBe('page');
	});
	it('keeps native default menu buttons while rendering a contributed localized label and icon', async () => {
		TestBed.inject(WebUiMessages).register('client.labels', {
			'en-US': { 'client.admin.localized': 'Localized administration' },
		});
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.localized-menu',
			contributions: definePairedView(
				{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT },
				{
					id: 'client.admin.localized',
					viewId: 'localized',
					label: 'Fallback label',
					labelKey: 'client.admin.localized',
					icon: 'icons:settings',
					component: PageStub,
				},
			),
		});
		const fixture = await setup();
		const button = fixture.nativeElement.querySelector(
			'#nx-administration-drawer-localized',
		) as HTMLButtonElement;
		expect(button?.textContent).toContain('Localized administration');
		expect(button.querySelector('nx-webui-icon')).not.toBeNull();
		expect(button.parentElement?.tagName).toBe('NAV');
	});
});
