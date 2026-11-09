import { TestBed } from '@angular/core/testing';
import type { ShellActionContext } from '@maretha/webui-sdk';
import { AcmeShellContractRegisterComponent } from './acme.shell.contract-register.component';

describe('AcmeShellContractRegisterComponent', () => {
	it('navigates to the register page', () => {
		const navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
		const fixture = TestBed.createComponent(AcmeShellContractRegisterComponent);
		fixture.componentRef.setInput('context', {
			user: null,
			locale: 'en-US',
			route: '/dashboard',
			document: null,
			navigate,
		} as ShellActionContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Contract register');
		fixture.nativeElement.querySelector('button').click();
		expect(navigate).toHaveBeenCalledOnceWith('/page/acme.page.contract-register');
	});
});
