import { WritableSignal } from '@angular/core';
import { WebUiLocale } from './i18n/webui-locale';
import { WebUiMessages } from './webui-messages';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	DocumentLayoutGateway,
	DocumentTypeMetadata,
	LayoutDocument,
	layoutFieldError,
	layoutPropertyValue,
	resolveLayoutFields,
} from './document-layout';
import { SchemaLayoutComponent } from './schema-layout.component';

describe('Schema-aware document layout', () => {
	let fixture: ComponentFixture<SchemaLayoutComponent>;
	let gateway: jasmine.SpyObj<DocumentLayoutGateway>;
	const metadata: DocumentTypeMetadata = {
		name: 'Contract',
		schemas: [
			{
				name: 'contract',
				prefix: 'contract',
				fields: { amount: 'double', counterparty: 'string' },
			},
		],
	};
	const original: LayoutDocument = {
		uid: 'one',
		type: 'Contract',
		changeToken: '1',
		properties: { 'contract:amount': 100, 'contract:counterparty': 'Acme' },
		contextParameters: { permissions: ['WriteProperties'] },
	};
	async function settle() {
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	}
	function edit(property: string, value: string) {
		const field = fixture.componentInstance.fields().find((f) => f.property === property)!;
		const input = fixture.nativeElement.querySelector(
			`#${fixture.componentInstance.fieldId(field)}`,
		) as HTMLInputElement;
		input.value = value;
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();
	}
	beforeEach(async () => {
		gateway = jasmine.createSpyObj('gateway', [
			'readType',
			'read',
			'update',
			'create',
			'uploadBlob',
			'releaseBlob',
			'searchReferences',
		]);
		gateway.readType.and.resolveTo(metadata);
		gateway.read.and.resolveTo(original);
		TestBed.configureTestingModule({
			imports: [SchemaLayoutComponent],
			providers: [{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: gateway }],
		});
		fixture = TestBed.createComponent(SchemaLayoutComponent);
		fixture.componentRef.setInput('documentId', 'one');
		fixture.componentRef.setInput('layout', {
			id: 'contract',
			documentType: 'Contract',
			fields: [
				{ property: 'contract:counterparty', label: 'Counterparty', required: true },
				{ property: 'contract:amount', label: 'Amount', min: 0 },
			],
		});
		await settle();
	});
	it('translates explicit field keys and validation without changing literal labels or dirty values', async () => {
		TestBed.inject(WebUiMessages).register('test', {
			fr: {
				'fields.amount': 'Montant',
				Counterparty: 'Must stay literal',
				'validation.required': 'Ce champ est obligatoire.',
			},
		});
		fixture.componentRef.setInput('layout', {
			id: 'contract',
			documentType: 'Contract',
			fields: [
				{ property: 'contract:counterparty', label: 'Counterparty', required: true },
				{ property: 'contract:amount', label: 'Amount', labelKey: 'fields.amount' },
			],
		});
		await settle();
		edit('contract:amount', '123');
		edit('contract:counterparty', '');
		const reads = gateway.read.calls.count();
		TestBed.inject(WebUiLocale).setLocale('fr');
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Montant');
		expect(fixture.nativeElement.textContent).toContain('Counterparty');
		expect(fixture.nativeElement.textContent).not.toContain('Must stay literal');
		expect(fixture.nativeElement.textContent).toContain('Ce champ est obligatoire.');
		expect(fixture.componentInstance.values()['contract:amount']).toBe('123');
		expect(fixture.componentInstance.dirty()).toBeTrue();
		expect(gateway.read.calls.count()).toBe(reads);
	});
	it('groups fields into labelled sections in section property order', async () => {
		fixture.componentRef.setInput('layout', {
			id: 'contract',
			documentType: 'Contract',
			fields: [
				{ property: 'contract:counterparty', label: 'Counterparty' },
				{ property: 'contract:amount', label: 'Amount' },
			],
			sections: [
				{
					id: 'terms',
					label: 'Terms',
					columns: 2,
					properties: ['contract:amount', 'contract:missing', 'contract:counterparty'],
				},
			],
		});
		await settle();
		const section: HTMLElement = fixture.nativeElement.querySelector('section');
		const heading: HTMLElement = section.querySelector('h3')!;
		expect(heading.textContent?.trim()).toBe('Terms');
		expect(section.getAttribute('aria-labelledby')).toBe(heading.id);
		expect(fixture.componentInstance.sections()[0].fields.map((field) => field.property)).toEqual([
			'contract:amount',
			'contract:counterparty',
		]);
	});
	it('keeps structured errors string-valued while retained internal errors change language', async () => {
		const component = fixture.componentInstance;
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			fr: { 'sdk.field.noResolver': 'Résolveur indisponible.' },
			ro: { 'sdk.field.noResolver': 'Resolver indisponibil.' },
		});
		const fields = component.fields().map((field) => ({ ...field, type: 'reference' as const }));
		await component.validateReference(fields[0]);
		await component.validateReference(fields[1]);
		const errors: WritableSignal<Readonly<Record<string, string>>> = component.structuredErrors;
		const readonly = errors.asReadonly();
		expect(Object.values(errors()).every((value) => typeof value === 'string')).toBeTrue();
		expect(errors()[fields[0].property].toUpperCase()).toContain('NO REFERENCE RESOLVER');
		messages.locale.set('fr');
		expect(readonly()[fields[0].property]).toBe('Résolveur indisponible.');
		gateway.resolveReference = jasmine.createSpy('resolveReference').and.resolveTo({ id: 'Acme' });
		await component.validateReference(fields[0]);
		expect(readonly()[fields[0].property]).toBeUndefined();
		messages.locale.set('ro');
		expect(readonly()[fields[1].property]).toBe('Resolver indisponibil.');
	});
	it('treats direct structured error set/update values as literal customer strings', async () => {
		const component = fixture.componentInstance;
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', { fr: { 'sdk.field.noResolver': 'Résolveur indisponible.' } });
		const field = { ...component.fields()[0], type: 'reference' as const };
		const errors: WritableSignal<Readonly<Record<string, string>>> = component.structuredErrors;
		errors.set({ [field.property]: 'sdk.field.noResolver' });
		messages.locale.set('fr');
		expect(component.fieldError(field)).toBe('sdk.field.noResolver');
		await component.validateReference(field);
		errors.update((values) => ({ [field.property]: values[field.property].toUpperCase() }));
		messages.locale.set('en-US');
		expect(errors()[field.property]).toBe('RÉSOLVEUR INDISPONIBLE.');
		errors.set({});
		expect(errors()).toEqual({});
	});
	it('relocalizes a retained save conflict without losing the draft or repeating the write', async () => {
		TestBed.inject(WebUiMessages).register('test', {
			fr: { 'sdk.layout.conflict': 'Le document a changé. Brouillon conservé.' },
		});
		edit('contract:amount', '321');
		gateway.update.and.rejectWith({ status: 409 });
		await fixture.componentInstance.submit(new Event('submit'));
		expect(fixture.componentInstance.error()).toContain('changed on the server');
		TestBed.inject(WebUiLocale).setLocale('fr');
		await settle();
		expect(fixture.componentInstance.error()).toBe('Le document a changé. Brouillon conservé.');
		expect(fixture.componentInstance.values()['contract:amount']).toBe('321');
		expect(fixture.componentInstance.dirty()).toBeTrue();
		expect(gateway.update).toHaveBeenCalledTimes(1);
	});
	it('relocalizes schema validation diagnostics with literal property names', async () => {
		TestBed.inject(WebUiMessages).register('test', {
			ro: { 'sdk.layout.missingProperty': 'Lipsește {property}.' },
		});
		fixture.componentRef.setInput('layout', {
			id: 'broken',
			documentType: 'Contract',
			fields: [{ property: 'contract:missing', label: 'Customer' }],
		});
		await settle();
		expect(fixture.componentInstance.error()).toBe(
			'Property is missing from the server schema: contract:missing',
		);
		const reads = gateway.read.calls.count();
		TestBed.inject(WebUiLocale).setLocale('ro');
		await settle();
		expect(fixture.componentInstance.error()).toBe('Lipsește contract:missing.');
		expect(gateway.read.calls.count()).toBe(reads);
	});
	it('validates schema fields and sends only changed properties with the original change token', async () => {
		edit('contract:amount', '-1');
		expect(fixture.componentInstance.invalid()).toBeTrue();
		await fixture.componentInstance.submit(new Event('submit'));
		expect(gateway.update).not.toHaveBeenCalled();
		edit('contract:amount', '200');
		gateway.update.and.resolveTo({
			...original,
			changeToken: '2',
			properties: { ...original.properties, 'contract:amount': 200 },
		});
		await fixture.componentInstance.submit(new Event('submit'));
		expect(gateway.update).toHaveBeenCalledOnceWith(original, { 'contract:amount': 200 });
		expect(fixture.componentInstance.dirty()).toBeFalse();
		expect(fixture.componentInstance.document()?.changeToken).toBe('2');
	});
	it('keeps a draft after a server conflict and lets the user refuse or discard departure', async () => {
		edit('contract:counterparty', 'New party');
		gateway.update.and.rejectWith({ status: 409 });
		await fixture.componentInstance.submit(new Event('submit'));
		expect(fixture.componentInstance.dirty()).toBeTrue();
		expect(fixture.componentInstance.error()).toContain('changed on the server');
		const refused = fixture.componentInstance.canDeactivate();
		fixture.componentInstance.resolveDeparture(false);
		expect(await refused).toBeFalse();
		const approved = fixture.componentInstance.canDeactivate();
		fixture.componentInstance.discardAndLeave();
		expect(await approved).toBeTrue();
		expect(fixture.componentInstance.values()['contract:counterparty']).toBe('Acme');
	});
	it('prevents editing and saves when fresh server permissions do not permit it', async () => {
		gateway.read.and.resolveTo({ ...original, contextParameters: { permissions: ['Read'] } });
		await fixture.componentInstance.reload();
		await settle();
		expect(fixture.nativeElement.querySelector('input')).toBeNull();
		expect(fixture.componentInstance.readOnly()).toBeTrue();
		await fixture.componentInstance.submit(new Event('submit'));
		expect(gateway.update).not.toHaveBeenCalled();
	});
	it('shows a missing-schema error rather than rendering an unbound editor', async () => {
		gateway.readType.and.resolveTo({ ...metadata, schemas: [] });
		await fixture.componentInstance.reload();
		await settle();
		expect(fixture.componentInstance.ready()).toBeFalse();
		expect(fixture.componentInstance.error()).toContain('missing from the server schema');
	});
	it('formats readonly booleans, dates and numbers reactively while preserving stored values and labels', async () => {
		TestBed.inject(WebUiMessages).register('test', {
			ro: { 'sdk.dialog.yes': 'Da', 'sdk.dialog.no': 'Nu' },
		});
		const component = fixture.componentInstance;
		const values = {
			bool: true,
			date: '2026-10-03T23:30:00-07:00',
			number: 1234.56789,
			data: { label: 'Customer directory label' },
		};
		component.values.set(values);
		const field = (property: string, type: string) =>
			({ property, type, label: 'Customer label' }) as any;
		expect(component.display(field('bool', 'boolean'))).toBe('Yes');
		TestBed.inject(WebUiLocale).setLocale('ro');
		expect(component.display(field('bool', 'boolean'))).toBe('Da');
		expect(component.display(field('date', 'date'))).toBe('3 oct. 2026');
		expect(component.display(field('number', 'double'))).toBe('1.234,56789');
		expect(component.display(field('data', 'directory'))).toBe('Customer directory label');
		expect(component.values()).toBe(values);
	});

	it('renders metadata mode without editable inputs', async () => {
		fixture.componentRef.setInput('mode', 'metadata');
		await settle();
		expect(fixture.nativeElement.querySelector('input')).toBeNull();
		expect(fixture.nativeElement.textContent).toContain('Acme');
	});
	it('creates a document in create mode using the same schema validation', async () => {
		fixture.componentRef.setInput('documentId', undefined);
		fixture.componentRef.setInput('parentId', 'parent');
		fixture.componentRef.setInput('name', 'new-contract');
		fixture.componentRef.setInput('mode', 'create');
		await settle();
		edit('contract:counterparty', 'New contract');
		edit('contract:amount', '50');
		gateway.create.and.resolveTo(original);
		await fixture.componentInstance.submit(new Event('submit'));
		expect(gateway.create).toHaveBeenCalledOnceWith('parent', 'Contract', 'new-contract', {
			'contract:counterparty': 'New contract',
			'contract:amount': 50,
		});
	});
	it('round-trips nested complex and multivalued schema values without sharing the server draft', async () => {
		const complexMetadata: DocumentTypeMetadata = {
			name: 'Contract',
			schemas: [
				{
					name: 'contract',
					prefix: 'contract',
					fields: {
						contacts: { type: 'complex[]', fields: { name: 'string' } },
						labels: 'string[]',
					},
				},
			],
		};
		const fields = resolveLayoutFields(
			{
				id: 'complex',
				documentType: 'Contract',
				fields: [
					{ property: 'contract:contacts', label: 'Contacts' },
					{ property: 'contract:labels', label: 'Labels', required: true },
				],
			},
			complexMetadata,
		);
		expect(fields[0]).toEqual(jasmine.objectContaining({ type: 'complex', multiple: true }));
		expect(fields[1]).toEqual(jasmine.objectContaining({ type: 'string', multiple: true }));
		const contacts = [{ name: 'Ada' }];
		expect(layoutFieldError(fields[0], contacts)).toBeNull();
		const submitted = layoutPropertyValue(fields[0], contacts);
		expect(submitted).toEqual(contacts);
		(contacts[0] as { name: string }).name = 'Changed locally';
		expect(submitted).toEqual([{ name: 'Ada' }]);
	});
	it('keeps a rendered multivalue text input focused with its caret through two edits', async () => {
		gateway.readType.and.resolveTo({
			name: 'Contract',
			schemas: [{ name: 'contract', prefix: 'contract', fields: { labels: 'string[]' } }],
		});
		gateway.read.and.resolveTo({
			...original,
			properties: { 'contract:labels': ['alpha', 'beta'] },
		});
		fixture.componentRef.setInput('layout', {
			id: 'labels',
			documentType: 'Contract',
			fields: [{ property: 'contract:labels', label: 'Labels' }],
		});
		await settle();
		const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
		input.focus();
		input.value = 'alpha!';
		input.setSelectionRange(6, 6);
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('input[type="text"]')).toBe(input);
		expect(document.activeElement).toBe(input);
		expect(input.selectionStart).toBe(6);
		input.value = 'alpha!?';
		input.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(fixture.componentInstance.values()['contract:labels']).toEqual(['alpha!?', 'beta']);
	});
	it('renders boolean and blob list controls, blocks departure while upload is pending, and ignores a stale result', async () => {
		let finishUpload!: (value: { name: string }) => void;
		gateway.readType.and.resolveTo({
			name: 'Contract',
			schemas: [
				{
					name: 'contract',
					prefix: 'contract',
					fields: { flags: 'boolean[]', files: 'blob[]' },
				},
			],
		});
		gateway.read.and.resolveTo({
			...original,
			properties: { 'contract:flags': [true, false], 'contract:files': [] },
		});
		fixture.componentRef.setInput('layout', {
			id: 'lists',
			documentType: 'Contract',
			fields: [
				{ property: 'contract:flags', label: 'Flags' },
				{ property: 'contract:files', label: 'Files' },
			],
		});
		await settle();
		expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(2);
		const addFiles = Array.from(
			fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
		).find((button) => button.textContent.includes('Add Files')) as HTMLButtonElement;
		addFiles.click();
		fixture.detectChanges();
		const file = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		(gateway.uploadBlob as jasmine.Spy).and.returnValue(
			new Promise<{ name: string }>((resolve) => (finishUpload = resolve)),
		);
		Object.defineProperty(file, 'files', { value: [new File(['x'], 'old.pdf')] });
		file.dispatchEvent(new Event('change'));
		fixture.detectChanges();
		expect(fixture.componentInstance.hasPendingChanges()).toBeTrue();
		expect(fixture.componentInstance.canDeactivate()).toBeFalse();
		const remove = Array.from(
			fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
		)
			.filter((button) => button.textContent.trim() === 'Remove')
			.at(-1) as HTMLButtonElement;
		remove.click();
		fixture.detectChanges();
		finishUpload({ name: 'old.pdf' });
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.componentInstance.values()['contract:files']).toEqual([]);
		expect(file.value).toBe('');
	});
	it('uses nested reference metadata for search and suppresses stale lookup callbacks', async () => {
		let first!: (value: readonly { id: string }[]) => void;
		gateway.readType.and.resolveTo({
			name: 'Contract',
			schemas: [
				{
					name: 'contract',
					prefix: 'contract',
					fields: { party: { type: 'complex', fields: { contact: { type: 'reference' } } } },
				},
			],
		});
		gateway.read.and.resolveTo({
			...original,
			properties: { 'contract:party': { contact: null } },
		});
		fixture.componentRef.setInput('layout', {
			id: 'nested-reference',
			documentType: 'Contract',
			fields: [{ property: 'contract:party', label: 'Party' }],
		});
		(gateway.searchReferences as jasmine.Spy).and.callFake(
			() => new Promise((resolve) => (first = resolve)),
		);
		await settle();
		const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
		input.value = 'Ada';
		input.dispatchEvent(new Event('input'));
		// Stock nuxeo-document-suggestion: the search waits until typing pauses for 300 ms.
		await new Promise((resolve) => setTimeout(resolve, 350));
		expect((gateway.searchReferences as jasmine.Spy).calls.mostRecent().args[0].property).toBe(
			'contact',
		);
		fixture.componentRef.setInput('documentId', 'other');
		gateway.read.and.resolveTo({
			...original,
			uid: 'other',
			properties: { 'contract:party': { contact: null } },
		});
		await settle();
		first([{ id: 'old' }]);
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('old');
	});
	it('keeps an old upload batch owned by its pending write across repeated document changes and destroy', async () => {
		let finishSave!: (value: LayoutDocument) => void;
		gateway.readType.and.resolveTo({
			name: 'Contract',
			schemas: [{ name: 'contract', prefix: 'contract', fields: { file: 'blob' } }],
		});
		gateway.read.and.callFake((id: string) =>
			Promise.resolve({ ...original, uid: id, properties: { 'contract:file': null } }),
		);
		(gateway.uploadBlob as jasmine.Spy).and.resolveTo({
			'upload-batch': 'old-batch',
			_name: 'old.pdf',
		});
		fixture.componentRef.setInput('layout', {
			id: 'blob',
			documentType: 'Contract',
			fields: [{ property: 'contract:file', label: 'File' }],
		});
		await settle();
		const file = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(file, 'files', { value: [new File(['old'], 'old.pdf')] });
		file.dispatchEvent(new Event('change'));
		await fixture.whenStable();
		fixture.detectChanges();
		gateway.update.and.returnValue(
			new Promise<LayoutDocument>((resolve) => (finishSave = resolve)),
		);
		void fixture.componentInstance.submit(new Event('submit'));
		expect(gateway.update).toHaveBeenCalled();
		fixture.componentRef.setInput('documentId', 'two');
		fixture.detectChanges();
		fixture.componentRef.setInput('documentId', 'three');
		fixture.detectChanges();
		fixture.destroy();
		expect(gateway.releaseBlob).not.toHaveBeenCalled();
		finishSave({ ...original, properties: { 'contract:file': { 'upload-batch': 'old-batch' } } });
	});
	it('retires only the successful write batch before discarding a later draft', async () => {
		let finishSave!: (value: LayoutDocument) => void;
		gateway.readType.and.resolveTo({
			name: 'Contract',
			schemas: [{ name: 'contract', prefix: 'contract', fields: { file: 'blob' } }],
		});
		gateway.read.and.callFake((id: string) =>
			Promise.resolve({ ...original, uid: id, properties: { 'contract:file': null } }),
		);
		(gateway.uploadBlob as jasmine.Spy).and.returnValues(
			Promise.resolve({ 'upload-batch': 'old-batch', _name: 'old.pdf' }),
			Promise.resolve({ 'upload-batch': 'new-batch', _name: 'new.pdf' }),
		);
		fixture.componentRef.setInput('layout', {
			id: 'blob',
			documentType: 'Contract',
			fields: [{ property: 'contract:file', label: 'File' }],
		});
		await settle();
		let file = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(file, 'files', { value: [new File(['old'], 'old.pdf')] });
		file.dispatchEvent(new Event('change'));
		await fixture.whenStable();
		fixture.detectChanges();
		gateway.update.and.returnValue(
			new Promise<LayoutDocument>((resolve) => (finishSave = resolve)),
		);
		const saving = fixture.componentInstance.submit(new Event('submit'));
		fixture.componentRef.setInput('documentId', 'two');
		await settle();
		finishSave({
			...original,
			uid: 'one',
			properties: { 'contract:file': { 'upload-batch': 'old-batch' } },
		});
		await saving;
		file = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
		Object.defineProperty(file, 'files', { value: [new File(['new'], 'new.pdf')] });
		file.dispatchEvent(new Event('change'));
		await fixture.whenStable();
		fixture.detectChanges();
		fixture.componentInstance.discard();
		expect(gateway.releaseBlob).toHaveBeenCalledOnceWith(
			jasmine.objectContaining({ 'upload-batch': 'new-batch' }),
		);
	});
	for (const [status, releases] of [
		[403, true],
		[409, true],
		[0, false],
		[503, false],
	] as const) {
		it(`releases an old batch after a definitive ${status} save failure only`, async () => {
			let failSave!: (reason: unknown) => void;
			gateway.readType.and.resolveTo({
				name: 'Contract',
				schemas: [{ name: 'contract', prefix: 'contract', fields: { file: 'blob' } }],
			});
			gateway.read.and.callFake((id: string) =>
				Promise.resolve({ ...original, uid: id, properties: { 'contract:file': null } }),
			);
			(gateway.uploadBlob as jasmine.Spy).and.resolveTo({
				'upload-batch': 'old-batch',
				_name: 'old.pdf',
			});
			fixture.componentRef.setInput('layout', {
				id: 'blob',
				documentType: 'Contract',
				fields: [{ property: 'contract:file', label: 'File' }],
			});
			await settle();
			const file = fixture.nativeElement.querySelector('input[type="file"]') as HTMLInputElement;
			Object.defineProperty(file, 'files', { value: [new File(['old'], 'old.pdf')] });
			file.dispatchEvent(new Event('change'));
			await fixture.whenStable();
			fixture.detectChanges();
			gateway.update.and.returnValue(
				new Promise<LayoutDocument>((_, reject) => (failSave = reject)),
			);
			const saving = fixture.componentInstance.submit(new Event('submit'));
			fixture.componentRef.setInput('documentId', 'two');
			await settle();
			failSave({ status });
			await saving;
			expect(gateway.releaseBlob).toHaveBeenCalledTimes(releases ? 1 : 0);
		});
	}
	it('rejects an unknown server type unless a client widget explicitly owns it', () => {
		const unknown: DocumentTypeMetadata = {
			name: 'Contract',
			schemas: [{ name: 'contract', fields: { encrypted: 'encrypted' } }],
		};
		expect(() =>
			resolveLayoutFields(
				{
					id: 'unknown',
					documentType: 'Contract',
					fields: [{ property: 'contract:encrypted', label: 'Encrypted' }],
				},
				unknown,
			),
		).toThrowError(/Unsupported server schema type/);
		expect(
			resolveLayoutFields(
				{
					id: 'custom',
					documentType: 'Contract',
					fields: [{ property: 'contract:encrypted', label: 'Encrypted', widget: 'encrypted' }],
				},
				unknown,
			)[0].type,
		).toBe('string');
		expect(
			(fixture.componentInstance as any).blobDisplay([{ name: 'a.pdf' }, { _name: 'b.pdf' }, {}]),
		).toBe('a.pdf, b.pdf, File selected');
	});
});
