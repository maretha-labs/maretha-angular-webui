import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebUiLocale } from './i18n/webui-locale';
import {
	DOCUMENT_LAYOUT_GATEWAY,
	type DocumentLayout,
	type DocumentLayoutGateway,
	type LayoutDocument,
} from './document-layout';
import { SchemaLayoutComponent } from './schema-layout.component';

describe('Persisted schema-layout vocabulary labels', () => {
	let fixture: ComponentFixture<SchemaLayoutComponent>;
	let gateway: jasmine.SpyObj<Required<DocumentLayoutGateway>>;
	const properties = {
		'dc:nature': 'booklet',
		'dc:subjects': ['art', 'business'],
		'dc:coverage': 'europe',
	};
	const layout: DocumentLayout = {
		id: 'saved-vocabulary',
		documentType: 'InteractionResults',
		fields: [
			{ property: 'dc:nature', label: 'Nature', widget: 'directory', directoryName: 'nature' },
			{
				property: 'dc:subjects',
				label: 'Subjects',
				widget: 'directory',
				directoryName: 'l10nsubjects',
			},
			{
				property: 'dc:coverage',
				label: 'Coverage',
				widget: 'directory',
				directoryName: 'l10ncoverage',
			},
		],
	};
	const labels: Record<string, string> = {
		booklet: 'Booklet',
		art: 'Art',
		business: 'Business',
		europe: 'Europe',
	};
	const document = (uid: string): LayoutDocument => ({
		uid,
		type: 'InteractionResults',
		changeToken: '1',
		properties,
		contextParameters: { permissions: ['WriteProperties'] },
	});
	async function settle() {
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
	}
	function mount(mode: 'edit' | 'metadata') {
		fixture = TestBed.createComponent(SchemaLayoutComponent);
		fixture.componentRef.setInput('documentId', 'one');
		fixture.componentRef.setInput('mode', mode);
		fixture.componentRef.setInput('layout', layout);
	}
	beforeEach(async () => {
		gateway = jasmine.createSpyObj('gateway', [
			'readType',
			'read',
			'update',
			'create',
			'resolveReference',
			'searchReferences',
		]);
		gateway.readType.and.resolveTo({
			name: 'InteractionResults',
			schemas: [
				{
					name: 'dublincore',
					prefix: 'dc',
					fields: {
						nature: 'string',
						subjects: 'string[]',
						coverage: 'string',
					},
				},
			],
		});
		gateway.read.and.callFake(async (uid) => document(uid));
		gateway.resolveReference!.and.callFake(async (_field, id) => ({ id, label: labels[id] }));
		gateway.searchReferences!.and.resolveTo([]);
		await TestBed.configureTestingModule({
			imports: [SchemaLayoutComponent],
			providers: [{ provide: DOCUMENT_LAYOUT_GATEWAY, useValue: gateway }],
		}).compileComponents();
	});
	it('resolves scalar and multiple saved IDs on every reopened editor without changing the draft', async () => {
		for (let opening = 0; opening < 2; opening++) {
			mount('edit');
			await settle();
			const inputs = fixture.nativeElement.querySelectorAll(
				'[role=combobox]',
			) as NodeListOf<HTMLInputElement>;
			expect(inputs[0].value).toBe('Booklet');
			expect(inputs[2].value).toBe('Europe');
			const chips = Array.from(
				fixture.nativeElement.querySelectorAll('.directory-value') as NodeListOf<HTMLElement>,
			);
			expect(chips.map((chip) => chip.textContent!.replace('×', '').trim())).toEqual([
				'Art',
				'Business',
			]);
			expect(fixture.componentInstance.values()).toEqual(properties);
			expect(fixture.componentInstance.dirty()).toBeFalse();
			fixture.destroy();
		}
		expect(gateway.resolveReference).toHaveBeenCalledTimes(8);
		expect(gateway.update).not.toHaveBeenCalled();
	});
	it('renders resolved labels in readonly metadata and falls back to an unavailable ID', async () => {
		gateway.resolveReference!.and.callFake(async (_field, id) => {
			if (id === 'europe') throw new Error('unavailable');
			return { id, label: labels[id] };
		});
		mount('metadata');
		await settle();
		const text = fixture.nativeElement.textContent;
		expect(text).toContain('Booklet');
		expect(text).toContain('Art, Business');
		expect(text).toContain('europe');
		expect(text).not.toContain('booklet');
		expect(fixture.nativeElement.querySelector('input')).toBeNull();
		expect(fixture.componentInstance.values()).toEqual(properties);
		expect(gateway.update).not.toHaveBeenCalled();
	});
	it('refreshes labels on locale changes and ignores responses from a replaced document', async () => {
		const pending: (() => void)[] = [];
		gateway.resolveReference!.and.callFake(
			(_field, id) =>
				new Promise((resolve) => pending.push(() => resolve({ id, label: 'Stale label' }))),
		);
		mount('metadata');
		fixture.detectChanges();
		// Finish the document read without waiting for its intentionally delayed label lookups.
		await Promise.resolve();
		fixture.detectChanges();
		await Promise.resolve();
		fixture.detectChanges();
		expect(pending.length).toBe(4);
		gateway.resolveReference!.and.callFake(async (_field, id) => ({
			id,
			label: TestBed.inject(WebUiLocale).locale() === 'fr' ? `Français ${labels[id]}` : labels[id],
		}));
		fixture.componentRef.setInput('documentId', 'two');
		await settle();
		pending.forEach((resolve) => resolve());
		await Promise.resolve();
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Booklet');
		expect(fixture.nativeElement.textContent).not.toContain('Stale label');
		TestBed.inject(WebUiLocale).setLocale('fr');
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Français Booklet');
		expect(fixture.componentInstance.values()).toEqual(properties);
		expect(fixture.componentInstance.dirty()).toBeFalse();
	});
	it('toggles, clears, blurs and handles search failures in directory fields', async () => {
		mount('edit');
		await settle();
		const fieldDebug = fixture.debugElement.children[0].query(
			(el) => el.name === 'nx-schema-field',
		)!;
		const fieldComp = fieldDebug.componentInstance;
		fieldComp.toggleDirectory();
		expect(fieldComp.directoryOpen()).toBeTrue();
		fieldComp.toggleDirectory();
		expect(fieldComp.directoryOpen()).toBeFalse();
		fieldComp.openDirectory();
		expect(fieldComp.directoryOpen()).toBeTrue();
		fieldComp.directoryBlur({ relatedTarget: globalThis.document.body } as unknown as FocusEvent);
		expect(fieldComp.directoryOpen()).toBeFalse();
		fieldComp.clearDirectory();
		expect(fixture.componentInstance.values()['dc:nature']).toBeNull();
		fieldComp.clearBlob();
		expect(fixture.componentInstance.values()['dc:nature']).toBeNull();

		let rejectSearch!: (err: unknown) => void;
		gateway.searchReferences!.and.returnValue(new Promise((_, rej) => (rejectSearch = rej)));
		fieldComp.openDirectory();
		rejectSearch(new Error('search down'));
		await Promise.resolve();
		await Promise.resolve();
		expect(fieldComp.lookupError()).toContain('References could not be loaded');
	});
});
