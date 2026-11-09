import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
	defineContribution,
	ExtensionRegistry,
	USER_MENU_SLOT,
	UserMenuContext,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { provideDefaultUserMenu } from './default-user-menu';

@Component({
	selector: 'nx-client-drive-menu',
	standalone: true,
	template: '<button type="button" (click)="context().close()">Client Drive</button>',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ClientDriveMenuComponent {
	readonly context = input.required<UserMenuContext>();
}

describe('Default user menu contributions', () => {
	let fixture: ComponentFixture<WebUiSlotComponent>;
	let registry: ExtensionRegistry;
	let context: UserMenuContext;
	let openProfile: jasmine.Spy;
	let changeLanguage: jasmine.Spy;
	let signOut: jasmine.Spy;
	let close: jasmine.Spy;
	let navigateByUrl: jasmine.Spy;

	function buttons(): HTMLButtonElement[] {
		return [...fixture.nativeElement.querySelectorAll('button')];
	}

	function button(label: string): HTMLButtonElement {
		const result = buttons().find((item) => item.textContent?.trim() === label);
		if (!result) throw new Error(`User menu button not found: ${label}`);
		return result;
	}

	async function settle(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();
	}

	beforeEach(async () => {
		openProfile = jasmine.createSpy('openProfile');
		changeLanguage = jasmine.createSpy('changeLanguage');
		signOut = jasmine.createSpy('signOut');
		close = jasmine.createSpy('close');
		navigateByUrl = jasmine.createSpy('navigateByUrl').and.resolveTo(true);
		context = {
			user: { id: 'reviewer', displayName: 'Content Reviewer', isAdministrator: false, groups: [] },
			locale: 'en',
			route: '/browse/documents/contract-1',
			document: { uid: 'contract-1', type: 'Contract' },
			languages: [
				{ key: 'en', label: 'English' },
				{ key: 'fr', label: 'Français' },
			],
			close,
			openProfile,
			changeLanguage,
			signOut,
		};
		TestBed.configureTestingModule({
			imports: [WebUiSlotComponent],
			providers: [provideDefaultUserMenu(), { provide: Router, useValue: { navigateByUrl } }],
		});
		registry = TestBed.inject(ExtensionRegistry);
		fixture = TestBed.createComponent(WebUiSlotComponent);
		fixture.componentRef.setInput('name', USER_MENU_SLOT.name);
		fixture.componentRef.setInput('layout', 'stack');
		fixture.componentRef.setInput('context', context);
		fixture.nativeElement.style.width = '320px';
		await settle();
	});

	it('renders seven independently addressable defaults in their declared order', () => {
		expect(fixture.componentInstance.resolution().items.map((item) => item.id)).toEqual([
			'maretha.user.profile',
			'maretha.user.authorized-applications',
			'maretha.user.cloud-services',
			'maretha.user.themes',
			'maretha.user.language',
			'maretha.user.sign-out',
		]);
		expect(buttons().map((item) => item.textContent?.trim())).toEqual([
			'Profile',
			'Authorized Applications',
			'Cloud Services',
			'Themes',
			'English',
			'Français',
			'Sign Out',
		]);
		expect(fixture.componentInstance.diagnostics()).toEqual([]);
	});

	it('stacks full-width rows through the real slot and contribution hosts', () => {
		const host = fixture.nativeElement.getBoundingClientRect();
		expect(host.width).toBeCloseTo(320, 0);
		const rows = buttons().map((item) => item.getBoundingClientRect());
		for (let index = 0; index < rows.length; index++) {
			expect(rows[index].width).toBeCloseTo(host.width, 0);
			expect(rows[index].left).toBeCloseTo(host.left, 0);
			if (index > 0) expect(rows[index].top).toBeGreaterThanOrEqual(rows[index - 1].bottom);
		}
	});

	it('routes account actions and delegates sign-out to the current host callback', async () => {
		button('Profile').click();
		button('Authorized Applications').click();
		button('Cloud Services').click();
		button('Themes').click();
		button('Sign Out').click();
		expect(navigateByUrl.calls.allArgs()).toEqual([
			['/profile'],
			['/user-authorized-apps'],
			['/user-cloud-services'],
			['/themes'],
		]);
		expect(signOut).toHaveBeenCalledTimes(1);
		expect(close).not.toHaveBeenCalled();

		const nextSignOut = jasmine.createSpy('nextSignOut');
		fixture.componentRef.setInput('context', {
			...context,
			signOut: nextSignOut,
		});
		await settle();
		button('Sign Out').click();
		expect(nextSignOut).toHaveBeenCalledTimes(1);
		expect(signOut).toHaveBeenCalledTimes(1);
	});

	it('keeps no disabled account placeholders in the core menu', () => {
		for (const label of ['Profile', 'Authorized Applications', 'Cloud Services', 'Themes'])
			expect(button(label).disabled).toBeFalse();
		expect(buttons().some((item) => item.textContent?.trim() === 'Nuxeo Drive')).toBeFalse();
		expect(openProfile).not.toHaveBeenCalled();
		expect(signOut).not.toHaveBeenCalled();
		expect(changeLanguage).not.toHaveBeenCalled();
		expect(close).not.toHaveBeenCalled();
	});

	it('marks the current language and updates the available selection with the context', async () => {
		expect(button('English').disabled).toBeTrue();
		expect(button('English').getAttribute('aria-current')).toBe('true');
		expect(button('Français').disabled).toBeFalse();
		button('English').click();
		expect(changeLanguage).not.toHaveBeenCalled();
		button('Français').click();
		expect(changeLanguage).toHaveBeenCalledOnceWith('fr');

		fixture.componentRef.setInput('context', { ...context, locale: 'fr' });
		await settle();
		expect(button('Français').disabled).toBeTrue();
		expect(button('Français').getAttribute('aria-current')).toBe('true');
		expect(button('English').disabled).toBeFalse();
		expect(button('English').hasAttribute('aria-current')).toBeFalse();
	});

	it('removes all defaults while signed out and restores them when a user returns', async () => {
		fixture.componentRef.setInput('context', { ...context, user: null });
		await settle();
		expect(buttons()).toEqual([]);
		expect(fixture.componentInstance.resolution().items).toEqual([]);
		fixture.componentRef.setInput('context', context);
		await settle();
		expect(buttons().length).toBe(7);
	});

	it('removes and reorders individual defaults, then restores their original order', async () => {
		const dispose = registry.register({
			id: 'client.user-menu',
			overrides: [
				{ slot: USER_MENU_SLOT.name, id: 'maretha.user.profile', disabled: true },
				{ slot: USER_MENU_SLOT.name, id: 'maretha.user.sign-out', order: 0 },
			],
		});
		await settle();
		expect(buttons().some((item) => item.textContent?.trim() === 'Profile')).toBeFalse();
		expect(buttons()[0].textContent?.trim()).toBe('Sign Out');
		dispose();
		await settle();
		expect(buttons()[0].textContent?.trim()).toBe('Profile');
		expect(buttons().at(-1)?.textContent?.trim()).toBe('Sign Out');
	});

	it('lets a client add a Drive entry when the Drive integration is installed', async () => {
		const dispose = registry.register({
			id: 'client.drive',
			contributions: [
				defineContribution(USER_MENU_SLOT, {
					id: 'client.drive',
					order: 20,
					component: ClientDriveMenuComponent,
					when: (value) => value.user !== null,
				}),
			],
		});
		await settle();
		expect(button('Client Drive').disabled).toBeFalse();
		button('Client Drive').click();
		expect(close).toHaveBeenCalledTimes(1);
		dispose();
		await settle();
		expect(buttons().some((item) => item.textContent?.trim() === 'Client Drive')).toBeFalse();
	});

	it('toggles theme picker and opens profile or closes on mobile route activation in UserMenuRowComponent', async () => {
		const { UserMenuRowComponent } = await import('./user-menu-row.component');
		const rowFixture = TestBed.createComponent(UserMenuRowComponent);
		rowFixture.componentRef.setInput('context', context);
		rowFixture.componentRef.setInput('label', 'Themes');
		rowFixture.componentRef.setInput('action', 'themes');
		rowFixture.detectChanges();
		rowFixture.componentInstance.activate();
		expect(rowFixture.componentInstance.themesOpen()).toBeTrue();
		rowFixture.componentRef.setInput('action', 'profile');
		rowFixture.detectChanges();
		rowFixture.componentInstance.activate();
		expect(openProfile).toHaveBeenCalledTimes(1);
	});
});
