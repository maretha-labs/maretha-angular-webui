import { effect, inject, Injectable } from '@angular/core';
import { WebUiLocale } from '@maretha/webui-sdk';
import { TimeagoFormatter, TimeagoIntl } from 'ngx-timeago';

/** CLDR supplies grammatical forms and digits for the selected application language. */
@Injectable()
export class LocalizedTimeagoFormatter extends TimeagoFormatter {
	private readonly locale = inject(WebUiLocale);
	private readonly intl = inject(TimeagoIntl);

	constructor() {
		super();
		effect(() => {
			this.locale.locale();
			this.intl.changes.next();
		});
	}

	format(then: number): string {
		if (!Number.isFinite(then)) return '';
		const seconds = (then - Date.now()) / 1000;
		const absolute = Math.abs(seconds);
		const [divisor, unit]: [number, Intl.RelativeTimeFormatUnit] =
			absolute < 60
				? [1, 'second']
				: absolute < 3600
					? [60, 'minute']
					: absolute < 86400
						? [3600, 'hour']
						: absolute < 604800
							? [86400, 'day']
							: absolute < 2629800
								? [604800, 'week']
								: absolute < 31557600
									? [2629800, 'month']
									: [31557600, 'year'];
		return new Intl.RelativeTimeFormat(this.locale.locale(), { numeric: 'always' }).format(
			Math.round(seconds / divisor),
			unit,
		);
	}
}
