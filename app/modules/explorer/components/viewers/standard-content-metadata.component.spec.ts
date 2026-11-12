import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	DocumentTypeMetadata,
	WidgetProps,
	provideDocumentLayoutWidget,
	provideDocumentFieldExtensions,
} from '@maretha/webui-sdk';
import { of } from 'rxjs';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { StandardContentMetadataComponent } from './standard-content-metadata.component';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-test-metadata-paragraph',
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		'<label>Document summary<textarea [value]="props().value" [disabled]="props().disabled" (input)="props().commit($any($event.target).value)"></textarea></label>',
})
class TestMetadataParagraph {
	readonly props = input.required<WidgetProps>();
}

const typeMetadata: DocumentTypeMetadata = {
	name: 'File',
	schemas: [
		{ name: 'dublincore', prefix: 'dc', fields: { title: 'string', description: 'string' } },
		{
			name: 'client',
			prefix: 'client',
			fields: {
				summary: { type: 'string', maxLength: 8 },
				classification: { type: 'string[]', readOnly: true },
			},
		},
	],
};
const extension = {
	id: 'client-metadata',
	schema: 'client',
	documentTypes: ['File', 'Picture'],
	fields: [
		{ property: 'client:summary', label: 'Document summary', widget: 'client-paragraph' },
		{
			property: 'client:classification',
			label: 'Document classification',
			widget: 'directory',
			directoryName: 'classification',
		},
		{ property: 'client:unverified', label: 'Unverified field' },
	],
};

describe('Native metadata supplemental fields', () => {
	let gateway: {
		readDocumentType: jasmine.Spy;
		resolveReference$: jasmine.Spy;
		searchReferences: jasmine.Spy;
		update: jasmine.Spy;
	};
	let denied: Set<string>;
	beforeEach(() => {
		denied = new Set();
		gateway = {
			readDocumentType: jasmine.createSpy().and.resolveTo(typeMetadata),
			resolveReference$: jasmine
				.createSpy()
				.and.callFake((_field: unknown, id: string) => of({ id, label: 'Legal classification' })),
			searchReferences: jasmine.createSpy().and.resolveTo([]),
			update: jasmine
				.createSpy()
				.and.callFake((doc, properties) =>
					Promise.resolve({ ...doc, properties: { ...doc.properties, ...properties } }),
				),
		};
		TestBed.configureTestingModule({
			imports: [StandardContentMetadataComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentFieldExtensions(extension),
				provideDocumentLayoutWidget({ id: 'client-paragraph', component: TestMetadataParagraph }),
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{ provide: DocumentAttachmentsService, useValue: {} },
				{
					provide: DocumentsManagerService,
					useValue: { reloadDocument: () => of(fixtureDocument('File')) },
				},
				{
					provide: MetadataPolicyService,
					useValue: {
						revision: signal(0),
						load: () => Promise.resolve(),
						canRead: (_doc: unknown, property: string) => !denied.has(property),
						canWrite: (_doc: unknown, property: string) => !denied.has(property),
						assertWritable: () => Promise.resolve(),
						visibleDocument: (doc: unknown) => doc,
						userPreferences: () => ({
							hiddenFields: [],
							hiddenSchemas: [],
							fieldOrder: [],
							metadataHidden: false,
						}),
					},
				},
			],
		});
	});
	function doc(type = 'File') {
		return {
			...fixtureDocument(type),
			properties: {
				'dc:title': 'Title',
				'dc:description': 'Description',
				'client:summary': 'Original',
				'client:classification': ['legal'],
				'client:unverified': 'Must not render',
				'private:detail': 'Private',
			},
		};
	}
	async function render(document = doc()) {
		const fixture = TestBed.createComponent(StandardContentMetadataComponent);
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		return fixture;
	}
	it('uses the external inspector toolbar without repeating its metadata heading and edit action', async () => {
		const fixture = await render();
		fixture.componentRef.setInput('externalToolbar', true);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('header')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('Document summary');
	});
	it('unions native fields with schema-verified contributed fields and resolves their labels/directories', async () => {
		const fixture = await render();
		const component = fixture.componentInstance;
		expect(component.allowedFields.map((field) => field.property)).toEqual(
			jasmine.arrayContaining(['dc:title', 'client:summary', 'client:classification']),
		);
		expect(component.allowedFields.map((field) => field.property)).not.toContain(
			'client:unverified',
		);
		expect(component.allowedFields.map((field) => field.property)).not.toContain('private:detail');
		expect(fixture.nativeElement.textContent).toContain('Document summary');
		expect(fixture.nativeElement.textContent).toContain('Document classification');
		expect(fixture.nativeElement.textContent).toContain('Legal classification');
		expect(fixture.nativeElement.textContent).not.toContain('Must not render');
		expect(gateway.readDocumentType).toHaveBeenCalledOnceWith(
			'File',
			component.document,
			'metadata',
		);
		const classification = component.allowedFields.find(
			(field) => field.property === 'client:classification',
		)!;
		expect(component.canEdit(classification)).toBeFalse();
	});
	it('commits native and supplemental edits in one write and validates server constraints', async () => {
		const fixture = await render();
		const component = fixture.componentInstance;
		component.beginEdit();
		const summary = component.allowedFields.find((field) => field.property === 'client:summary')!;
		component.widgetProps(summary)!.commit('Too long for schema');
		expect(component.hasInvalidChanges).toBeTrue();
		await component.save();
		expect(gateway.update).not.toHaveBeenCalled();
		component.widgetProps(summary)!.commit('Edited');
		component
			.widgetProps(component.allowedFields.find((field) => field.property === 'dc:title')!)!
			.commit('New title');
		await component.save();
		expect(gateway.update).toHaveBeenCalledTimes(1);
		expect(gateway.update.calls.mostRecent().args[1]).toEqual({
			'dc:title': 'New title',
			'client:summary': 'Edited',
		});
	});
	it('renders a registered paragraph widget during metadata editing', async () => {
		const fixture = await render();
		const component = fixture.componentInstance;
		component.beginEdit();
		fixture.detectChanges();
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector(
			'nx-test-metadata-paragraph textarea',
		);
		expect(textarea).not.toBeNull();
		textarea.value = 'Custom';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(
			component.allowedFields.find((field) => field.property === 'client:summary')?.value,
		).toBe('Custom');
		expect(component.dirty).toBeTrue();
	});
	it('keeps hidden fields out of the DOM and respects noEdit and retention', async () => {
		denied.add('client:summary');
		const fixture = await render();
		const component = fixture.componentInstance;
		expect(fixture.nativeElement.textContent).not.toContain('Document summary');
		expect(fixture.nativeElement.textContent).not.toContain('Original');
		fixture.componentRef.setInput('noEdit', true);
		fixture.detectChanges();
		expect(component.hasEditableFields).toBeFalse();
		fixture.componentRef.setInput('noEdit', false);
		fixture.componentRef.setInput('document', { ...doc(), isUnderRetentionOrLegalHold: true });
		fixture.detectChanges();
		await fixture.whenStable();
		expect(component.hasEditableFields).toBeFalse();
	});
	it('asks before removing a saved attachment and keeps it when declined', async () => {
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		const withAttachment: any = {
			...doc(),
			properties: { ...doc().properties, 'files:files': [{ file: { name: 'audit-att-1.txt' } }] },
		};
		const fixture = await render(withAttachment);
		const component = fixture.componentInstance;
		await component.removeAttachment(0);
		if (component.mayWriteAttachments)
			expect(confirm).toHaveBeenCalledWith(
				jasmine.objectContaining({ messageValues: { name: 'audit-att-1.txt' }, destructive: true }),
			);
		expect(gateway.update).not.toHaveBeenCalled();
		expect(component.attachedFiles.length).toBe(1);
	});
	it('ignores stale metadata after changing documents', async () => {
		let resolveFirst!: (value: DocumentTypeMetadata) => void;
		let resolveSecond!: (value: DocumentTypeMetadata) => void;
		gateway.readDocumentType.and.returnValues(
			new Promise((resolve) => (resolveFirst = resolve)),
			new Promise((resolve) => (resolveSecond = resolve)),
		);
		const fixture = TestBed.createComponent(StandardContentMetadataComponent);
		fixture.componentRef.setInput('document', doc());
		fixture.detectChanges();
		fixture.componentRef.setInput('document', { ...doc('Picture'), uid: 'picture' });
		fixture.detectChanges();
		resolveSecond({
			...typeMetadata,
			name: 'Picture',
			schemas: [
				{ name: 'client', prefix: 'client', fields: { summary: { type: 'string', maxLength: 5 } } },
			],
		});
		await Promise.resolve();
		fixture.detectChanges();
		resolveFirst(typeMetadata);
		await fixture.whenStable();
		fixture.detectChanges();
		const component = fixture.componentInstance;
		const summary = component.allowedFields.find((field) => field.property === 'client:summary')!;
		expect(component.widgetProps(summary)?.field.maxLength).toBe(5);
		expect(gateway.readDocumentType).toHaveBeenCalledTimes(2);
	});
});
