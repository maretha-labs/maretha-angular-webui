import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { InvoiceEditLayoutComponent } from './invoice.edit.layout';

describe('InvoiceEditLayoutComponent', () => {
	it('binds the schema layout to the document and finishes the dialog', () => {
		const host = jasmine.createSpyObj('DocumentLayoutHost', ['complete', 'cancel']);
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_LAYOUT_HOST, useValue: host },
			],
		});
		const fixture = TestBed.createComponent(InvoiceEditLayoutComponent);
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: 'Invoice',
			mode: 'edit',
			document: { uid: 'document-1' },
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe('edit');
		expect(layout.documentId()).toBe('document-1');
		const saved = { uid: 'document-1', type: 'Invoice', properties: {} };
		layout.saved.emit(saved);
		expect(host.complete).toHaveBeenCalledOnceWith([saved]);
	});
});
