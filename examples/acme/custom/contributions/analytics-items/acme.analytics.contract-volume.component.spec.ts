import { TestBed } from '@angular/core/testing';
import type { AdministrationContext } from '@maretha/webui-sdk';
import { AcmeAnalyticsContractVolumeComponent } from './acme.analytics.contract-volume.component';

describe('AcmeAnalyticsContractVolumeComponent', () => {
	it('renders in its slot', () => {
		const fixture = TestBed.createComponent(AcmeAnalyticsContractVolumeComponent);
		fixture.componentRef.setInput('context', {} as AdministrationContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Contract volume');
	});
});
