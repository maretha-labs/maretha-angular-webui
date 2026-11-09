import { TestBed } from '@angular/core/testing';
import type { AdministrationContext } from '@maretha/webui-sdk';
import { AcmeAnalyticsInvoiceAgingComponent } from './acme.analytics.invoice-aging.component';

describe('AcmeAnalyticsInvoiceAgingComponent', () => {
	it('renders in its slot', () => {
		const fixture = TestBed.createComponent(AcmeAnalyticsInvoiceAgingComponent);
		fixture.componentRef.setInput('context', {} as AdministrationContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Invoice aging');
	});
});
