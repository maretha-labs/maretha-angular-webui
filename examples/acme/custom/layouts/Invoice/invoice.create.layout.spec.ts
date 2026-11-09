import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { InvoiceCreateLayoutComponent } from './invoice.create.layout';

describe('InvoiceCreateLayoutComponent', () => {
	it('binds the schema layout to the parent folder and finishes the dialog', () => {
		const host = jasmine.createSpyObj('DocumentLayoutHost', ['complete', 'cancel']);
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_LAYOUT_HOST, useValue: host },
			],
		});
		const fixture = TestBed.createComponent(InvoiceCreateLayoutComponent);
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: 'Invoice',
			mode: 'create',
			parentDocument: { uid: 'parent-1' },
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe('create');
		expect(layout.parentId()).toBe('parent-1');
		const saved = { uid: 'document-1', type: 'Invoice', properties: {} };
		layout.saved.emit(saved);
		expect(host.complete).toHaveBeenCalledOnceWith([saved]);
	});
});
