import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { of } from 'rxjs';

import { GenericEditorComponent } from './generic-editor.component';

describe('GenericTypeEditorComponent', () => {
	let component: GenericEditorComponent;
	let fixture: ComponentFixture<GenericEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(GenericEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'Note');
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

describe('GenericEditorComponent source defaults', () => {
	it('renders the PictureBook source edit fields directly: title and description only', async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericEditorComponent],
		}).compileComponents();
		const fixture = TestBed.createComponent(GenericEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'PictureBook');
		fixture.componentRef.setInput('documents', [fixtureDocument()]);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('#title')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('#description')).not.toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('Show additional fields');
		expect(
			fixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
		).toBeNull();
		expect(fixture.componentInstance.editorForm?.contains('tags')).toBeFalse();
		expect(
			fixture.componentInstance.editorForm?.contains('natureSubjectsCoverageExpiration'),
		).toBeFalse();
	});

	it('saves only a changed PictureBook source field without clobbering hidden metadata', async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericEditorComponent],
		}).compileComponents();
		const document = fixtureDocument('PictureBook');
		(document.properties as any)['nxtag:tags'] = [{ label: 'keep' }];
		(document.properties as any)['dc:nature'] = 'unchanged';
		const update = spyOn(TestBed.inject(DocumentsManagerService), 'updateDocument').and.returnValue(
			of(document),
		);
		const fixture = TestBed.createComponent(GenericEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'PictureBook');
		fixture.componentRef.setInput('documents', [document]);
		fixture.detectChanges();
		fixture.componentInstance.editorForm!.get('dc:title')!.setValue('Renamed picture book');
		fixture.componentInstance.editorForm!.get('dc:title')!.markAsDirty();
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.modal-footer button:last-child').click();
		expect(update).toHaveBeenCalledWith(document.uid, { 'dc:title': 'Renamed picture book' });
	});

	it('opens the source metadata controls for folderish edit layouts', async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericEditorComponent],
		}).compileComponents();
		const fixture = TestBed.createComponent(GenericEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'OrderedFolder');
		fixture.componentRef.setInput('documents', [fixtureDocument()]);
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
		).not.toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('Show additional fields');
		expect(fixture.componentInstance.editorForm?.contains('tags')).toBeFalse();
	});

	for (const documentType of [
		'Root',
		'SectionRoot',
		'Template',
		'TemplateRoot',
		'UserWorkspacesRoot',
		'Collections',
	]) {
		it(`renders ${documentType}'s pinned common edit fields without unrelated tags`, async () => {
			await TestBed.configureTestingModule({
				providers: [...legacyTestProviders()],
				imports: [GenericEditorComponent],
			}).compileComponents();
			const fixture = TestBed.createComponent(GenericEditorComponent);
			fixture.componentRef.setInput('add', false);
			fixture.componentRef.setInput('documentType', documentType);
			fixture.componentRef.setInput('documents', [fixtureDocument(documentType)]);
			fixture.detectChanges();
			expect(
				fixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
			).not.toBeNull();
			expect(fixture.componentInstance.editorForm?.contains('tags')).toBeFalse();
		});
	}

	it('keeps source-common hidden fields out of an OrderedFolder update payload', async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [GenericEditorComponent],
		}).compileComponents();
		const document = fixtureDocument('OrderedFolder');
		(document.properties as any)['nxtag:tags'] = [{ label: 'keep' }];
		(document.properties as any)['dc:nature'] = 'unchanged';
		const update = spyOn(TestBed.inject(DocumentsManagerService), 'updateDocument').and.returnValue(
			of(document),
		);
		const fixture = TestBed.createComponent(GenericEditorComponent);
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('documentType', 'OrderedFolder');
		fixture.componentRef.setInput('documents', [document]);
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('nx-nature-subjects-coverage-expiration'),
		).not.toBeNull();
		fixture.componentInstance.editorForm!.get('dc:description')!.setValue('Changed description');
		fixture.componentInstance.editorForm!.get('dc:description')!.markAsDirty();
		fixture.detectChanges();
		fixture.nativeElement.querySelector('.modal-footer button:last-child').click();
		expect(update).toHaveBeenCalledWith(document.uid, { 'dc:description': 'Changed description' });
	});
});
