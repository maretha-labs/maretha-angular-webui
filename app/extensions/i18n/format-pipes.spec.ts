import {
	DATE_PIPE_DEFAULT_OPTIONS,
	DatePipe,
	DecimalPipe,
	CurrencyPipe,
	PercentPipe,
} from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { WebUiLocale, SUPPORTED_WEB_UI_LOCALES } from './webui-locale';
import {
	WebUiDatePipe,
	WebUiNumberPipe,
	WebUiCurrencyPipe,
	WebUiPercentPipe,
} from './format-pipes';

describe('Selected-locale value formatting', () => {
	it('updates existing pipe instances in all locales without changing explicit timezones or currencies', () => {
		const date = TestBed.runInInjectionContext(() => new WebUiDatePipe());
		const number = TestBed.runInInjectionContext(() => new WebUiNumberPipe());
		const currency = TestBed.runInInjectionContext(() => new WebUiCurrencyPipe());
		const percent = TestBed.runInInjectionContext(() => new WebUiPercentPipe());
		for (const { key } of SUPPORTED_WEB_UI_LOCALES) {
			TestBed.inject(WebUiLocale).setLocale(key);
			expect(date.transform('2026-10-03T23:30:00Z', 'fullDate', '+0200')).toBe(
				new DatePipe(key).transform('2026-10-03T23:30:00Z', 'fullDate', '+0200'),
			);
			expect(number.transform(1234.5, '1.2-2')).toBe(
				new DecimalPipe(key).transform(1234.5, '1.2-2'),
			);
			expect(currency.transform(1234.5, 'EUR', 'code')).toBe(
				new CurrencyPipe(key).transform(1234.5, 'EUR', 'code'),
			);
			expect(percent.transform(0.125, '1.1-1')).toBe(
				new PercentPipe(key).transform(0.125, '1.1-1'),
			);
		}
		expect(number.transform(1234.5, undefined, 'en-US')).toBe('1,234.5');
		expect(date.transform(null)).toBeNull();
		expect(number.transform(undefined)).toBeNull();
		expect(currency.transform(null)).toBeNull();
		expect(percent.transform(null)).toBeNull();
	});
	it('retains application date format and timezone defaults', () => {
		TestBed.configureTestingModule({
			providers: [
				{
					provide: DATE_PIPE_DEFAULT_OPTIONS,
					useValue: { dateFormat: 'yyyy-MM-dd HH:mm', timezone: '+0200' },
				},
			],
		});
		const pipe = TestBed.runInInjectionContext(() => new WebUiDatePipe());
		expect(pipe.transform('2026-10-03T23:30:00Z')).toBe('2026-10-04 01:30');
	});
});
