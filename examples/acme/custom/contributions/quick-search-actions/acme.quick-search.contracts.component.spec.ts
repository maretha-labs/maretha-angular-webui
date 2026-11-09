import { TestBed } from '@angular/core/testing';
import type { QuickSearchContext } from '@maretha/webui-sdk';
import { AcmeQuickSearchContractsComponent } from './acme.quick-search.contracts.component';

describe('AcmeQuickSearchContractsComponent', () => {
	const render = (navigated: boolean) => {
		const navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(navigated));
		const close = jasmine.createSpy('close');
		const fixture = TestBed.createComponent(AcmeQuickSearchContractsComponent);
		fixture.componentRef.setInput('context', {
			user: null,
			locale: 'en-US',
			route: '/dashboard',
			document: null,
			searchTerm: 'contracts',
			navigate,
			close,
		} as QuickSearchContext);
		fixture.detectChanges();
		return { fixture, navigate, close };
	};

	it('opens the register page and closes the overlay', async () => {
		const { fixture, navigate, close } = render(true);
		expect(fixture.nativeElement.textContent).toContain('Open the contract register');
		await fixture.componentInstance.run();
		expect(navigate).toHaveBeenCalledOnceWith('/page/acme.page.contract-register');
		expect(close).toHaveBeenCalledTimes(1);
	});

	it('keeps the overlay open when a departure guard refuses', async () => {
		const { fixture, close } = render(false);
		await fixture.componentInstance.run();
		expect(close).not.toHaveBeenCalled();
	});
});
