import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	definePairedView,
	ADMINISTRATION_MENU_SLOT,
	ADMINISTRATION_PAGES_SLOT,
	provideWebUiExtensions,
	AdministrationContext,
} from '@maretha/webui-sdk';
import { SettingsComponent } from './settings.component';
import { AuthService } from 'app/helpers/auth.service';
import { SidebarService } from 'app/helpers/sidebar.service';
const pageHeight = signal(100);
@Component({
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<div [style.height.px]="height()">Administration page</div>',
})
class PageStub {
	readonly context = input.required<AdministrationContext>();
	readonly height = pageHeight;
}
describe('Settings shell navigation', () => {
	let mobile: boolean;
	const user = signal({ id: 'admin', isAdministrator: true, groups: [] });
	beforeEach(() => {
		mobile = false;
		pageHeight.set(100);
		spyOn(window, 'matchMedia').and.callFake(() => ({ matches: mobile }) as MediaQueryList);
		TestBed.configureTestingModule({
			imports: [SettingsComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: AuthService, useValue: { userInfo: user } },
				provideWebUiExtensions({
					id: 'test.admin',
					contributions: definePairedView(
						{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT },
						{ id: 'test.admin.users', viewId: 'users', label: 'Users', component: PageStub },
					),
				}),
			],
		});
	});
	async function setup() {
		const fixture = TestBed.createComponent(SettingsComponent);
		fixture.detectChanges();
		await fixture.whenStable();
		return fixture;
	}
	it('opens the shared administration drawer on desktop without duplicating navigation tabs', async () => {
		const fixture = await setup();
		const sidebar = TestBed.inject(SidebarService);
		expect(sidebar.activeTab()).toBe('administration');
		expect(sidebar.drawerOpen()).toBeTrue();
		expect(fixture.nativeElement.querySelector('.view-tabs')).toBeNull();
		expect(
			fixture.nativeElement.querySelector('[role="tabpanel"]').getAttribute('aria-label'),
		).toBe('Users');
		sidebar.closeDrawer();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(sidebar.drawerOpen()).toBeFalse();
	});
	it('keeps the page heading in view, as stock does, and scrolls only taller pages', async () => {
		const fixture = await setup();
		fixture.nativeElement.style.height = '600px';
		fixture.detectChanges();
		const view: HTMLElement = fixture.nativeElement.querySelector('.view-page');
		const heading: HTMLElement = view.querySelector('.view-page__header')!;
		expect(heading.textContent).toContain('Users');
		expect(view.scrollHeight).toBe(view.clientHeight);
		pageHeight.set(2000);
		fixture.detectChanges();
		await fixture.whenStable();
		view.scrollTop = 500;
		expect(view.scrollTop).toBe(500);
		expect(heading.getBoundingClientRect().top).toBe(view.getBoundingClientRect().top);
	});
	it('opens the same compact drawer on request and restores toggle focus when it closes', async () => {
		mobile = true;
		const fixture = await setup();
		const sidebar = TestBed.inject(SidebarService);
		expect(sidebar.drawerOpen()).toBeFalse();
		const button = fixture.nativeElement.querySelector('.nx-admin__mobile-toggle');
		spyOn(button, 'focus');
		button.click();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(sidebar.activeTab()).toBe('administration');
		expect(sidebar.drawerOpen()).toBeTrue();
		sidebar.closeDrawer();
		fixture.detectChanges();
		await fixture.whenStable();
		expect(button.focus).toHaveBeenCalled();
	});
});
