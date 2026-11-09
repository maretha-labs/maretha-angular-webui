import { TestBed } from '@angular/core/testing';
import type { BlobActionContext } from '@maretha/webui-sdk';
import { AcmeBlobSendToArchiveComponent } from './acme.blob.send-to-archive.component';

describe('AcmeBlobSendToArchiveComponent', () => {
	it('names the file it archives and follows the host download permission', () => {
		const reportMessage = jasmine.createSpy('reportMessage');
		const fixture = TestBed.createComponent(AcmeBlobSendToArchiveComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'contract-1' },
			noEdit: false,
			blob: { name: 'lease.pdf' },
			xpath: 'file:content',
			draft: false,
			allowedMimeTypes: [],
			download: () => undefined,
			reportMessage,
		} as BlobActionContext);
		fixture.detectChanges();
		const button = fixture.nativeElement.querySelector('button');
		expect(button.disabled).toBeFalse();
		button.click();
		expect(reportMessage).toHaveBeenCalledOnceWith(
			'acme.blob.archived',
			'Sent lease.pdf to the archive',
		);
	});
});
