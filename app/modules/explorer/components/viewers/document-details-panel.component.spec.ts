import { Component, Input, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DocumentLayoutContext, DocumentLayoutRegistry, WebUiLocale } from '@maretha/webui-sdk';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { provideDefaultDocumentLayouts } from '../default-document-layouts';
import { DocumentDetailsPanelComponent } from './document-details-panel.component';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: "<output>override {{ scope?.document?.['title'] }}</output>",
})
class OverrideMetadataComponent {
	// eslint-disable-next-line @angular-eslint/no-input-rename -- verifies the documented legacy layoutContext alias.
	@Input('layoutContext') scope?: DocumentLayoutContext;
}

describe('DocumentDetailsPanelComponent metadata outlet', () => {
	let fixture: ComponentFixture<DocumentDetailsPanelComponent>;
	let layouts: DocumentLayoutRegistry;
	const document = (uid: string, title: string) => ({
		...fixtureDocument('File'),
		uid,
		title,
		properties: { ...fixtureDocument('File').properties, 'dc:title': title },
	});

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentDetailsPanelComponent],
			providers: [
				...legacyTestProviders(),
				provideDefaultDocumentLayouts(),
				{
					provide: MetadataPolicyService,
					useValue: {
						policy: signal({ version: 1, rules: [] }),
						revision: signal(0),
						load: () => Promise.resolve(),
						canRead: () => true,
						canWrite: () => false,
						visibleDocument: (document: unknown) => document,
						userPreferences: () => ({
							metadataHidden: false,
							fieldOrder: [],
							hiddenFields: [],
							hiddenSchemas: [],
						}),
					},
				},
			],
		}).compileComponents();
		layouts = TestBed.inject(DocumentLayoutRegistry);
		fixture = TestBed.createComponent(DocumentDetailsPanelComponent);
	});

	it('renders the real default leaf and recovers from runtime override and disable', () => {
		fixture.componentRef.setInput('document', document('one', 'Original title'));
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('nx-standard-content-metadata')?.textContent,
		).toContain('Original title');
		const disposeOverride = layouts.register({
			id: 'client.metadata',
			layouts: [
				{
					id: 'client.file.metadata',
					documentType: 'File',
					mode: 'metadata',
					component: OverrideMetadataComponent,
					priority: 10,
				},
			],
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('override Original title');
		const disposeDisable = layouts.register({
			id: 'client.disable-metadata',
			overrides: [{ id: 'client.file.metadata', disabled: true }],
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).not.toContain('override Original title');
		disposeDisable();
		fixture.componentRef.setInput('document', document('two', 'Replacement title'));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('override Replacement title');
		disposeOverride();
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('nx-standard-content-metadata')?.textContent,
		).toContain('Replacement title');
		expect(fixture.nativeElement.textContent).not.toContain('Original title');
	});
	it('marks checked-out versions and links the creator by principal identity rather than display name', async () => {
		fixture.componentRef.setInput('document', {
			...document('one', 'Title'),
			isCheckedOut: true,
			ng: { ...document('one', 'Title').ng, createdBy: 'Alex Morgan' },
			properties: {
				'dc:creator': { id: 'AlexAdmin', properties: { firstName: 'Alex', lastName: 'Morgan' } },
				'uid:major_version': 0,
				'uid:minor_version': 1,
			},
		});
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.version).toBe('0.1+');
		const creator = fixture.nativeElement.querySelector('nx-user-tag .user-tag') as HTMLElement;
		expect(creator?.getAttribute('title')).toContain('(AlexAdmin)');
	});
	it('shows the stock Process row only while a workflow runs', () => {
		const base = document('one', 'Title');
		const terms = () =>
			[...fixture.nativeElement.querySelectorAll('.document-status dt')].map((term: Element) =>
				term.textContent?.trim(),
			);
		fixture.componentRef.setInput('document', base);
		fixture.detectChanges();
		expect(terms()).not.toContain('Process');
		fixture.componentRef.setInput('document', {
			...base,
			contextParameters: { ...base.contextParameters, runningWorkflows: [{ id: 'wf' }] },
		});
		fixture.detectChanges();
		expect(terms()[0]).toBe('Process');
		expect(fixture.nativeElement.querySelector('.document-status dd')?.textContent?.trim()).toBe(
			'Running',
		);
	});
	it('keeps mixed customer tag labels and contributor identifiers literal across locale changes', () => {
		fixture.componentRef.setInput('document', {
			...document('one', 'Customer title'),
			contextParameters: {
				tags: ['Customer tag', { label: 'Libellé client' }, { id: 'custom-id' }, null],
			},
			properties: { 'dc:contributors': [{ id: 'customer-user' }, 'Other customer'] },
		});
		const panel = fixture.componentInstance;
		expect(panel.tags).toEqual(['Customer tag', 'Libellé client', 'custom-id']);
		TestBed.inject(WebUiLocale).setLocale('ar');
		expect(panel.tags).toEqual(['Customer tag', 'Libellé client', 'custom-id']);
		// Fetched entities stay entities so their tag labels like the creator's (email when unnamed).
		expect(panel.contributors).toEqual([{ id: 'customer-user' }, 'Other customer']);
	});

	it('updates the mounted metadata context after a same-uid refresh', () => {
		layouts.register({
			id: 'client.metadata',
			layouts: [
				{
					id: 'client.file.metadata',
					documentType: 'File',
					mode: 'metadata',
					component: OverrideMetadataComponent,
					priority: 10,
				},
			],
		});
		fixture.componentRef.setInput('document', document('same', 'Before refresh'));
		fixture.detectChanges();
		fixture.componentRef.setInput('document', document('same', 'After refresh'));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('override After refresh');
		expect(fixture.nativeElement.textContent).not.toContain('override Before refresh');
	});
});
