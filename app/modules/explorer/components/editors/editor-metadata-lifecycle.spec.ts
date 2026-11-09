import { Type } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { EMPTY, Subject } from 'rxjs';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { GenericEditorComponent } from './generic-editor/generic-editor.component';
import { BinaryEditorComponent } from './binary-editor/binary-editor.component';
import { NoteEditorComponent } from './note-editor/note-editor.component';
import { DocumentTypeEditorComponent } from './document-type-editor/document-type-editor.component';

const editors: Type<any>[] = [
	DocumentTypeEditorComponent,
	GenericEditorComponent,
	BinaryEditorComponent,
	NoteEditorComponent,
];
function render(component: Type<any>, supplied?: any[]) {
	TestBed.configureTestingModule({ imports: [component], providers: legacyTestProviders() });
	const response = new Subject<any>();
	const fetch = spyOn(TestBed.inject(DocumentsManagerService), 'getDocumentType').and.returnValue(
		response,
	);
	const hide = spyOn(TestBed.inject(BsModalRef), 'hide');
	const fixture = TestBed.createComponent(component);
	fixture.componentRef.setInput('documentType', 'Note');
	if (supplied !== undefined) fixture.componentRef.setInput('documentSchemas', supplied);
	const data = { add: true, parentDocument: fixtureDocument('Folder'), documents: [] };
	if (component === DocumentTypeEditorComponent) fixture.componentRef.setInput('data', data);
	else fixture.componentRef.setInput('parentDocument', data.parentDocument);
	fixture.detectChanges();
	return { fixture, fetch, response, hide };
}

for (const component of editors)
	describe(component.name + ' metadata recovery', () => {
		it('shows loading and a failed request, then retries into one usable form without a duplicate read', () => {
			const { fixture, fetch, response } = render(component);
			expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain(
				'Loading',
			);
			fixture.componentInstance.loadMetadata();
			expect(fetch).toHaveBeenCalledTimes(1);
			response.error({ status: 503 });
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
				'could not be loaded',
			);
			const retry = new Subject<any>();
			fetch.and.returnValue(retry);
			fixture.nativeElement.querySelector('.modal-footer .btn-primary').click();
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
			retry.next({ schemas: [{ name: 'files' }] });
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('[formcontrolname="dc:title"]')).not.toBeNull();
			expect(fetch).toHaveBeenCalledTimes(2);
			expect(retry.observed).toBeFalse();
			fixture.componentInstance.loadMetadata();
			expect(fetch).toHaveBeenCalledTimes(2);
		});
		it('closes during loading and cancels the pending request before the modal is destroyed', () => {
			const { fixture, response, hide } = render(component);
			fixture.nativeElement.querySelector('.modal-header button').click();
			expect(hide).toHaveBeenCalledTimes(1);
			expect(response.observed).toBeFalse();
			response.next({ schemas: [{ name: 'file' }] });
			fixture.detectChanges();
			expect(fixture.nativeElement.querySelector('nx-base-editor')).toBeNull();
		});
		it('uses supplied schemas without any request', () => {
			const { fixture, fetch } = render(component, []);
			expect(fetch).not.toHaveBeenCalled();
			expect(fixture.nativeElement.querySelector('[formcontrolname="dc:title"]')).not.toBeNull();
		});
	});

describe('Document type metadata boundary', () => {
	it('hands file metadata to the binary editor and forwards successful saves', () => {
		const { fixture, response, fetch } = render(DocumentTypeEditorComponent);
		response.next({ schemas: [{ name: 'file' }] });
		fixture.detectChanges();
		const binary = fixture.debugElement.query(
			By.directive(BinaryEditorComponent),
		).componentInstance;
		expect(binary.documents[0].ng.canUpload).toBeTrue();
		expect(fetch).toHaveBeenCalledTimes(1);
		let result: any;
		fixture.componentInstance.save$.subscribe((value: any) => (result = value));
		binary.save$.next([{ uid: 'created' }]);
		expect(result).toEqual([{ uid: 'created' }]);
	});
	it('hands empty schema metadata and the authoritative type to a generic editor', () => {
		const { fixture, response, fetch } = render(DocumentTypeEditorComponent);
		fixture.componentInstance.documentType = 'Folder';
		response.next({ schemas: [] });
		fixture.detectChanges();
		const editor = fixture.debugElement.query(
			By.directive(GenericEditorComponent),
		).componentInstance;
		expect(editor.documentType).toBe('Folder');
		expect(editor.documents[0].ng.canUpload).toBeFalse();
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it('rejects malformed and empty responses with a retryable visible error', () => {
		const { fixture, response, fetch } = render(DocumentTypeEditorComponent);
		response.next({ schemas: [null] });
		fixture.detectChanges();
		expect(fixture.componentInstance.initialized).toBeFalse();
		expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
		fetch.and.returnValue(EMPTY);
		fixture.nativeElement.querySelector('.modal-footer .btn-primary').click();
		fixture.detectChanges();
		expect(fixture.componentInstance.metadata.loading()).toBeFalse();
		expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
	});
	it('times out a stalled read and permits retry', fakeAsync(() => {
		const { fixture, response } = render(DocumentTypeEditorComponent);
		tick(30_000);
		fixture.detectChanges();
		expect(response.observed).toBeFalse();
		expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.modal-footer .btn-primary').disabled).toBeFalse();
	}));
	it('cancels on destruction without constructing a late editor', () => {
		const { fixture, response } = render(DocumentTypeEditorComponent);
		fixture.destroy();
		expect(response.observed).toBeFalse();
		response.next({ schemas: [] });
		expect(fixture.componentInstance.initialized).toBeFalse();
	});
});
