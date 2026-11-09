import { StandardContentMetadataComponent } from '../standard-content-metadata.component';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BsModalService } from 'ngx-bootstrap/modal';
import {
	DOCUMENT_LAYOUT_HOST,
	DocumentActionContext,
	provideDocumentLayoutExtensions,
	SuggestionScope,
} from '@maretha/webui-sdk';
import { DocumentInfoComponent } from '../../document-info/document-info.component';
import { provideDefaultDocumentLayouts } from '../../default-document-layouts';
import { DocumentInfoActionComponent } from './document-info-action.component';
import {
	FALLBACK_METADATA_LAYOUT_ID,
	resetFallbackMetadataLayoutReports,
} from '../../../helpers/fallback-document-layouts';

describe('DocumentInfoActionComponent', () => {
	let fixture: ComponentFixture<DocumentInfoActionComponent>;
	let modalService: jasmine.SpyObj<BsModalService>;
	const document = { uid: 'document-1', title: 'Contract', ng: {} };

	function setContext(context: DocumentActionContext): void {
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
	}

	beforeEach(async () => {
		modalService = jasmine.createSpyObj<BsModalService>('BsModalService', ['show']);
		await TestBed.configureTestingModule({
			imports: [DocumentInfoActionComponent],
			providers: [
				{ provide: BsModalService, useValue: modalService },
				provideDefaultDocumentLayouts(),
			],
		}).compileComponents();
		fixture = TestBed.createComponent(DocumentInfoActionComponent);
	});

	it('opens the existing information dialog with the current document', () => {
		setContext({ document, noEdit: false });
		const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
		expect(button.getAttribute('aria-label')).toBe('Show document information');
		button.click();

		expect(modalService.show).toHaveBeenCalledWith(
			DocumentInfoComponent,
			jasmine.objectContaining({
				initialState: jasmine.objectContaining({ document }),
				class: 'modal-lg',
				providers: [
					jasmine.objectContaining({ provide: DOCUMENT_LAYOUT_HOST }),
					jasmine.objectContaining({ provide: SuggestionScope }),
				],
			}),
		);
		const context = (modalService.show.calls.mostRecent().args[1] as any)?.initialState
			.layoutContext;
		expect(context.documentType).toBeNull();
		expect(context.mode).toBe('metadata');
	});

	it('updates the modal context when the viewed document changes', () => {
		setContext({ document, noEdit: false });
		const nextDocument = { uid: 'document-2', title: 'Revised contract', ng: {} };
		setContext({ document: nextDocument, noEdit: false });
		fixture.nativeElement.querySelector('button').click();

		expect(modalService.show).toHaveBeenCalledWith(
			DocumentInfoComponent,
			jasmine.objectContaining({
				initialState: jasmine.objectContaining({ document: nextDocument }),
				class: 'modal-lg',
			}),
		);
	});

	it('hides the action in no-edit mode and guards direct invocation', () => {
		setContext({ document, noEdit: false });
		setContext({ document, noEdit: true });

		expect(fixture.nativeElement.querySelector('button')).toBeNull();
		fixture.componentInstance.showDocumentInfo();
		expect(modalService.show).not.toHaveBeenCalled();
	});

	it('does not offer an action for a missing or unprepared document', () => {
		for (const unavailable of [null, { uid: 'document-1' }]) {
			setContext({ document: unavailable, noEdit: false });
			expect(fixture.nativeElement.querySelector('button')).toBeNull();
			fixture.componentInstance.showDocumentInfo();
		}
		expect(modalService.show).not.toHaveBeenCalled();
	});

	it('mounts the registered source metadata leaf and scopes each new document', () => {
		const picture = { ...document, type: 'Picture', properties: { 'dc:title': 'Picture one' } };
		setContext({ document: picture, noEdit: false });
		fixture.nativeElement.querySelector('button').click();
		expect(modalService.show).toHaveBeenCalledWith(
			StandardContentMetadataComponent,
			jasmine.objectContaining({ initialState: jasmine.objectContaining({ document: picture }) }),
		);
		const next = { ...picture, uid: 'document-2', properties: { 'dc:title': 'Picture two' } };
		setContext({ document: next, noEdit: false });
		fixture.nativeElement.querySelector('button').click();
		expect((modalService.show.calls.mostRecent().args[1] as any).initialState.document).toBe(next);
	});
	it('tells developers once when the wildcard metadata layout serves an unregistered type', () => {
		resetFallbackMetadataLayoutReports();
		const info = spyOn(console, 'info');
		const custom = { uid: 'custom-1', type: 'CoverageContract', ng: {} };
		setContext({ document: custom, noEdit: false });
		fixture.nativeElement.querySelector('button').click();
		fixture.nativeElement.querySelector('button').click();
		expect(modalService.show).toHaveBeenCalledTimes(2);
		expect(info).toHaveBeenCalledTimes(1);
		expect(info.calls.mostRecent().args[0]).toContain('"CoverageContract"');
		expect(info.calls.mostRecent().args[0]).toContain(FALLBACK_METADATA_LAYOUT_ID);
		const context = (modalService.show.calls.mostRecent().args[1] as any).initialState
			.layoutContext;
		expect(context.documentType).toBe('coveragecontract');
	});
});

describe('DocumentInfoActionComponent metadata layout dispositions', () => {
	it('honors a client metadata override and a disabled default', async () => {
		const modal = jasmine.createSpyObj<BsModalService>('BsModalService', ['show']);
		await TestBed.configureTestingModule({
			imports: [DocumentInfoActionComponent],
			providers: [
				{ provide: BsModalService, useValue: modal },
				provideDefaultDocumentLayouts(),
				provideDocumentLayoutExtensions({
					id: 'client.metadata-disposition',
					overrides: [{ id: 'default.document-layout.file.metadata', disabled: true }],
					layouts: [
						{
							id: 'client.picture.metadata',
							documentType: 'Picture',
							mode: 'metadata',
							component: DocumentInfoComponent,
							priority: 10,
						},
					],
				}),
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentInfoActionComponent);
		fixture.componentRef.setInput('context', {
			document: { uid: 'picture', type: 'Picture', ng: {} },
			noEdit: false,
		});
		fixture.detectChanges();
		fixture.nativeElement.querySelector('button').click();
		expect(modal.show).toHaveBeenCalledWith(DocumentInfoComponent, jasmine.anything());
		fixture.componentRef.setInput('context', {
			document: { uid: 'file', type: 'File', ng: {} },
			noEdit: false,
		});
		fixture.detectChanges();
		fixture.nativeElement.querySelector('button').click();
		expect(modal.show).toHaveBeenCalledTimes(1);
	});
});
