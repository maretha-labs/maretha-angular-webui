import { Component, input, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import {
	DocumentFieldExtensionRegistry,
	DocumentTypeMetadata,
	WidgetProps,
	provideDocumentLayoutWidget,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { SupplementalDocumentFieldsComponent } from './supplemental-document-fields.component';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';

@Component({
	selector: 'nx-test-client-paragraph',
	standalone: true,
	template:
		'<label>Client summary<textarea [value]="props().value" [disabled]="props().disabled" (input)="props().commit($any($event.target).value)"></textarea></label>',
})
class TestParagraphWidget {
	readonly props = input.required<WidgetProps>();
}

const extension = {
	id: 'client-fields',
	schema: 'client',
	fields: [
		{ property: 'client:summary', label: 'Client summary', widget: 'client-paragraph' },
		{
			property: 'client:classification',
			label: 'Classification',
			widget: 'directory',
			directoryName: 'classifications',
		},
		{ property: 'client:locked', label: 'Locked', readOnly: false },
	],
};
const metadata: DocumentTypeMetadata = {
	name: 'File',
	schemas: [
		{
			name: 'client',
			prefix: 'client',
			fields: {
				summary: { type: 'string', required: true, maxLength: 8 },
				classification: 'string[]',
				locked: { type: 'string', readOnly: true },
			},
		},
	],
};
function document() {
	return {
		uid: 'file',
		type: 'File',
		properties: {
			'client:summary': 'Original',
			'client:classification': ['legal'],
			'client:locked': 'Server',
		},
		contextParameters: { permissions: ['WriteProperties'] },
		facets: [],
	};
}

describe('SupplementalDocumentFieldsComponent', () => {
	let resolve: (value: DocumentTypeMetadata) => void;
	let reject: (error: Error) => void;
	let candidates: readonly (typeof extension)[];
	let readable: boolean;
	let writable: boolean;
	let gateway: { readDocumentType: jasmine.Spy; searchReferences: jasmine.Spy };
	const revision = signal(0);
	beforeEach(() => {
		candidates = [extension];
		readable = writable = true;
		const response = new Promise<DocumentTypeMetadata>((accept, fail) => {
			resolve = accept;
			reject = fail;
		});
		gateway = {
			readDocumentType: jasmine.createSpy().and.returnValue(response),
			searchReferences: jasmine.createSpy().and.resolveTo([]),
		};
		TestBed.configureTestingModule({
			imports: [SupplementalDocumentFieldsComponent],
			providers: [
				provideDocumentLayoutWidget({ id: 'client-paragraph', component: TestParagraphWidget }),
				{ provide: DocumentFieldExtensionRegistry, useValue: { candidates: () => candidates } },
				{ provide: DocumentLayoutGatewayService, useValue: gateway },
				{
					provide: MetadataPolicyService,
					useValue: {
						load: () => Promise.resolve(),
						revision,
						canRead: () => readable,
						canWrite: (doc: any) =>
							writable && doc.contextParameters.permissions.includes('WriteProperties'),
					},
				},
			],
		});
	});
	function render(mode: 'edit' | 'create' = 'edit', parentPermissions: string[] = ['AddChildren']) {
		const fixture = TestBed.createComponent(SupplementalDocumentFieldsComponent);
		const form = new UntypedFormGroup({ 'dc:title': new UntypedFormControl('Native title') });
		fixture.componentRef.setInput('editorForm', form);
		fixture.componentRef.setInput(
			'context',
			documentLayoutContext({
				documentType: 'File',
				mode,
				document: document(),
				parentDocument: { contextParameters: { permissions: parentPermissions } },
			}),
		);
		fixture.detectChanges();
		return { fixture, form, component: fixture.componentInstance };
	}
	it('does no metadata or policy request when no extension applies', () => {
		candidates = [];
		const { form, component } = render();
		expect(gateway.readDocumentType).not.toHaveBeenCalled();
		expect(form.valid).toBeTrue();
		expect(component.fields()).toEqual([]);
	});
	it('guards native Save while loading, then edits flat properties in the same native form', async () => {
		const { fixture, form, component } = render();
		form.controls['dc:title'].markAsDirty();
		expect(form.invalid).toBeTrue();
		expect(Object.values(form.controls).filter((control) => control.dirty).length).toBe(1);
		expect(gateway.readDocumentType.calls.mostRecent().args[0]).toBe('File');
		resolve(metadata);
		await fixture.whenStable();
		fixture.detectChanges();
		expect(form.valid).toBeTrue();
		expect(Object.keys(form.controls).some((key) => key.includes('-loading'))).toBeFalse();
		const props = component.widgetProps(component.fields()[0]);
		props.commit('Edited');
		expect(form.controls['client:summary'].value).toBe('Edited');
		expect(form.controls['client:summary'].dirty).toBeTrue();
		expect(form.controls['dc:title'].value).toBe('Native title');
		props.commit('Too long for schema');
		expect(form.invalid).toBeTrue();
		expect(component.widgetProps(component.fields()[0]).error).toContain('8');
	});
	it('passes the same validated form control through the public custom widget port', async () => {
		const { fixture, form } = render();
		resolve(metadata);
		await fixture.whenStable();
		fixture.detectChanges();
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector(
			'nx-test-client-paragraph textarea',
		);
		expect(textarea).not.toBeNull();
		textarea.value = 'Custom';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(form.controls['client:summary'].value).toBe('Custom');
		expect(form.controls['client:summary'].dirty).toBeTrue();
	});
	it('honors server read-only constraints even when an extension tries to weaken them', async () => {
		const { fixture, form, component } = render();
		resolve(metadata);
		await fixture.whenStable();
		fixture.detectChanges();
		const locked = component.fields().find((field) => field.property === 'client:locked')!;
		expect(locked.readOnly).toBeTrue();
		expect(form.controls['client:locked'].disabled).toBeTrue();
		component.widgetProps(locked).commit('Forbidden');
		expect(form.controls['client:locked'].value).toBe('Server');
		expect(form.controls['client:locked'].dirty).toBeFalse();
	});
	it('does not render fields absent from verified type schemas', async () => {
		const { fixture, form, component } = render();
		resolve({ name: 'File', schemas: [] });
		await fixture.whenStable();
		fixture.detectChanges();
		expect(component.fields()).toEqual([]);
		expect(form.get('client:summary')).toBeNull();
		expect(form.valid).toBeTrue();
	});
	it('blocks save after metadata failure and ignores a late response for a destroyed editor', async () => {
		const { fixture, form, component } = render();
		reject(new Error('Unavailable'));
		await fixture.whenStable();
		fixture.detectChanges();
		expect(component.failed()).toBeTrue();
		expect(form.invalid).toBeTrue();
		fixture.destroy();
		expect(form.get('client:summary')).toBeNull();
		expect(form.valid).toBeTrue();
	});
	it('ignores pending schema responses after the editor is destroyed', async () => {
		const { fixture, form } = render();
		fixture.destroy();
		resolve(metadata);
		await Promise.resolve();
		await Promise.resolve();
		expect(form.get('client:summary')).toBeNull();
	});
	it('requires parent create authorization before exposing writable create fields', async () => {
		const { fixture, form, component } = render('create', ['Read']);
		resolve(metadata);
		await fixture.whenStable();
		fixture.detectChanges();
		expect(form.controls['client:summary'].disabled).toBeTrue();
		component.widgetProps(component.fields()[0]).commit('Denied');
		expect(form.controls['client:summary'].value).toBe('Original');
	});
	it('removes a staged supplemental value from the dirty payload after policy revocation', async () => {
		const { fixture, form, component } = render();
		resolve(metadata);
		await fixture.whenStable();
		fixture.detectChanges();
		component.widgetProps(component.fields()[0]).commit('Edited');
		writable = readable = false;
		revision.update((value) => value + 1);
		fixture.detectChanges();
		expect(form.controls['client:summary'].disabled).toBeTrue();
		expect(form.controls['client:summary'].dirty).toBeFalse();
		expect(fixture.nativeElement.textContent).not.toContain('Client summary');
	});
});
