import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { LazyLoadDirective } from 'app/directives/lazy-load.directive';
import { ResultsPagingSettings } from '@maretha/webui-sdk';
import { AssetsSearchQueueService } from '../../helpers/assets-search-queue.service';
import { AssetsSearchQueueComponent } from './assets-search-queue.component';

describe('Assets search queue paging', () => {
	it('keeps Load more available and permits scroll paging only while enabled', () => {
		const more = jasmine.createSpy('more');
		TestBed.configureTestingModule({
			imports: [AssetsSearchQueueComponent],
			providers: [
				{
					provide: AssetsSearchQueueService,
					useValue: {
						rows: signal([]),
						kind: signal('assets'),
						quickFilters: signal([]),
						total: signal(51),
						loading: signal(false),
						navigating: signal(false),
						error: signal(''),
						hasMore: signal(true),
						more,
					},
				},
			],
		});
		const fixture = TestBed.createComponent(AssetsSearchQueueComponent);
		fixture.detectChanges();
		const viewport = fixture.nativeElement.querySelector('.queue-scroll') as HTMLElement;
		Object.defineProperties(viewport, {
			scrollHeight: { value: 1000 },
			scrollTop: { value: 500 },
			clientHeight: { value: 500 },
		});
		viewport.dispatchEvent(new Event('scroll'));
		expect(more).not.toHaveBeenCalled();
		const loadMore = [...viewport.querySelectorAll('button')].find((button) =>
			button.textContent?.includes('Load more'),
		)!;
		loadMore.click();
		expect(more).toHaveBeenCalledTimes(1);
		const settings = TestBed.inject(ResultsPagingSettings);
		settings.apply({ scrollPagingEnabled: true });
		viewport.dispatchEvent(new Event('scroll'));
		expect(more).toHaveBeenCalledTimes(2);
		settings.apply({ scrollPagingEnabled: false });
		viewport.dispatchEvent(new Event('scroll'));
		expect(more).toHaveBeenCalledTimes(2);
	});
});

describe('Assets search queue header and rows', () => {
	function mount(kind: 'assets' | 'expired', rows: readonly any[]) {
		const queue = {
			rows: signal(rows),
			kind: signal(kind),
			quickFilters: signal([{ name: 'quickFilter', active: true }]),
			total: signal(rows.length),
			loading: signal(false),
			navigating: signal(false),
			error: signal(''),
			hasMore: signal(false),
			selectedUid: signal<string | null>(null),
			more: jasmine.createSpy('more'),
			showFilters: jasmine.createSpy('showFilters'),
			backToFilters: jasmine.createSpy('backToFilters').and.resolveTo(),
			toggleQuickFilter: jasmine.createSpy('toggleQuickFilter'),
		};
		TestBed.configureTestingModule({
			imports: [AssetsSearchQueueComponent],
			providers: [{ provide: AssetsSearchQueueService, useValue: queue }],
		});
		const fixture = TestBed.createComponent(AssetsSearchQueueComponent);
		fixture.detectChanges();
		return { fixture, queue, element: fixture.nativeElement as HTMLElement };
	}
	it('swaps the Expired queue for its filter form in place without navigating', () => {
		const { element, queue } = mount('expired', []);
		(element.querySelector('header button') as HTMLButtonElement).click();
		expect(queue.showFilters).toHaveBeenCalledTimes(1);
		expect(queue.backToFilters).not.toHaveBeenCalled();
	});
	it('returns the Assets queue to its results page and toggles quick-filter pills', () => {
		const { element, queue } = mount('assets', []);
		(element.querySelector('header button') as HTMLButtonElement).click();
		expect(queue.backToFilters).toHaveBeenCalledTimes(1);
		expect(queue.showFilters).not.toHaveBeenCalled();
		const pill = element.querySelector('.quick-filter') as HTMLButtonElement;
		expect(pill.textContent?.trim()).toBe('QuickFilter');
		expect(pill.getAttribute('aria-pressed')).toBe('true');
		pill.click();
		expect(queue.toggleQuickFilter).toHaveBeenCalledWith('quickFilter');
	});
	it('renders string and object thumbnails and leaves rows without one blank', () => {
		const { fixture } = mount('assets', [
			{ uid: 'a', title: 'a', contextParameters: { thumbnail: 'https://cdn.invalid/a.png' } },
			{
				uid: 'b',
				title: 'b',
				contextParameters: { thumbnail: { url: 'https://cdn.invalid/b.png' } },
			},
			{ uid: 'c', title: 'c', contextParameters: { thumbnail: {} } },
			{ uid: 'd', title: 'd' },
		]);
		const sources = fixture.debugElement
			.queryAll(By.directive(LazyLoadDirective))
			.map((image) => image.injector.get(LazyLoadDirective).src);
		expect(sources).toEqual(['https://cdn.invalid/a.png', 'https://cdn.invalid/b.png', '', '']);
	});
});
