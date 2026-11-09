import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgSelectComponent } from '@ng-select/ng-select';
import { WebUiLocale, WebUiMessages, SUPPORTED_WEB_UI_LOCALES } from '@maretha/webui-sdk';
import { BsLocaleService, BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { TimeagoIntl } from 'ngx-timeago';
import { LocalizedTimeagoFormatter } from './localized-timeago-formatter';
import { SharedModule } from '../modules/shared/shared.module';
import { legacyTestProviders } from '../testing/legacy-test-providers';

@Component({
	imports: [SharedModule],
	template: `<ng-select [items]="items" /><ng-select
			[items]="items"
			notFoundText="Customer wording"
		/>`,
})
class WidgetHost {
	items = [];
}

describe('Localized built-in widgets', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			imports: [WidgetHost],
			providers: [...legacyTestProviders(), LocalizedTimeagoFormatter, TimeagoIntl],
		}),
	);
	it('updates select chrome and the calendar while preserving explicit customer labels', async () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('widget-test', {
			fr: {
				'widgets.select.notFound': 'Aucun résultat',
				'widgets.select.clearAll': 'Tout effacer',
				'widgets.datepicker.today': 'Aujourd’hui',
			},
		});
		const fixture = TestBed.createComponent(WidgetHost);
		fixture.detectChanges();
		await fixture.whenStable();
		const selects = fixture.debugElement
			.queryAll(By.directive(NgSelectComponent))
			.map((node) => node.componentInstance as NgSelectComponent);
		selects[0].open();
		fixture.detectChanges();
		expect(selects[0].notFoundText()).toBe('No items found');
		TestBed.inject(WebUiLocale).setLocale('fr');
		fixture.detectChanges();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(selects[0].notFoundText()).toBe('Aucun résultat');
		expect(selects[0].clearAllText()).toBe('Tout effacer');
		expect(selects[1].notFoundText()).toBe('Customer wording');
		expect(fixture.nativeElement.textContent).toContain('Aucun résultat');
		expect(TestBed.inject(BsLocaleService).currentLocale).toBe('fr');
		expect(TestBed.inject(BsDatepickerConfig).todayButtonLabel).toBe('Aujourd’hui');
		TestBed.inject(WebUiLocale).setLocale('pt-PT');
		fixture.detectChanges();
		expect(TestBed.inject(BsLocaleService).currentLocale).toBe('pt-pt');
	});
	it('formats past and future relative times in every supported locale', () => {
		const formatter = TestBed.inject(LocalizedTimeagoFormatter);
		spyOn(Date, 'now').and.returnValue(1_800_000_000_000);
		for (const { key } of SUPPORTED_WEB_UI_LOCALES) {
			TestBed.inject(WebUiLocale).setLocale(key);
			for (const [seconds, unit] of [
				[1, 'second'],
				[60, 'minute'],
				[3600, 'hour'],
				[86400, 'day'],
				[604800, 'week'],
				[2629800, 'month'],
				[31557600, 'year'],
			] as const) {
				for (const direction of [-1, 1])
					expect(formatter.format(Date.now() + seconds * direction * 1000)).toBe(
						new Intl.RelativeTimeFormat(key, { numeric: 'always' }).format(direction, unit),
					);
			}
		}
		expect(formatter.format(NaN)).toBe('');
	});
});
