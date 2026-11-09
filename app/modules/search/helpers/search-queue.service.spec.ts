import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SearchQueueService } from './search-queue.service';
import { DocumentSearchService } from './document-search.service';

describe('SearchQueueService', () => {
	it('pages an applied snapshot and drops a response after the query changes', () => {
		const first = new Subject<any>();
		const next = new Subject<any>();
		const changed = new Subject<any>();
		const invalidated = new Subject<void>();
		let token = 7;
		const search = {
			getAppliedQuerySnapshot: jasmine.createSpy().and.returnValue({
				token,
				scope: {
					repository: 'default',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: {},
				},
				pageSize: 25,
				sortFields: ['dc:created'],
				sortAscending: false,
			}),
			getAppliedQueryToken: () => token,
			loadAppliedQuery: jasmine.createSpy().and.returnValues(first, next),
			searchParametersChanged$: changed,
			appliedQueryInvalidated$: invalidated,
		};
		TestBed.configureTestingModule({
			providers: [SearchQueueService, { provide: DocumentSearchService, useValue: search }],
		});
		const service = TestBed.inject(SearchQueueService);
		service.open();
		first.next({ entries: [{ uid: 'one' }], isNextPageAvailable: true, resultsCount: 2 });
		first.complete();
		expect(service.toolbarSnapshot()).toEqual({
			scope: {
				repository: 'default',
				providerName: 'default_search',
				queryParams: [],
				namedParameters: {},
			},
			token: 7,
			total: 2,
		});
		expect(service.rows().map((row) => row.uid)).toEqual(['one']);
		service.more();
		next.next({ entries: [{ uid: 'two' }], isNextPageAvailable: false, totalSize: 2 });
		next.complete();
		expect(search.loadAppliedQuery.calls.allArgs().map((args: any[]) => args.slice(1))).toEqual([
			[0, 25, ['dc:created'], false],
			[1, 25, ['dc:created'], false],
		]);
		expect(service.rows().map((row) => row.uid)).toEqual(['one', 'two']);

		const stale = new Subject<any>();
		search.loadAppliedQuery.and.returnValue(stale);
		service.open();
		token++;
		stale.next({ entries: [{ uid: 'stale' }], isNextPageAvailable: false });
		expect(service.rows()).toEqual([]);

		changed.next({ searchFields: { ecm_fulltext: 'new query' } });
		expect(service.toolbarSnapshot()).toBeUndefined();
		expect(service.rows()).toEqual([]);
		expect(service.error()).toContain('search changed');
		expect(service.reopenRequired()).toBeTrue();
		service.retry();
		expect(service.active()).toBeFalse();
	});

	it('cancels a pending request before it closes or reopens the queue', () => {
		const first = new Subject<any>();
		const second = new Subject<any>();
		const search = {
			getAppliedQuerySnapshot: jasmine.createSpy().and.returnValue({
				token: 3,
				scope: {
					repository: 'default',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: {},
				},
				pageSize: 40,
				sortFields: [],
				sortAscending: true,
			}),
			getAppliedQueryToken: () => 3,
			loadAppliedQuery: jasmine.createSpy().and.returnValues(first, second),
			searchParametersChanged$: new Subject<any>(),
			appliedQueryInvalidated$: new Subject<void>(),
		};
		TestBed.configureTestingModule({
			providers: [SearchQueueService, { provide: DocumentSearchService, useValue: search }],
		});
		const service = TestBed.inject(SearchQueueService);
		service.open();
		service.close();
		expect(service.loading()).toBeFalse();
		service.open();
		expect(search.loadAppliedQuery).toHaveBeenCalledTimes(2);
		second.next({ entries: [{ uid: 'fresh' }], isNextPageAvailable: false });
		second.complete();
		expect(service.rows().map((row) => row.uid)).toEqual(['fresh']);
		first.error(new Error('stale'));
		expect(service.error()).toBe('');
	});

	it('refreshes only the still-active captured scope and replaces its rows', () => {
		const initial = new Subject<any>();
		const refreshed = new Subject<any>();
		const search = {
			getAppliedQuerySnapshot: jasmine.createSpy().and.returnValue({
				token: 11,
				scope: {
					repository: 'repo-a',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: { ecm_fulltext: 'Maretha' },
				},
				pageSize: 25,
				sortFields: [],
				sortAscending: true,
			}),
			getAppliedQueryToken: () => 11,
			loadAppliedQuery: jasmine.createSpy().and.returnValues(initial, refreshed),
			searchParametersChanged$: new Subject<any>(),
			appliedQueryInvalidated$: new Subject<void>(),
		};
		TestBed.configureTestingModule({
			providers: [SearchQueueService, { provide: DocumentSearchService, useValue: search }],
		});
		const service = TestBed.inject(SearchQueueService);
		service.open('repo-a');
		initial.next({ entries: [{ uid: 'trashed-file' }], isNextPageAvailable: false, totalSize: 1 });
		initial.complete();

		const snapshot = service.toolbarSnapshot()!;
		expect(service.refresh(snapshot.scope, snapshot.token)).toBeTrue();
		expect(service.rows()).toEqual([]);
		refreshed.next({ entries: [], isNextPageAvailable: false, totalSize: 0 });
		refreshed.complete();
		expect(service.rows()).toEqual([]);
		expect(service.toolbarSnapshot()?.total).toBe(0);
		expect(search.loadAppliedQuery.calls.allArgs().map((args: any[]) => args[0])).toEqual([
			snapshot.scope,
			snapshot.scope,
		]);

		expect(service.refresh({ ...snapshot.scope, repository: 'other' }, snapshot.token)).toBeFalse();
	});
	it('reformats a retained queue failure when the locale changes and keeps literal state literal', async () => {
		const request = new Subject<any>();
		const search = {
			getAppliedQuerySnapshot: () => ({
				token: 1,
				scope: {
					repository: 'default',
					providerName: 'default_search',
					queryParams: [],
					namedParameters: {},
				},
				pageSize: 25,
				sortFields: [],
				sortAscending: true,
			}),
			getAppliedQueryToken: () => 1,
			loadAppliedQuery: () => request,
			searchParametersChanged$: new Subject<any>(),
			appliedQueryInvalidated$: new Subject<void>(),
		};
		TestBed.configureTestingModule({
			providers: [SearchQueueService, { provide: DocumentSearchService, useValue: search }],
		});
		const messages = TestBed.inject(WebUiMessages);
		messages.register('queue-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.locale.set('es');
		const queue = TestBed.inject(SearchQueueService);
		queue.open();
		request.error(new Error('transport detail'));
		expect(queue.error()).toBe(
			'No se ha podido cargar esta cola de búsqueda. Vuelva a intentarlo para continuar.',
		);
		locale.locale.set('ar');
		expect(queue.error()).toBe('تعذّر تحميل قائمة نتائج البحث. أعد المحاولة للمتابعة.');
		queue.error.set('Customer {count} <b>literal</b>');
		locale.locale.set('es');
		expect(queue.error()).toBe('Customer {count} <b>literal</b>');
	});
});
