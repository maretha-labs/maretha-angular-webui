import { GenericEditorComponent } from './generic-editor/generic-editor.component';
import { BinaryEditorComponent } from './binary-editor/binary-editor.component';
import { NoteEditorComponent } from './note-editor/note-editor.component';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';

for (const component of [GenericEditorComponent, BinaryEditorComponent, NoteEditorComponent])
	describe(component.name + ' metadata lifecycle', () => {
		function render(metadata: Subject<any>) {
			TestBed.configureTestingModule({ imports: [component], providers: legacyTestProviders() });
			spyOn(TestBed.inject(DocumentsManagerService), 'getDocumentType').and.returnValue(metadata);
			const fixture = TestBed.createComponent<any>(component);
			fixture.componentRef.setInput('documentType', 'File');
			fixture.componentRef.setInput('parentDocument', fixtureDocument('Folder'));
			fixture.detectChanges();
			return fixture;
		}
		it('recognizes a file schema at index zero as a boolean capability', () => {
			const metadata = new Subject<any>();
			const fixture = render(metadata);
			metadata.next({ schemas: [{ name: 'file' }] });
			metadata.complete();
			fixture.detectChanges();
			expect(fixture.componentInstance.documents[0].ng.canUpload).toBeTrue();
			expect(fixture.componentInstance.editorForm).toBeDefined();
		});
		it('cancels its metadata request and completes its save stream on destruction', () => {
			const metadata = new Subject<any>();
			const fixture = render(metadata);
			let completed = false;
			fixture.componentInstance.save$.subscribe({ complete: () => (completed = true) });
			expect(metadata.observed).toBeTrue();
			fixture.destroy();
			expect(metadata.observed).toBeFalse();
			expect(completed).toBeTrue();
		});
	});
