import { TestBed } from '@angular/core/testing';
import type { DocumentActionContext } from '@maretha/webui-sdk';
import { AcmeContractApproveComponent } from './acme.contract.approve.component';

describe('AcmeContractApproveComponent', () => {
	const render = (context: Partial<DocumentActionContext>) => {
		const fixture = TestBed.createComponent(AcmeContractApproveComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'contract-1', type: 'Contract', title: 'Office lease' },
			noEdit: false,
			...context,
		} as DocumentActionContext);
		fixture.detectChanges();
		return fixture;
	};

	it('reports the approval and refreshes the document', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const refreshDocument = jasmine.createSpy('refreshDocument');
		const fixture = render({ reportMessage, refreshDocument });
		expect(fixture.nativeElement.textContent).toContain('Approve');
		fixture.nativeElement.querySelector('button').click();
		expect(reportMessage).toHaveBeenCalledOnceWith('acme.contract.approved', 'Contract approved');
		expect(refreshDocument).toHaveBeenCalledTimes(1);
	});

	it('is disabled for a read-only document', () => {
		const fixture = render({ noEdit: true });
		expect(fixture.nativeElement.querySelector('button').disabled).toBeTrue();
	});
});
