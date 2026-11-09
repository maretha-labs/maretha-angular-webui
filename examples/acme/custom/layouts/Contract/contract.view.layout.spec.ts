import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DOCUMENT_LAYOUT_HOST,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { ContractViewLayoutComponent } from './contract.view.layout';

describe('ContractViewLayoutComponent', () => {
	it('binds the schema layout to the document', () => {
		const host = jasmine.createSpyObj('DocumentLayoutHost', ['complete', 'cancel']);
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_LAYOUT_HOST, useValue: host },
			],
		});
		const fixture = TestBed.createComponent(ContractViewLayoutComponent);
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: 'Contract',
			mode: 'view',
			document: { uid: 'document-1' },
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe('view');
		expect(layout.documentId()).toBe('document-1');
	});
});
