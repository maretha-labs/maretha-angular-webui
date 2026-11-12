import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { AnalyticsService } from '../../helpers/analytics.service';
import { DirectoryService } from '../../helpers/directory.service';
import { TranslateModule } from '@ngx-translate/core';
import { provideRouter } from '@angular/router';
import { POLYMER_MESSAGES, WebUiMessages } from '@maretha/webui-sdk';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StandardDocumentHistoryViewComponent } from '../../../explorer/components/viewers/standard-document-history-view.component';
import { AuditComponent } from './audit.component';

describe('AuditComponent', () => {
	let fixture: ComponentFixture<AuditComponent>;
	let component: AuditComponent;
	let requests: Subject<any>[];

	beforeEach(async () => {
		requests = [];
		await TestBed.configureTestingModule({
			imports: [AuditComponent, StandardDocumentHistoryViewComponent, TranslateModule.forRoot()],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{
					provide: AnalyticsService,
					useValue: {
						getAuditEvents: jasmine.createSpy('getAuditEvents').and.callFake(() => {
							const request = new Subject<any>();
							requests.push(request);
							return request;
						}),
						getUserSuggestions: jasmine
							.createSpy('getUserSuggestions')
							.and.returnValue(new Subject<any>()),
					},
				},
				{ provide: DirectoryService, useValue: { listEntries: () => new Subject<any>() } },
				provideRouter([]),
			],
		}).compileComponents();
		fixture = TestBed.createComponent(AuditComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('resolves catalog event labels with an ID fallback and preserves directory labels', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('audit-identity', {
			fr: {
				'eventType.documentCreated': 'Document créé',
				'eventCategory.eventDocumentCategory': 'Événements document',
				'eventType.customEvent': 'Must not replace custom ID',
			},
		});
		messages.locale.set('fr');
		expect(component.eventLabel('documentCreated')).toBe('Document créé');
		expect(component.eventLabel('customEvent')).toBe('Must not replace custom ID');
		expect(component.eventLabel('unknownEvent')).toBe('unknownEvent');
		expect(component.categoryLabel()).toBe('—');
		expect(component.categoryLabel('eventDocumentCategory')).toBe('Événements document');
		expect(component.categoryLabel('customerCategory')).toBe('customerCategory');
		expect(component.directoryLabel(undefined, 'eventType')).toBe('');
		expect(
			component.directoryLabel(
				{
					id: 'documentCreated',
					directoryName: 'eventTypes',
					properties: { label: 'Customer title' },
				},
				'eventType',
			),
		).toBe('Customer title');
		expect(
			component.directoryLabel(
				{ id: 'documentCreated', directoryName: 'eventTypes', properties: { label: '  ' } },
				'eventType',
			),
		).toBe('Document créé');
		expect(
			component.directoryLabel(
				{ id: 'eventDocumentCategory', directoryName: 'eventCategories', properties: { label: 7 } },
				'eventCategory',
			),
		).toBe('Événements document');
	});
	it('associates each custom filter label with its native input across multiple audit panels', () => {
		const inputs = (root: HTMLElement) =>
			Array.from(root.querySelectorAll<HTMLInputElement>('ng-select input'));
		const firstInputs = inputs(fixture.nativeElement);
		expect(firstInputs.length).toBe(3);
		for (const input of firstInputs) {
			expect(input.labels?.length).withContext(input.outerHTML).toBe(1);
			expect(input.labels?.[0]?.textContent?.trim()).toBeTruthy();
		}
		const firstIds = firstInputs.map((input) => input.id);
		const second = TestBed.createComponent(AuditComponent);
		second.detectChanges();
		const secondInputs = inputs(second.nativeElement);
		for (const input of secondInputs)
			expect(input.labels?.length).withContext(input.outerHTML).toBe(1);
		expect(new Set([...firstIds, ...secondInputs.map((input) => input.id)]).size).toBe(6);
		second.destroy();
	});

	it('sends filters, paginates, and renders the returned records', () => {
		component.principalName = 'alice';
		component.eventCategory = 'eventDocumentCategory';
		component.eventIds = ['documentCreated', 'documentModified'];
		component.startDate = '2026-09-01';
		component.endDate = '2026-09-02';
		component.refresh();
		expect(TestBed.inject(AnalyticsService).getAuditEvents).toHaveBeenCalledWith(
			{
				principalName: 'alice',
				eventCategory: 'eventDocumentCategory',
				eventIds: ['documentCreated', 'documentModified'],
				startDate: '2026-09-01',
				endDate: '2026-09-02',
			},
			0,
			40,
			'eventDate',
			'DESC',
		);
		requests[1].next({
			entries: [
				{
					id: 7,
					eventId: 'documentCreated',
					eventDate: '2026-09-01T10:00:00Z',
					principalName: 'alice',
				},
			],
			resultsCount: 41,
			isNextPageAvailable: true,
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Document created');
		component.principalName = 'unsaved-draft';
		component.next();
		expect(TestBed.inject(AnalyticsService).getAuditEvents).toHaveBeenCalledWith(
			{
				principalName: 'alice',
				eventCategory: 'eventDocumentCategory',
				eventIds: ['documentCreated', 'documentModified'],
				startDate: '2026-09-01',
				endDate: '2026-09-02',
			},
			1,
			40,
			'eventDate',
			'DESC',
		);
	});

	it('ignores a stale response after a newer filter request', () => {
		requests[0].next({
			entries: [{ id: 1, eventId: 'first', eventDate: '2026-09-01T00:00:00Z' }],
			resultsCount: 1,
			isNextPageAvailable: false,
		});
		component.refresh();
		expect(component.entries).toEqual([]);
		requests[0].next({
			entries: [{ id: 1, eventId: 'stale', eventDate: '2026-09-01T00:00:00Z' }],
			resultsCount: 1,
		});
		requests[1].next({
			entries: [{ id: 2, eventId: 'fresh', eventDate: '2026-09-01T00:00:00Z' }],
			resultsCount: 1,
		});
		expect(component.entries.map((entry) => entry.eventId)).toEqual(['fresh']);
	});

	it('shows an endpoint error and rejects an invalid date range', () => {
		requests[0].error(new Error('forbidden'));
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Audit records are unavailable');
		component.startDate = '2026-09-03';
		component.endDate = '2026-09-02';
		component.refresh();
		expect(component.error).toContain('start date');
	});

	it('paginates the applied query when a later draft date range is invalid', () => {
		requests[0].next({ entries: [], resultsCount: 40, isNextPageAvailable: true });
		component.principalName = 'alice';
		component.refresh();
		requests[1].next({ entries: [], resultsCount: 40, isNextPageAvailable: true });
		component.startDate = '2026-09-03';
		component.endDate = '2026-09-02';
		component.next();
		expect(TestBed.inject(AnalyticsService).getAuditEvents).toHaveBeenCalledWith(
			{ principalName: 'alice' },
			1,
			40,
			'eventDate',
			'DESC',
		);
	});

	it('sorts through the provider without applying later draft changes', () => {
		requests[0].next({ entries: [], resultsCount: 40, isNextPageAvailable: true });
		component.principalName = 'alice';
		component.refresh();
		requests[1].next({ entries: [], resultsCount: 40, isNextPageAvailable: true });
		component.principalName = 'unsaved draft';
		component.sort('principalName');
		expect(TestBed.inject(AnalyticsService).getAuditEvents).toHaveBeenCalledWith(
			{ principalName: 'alice' },
			0,
			40,
			'principalName',
			'ASC',
		);
	});

	it('keeps empty document history sortable and lets users hide its columns', () => {
		TestBed.inject(WebUiMessages).register('polymer', POLYMER_MESSAGES);
		const history = TestBed.createComponent(StandardDocumentHistoryViewComponent);
		history.componentRef.setInput('context', {
			document: { uid: 'note-1', repository: 'default' },
		});
		history.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/id/note-1/@audit'))
			.flush({
				entries: [],
				resultsCount: 0,
				isNextPageAvailable: false,
			});
		history.detectChanges();
		const element: HTMLElement = history.nativeElement;
		expect(
			Array.from(element.querySelectorAll('.nx-audit__filters > label')).map((label) =>
				label.querySelector('[name]')?.getAttribute('name'),
			),
		).toEqual(['principalName', 'startDate', 'endDate', 'eventIds', 'eventCategory']);
		expect(element.querySelectorAll('th').length).toBe(6);
		expect(element.querySelector('.nx-audit__empty')?.textContent).toContain('No Results');
		(element.querySelector('.nx-audit__columns input') as HTMLInputElement).click();
		history.detectChanges();
		expect(element.querySelector('th')?.hidden).toBeTrue();
		(element.querySelector('button[aria-label^="Sort by date"]') as HTMLButtonElement).click();
		const sorted = http.expectOne((request) => request.url.endsWith('/id/note-1/@audit'));
		expect(sorted.request.params.get('sortBy')).toBe('eventDate');
		expect(sorted.request.params.get('sortOrder')).toBe('asc');
		sorted.flush({
			entries: [
				{
					id: 1,
					eventId: 'documentCheckedIn',
					principalName: 'Administrator',
					eventDate: '2026-09-17',
				},
			],
			resultsCount: 1,
			isNextPageAvailable: false,
		});
		history.detectChanges();
		expect(element.textContent).toContain('Created a version');
		expect(element.textContent).toContain('Performed Action');
		http
			.expectOne((request) => request.url.endsWith('/user/Administrator'))
			.flush({
				id: 'Administrator',
				properties: { username: 'Administrator', email: 'admin@example.invalid' },
			});
		history.detectChanges();
		// Stock nuxeo-user-tag shows the audit principal identifier, not the resolved email.
		const tag = element.querySelector('nx-user-tag');
		expect(tag?.textContent).toContain('Administrator');
		expect(tag?.textContent).not.toContain('admin@example.invalid');
		expect(tag?.querySelector('.avatar')?.getAttribute('data-initials')).toBe('A');
		http.verify();
		history.destroy();
	});

	it('clears scoped suggestion filters safely and applies source inverted-date correction', fakeAsync(() => {
		const history = TestBed.createComponent(StandardDocumentHistoryViewComponent);
		history.componentRef.setInput('context', {
			document: { uid: 'filters', repository: 'default' },
		});
		history.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const audit = () => http.expectOne((request) => request.url.endsWith('/id/filters/@audit'));
		audit().flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		const scoped = history.componentInstance;
		scoped.principalName = 'Administrator';
		scoped.eventCategory = 'document';
		scoped.eventIds = ['documentCreated', 'documentModified'];
		scoped.startDate = '2026-09-20';
		scoped.endDate = '2026-09-17';
		scoped.refresh();
		const filtered = audit();
		expect(filtered.request.params.getAll('eventId')).toEqual([
			'documentCreated',
			'documentModified',
		]);
		expect(filtered.request.params.get('startEventDate')).toBe('2026-09-10');
		expect(filtered.request.params.get('endEventDate')).toBe('2026-09-17');
		filtered.flush({ entries: [], resultsCount: 50, isNextPageAvailable: true });
		scoped.next();
		const next = audit();
		expect(next.request.params.get('currentPageIndex')).toBe('1');
		expect(next.request.params.get('principalName')).toBe('Administrator');
		next.flush({ entries: [], resultsCount: 50, isNextPageAvailable: false });
		Object.assign(scoped, {
			principalName: null,
			eventCategory: null,
			eventIds: null,
			startDate: null,
			endDate: null,
		});
		scoped.scheduleApply();
		tick(301);
		const cleared = audit();
		expect(cleared.request.params.get('currentPageIndex')).toBe('0');
		for (const key of ['principalName', 'category', 'eventId', 'startEventDate', 'endEventDate'])
			expect(cleared.request.params.has(key)).toBeFalse();
		cleared.flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		history.destroy();
		http.verify();
	}));

	it('cancels previous-document history even when the new route has an invalid date draft', () => {
		const history = TestBed.createComponent(StandardDocumentHistoryViewComponent);
		history.componentRef.setInput('context', { document: { uid: 'old', repository: 'default' } });
		history.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const old = http.expectOne((request) => request.url.endsWith('/id/old/@audit'));
		history.componentInstance.startDate = 'invalid';
		history.componentRef.setInput('context', {
			document: { uid: 'new', repository: 'second-repository' },
		});
		history.detectChanges();
		expect(old.cancelled).toBeTrue();
		expect(history.componentInstance.entries).toEqual([]);
		expect(history.componentInstance.loading).toBeFalse();
		expect(history.componentInstance.error).toContain('valid audit dates');
		http.expectNone((request) => request.url.includes('/id/new/@audit'));
		history.componentInstance.startDate = '';
		history.componentInstance.refresh();
		const current = http.expectOne((request) =>
			request.url.endsWith('/repo/second-repository/id/new/@audit'),
		);
		expect(current.request.params.get('currentPageIndex')).toBe('0');
		current.flush({
			entries: [{ id: 2, eventId: 'documentCreated' }],
			resultsCount: 1,
			isNextPageAvailable: false,
		});
		expect(history.componentInstance.entries.map((entry) => entry.id)).toEqual([2]);
		history.componentRef.setInput('context', { document: null });
		history.detectChanges();
		expect(history.componentInstance.entries).toEqual([]);
		http.expectNone((request) => request.url.includes('/id//@audit'));
		history.destroy();
		http.verify();
	});

	it('links audit rows by document id before path, flips sort order on the active column, and keeps all columns outside document scope', () => {
		expect(
			component.documentLink({ docUUID: 'abc-123', docPath: '/default-domain/a' } as any),
		).toBe('/browse/documents/abc-123');
		expect(
			component.documentLink({ docUUID: 'bad id!', docPath: '/default-domain/a' } as any),
		).toBe('/browse/default-domain/a');
		expect(component.documentLink({ docPath: 'relative' } as any)).toBeNull();
		expect(component.isColumnVisible('eventId')).toBeTrue();
		component.setColumnVisible('eventId', false);
		expect(component.isColumnVisible('eventId')).toBeTrue();
		component.setColumnVisible('eventId', true);
		requests[0].next({ entries: [], resultsCount: 80, isNextPageAvailable: true });
		component.next();
		expect(component.page).toBe(1);
		component.previous();
		component.previous();
		expect(component.page).toBe(0);
		const events = TestBed.inject(AnalyticsService).getAuditEvents as jasmine.Spy;
		component.sort('eventDate');
		expect(events.calls.mostRecent().args.slice(3)).toEqual(['eventDate', 'ASC']);
		component.sort('eventDate');
		expect(events.calls.mostRecent().args.slice(3)).toEqual(['eventDate', 'DESC']);
		component.sort('principalName');
		component.sort('eventDate');
		expect(events.calls.mostRecent().args.slice(3)).toEqual(['eventDate', 'DESC']);
		expect(component.text('missing.key', 'Fallback')).toBe('Fallback');
	});

	it('suggests users for a long enough username after the stock pause and clears them for short ones', fakeAsync(() => {
		const suggestions = TestBed.inject(AnalyticsService).getUserSuggestions as jasmine.Spy;
		suggestions.and.returnValue(of(['alice', 'alina']));
		component.onUsernameInput('al');
		tick(300);
		expect(suggestions).not.toHaveBeenCalled();
		expect(component.userSuggestions).toEqual([]);
		component.onUsernameInput(' ali ');
		tick(300);
		expect(suggestions).toHaveBeenCalledOnceWith('ali');
		expect(component.userSuggestions).toEqual(['alice', 'alina']);
		component.onUsernameInput('a');
		tick(300);
		expect(component.userSuggestions).toEqual([]);
		// Each username keystroke also schedules one debounced filter refresh.
		expect(requests.length).toBe(4);
	}));
});
