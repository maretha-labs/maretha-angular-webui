import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faBookmark, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { EMPTY, of, Subject } from 'rxjs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CompareVersionsActionComponent } from './compare-versions-action.component';
import {
	WebUiMessages,
	defineContribution,
	DOCUMENT_ACTIONS_SLOT,
	DocumentActionContext,
	ExtensionRegistry,
	POLYMER_SLOTS,
} from '@maretha/webui-sdk';
import { DocumentAttachmentsService } from '../../../helpers/document-attachments.service';
import { DocumentClipboardService } from '../../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../../helpers/document-collections.service';
import { DocumentTrashService } from '../../../helpers/document-trash.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { DocumentInfoComponent } from '../../document-info/document-info.component';
import { POLYMER_MESSAGES } from 'app/extensions/polymer-messages.generated';
import { provideDefaultDocumentActions } from './default-document-actions';
import { DocumentActionsToolbarComponent } from './document-actions-toolbar.component';

@Component({
	selector: 'nx-client-toolbar-action',
	template:
		'<button type="button" class="client-action">Review {{context().document?.["title"]}}</button>',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
class ClientToolbarActionComponent {
	readonly context = input.required<DocumentActionContext>();
}

describe('DocumentActionsToolbarComponent extension integration', () => {
	let fixture: ComponentFixture<DocumentActionsToolbarComponent>;
	let registry: ExtensionRegistry;
	let modalService: jasmine.SpyObj<BsModalService>;
	const document = {
		uid: 'contract-001',
		title: 'Master services agreement',
		type: 'File',
		isTrashed: false,
		ng: { canWrite: true, collections: {}, facets: {} },
	};

	async function settle(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();
	}

	function infoButton(): HTMLButtonElement | null {
		return fixture.nativeElement.querySelector('button[aria-label="Show document information"]');
	}

	beforeEach(async () => {
		modalService = jasmine.createSpyObj<BsModalService>('BsModalService', ['show']);
		await TestBed.configureTestingModule({
			imports: [DocumentActionsToolbarComponent, TranslateModule.forRoot()],
			providers: [
				provideNoopAnimations(),
				provideDefaultDocumentActions(),
				{ provide: Router, useValue: { events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { snapshot: { url: [] } } },
				{ provide: BsModalService, useValue: modalService },
				{ provide: ToastrService, useValue: {} },
				{ provide: DocumentTrashService, useValue: {} },
				{ provide: DocumentClipboardService, useValue: {} },
				{ provide: DocumentAttachmentsService, useValue: {} },
				{ provide: DocumentCollectionsService, useValue: { documentsAddedToCollection$: EMPTY } },
				{ provide: DocumentsManagerService, useValue: { documentFetched$: EMPTY } },
			],
		}).compileComponents();

		TestBed.inject(FaIconLibrary).addIcons(faBookmark, faEllipsisV);
		registry = TestBed.inject(ExtensionRegistry);
		fixture = TestBed.createComponent(DocumentActionsToolbarComponent);
		fixture.componentRef.setInput('document', document);
		await settle();
	});

	it('renders the public default inside the real toolbar and opens the document information dialog', () => {
		expect(
			fixture.nativeElement.querySelector('nx-webui-slot nx-document-info-action'),
		).not.toBeNull();
		expect(infoButton()).not.toBeNull();
		infoButton()!.click();
		expect(modalService.show).toHaveBeenCalledWith(
			DocumentInfoComponent,
			jasmine.objectContaining({
				initialState: jasmine.objectContaining({ document }),
				class: 'modal-lg',
			}),
		);
		const layoutContext = (modalService.show.calls.mostRecent().args[1] as any).initialState
			.layoutContext;
		expect(layoutContext).toEqual(
			jasmine.objectContaining({ documentType: 'file', mode: 'metadata', document }),
		);
		expect(Object.isFrozen(layoutContext)).toBeTrue();
	});

	it('passes the latest document from the actual toolbar input to the existing action', async () => {
		const nextDocument = {
			...document,
			uid: 'contract-002',
			title: 'Service renewal agreement',
			ng: { ...document.ng },
		};
		fixture.componentRef.setInput('document', nextDocument);
		await settle();
		infoButton()!.click();
		expect(modalService.show).toHaveBeenCalledWith(
			DocumentInfoComponent,
			jasmine.objectContaining({
				initialState: jasmine.objectContaining({ document: nextDocument }),
				class: 'modal-lg',
			}),
		);
		expect(
			(modalService.show.calls.mostRecent().args[1] as any).initialState.layoutContext.document.uid,
		).toBe('contract-002');
	});

	it('keeps context identity stable between checks and updates it when toolbar inputs change', async () => {
		const initialContext = fixture.componentInstance.actionContext;
		await settle();
		expect(fixture.componentInstance.actionContext).toBe(initialContext);
		const nextDocument = { ...document, uid: 'contract-003', title: 'Statement of work' };
		fixture.componentRef.setInput('document', nextDocument);
		await settle();
		const updatedContext = fixture.componentInstance.actionContext;
		expect(updatedContext).not.toBe(initialContext);
		expect(updatedContext.document).toBe(nextDocument);
		fixture.componentRef.setInput('noEdit', true);
		await settle();
		expect(fixture.componentInstance.actionContext).not.toBe(updatedContext);
		expect(fixture.componentInstance.actionContext.noEdit).toBeTrue();
		expect(fixture.componentInstance.actionContext.document).toBe(nextDocument);
	});

	it('hides the default action when the real toolbar switches to no-edit mode', async () => {
		fixture.componentRef.setInput('noEdit', true);
		await settle();
		expect(infoButton()).toBeNull();
		expect(fixture.nativeElement.querySelector('nx-webui-slot')).not.toBeNull();
		expect(modalService.show).not.toHaveBeenCalled();
	});

	it('uses one accessible More actions trigger in compact result cells', async () => {
		fixture.componentRef.setInput('compact', true);
		await settle();
		const trigger = fixture.nativeElement.querySelector(
			'.document-actions__more',
		) as HTMLButtonElement;
		expect(trigger.getAttribute('aria-label')).toBe('More actions');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(fixture.nativeElement.querySelector('nx-webui-slot')).toBeNull();
		trigger.click();
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(globalThis.document.body.querySelector('nx-document-info-action')).not.toBeNull();
		globalThis.document.body
			.querySelector('.document-actions__menu')
			?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(globalThis.document.body.querySelector('nx-document-info-action')).toBeNull();
	});

	it('shows no More actions trigger when nothing would be listed, as stock does on a trashed document', async () => {
		fixture.componentRef.setInput('document', {
			...document,
			isTrashed: true,
			ng: { ...document.ng },
		});
		fixture.componentRef.setInput('primary', true);
		fixture.componentRef.setInput('referenceLayout', true);
		await settle();
		expect(fixture.nativeElement.querySelector('.document-actions__more')).toBeNull();
		fixture.componentRef.setInput('referenceLayout', false);
		await settle();
		expect(fixture.nativeElement.querySelector('.document-actions__more')).not.toBeNull();
	});

	it('keeps the More trigger and never flattens the toolbar when a stock-only folder has menu items but no extra ones', async () => {
		fixture.componentRef.setInput('document', {
			...document,
			type: 'Folder',
			ng: { ...document.ng, isFolder: true },
		});
		fixture.componentRef.setInput('primary', true);
		fixture.componentRef.setInput('referenceLayout', true);
		await settle();
		expect(fixture.nativeElement.querySelector('.document-actions__more')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.document-actions > nx-webui-slot')).toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain('Export XML');
	});

	it('keeps contributed document actions visible in the standard primary toolbar without duplicating them in overflow', async () => {
		registry.register({
			id: 'client.primary-toolbar',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'client.review',
					order: 0,
					component: ClientToolbarActionComponent,
				}),
			],
		});
		fixture.componentRef.setInput('primary', true);
		fixture.componentRef.setInput('referenceLayout', true);
		await settle();
		expect(
			fixture.nativeElement.querySelector('.document-actions__primary .client-action')?.textContent,
		).toContain('Master services agreement');
		fixture.componentInstance.toggleActions();
		await settle();
		expect(
			globalThis.document.body.querySelectorAll('.document-actions__menu .client-action').length,
		).toBe(0);
	});

	it('removes and restores the rendered default through a client override', async () => {
		const dispose = registry.register({
			id: 'client.toolbar',
			overrides: [
				{ slot: POLYMER_SLOTS.DOCUMENT_ACTIONS, id: 'maretha.document.info', disabled: true },
			],
		});
		await settle();
		expect(infoButton()).toBeNull();
		dispose();
		await settle();
		expect(infoButton()).not.toBeNull();
	});

	it('renders a client replacement using the same slot and document context', async () => {
		const dispose = registry.register({
			id: 'client.toolbar',
			contributions: [
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: 'maretha.document.info',
					component: ClientToolbarActionComponent,
				}),
			],
		});
		await settle();
		expect(infoButton()).toBeNull();
		expect(fixture.nativeElement.querySelector('nx-webui-slot .client-action').textContent).toBe(
			'Review Master services agreement',
		);
		dispose();
		await settle();
		expect(fixture.nativeElement.querySelector('.client-action')).toBeNull();
		expect(infoButton())
			.withContext(fixture.nativeElement.querySelector('nx-webui-slot').innerHTML)
			.not.toBeNull();
	});
});

describe('DocumentActionsToolbarComponent standard header', () => {
	it('renders compare versions through DOCUMENT_ACTIONS and lets a client disable it', async () => {
		await TestBed.configureTestingModule({
			imports: [DocumentActionsToolbarComponent, TranslateModule.forRoot()],
			providers: [
				provideNoopAnimations(),
				provideHttpClient(),
				provideHttpClientTesting(),
				provideDefaultDocumentActions(),
				{ provide: BreakpointObserver, useValue: { observe: () => of({ matches: false }) } },
				{ provide: Router, useValue: { events: EMPTY } },
				{ provide: ActivatedRoute, useValue: { snapshot: { url: [] } } },
				{ provide: BsModalService, useValue: {} },
				{ provide: ToastrService, useValue: {} },
				{ provide: DocumentTrashService, useValue: {} },
				{ provide: DocumentClipboardService, useValue: {} },
				{ provide: DocumentAttachmentsService, useValue: {} },
				{ provide: DocumentCollectionsService, useValue: { documentsAddedToCollection$: EMPTY } },
				{ provide: DocumentsManagerService, useValue: { documentFetched$: EMPTY } },
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(DocumentActionsToolbarComponent);
		const settle = async () => {
			fixture.detectChanges();
			await fixture.whenStable();
			await new Promise<void>((resolve) => setTimeout(resolve, 0));
			fixture.detectChanges();
		};
		const compare = () =>
			fixture.nativeElement.querySelector(
				'.document-actions__primary nx-webui-slot nx-compare-versions-action button',
			);
		fixture.componentRef.setInput('primary', true);
		fixture.componentRef.setInput('referenceLayout', true);
		fixture.componentRef.setInput('document', {
			uid: 'contract-001',
			type: 'File',
			properties: { 'uid:major_version': 1, 'uid:minor_version': 0 },
			ng: { canWrite: true, collections: {}, facets: {} },
		});
		await settle();
		expect(compare()?.getAttribute('aria-label')).toBe('Compare Versions');
		const dispose = TestBed.inject(ExtensionRegistry).register({
			id: 'client.toolbar',
			overrides: [
				{
					slot: POLYMER_SLOTS.DOCUMENT_ACTIONS,
					id: 'maretha.document.compare-versions',
					disabled: true,
				},
			],
		});
		await settle();
		expect(compare()).toBeNull();
		dispose();
		await settle();
		expect(compare()).not.toBeNull();
	});
});

describe('CompareVersionsActionComponent', () => {
	let fixture: ComponentFixture<CompareVersionsActionComponent>;
	let http: HttpTestingController;
	let router: jasmine.SpyObj<Router>;
	const version = (uid: string, minor: number) => ({
		uid,
		repository: 'archive',
		properties: { 'uid:major_version': 0, 'uid:minor_version': minor },
	});
	beforeEach(() => {
		router = jasmine.createSpyObj<Router>('Router', ['navigate']);
		router.navigate.and.resolveTo(true);
		TestBed.configureTestingModule({
			imports: [CompareVersionsActionComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: Router, useValue: router },
			],
		});
		fixture = TestBed.createComponent(CompareVersionsActionComponent);
		http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('context', { document: version('working', 2), noEdit: false });
		fixture.detectChanges();
	});
	afterEach(() => http.verify());
	it('relocalizes retained no-version and transport failures without repeating the request', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('versions-test', {
			fr: {
				'versionsDiffButton.nothingToCompare': 'Aucune autre version.',
				'app.state.unable-to-load-versions-please-try-again-e20f81': 'Versions indisponibles.',
			},
		});
		const pending = fixture.componentInstance.compare();
		http
			.expectOne((r) => r.url.endsWith('/automation/Document.GetVersions'))
			.flush({ entries: [] });
		await pending;
		expect(fixture.componentInstance.message()).toContain('no other versions');
		messages.locale.set('fr');
		expect(fixture.componentInstance.message()).toBe('Aucune autre version.');
		const retry = fixture.componentInstance.compare();
		http
			.expectOne((r) => r.url.endsWith('/automation/Document.GetVersions'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		await retry;
		expect(fixture.componentInstance.message()).toBe('Versions indisponibles.');
		messages.locale.set('en-US');
		expect(fixture.componentInstance.message()).toContain('Unable to load versions');
		expect(router.navigate).not.toHaveBeenCalled();
	});

	it('opens the preceding version on the left and current version on the right in the same repository', async () => {
		const pending = fixture.componentInstance.compare();
		const request = http.expectOne((r) => r.url.endsWith('/automation/Document.GetVersions'));
		expect(request.request.headers.get('X-NXRepository')).toBe('archive');
		expect(request.request.body.input).toBe('working');
		request.flush({ entries: [version('v1', 1), version('v2', 2), version('v3', 3)] });
		await pending;
		expect(router.navigate).toHaveBeenCalledWith(['/page/compare'], {
			queryParams: { left: 'v3', right: 'v2', ids: 'v2,v3,v1', repository: 'archive' },
		});
	});
	it('ignores an unversioned document and compares a checked-out working copy first', async () => {
		fixture.componentRef.setInput('context', {
			document: { uid: 'draft', properties: { 'uid:major_version': 0, 'uid:minor_version': 0 } },
			noEdit: false,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('button')).toBeNull();
		await fixture.componentInstance.compare();
		http.expectNone((r) => r.url.endsWith('/automation/Document.GetVersions'));
		const working = {
			uid: 'working',
			isCheckedOut: true,
			properties: { 'uid:major_version': 1, 'uid:minor_version': 0 },
		};
		fixture.componentRef.setInput('context', { document: working, noEdit: false });
		fixture.detectChanges();
		const pending = fixture.componentInstance.compare();
		const request = http.expectOne((r) => r.url.endsWith('/automation/Document.GetVersions'));
		expect(request.request.headers.get('X-NXRepository')).toBe('default');
		request.flush({ entries: [{ uid: 'v1', properties: working.properties }] });
		await pending;
		expect(router.navigate).toHaveBeenCalledWith(['/page/compare'], {
			queryParams: { left: 'v1', right: 'working', ids: 'working,v1', repository: 'default' },
		});
	});
	it('does not navigate when a versions response belongs to the previous repository', async () => {
		const pending = fixture.componentInstance.compare();
		const request = http.expectOne((r) => r.url.endsWith('/automation/Document.GetVersions'));
		fixture.componentRef.setInput('context', {
			document: { ...version('working', 2), repository: 'default' },
			noEdit: false,
		});
		fixture.detectChanges();
		request.flush({ entries: [version('v1', 1), version('v2', 2)] });
		await pending;
		expect(router.navigate).not.toHaveBeenCalled();
	});
});

describe('DocumentExportComponent, DocumentCommandComponent, and DocumentActionsToolbar interactions', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [DocumentActionsToolbarComponent],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				provideDefaultDocumentActions(),
				{ provide: ActivatedRoute, useValue: { snapshot: { url: [] } } },
				{
					provide: DocumentAttachmentsService,
					useValue: {
						exportAsPdf: jasmine.createSpy('exportAsPdf').and.returnValue(of(undefined)),
						exportAsXml: jasmine.createSpy('exportAsXml').and.returnValue(of(undefined)),
						exportAsZip: jasmine.createSpy('exportAsZip').and.returnValue(of(undefined)),
					},
				},
				{ provide: Router, useValue: { events: new Subject<any>() } },
				{ provide: DocumentsManagerService, useValue: { documentFetched$: new Subject<any>() } },
				{ provide: BsModalService, useValue: {} },
				{ provide: DocumentTrashService, useValue: {} },
				{ provide: DocumentClipboardService, useValue: {} },
				{ provide: DocumentCollectionsService, useValue: { documentsAddedToCollection$: EMPTY } },
			],
		});
	});

	it('lists the server renditions as stock download links, hiding the conversions, and dispatches completion when closed', async () => {
		const { DocumentExportComponent } = await import('./document-export.component');
		TestBed.inject(WebUiMessages).register('baseline', POLYMER_MESSAGES);
		const expFixture = TestBed.createComponent(DocumentExportComponent);
		const renditions = [
			{ name: 'thumbnail', kind: 'nuxeo:thumbnail', icon: '/icons/image.png', url: '/r/thumbnail' },
			{ name: 'pdf', kind: 'nuxeo:pdf', icon: '/icons/pdf.png', url: '/r/pdf' },
			{ name: 'zipExport', kind: 'nuxeo:zip', icon: '/icons/zip.png', url: '/r/zipExport' },
			{ name: 'xmlExport', kind: 'nuxeo:xml', icon: '/icons/xml.png', url: '/r/xmlExport' },
			{ name: 'Small', kind: 'nuxeo:picture:conversion', url: '/r/Small' },
			{ name: 'mp4', kind: 'nuxeo:video:conversion', url: '/r/mp4' },
		];
		const doc = {
			uid: 'doc-1',
			type: 'File',
			ng: {
				exportUrlForPdf: '/r/pdf',
				exportUrlForXml: '/r/xmlExport',
				exportUrlForZip: '/r/zipExport',
			},
			contextParameters: { permissions: ['Read'], renditions },
		};
		expFixture.componentRef.setInput('context', { document: doc, noEdit: false });
		expFixture.detectChanges();
		expect(expFixture.componentInstance.renditions().map((r) => r.name)).toEqual([
			'thumbnail',
			'pdf',
			'zipExport',
			'xmlExport',
		]);
		const links = Array.from(
			expFixture.nativeElement.querySelectorAll('dialog a') as NodeListOf<HTMLAnchorElement>,
		);
		expect(links.map((a) => a.textContent?.trim())).toEqual([
			'Thumbnail',
			'PDF',
			'ZIP Export',
			'XML Export',
		]);
		expect(links.map((a) => a.getAttribute('href'))).toEqual([
			'/r/thumbnail',
			'/r/pdf',
			'/r/zipExport',
			'/r/xmlExport',
		]);
		expect(links.every((a) => a.hasAttribute('download'))).toBeTrue();
		let completed = false;
		expFixture.nativeElement.addEventListener('document-action-complete', () => (completed = true));
		expFixture.componentInstance.closed();
		expect(completed).toBeTrue();
	});

	it('resolves state-specific command labels', async () => {
		const { DocumentCommandComponent } = await import('./document-command.component');
		const cmdFixture = TestBed.createComponent(DocumentCommandComponent);
		for (const [cmd, docProps, expectedLabel, expectedIcon] of [
			[
				'favorite',
				{ contextParameters: { favorites: { isFavorite: true } } },
				'Remove from favorites',
				'nuxeo:favorites',
			],
			[
				'notifications',
				{ ng: { canNotify: true } },
				'Unsubscribe from notifications',
				'nuxeo:notify',
			],
			['restore', { isTrashed: true }, 'Untrash document', 'nuxeo:restore-deleted'],
			['purge', { isTrashed: true }, 'Delete document permanently', 'nuxeo:delete-permanently'],
			['lock', { lockOwner: 'alice' }, 'Unlock document', 'nuxeo:lock'],
		] as const) {
			cmdFixture.componentRef.setInput('command', cmd);
			cmdFixture.componentRef.setInput('context', {
				document: { uid: 'doc-1', ...docProps },
				noEdit: false,
			});
			cmdFixture.detectChanges();
			expect(cmdFixture.componentInstance.label()).toBe(expectedLabel);
			expect(cmdFixture.componentInstance.icon()).toBe(expectedIcon);
		}
	});

	it('resolves default document action contributions and navigates compact overflow menu items by keyboard', async () => {
		const registry = TestBed.inject(ExtensionRegistry);
		const resolved = registry.resolve(DOCUMENT_ACTIONS_SLOT.name, {
			document: {
				uid: 'folder-1',
				type: 'Folder',
				facets: ['Publishable'],
				ng: { isFolder: true },
				contextParameters: { hasContent: true, permissions: ['Read', 'AddChildren', 'Write'] },
			},
			noEdit: false,
			standardHeaderActions: true,
		});
		expect(resolved.items.map((item) => item.id)).toContain('maretha.document.favorite');
		expect(resolved.items.map((item) => item.id)).toContain('maretha.document.download-folder');
		for (const item of resolved.items) {
			expect(typeof (await item.loadComponent?.())).toBe('function');
		}

		const tbFixture = TestBed.createComponent(DocumentActionsToolbarComponent);
		tbFixture.componentRef.setInput('document', {
			uid: 'folder-1',
			type: 'Folder',
			ng: { isFolder: true },
		});
		tbFixture.detectChanges();
		expect(tbFixture.componentInstance.orderedMenuIds).not.toContain('maretha.document.lock');
		expect(tbFixture.componentInstance.referenceExcludedIds).toContain('maretha.document.info');
		tbFixture.componentInstance.toggleActions();
		expect(tbFixture.componentInstance.menuOpen()).toBeTrue();
		tbFixture.componentInstance.focusActions();
		const hidden = new Subject<void>();
		tbFixture.componentInstance.dialogOpened(
			new CustomEvent('document-action-opened', { detail: { onHidden: hidden } }),
		);
		hidden.next();
		expect(tbFixture.componentInstance.menuOpen()).toBeFalse();
		tbFixture.componentInstance.toggleActions();
		const btn1 = document.createElement('button');
		const btn2 = document.createElement('button');
		const container = document.createElement('div');
		const outlet = document.createElement('nx-contribution-outlet');
		const inner = document.createElement('div');
		inner.append(btn1, btn2);
		outlet.append(inner);
		container.append(outlet);
		document.body.append(container);
		(tbFixture.componentInstance as any).compactMenu = { nativeElement: container };
		for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']) {
			const ev = new KeyboardEvent('keydown', { key, cancelable: true });
			Object.defineProperty(ev, 'target', { value: btn1 });
			tbFixture.componentInstance.onOverlayKeydown(ev);
		}
		container.remove();
		expect(tbFixture.componentInstance.menuOpen()).toBeFalse();
	});
});
