import { TestBed } from '@angular/core/testing';
import type { PublishContext } from '@maretha/webui-sdk';
import { AcmePublishPublicRegisterComponent } from './acme.publish.public-register.component';

describe('AcmePublishPublicRegisterComponent', () => {
	it('names the single document and refuses a selection', () => {
		const fixture = TestBed.createComponent(AcmePublishPublicRegisterComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'c1', title: 'Office lease' },
			noEdit: false,
		} as PublishContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Office lease will appear');
		fixture.componentRef.setInput('context', {
			document: null,
			noEdit: false,
			selectedDocuments: [{ uid: 'c1' }],
		} as PublishContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('one at a time');
	});
});
