import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, Subject, of } from 'rxjs';
import { documentViewsNavigationGuard, ViewNavigation } from 'app/extensions/view-navigation';
import { DocumentSearchService } from '../../helpers/document-search.service';
import { SearchQueueService } from '../../helpers/search-queue.service';
import { SearchQueueComponent } from './search-queue.component';

describe('Default search queue', () => {
	function setup(savedSearchId?: string, reopenRequired = false) {
		const close = jasmine.createSpy('close');
		const retry = jasmine.createSpy('retry');
		TestBed.configureTestingModule({
			imports: [SearchQueueComponent],
			providers: [
				provideRouter([]),
				{
					provide: SearchQueueService,
					useValue: {
						active: signal(true),
						epoch: signal(1),
						rows: signal([]),
						total: signal(0),
						loading: signal(false),
						error: signal(reopenRequired ? 'Run the search again.' : ''),
						hasMore: signal(false),
						selectedUid: signal(null),
						reopenRequired: signal(reopenRequired),
						close,
						retry,
						more: jasmine.createSpy('more'),
						select: jasmine.createSpy('select'),
					},
				},
				{
					provide: DocumentSearchService,
					useValue: {
						selectedSavedSearch: signal(savedSearchId ? { id: savedSearchId } : undefined),
						currentPageProviderKey: 'default_search',
						pageProviders: {},
						searchParameters: {},
					},
				},
			],
		});
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		const fixture = TestBed.createComponent(SearchQueueComponent);
		fixture.detectChanges();
		return { fixture, close, retry, navigate };
	}

	it('returns from the opened result to the search results page, as stock', async () => {
		const { fixture, close, navigate } = setup();
		(fixture.nativeElement.querySelector('.search-queue__filters') as HTMLButtonElement).click();
		await fixture.whenStable();
		expect(close).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledOnceWith(['/search/default']);
	});

	it('returns to the results page of the selected saved search', async () => {
		const { fixture, navigate } = setup('saved-1');
		(fixture.nativeElement.querySelector('.search-queue__filters') as HTMLButtonElement).click();
		await fixture.whenStable();
		expect(navigate).toHaveBeenCalledOnceWith(['/search/default', 'saved-1']);
	});

	it('takes the same way back when the queue must be reopened', async () => {
		const { fixture, close, retry, navigate } = setup(undefined, true);
		(fixture.nativeElement.querySelector('.search-queue__more') as HTMLButtonElement).click();
		await fixture.whenStable();
		expect(retry).not.toHaveBeenCalled();
		expect(close).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledOnceWith(['/search/default']);
	});
});

@Component({ changeDetection: ChangeDetectionStrategy.Eager, template: '' })
class QueueNavigationTestPage {}

describe('Default search queue guarded return', () => {
	async function setup() {
		const cancelled = jasmine.createSpy('cancelled');
		const load = jasmine
			.createSpy('loadAppliedQuery')
			.and.returnValues(
				of({ entries: [{ uid: 'one' }, { uid: 'two' }], isNextPageAvailable: true, totalSize: 20 }),
				new Observable(() => () => cancelled()),
				of({ entries: [{ uid: 'three' }], isNextPageAvailable: false, totalSize: 1 }),
			);
		const scope = {
			repository: 'default',
			providerName: 'default_search',
			queryParams: [],
			namedParameters: {},
		};
		const search = {
			selectedSavedSearch: signal(undefined),
			currentPageProviderKey: 'default_search',
			pageProviders: {},
			searchParameters: {},
			searchParametersChanged$: new Subject(),
			appliedQueryInvalidated$: new Subject(),
			getAppliedQuerySnapshot: () => ({
				token: 7,
				scope,
				pageSize: 2,
				sortFields: ['dc:created'],
				sortAscending: false,
			}),
			getAppliedQueryToken: () => 7,
			loadAppliedQuery: load,
		};
		TestBed.configureTestingModule({
			providers: [
				provideRouter([
					{ path: 'doc/:id', component: QueueNavigationTestPage },
					{
						path: 'search/default',
						component: QueueNavigationTestPage,
						canActivate: [documentViewsNavigationGuard],
					},
				]),
				{ provide: DocumentSearchService, useValue: search },
			],
		});
		await RouterTestingHarness.create('/doc/two');
		const router = TestBed.inject(Router);
		const queue = TestBed.inject(SearchQueueService);
		queue.open();
		queue.select('two');
		const fixture = TestBed.createComponent(SearchQueueComponent);
		fixture.detectChanges();
		await fixture.whenStable();
		queue.more();
		expect(queue.loading()).toBeTrue();
		const snapshot = queue.toolbarSnapshot();
		expect(snapshot).toBeDefined();
		return { fixture, router, queue, cancelled, snapshot, load };
	}

	it('preserves paging, the selected result and toolbar scope when a dirty document cancels departure', async () => {
		const { fixture, router, queue, cancelled, snapshot } = await setup();
		const guard = jasmine.createSpy('dirtyGuard').and.resolveTo(false);
		const unregister = TestBed.inject(ViewNavigation).register(guard);
		await fixture.componentInstance.backToFilters();
		expect(guard).toHaveBeenCalledOnceWith('/search/default');
		expect(router.url).toBe('/doc/two');
		expect(cancelled).not.toHaveBeenCalled();
		expect(queue.active()).toBeTrue();
		expect(queue.loading()).toBeTrue();
		expect(queue.rows().map((row) => row.uid)).toEqual(['one', 'two']);
		expect(queue.selectedUid()).toBe('two');
		expect(queue.toolbarSnapshot()).toEqual(snapshot);
		expect(fixture.componentInstance.returningToFilters()).toBeFalse();
		unregister();
		queue.close();
	});

	it('keeps the queue until the guarded return succeeds and ignores duplicate clicks', async () => {
		const { fixture, router, queue, cancelled, snapshot } = await setup();
		let decide!: (accepted: boolean) => void;
		const decision = new Promise<boolean>((resolve) => (decide = resolve));
		const unregister = TestBed.inject(ViewNavigation).register(() => decision);
		const navigate = spyOn(router, 'navigate').and.callThrough();
		const returning = fixture.componentInstance.backToFilters();
		await fixture.componentInstance.backToFilters();
		fixture.detectChanges();
		expect(navigate).toHaveBeenCalledTimes(1);
		expect(fixture.nativeElement.querySelector('.search-queue__filters').disabled).toBeTrue();
		expect(queue.active()).toBeTrue();
		expect(queue.toolbarSnapshot()).toEqual(snapshot);
		expect(cancelled).not.toHaveBeenCalled();
		decide(true);
		await returning;
		expect(router.url).toBe('/search/default');
		expect(queue.active()).toBeFalse();
		expect(queue.loading()).toBeFalse();
		expect(cancelled).toHaveBeenCalledTimes(1);
		expect(fixture.componentInstance.returningToFilters()).toBeFalse();
		unregister();
	});

	it('preserves the queue after failed navigation and retries navigation without another provider request', async () => {
		const { fixture, router, queue, cancelled, snapshot, load } = await setup();
		const navigate = spyOn(router, 'navigate').and.rejectWith(
			new Error('Failed to load the results route'),
		);
		await fixture.componentInstance.backToFilters();
		expect(router.url).toBe('/doc/two');
		expect(cancelled).not.toHaveBeenCalled();
		expect(queue.active()).toBeTrue();
		expect(queue.loading()).toBeTrue();
		expect(queue.selectedUid()).toBe('two');
		expect(queue.toolbarSnapshot()).toEqual(snapshot);
		expect(queue.error()).toBe('');
		expect(fixture.componentInstance.returnError()).toBe('Unable to return to the search filters.');
		expect(fixture.componentInstance.returningToFilters()).toBeFalse();
		fixture.detectChanges();
		const retry = fixture.nativeElement.querySelector('.search-queue__more') as HTMLButtonElement;
		expect(retry.disabled).toBeFalse();
		navigate.and.callThrough();
		retry.click();
		await fixture.whenStable();
		expect(navigate).toHaveBeenCalledTimes(2);
		expect(load).toHaveBeenCalledTimes(2);
		expect(router.url).toBe('/search/default');
		expect(queue.active()).toBeFalse();
		expect(cancelled).toHaveBeenCalledTimes(1);
		expect(fixture.componentInstance.returnError()).toBe('');
	});

	it('does not close a replacement queue when an earlier return finishes', async () => {
		const { fixture, queue } = await setup();
		let decide!: (accepted: boolean) => void;
		const decision = new Promise<boolean>((resolve) => (decide = resolve));
		const unregister = TestBed.inject(ViewNavigation).register(() => decision);
		const returning = fixture.componentInstance.backToFilters();
		queue.open();
		queue.select('three');
		decide(true);
		await returning;
		expect(queue.active()).toBeTrue();
		expect(queue.rows().map((row) => row.uid)).toEqual(['three']);
		expect(queue.selectedUid()).toBe('three');
		unregister();
		queue.close();
	});
});
