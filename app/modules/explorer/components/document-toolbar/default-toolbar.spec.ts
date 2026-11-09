import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	defineContribution,
	DocumentCreateContext,
	ExtensionRegistry,
	FILE_UPLOAD_ACTIONS_SLOT,
	FileUploadContext,
	resolveDocumentViews,
	ResultsToolbarContext,
} from '@maretha/webui-sdk';
import { provideDefaultFileActions } from '../document-attachments/default-file-actions';
import { provideDefaultToolbar } from './default-toolbar';
import { ToolbarActionComponent } from './toolbar-action.component';
import {
	CreateImportPageComponent,
	CreatePopupTabComponent,
	CreateTypePageComponent,
} from './create-popup.component';

const linkedFile = new File(['remote'], 'remote.txt', { type: 'text/plain' });
@Component({
	template: '<button type="button" class="link-source" (click)="link()">Remote</button>',
})
class LinkSourceAction {
	readonly context = input.required<FileUploadContext>();
	link(): void {
		this.context().addFiles?.([linkedFile]);
	}
}

describe('Results and creation contributions', () => {
	it('renders the available Collection clipboard and removal actions', () => {
		TestBed.configureTestingModule({ imports: [ToolbarActionComponent] });
		const context: ResultsToolbarContext = {
			document: { uid: 'collection', type: 'Collection' },
			collection: { uid: 'collection', type: 'Collection' },
			noEdit: false,
			selectedDocuments: [{ uid: 'member', type: 'Note' }],
			busy: false,
			allSelected: false,
			loadedCount: 2,
			totalCount: 2,
			availableCommands: ['clipboard', 'remove-collection'],
			workflows: [],
			execute: jasmine.createSpy('execute').and.resolveTo(),
			setBusy: jasmine.createSpy('setBusy'),
			refresh: jasmine.createSpy('refresh').and.resolveTo(),
			reportError: jasmine.createSpy('reportError'),
		};
		for (const [command, label] of [
			['clipboard', 'Copy to clipboard'],
			['remove-collection', 'Remove from collection'],
		]) {
			const fixture = TestBed.createComponent(ToolbarActionComponent);
			fixture.componentRef.setInput('context', context);
			fixture.componentRef.setInput('command', command);
			fixture.componentRef.setInput('label', label);
			fixture.detectChanges();
			const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
			expect(button.getAttribute('aria-label')).toBe(label);
			expect(button.disabled).toBeFalse();
			button.click();
			expect(context.execute).toHaveBeenCalledWith(command, undefined);
			fixture.destroy();
		}
	});
	it('keeps stock optional spreadsheet and bulk actions disabled by default', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultToolbar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context: any = {
			document: null,
			noEdit: false,
			selectedDocuments: [{ uid: 'a' }],
			busy: false,
			availableCommands: ['edit-selection'],
			queryScope: { providerName: 'default_search' },
		};
		expect(registry.resolve('RESULTS_ACTIONS', context).items.map((item) => item.id)).not.toContain(
			'maretha.results.spreadsheet',
		);
		expect(registry.resolve('RESULTS_ACTIONS', context).items.map((item) => item.id)).not.toContain(
			'maretha.results.query-edit',
		);
		expect(
			registry.resolve('RESULTS_SELECTION_ACTIONS', context).items.map((item) => item.id),
		).not.toContain('maretha.toolbar.edit-selection');
	});
	it('allows independent result-action removal and only offers host capabilities', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultToolbar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context: ResultsToolbarContext = {
			document: null,
			noEdit: false,
			selectedDocuments: [],
			busy: false,
			allSelected: false,
			loadedCount: 5,
			totalCount: 10,
			availableCommands: ['display', 'select-loaded'],
			workflows: [],
			execute: jasmine.createSpy('execute').and.resolveTo(),
			setBusy: jasmine.createSpy('setBusy'),
			refresh: jasmine.createSpy('refresh').and.resolveTo(),
			reportError: jasmine.createSpy('reportError'),
		};
		const ids = () => registry.resolve('RESULTS_ACTIONS', context).items.map((i) => i.id);
		expect(ids()).toEqual(['maretha.toolbar.select-loaded', 'maretha.toolbar.display']);
		const dispose = registry.register({
			id: 'client.results',
			overrides: [{ slot: 'RESULTS_ACTIONS', id: 'maretha.toolbar.display', disabled: true }],
		});
		expect(ids()).toEqual(['maretha.toolbar.select-loaded']);
		dispose();
		expect(ids()).toContain('maretha.toolbar.display');
		expect(registry.resolve('RESULTS_SELECTION_ACTIONS', context).items.length).toBe(0);
	});
	it('offers explicitly enabled server-side query edit for a captured set and restore only for trash', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultToolbar({ bulkEdit: true })] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context: ResultsToolbarContext = {
			document: null,
			noEdit: false,
			selectedDocuments: [],
			busy: false,
			allSelected: true,
			loadedCount: 2,
			totalCount: 50,
			availableCommands: [],
			workflows: [],
			queryScope: {
				repository: 'default',
				providerName: 'default_search',
				queryParams: [],
				namedParameters: { ecm_path: '["/work"]' },
			},
			queryExclusions: ['leave-alone'],
			execute: jasmine.createSpy('execute').and.resolveTo(),
			setBusy: jasmine.createSpy('setBusy'),
			refresh: jasmine.createSpy('refresh').and.resolveTo(),
			reportError: jasmine.createSpy('reportError'),
		};
		const ids = (value = context) =>
			registry.resolve('RESULTS_ACTIONS', value).items.map((item) => item.id);
		expect(ids()).toContain('maretha.results.query-edit');
		expect(ids()).not.toContain('maretha.results.query-restore');
		expect(
			ids({
				...context,
				queryScope: { ...context.queryScope!, providerName: 'default_trash_search' },
			}),
		).toContain('maretha.results.query-restore');
	});
	it('pairs creation pages and hides import without a binary document type', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultToolbar()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context: DocumentCreateContext = {
			document: null,
			noEdit: false,
			types: [{ name: 'File', label: 'File', file: true, folder: false }],
			create: jasmine.createSpy('create'),
			importFiles: jasmine.createSpy('importFiles'),
			open: jasmine.createSpy('open'),
		};
		const slots = { items: 'CREATE_POPUP_ITEMS', pages: 'CREATE_POPUP_PAGES' };
		expect(resolveDocumentViews(registry, context, slots).views.map((v) => v.viewId)).toEqual([
			'create',
			'import',
		]);
		expect(
			resolveDocumentViews(registry, { ...context, types: [] }, slots).views.map((v) => v.viewId),
		).toEqual(['create']);
		expect(
			resolveDocumentViews(
				registry,
				{ ...context, destinationPicker: true, noEdit: true, types: [] },
				slots,
			).views.map((v) => v.viewId),
		).toEqual(['create', 'import']);
		registry.register({
			id: 'client.create',
			overrides: [{ slot: 'CREATE_POPUP_PAGES', id: 'maretha.create.types', disabled: true }],
		});
		expect(resolveDocumentViews(registry, context, slots).views.map((v) => v.viewId)).toEqual([
			'import',
		]);
		expect(
			registry.resolve('DOCUMENT_CREATE_ACTIONS', { ...context, noEdit: true }).items.length,
		).toBe(0);
	});
	it('uses source creation labels and tiles only for the destination picker', () => {
		TestBed.configureTestingModule({ imports: [CreatePopupTabComponent, CreateTypePageComponent] });
		const context: DocumentCreateContext = {
			document: null,
			noEdit: false,
			types: [{ name: 'File', label: 'File', file: true, folder: false }],
			create: jasmine.createSpy('create'),
			importFiles: jasmine.createSpy('import'),
			open: jasmine.createSpy('open'),
		};
		const tab = TestBed.createComponent(CreatePopupTabComponent);
		tab.componentRef.setInput('context', { ...context, viewId: 'create' });
		tab.componentRef.setInput('label', 'New document');
		tab.detectChanges();
		expect(tab.nativeElement.textContent.trim()).toBe('New document');
		tab.componentRef.setInput('context', { ...context, destinationPicker: true, viewId: 'create' });
		tab.detectChanges();
		expect(tab.nativeElement.textContent.trim()).toBe('Create');
		const types = TestBed.createComponent(CreateTypePageComponent);
		types.componentRef.setInput('context', context);
		types.detectChanges();
		expect(types.nativeElement.textContent).toContain('From files');
		expect(types.nativeElement.querySelector('.type-tile')).toBeNull();
		types.componentRef.setInput('context', { ...context, destinationPicker: true });
		types.detectChanges();
		expect(types.nativeElement.textContent).not.toContain('From files');
		types.nativeElement.querySelector('.type-tile').click();
		expect(context.create).toHaveBeenCalledWith('File', false);
	});
	it('shows import guidance at root while allowing file selection through the host callback', () => {
		TestBed.configureTestingModule({ imports: [CreateImportPageComponent] });
		const context: DocumentCreateContext = {
			document: null,
			noEdit: false,
			destinationPicker: true,
			types: [{ name: 'Domain', label: 'Domain', file: false, folder: true }],
			create: jasmine.createSpy('create'),
			importFiles: jasmine.createSpy('import'),
			importSelection: jasmine.createSpy('selection'),
			open: jasmine.createSpy('open'),
		};
		const fixture = TestBed.createComponent(CreateImportPageComponent);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Select a different container');
		expect(fixture.nativeElement.querySelector('button').disabled).toBeFalse();
		const files = [new File(['hello'], 'note.txt', { type: 'text/plain' })];
		const drop = {
			preventDefault: () => undefined,
			stopPropagation: () => undefined,
			dataTransfer: { files },
		} as unknown as DragEvent;
		fixture.componentInstance.drop(drop);
		expect(context.importSelection).toHaveBeenCalledOnceWith(files);
		fixture.componentRef.setInput('context', { ...context, busy: true });
		fixture.componentInstance.drop(drop);
		expect(context.importSelection).toHaveBeenCalledOnceWith(files);
	});
	it('hosts FILE_UPLOAD_ACTIONS in the import drop area like the Polymer import dialog', () => {
		TestBed.configureTestingModule({
			imports: [CreateImportPageComponent],
			providers: [provideDefaultFileActions()],
		});
		const context: DocumentCreateContext = {
			document: null,
			noEdit: false,
			destinationPicker: true,
			types: [{ name: 'File', label: 'File', file: true, folder: false }],
			create: jasmine.createSpy('create'),
			importFiles: jasmine.createSpy('import'),
			importSelection: jasmine.createSpy('selection'),
			open: jasmine.createSpy('open'),
		};
		const fixture = TestBed.createComponent(CreateImportPageComponent);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		const actions = () => fixture.nativeElement.querySelector('.import-actions') as HTMLElement;
		expect(actions().hidden).toBeTrue();
		expect(actions().textContent).not.toContain('Choose files');
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.import',
			contributions: [
				defineContribution(FILE_UPLOAD_ACTIONS_SLOT, {
					id: 'client.remote-source',
					component: LinkSourceAction,
				}),
			],
		});
		fixture.detectChanges();
		expect(actions().hidden).toBeFalse();
		expect(actions().textContent).toContain('or link files from');
		actions().querySelector<HTMLButtonElement>('.link-source')!.click();
		expect(context.importSelection).toHaveBeenCalledOnceWith([linkedFile]);
		fixture.componentInstance.uploadContext().chooseFiles();
		expect(context.importFiles).toHaveBeenCalledTimes(1);
		fixture.componentRef.setInput('context', { ...context, busy: true });
		fixture.detectChanges();
		expect(fixture.componentInstance.uploadContext().disabled).toBeTrue();
		actions().querySelector<HTMLButtonElement>('.link-source')!.click();
		expect(context.importSelection).toHaveBeenCalledTimes(1);
	});
	it('offers explicitly enabled spreadsheet editor before CSV export for an applied query', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultToolbar({ spreadsheet: true })] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context: ResultsToolbarContext = {
			document: null,
			noEdit: false,
			selectedDocuments: [],
			busy: false,
			setBusy: () => undefined,
			refresh: async () => undefined,
			reportError: () => undefined,
			loadedCount: 1,
			totalCount: 1,
			allSelected: false,
			availableCommands: [],
			workflows: [],
			execute: async () => undefined,
		};
		const ids = (candidate: ResultsToolbarContext) =>
			registry.resolve('RESULTS_ACTIONS', candidate).items.map((item) => item.id);
		const applied = ids({
			...context,
			queryScope: {
				repository: 'default',
				providerName: 'default_search',
				queryParams: [],
				namedParameters: {},
			},
		});
		expect(applied.indexOf('maretha.results.spreadsheet')).toBeGreaterThanOrEqual(0);
		expect(applied.indexOf('maretha.results.spreadsheet')).toBeLessThan(
			applied.indexOf('maretha.results.csv-export'),
		);
		expect(ids(context)).not.toContain('maretha.results.spreadsheet');
	});
});
