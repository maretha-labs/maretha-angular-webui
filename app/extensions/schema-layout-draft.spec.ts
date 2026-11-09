import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCUMENT_LAYOUT_GATEWAY, DocumentLayoutGateway } from './document-layout';
import { SchemaLayoutComponent } from './schema-layout.component';

describe('Schema layout external draft ownership', () => {
	let fixture: ComponentFixture<SchemaLayoutComponent>;
	let gateway: jasmine.SpyObj<Required<DocumentLayoutGateway>>;
	async function settle() {
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	}
	beforeEach(async () => {
		gateway = jasmine.createSpyObj('gateway', [
			'readType',
			'read',
			'create',
			'update',
			'uploadBlob',
			'releaseBlob',
		]);
		gateway.readType.and.resolveTo({
			name: 'File',
			schemas: [
				{
					name: 'test',
					prefix: 'test',
					fields: {
						title: { type: 'string', required: true },
						file: 'blob',
						locked: { type: 'string', readOnly: true },
					},
				},
			],
		});
		gateway.uploadBlob.and.resolveTo({
			'upload-batch': 'batch-1',
			'upload-fileId': '0',
			name: 'customer.txt',
		});
		gateway.releaseBlob.and.resolveTo();
		TestBed.configureTestingModule({
			providers: [{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: gateway }],
		});
		fixture = TestBed.createComponent(SchemaLayoutComponent);
		fixture.componentRef.setInput('layout', {
			id: 'draft',
			documentType: 'File',
			preserveSchemaConstraints: true,
			fields: [
				{ property: 'test:title', label: 'Customer title' },
				{ property: 'test:file', label: 'Customer attachment' },
				{ property: 'test:locked', label: 'Server field' },
			],
		});
		fixture.componentRef.setInput('mode', 'import');
		fixture.componentRef.setInput('parentId', 'parent');
		fixture.componentRef.setInput('draftOnly', true);
		fixture.componentRef.setInput('initialValues', {
			'test:title': 'First',
			'test:locked': 'unchanged',
		});
		await settle();
	});
	it('emits cloned normalized customer drafts and never writes in draft-only mode', async () => {
		const c = fixture.componentInstance,
			emitted = jasmine.createSpy();
		c.valueChanged.subscribe(emitted);
		const title = c.fields()[0];
		c.widgetProps(title).commit('Deuxième');
		expect(emitted).toHaveBeenCalledWith(jasmine.objectContaining({ 'test:title': 'Deuxième' }));
		expect(c.draftProperties()['test:locked']).toBeUndefined();
		await c.submit(new Event('submit'));
		expect(gateway.create).not.toHaveBeenCalled();
		fixture.componentRef.setInput('initialValues', { 'test:title': 'Other row' });
		await settle();
		expect(c.values()['test:title']).toBe('Other row');
		expect(c.dirty()).toBeFalse();
	});
	it('keeps a protected upload through destruction and never deletes an uncertain committed reference', async () => {
		const c = fixture.componentInstance,
			field = c.fields()[1],
			props = c.widgetProps(field),
			value = await props.upload!(new File(['x'], 'customer.txt'));
		props.commit(value);
		const finish = c.protectDraft();
		fixture.destroy();
		expect(gateway.releaseBlob).not.toHaveBeenCalled();
		finish('uncertain');
		expect(gateway.releaseBlob).not.toHaveBeenCalled();
		finish('failed');
		expect(gateway.releaseBlob).not.toHaveBeenCalled();
	});
	it('releases a destroyed draft only after the external write definitively failed', async () => {
		const c = fixture.componentInstance,
			props = c.widgetProps(c.fields()[1]),
			value = await props.upload!(new File(['x'], 'customer.txt'));
		props.commit(value);
		const finish = c.protectDraft();
		fixture.destroy();
		finish('failed');
		expect(gateway.releaseBlob).toHaveBeenCalledWith(value);
	});
	it('does not weaken required or read-only schema constraints from authored overrides', () => {
		const c = fixture.componentInstance;
		c.widgetProps(c.fields()[0]).commit('');
		expect(c.invalid()).toBeTrue();
		c.widgetProps(c.fields()[2]).commit('Must not write');
		expect(c.values()['test:locked']).toBe('unchanged');
	});
});
