import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
	DOCUMENT_IMPORT_DRAFT,
	DOCUMENT_LAYOUT_GATEWAY,
	SchemaLayoutComponent,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { ContractImportLayoutComponent } from './contract.import.layout';

describe('ContractImportLayoutComponent', () => {
	it('edits the draft of one imported file without saving it', () => {
		const draft = {
			file: new File(['content'], 'source.pdf'),
			properties: { 'dc:title': 'source.pdf' },
			update: jasmine.createSpy('update'),
			setValid: jasmine.createSpy('setValid'),
		};
		const pending = () => new Promise<never>(() => undefined);
		TestBed.configureTestingModule({
			providers: [
				{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: { readType: pending, read: pending } },
				{ provide: DOCUMENT_IMPORT_DRAFT, useValue: draft },
			],
		});
		const fixture = TestBed.createComponent(ContractImportLayoutComponent);
		fixture.componentInstance.layoutContext = documentLayoutContext({
			documentType: 'Contract',
			mode: 'import',
			parentDocument: { uid: 'parent-1' },
		});
		fixture.detectChanges();
		const layout = fixture.debugElement.query(By.directive(SchemaLayoutComponent))
			.componentInstance as SchemaLayoutComponent;
		expect(layout.mode()).toBe('import');
		expect(layout.parentId()).toBe('parent-1');
		expect(layout.draftOnly()).toBeTrue();
		expect(layout.initialValues()).toEqual({ 'dc:title': 'source.pdf' });
		const values = { 'dc:title': 'Signed source' };
		layout.valueChanged.emit(values);
		expect(draft.update).toHaveBeenCalledOnceWith(values);
	});
});
