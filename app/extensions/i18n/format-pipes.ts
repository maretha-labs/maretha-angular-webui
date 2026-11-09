import {
	CurrencyPipe,
	DATE_PIPE_DEFAULT_OPTIONS,
	DatePipe,
	DecimalPipe,
	PercentPipe,
} from '@angular/common';
import { DEFAULT_CURRENCY_CODE, inject, Pipe, PipeTransform } from '@angular/core';
import { WebUiLocale } from './webui-locale';

@Pipe({ name: 'webuiDate', pure: false })
export class WebUiDatePipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	private readonly formatter = new DatePipe(
		'en-US',
		undefined,
		inject(DATE_PIPE_DEFAULT_OPTIONS, { optional: true }),
	);
	transform(
		value: string | number | Date | null | undefined,
		format?: string,
		timezone?: string,
		locale?: string,
	): string | null {
		return this.formatter.transform(value, format, timezone, locale ?? this.locale.locale());
	}
}

@Pipe({ name: 'webuiNumber', pure: false })
export class WebUiNumberPipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	private readonly formatter = new DecimalPipe('en-US');
	transform(
		value: string | number | null | undefined,
		digitsInfo?: string,
		locale?: string,
	): string | null {
		return this.formatter.transform(value, digitsInfo, locale ?? this.locale.locale());
	}
}

@Pipe({ name: 'webuiCurrency', pure: false })
export class WebUiCurrencyPipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	private readonly formatter = new CurrencyPipe('en-US', inject(DEFAULT_CURRENCY_CODE));
	transform(
		value: string | number | null | undefined,
		currencyCode?: string,
		display?: string | boolean,
		digitsInfo?: string,
		locale?: string,
	): string | null {
		return this.formatter.transform(
			value,
			currencyCode,
			display,
			digitsInfo,
			locale ?? this.locale.locale(),
		);
	}
}

@Pipe({ name: 'webuiPercent', pure: false })
export class WebUiPercentPipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	private readonly formatter = new PercentPipe('en-US');
	transform(
		value: string | number | null | undefined,
		digitsInfo?: string,
		locale?: string,
	): string | null {
		return this.formatter.transform(value, digitsInfo, locale ?? this.locale.locale());
	}
}
