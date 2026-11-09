import { TestBed } from '@angular/core/testing';
import {
	RESULTS_PAGING_OPTIONS,
	ResultsPagingOptions,
	ResultsPagingSettings,
} from './results-paging-settings';

describe('ResultsPagingSettings', () => {
	it('defaults to manual paging without any configuration', () => {
		expect(TestBed.inject(ResultsPagingSettings).scrollPagingEnabled()).toBeFalse();
	});

	it('accepts an explicit bootstrap opt-in', () => {
		TestBed.configureTestingModule({
			providers: [{ provide: RESULTS_PAGING_OPTIONS, useValue: { scrollPagingEnabled: true } }],
		});
		expect(TestBed.inject(ResultsPagingSettings).scrollPagingEnabled()).toBeTrue();
	});

	it('applies replacement settings to existing consumers and resets to manual for missing settings', () => {
		const settings = TestBed.inject(ResultsPagingSettings);
		const enabled = settings.scrollPagingEnabled;
		settings.apply({ scrollPagingEnabled: true });
		expect(enabled()).toBeTrue();
		settings.apply({ scrollPagingEnabled: false });
		expect(enabled()).toBeFalse();
		for (const value of [{}, null, undefined]) {
			settings.apply({ scrollPagingEnabled: true });
			settings.apply(value);
			expect(enabled()).toBeFalse();
		}
	});

	it('does not enable scroll paging for truthy nonboolean settings', () => {
		const settings = TestBed.inject(ResultsPagingSettings);
		for (const value of ['true', 'false', 1, {}, []]) {
			settings.apply({ scrollPagingEnabled: true });
			settings.apply({ scrollPagingEnabled: value } as unknown as ResultsPagingOptions);
			expect(settings.scrollPagingEnabled()).toBeFalse();
		}
	});
});
