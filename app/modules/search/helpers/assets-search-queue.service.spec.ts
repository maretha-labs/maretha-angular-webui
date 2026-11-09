import { WebUiMessages } from 'app/extensions/webui-messages';
import { WebUiLocale } from 'app/extensions/i18n/webui-locale';
import { loadWebUiCatalog } from 'app/helpers/webui-message-catalog';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from 'app/helpers/auth.service';
import { SidebarService } from 'app/helpers/sidebar.service';
import { AssetsSearchQueueService } from './assets-search-queue.service';
import {
	REPOSITORY_SEARCH,
	RepositorySearchParameters,
	RepositorySearchService,
} from './repository-search.service';

describe('AssetsSearchQueueService', () => {
	const criteria = (): RepositorySearchParameters => ({
		text: 'leopard',
		path: '/',
		nxql: '',
		expiredAt: '',
		facets: { system_primaryType_agg: ['Picture'] },
		sortBy: 'dc:title',
		sortOrder: 'asc',
	});
	const document = (uid: string, repository = 'default') => ({
		uid,
		repository,
		path: `/assets/${uid}`,
		title: uid,
	});
	let user: WritableSignal<{ id: string } | null>;
	let search: { search: jasmine.Spy };
	let router: { navigateByUrl: jasmine.Spy };
	let sidebar: { selectTab: jasmine.Spy; closeDrawer: jasmine.Spy; activeTab: () => string };
	let queue: AssetsSearchQueueService;
	let first: Subject<any>;

	beforeEach(() => {
		user = signal<{ id: string } | null>({ id: 'alice' });
		first = new Subject<any>();
		search = { search: jasmine.createSpy().and.returnValue(first) };
		router = { navigateByUrl: jasmine.createSpy().and.resolveTo(true) };
		sidebar = {
			selectTab: jasmine.createSpy(),
			closeDrawer: jasmine.createSpy(),
			activeTab: () => 'assets',
		};
		TestBed.configureTestingModule({
			providers: [
				AssetsSearchQueueService,
				{ provide: AuthService, useValue: { userInfo: user } },
				{ provide: RepositorySearchService, useValue: search },
				{ provide: Router, useValue: router },
				{ provide: SidebarService, useValue: sidebar },
			],
		});
		queue = TestBed.inject(AssetsSearchQueueService);
	});

	it('captures applied criteria, opens the first asset, pages, and returns to the captured search', async () => {
		const applied = criteria();
		queue.open('alice', 'archive', applied, '/page/assets?q=leopard', {
			autoSearch: false,
			selectedSavedSearch: 'saved-assets',
		});
		applied.text = 'unapplied edit';
		(applied.facets['system_primaryType_agg'] as string[]).push('Video');
		expect(search.search).toHaveBeenCalledWith(REPOSITORY_SEARCH.assets, 'archive', criteria(), 0);
		expect(sidebar.selectTab).toHaveBeenCalledWith('assets');
		first.next({
			entries: [{ uid: 'one', path: '/assets/one', title: 'one' }],
			resultsCount: 2,
			isNextPageAvailable: true,
		});
		first.complete();
		await Promise.resolve();
		expect(queue.selectedUid()).toBe('one');
		expect(queue.rows()[0].repository).toBe('archive');
		expect(router.navigateByUrl).toHaveBeenCalledWith('/browse/assets/one?repository=archive');
		const next = new Subject<any>();
		search.search.and.returnValue(next);
		queue.next();
		expect(search.search.calls.mostRecent().args[3]).toBe(1);
		next.next({
			entries: [document('one', 'archive'), document('two', 'archive')],
			resultsCount: 2,
			isNextPageAvailable: false,
		});
		next.complete();
		await Promise.resolve();
		expect(queue.rows().map((row) => row.uid)).toEqual(['one', 'two']);
		expect(queue.selectedUid()).toBe('two');
		queue.previous();
		await Promise.resolve();
		expect(queue.selectedUid()).toBe('one');
		await queue.backToFilters();
		expect(router.navigateByUrl).toHaveBeenCalledWith('/page/assets?q=leopard');
		expect(sidebar.selectTab.calls.mostRecent().args).toEqual(['assets']);
		expect(sidebar.closeDrawer).not.toHaveBeenCalled();
		expect(queue.active()).toBeFalse();
		expect(queue.rows()).toEqual([]);
		expect(queue.consumeViewState('bob', 'archive', '/page/assets?q=leopard')).toBeUndefined();
		expect(queue.consumeViewState('alice', 'archive', '/page/assets?q=leopard')).toEqual({
			autoSearch: false,
			selectedSavedSearch: 'saved-assets',
		});
		expect(queue.consumeViewState('alice', 'archive', '/page/assets?q=leopard')).toBeUndefined();
	});

	it('cancels old requests and ignores responses after the signed-in user changes', () => {
		queue.open('alice', 'default', criteria(), '/page/assets');
		const second = new Subject<any>();
		search.search.and.returnValue(second);
		queue.open('alice', 'archive', criteria(), '/page/assets?q=new');
		expect(first.observed).toBeFalse();
		first.next({ entries: [document('stale')] });
		expect(queue.rows()).toEqual([]);
		user.set({ id: 'bob' });
		expect(queue.active()).toBeFalse();
		second.next({ entries: [document('private', 'archive')] });
		expect(queue.rows()).toEqual([]);
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		TestBed.flushEffects();
		expect(second.observed).toBeFalse();
		queue.open('alice', 'default', criteria(), '/page/assets');
		expect(search.search).toHaveBeenCalledTimes(2);
	});

	it('retains a queue when navigation is declined, and never mixes repositories', async () => {
		router.navigateByUrl.and.resolveTo(false);
		queue.open('alice', 'archive', criteria(), '/page/assets', {
			autoSearch: false,
			selectedSavedSearch: 'saved-assets',
		});
		first.next({
			entries: [document('wrong'), document('one', 'archive')],
			resultsCount: 1,
			isNextPageAvailable: false,
		});
		first.complete();
		await Promise.resolve();
		expect(queue.rows().map((row) => row.uid)).toEqual(['one']);
		expect(queue.selectedUid()).toBeNull();
		await queue.backToFilters();
		expect(queue.active()).toBeTrue();
		expect(sidebar.closeDrawer).not.toHaveBeenCalled();
		expect(queue.consumeViewState('alice', 'archive', '/page/assets')).toBeUndefined();
	});

	it('retries a failed page without advancing it and stops paging duplicate responses', async () => {
		queue.open('alice', 'default', criteria(), '/page/assets');
		first.error(new Error('offline'));
		expect(queue.error()).toContain('Retry');
		const retried = new Subject<any>();
		search.search.and.returnValue(retried);
		queue.retry();
		expect(search.search.calls.mostRecent().args[3]).toBe(0);
		retried.next({ entries: [document('one')], resultsCount: 2, isNextPageAvailable: true });
		retried.complete();
		await Promise.resolve();
		const duplicate = new Subject<any>();
		search.search.and.returnValue(duplicate);
		queue.more();
		duplicate.next({ entries: [document('one')], resultsCount: 2, isNextPageAvailable: true });
		duplicate.complete();
		expect(queue.hasMore()).toBeFalse();
		expect(queue.rows().length).toBe(1);
	});
	it('reformats retained loading and navigation errors after a locale change', async () => {
		TestBed.inject(WebUiMessages).register('assets-queue-test', {
			es: await loadWebUiCatalog('es'),
			ar: await loadWebUiCatalog('ar'),
		});
		const locale = TestBed.inject(WebUiLocale);
		locale.locale.set('es');
		queue.open('alice', 'default', criteria(), '/page/assets');
		first.error(new Error('transport detail'));
		expect(queue.error()).toBe(
			'No se ha podido cargar la cola de recursos. Vuelva a intentarlo para continuar.',
		);
		locale.locale.set('ar');
		expect(queue.error()).toBe('تعذّر تحميل قائمة الأصول. أعد المحاولة للمتابعة.');
		router.navigateByUrl.and.rejectWith(new Error('navigation detail'));
		await queue.backToFilters();
		expect(queue.error()).toBe('تعذّرت العودة إلى عوامل تصفية البحث.');
		locale.locale.set('es');
		expect(queue.error()).toBe('No se ha podido volver a los filtros de búsqueda.');
		expect(queue.kind()).toBe('assets');
		expect(queue.canNext()).toBeTrue();
		expect(queue.canPrevious()).toBeFalse();
	});

	it('opens the Expired drawer on the provider default query with one request and no navigation', async () => {
		queue.openDefault('alice', 'archive', 'expired');
		expect(queue.kind()).toBe('expired');
		expect(queue.filtersRequested()).toBeFalse();
		expect(sidebar.selectTab).toHaveBeenCalledWith('expired');
		const [definition, repository, parameters, page] = search.search.calls.mostRecent().args;
		expect(definition).toBe(REPOSITORY_SEARCH.expired);
		expect(repository).toBe('archive');
		expect(page).toBe(0);
		expect(parameters.text).toBe('');
		expect(parameters.expiredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		first.next({
			entries: [document('one', 'archive')],
			resultsCount: 1,
			isNextPageAvailable: false,
			quickFilters: [{ name: 'expiredThisWeek', active: false }],
		});
		first.complete();
		await Promise.resolve();
		expect(queue.rows().length).toBe(1);
		expect(queue.selectedUid()).toBeNull();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		expect(queue.quickFilters()).toEqual([{ name: 'expiredThisWeek', active: false }]);
		queue.showFilters();
		expect(queue.active()).toBeFalse();
		expect(queue.filtersRequested()).toBeTrue();
		expect(queue.quickFilters()).toEqual([]);
		expect(queue.kind()).toBe('assets');
		queue.openDefault('alice', 'archive', 'expired');
		expect(queue.filtersRequested()).toBeFalse();
		await queue.backToFilters();
		expect(router.navigateByUrl).toHaveBeenCalledWith('/page/expired');
	});

	it('reloads the first page on a quick-filter toggle, cancelling the page in flight', async () => {
		queue.open('alice', 'default', criteria(), '/elsewhere');
		first.next({
			entries: [document('one'), document('two')],
			resultsCount: 2,
			isNextPageAvailable: true,
		});
		first.complete();
		await Promise.resolve();
		expect(queue.rows().length).toBe(2);
		expect(queue.total()).toBe(2);
		expect(queue.navigating()).toBeFalse();
		const pending = new Subject<any>();
		search.search.and.returnValue(pending);
		queue.more();
		expect(pending.observed).toBeTrue();
		queue.toggleQuickFilter('ignored while loading');
		expect(search.search).toHaveBeenCalledTimes(2);
		pending.next({ entries: [document('three')], resultsCount: 3, isNextPageAvailable: false });
		pending.complete();
		const filtered = new Subject<any>();
		search.search.and.returnValue(filtered);
		queue.toggleQuickFilter('pictures');
		expect(queue.rows()).toEqual([]);
		expect(queue.total()).toBeNull();
		expect(queue.hasMore()).toBeTrue();
		expect(search.search.calls.mostRecent().args[3]).toBe(0);
		let parameters = search.search.calls.mostRecent().args[2];
		expect(parameters.quickFilters).toEqual(['pictures']);
		filtered.next({ entries: [document('four')], resultsCount: 1, isNextPageAvailable: false });
		filtered.complete();
		expect(queue.rows().map((row) => row.uid)).toEqual(['four']);
		queue.toggleQuickFilter('pictures');
		parameters = search.search.calls.mostRecent().args[2];
		expect(parameters.quickFilters).toEqual([]);
		expect(search.search).toHaveBeenCalledTimes(4);
		queue.close();
		queue.toggleQuickFilter('pictures');
		expect(search.search).toHaveBeenCalledTimes(4);
		expect(queue.kind()).toBe('assets');
	});

	it('guards paging, selection and return while idle, loading or navigating', async () => {
		expect(search.search).not.toHaveBeenCalled();
		queue.more();
		queue.retry();
		queue.next();
		queue.previous();
		await queue.backToFilters();
		await queue.select(document('nothing'));
		expect(search.search).not.toHaveBeenCalled();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		queue.open('bob', 'default', criteria(), '/page/assets');
		expect(search.search).not.toHaveBeenCalled();
		queue.open('alice', 'default', criteria(), '/page/assets', undefined, 'assets', false);
		queue.next();
		expect(search.search).toHaveBeenCalledTimes(1);
		first.next({
			entries: [document('one'), document('two')],
			resultsCount: 3,
			isNextPageAvailable: true,
		});
		first.complete();
		await queue.select(document('one'));
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		queue.next();
		expect(router.navigateByUrl).toHaveBeenCalledWith('/browse/assets/one');
		queue.next();
		expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		expect(queue.selectedUid()).toBe('one');
		await queue.select(queue.rows()[1]);
		expect(queue.selectedUid()).toBe('two');
		const more = new Subject<any>();
		search.search.and.returnValue(more);
		queue.next();
		expect(search.search.calls.mostRecent().args[3]).toBe(1);
		queue.retry();
		expect(search.search).toHaveBeenCalledTimes(2);
		more.next({ entries: [document('three')], resultsCount: 3, isNextPageAvailable: false });
		more.complete();
		await Promise.resolve();
		expect(queue.selectedUid()).toBe('three');
		const stuck = new Subject<any>();
		search.search.and.returnValue(stuck);
		queue.retry();
		expect(search.search.calls.mostRecent().args[3]).toBe(2);
		queue.retry();
		expect(search.search).toHaveBeenCalledTimes(3);
	});

	it('reports a failed asset navigation on the queue and forgets restoration state on sign-out', async () => {
		queue.open('alice', 'default', criteria(), '/page/assets', {
			autoSearch: true,
			selectedSavedSearch: '',
		});
		first.next({ entries: [document('one')], resultsCount: 1, isNextPageAvailable: false });
		first.complete();
		await Promise.resolve();
		expect(queue.selectedUid()).toBe('one');
		router.navigateByUrl.and.rejectWith(new Error('blocked'));
		await queue.select(queue.rows()[0]);
		expect(queue.error()).toBe('Unable to open this asset.');
		expect(queue.navigating()).toBeFalse();
		router.navigateByUrl.and.resolveTo(true);
		await queue.backToFilters();
		expect(queue.active()).toBeFalse();
		user.set({ id: 'bob' });
		TestBed.flushEffects();
		user.set({ id: 'alice' });
		TestBed.flushEffects();
		expect(queue.consumeViewState('alice', 'default', '/page/assets')).toBeUndefined();
	});
});
