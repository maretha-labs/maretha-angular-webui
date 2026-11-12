import { NgComponentOutlet } from '@angular/common';
import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { EMPTY, of, Subject, throwError } from 'rxjs';
import { ToastService } from 'app/helpers/toast.service';
import { defineDocumentView, DocumentViewContext, ExtensionRegistry } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { DocumentContentViewComponent } from '../document-content-view.component';
import { DocumentViewerRegistryService } from '../document-viewer-registry.service';
import { provideDefaultDocumentViews } from '../default-document-views';
import { GenericTypeViewerComponent } from './generic-type-viewer.component';
import { DocumentPermissionsViewComponent } from '../document-permissions-view.component';
import { StandardDocumentPermissionsViewComponent } from '../standard-document-permissions-view.component';
import { DocumentHistoryViewComponent } from '../document-history-view.component';

@Component({
	selector: 'nx-test-type-renderer',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Existing renderer {{document()["uid"]}}',
})
class TypeRenderer {
	readonly document = input.required<Record<string, unknown>>();
}
@Component({
	selector: 'nx-generic-folderish-viewer',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Folder results {{document()["uid"]}}',
})
class FolderRenderer {
	readonly document = input.required<Record<string, unknown>>();
}
@Component({
	selector: 'nx-test-contract-view',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: 'Contract {{context().document?.["title"]}}',
})
class ContractView {
	readonly context = input.required<DocumentViewContext>();
}

describe('GenericTypeViewerComponent paired view integration', () => {
	let fixture: ComponentFixture<GenericTypeViewerComponent>;
	let registry: ExtensionRegistry;
	let params: Subject<ParamMap>;
	let route: { queryParamMap: Subject<ParamMap>; snapshot: { queryParamMap: ParamMap } };
	let navigate: jasmine.Spy;
	let renderer: jasmine.Spy;
	let manager: {
		fetchingDocument$: Subject<unknown>;
		documentFetched$: Subject<unknown>;
		documentsUpdated$: Subject<unknown>;
		documentInfo: any;
		reloadDocument: jasmine.Spy;
		toggleLock: jasmine.Spy;
	};
	let toastr: { error: jasmine.Spy };
	const userInfo = signal<{ id: string } | null>(null);
	const document = {
		uid: 'contract-1',
		type: 'Contract',
		title: 'Master agreement',
		ng: { isFolder: false },
		contextParameters: {},
	};
	async function settle(): Promise<void> {
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		fixture.detectChanges();
	}
	function routeView(view: string): void {
		const value = convertToParamMap({ view });
		route.snapshot.queryParamMap = value;
		params.next(value);
	}
	beforeEach(async () => {
		params = new Subject<ParamMap>();
		route = {
			queryParamMap: params,
			snapshot: { queryParamMap: convertToParamMap({ view: 'view' }) },
		};
		navigate = jasmine.createSpy('navigate').and.resolveTo(true);
		renderer = jasmine.createSpy('getComponent').and.returnValue(TypeRenderer);
		manager = {
			fetchingDocument$: new Subject(),
			documentFetched$: new Subject(),
			documentsUpdated$: new Subject(),
			documentInfo: document,
			reloadDocument: jasmine.createSpy('reloadDocument').and.returnValue(of(document)),
			toggleLock: jasmine.createSpy('toggleLock').and.returnValue(of(document)),
		};
		toastr = { error: jasmine.createSpy('error') };
		userInfo.set(null);
		TestBed.configureTestingModule({
			imports: [GenericTypeViewerComponent],
			providers: [
				provideDefaultDocumentViews(),
				{
					provide: Router,
					useValue: { navigate, events: EMPTY, url: '/browse/documents/contract-1' },
				},
				{ provide: ActivatedRoute, useValue: route },
				{ provide: AuthService, useValue: { userInfo } },
				{ provide: DocumentSearchService, useValue: { searchPaneVisibility: signal(false) } },
				{ provide: DocumentsManagerService, useValue: manager },
				{ provide: ToastService, useValue: toastr },
				{ provide: DocumentViewerRegistryService, useValue: { getComponent: renderer } },
			],
		});
		TestBed.overrideComponent(DocumentContentViewComponent, {
			set: { imports: [NgComponentOutlet, FolderRenderer] },
		});
		await TestBed.compileComponents();
		TestBed.overrideComponent(DocumentPermissionsViewComponent, {
			set: { template: '<p>Permissions page</p>', imports: [] },
		});
		// Typed documents, custom types included, use the stock permissions view.
		TestBed.overrideComponent(StandardDocumentPermissionsViewComponent, {
			set: { template: '<p>Permissions page</p>', imports: [] },
		});
		TestBed.overrideComponent(DocumentHistoryViewComponent, {
			set: { template: '<p>History page</p>', imports: [] },
		});
		registry = TestBed.inject(ExtensionRegistry);
		fixture = TestBed.createComponent(GenericTypeViewerComponent);
		fixture.componentRef.setInput('document', document);
	});
	it('renders the registered default page through the existing type renderer registry', async () => {
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Existing renderer contract-1');
		expect(renderer).toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});
	it('preserves folder rendering inside the registered default page', async () => {
		(TestBed.inject(Router) as unknown as { url: string }).url = '/browse/documents/folder-1';
		fixture.componentRef.setInput('document', {
			...document,
			uid: 'folder-1',
			ng: { isFolder: true },
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Folder results folder-1');
	});
	it('does not replace a requested typed view using the previous document while a new target loads', async () => {
		registry.register({
			id: 'client.deep-link',
			contributions: defineDocumentView({
				id: 'client.contract',
				viewId: 'contract',
				label: 'Contract',
				component: ContractView,
				when: (ctx) => ctx.document?.['type'] === 'Contract',
			}),
		});
		routeView('contract');
		fixture.componentRef.setInput('document', {
			uid: 'previous-folder',
			type: 'Folder',
			path: '/',
			ng: { isFolder: true },
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Loading document');
		expect(navigate).not.toHaveBeenCalled();
		fixture.componentRef.setInput('document', document);
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Contract Master agreement');
		expect(navigate).not.toHaveBeenCalled();
	});
	it('adds a Contract-specific client view and synchronizes user selection with the URL', async () => {
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.contract',
				viewId: 'contract',
				label: 'Contract',
				order: 20,
				component: ContractView,
				when: (ctx) => ctx.document?.['type'] === 'Contract',
			}),
		});
		await settle();
		([...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLButtonElement[])
			.find((tab) => tab.textContent?.trim() === 'Contract')!
			.click();
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Contract Master agreement');
		expect(navigate).toHaveBeenCalledWith([], {
			relativeTo: route,
			queryParams: { view: 'contract', p: null },
			queryParamsHandling: 'merge',
			preserveFragment: true,
			replaceUrl: false,
		});
	});
	it('responds to URL selection changes without changing document context', async () => {
		registry.register({
			id: 'client',
			contributions: defineDocumentView({
				id: 'client.contract',
				viewId: 'contract',
				label: 'Contract',
				component: ContractView,
			}),
		});
		await settle();
		const context = fixture.componentInstance.viewContext;
		routeView('contract');
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Contract Master agreement');
		expect(fixture.componentInstance.viewContext).toBe(context);
		routeView('view');
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Existing renderer contract-1');
	});
	it('replaces invalid deep links with a valid fallback', async () => {
		routeView('missing');
		await settle();
		expect(navigate).toHaveBeenCalledWith([], {
			relativeTo: route,
			queryParams: { view: 'view', p: null },
			queryParamsHandling: 'merge',
			preserveFragment: true,
			replaceUrl: true,
		});
		expect(fixture.nativeElement.textContent).toContain('Existing renderer contract-1');
	});
	it('can remove and restore the default page through the public extension registry', async () => {
		// The stubbed stock permissions page never finishes loading here; its leave guard would otherwise block the tab switch.
		spyOn(StandardDocumentPermissionsViewComponent.prototype, 'canDeactivate').and.returnValue(
			true,
		);
		await settle();
		const remove = registry.register({
			id: 'client',
			overrides: ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'].map((slot) => ({
				slot,
				id: 'maretha.document.content',
				disabled: true,
			})),
		});
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Permissions page');
		remove();
		await settle();
		([...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLButtonElement[])
			.find((tab) => tab.textContent?.trim() === 'View')!
			.click();
		// Re-enabling the lazy content page takes one more macrotask than a plain tab switch.
		await settle();
		await settle();
		expect(fixture.nativeElement.textContent).toContain('Existing renderer contract-1');
	});
	it('follows the documents manager loading state and exposes the signed-in user', async () => {
		await settle();
		const component = fixture.componentInstance;
		expect(component.loading).toBeTrue();
		manager.documentFetched$.next(document);
		expect(component.loading).toBeFalse();
		manager.fetchingDocument$.next('contract-1');
		expect(component.loading).toBeTrue();
		manager.documentsUpdated$.next([document]);
		expect(component.loading).toBeFalse();
		expect(component.user()).toBeUndefined();
		userInfo.set({ id: 'jdoe' });
		expect(component.user()).toBe('jdoe');
	});
	it('matches the routed document against the URL, tolerating other routes and bad encodings', async () => {
		const router = TestBed.inject(Router) as unknown as { url: string };
		await settle();
		const component = fixture.componentInstance;
		router.url = '/browse/documents/contract-1?view=view#top';
		expect(component.navigationPath).toBe('/browse/documents/contract-1');
		expect(component.documentMatchesNavigation).toBeTrue();
		router.url = '/browse/collections/other';
		expect(component.documentMatchesNavigation).toBeFalse();
		router.url = '/browse/documents/%E0%A4%A';
		expect(component.documentMatchesNavigation).toBeFalse();
		router.url = '/search/results';
		expect(component.documentMatchesNavigation).toBeTrue();
		router.url = '/browse/documents/';
		expect(component.documentMatchesNavigation).toBeFalse();
		fixture.componentRef.setInput('document', { ...document, uid: 'root', path: '/' });
		await settle();
		expect(component.documentMatchesNavigation).toBeTrue();
		expect(fixture.nativeElement.textContent).toContain('Existing renderer root');
	});
	it('refreshes only the document still shown by the manager and reports a failed refresh', async () => {
		await settle();
		const refresh = fixture.componentInstance.viewContext.refreshDocument!;
		manager.documentInfo = { uid: 'elsewhere' };
		refresh();
		expect(manager.reloadDocument).not.toHaveBeenCalled();
		manager.documentInfo = document;
		refresh();
		expect(manager.reloadDocument).toHaveBeenCalledOnceWith('contract-1');
		expect(toastr.error).not.toHaveBeenCalled();
		manager.reloadDocument.and.returnValue(throwError(() => new Error('offline')));
		refresh();
		expect(toastr.error).toHaveBeenCalledOnceWith(
			'Changes were saved, but the document could not be refreshed.',
			undefined,
			{ enableHtml: false },
		);
	});
	it('toggles the lock through the documents manager and tolerates a refused toggle', async () => {
		await settle();
		fixture.componentInstance.toggleLock();
		expect(manager.toggleLock).toHaveBeenCalledOnceWith(document);
		manager.toggleLock.and.returnValue(undefined);
		expect(() => fixture.componentInstance.toggleLock()).not.toThrow();
		expect(manager.toggleLock).toHaveBeenCalledTimes(2);
	});
});
