import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BsModalService } from 'ngx-bootstrap/modal';
import { DestinationCreateDialogComponent } from 'app/components/quick-search/destination-create-dialog.component';
import { DocumentSearchService } from 'app/modules/search/helpers/document-search.service';
import { DocumentsManagerService } from '../helpers/documents-manager.service';

import { ExplorerComponent } from './explorer.component';

describe('ExplorerComponent', () => {
	let component: ExplorerComponent;
	let fixture: ComponentFixture<ExplorerComponent>;

	beforeEach(async () => {
		await TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ExplorerComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(ExplorerComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('should create', () => {
		expect(component).toBeTruthy();
	});
});

describe('Explorer shell behaviour', () => {
	@Component({ template: '' })
	class BlankComponent {}
	function create() {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
			imports: [ExplorerComponent],
		}).overrideComponent(ExplorerComponent, { set: { template: '' } });
		const documents = TestBed.inject(DocumentsManagerService);
		const current = documents['_documentFetched'];
		const fixture = TestBed.createComponent(ExplorerComponent);
		fixture.detectChanges();
		return { component: fixture.componentInstance, documents, current, fixture };
	}
	it('uses the compact header for non-folders and standard-header folders on document routes only', () => {
		const { component, current } = create();
		expect(component.compactDocumentHeader).toBeFalse();
		current.set({ uid: 'file', type: 'File', ng: { isFolder: false } });
		expect(component.compactDocumentHeader).toBeTrue();
		current.set({ uid: 'folder', type: 'Folder', ng: { isFolder: true } });
		expect(component.compactDocumentHeader).toBeTrue();
		current.set({ uid: 'untyped', ng: { isFolder: true } });
		expect(component.compactDocumentHeader).toBeFalse();
		component.documentBrowserRouteActive = false;
		current.set({ uid: 'file', type: 'File', ng: { isFolder: false } });
		expect(component.compactDocumentHeader).toBeFalse();
	});
	it('tracks the browse route on navigation unless the search pane is open, and the loading state', async () => {
		const { component, documents, fixture } = create();
		const router = TestBed.inject(Router);
		router.resetConfig([{ path: '**', component: BlankComponent }]);
		await router.navigateByUrl('/dashboard');
		expect(component.documentBrowserRouteActive).toBeFalse();
		await router.navigateByUrl('/browse/default-domain');
		expect(component.documentBrowserRouteActive).toBeTrue();
		TestBed.inject(DocumentSearchService).showSearchPaneVisibility();
		await router.navigateByUrl('/tasks');
		expect(component.documentBrowserRouteActive).toBeTrue();
		documents.fetchingDocuments$.next(true);
		expect(component.loading).toBeTrue();
		documents.fetchingDocuments$.next(false);
		expect(component.loading).toBeFalse();
		fixture.destroy();
		documents.fetchingDocuments$.next(true);
		expect(component.loading).toBeFalse();
		component.filesDragged(true);
		expect(component.fileOver).toBeTrue();
	});
	it('opens the import dialog for dropped files only inside folders that accept children', () => {
		const { component, current } = create();
		const show = spyOn(TestBed.inject(BsModalService), 'show');
		const files = [new File(['a'], 'a.txt')];
		component.filesDropped(files);
		current.set({ uid: 'leaf', path: '/leaf', ng: { subTypes: [] } });
		component.filesDropped(files);
		current.set({
			uid: 'folder',
			path: '/folder',
			repository: 'secondary',
			ng: { subTypes: ['File'] },
		});
		component.filesDropped([]);
		expect(show).not.toHaveBeenCalled();
		component.filesDropped(files);
		expect(show).toHaveBeenCalledOnceWith(DestinationCreateDialogComponent, {
			class: 'modal-lg',
			ignoreBackdropClick: true,
			keyboard: false,
			initialState: {
				initialPath: '/folder',
				repository: 'secondary',
				initialView: 'import',
				initialFiles: files,
			},
		});
		current.set({ uid: 'root', ng: { subTypes: ['Folder'] } });
		component.filesDropped(files);
		expect(show.calls.mostRecent().args[1]!.initialState).toEqual(
			jasmine.objectContaining({ initialPath: '/', repository: 'default' }),
		);
	});
});
