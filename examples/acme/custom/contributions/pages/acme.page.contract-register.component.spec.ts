import { TestBed } from '@angular/core/testing';
import type { PageContext } from '@maretha/webui-sdk';
import { AcmePageContractRegisterComponent } from './acme.page.contract-register.component';

describe('AcmePageContractRegisterComponent', () => {
	it('shows the register filtered by the URL query', () => {
		const fixture = TestBed.createComponent(AcmePageContractRegisterComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			user: null,
			locale: 'en-US',
			route: '/page/acme.page.contract-register?counterparty=Globex',
			pageId: 'acme.page.contract-register',
			params: {},
			query: { counterparty: 'Globex' },
		} as PageContext);
		fixture.detectChanges();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Contract register');
		expect(text).toContain('Counterparty: Globex');
	});
});
