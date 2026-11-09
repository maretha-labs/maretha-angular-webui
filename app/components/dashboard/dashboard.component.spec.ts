import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, input } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import {
	ResultsProjectionComponent,
	ResultsProjectionContext,
	ResultsProjectionHostContext,
	ResultsProjectionRegistry,
	WebUiLocale,
	WebUiMessages,
} from '@maretha/webui-sdk';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { DocumentHistoryService } from 'app/modules/explorer/helpers/document-history.service';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { DocumentEnhancerService } from 'app/modules/explorer/helpers/document-enhancer.service';

import { DashboardComponent } from './dashboard.component';
import { DashboardDocumentTableComponent } from './dashboard-document-table.component';

@Component({
	selector: 'nx-dashboard-test-cell',
	template: `<span>{{ context().row.title }} / {{ context().column?.id }}</span>`,
})
class DashboardTestCell {
	readonly context = input.required<ResultsProjectionContext>();
}
@Component({
	selector: 'nx-dashboard-test-default',
	template: `<p>Customer default projection</p>`,
})
class DashboardTestDefault {
	readonly context = input.required<ResultsProjectionHostContext>();
}
@Component({
	selector: 'nx-dashboard-test-action',
	template: `<button type="button" (click)="context().invokeAction('customer-action')">
		Customer action
	</button>`,
})
class DashboardTestAction {
	readonly context = input.required<ResultsProjectionContext>();
}
@Component({
	selector: 'nx-dashboard-test-detail',
	template: `<button type="button">{{ context().row.title }}</button>`,
})
class DashboardTestDetail {
	readonly context = input.required<ResultsProjectionContext>();
}

describe('DashboardComponent', () => {
	let component: DashboardComponent;
	let fixture: ComponentFixture<DashboardComponent>;
	let user: BehaviorSubject<any>;
	let added: Subject<any>;
	let removed: Subject<any>;
	let history: BehaviorSubject<any[]>;
	let workflows: jasmine.SpyObj<WorkflowsService>;
	let http: HttpTestingController;

	beforeEach(async () => {
		user = new BehaviorSubject(null);
		added = new Subject();
		removed = new Subject();
		history = new BehaviorSubject<any[]>([]);
		workflows = jasmine.createSpyObj('workflows', ['getUserTasks']);
		workflows.getUserTasks.and.returnValue(
			of({ entries: [], resultsCount: 0, isNextPageAvailable: false }),
		);
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: AuthService, useValue: { userInfoUpdated$: user, userInfo: () => user.value } },
				{ provide: WorkflowsService, useValue: workflows },
				{ provide: DocumentHistoryService, useValue: { documentHistoryUpdated$: history } },
				{ provide: DocumentsManagerService, useValue: { documentsUpdated$: new Subject() } },
				{
					provide: DocumentEnhancerService,
					useValue: { setDocumentCustomProperties: jasmine.createSpy('enhance') },
				},
				{
					provide: DocumentCollectionsService,
					useValue: {
						documentsAddedToCollection$: added,
						documentsRemovedFromCollection$: removed,
					},
				},
			],
			imports: [DashboardComponent],
		}).compileComponents();

		fixture = TestBed.createComponent(DashboardComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
		http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.includes('/domain_documents/execute'))
			.flush({ entries: [] });
	});
	afterEach(() => http.verify());

	it('should create', () => {
		expect(component).toBeTruthy();
	});
	it('preserves the thumbnail space without a broken-image glyph when a custom type icon fails', async () => {
		component.recentlyEditedDocuments = [
			{
				uid: 'custom-document',
				title: 'Custom document',
				properties: { 'dc:modified': '2026-10-26T12:00:00Z' },
				contextParameters: { thumbnail: '/missing-custom-icon.png' },
			},
		];
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		const thumbnail = fixture.nativeElement.querySelector(
			'.document-title img',
		) as HTMLImageElement;
		expect(thumbnail).not.toBeNull();
		thumbnail.dispatchEvent(new Event('error'));
		expect(thumbnail.style.visibility).toBe('hidden');
		expect(thumbnail.getAttribute('alt')).toBe('');
	});

	it('keeps every deterministic contributor avatar readable with its rendered white initials', () => {
		const luminance = (color: string) => {
			const rgb = color.match(/\d+/g)!.slice(0, 3).map(Number);
			return rgb.reduce((sum, byte, index) => {
				const value = byte / 255;
				const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
				return sum + linear * [0.2126, 0.7152, 0.0722][index];
			}, 0);
		};
		const colors = new Set<string>();
		// Consecutive one-character identities exercise every deterministic palette bucket.
		component.recentlyEditedDocuments = [...'abcdefghij'].map((name) => ({
			uid: name,
			title: name,
			type: 'File',
			properties: { 'dc:lastContributor': name, 'dc:modified': '2026-10-12T12:00:00Z' },
		}));
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		for (const request of http.match((request) => request.url.includes('/api/v1/user/'))) {
			const id = request.request.url.split('/').at(-1);
			request.flush({ id, properties: { firstName: id } });
		}
		fixture.detectChanges();
		const avatars: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.avatar');
		expect(avatars.length).toBe(10);
		for (const [index, avatar] of Array.from(avatars).entries()) {
			// Stock nuxeo-user-avatar keeps the case of the name it reads.
			expect(avatar.getAttribute('data-initials')).toBe('abcdefghij'[index]);
			const style = getComputedStyle(avatar);
			colors.add(style.backgroundColor);
			const first = luminance(style.color),
				second = luminance(style.backgroundColor);
			expect((Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05))
				.withContext(`Avatar contrast for ${index}`)
				.toBeGreaterThanOrEqual(4.5);
		}
		expect(colors.size).toBe(10);
	});

	it('uses non-selectable table projections for each document card', () => {
		expect(component.documentColumnsFor('recent').map((column) => column.label)).toEqual([
			'Title',
			'Type',
			'Last Viewed',
		]);
		expect(component.documentColumnsFor('edited').map((column) => column.label)).toEqual([
			'Title',
			'Modified',
			'Last Contributor',
		]);
		expect(fixture.nativeElement.querySelectorAll('nx-results-projection').length).toBe(3);
		expect(fixture.nativeElement.querySelectorAll('ag-grid-angular').length).toBe(0);
	});
	it('renders localized task names and enriched document subtitles without translating document titles', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('task-card-fixture', {
			'en-US': { 'wf.serialDocumentReview.DocumentValidation': 'Validate the Document' },
			fr: { 'wf.serialDocumentReview.DocumentValidation': 'Valider le document' },
		});
		workflows.getUserTasks.and.returnValue(
			of({
				entries: [
					{
						id: 'validation',
						name: 'wf.serialDocumentReview.DocumentValidation',
						targetDocumentIds: [{ uid: 'note', title: 'core-note {literal}' }],
					},
				],
				resultsCount: 1,
				isNextPageAvailable: false,
			}),
		);
		user.next({ id: 'reviewer' });
		http
			.expectOne((request) => request.url.includes('/automation/Favorite.Fetch'))
			.flush({ entries: [] });
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		const card = () => fixture.nativeElement.querySelector('.task') as HTMLButtonElement;
		expect(card().querySelector('strong')?.textContent).toBe('Validate the Document');
		expect(card().querySelector('.task-document-title')?.textContent).toBe('core-note {literal}');
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(card().querySelector('strong')?.textContent).toBe('Valider le document');
		expect(card().querySelector('.task-document-title')?.textContent).toBe('core-note {literal}');
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		card().click();
		expect(navigate).toHaveBeenCalledOnceWith(['/tasks', 'validation']);
	});

	it('opens dashboard tasks by task id even when no target document is returned', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.navigateToTask({ id: 'task-123' });
		expect(navigate).toHaveBeenCalledWith(['/tasks', 'task-123']);
	});
	it('reloads favorites only after their own membership changes and cancels stale requests across users', () => {
		user.next({ id: 'first' });
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		http
			.expectOne((request) => request.url.includes('/default_content_collection/execute'))
			.flush({ entries: [] });
		added.next({
			collectionUid: 'ordinary-collection',
			documentUids: ['doc'],
			collectionTotalCount: 1,
		});
		http.expectNone((request) => request.url.endsWith('/Favorite.Fetch'));
		removed.next({ collectionUid: 'favorites', documentUids: ['gone'], collectionTotalCount: 1 });
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		http
			.expectOne((request) => request.url.includes('/default_content_collection/execute'))
			.flush({ entries: [{ uid: 'favorite-file', type: 'File' }] });
		expect(component.favoriteDocuments.map((document) => document.uid)).toEqual(['favorite-file']);
		user.next({ id: 'second' });
		const pending = http.expectOne((request) => request.url.endsWith('/Favorite.Fetch'));
		user.next(null);
		expect(pending.cancelled).toBeTrue();
		expect(component.favoriteDocuments).toEqual([]);
	});
	it('recovers task loading after an error and cancels the active user request on destroy', () => {
		const first = new Subject<any>();
		const second = new Subject<any>();
		workflows.getUserTasks.and.returnValues(first, second);
		user.next({ id: 'first' });
		http.expectOne((request) => request.url.endsWith('/Favorite.Fetch')).flush({});
		first.error(new Error('offline'));
		expect(component.tasksError).toBeTrue();
		user.next({ id: 'second' });
		http.expectOne((request) => request.url.endsWith('/Favorite.Fetch')).flush({});
		second.next({ entries: [{ id: 'new-task' }], resultsCount: 1 });
		expect(component.tasksError).toBeFalse();
		expect(component.workflowTasks[0].id).toBe('new-task');
		fixture.destroy();
		expect(second.observed).toBeFalse();
	});
	it('uses the source effective fetch size while limiting dashboard cards to 15 rendered items', () => {
		const documents = Array.from({ length: 18 }, (_, index) => ({
			uid: `doc-${index}`,
			title: `Document ${index}`,
			type: 'Note',
		}));
		const tasks = documents.map((document) => ({ id: document.uid }));
		component.ngOnInit();
		const edited = http.expectOne((request) => request.url.includes('/domain_documents/execute'));
		expect(new URL(edited.request.url, 'http://localhost').searchParams.get('pageSize')).toBe('16');
		edited.flush({ entries: documents, resultsCount: 100 });
		expect(component.recentlyEditedDocuments.map((document) => document.uid)).toEqual(
			documents.slice(0, 15).map((document) => document.uid),
		);
		workflows.getUserTasks.and.returnValue(
			of({ entries: tasks, resultsCount: 100, isNextPageAvailable: true }),
		);
		user.next({ id: 'first' });
		expect(workflows.getUserTasks).toHaveBeenCalledWith('first', 0, 16);
		expect(component.workflowTasks.length).toBe(15);
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		const favorites = http.expectOne((request) =>
			request.url.includes('/default_content_collection/execute'),
		);
		expect(new URL(favorites.request.url, 'http://localhost').searchParams.get('pageSize')).toBe(
			'16',
		);
		favorites.flush({ entries: documents, resultsCount: 100 });
		expect(component.favoriteDocuments.map((document) => document.uid)).toEqual(
			documents.slice(0, 15).map((document) => document.uid),
		);
	});
	it('distinguishes pending edited requests from empty results and failed requests', () => {
		component.ngOnInit();
		fixture.detectChanges();
		const card = () => fixture.nativeElement.querySelector('[aria-labelledby="edited-heading"]');
		expect(card().getAttribute('aria-busy')).toBe('true');
		expect(card().querySelector('[role="status"]').textContent).toContain('Loading');
		const request = http.expectOne((value) => value.url.includes('/domain_documents/execute'));
		request.flush({}, { status: 503, statusText: 'Unavailable' });
		fixture.detectChanges();
		expect(card().getAttribute('aria-busy')).toBe('false');
		expect(card().querySelector('[role="alert"]').textContent).toContain(
			'Unable to load recently edited',
		);
		component.ngOnInit();
		http
			.expectOne((value) => value.url.includes('/domain_documents/execute'))
			.flush({ entries: [] });
		fixture.detectChanges();
		expect(component.editedError).toBeFalse();
		expect(card().querySelector('[role="alert"]')).toBeNull();
		expect(card().textContent).toContain('There are no items');
	});
	it('keeps favorites and tasks in a loading state until their own requests finish', () => {
		const tasks = new Subject<any>();
		workflows.getUserTasks.and.returnValue(tasks);
		user.next({ id: 'first' });
		expect(component.tasksLoading).toBeTrue();
		expect(component.favoritesLoading).toBeTrue();
		fixture.detectChanges();
		expect(
			fixture.nativeElement.querySelector('[aria-labelledby="tasks-heading"] [role="status"]')
				.textContent,
		).toContain('Loading');
		expect(
			fixture.nativeElement.querySelector('[aria-labelledby="favorites-heading"] [role="status"]')
				.textContent,
		).toContain('Loading');
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		expect(component.favoritesLoading).toBeTrue();
		http
			.expectOne((request) => request.url.includes('/default_content_collection/execute'))
			.flush({ entries: [] });
		expect(component.favoritesLoading).toBeFalse();
		expect(component.tasksLoading).toBeTrue();
		tasks.next({ entries: [] });
		expect(component.tasksLoading).toBeFalse();
		expect(component.hasWorkflowTasks).toBeFalse();
	});
	it('cancels an older recent lookup without clearing the loading state of its replacement', () => {
		history.next([{ uid: 'old', lastViewed: '2026-09-17T00:00:00Z' }]);
		const old = http.expectOne((request) => request.url.endsWith('/repo/default/query'));
		history.next([{ uid: 'new', lastViewed: '2026-09-17T01:00:00Z' }]);
		expect(old.cancelled).toBeTrue();
		expect(component.recentLoading).toBeTrue();
		http
			.expectOne((request) => request.url.endsWith('/repo/default/query'))
			.flush({ entries: [{ uid: 'new', title: 'Current title', path: '/new' }] });
		expect(component.recentLoading).toBeFalse();
		expect(component.recentlyViewedDocuments[0]).toEqual(
			jasmine.objectContaining({
				uid: 'new',
				title: 'Current title',
				lastViewed: '2026-09-17T01:00:00Z',
			}),
		);
		history.next([]);
		expect(component.recentlyViewedDocuments).toEqual([]);
		expect(component.recentLoading).toBeFalse();
	});
	it('uses canonical repository-aware links for dashboard documents and version UIDs', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		component.navigateToDocument({ uid: 'live', path: '/Workspace/Note', repository: 'other' });
		expect(navigate).toHaveBeenCalledWith('/browse/Workspace/Note?repository=other');
		component.navigateToDocument({
			uid: 'snapshot',
			path: '/Workspace/Note',
			isVersion: true,
			repository: 'other',
		});
		expect(navigate).toHaveBeenCalledWith('/browse/documents/snapshot?repository=other');
	});
	it('navigates from a document row without enabling selection and blocks activation during card refresh', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		const row = {
			uid: 'live',
			title: 'Note',
			type: 'Note',
			path: '/Workspace/Note',
			repository: 'other',
			properties: { 'dc:modified': '2026-09-17T00:00:00Z' },
		};
		component.recentlyEditedDocuments = [row];
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		const projection = fixture.debugElement.query(By.directive(ResultsProjectionComponent))
			.componentInstance as ResultsProjectionComponent;
		expect(projection.selectionEnabled()).toBeFalse();
		expect(projection.readOnly()).toBeTrue();
		projection.rowClick(new MouseEvent('click'), row);
		expect(navigate).toHaveBeenCalledOnceWith('/browse/Workspace/Note?repository=other');
		component.ngOnInit();
		fixture.detectChanges();
		projection.rowClick(new MouseEvent('click'), row);
		expect(navigate).toHaveBeenCalledTimes(1);
		http
			.expectOne((request) => request.url.includes('/domain_documents/execute'))
			.flush({ entries: [] });
	});
	it('retains column sorting, combined text filters and whitespace-aware blank filters without focus sentinels', () => {
		component.recentlyEditedDocuments = [
			{ uid: 'beta', title: 'Beta', properties: { 'dc:modified': '2026-10-02' } },
			{ uid: 'alpha-two', title: 'Alpha', properties: { 'dc:modified': '2026-10-02' } },
			{ uid: 'alpha-one', title: 'Alpha', properties: { 'dc:modified': '2026-10-01' } },
			{ uid: 'blank', title: '  ', properties: { 'dc:modified': '2026-10-01' } },
		];
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		const table = fixture.debugElement.query(By.directive(DashboardDocumentTableComponent))
			.componentInstance as DashboardDocumentTableComponent;
		table.sort('title');
		table.sort('modified', true);
		expect(table.displayedRows().map((row) => row.uid)).toEqual([
			'blank',
			'alpha-one',
			'alpha-two',
			'beta',
		]);
		table.sort('title');
		expect(table.displayedRows()[0].uid).toBe('beta');
		table.sort('title');
		expect(table.displayedRows()[0].uid).toBe('beta');
		for (const [operator, query, expected] of [
			['contains', 'AL', ['alpha-two', 'alpha-one']],
			['notContains', 'al', ['beta', 'blank']],
			['equals', 'beta', ['beta']],
			['notEqual', 'beta', ['alpha-two', 'alpha-one', 'blank']],
			['startsWith', 'al', ['alpha-two', 'alpha-one']],
			['endsWith', 'ta', ['beta']],
			['blank', '', ['blank']],
			['notBlank', '', ['beta', 'alpha-two', 'alpha-one']],
		] as const) {
			table.setCondition('title', 0, query, operator);
			expect(table.displayedRows().map((row) => row.uid))
				.withContext(operator)
				.toEqual([...expected]);
		}
		table.setCondition('title', 0, 'al', 'contains');
		table.setCondition('title', 1, 'ta', 'endsWith');
		expect(table.displayedRows()).toEqual([]);
		table.setJoin('title', 'OR');
		expect(table.displayedRows().map((row) => row.uid)).toEqual(['beta', 'alpha-two', 'alpha-one']);
		table.clearFilter('title');
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.ag-tab-guard').length).toBe(0);
	});
	it('moves real cell focus, enters and exits filter controls, and preserves guarded Enter navigation', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		component.recentlyEditedDocuments = [
			{
				uid: 'keyboard',
				title: 'Keyboard document',
				path: '/Workspace/Keyboard',
				repository: 'other',
				properties: { 'dc:modified': '2026-10-01' },
			},
			...Array.from({ length: 7 }, (_, index) => ({
				uid: `keyboard-${index}`,
				title: `Keyboard document ${index}`,
				properties: { 'dc:modified': '2026-10-01' },
			})),
		];
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		const root: HTMLElement = fixture.nativeElement;
		const cell = (row: number, column: number) => {
			const element = root.querySelector<HTMLElement>(
				`[data-dashboard-row="${row}"][data-dashboard-column="${column}"]`,
			)!;
			return row < 0
				? element.querySelector<HTMLElement>('[data-dashboard-header-focus]')!
				: element;
		};
		const press = (element: HTMLElement, key: string, options: KeyboardEventInit = {}) =>
			element.dispatchEvent(
				new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
			);
		cell(-1, 0).focus();
		expect(cell(-1, 0).tagName).toBe('BUTTON');
		expect(cell(-1, 0).closest('th')?.hasAttribute('tabindex')).toBeFalse();
		press(cell(-1, 0), 'Enter');
		fixture.detectChanges();
		expect(cell(-1, 0).closest('th')?.getAttribute('aria-sort')).toBe('ascending');
		press(cell(-1, 0), 'F2');
		expect(document.activeElement).toBe(cell(-1, 0));
		press(cell(-1, 0), 'Tab');
		expect(document.activeElement).toBe(cell(-1, 1));
		press(cell(-1, 1), 'Tab');
		expect(document.activeElement).toBe(cell(-1, 2));
		press(cell(-1, 2), 'Tab');
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'ArrowUp');
		expect(document.activeElement).toBe(cell(-1, 0));
		press(cell(-1, 0), 'ArrowDown');
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'Enter');
		expect(navigate).toHaveBeenCalledOnceWith('/browse/Workspace/Keyboard?repository=other');
		press(cell(0, 0), ' ');
		expect(navigate).toHaveBeenCalledTimes(1);
		press(cell(0, 0), 'F2');
		expect(document.activeElement).toBe(cell(0, 0).querySelector('a'));
		press(document.activeElement as HTMLElement, 'Escape');
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'ArrowRight');
		expect(document.activeElement).toBe(cell(0, 1));
		press(cell(0, 1), 'Tab', { shiftKey: true });
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'ArrowRight', { ctrlKey: true });
		expect(document.activeElement).toBe(cell(0, 2));
		press(cell(0, 2), 'Home');
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'PageDown');
		expect(Number((document.activeElement as HTMLElement).dataset['dashboardRow'])).toBeGreaterThan(
			0,
		);
		press(document.activeElement as HTMLElement, 'PageUp');
		expect(document.activeElement).toBe(cell(0, 0));
		press(cell(0, 0), 'End');
		expect(document.activeElement).toBe(cell(7, 2));
		expect(press(cell(7, 2), 'Tab')).toBeTrue();
		press(cell(7, 2), 'Home');
		TestBed.inject(WebUiLocale).setLocale('ar');
		press(cell(0, 0), 'ArrowLeft');
		expect(document.activeElement).toBe(cell(0, 1));
		TestBed.inject(WebUiLocale).setLocale('en-US');
		press(cell(0, 1), 'ArrowUp');
		press(cell(-1, 1), 'ArrowLeft');
		expect(document.activeElement).toBe(cell(-1, 0));
		press(cell(-1, 0), 'Enter', { ctrlKey: true });
		fixture.detectChanges();
		const filter = cell(-1, 0).closest('th')!.querySelector<HTMLSelectElement>('select')!;
		expect(document.activeElement).toBe(filter);
		press(filter, 'Escape');
		fixture.detectChanges();
		expect(document.activeElement).toBe(cell(-1, 0));
		component.ngOnInit();
		fixture.detectChanges();
		press(cell(0, 0), 'Enter');
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(cell(0, 0).querySelector('a')?.hasAttribute('href')).toBeFalse();
		http
			.expectOne((request) => request.url.includes('/domain_documents/execute'))
			.flush({ entries: [] });
	});
	it('keeps interactive customer details reachable between rows with Tab, arrows, F2 and Escape', () => {
		component.recentlyEditedDocuments = ['first', 'next'].map((uid) => ({
			uid,
			title: uid,
			properties: { 'dc:modified': '2026-10-01' },
		}));
		TestBed.inject(ResultsProjectionRegistry).register({
			id: 'keyboard-dashboard-detail',
			hostId: 'dashboard-edited',
			projection: 'rowdetail',
			mode: 'table',
			component: DashboardTestDetail,
			when: (context) => (context as ResultsProjectionContext).row.uid === 'first',
		});
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		const root: HTMLElement = fixture.nativeElement;
		const cell = (row: number, column: number, detail = false) =>
			root.querySelector<HTMLElement>(
				`[data-dashboard-row="${row}"][data-dashboard-column="${column}"][data-dashboard-detail="${detail}"]`,
			)!;
		const press = (element: HTMLElement, key: string, options: KeyboardEventInit = {}) =>
			element.dispatchEvent(
				new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
			);
		cell(0, 2).focus();
		press(cell(0, 2), 'Tab');
		expect(document.activeElement).toBe(cell(0, 0, true));
		press(cell(0, 0, true), 'F2');
		const button = cell(0, 0, true).querySelector('button')!;
		expect(document.activeElement).toBe(button);
		press(button, 'Escape');
		expect(document.activeElement).toBe(cell(0, 0, true));
		press(cell(0, 0, true), 'Tab');
		expect(document.activeElement).toBe(cell(1, 0));
		press(cell(1, 0), 'Tab', { shiftKey: true });
		expect(document.activeElement).toBe(cell(0, 0, true));
		press(cell(0, 0, true), 'Tab', { shiftKey: true });
		expect(document.activeElement).toBe(cell(0, 2));
		press(cell(0, 2), 'ArrowDown');
		expect(document.activeElement).toBe(cell(0, 0, true));
		press(cell(0, 0, true), 'ArrowDown');
		expect(document.activeElement).toBe(cell(1, 0));
		press(cell(1, 0), 'ArrowUp');
		expect(document.activeElement).toBe(cell(0, 0, true));
		press(cell(0, 0, true), 'ArrowUp');
		expect(document.activeElement).toBe(cell(0, 0));
	});
	it('retains customer cell contexts and registered default-host precedence for dashboard projections', () => {
		component.recentlyEditedDocuments = [
			{ uid: 'customer', title: 'Customer document', properties: { 'dc:modified': '2026-10-01' } },
		];
		const registry = TestBed.inject(ResultsProjectionRegistry);
		registry.register({
			id: 'customer-dashboard-title',
			hostId: 'dashboard-edited',
			projection: 'cell:title',
			mode: 'table',
			component: DashboardTestCell,
		});
		for (const projection of ['action', 'settings', 'rowdetail'] as const)
			registry.register({
				id: `customer-dashboard-${projection}`,
				hostId: 'dashboard-edited',
				projection,
				mode: 'table',
				component: projection === 'rowdetail' ? DashboardTestDetail : DashboardTestAction,
			});
		fixture.changeDetectorRef.markForCheck();
		fixture.detectChanges();
		const custom = fixture.debugElement.query(By.directive(DashboardTestCell))
			.componentInstance as DashboardTestCell;
		expect(custom.context().row.uid).toBe('customer');
		expect(custom.context().column?.id).toBe('title');
		expect(custom.context().readonly).toBeTrue();
		expect(custom.context().loading).toBeFalse();
		expect(fixture.nativeElement.querySelectorAll('th[tabindex]').length).toBe(0);
		const projection = fixture.debugElement.query(By.directive(ResultsProjectionComponent))
			.componentInstance as ResultsProjectionComponent;
		const action = jasmine.createSpy('action');
		projection.action.subscribe(action);
		custom.context().invokeAction('read-only-attempt');
		const actions = fixture.debugElement.queryAll(By.directive(DashboardTestAction));
		expect(actions.length).toBe(2);
		for (const item of actions) {
			const context = (item.componentInstance as DashboardTestAction).context();
			expect(context.row.uid).toBe('customer');
			expect(context.readonly).toBeTrue();
			item.query(By.css('button')).nativeElement.click();
		}
		const detail = fixture.debugElement.query(By.directive(DashboardTestDetail))
			.componentInstance as DashboardTestDetail;
		expect(detail.context().row.uid).toBe('customer');
		expect(action).not.toHaveBeenCalled();
		registry.register({
			id: 'customer-dashboard-default',
			hostId: 'dashboard-edited',
			projection: 'default',
			mode: 'table',
			component: DashboardTestDefault,
		});
		fixture.detectChanges();
		const host = fixture.debugElement.query(By.directive(DashboardTestDefault))
			.componentInstance as DashboardTestDefault;
		expect(host.context().rows.map((row) => row.uid)).toEqual(['customer']);
		expect(host.context().readonly).toBeTrue();
		expect(
			fixture.nativeElement
				.querySelector('#edited-heading')
				.parentElement.querySelector('nx-dashboard-document-table'),
		).toBeNull();
		expect(fixture.nativeElement.querySelectorAll('ag-grid-angular').length).toBe(0);
	});
	it('evaluates recent columns, handles recent and task load errors, updates edited documents in place, and formats avatars', () => {
		const recentCols = component.documentColumnsFor('recent');
		const row = {
			uid: 'doc-1',
			title: 'Recent Doc',
			type: 'File',
			lastViewed: '2026-10-20T00:00:00Z',
			properties: { 'dc:modified': '2026-10-19T00:00:00Z', 'dc:lastContributor': 'Jane Doe' },
		};
		expect(recentCols.map((c) => c.value!(row))).toEqual([
			'Recent Doc',
			'File',
			'2026-10-20T00:00:00Z',
		]);
		expect(recentCols[2].value!({ uid: 'doc-2', title: 'No view', type: 'Note' })).toBe('');
		expect(component.lastViewed(row)).toBe('2026-10-20T00:00:00Z');
		expect(component.lastContributor(row)).toBe('Jane Doe');
		expect(component.lastContributor({})).toBe('');
		expect(component.getInitials('')).toBe('?');
		expect(component.getInitials('Jane Doe')).toBe('JD');
		expect(component.getInitials('admin')).toBe('AD');
		expect(component.getAvatarColor('')).toBe('#1f28bf');
		expect(component.getAvatarColor('Jane Doe')).toMatch(/^#[0-9a-f]{6}$/i);

		// Recent history error path
		history.next([{ uid: 'err-doc', lastViewed: '2026-10-20T00:00:00Z' }]);
		http
			.expectOne((request) => request.url.endsWith('/repo/default/query'))
			.error(new ProgressEvent('error'));
		expect(component.recentError).toBeTrue();
		expect(component.recentlyViewedDocuments).toEqual([]);

		// Update recently edited docs in place when documentsUpdated$ emits
		component.recentlyEditedDocuments = [{ uid: 'doc-1', title: 'Old Title' }];
		(TestBed.inject(DocumentsManagerService).documentsUpdated$ as Subject<any>).next([
			{ uid: 'other', title: 'Other' },
			{ uid: 'doc-1', title: 'Updated Title' },
		]);
		expect(component.recentlyEditedDocuments[0].title).toBe('Updated Title');

		// Task load error path
		const err$ = new Subject<any>();
		workflows.getUserTasks.and.returnValue(err$);
		user.next({ id: 'Administrator' });
		err$.error(new Error('tasks failed'));
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush({ uid: 'favorites' });
		http
			.expectOne((request) => request.url.includes('/default_content_collection/execute'))
			.flush({ entries: [] });
		expect(component.tasksLoading).toBeFalse();
		expect(component.hasWorkflowTasks).toBeFalse();
		expect(component.workflowTasks).toEqual([]);
	});
});
