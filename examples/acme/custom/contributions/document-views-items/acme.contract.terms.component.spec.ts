import { TestBed } from '@angular/core/testing';
import type { DocumentViewContext } from '@maretha/webui-sdk';
import { AcmeContractTermsComponent } from './acme.contract.terms.component';

describe('AcmeContractTermsComponent', () => {
	it('renders the contract terms from the document properties', () => {
		const fixture = TestBed.createComponent(AcmeContractTermsComponent);
		fixture.componentRef.setInput('context', {
			document: {
				uid: 'c1',
				type: 'Contract',
				properties: { 'contract:counterparty': 'Globex', 'contract:amount': 12000 },
			},
			noEdit: false,
		} as DocumentViewContext);
		fixture.detectChanges();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Terms');
		expect(text).toContain('Globex');
		expect(text).toContain('12000');
	});
});
