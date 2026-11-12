import { Component, Input, signal, WritableSignal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AgGridAngular } from 'ag-grid-angular';
import {
	ActivatedRoute,
	DefaultUrlSerializer,
	Event,
	NavigationStart,
	Router,
	UrlTree,
} from '@angular/router';
import { EMPTY, Subject } from 'rxjs';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { DocumentClipboardService } from '../../../helpers/document-clipboard.service';
import { DocumentCollectionsService } from '../../../helpers/document-collections.service';
import { DocumentTrashService } from '../../../helpers/document-trash.service';
import { GenericFolderishViewerComponent } from './generic-folderish-viewer.component';
import {
	ResultsPagingSettings,
	ResultsProjectionComponent,
	ResultsProjectionRegistry,
} from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';

@Component({
	standalone: true,
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '<span class="folderish-client">{{ context?.row?.uid }}</span>',
})
class FolderishClientProjection {
	@Input() context: any;
}

const auth = { provide: AuthService, useValue: { userInfo: signal({ id: 'jdoe' }) } };

describe('GenericFolderishViewerComponent lazy mounting', () => {
	const documents = [{ uid: 'child-1', ng: {} }];
	let events: Subject<Event>;
	let updated: Subject<unknown[]>;
	let loading: Subject<boolean>;
	let manager: {
		documents: unknown[];
		totalCount: number;
		canLoadMore: boolean;
		fetchingDocuments: () => boolean;
		fetchingDocuments$: Subject<boolean>;
		documentsUpdated$: Subject<unknown[]>;
		selectedDocumentsUpdated$: typeof EMPTY;
		listingDisplayMode: WritableSignal<'table' | 'grid' | null>;
	};
	beforeEach(() => {
		events = new Subject<Event>();
		updated = new Subject<unknown[]>();
		loading = new Subject<boolean>();
		manager = {
			documents,
			totalCount: 3,
			canLoadMore: true,
			fetchingDocuments: () => false,
			fetchingDocuments$: loading,
			documentsUpdated$: updated,
			selectedDocumentsUpdated$: EMPTY,
			listingDisplayMode: signal<'table' | 'grid' | null>(null),
		};
		TestBed.configureTestingModule({
			imports: [GenericFolderishViewerComponent],
			providers: [
				{ provide: Router, useValue: { events, url: '/browse/documents/folder?view=view' } },
				{ provide: ActivatedRoute, useValue: {} },
				auth,
				{ provide: DocumentsManagerService, useValue: manager },
				{
					provide: DocumentClipboardService,
					useValue: { documentsMoved$: EMPTY, documentsCopied$: EMPTY },
				},
				{ provide: DocumentTrashService, useValue: { documentsPurged$: EMPTY } },
				{
					provide: DocumentCollectionsService,
					useValue: { documentsRemovedFromCollection$: EMPTY },
				},
			],
		});
		TestBed.overrideComponent(GenericFolderishViewerComponent, {
			set: { template: '', imports: [] },
		});
	});
	it('hydrates results and paging state even when their events occurred before mount', () => {
		const fixture = TestBed.createComponent(GenericFolderishViewerComponent);
		expect(fixture.componentInstance.documents).toBe(documents);
		expect(fixture.componentInstance.totalCount).toBe(3);
		expect(fixture.componentInstance.canLoadMore).toBeTrue();
		expect(fixture.componentInstance.loading).toBeFalse();
	});
	it('hydrates an in-flight loading state and receives subsequent completion', () => {
		manager.fetchingDocuments = () => true;
		const fixture = TestBed.createComponent(GenericFolderishViewerComponent);
		expect(fixture.componentInstance.loading).toBeTrue();
		loading.next(false);
		expect(fixture.componentInstance.loading).toBeFalse();
	});
	it('retains results during view selection and clears them during document navigation', () => {
		const fixture = TestBed.createComponent(GenericFolderishViewerComponent);
		events.next(new NavigationStart(1, '/browse/documents/folder?view=contract'));
		expect(fixture.componentInstance.documents).toBe(documents);
		events.next(new NavigationStart(2, '/browse/documents/another'));
		expect(fixture.componentInstance.documents).toEqual([]);
		expect(fixture.componentInstance.loading).toBeTrue();
	});
	it('stops observing result events when the page is destroyed', () => {
		const fixture = TestBed.createComponent(GenericFolderishViewerComponent);
		fixture.destroy();
		updated.next([]);
		expect(fixture.componentInstance.documents).toBe(documents);
	});
});

describe('GenericFolderishViewerComponent AG Grid host', () => {
	const documents = [
		{
			uid: 'child-1',
			title: 'Child',
			type: 'File',
			ng: { isSelected: false, canBrowse: true, attachment: { length: 12 } },
			contextParameters: { runningWorkflows: [] },
		},
	];
	let loading: Subject<boolean>;
	let updates: Subject<any[]>;
	let toggleSelection: jasmine.Spy;
	let requestPage: jasmine.Spy;
	const listingDisplayMode = signal<'table' | 'grid' | null>(null);

	beforeEach(() => {
		listingDisplayMode.set(null);
		loading = new Subject<boolean>();
		updates = new Subject<any[]>();
		toggleSelection = jasmine.createSpy('toggleSelection');
		requestPage = jasmine.createSpy('loadMore').and.returnValue(new Subject<void>());
		TestBed.configureTestingModule({
			imports: [GenericFolderishViewerComponent],
			providers: [
				...legacyTestProviders(),
				auth,
				{
					provide: Router,
					useValue: {
						events: EMPTY,
						url: '/browse/documents/folder',
						parseUrl: (url: string) => new DefaultUrlSerializer().parse(url),
						serializeUrl: (url: UrlTree) => new DefaultUrlSerializer().serialize(url),
						navigate: jasmine.createSpy('navigate'),
						navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
					},
				},
				{ provide: ActivatedRoute, useValue: { snapshot: { url: [] } } },
				{
					provide: DocumentsManagerService,
					useValue: {
						documents,
						totalCount: documents.length,
						canLoadMore: true,
						fetchingDocuments: () => false,
						fetchingDocuments$: loading,
						documentsUpdated$: updates,
						selectedDocumentsUpdated$: EMPTY,
						listingDisplayMode,
						documentFetched$: EMPTY,
						documentInfo: {},
						loadMore: requestPage,
						toggleSelection,
						showOnlyTrashedDocuments: false,
					},
				},
				{
					provide: DocumentClipboardService,
					useValue: { documentsMoved$: EMPTY, documentsCopied$: EMPTY },
				},
				{ provide: DocumentTrashService, useValue: { documentsPurged$: EMPTY } },
				{
					provide: DocumentCollectionsService,
					useValue: { documentsRemovedFromCollection$: EMPTY },
				},
			],
		});
	});

	afterEach(() => {
		for (const key of Object.keys(localStorage))
			if (key.startsWith('maretha.folder-results.v1:')) localStorage.removeItem(key);
	});

	async function render(folder = fixtureDocument()) {
		const fixture = TestBed.createComponent(GenericFolderishViewerComponent);
		fixture.componentRef.setInput('document', folder);
		fixture.nativeElement.style.cssText = 'display:block;height:240px;width:960px';
		document.body.append(fixture.nativeElement);
		fixture.detectChanges();
		await fixture.whenStable();
		await new Promise((resolve) => setTimeout(resolve));
		fixture.detectChanges();
		return fixture;
	}

	it('renders one AG Grid table with its first row', async () => {
		const fixture = await render();
		expect(fixture.nativeElement.querySelector('[row-index="0"]'))
			.withContext('first row')
			.toBeTruthy();
		expect(fixture.nativeElement.querySelector('ag-grid-angular'))
			.withContext('AG Grid host')
			.toBeTruthy();
		expect(fixture.nativeElement.querySelector('cdk-virtual-scroll-viewport')).toBeNull();
		fixture.destroy();
	});

	it('keeps paging manual by default and protects the next-page request while it is in flight', async () => {
		const fixture = await render();
		fixture.componentInstance.projectedSelectionChange(['child-1']);
		expect(toggleSelection).toHaveBeenCalledWith('child-1', true);
		const projection = fixture.debugElement.query(By.directive(ResultsProjectionComponent))
			.componentInstance as ResultsProjectionComponent;
		projection.agBodyScrollEnd({
			api: { getDisplayedRowCount: () => 1, getLastDisplayedRowIndex: () => 0 },
		} as any);
		expect(requestPage).not.toHaveBeenCalled();
		const button = fixture.nativeElement.querySelector(
			'nx-load-more-button button',
		) as HTMLButtonElement;
		expect(button.textContent).toContain('Load more');
		button.click();
		button.click();
		expect(requestPage).toHaveBeenCalledTimes(1);
		fixture.detectChanges();
		expect(button.disabled).toBeTrue();
		fixture.destroy();
	});

	it('uses the mounted AG Grid API for deep rows, client cells, and one paging request', async () => {
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			uid: `child-${index + 1}`,
			title: `Child ${index + 1}`,
			type: 'File',
			ng: { isSelected: false, canBrowse: true, attachment: { length: 12 } },
			contextParameters: { runningWorkflows: [] },
		}));
		const unregister = TestBed.inject(ResultsProjectionRegistry).register({
			id: 'folderish-client-cell',
			hostId: 'generic-folderish',
			projection: 'cell:title',
			component: FolderishClientProjection,
		});
		const fixture = await render();
		updates.next(rows);
		fixture.detectChanges();
		await fixture.whenStable();
		const grid = fixture.debugElement.query(By.directive(AgGridAngular))
			.componentInstance as AgGridAngular;
		grid.api.ensureIndexVisible(900);
		await new Promise((resolve) => setTimeout(resolve));
		fixture.detectChanges();
		const projection = fixture.debugElement.query(By.directive(ResultsProjectionComponent))
			.componentInstance as ResultsProjectionComponent;
		expect((grid.api.getDisplayedRowAtIndex(900)?.data as any).uid).toBe('child-901');
		expect(projection.projectionComponent('cell:title', projection.rowContext(rows[0], 0))).toBe(
			FolderishClientProjection,
		);
		const bottomApi = {
			getDisplayedRowCount: () => grid.api.getDisplayedRowCount(),
			getLastDisplayedRowIndex: () => grid.api.getDisplayedRowCount() - 1,
		};
		TestBed.inject(ResultsPagingSettings).apply({ scrollPagingEnabled: true });
		projection.agBodyScrollEnd({ api: bottomApi } as any);
		projection.agBodyScrollEnd({ api: bottomApi } as any);
		expect(requestPage).toHaveBeenCalledTimes(1);
		unregister();
		fixture.detectChanges();
		expect(
			projection.projectionComponent('cell:title', projection.rowContext(rows[0], 0)),
		).toBeNull();
		fixture.destroy();
	});

	it('switches to a thumbnail grid and keeps the choice per user and folder', async () => {
		const folder = fixtureDocument();
		let fixture = await render(folder);
		const [grid, table] = fixture.nativeElement.querySelectorAll('.display-modes button');
		expect(grid.getAttribute('aria-label')).toBe('Switch to Grid View');
		expect(table.disabled).toBeTrue();
		grid.click();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('ag-grid-angular')).toBeNull();
		// The stock grid thumbnail card, the same as every other results grid.
		const card = fixture.nativeElement.querySelector('nx-document-grid-thumbnail') as HTMLElement;
		expect(card.querySelector('.nx-grid-thumbnail__title')!.textContent!.trim()).toBe('Child');
		const select = card.querySelector('input[type="checkbox"]') as HTMLInputElement;
		expect(select.getAttribute('aria-label')).toBe('Select Child');
		select.click();
		expect(toggleSelection).toHaveBeenCalledWith('child-1', true);
		fixture.destroy();

		fixture = await render(folder);
		expect(fixture.componentInstance.displayMode()).toBe('grid');
		TestBed.tick();
		expect(listingDisplayMode()).toBe('grid');
		expect(fixture.nativeElement.querySelector('nx-document-grid-thumbnail')).toBeTruthy();
		fixture.componentRef.setInput('document', { ...folder, uid: 'other-folder' });
		fixture.detectChanges();
		expect(fixture.componentInstance.displayMode()).toBe('table');
		fixture.destroy();
		expect(listingDisplayMode()).toBeNull();
	});

	it('lets a registered item projection replace the folder card', async () => {
		const unregister = TestBed.inject(ResultsProjectionRegistry).register({
			id: 'folderish-client-card',
			hostId: 'generic-folderish',
			projection: 'item',
			mode: 'grid',
			component: FolderishClientProjection,
		});
		const fixture = await render();
		fixture.componentInstance.setDisplayMode('grid');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('.folderish-client').textContent).toBe('child-1');
		expect(fixture.nativeElement.querySelector('article.folder-card')).toBeNull();
		unregister();
		fixture.destroy();
	});
});
