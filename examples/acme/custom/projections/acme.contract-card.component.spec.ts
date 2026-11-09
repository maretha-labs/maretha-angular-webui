import { TestBed } from '@angular/core/testing';
import type { ResultsProjectionContext } from '@maretha/webui-sdk';
import { AcmeContractCardComponent } from './acme.contract-card.component';

describe('AcmeContractCardComponent', () => {
	it('shows the contract and opens it through the host callback', () => {
		const activateRow = jasmine.createSpy('activateRow');
		const fixture = TestBed.createComponent(AcmeContractCardComponent);
		fixture.componentRef.setInput('context', {
			row: {
				uid: 'contract-1',
				title: 'Office lease',
				type: 'Contract',
				properties: { 'contract:counterparty': 'Globex', 'contract:amount': 12000 },
			},
			index: 0,
			selected: true,
			activateRow,
		} as unknown as ResultsProjectionContext);
		fixture.detectChanges();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Office lease');
		expect(text).toContain('Globex');
		expect(text).toContain('12000');
		expect(fixture.nativeElement.querySelector('article').classList).toContain('selected');
		fixture.nativeElement.querySelector('button').click();
		expect(activateRow).toHaveBeenCalledTimes(1);
	});
});
