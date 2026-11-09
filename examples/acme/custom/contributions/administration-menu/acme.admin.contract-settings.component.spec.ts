import { TestBed } from '@angular/core/testing';
import type { AdministrationContext } from '@maretha/webui-sdk';
import { AcmeAdminContractSettingsComponent } from './acme.admin.contract-settings.component';

describe('AcmeAdminContractSettingsComponent', () => {
	it('shows the administrator and the server features', () => {
		const fixture = TestBed.createComponent(AcmeAdminContractSettingsComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			user: { id: 'admin', displayName: 'Administrator', isAdministrator: true, groups: [] },
			features: { retention: true },
		} as AdministrationContext);
		fixture.detectChanges();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Contract settings');
		expect(text).toContain('Administrator');
		expect(text).toContain('Retention is enabled');
	});
});
