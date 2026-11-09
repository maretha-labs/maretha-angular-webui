import { TestBed } from '@angular/core/testing';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { of, Subject } from 'rxjs';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { CreationParentService } from 'app/modules/explorer/helpers/creation-parent.service';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { DestinationCreateDialogComponent } from './destination-create-dialog.component';

const destination = (uid: string) => ({
	document: {
		uid,
		path: '/' + uid,
		facets: ['Folderish'],
		contextParameters: { permissions: ['AddChildren'], subtypes: [{ type: 'Folder' }] },
	},
	types: [{ name: 'Folder', label: 'Folder', file: false, folder: true }],
	allowed: true,
});
describe('Global creation destination lifecycle', () => {
	let parents: jasmine.SpyObj<CreationParentService>;
	let uploads: jasmine.SpyObj<DocumentAttachmentsService>;
	let hide: jasmine.Spy;
	let show: jasmine.Spy;
	beforeEach(() => {
		parents = jasmine.createSpyObj('parents', ['load', 'readId']);
		parents.load.and.returnValue(of(destination('first')));
		uploads = jasmine.createSpyObj('uploads', [
			'createUploadBatch',
			'uploadToBatch',
			'removeBatchFile',
			'removeBatchJob',
		]);
		uploads.createUploadBatch.and.returnValue(of('batch-1'));
		uploads.uploadToBatch.and.returnValue(of(undefined));
		uploads.removeBatchFile.and.returnValue(of(null));
		uploads.removeBatchJob.and.returnValue(of(null));
		hide = jasmine.createSpy('hide');
		show = jasmine.createSpy('show');
		TestBed.configureTestingModule({
			imports: [DestinationCreateDialogComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: CreationParentService, useValue: parents },
				{ provide: DocumentAttachmentsService, useValue: uploads },
				{ provide: BsModalRef, useValue: { hide } },
				{ provide: BsModalService, useValue: { show } },
			],
		}).overrideComponent(DestinationCreateDialogComponent, { set: { template: '', imports: [] } });
	});
	const settle = () => new Promise((resolve) => setTimeout(resolve));
	function render() {
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		fixture.detectChanges();
		return fixture;
	}
	it('cancels old destination loads and only exposes the current types', async () => {
		const fixture = render(),
			component = fixture.componentInstance;
		const old = new Subject<any>();
		parents.load.and.returnValue(old);
		await component.choosePath('/old');
		parents.load.and.returnValue(of(destination('new')));
		await component.choosePath('/new');
		expect(old.observed).toBeFalse();
		old.next(destination('obsolete'));
		expect(component.context()?.document?.['uid']).toBe('new');
	});
	it('serializes asynchronous departure prompts and keeps a refused draft', async () => {
		const component = render().componentInstance;
		let resolve!: (result: boolean) => void;
		const canDeactivate = jasmine
			.createSpy('canDeactivate')
			.and.returnValue(new Promise<boolean>((r) => (resolve = r)));
		(component as any).views = () => ({ canDeactivate });
		const pending = component.choosePath('/second');
		component.path = '/second';
		await component.choosePath('/third');
		await component.close();
		expect(canDeactivate).toHaveBeenCalledTimes(1);
		expect(hide).not.toHaveBeenCalled();
		resolve(false);
		await pending;
		expect(component.context()?.document?.['uid']).toBe('first');
		expect(component.path).toBe('/first');
		expect(component.busy()).toBeFalse();
	});
	it('keeps a chosen stock type and Back in the original destination wizard', async () => {
		const component = render().componentInstance;
		parents.readId.and.returnValue(of(destination('first').document));
		await component.create('Folder');
		expect(component.selectedType()).toBe('Folder');
		expect(component.editorInputs['documentType']).toBe('Folder');
		expect(show).not.toHaveBeenCalled();
		expect(hide).not.toHaveBeenCalled();
		component.editorInjector
			.get(
				(await import('app/modules/explorer/helpers/document-creation-wizard'))
					.DOCUMENT_CREATION_WIZARD,
			)
			.back();
		expect(component.selectedType()).toBeNull();
		expect(component.context()?.document?.['uid']).toBe('first');
	});
	it('drops the previous embedded editor after an accepted destination change', async () => {
		const component = render().componentInstance;
		parents.readId.and.returnValue(of(destination('first').document));
		await component.create('Folder');
		expect(component.selectedType()).toBe('Folder');
		parents.load.and.returnValue(of(destination('second')));
		await component.choosePath('/second');
		expect(component.context()?.document?.['uid']).toBe('second');
		expect(component.selectedType()).toBeNull();
		expect(component.editorInputs).toEqual({});
	});
	it('uses the destination repository for parent loading and fresh creation preflight', async () => {
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		fixture.componentRef.setInput('repository', 'other');
		fixture.detectChanges();
		expect(parents.load).toHaveBeenCalledWith('/', 'other');
		parents.readId.and.returnValue(
			of({ ...destination('first').document, contextParameters: { permissions: [] } }),
		);
		await fixture.componentInstance.create('Folder');
		expect(parents.readId).toHaveBeenCalledWith('first', 'other');
	});
	it('routes Escape through the departure guard and does not open an importer without an import type', async () => {
		const component = render().componentInstance;
		const canDeactivate = jasmine.createSpy('canDeactivate').and.resolveTo(false);
		(component as any).views = () => ({ canDeactivate });
		const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
		component.escape(event);
		await Promise.resolve();
		expect(event.defaultPrevented).toBeTrue();
		expect(canDeactivate).toHaveBeenCalled();
		expect(hide).not.toHaveBeenCalled();
		const input = {
			files: [new File(['hello'], 'note.txt')],
			value: 'note.txt',
		} as unknown as HTMLInputElement;
		await component.importSelection(input);
		expect(input.value).toBe('');
		expect(show).not.toHaveBeenCalled();
		expect(parents.readId).not.toHaveBeenCalled();
	});
	it('retains root file selections across invalid destinations and hands them off only after fresh writable validation', async () => {
		const component = render().componentInstance;
		const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
		await component.importSelection({
			files: [file],
			value: 'note.txt',
		} as unknown as HTMLInputElement);
		await settle();
		// Stock uploads a chosen file at once, into the dialog's one batch.
		expect(uploads.createUploadBatch).toHaveBeenCalledTimes(1);
		expect(uploads.uploadToBatch).toHaveBeenCalledOnceWith('batch-1', file, 0);
		expect(component.selectedFiles()).toEqual([file]);
		expect(component.canContinueImport()).toBeFalse();
		parents.load.and.returnValue(of({ ...destination('denied'), allowed: false }));
		await component.choosePath('/denied');
		expect(component.selectedFiles()).toEqual([file]);
		const writable = {
			...destination('writable'),
			types: [{ name: 'Note', label: 'Note', file: true, folder: false }],
		};
		writable.document.contextParameters.subtypes = [{ type: 'Note' }];
		parents.load.and.returnValue(of(writable));
		await component.choosePath('/writable');
		expect(component.canContinueImport()).toBeTrue();
		parents.readId.and.returnValue(
			of({ ...writable.document, contextParameters: { permissions: [] } }),
		);
		await component.continueImport();
		expect(component.selectedFiles()).toEqual([file]);
		expect(show).not.toHaveBeenCalled();
		parents.readId.and.returnValue(of(writable.document));
		// Stock's default import: the server's importers choose the type (text becomes a Note).
		const configureImport = spyOn(component.batch, 'configureImport');
		const adoptUploads = spyOn(component.batch, 'adoptUploads');
		const configure = spyOn(component.batch, 'configure');
		const run = spyOn(component.batch, 'run').and.resolveTo();
		await component.continueImport();
		expect(configureImport.calls.mostRecent().args[0].uid).toBe('writable');
		expect(configureImport.calls.mostRecent().args[1]).toEqual([file]);
		// The creation takes the uploaded batch: nothing is uploaded again.
		const handed = adoptUploads.calls.mostRecent().args[0]!;
		expect(handed.batchId).toBe('batch-1');
		expect(handed.indexOf(file)).toBe(0);
		expect(uploads.uploadToBatch).toHaveBeenCalledTimes(1);
		expect(configure).not.toHaveBeenCalled();
		expect(run).toHaveBeenCalledTimes(1);
		expect(show).not.toHaveBeenCalled();
		expect(hide).not.toHaveBeenCalled();
		expect(component.selectedFiles()).toEqual([]);
		expect(uploads.removeBatchJob).not.toHaveBeenCalled();
	});
	it('takes the destination its opener already loaded instead of reading it again', async () => {
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		fixture.componentRef.setInput('initialDestination', of(destination('first')));
		fixture.detectChanges();
		await settle();
		expect(parents.load).not.toHaveBeenCalled();
		expect(fixture.componentInstance.context()?.document?.['uid']).toBe('first');
	});
	it('uploads dropped files at once, removes a removed file from the batch and drops an unused batch on close', async () => {
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		const dropped = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
		fixture.componentRef.setInput('initialView', 'import');
		fixture.componentRef.setInput('initialFiles', dropped);
		fixture.detectChanges();
		await settle();
		expect(uploads.createUploadBatch).toHaveBeenCalledTimes(1);
		expect(uploads.uploadToBatch.calls.allArgs()).toEqual([
			['batch-1', dropped[0], 0],
			['batch-1', dropped[1], 1],
		]);
		const component = fixture.componentInstance;
		component.context()!.removeSelectedFile!(0);
		await settle();
		expect(uploads.removeBatchFile).toHaveBeenCalledOnceWith('batch-1', 0);
		expect(component.selectedFiles()).toEqual([dropped[1]]);
		fixture.destroy();
		expect(uploads.removeBatchJob).toHaveBeenCalledOnceWith('batch-1');
	});
	it('handles Escape from its focused outer dialog with busy and departure guards, without affecting another modal', async () => {
		const fixture = render();
		const component = fixture.componentInstance;
		const outer = document.createElement('div');
		const other = document.createElement('div');
		for (const dialog of [outer, other]) {
			dialog.setAttribute('role', 'dialog');
			dialog.tabIndex = -1;
			document.body.append(dialog);
		}
		outer.append(fixture.nativeElement);
		const guard = jasmine.createSpy('canDeactivate').and.resolveTo(false);
		(component as any).views = () => ({ canDeactivate: guard });
		const pressEscape = (dialog: HTMLElement) => {
			dialog.focus();
			dialog.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		};
		try {
			pressEscape(other);
			expect(guard).not.toHaveBeenCalled();
			pressEscape(outer);
			await Promise.resolve();
			expect(guard).toHaveBeenCalledTimes(1);
			expect(hide).not.toHaveBeenCalled();
			component.busy.set(true);
			pressEscape(outer);
			expect(guard).toHaveBeenCalledTimes(1);
			component.busy.set(false);
			guard.and.resolveTo(true);
			pressEscape(outer);
			await Promise.resolve();
			expect(hide).toHaveBeenCalledTimes(1);
		} finally {
			fixture.destroy();
			outer.remove();
			other.remove();
		}
	});
	it('cancels a pending shortcut destination before hide so a late lookup cannot open an editor', async () => {
		const lookup = new Subject<any>();
		parents.load.and.returnValue(lookup);
		const fixture = TestBed.createComponent(DestinationCreateDialogComponent);
		fixture.componentRef.setInput('initialType', 'Folder');
		fixture.detectChanges();
		const component = fixture.componentInstance;
		expect(lookup.observed).toBeTrue();
		await component.close();
		expect(hide).toHaveBeenCalledTimes(1);
		expect(lookup.observed).toBeFalse();
		expect(component.initialType).toBeUndefined();
		lookup.next(destination('late'));
		await component.choosePath('/reopened-during-animation');
		expect(component.context()).toBeNull();
		expect(parents.load).toHaveBeenCalledTimes(1);
		expect(parents.readId).not.toHaveBeenCalled();
		expect(show).not.toHaveBeenCalled();
	});
	it('keeps the dialog open when fresh permissions reject creation and recovers from a thrown guard', async () => {
		const component = render().componentInstance;
		parents.readId.and.returnValue(
			of({
				...destination('first').document,
				contextParameters: { permissions: [], subtypes: [] },
			}),
		);
		await component.create('Folder');
		expect(component.error()).toContain('no longer allowed');
		expect(show).not.toHaveBeenCalled();
		expect(hide).not.toHaveBeenCalled();
		(component as any).views = () => ({
			canDeactivate: () => Promise.reject(new Error('editor failed')),
		});
		await component.create('Folder');
		expect(component.busy()).toBeFalse();
		expect(component.error()).toContain('editor failed');
	});
	it('cancels fresh permission reads when the dialog is destroyed', async () => {
		const fixture = render(),
			component = fixture.componentInstance;
		const fresh = new Subject<any>();
		parents.readId.and.returnValue(fresh);
		const creating = component.create('Folder');
		fixture.destroy();
		await creating;
		expect(fresh.observed).toBeFalse();
		expect(show).not.toHaveBeenCalled();
	});
	it('retains the current destination and localizes a failed editor departure without exposing its internal error', async () => {
		const component = render().componentInstance;
		const key =
			'app.components.destination-create-dialog.the-current-editor-could-not-be-closed-your-destination-';
		TestBed.inject(WebUiMessages).register('destination-test', {
			es: { [key]: 'No se pudo cerrar el editor.' },
			ar: { [key]: 'تعذر إغلاق المحرر.' },
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.setLocale('es');
		(component as any).views = () => ({
			canDeactivate: () => Promise.reject(new Error('private editor detail')),
		});
		await component.choosePath('/second');
		expect(component.context()?.document?.['uid']).toBe('first');
		expect(parents.load).toHaveBeenCalledTimes(1);
		expect(component.busy()).toBeFalse();
		expect(component.error()).toBe('No se pudo cerrar el editor.');
		locale.setLocale('ar');
		expect(component.error()).toBe('تعذر إغلاق المحرر.');
		expect(hide).not.toHaveBeenCalled();
	});
	it('handles destination context actions, folder load errors, view switching and active editor departure guards', async () => {
		const fixture = render();
		const component = fixture.componentInstance;
		const ctx = component.context()!;
		const selectSpy = jasmine.createSpy('select');
		(component as any).views = () => ({
			select: selectSpy,
			canDeactivate: () => Promise.resolve(true),
		});
		ctx.open();
		expect(selectSpy).toHaveBeenCalledOnceWith('create');

		const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
		ctx.importSelection!([file]);
		expect(component.selectedFiles()).toEqual([file]);
		ctx.removeSelectedFile!(0);
		expect(component.selectedFiles()).toEqual([]);

		const clickSpy = jasmine.createSpy('click');
		(component as any).files = () => ({ nativeElement: { click: clickSpy } });
		ctx.importFiles();
		expect(clickSpy).toHaveBeenCalledTimes(1);

		const createSpy = spyOn(component, 'create').and.resolveTo();
		ctx.create('Note', true);
		expect(createSpy).toHaveBeenCalledOnceWith('Note', true);

		// Active editor blocks choosePath and switchView when canDeactivate resolves false
		(component as any).activeEditor = () => ({
			componentInstance: { canDeactivate: () => Promise.resolve(false) },
		});
		await component.choosePath('/other');
		expect(component.path).toBe('/first');
		await component.switchView('import');
		expect(component.selectedView()).toBe('create');

		// Allow leaving editor and switchView succeeds
		(component as any).activeEditor = () => ({
			componentInstance: { canDeactivate: () => Promise.resolve(true) },
		});
		await component.switchView('import');
		expect(component.selectedView()).toBe('import');

		// Folder load error sets localized error message
		const failLoad = new Subject<any>();
		parents.load.and.returnValue(failLoad);
		const choosePromise = component.choosePath('/broken');
		failLoad.error(new Error('forbidden'));
		await choosePromise;
		expect(component.loading()).toBeFalse();
		expect(component.error()).toContain('could not be loaded');

		// Synchronous throw from parents.load sets invalid destination message
		parents.load.and.throwError('invalid path');
		await component.choosePath('/invalid');
		expect(component.loading()).toBeFalse();
		expect(component.error()).toContain('Invalid destination');

		// editImportProperties populates importInputs when files and writable destination exist
		parents.load.and.returnValue(
			of({
				...destination('first'),
				types: [{ name: 'File', label: 'File', file: true, folder: false }],
			}),
		);
		await component.choosePath('/first');
		component.uploads.add([file]);
		await settle();
		parents.readId.and.returnValue(of(destination('first').document));
		await component.editImportProperties();
		expect(component.editingImport()).toBeTrue();
		// Add Properties creates from the batch the files were uploaded to when chosen.
		expect(component.importInputs['uploads']).toBe(component.uploads);
	});
});
