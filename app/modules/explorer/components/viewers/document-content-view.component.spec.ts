import { Component, Input, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
	defineContribution,
	DOCUMENT_INFO_BAR_SLOT,
	DocumentLayoutContext,
	DocumentLayoutRegistry,
	DocumentViewContext,
	ExtensionRegistry,
} from '@maretha/webui-sdk';
import { EMPTY, Subject } from 'rxjs';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentViewerRegistryService } from './document-viewer-registry.service';
import { DocumentContentViewComponent } from './document-content-view.component';

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		"<output>custom {{ scope?.document?.['uid'] }} {{ scope?.document?.['title'] }}</output>",
})
class CustomFileViewComponent {
	// eslint-disable-next-line @angular-eslint/no-input-rename -- verifies the documented legacy layoutContext alias.
	@Input('layoutContext') scope?: DocumentLayoutContext;
}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<output>fallback {{ document?.uid }}</output>',
})
class FallbackViewComponent {
	@Input() document: any;
}
@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template:
		'<output>notice {{ context()?.document?.uid }} {{ context()?.loading }} {{ context()?.searchActive }}</output>',
})
class NoticeComponent {
	readonly context = input<any>();
}

describe('DocumentContentViewComponent', () => {
	let fixture: ComponentFixture<DocumentContentViewComponent>;
	let layouts: DocumentLayoutRegistry;
	const fetching = new Subject<string | null>();
	const searchPane = signal(false);
	const context = (uid: string): DocumentViewContext => ({
		document: { uid, type: 'File', ng: { isFolder: false } },
		noEdit: false,
	});

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentContentViewComponent],
			providers: [
				{
					provide: DocumentViewerRegistryService,
					useValue: { getComponent: () => FallbackViewComponent },
				},
				{
					provide: DocumentsManagerService,
					useValue: {
						fetchingDocument$: fetching,
						documentFetched$: EMPTY,
						documentsUpdated$: EMPTY,
					},
				},
				{ provide: DocumentSearchService, useValue: { searchPaneVisibility: searchPane } },
			],
		}).compileComponents();
		layouts = TestBed.inject(DocumentLayoutRegistry);
		fixture = TestBed.createComponent(DocumentContentViewComponent);
	});

	it('mounts a runtime File view on the routed content outlet and recovers after disable/dispose', () => {
		const dispose = layouts.register({
			id: 'client.file-view',
			layouts: [
				{
					id: 'client.file.view',
					documentType: 'File',
					mode: 'view',
					component: CustomFileViewComponent,
				},
			],
		});
		fixture.componentRef.setInput('context', context('one'));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom one');
		const disable = layouts.register({
			id: 'client.disable-file-view',
			overrides: [{ id: 'client.file.view', disabled: true }],
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent.trim()).toBe('');
		disable();
		fixture.componentRef.setInput('context', context('two'));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom two');
		dispose();
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('fallback two');
	});

	it('opens with the document info bar, as stock nuxeo-document-page does', () => {
		searchPane.set(false);
		TestBed.inject(ExtensionRegistry).register({
			id: 'client.notices',
			contributions: [
				defineContribution(DOCUMENT_INFO_BAR_SLOT, {
					id: 'client.notice',
					component: NoticeComponent,
				}),
			],
		});
		fixture.componentRef.setInput('context', context('one'));
		fixture.detectChanges();
		const host = fixture.nativeElement as HTMLElement;
		expect(host.firstElementChild?.tagName.toLowerCase()).toBe('nx-webui-slot');
		expect(host.textContent).toContain('notice one false false');
		expect(host.textContent).toContain('fallback one');
		fetching.next('one');
		searchPane.set(true);
		fixture.detectChanges();
		expect(host.textContent).toContain('notice one true true');
	});

	it('applies a view layout to a folder route too', () => {
		layouts.register({
			id: 'client.folder-view',
			layouts: [
				{
					id: 'client.folder.view',
					documentType: 'Folder',
					mode: 'view',
					component: CustomFileViewComponent,
				},
			],
		});
		fixture.componentRef.setInput('context', {
			document: { uid: 'folder', type: 'Folder', ng: { isFolder: true } },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom folder');
	});

	it('updates the immutable layout context for a same-uid document refresh', () => {
		layouts.register({
			id: 'client.file-view',
			layouts: [
				{
					id: 'client.file.view',
					documentType: 'File',
					mode: 'view',
					component: CustomFileViewComponent,
				},
			],
		});
		fixture.componentRef.setInput('context', {
			document: { uid: 'same', type: 'File', title: 'Before', ng: { isFolder: false } },
			noEdit: false,
		});
		fixture.detectChanges();
		fixture.componentRef.setInput('context', {
			document: { uid: 'same', type: 'File', title: 'After', ng: { isFolder: false } },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('custom same After');
		expect(fixture.nativeElement.textContent).not.toContain('custom same Before');
	});
	it('marks the info bar busy while a document fetch is in flight and idle once it lands', () => {
		const fetched = new Subject<unknown>();
		TestBed.resetTestingModule();
		TestBed.configureTestingModule({
			imports: [DocumentContentViewComponent],
			providers: [
				{
					provide: DocumentViewerRegistryService,
					useValue: { getComponent: () => FallbackViewComponent },
				},
				{
					provide: DocumentsManagerService,
					useValue: {
						fetchingDocument$: fetching,
						documentFetched$: fetched,
						documentsUpdated$: EMPTY,
					},
				},
				{ provide: DocumentSearchService, useValue: { searchPaneVisibility: searchPane } },
			],
		});
		fixture = TestBed.createComponent(DocumentContentViewComponent);
		fixture.componentRef.setInput('context', context('one'));
		fixture.detectChanges();
		expect(fixture.componentInstance.infoBarContext().loading).toBeFalse();
		fetching.next('one');
		expect(fixture.componentInstance.infoBarContext().loading).toBeTrue();
		fetched.next({ uid: 'one' });
		expect(fixture.componentInstance.infoBarContext().loading).toBeFalse();
		expect(fixture.componentInstance.infoBarContext().document?.['uid']).toBe('one');
	});
});
