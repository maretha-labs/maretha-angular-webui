import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { Component, Input, inject, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	DOCUMENT_LAYOUT_HOST,
	provideDocumentLayoutExtensions,
	type DocumentLayoutContext,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { provideDefaultDocumentLayouts } from '../../default-document-layouts';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { of, Subject, throwError } from 'rxjs';

import { DocumentTypeEditorComponent } from './document-type-editor.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('DocumentTypeEditorComponent', () => {
	let component: DocumentTypeEditorComponent;
	let fixture: ComponentFixture<DocumentTypeEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentTypeEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'Note');
		fixture.componentRef.setInput('documentSchemas', []);
		fixture.componentRef.setInput('data', {
			add: true,
			documentType: 'Note',
			parentDocument: fixtureDocument(),
			documents: [],
		});
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<output>custom-file-editor {{ layoutContext?.documentType }}</output>',
})
class CustomFileEditorComponent {
	@Input() layoutContext: DocumentLayoutContext | undefined;
	@Input() documentType: string | undefined;
}

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class HostedContractLayoutComponent {
	@Input() layoutContext: DocumentLayoutContext | undefined;
	readonly host = inject(DOCUMENT_LAYOUT_HOST);
}

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<output>invalid custom editor</output>',
})
class InvalidCustomFileEditorComponent {}

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<output>alias {{ scope?.documentType }}</output>',
})
class AliasedCustomFileEditorComponent {
	// eslint-disable-next-line @angular-eslint/no-input-rename -- verifies the documented legacy layoutContext alias.
	@Input('layoutContext') scope: DocumentLayoutContext | undefined;
}

describe('DocumentTypeEditorComponent document layouts', () => {
	it('mounts a custom File create layout before the legacy binary editor and supplies its frozen context', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'client.file-editor',
					layouts: [
						{
							id: 'client.file.create',
							documentType: 'File',
							mode: 'create',
							component: CustomFileEditorComponent,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('documentSchemas', [{ name: 'file' }]);
		fixture.componentRef.setInput('data', {
			add: true,
			parentDocument: { uid: 'parent' },
			documents: [],
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom-file-editor file');
		expect(fixture.nativeElement.querySelector('nx-binary-editor')).toBeNull();
		expect(
			Object.isFrozen(fixture.componentInstance.componentRef?.instance.layoutContext),
		).toBeTrue();
	});

	it('lets a custom layout finish the dialog through the SDK host contract', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'custom.layouts',
					layouts: (['create', 'edit'] as const).map((mode) => ({
						id: `custom.contract.${mode}`,
						documentType: 'Contract',
						mode,
						component: HostedContractLayoutComponent,
					})),
				}),
			],
		}).compileComponents();
		const sync = spyOn(
			TestBed.inject(DocumentsManagerService),
			'syncSavedDocument',
		).and.returnValue(of({}));
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		const created = { uid: 'contract-1', type: 'Contract', properties: {} };
		const mount = (data: Record<string, unknown>) => {
			const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
			fixture.componentRef.setInput('documentType', 'Contract');
			fixture.componentRef.setInput('documentSchemas', [{ name: 'dublincore' }]);
			fixture.componentRef.setInput('data', data);
			fixture.detectChanges();
			return fixture;
		};
		const creating = mount({ add: true, parentDocument: { uid: 'parent' }, documents: [] });
		const saved: unknown[] = [];
		creating.componentInstance.save$.subscribe((value) => saved.push(value));
		const createHost = creating.componentInstance.componentRef!.instance.host;
		createHost.complete([created]);
		expect(sync).toHaveBeenCalledOnceWith('contract-1', true);
		expect(saved).toEqual([[created]]);
		expect(hide).toHaveBeenCalledTimes(1);

		// A layout replaced by an input change keeps a stale host that no longer acts.
		creating.componentRef.setInput('data', { add: false, documents: [created] });
		creating.detectChanges();
		createHost.complete([created]);
		createHost.cancel();
		expect(hide).toHaveBeenCalledTimes(1);
		expect(saved.length).toBe(1);

		const editHost = mount({ add: false, documents: [created] }).componentInstance.componentRef!
			.instance.host;
		// A failed listing refresh still closes the dialog; the save itself succeeded.
		sync.and.returnValue(throwError(() => new Error('offline')));
		editHost.complete([created]);
		expect(sync).toHaveBeenCalledWith('contract-1', false);
		editHost.cancel();
		expect(hide).toHaveBeenCalledTimes(3);
	});

	it('does not fall back to the binary editor when a default File layout is disabled', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDefaultDocumentLayouts(),
				provideDocumentLayoutExtensions({
					id: 'client.disable-file',
					overrides: [{ id: 'default.document-layout.file.create', disabled: true }],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('documentSchemas', [{ name: 'file' }]);
		fixture.componentRef.setInput('data', { add: true, documents: [] });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('This document layout is disabled.');
		expect(fixture.nativeElement.querySelector('nx-binary-editor')).toBeNull();
	});

	it('rejects a custom layout that does not declare the documented layoutContext input', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'client.invalid',
					layouts: [
						{
							id: 'invalid.file.create',
							documentType: 'File',
							mode: 'create',
							component: InvalidCustomFileEditorComponent,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('documentSchemas', [{ name: 'file' }]);
		fixture.componentRef.setInput('data', { add: true, documents: [] });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('must declare a layoutContext input');
		expect(fixture.nativeElement.querySelector('nx-binary-editor')).toBeNull();
	});

	it('uses the public input name when the custom layout aliases its internal field', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'client.alias',
					layouts: [
						{
							id: 'alias.file.create',
							documentType: 'File',
							mode: 'create',
							component: AliasedCustomFileEditorComponent,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('documentSchemas', [{ name: 'file' }]);
		fixture.componentRef.setInput('data', { add: true, documents: [] });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('alias file');
	});

	it('cancels pending metadata for type A before mounting type B', async () => {
		const first = new Subject<any>();
		const second = new Subject<any>();
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [...legacyTestProviders()],
		}).compileComponents();
		const documents = TestBed.inject(DocumentsManagerService);
		spyOn(documents, 'getDocumentType').and.callFake((type: string) =>
			type === 'File' ? first : second,
		);
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('data', {
			add: true,
			parentDocument: fixtureDocument(),
			documents: [],
		});
		fixture.detectChanges();
		fixture.componentRef.setInput('documentType', 'Note');
		fixture.componentRef.setInput('data', {
			add: true,
			parentDocument: fixtureDocument(),
			documents: [],
		});
		fixture.detectChanges();
		first.next({ schemas: [{ name: 'file' }] });
		expect(fixture.componentInstance.componentRef).toBeUndefined();
		second.next({ schemas: [] });
		fixture.detectChanges();
		expect(fixture.componentInstance.componentRef?.instance.documentType).toBe('Note');
	});

	it('mounts the intentionally empty WorkspaceRoot create source layout without generic fields', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [...legacyTestProviders(), provideDefaultDocumentLayouts()],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		// ngx-bootstrap assigns initialState directly before ngOnInit, rather than
		// using Angular setInput. Keep this invocation path covered.
		fixture.componentInstance.documentType = 'WorkspaceRoot';
		fixture.componentInstance.documentSchemas = [];
		const parent = fixtureDocument();
		fixture.componentInstance.data = { add: true, parentDocument: parent, documents: [] };
		const create = spyOn(TestBed.inject(DocumentsManagerService), 'createDocument').and.returnValue(
			of({ uid: 'workspace-root', properties: {} }),
		);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('nx-empty-document-layout')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('#title')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('disabled');
		expect(fixture.nativeElement.textContent).toContain('Create a WorkspaceRoot document');
		expect(fixture.nativeElement.textContent).toContain('Cancel');
		const createButton: HTMLButtonElement = fixture.nativeElement.querySelector(
			'.modal-footer button:last-child',
		);
		expect(createButton.disabled).toBeFalse();
		createButton.click();
		expect(create).toHaveBeenCalledWith(
			parent.path,
			'WorkspaceRoot',
			{ 'dc:title': 'WorkspaceRoot', name: 'WorkspaceRoot' },
			parent.uid,
		);
	});

	it('delegates canDeactivate and hasPendingChanges to the mounted editor or form dirty state and mounts DomainEditor', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeEditorComponent],
			providers: [...legacyTestProviders()],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeEditorComponent);
		fixture.componentInstance.documentType = 'Domain';
		fixture.componentInstance.documentSchemas = [{ name: 'dublincore' }];
		fixture.componentInstance.data = {
			add: true,
			parentDocument: fixtureDocument(),
			documents: [],
		};
		fixture.detectChanges();
		expect(fixture.componentInstance.hasPendingChanges()).toBeFalse();
		expect(fixture.componentInstance.canDeactivate()).toBeTrue();
		const editor = fixture.componentInstance.componentRef!.instance;
		editor.editorForm.markAsDirty();
		expect(fixture.componentInstance.hasPendingChanges()).toBeTrue();
		spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		expect(await fixture.componentInstance.canDeactivate()).toBeFalse();
		editor.canDeactivate = () => true;
		expect(fixture.componentInstance.canDeactivate()).toBeTrue();
	});
});
