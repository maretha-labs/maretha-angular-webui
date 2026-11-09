import { TestBed } from '@angular/core/testing';
import type { DocumentViewContext } from '@maretha/webui-sdk';
import { AcmeInvoiceLinesComponent } from './acme.invoice.lines.component';

describe('AcmeInvoiceLinesComponent', () => {
	it('renders the invoice fields from the document properties', () => {
		const fixture = TestBed.createComponent(AcmeInvoiceLinesComponent);
		fixture.componentRef.setInput('context', {
			document: {
				uid: 'i1',
				type: 'Invoice',
				properties: { 'invoice:number': 'INV-7', 'invoice:amount': 450, 'invoice:paid': true },
			},
			noEdit: false,
		} as DocumentViewContext);
		fixture.detectChanges();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Invoice lines');
		expect(text).toContain('INV-7');
		expect(text).toContain('Yes');
	});
});
