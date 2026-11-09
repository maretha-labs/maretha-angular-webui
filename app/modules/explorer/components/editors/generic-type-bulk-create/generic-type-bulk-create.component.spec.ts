import { By } from '@angular/platform-browser';
import { DocumentAttachmentsComponent } from '../../document-attachments/document-attachments.component';
import { of } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { CreationParentService } from '../../../helpers/creation-parent.service';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenericTypeBulkCreateComponent } from './generic-type-bulk-create.component';

describe('GenericTypeBulkCreateComponent', () => {
	let component: GenericTypeBulkCreateComponent;
	let fixture: ComponentFixture<GenericTypeBulkCreateComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericTypeBulkCreateComponent],
		}).compileComponents();

		spyOn(TestBed.inject(DocumentsManagerService), 'getDocumentType').and.returnValue(
			of({ schemas: [{ name: 'file' }] }),
		);
		fixture = TestBed.createComponent(GenericTypeBulkCreateComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('parentDocument', fixtureDocument());
		fixture.detectChanges();
	});

	it('renders successful per-file results and forwards them only when Done is chosen', async () => {
		const parent = {
			uid: 'destination',
			path: '/destination',
			facets: ['Folderish'],
			contextParameters: { permissions: ['AddChildren'], subtypes: [{ type: 'File' }] },
		};
		component.parentDocument = parent;
		const selected = new File(['contents'], 'one.txt');
		component.attachmentsUpdated([selected]);
		component.editorForm!.get('dc:description')!.setValue('Shared description');
		spyOn(TestBed.inject(CreationParentService), 'readId').and.returnValue(of(parent));
		spyOn(TestBed.inject(DocumentAttachmentsService), 'uploadFiles').and.returnValue(
			of({ batchId: 'batch', uploadedFiles: { 'one.txt': 0 } }),
		);
		const created = { uid: 'created', properties: {} };
		const create = spyOn(TestBed.inject(DocumentsManagerService), 'createDocument').and.returnValue(
			of(created),
		);
		const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
		let saved: any;
		component.save$.subscribe((value) => (saved = value));
		await component.saveChanges();
		fixture.detectChanges();
		expect(component.canUpload).toBeTrue();
		expect(create.calls.mostRecent().args[2]['dc:description']).toBe('Shared description');
		expect(fixture.nativeElement.querySelector('form').hasAttribute('inert')).toBeTrue();
		expect(
			fixture.nativeElement.querySelector('[aria-label="Import results"]').textContent,
		).toContain('one.txt');
		expect(hide).not.toHaveBeenCalled();
		expect(saved).toBeUndefined();
		fixture.nativeElement.querySelector('.modal-footer button').click();
		expect(saved).toEqual([created]);
		expect(hide).toHaveBeenCalledTimes(1);
	});
	it('preserves both same-name files selected through the native picker', () => {
		const selected = new DataTransfer();
		const first = new File(['one'], 'same.txt');
		const second = new File(['two'], 'same.txt');
		selected.items.add(first);
		selected.items.add(second);
		const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
		input.files = selected.files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
		fixture.detectChanges();
		expect(component.additionalFiles.value).toEqual([first, second]);
		const attachments = fixture.debugElement.query(By.directive(DocumentAttachmentsComponent))
			.componentInstance as DocumentAttachmentsComponent;
		attachments.blobContext(second).remove?.();
		expect(component.additionalFiles.value).toEqual([first]);
	});
	it('renders the Note import profile and creates note content with the selected source format', async () => {
		const parent = {
			uid: 'destination',
			path: '/destination',
			facets: ['Folderish'],
			contextParameters: { permissions: ['AddChildren'], subtypes: [{ type: 'Note' }] },
		};
		const noteFixture = TestBed.createComponent(GenericTypeBulkCreateComponent);
		const noteComponent = noteFixture.componentInstance;
		noteFixture.componentRef.setInput('documentType', 'Note');
		noteFixture.componentRef.setInput('parentDocument', parent);
		noteFixture.detectChanges();
		noteComponent.attachmentsUpdated([
			new File(['# meeting'], 'meeting.md', { type: 'text/markdown' }),
		]);
		const mime = noteComponent.editorForm!.get('note:mime_type')!;
		mime.setValue('text/x-web-markdown');
		mime.markAsDirty();
		spyOn(TestBed.inject(CreationParentService), 'readId').and.returnValue(of(parent));
		spyOn(TestBed.inject(DocumentAttachmentsService), 'uploadFiles').and.returnValue(
			of({ batchId: 'notes', uploadedFiles: { 'meeting.md': 0 } }),
		);
		const create = spyOn(TestBed.inject(DocumentsManagerService), 'createDocument').and.returnValue(
			of({ uid: 'note', properties: {} }),
		);
		await noteComponent.saveChanges();
		expect(noteFixture.nativeElement.querySelector('#noteMimeType')).not.toBeNull();
		expect(
			noteFixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
		).not.toBeNull();
		expect(create.calls.mostRecent().args[2]).toEqual(
			jasmine.objectContaining({
				'note:mime_type': 'text/x-web-markdown',
				'note:note': '# meeting',
			}),
		);
		expect(create.calls.mostRecent().args[2]['file:content']).toBeUndefined();
		expect(TestBed.inject(DocumentAttachmentsService).uploadFiles).not.toHaveBeenCalled();
	});
	it('should create', () => {
		expect(component).toBeTruthy();
	});
});
