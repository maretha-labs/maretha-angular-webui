import { TestBed } from '@angular/core/testing';
import type { UserMenuContext } from '@maretha/webui-sdk';
import { AcmeUserContractRegisterComponent } from './acme.user.contract-register.component';

describe('AcmeUserContractRegisterComponent', () => {
	it('links to the register page and closes the menu', () => {
		const close = jasmine.createSpy('close');
		const fixture = TestBed.createComponent(AcmeUserContractRegisterComponent);
		fixture.componentRef.setInput('context', {
			user: { id: 'jdoe', displayName: 'J. Doe', isAdministrator: false, groups: ['legal'] },
			locale: 'en-US',
			route: '/dashboard',
			document: null,
			languages: [],
			close,
			openProfile: () => undefined,
			changeLanguage: () => undefined,
			signOut: () => undefined,
		} as UserMenuContext);
		fixture.detectChanges();
		const link = fixture.nativeElement.querySelector('a');
		expect(link.getAttribute('href')).toBe('#/page/acme.page.contract-register');
		expect(link.textContent).toContain('Contract register');
		link.dispatchEvent(new Event('click'));
		expect(close).toHaveBeenCalledTimes(1);
	});
});
