import { DocumentCreationError } from '../../../helpers/document-creation-error';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { Subject, of, throwError } from 'rxjs';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { ToastService } from 'app/helpers/toast.service';
import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { fakeAsync, tick } from '@angular/core/testing';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { WebUiMessages } from '@maretha/webui-sdk';

import { BaseEditorComponent } from './base-editor.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

describe('DocumentEditorComponent', () => {
	let component: BaseEditorComponent;
	let fixture: ComponentFixture<BaseEditorComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [BaseEditorComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(BaseEditorComponent);
		component = fixture.componentInstance;
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('editorForm', new FormGroup({}));
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
	it('rejects incomplete creation inputs before any save can run', () => {
		component.editorForm = undefined;
		expect(() => component.ngOnInit()).toThrow(
			'nx-document-editor: you must specify the main form group (editorForm)',
		);
		component.editorForm = new FormGroup({});
		component.add = true;
		component.parentDocument = undefined;
		expect(() => component.ngOnInit()).toThrow(
			'nx-document-editor: you must specify the parent document',
		);
		component.parentDocument = fixtureDocument();
		component.documentType = '';
		expect(() => component.ngOnInit()).toThrow(
			'nx-document-editor: you must specify the document type',
		);
	});
	it('refreshes save availability when a projected form changes', async () => {
		const form = new FormGroup({ title: new FormControl('', Validators.required) });
		fixture.componentRef.setInput('editorForm', form);
		fixture.detectChanges();
		const save = fixture.nativeElement.querySelector(
			'.modal-footer button:last-child',
		) as HTMLButtonElement;
		expect(save.getAttribute('aria-disabled')).toBe('true');
		form.controls.title.setValue('New folder');
		form.markAsDirty();
		await fixture.whenStable();
		expect(save.getAttribute('aria-disabled')).toBe('false');
		form.controls.title.setValue('');
		await fixture.whenStable();
		expect(save.getAttribute('aria-disabled')).toBe('true');
	});
});

describe('Legacy editor departure and save recovery', () => {
	it('retains the draft and permits retry after a failed save, clearing dirty state only on success', () => {
		TestBed.configureTestingModule({
			imports: [BaseEditorComponent],
			providers: legacyTestProviders(),
		});
		const fixture = TestBed.createComponent(BaseEditorComponent);
		const editor = fixture.componentInstance;
		editor.parentDocument = { uid: 'parent', path: '/parent' };
		editor.documentType = 'Folder';
		editor.documents = [{ properties: {} }];
		editor.editorForm = new FormGroup({ 'dc:title': new FormControl('Retained draft') });
		editor.editorForm.controls['dc:title'].markAsDirty();
		const request = new Subject<any>();
		const create = spyOn(TestBed.inject(DocumentsManagerService), 'createDocument').and.returnValue(
			request,
		);
		const toast = spyOn(TestBed.inject(ToastService), 'error');
		const saved = spyOn(editor.save, 'emit');
		editor.saveChanges();
		expect(editor.working).toBeTrue();
		expect(create.calls.mostRecent().args[3]).toBe('parent');
		request.error(new Error('permission changed'));
		expect(editor.working).toBeFalse();
		expect(editor.editorForm.dirty).toBeTrue();
		expect(editor.editorForm.value['dc:title']).toBe('Retained draft');
		expect(saved).not.toHaveBeenCalled();
		expect(toast).not.toHaveBeenCalled();
		expect(editor.saveError).toContain('Your changes are still available');
		const retry = new Subject<any>();
		create.and.returnValue(retry);
		editor.saveChanges();
		const doc = { uid: 'created', properties: { 'dc:title': 'Retained draft' } };
		retry.next(doc);
		retry.complete();
		expect(saved).toHaveBeenCalledWith([doc]);
		expect(editor.working).toBeFalse();
		expect(editor.editorForm.pristine).toBeTrue();
	});
	function creationEditor() {
		TestBed.configureTestingModule({
			imports: [BaseEditorComponent],
			providers: legacyTestProviders(),
		});
		const fixture = TestBed.createComponent(BaseEditorComponent);
		const editor = fixture.componentInstance;
		editor.parentDocument = { uid: 'parent', path: '/parent' };
		editor.documentType = 'File';
		editor.documents = [{ properties: {}, ng: {} }];
		editor.editorForm = new FormGroup({ 'dc:title': new FormControl('Created once') });
		editor.editorForm.controls['dc:title'].markAsDirty();
		return { fixture, editor, manager: TestBed.inject(DocumentsManagerService) };
	}
	it('keeps main and additional upload references distinct when every filename matches', () => {
		const { editor, manager } = creationEditor();
		editor.documents[0].ng.attachments = [];
		const files = [
			new File(['main'], 'same.txt'),
			new File(['one'], 'same.txt'),
			new File(['two'], 'same.txt'),
		];
		editor.editorForm!.addControl('file:content', new FormControl(files[0]));
		editor.editorForm!.get('file:content')!.markAsDirty();
		editor.editorForm!.addControl(
			'files:files',
			new FormArray(files.slice(1).map((file) => new FormControl(file))),
		);
		editor.editorForm!.get('files:files')!.markAsDirty();
		const upload = spyOn(TestBed.inject(DocumentAttachmentsService), 'uploadFiles').and.returnValue(
			of({
				batchId: 'same-names',
				uploadedFiles: { 'same.txt': 2 },
				entries: files.map((file, fileIdx) => ({ file, fileIdx })),
			}),
		);
		const create = spyOn(manager, 'createDocument').and.returnValue(
			of({ uid: 'created', properties: {} }),
		);
		editor.saveChanges();
		expect(upload.calls.mostRecent().args[0]).toEqual(files);
		const properties = create.calls.mostRecent().args[2];
		expect(properties['file:content']).toEqual({
			'upload-batch': 'same-names',
			'upload-fileId': '0',
		});
		expect(properties['files:files']).toEqual([
			{ file: { 'upload-batch': 'same-names', 'upload-fileId': '1' } },
			{ file: { 'upload-batch': 'same-names', 'upload-fileId': '2' } },
		]);
	});
	it('resumes tag reconciliation after a partial failure without reuploading or creating another document', () => {
		const { fixture, editor, manager } = creationEditor();
		editor.editorForm!.addControl('tags', new FormControl({ 'nxtag:tags': ['one', 'two'] }));
		editor.editorForm!.get('tags')!.markAsDirty();
		editor.editorForm!.addControl(
			'file:content',
			new FormControl(new File(['draft'], 'draft.txt')),
		);
		editor.editorForm!.get('file:content')!.markAsDirty();
		const upload = spyOn(TestBed.inject(DocumentAttachmentsService), 'uploadFiles').and.returnValue(
			of({ batchId: 'batch', uploadedFiles: { 'draft.txt': 0 } }),
		);
		const document = { uid: 'created', properties: { 'nxtag:tags': [] } };
		const create = spyOn(manager, 'createDocument').and.returnValue(of(document));
		const addTags = spyOn(manager, 'addTag').and.returnValue(
			throwError(() => new Error('tag reply lost')),
		);
		const saved = spyOn(editor.save, 'emit');
		editor.saveChanges();
		fixture.detectChanges();
		expect(editor.creationDocumentId).toBe('created');
		expect(editor.working).toBeFalse();
		expect(editor.editorForm!.dirty).toBeTrue();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'Your document was created',
		);
		expect(fixture.nativeElement.querySelector('.modal-body').hasAttribute('inert')).toBeTrue();
		expect(saved).not.toHaveBeenCalled();
		const read = spyOn(manager, 'getDocumentInfo').and.returnValue(
			of({ ...document, properties: { 'nxtag:tags': [{ label: 'one' }] } }),
		);
		addTags.and.returnValue(of({}));
		editor.saveChanges();
		expect(read).toHaveBeenCalledWith('created');
		expect(create).toHaveBeenCalledTimes(1);
		expect(upload).toHaveBeenCalledTimes(1);
		expect(addTags.calls.mostRecent().args).toEqual(['created', ['two']]);
		expect(saved).toHaveBeenCalledTimes(1);
		expect(editor.editorForm!.pristine).toBeTrue();
	});
	it('resumes only the read after an acknowledged create whose metadata fetch failed', () => {
		const { editor, manager } = creationEditor();
		const create = spyOn(manager, 'createDocument').and.returnValue(
			throwError(() => new DocumentCreationError('created')),
		);
		editor.saveChanges();
		expect(editor.creationDocumentId).toBe('created');
		const document = { uid: 'created', properties: {} };
		spyOn(manager, 'getDocumentInfo').and.returnValue(of(document));
		const saved = spyOn(editor.save, 'emit');
		editor.saveChanges();
		expect(create).toHaveBeenCalledTimes(1);
		expect(saved).toHaveBeenCalledWith([document]);
	});
	it('blocks another create after an ambiguous write and provides a destination inspection link', () => {
		const { fixture, editor, manager } = creationEditor();
		const create = spyOn(manager, 'createDocument').and.returnValue(
			throwError(() => new DocumentCreationError()),
		);
		editor.saveChanges();
		fixture.detectChanges();
		editor.saveChanges();
		expect(create).toHaveBeenCalledTimes(1);
		expect(editor.creationUncertain).toBeTrue();
		expect(fixture.nativeElement.querySelector('.save-error a').getAttribute('href')).toContain(
			'/browse/parent',
		);
		expect(
			fixture.nativeElement
				.querySelector('.modal-footer button:last-child')
				.getAttribute('aria-disabled'),
		).toBe('true');
	});
	it('does not remove existing tags when the tags field was not edited or is absent', () => {
		const { editor, manager } = creationEditor();
		spyOn(manager, 'createDocument').and.returnValue(
			of({ uid: 'created', properties: { 'nxtag:tags': [{ label: 'keep' }] } }),
		);
		const remove = spyOn(manager, 'removeTag');
		editor.saveChanges();
		expect(remove).not.toHaveBeenCalled();
	});
	it('treats an explicit tag clear as empty while ignoring an absent nested tag value', () => {
		const { editor, manager } = creationEditor();
		editor.add = false;
		editor.documents = [{ uid: 'existing', properties: { 'nxtag:tags': [{ label: 'remove' }] } }];
		editor.editorForm!.addControl('tags', new FormControl({}));
		editor.editorForm!.get('tags')!.markAsDirty();
		spyOn(manager, 'updateDocument').and.returnValue(of(editor.documents[0]));
		const remove = spyOn(manager, 'removeTag').and.returnValue(of({}));
		editor.saveChanges();
		expect(remove).not.toHaveBeenCalled();
		editor.editorForm!.get('tags')!.setValue({ 'nxtag:tags': null });
		editor.editorForm!.get('tags')!.markAsDirty();
		editor.saveChanges();
		expect(remove).toHaveBeenCalledWith('existing', 'remove');
	});
	it('asks the browser to confirm unloading only a dirty form or a running save', () => {
		const listen = spyOn(window, 'addEventListener').and.callThrough();
		const { editor } = creationEditor();
		const unload = listen.calls.allArgs().find(([type]) => type === 'beforeunload')![1] as (
			event: BeforeUnloadEvent,
		) => void;
		const event = { preventDefault: jasmine.createSpy('preventDefault') } as any;
		editor.editorForm!.markAsPristine();
		unload(event);
		expect(event.preventDefault).not.toHaveBeenCalled();
		editor.working = true;
		unload(event);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(event.returnValue).toBe('');
		editor.working = false;
		editor.editorForm!.markAsDirty();
		unload(event);
		expect(event.preventDefault).toHaveBeenCalledTimes(2);
	});
	it('keeps dirty forms on canceled departure and prevents leaving during a save', async () => {
		TestBed.configureTestingModule({
			imports: [BaseEditorComponent],
			providers: legacyTestProviders(),
		});
		const fixture = TestBed.createComponent(BaseEditorComponent);
		const editor = fixture.componentInstance;
		editor.editorForm = new FormGroup({ 'dc:title': new FormControl('Changed') });
		editor.editorForm.markAsDirty();
		const confirm = spyOn(TestBed.inject(ConfirmDialogService), 'confirm').and.resolveTo(false);
		const closed = spyOn(editor.close, 'emit');
		await editor.closeWithoutSaving();
		expect(closed).not.toHaveBeenCalled();
		expect(await editor.canLeave()).toBeFalse();
		confirm.and.resolveTo(true);
		expect(await editor.canLeave()).toBeTrue();
		editor.working = true;
		expect(editor.canLeave()).toBeFalse();
	});
});

describe('BaseEditor persistent announcements', () => {
	function setup(withFile = false) {
		TestBed.configureTestingModule({
			imports: [BaseEditorComponent],
			providers: legacyTestProviders(),
		});
		const fixture = TestBed.createComponent(BaseEditorComponent);
		const editor = fixture.componentInstance;
		const file = new File(['customer bytes'], 'Customer {file} <literal>.txt');
		const form = new FormGroup({
			'dc:title': new FormControl('Customer {title}'),
			'file:content': new FormControl(withFile ? file : null),
		});
		form.controls['dc:title'].markAsDirty();
		if (withFile) form.controls['file:content'].markAsDirty();
		fixture.componentRef.setInput('add', false);
		fixture.componentRef.setInput('editorForm', form);
		fixture.componentRef.setInput('documents', [
			{ uid: 'target', properties: {}, ng: { attachments: [] } },
		]);
		const update = new Subject<any>();
		const upload = new Subject<any>();
		const manager = TestBed.inject(DocumentsManagerService);
		const updateSpy = spyOn(manager, 'updateDocument').and.returnValue(update);
		let progress: NonNullable<Parameters<DocumentAttachmentsService['uploadFiles']>[1]>;
		const uploadSpy = spyOn(TestBed.inject(DocumentAttachmentsService), 'uploadFiles').and.callFake(
			(_files, callback) => {
				progress = callback!;
				return upload;
			},
		);
		fixture.detectChanges();
		return {
			fixture,
			editor,
			form,
			file,
			update,
			upload,
			updateSpy,
			uploadSpy,
			progress: () => progress({ file, fileIdx: 0 }),
			status: fixture.nativeElement.querySelector('[role=status]') as HTMLElement,
			alert: fixture.nativeElement.querySelector('[role=alert]') as HTMLElement,
			button: fixture.nativeElement.querySelector(
				'.modal-footer button:last-child',
			) as HTMLButtonElement,
		};
	}
	it('keeps live nodes mounted and retains Save focus through failure, retry and success', () => {
		const h = setup();
		expect(h.status.textContent!.trim()).toBe('');
		expect(h.alert.textContent!.trim()).toBe('');
		expect(h.status.getAttribute('aria-live')).toBe('polite');
		expect(h.status.getAttribute('aria-atomic')).toBe('true');
		expect(h.alert.getAttribute('aria-live')).toBe('assertive');
		h.button.focus();
		h.button.click();
		h.fixture.detectChanges();
		expect(document.activeElement).toBe(h.button);
		expect(h.button.disabled).toBeFalse();
		expect(h.button.getAttribute('aria-disabled')).toBe('true');
		expect(h.status.textContent).toContain('Saving document');
		expect(h.fixture.nativeElement.querySelector('.modal-body').getAttribute('aria-busy')).toBe(
			'true',
		);
		h.update.error(new Error('failed'));
		h.fixture.detectChanges();
		expect(h.fixture.nativeElement.querySelector('[role=status]')).toBe(h.status);
		expect(h.fixture.nativeElement.querySelector('[role=alert]')).toBe(h.alert);
		expect(h.status.textContent!.trim()).toBe('');
		expect(h.alert.textContent).toContain('Your changes are still available');
		expect(h.form.dirty).toBeTrue();
		expect(document.activeElement).toBe(h.button);
		const retry = new Subject<any>();
		h.updateSpy.and.returnValue(retry);
		h.button.click();
		h.fixture.detectChanges();
		expect(h.alert.textContent!.trim()).toBe('');
		retry.next({ uid: 'target', properties: {} });
		retry.complete();
		h.fixture.detectChanges();
		expect(h.status.textContent).toContain('Document saved');
		expect(h.form.pristine).toBeTrue();
		expect(h.button.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(h.button);
		expect(h.fixture.nativeElement.querySelector('.modal-body').getAttribute('aria-busy')).toBe(
			'false',
		);
	});
	it('announces upload and save stages with reactive translations and literal customer filenames', () => {
		const h = setup(true);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test-status', {
			fr: {
				'app.state.uploading-file-value-9d01a9': 'Téléversement de {value0}',
				'app.runtime.base-editor.saving-document-d06e6b': 'Enregistrement…',
				'app.notices.document-saved-e81dde': 'Document enregistré',
			},
		});
		h.editor.saveChanges();
		h.progress();
		h.fixture.detectChanges();
		expect(h.uploadSpy.calls.mostRecent().args[3]).toEqual({ notifications: false });
		expect(h.status.textContent).toContain(h.file.name);
		expect(h.status.querySelector('literal')).toBeNull();
		messages.locale.set('fr');
		h.fixture.detectChanges();
		expect(h.status.textContent).toContain(`Téléversement de ${h.file.name}`);
		h.upload.next({ batchId: 'batch', entries: [{ file: h.file, fileIdx: 0 }] });
		h.upload.complete();
		h.progress(); // stale upload callback must not replace the persistence phase
		h.fixture.detectChanges();
		expect(h.status.textContent!.trim()).toBe('Enregistrement…');
		h.update.next({ uid: 'target', properties: {} });
		h.update.complete();
		h.fixture.detectChanges();
		expect(h.status.textContent!.trim()).toBe('Document enregistré');
		expect(h.form.value['dc:title']).toBe('Customer {title}');
	});
	it('retains server validation detail as text in the single inline alert', () => {
		const h = setup();
		const toast = spyOn(TestBed.inject(ToastService), 'error');
		h.editor.saveChanges();
		h.update.error({
			error: {
				'entity-type': 'validation_report',
				violations: [
					{ path: [{ field_name: 'customer:field' }], message: 'Customer <literal> {message}' },
				],
			},
		});
		h.fixture.detectChanges();
		expect(h.alert.textContent).toContain('customer:field: Customer <literal> {message}');
		expect(h.alert.querySelector('literal')).toBeNull();
		expect(toast).not.toHaveBeenCalled();
		TestBed.inject(WebUiMessages).locale.set('ar');
		h.fixture.detectChanges();
		expect(h.alert.textContent).toContain('Customer <literal> {message}');
	});
	it('cancels an old context without marking a replacement draft saved or announcing late progress', () => {
		const h = setup(true);
		const saved = spyOn(h.editor.save, 'emit');
		h.editor.saveChanges();
		const replacement = new FormGroup({ 'dc:title': new FormControl('Next customer draft') });
		replacement.markAsDirty();
		h.fixture.componentRef.setInput('editorForm', replacement);
		h.fixture.detectChanges();
		h.progress();
		h.upload.next({ batchId: 'old', entries: [{ file: h.file, fileIdx: 0 }] });
		h.upload.complete();
		h.fixture.detectChanges();
		expect(h.editor.working).toBeFalse();
		expect(h.status.textContent!.trim()).toBe('');
		expect(h.updateSpy).not.toHaveBeenCalled();
		expect(saved).not.toHaveBeenCalled();
		expect(replacement.dirty).toBeTrue();
	});
	it('ignores old callbacks after retry and cancels pending work on destruction', () => {
		const h = setup(true);
		h.editor.saveChanges();
		const oldCallback = h.uploadSpy.calls.mostRecent().args[1]!;
		h.upload.error(new Error('old failed'));
		const retry = new Subject<any>();
		h.uploadSpy.and.returnValue(retry);
		h.editor.saveChanges();
		oldCallback({ file: new File(['old'], 'old-file.txt'), fileIdx: 0 });
		h.fixture.detectChanges();
		expect(h.status.textContent).not.toContain('old-file');
		h.fixture.destroy();
		oldCallback({ file: h.file, fileIdx: 0 });
		retry.next({ batchId: 'late', entries: [{ file: h.file, fileIdx: 0 }] });
		retry.complete();
		expect(h.editor.working).toBeFalse();
		expect(h.updateSpy).not.toHaveBeenCalled();
		h.editor.saveChanges();
		expect(h.uploadSpy).toHaveBeenCalledTimes(2);
	});
	it('does not claim success when a source completes without a saved document', () => {
		const h = setup();
		const saved = spyOn(h.editor.save, 'emit');
		h.editor.saveChanges();
		h.update.complete();
		// updateDocument's toArray produces an empty result; do not report it as a successful save.
		expect(saved).not.toHaveBeenCalled();
		expect(h.form.dirty).toBeTrue();
		expect(h.editor.working).toBeFalse();
	});
	it('keeps opted-in success in a pre-existing root announcer when the editor closes immediately', fakeAsync(() => {
		const h = setup();
		h.fixture.componentRef.setInput('announceSuccess', true);
		h.fixture.detectChanges();
		const announcer = TestBed.inject(LiveAnnouncer);
		const node = document.querySelector('.cdk-live-announcer-element');
		expect(node).not.toBeNull();
		h.editor.save.subscribe(() => h.fixture.destroy());
		h.editor.saveChanges();
		h.update.next({ uid: 'target', properties: {} });
		h.update.complete();
		tick(100);
		expect(document.querySelector('.cdk-live-announcer-element')).toBe(node);
		expect(node!.textContent).toBe('Document saved');
		expect(node!.getAttribute('aria-live')).toBe('polite');
		announcer.clear();
	}));
	it('leaves global success to existing toast-owning parents unless explicitly enabled', () => {
		const h = setup();
		const announce = spyOn(TestBed.inject(LiveAnnouncer), 'announce');
		h.editor.saveChanges();
		h.update.next({ uid: 'target', properties: {} });
		h.update.complete();
		h.fixture.detectChanges();
		expect(announce).not.toHaveBeenCalled();
		expect(h.status.getAttribute('aria-live')).toBe('polite');
	});
	it('serializes cleared mainFile and additionalFiles attachments in getChanges', () => {
		const h = setup(true);
		h.form.controls['file:content'].setValue(null);
		h.form.controls['file:content'].markAsDirty();
		const changes = (h.editor as any).getChanges();
		expect(changes[0].properties['file:content']).toBeNull();
		h.form.markAsPristine();
		h.editor.back();
		expect(() => {
			const empty = TestBed.createComponent(BaseEditorComponent).componentInstance;
			empty.ngOnInit();
		}).toThrow();
	});
});
