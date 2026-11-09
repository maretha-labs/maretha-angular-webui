import { Component, Input, effect, inject, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	DOCUMENT_IMPORT_DRAFT,
	DOCUMENT_LAYOUT_GATEWAY,
	DocumentLayoutContext,
	SchemaLayoutComponent,
	LocalizedUiError,
	WebUiLocale,
	WebUiMessages,
	documentLayoutContext,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { BulkDocumentCreation } from '../../helpers/bulk-document-creation.service';
import { DocumentImportHostComponent } from './document-import-host.component';

@Component({
	selector: 'nx-test-import-layout',
	template: '<span class="layout">{{ draft.file.name }}</span>',
})
class TestImportLayoutComponent {
	@Input() layoutContext: DocumentLayoutContext | undefined;
	readonly draft = inject(DOCUMENT_IMPORT_DRAFT);
	static mounted: TestImportLayoutComponent[] = [];
	constructor() {
		TestImportLayoutComponent.mounted.push(this);
	}
}

/** The shape `npm run new:layout -- --modes import` generates. */
@Component({
	selector: 'nx-test-schema-import-layout',
	imports: [SchemaLayoutComponent],
	template: `<nx-schema-layout
		[layout]="layout"
		[parentId]="parentId()"
		mode="import"
		[draftOnly]="true"
		[initialValues]="draft.properties"
		(valueChanged)="draft.update($event)"
	/>`,
})
class SchemaImportLayoutComponent {
	@Input() layoutContext: DocumentLayoutContext | undefined;
	readonly draft = inject(DOCUMENT_IMPORT_DRAFT);
	readonly layout = {
		id: 'test.layout.contract.fields',
		documentType: 'Contract',
		fields: [{ property: 'dc:title', label: 'Title', required: true }],
	};
	private readonly schema = viewChild(SchemaLayoutComponent);
	constructor() {
		effect(() => {
			const schema = this.schema();
			if (schema?.ready()) this.draft.setValid(!schema.invalid());
		});
	}
	parentId(): string {
		return String(this.layoutContext?.parentDocument?.['uid'] ?? '');
	}
}

describe('DocumentImportHostComponent', () => {
	let batch: jasmine.SpyObj<any> & { started: () => boolean; working: () => boolean };

	function create(
		documentType: string,
		files: File[],
		layoutComponent: any = TestImportLayoutComponent,
		allowedTypes: string[] = [],
	) {
		TestImportLayoutComponent.mounted = [];
		batch = {
			watchDeparture: jasmine.createSpy('watchDeparture'),
			started: () => false,
			working: () => false,
			complete: () => false,
			retryable: () => false,
			createdCount: () => 0,
			items: () => [],
			configure: jasmine.createSpy('configure'),
			adoptUploads: jasmine.createSpy('adoptUploads'),
			run: jasmine.createSpy('run').and.resolveTo(),
		} as any;
		TestBed.configureTestingModule({
			imports: [DocumentImportHostComponent],
			providers: [
				{ provide: BsModalRef, useValue: { hide: jasmine.createSpy() } },
				{
					provide: DOCUMENT_LAYOUT_GATEWAY,
					useValue: {
						readType: () =>
							Promise.resolve({
								name: 'Contract',
								schemas: [{ name: 'dublincore', prefix: 'dc', fields: { title: 'string' } }],
							}),
					},
				},
			],
		}).overrideComponent(DocumentImportHostComponent, {
			set: { providers: [{ provide: BulkDocumentCreation, useValue: batch }] },
		});
		const fixture = TestBed.createComponent(DocumentImportHostComponent);
		const host = fixture.componentInstance;
		host.layoutComponent = layoutComponent;
		host.allowedTypes = allowedTypes;
		host.layoutContext = documentLayoutContext({
			documentType,
			mode: 'import',
			parentDocument: { uid: 'parent' },
		});
		host.files = files;
		host.documentType = documentType;
		host.parentDocument = { uid: 'parent', path: '/parent' };
		fixture.detectChanges();
		return { fixture, host };
	}

	it('mounts the import layout with the selected file draft and keeps it while editing', () => {
		const [first, second] = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')];
		const { fixture, host } = create('Contract', [first, second]);
		const [layout] = TestImportLayoutComponent.mounted;
		expect(layout.draft.file).toBe(first);
		expect(layout.draft.properties).toEqual({ 'dc:title': 'a.pdf' });
		expect(layout.layoutContext?.documentType).toBe('contract');
		layout.draft.update({ 'dc:title': 'Signed', 'ct:number': 7 });
		fixture.detectChanges();
		expect(TestImportLayoutComponent.mounted.length).toBe(1);
		expect(fixture.nativeElement.querySelector('.file-list').textContent).toContain('Signed');
		host.select(host.drafts()[1].key);
		fixture.detectChanges();
		expect(TestImportLayoutComponent.mounted.length).toBe(2);
		expect(TestImportLayoutComponent.mounted[1].draft.file).toBe(second);
		host.select(host.drafts()[0].key);
		fixture.detectChanges();
		expect(TestImportLayoutComponent.mounted[2].draft.properties).toEqual({
			'dc:title': 'Signed',
			'ct:number': 7,
		});
	});

	it('creates one document per file with its own title and properties', async () => {
		const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')];
		const { host } = create('Contract', files);
		TestImportLayoutComponent.mounted[0].draft.update({ 'dc:title': 'First', 'ct:number': 1 });
		host.applyToOthers(host.drafts()[0].key);
		await host.save();
		const [parent, configured, typeFor, properties, contentFor, titleFor] =
			batch.configure.calls.mostRecent().args;
		expect(parent).toEqual({ uid: 'parent', path: '/parent' });
		expect(configured).toEqual(files);
		expect(typeFor(files[0])).toBe('Contract');
		expect(properties(files[1])).toEqual({ 'ct:number': 1 });
		expect(contentFor(files[0])).toEqual({ kind: 'upload', property: 'file:content' });
		expect(titleFor(files[0])).toBe('First');
		expect(titleFor(files[1])).toBe('b.pdf');
		expect(batch.run).toHaveBeenCalled();
	});

	it('requires a type per file like stock, keeps mixed types, scopes Apply To All and honors inclusion', async () => {
		const files = [
			new File(['one'], 'one.txt', { type: 'text/plain' }),
			new File(['picture'], 'image.png', { type: 'image/png' }),
			new File(['two'], 'two.txt', { type: 'text/plain' }),
		];
		const { host, fixture } = create('', files, TestImportLayoutComponent, [
			'File',
			'Picture',
			'Note',
		]);
		expect(host.drafts().map((draft) => draft.documentType)).toEqual(['', '', '']);
		expect(TestImportLayoutComponent.mounted.length).toBe(0);
		const select: HTMLSelectElement = fixture.nativeElement.querySelector('#import-draft-type');
		expect(select.required).toBeTrue();
		expect(select.options[0].textContent).toContain('Select an asset type.');
		expect(fixture.nativeElement.querySelector('.btn-primary').disabled).toBeTrue();
		await host.save();
		expect(batch.configure).not.toHaveBeenCalled();
		const chosen = ['File', 'Picture', 'File'];
		host.drafts().forEach((draft, index) => host.changeType(draft.key, chosen[index]));
		fixture.detectChanges();
		expect(host.drafts().map((draft) => draft.documentType)).toEqual(chosen);
		TestImportLayoutComponent.mounted[0].draft.update({ 'dc:description': 'Shared description' });
		host.applyToOthers(host.drafts()[0].key);
		expect(host.drafts()[2].properties['dc:description']).toBe('Shared description');
		expect(host.drafts()[1].properties['dc:description']).toBeUndefined();
		host.include(host.drafts()[1].key, false);
		await host.save();
		const args = batch.configure.calls.mostRecent().args;
		expect(args[1]).toEqual([files[0], files[2]]);
		expect(args[2](files[2])).toBe('File');
		host.include(host.drafts()[0].key, false);
		host.include(host.drafts()[2].key, false);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.btn-primary').disabled).toBeTrue();
	});
	it('hands the files the dialog already uploaded to the creation instead of uploading again', async () => {
		const file = new File(['a'], 'a.pdf');
		const { host } = create('Contract', [file]);
		const handed = { batchId: 'batch-1', indexOf: () => 0 };
		host.uploads = { take: jasmine.createSpy('take').and.returnValue(handed) } as any;
		await host.save();
		expect(batch.configure).toHaveBeenCalled();
		expect(batch.adoptUploads).toHaveBeenCalledOnceWith(handed);
		expect(batch.run).toHaveBeenCalled();
	});
	it('blocks creation while a layout reports invalid values', async () => {
		const { fixture, host } = create('Contract', [new File(['a'], 'a.pdf')]);
		TestImportLayoutComponent.mounted[0].draft.setValid(false);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.btn-primary').disabled).toBeTrue();
		await host.save();
		expect(batch.configure).not.toHaveBeenCalled();
		TestImportLayoutComponent.mounted[0].draft.setValid(true);
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.btn-primary').disabled).toBeFalse();
	});

	it('removes a file and mounts its neighbour', () => {
		const files = [new File(['a'], 'a.pdf'), new File(['b'], 'b.pdf')];
		const { fixture, host } = create('Contract', files);
		host.removeFile(host.drafts()[0].key);
		fixture.detectChanges();
		expect(host.drafts().map((draft) => draft.file)).toEqual([files[1]]);
		expect(TestImportLayoutComponent.mounted.at(-1)!.draft.file).toBe(files[1]);
	});

	it('imports a Note body as text with a format from the file', async () => {
		const note = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
		const { host } = create('Note', [note]);
		expect(TestImportLayoutComponent.mounted[0].draft.properties['note:mime_type']).toBe(
			'text/x-web-markdown',
		);
		await host.save();
		const args = batch.configure.calls.mostRecent().args;
		expect(args[3](note)).toEqual({ 'note:mime_type': 'text/x-web-markdown' });
		expect(args[4](note)).toEqual({ kind: 'utf8-text', property: 'note:note' });
	});

	it('waits for Note to be chosen, even as the only allowed type, then takes its format from the file', async () => {
		const file = new File(['# Heading'], 'only-note.md', { type: 'text/markdown' });
		const { host, fixture } = create('', [file], TestImportLayoutComponent, ['Note']);
		expect(host.drafts()[0].documentType).toBe('');
		expect(fixture.nativeElement.querySelector('#import-draft-type')).not.toBeNull();
		host.changeType(host.drafts()[0].key, 'Note');
		expect(host.drafts()[0].properties['note:mime_type']).toBe('text/x-web-markdown');
		await host.save();
		const args = batch.configure.calls.mostRecent().args;
		expect(args[2](file)).toBe('Note');
		expect(args[4](file)).toEqual({ kind: 'utf8-text', property: 'note:note' });
	});
	it('keeps the drafts and re-renders a failed import message when the locale changes', async () => {
		const { host } = create('Note', [new File(['Customer text'], 'Customer.md')]);
		batch.run.and.rejectWith(
			new LocalizedUiError('test.import', 'Cannot import {name}', { name: 'Customer.md' }),
		);
		TestImportLayoutComponent.mounted[0].draft.update({ 'dc:title': 'Customer draft title' });
		await host.save();
		expect(host.error).toBe('Cannot import Customer.md');
		TestBed.inject(WebUiMessages).register('test', {
			fr: { 'test.import': 'Import impossible : {name}' },
		});
		TestBed.inject(WebUiLocale).setLocale('fr');
		expect(host.error).toBe('Import impossible : Customer.md');
		expect(host.drafts()[0].properties['dc:title']).toBe('Customer draft title');
	});

	it('takes values and validity from a generated schema import layout', async () => {
		const { fixture, host } = create(
			'Contract',
			[new File(['a'], 'a.pdf')],
			SchemaImportLayoutComponent,
		);
		await fixture.whenStable();
		fixture.detectChanges();
		const title = fixture.nativeElement.querySelector('nx-schema-layout input') as HTMLInputElement;
		expect(title.value).toBe('a.pdf');
		title.value = '';
		title.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(host.invalid()).toBeTrue();
		expect(fixture.nativeElement.querySelector('.btn-primary').disabled).toBeTrue();
		title.value = 'Master agreement';
		title.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(host.invalid()).toBeFalse();
		expect(host.drafts()[0].properties['dc:title']).toBe('Master agreement');
	});
});
