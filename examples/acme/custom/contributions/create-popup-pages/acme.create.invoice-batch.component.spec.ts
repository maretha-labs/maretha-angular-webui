import { TestBed } from '@angular/core/testing';
import type { DocumentCreateContext } from '@maretha/webui-sdk';
import { AcmeCreateInvoiceBatchComponent } from './acme.create.invoice-batch.component';

describe('AcmeCreateInvoiceBatchComponent', () => {
	it('starts the host import flow', () => {
		const importFiles = jasmine.createSpy('importFiles');
		const fixture = TestBed.createComponent(AcmeCreateInvoiceBatchComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'folder-1' },
			noEdit: false,
			types: [],
			create: () => undefined,
			importFiles,
			open: () => undefined,
		} as DocumentCreateContext);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Invoice batch');
		fixture.nativeElement.querySelector('button').click();
		expect(importFiles).toHaveBeenCalledTimes(1);
	});
});
