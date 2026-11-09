import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideDocumentFieldExtensions } from '@maretha/webui-sdk';
import { SupplementalDocumentFieldsComponent } from '../supplemental-document-fields.component';
import { DocumentLayoutGatewayService } from '../../../helpers/document-layout-gateway.service';
import { MetadataPolicyService } from '../../../helpers/metadata-policy.service';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormArray } from '@angular/forms';
import { of } from 'rxjs';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';

import { BinaryEditorComponent } from './binary-editor.component';

describe('BinaryEditorComponent', () => {
	let component: BinaryEditorComponent;
	let fixture: ComponentFixture<BinaryEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [BinaryEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(BinaryEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('parentDocument', fixtureDocument());
		fixture.componentRef.setInput('documents', [
			fixtureDocument(),
			{ ...fixtureDocument(), uid: 'fixture-second' },
		]);
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('BinaryEditorComponent attachments', () => {
	it('marks replaced main and additional attachments dirty', () => {
		TestBed.configureTestingModule({
			imports: [BinaryEditorComponent],
			providers: legacyTestProviders(),
		});
		spyOn(TestBed.inject(DocumentsManagerService), 'getDocumentType').and.returnValue(
			of({ schemas: [{ name: 'file' }] } as any),
		);
		const fixture = TestBed.createComponent(BinaryEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('parentDocument', fixtureDocument('Folder'));
		fixture.detectChanges();
		const editor = fixture.componentInstance;
		const main = new File(['main'], 'main.txt');
		const extra = [new File(['one'], 'one.txt'), new File(['two'], 'two.txt')];
		editor.mainAttachmentUpdated([main]);
		editor.additionalAttachmentsUpdated(extra);
		const content = editor.editorForm!.get('file:content')!;
		const files = editor.editorForm!.get('files:files') as FormArray;
		expect(content.value).toBe(main);
		expect(content.dirty).toBeTrue();
		expect(files.value).toEqual(extra);
		expect(files.dirty).toBeTrue();
		expect(files.controls.every((control) => control.dirty)).toBeTrue();
	});
});

describe('Picture binary editor supplemental fields', () => {
	const names = [
		'altText',
		'brand',
		'seo',
		'restrictions',
		'elementsDetected',
		'smartCrops',
		'classification',
		'safetyText',
		'safety',
		'imageScene',
	];
	const labels = [
		'Alt Text',
		'Brand',
		'SEO',
		'Restrictions',
		'Elements Detected',
		'Smart Crops',
		'Classification',
		'Safety Text',
		'Safety',
		'Image Scene',
	];
	let gateway: { readDocumentType: jasmine.Spy; searchReferences: jasmine.Spy };
	beforeEach(() => {
		gateway = {
			readDocumentType: jasmine.createSpy().and.resolveTo({
				name: 'Picture',
				schemas: [
					{
						name: 'ai',
						prefix: 'ai',
						fields: Object.fromEntries(
							names.map((name) => [
								name,
								[
									'elementsDetected',
									'smartCrops',
									'classification',
									'safety',
									'imageScene',
								].includes(name)
									? 'string[]'
									: 'string',
							]),
						),
					},
				],
			}),
			searchReferences: jasmine.createSpy().and.resolveTo([]),
		};
		TestBed.configureTestingModule({
			imports: [BinaryEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentFieldExtensions({
					id: 'picture.ai',
					schema: 'ai',
					documentTypes: ['Picture'],
					modes: ['create', 'edit'],
					fields: names.map((name, index) => ({ property: `ai:${name}`, label: labels[index] })),
				}),
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{
					provide: MetadataPolicyService,
					useValue: {
						revision: signal(0),
						load: () => Promise.resolve(),
						canRead: () => true,
						canWrite: () => true,
					},
				},
			],
		});
	});
	function picture() {
		return {
			...fixtureDocument('Picture'),
			schemas: [{ name: 'ai', prefix: 'ai' }],
			properties: {
				...fixtureDocument('Picture').properties,
				...Object.fromEntries(
					names.map((name) => [
						`ai:${name}`,
						['elementsDetected', 'smartCrops', 'classification', 'safety', 'imageScene'].includes(
							name,
						)
							? []
							: '',
					]),
				),
			},
		};
	}
	it('shows all ten attached AI fields in Picture edit while retaining the native form and file controls', async () => {
		const fixture = TestBed.createComponent(BinaryEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'Picture');
		fixture.componentRef.setInput('documents', [picture()]);
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		const component = fixture.componentInstance;
		const supplemental = fixture.debugElement.query(
			By.directive(SupplementalDocumentFieldsComponent),
		).componentInstance as SupplementalDocumentFieldsComponent;
		expect(supplemental.editorForm).toBe(component.editorForm!);
		expect(supplemental.fields().length).toBe(10);
		for (const label of labels) expect(fixture.nativeElement.textContent).toContain(label);
		for (const name of names) expect(component.editorForm!.get(`ai:${name}`)).not.toBeNull();
		expect(component.editorForm!.get('file:content')).not.toBeNull();
		expect(component.editorForm!.get('files:files')).not.toBeNull();
		expect(component.editorForm!.get('dc:title')).not.toBeNull();
		expect(component.editorForm!.pristine).toBeTrue();
		expect(gateway.readDocumentType.calls.mostRecent().args[0]).toBe('Picture');
		expect(gateway.readDocumentType.calls.mostRecent().args[1].schemas).toEqual([
			{ name: 'ai', prefix: 'ai' },
		]);
		supplemental.widgetProps(supplemental.fields()[0]).commit('A bird on a branch');
		expect(component.editorForm!.get('ai:altText')!.value).toBe('A bird on a branch');
		expect(component.editorForm!.dirty).toBeTrue();
	});
	it('does not request or add Picture-only fields to an unrelated binary document', async () => {
		const fixture = TestBed.createComponent(BinaryEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('documents', [fixtureDocument('File')]);
		fixture.detectChanges();
		await fixture.whenStable();
		expect(gateway.readDocumentType).not.toHaveBeenCalled();
		expect(fixture.nativeElement.querySelector('nx-supplemental-document-fields')).toBeNull();
	});
});
