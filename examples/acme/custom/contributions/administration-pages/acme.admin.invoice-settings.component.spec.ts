import { TestBed } from '@angular/core/testing';
import type { AdministrationContext } from '@maretha/webui-sdk';
import { AcmeAdminInvoiceSettingsComponent } from './acme.admin.invoice-settings.component';

describe('AcmeAdminInvoiceSettingsComponent', () => {
	it('renders in its slot', () => {
		const fixture = TestBed.createComponent(AcmeAdminInvoiceSettingsComponent);
		fixture.componentRef.setInput('context', {} as AdministrationContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Invoice settings');
	});
});
