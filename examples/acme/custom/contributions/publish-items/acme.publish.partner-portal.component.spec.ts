import { TestBed } from '@angular/core/testing';
import type { PublishContext } from '@maretha/webui-sdk';
import { AcmePublishPartnerPortalComponent } from './acme.publish.partner-portal.component';

describe('AcmePublishPartnerPortalComponent', () => {
	it('counts a selection snapshot, or the single document', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const fixture = TestBed.createComponent(AcmePublishPartnerPortalComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'c1' },
			noEdit: false,
			selectedDocuments: [{ uid: 'c1' }, { uid: 'c2' }],
			reportMessage,
		} as PublishContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('2 document(s)');
		fixture.nativeElement.querySelector('button').click();
		expect(reportMessage).toHaveBeenCalledOnceWith(
			'acme.publish.partner-portal.done',
			'Published 2 document(s)',
		);
		fixture.componentRef.setInput('context', {
			document: { uid: 'c1' },
			noEdit: false,
		} as PublishContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('1 document(s)');
	});
});
