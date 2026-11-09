import { TestBed } from '@angular/core/testing';
import type { DocumentInfoBarContext } from '@maretha/webui-sdk';
import { AcmeContractReviewNoticeComponent } from './acme.contract.review-notice.component';

describe('AcmeContractReviewNoticeComponent', () => {
	it('renders in its slot', () => {
		const fixture = TestBed.createComponent(AcmeContractReviewNoticeComponent);
		fixture.componentRef.setInput('context', {} as DocumentInfoBarContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('This contract is under review');
	});
});
