import { TestBed } from '@angular/core/testing';
import type { ResultsSelectionContext } from '@maretha/webui-sdk';
import { AcmeTrashReportDeletionComponent } from './acme.trash.report-deletion.component';

describe('AcmeTrashReportDeletionComponent', () => {
	it('reports the selected documents', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const fixture = TestBed.createComponent(AcmeTrashReportDeletionComponent);
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			selectedDocuments: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
			busy: false,
			setBusy: () => undefined,
			refresh: () => Promise.resolve(),
			reportError: () => undefined,
			reportMessage,
		} as ResultsSelectionContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Report deletion (3)');
		fixture.nativeElement.querySelector('button').click();
		expect(reportMessage).toHaveBeenCalledOnceWith(
			'acme.trash.deletion-reported',
			'Reported 3 document(s) for deletion',
		);
	});
});
