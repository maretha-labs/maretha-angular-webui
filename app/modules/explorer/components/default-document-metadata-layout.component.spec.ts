import { WebUiMessages } from '@maretha/webui-sdk';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { legacyTestProviders, fixtureDocument } from 'app/testing/legacy-test-providers';
import { DefaultDocumentMetadataLayoutComponent } from './default-document-metadata-layout.component';
import { DocumentLayoutGatewayService } from '../helpers/document-layout-gateway.service';
import { from } from 'rxjs';
import { MetadataPolicyService } from '../helpers/metadata-policy.service';

describe('DefaultDocumentMetadataLayoutComponent', () => {
	let fixture: ComponentFixture<DefaultDocumentMetadataLayoutComponent>;
	const metadataPolicy = {
		provide: MetadataPolicyService,
		useValue: {
			load: () => Promise.resolve(),
			canRead: (_document: unknown, _property: string) => true,
			canWrite: () => false,
			visibleDocument: (document: unknown) => document,
			userPreferences: () => ({
				metadataHidden: false,
				fieldOrder: [],
				hiddenFields: [],
				hiddenSchemas: [],
			}),
		},
	};

	async function render(document: any) {
		await TestBed.configureTestingModule({
			imports: [DefaultDocumentMetadataLayoutComponent],
			providers: [...legacyTestProviders(), metadataPolicy],
		}).compileComponents();
		fixture = TestBed.createComponent(DefaultDocumentMetadataLayoutComponent);
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
	}

	it('renders permitted metadata read-only while allowing display customization', async () => {
		spyOn(metadataPolicy.useValue, 'canRead').and.callFake(
			(_document, property) => property !== 'private:secret',
		);
		const document = fixtureDocument('Folder');
		Object.assign(document.properties as any, {
			'dc:description': 'A folder description',
			'dc:nature': { label: 'Report' },
			'dc:subjects': [{ label: 'Finance' }, { label: 'Legal' }],
			'dc:coverage': { label: 'EMEA' },
			'dc:expired': '2026-10-01T00:00:00Z',
			'private:secret': 'Restricted metadata',
		});
		await render(document);
		expect(fixture.nativeElement.querySelector('[data-field="title"]').textContent).toContain(
			'Fixture document',
		);
		expect(fixture.nativeElement.querySelector('[data-field="subjects"]').textContent).toContain(
			'Finance, Legal',
		);
		expect(fixture.nativeElement.querySelector('[data-field="secret"]')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('Restricted metadata');
		expect(fixture.nativeElement.querySelector('nx-schema-field, textarea')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('Edit metadata');
		expect(fixture.nativeElement.querySelector('input[type="checkbox"]')).not.toBeNull();

		const customize: HTMLButtonElement = fixture.nativeElement.querySelector(
			'.metadata-toolbar button',
		);
		expect(customize.textContent).toContain('Customize');
		customize.click();
		fixture.detectChanges();
		const customization = fixture.nativeElement.querySelector('[aria-label="Customize metadata"]');
		expect(customization.textContent).toContain('Subjects');
		expect(customization.textContent).not.toContain('Secret');
		expect(fixture.nativeElement.querySelector('nx-schema-field, textarea')).toBeNull();
	});

	it('formats metadata in the active locale while preserving custom names and values', async () => {
		const document = fixtureDocument('Folder');
		Object.assign(document.properties, {
			'dc:nature': { label_en: 'English', label_ro: 'Română' },
			'custom:amount': 1234.5,
			'custom:enabled': true,
			'custom:customerLabel': 'Customer text',
		});
		await render(document);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('test', {
			ro: { 'label.dublincore.title': 'Titlu', 'sdk.dialog.yes': 'Da' },
		});
		messages.locale.set('ro');
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('[data-field="title"] .metadata-label').textContent,
		).toBe('Titlu');
		expect(
			fixture.nativeElement.querySelector('[data-field="nature"] .metadata-value').textContent,
		).toContain('Română');
		expect(fixture.nativeElement.textContent).toContain(new Intl.NumberFormat('ro').format(1234.5));
		expect(
			fixture.nativeElement.querySelector('[data-field="enabled"] .metadata-value').textContent,
		).toContain('Da');
		expect(
			fixture.nativeElement.querySelector('[data-field="customerLabel"]').textContent,
		).toContain('Customer text');
		expect(fixture.componentInstance.document).toBe(document);
	});
	it('renders all permitted PictureBook metadata beyond title and description', async () => {
		const document = fixtureDocument('PictureBook');
		(document.properties as any)['dc:description'] = 'Picture book summary';
		(document.properties as any)['dc:nature'] = { label: 'Portfolio' };
		(document.properties as any)['gallery:category'] = 'Landscapes';
		await render(document);
		expect(fixture.nativeElement.querySelector('[data-field="description"]').textContent).toContain(
			'Picture book summary',
		);
		expect(fixture.nativeElement.querySelector('[data-field="nature"]').textContent).toContain(
			'Portfolio',
		);
		expect(fixture.nativeElement.querySelector('[data-field="category"]').textContent).toContain(
			'Landscapes',
		);
	});

	it('leaves media attachments and blob properties to the dedicated content layout', async () => {
		const document = fixtureDocument('Video');
		(document.properties as any)['dc:description'] = 'Video summary';
		(document.properties as any)['file:content'] = {
			name: 'master.mp4',
			data: '/nuxeo/api/v1/id/video/@blob/file:content',
			'mime-type': 'video/mp4',
		};
		(document.ng as any).attachments = [
			{ file: { name: 'master.mp4', data: '/nuxeo/api/v1/id/video/@blob/file:content' } },
			{ file: { name: 'unsafe.mp4', data: 'javascript:alert(1)' } },
		];
		await render(document);
		expect(fixture.nativeElement.querySelector('[data-field="description"]').textContent).toContain(
			'Video summary',
		);
		expect(fixture.nativeElement.querySelector('[data-field="attachments"]')).toBeNull();
		expect(fixture.nativeElement.querySelector('[data-field="content"]')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('master.mp4');
		expect(fixture.nativeElement.textContent).not.toContain('unsafe.mp4');
		expect(fixture.nativeElement.querySelector('a[href]')).toBeNull();
	});

	it('does not expose enriched Picture attachments as metadata fields', async () => {
		const document = fixtureDocument('Picture');
		(document.ng as any).attachments = [{ file: { name: 'not-in-picture-source.jpg' } }];
		await render(document);
		expect(fixture.nativeElement.querySelector('[data-field="attachments"]')).toBeNull();
	});

	it('prefers enriched directory labels and ignores a stale raw-subject lookup after a document change', async () => {
		const first: { resolve: (value: any) => void; promise: Promise<any> } = {} as any;
		first.promise = new Promise((resolve) => (first.resolve = resolve));
		const second: { resolve: (value: any) => void; promise: Promise<any> } = {} as any;
		second.promise = new Promise((resolve) => (second.resolve = resolve));
		await TestBed.configureTestingModule({
			imports: [DefaultDocumentMetadataLayoutComponent],
			providers: [
				...legacyTestProviders(),
				metadataPolicy,
				{
					provide: DocumentLayoutGatewayService,
					useValue: {
						readDocumentType: () => Promise.resolve({ name: 'Folder', schemas: [] }),
						resolveReference$: jasmine
							.createSpy()
							.and.callFake((_field: unknown, value: string) =>
								from(value === 'raw-a' ? first.promise : second.promise),
							),
					},
				},
			],
		}).compileComponents();
		fixture = TestBed.createComponent(DefaultDocumentMetadataLayoutComponent);
		fixture.componentRef.setInput('document', {
			...fixtureDocument('Folder'),
			properties: {
				'dc:title': 'A',
				'dc:subjects': ['raw-a'],
				'dc:nature': { label_en: 'Enriched nature' },
			},
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[data-field="nature"]').textContent).toContain(
			'Enriched nature',
		);
		fixture.componentRef.setInput('document', {
			...fixtureDocument('Folder'),
			properties: { 'dc:title': 'B', 'dc:subjects': ['raw-b'] },
		});
		fixture.detectChanges();
		first.resolve({ id: 'raw-a', label: 'STALE' });
		await Promise.resolve();
		second.resolve({ id: 'raw-b', label: 'Current subject' });
		await Promise.resolve();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[data-field="subjects"]').textContent).toContain(
			'Current subject',
		);
		expect(fixture.nativeElement.textContent).not.toContain('STALE');
	});

	it('renders an invalid expiration safely', async () => {
		const document = fixtureDocument('Audio');
		(document.properties as any)['dc:expired'] = 'not-a-date';
		await render(document);
		expect(fixture.nativeElement.querySelector('[data-field="expired"]')).not.toBeNull();
	});

	it('resolves built-in nature message labels while preserving customer directory labels', async () => {
		const document = fixtureDocument('File');
		Object.assign(document.properties, {
			'dc:nature': { id: 'booklet', label: 'label.directories.nature.booklet' },
			'dc:subjects': [{ id: 'art', label: 'Customer art label' }],
		});
		await render(document);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('native-directory-test', {
			[messages.locale()]: { 'label.directories.nature.booklet': 'Booklet' },
		});
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('[data-field="nature"] .metadata-value').textContent,
		).toContain('Booklet');
		expect(
			fixture.nativeElement.querySelector('[data-field="subjects"] .metadata-value').textContent,
		).toContain('Customer art label');
		const component = fixture.componentInstance;
		expect(component.display('label.directories.nature.booklet', 'nature')).toBe('Booklet');
		expect(component.display({ label: 'label.directories.nature.booklet' }, 'customer')).toBe(
			'label.directories.nature.booklet',
		);
		expect(component.display({ label: 'Custom nature' }, 'nature')).toBe('Custom nature');
		expect(component.display('', 'nature')).toBe('');
	});
});
