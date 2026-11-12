import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideDocumentLayoutExtensions, type DocumentLayoutContext } from '@maretha/webui-sdk';
import { provideDefaultDocumentLayouts } from '../../default-document-layouts';

import { DocumentTypeViewerComponent } from './document-type-viewer.component';

describe('DocumentTypeViewerComponent', () => {
	let component: DocumentTypeViewerComponent;
	let fixture: ComponentFixture<DocumentTypeViewerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [DocumentTypeViewerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DocumentTypeViewerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		'<output>custom {{ document?.title }} {{ layoutContext?.document?.["title"] }}</output>',
})
class CustomFileViewComponent {
	@Input() document: { title?: string } | undefined;
	@Input() layoutContext: DocumentLayoutContext | undefined;
}

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<output>no context</output>',
})
class NoContextViewComponent {
	@Input() document: { title?: string } | undefined;
}

describe('DocumentTypeViewerComponent document layouts', () => {
	it('renders a custom view with data.document and a separate frozen context', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeViewerComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'client.file-view',
					layouts: [
						{
							id: 'client.file.view',
							documentType: 'File',
							mode: 'view',
							component: CustomFileViewComponent,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeViewerComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('data', { document: { uid: 'one', title: 'Actual document' } });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom Actual document Actual document');
		const custom = fixture.componentInstance.componentRef?.instance as CustomFileViewComponent;
		expect(Object.isFrozen(custom.layoutContext?.document)).toBeTrue();
	});

	it('recovers from a disabled no-ref layout when the selected type changes', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeViewerComponent],
			providers: [
				...legacyTestProviders(),
				provideDefaultDocumentLayouts(),
				provideDocumentLayoutExtensions({
					id: 'disable.file',
					overrides: [{ id: 'default.document-layout.file.view', disabled: true }],
				}),
				provideDocumentLayoutExtensions({
					id: 'note.view',
					layouts: [
						{
							id: 'note.custom.view',
							documentType: 'Note',
							mode: 'view',
							component: CustomFileViewComponent,
							priority: 10,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeViewerComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('data', { document: { title: 'disabled' } });
		fixture.detectChanges();
		expect(fixture.componentInstance.componentRef).toBeUndefined();
		fixture.componentRef.setInput('documentType', 'Note');
		fixture.componentRef.setInput('data', { document: { title: 'recovered' } });
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom recovered recovered');
	});

	it('mounts nothing for a view layout without a layoutContext input', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentTypeViewerComponent],
			providers: [
				...legacyTestProviders(),
				provideDocumentLayoutExtensions({
					id: 'client.no-context-view',
					layouts: [
						{
							id: 'client.file.no-context-view',
							documentType: 'File',
							mode: 'view',
							component: NoContextViewComponent,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentTypeViewerComponent);
		fixture.componentRef.setInput('documentType', 'File');
		fixture.componentRef.setInput('data', { document: { title: 'hidden' } });
		fixture.detectChanges();
		expect(fixture.componentInstance.componentRef).toBeUndefined();
		expect(fixture.nativeElement.textContent).not.toContain('no context');
	});
});
