import { TestBed } from '@angular/core/testing';
import type { ResultsToolbarContext } from '@maretha/webui-sdk';
import { AcmeSelectionMarkReviewedComponent } from './acme.selection.mark-reviewed.component';

describe('AcmeSelectionMarkReviewedComponent', () => {
	it('marks the host busy, refreshes the listing and releases the host', async () => {
		const setBusy = jasmine.createSpy('setBusy');
		const refresh = jasmine.createSpy('refresh').and.returnValue(Promise.resolve());
		const fixture = TestBed.createComponent(AcmeSelectionMarkReviewedComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			selectedDocuments: [{ uid: 'a' }, { uid: 'b' }],
			busy: false,
			setBusy,
			refresh,
			reportError: () => undefined,
			loadedCount: 2,
			totalCount: 2,
			allSelected: true,
			availableCommands: [],
			workflows: [],
			execute: () => Promise.resolve(),
		} as ResultsToolbarContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Mark reviewed (2)');
		await fixture.componentInstance.run();
		expect(setBusy.calls.allArgs()).toEqual([[true], [false]]);
		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
