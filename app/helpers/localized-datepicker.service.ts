import { effect, inject, Injectable } from '@angular/core';
import { WebUiLocale, WebUiMessages } from '@maretha/webui-sdk';
import { BsDatepickerConfig, BsLocaleService } from 'ngx-bootstrap/datepicker';
import {
	arLocale,
	defineLocale,
	esLocale,
	frLocale,
	itLocale,
	ptBrLocale,
	roLocale,
} from 'ngx-bootstrap/chronos';

@Injectable({ providedIn: 'root' })
export class LocalizedDatepicker {
	private readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	private readonly datepickerLocale = inject(BsLocaleService);
	private readonly config = inject(BsDatepickerConfig);

	constructor() {
		for (const [name, data] of [
			['es', esLocale],
			['fr', frLocale],
			['ar', arLocale],
			['ro', roLocale],
			['it', itLocale],
		] as const)
			defineLocale(name, data);
		// Chronos ships Brazilian Portuguese only. Calendar names are shared; Portuguese
		// week conventions and abbreviated month spelling are explicitly supplied here.
		defineLocale('pt-pt', {
			...ptBrLocale,
			abbr: 'pt-pt',
			monthsShort: 'jan._fev._mar._abr._mai._jun._jul._ago._set._out._nov._dez.'.split('_'),
			week: { dow: 1, doy: 4 },
		});
		effect(() => {
			const locale = this.locale.locale();
			this.datepickerLocale.use(locale === 'en-US' ? 'en' : locale.toLowerCase());
			this.config.todayButtonLabel = this.messages.text('widgets.datepicker.today', 'Today');
			this.config.clearButtonLabel = this.messages.text('widgets.datepicker.clear', 'Clear');
			this.config.customRangeButtonLabel = this.messages.text(
				'widgets.datepicker.customRange',
				'Custom range',
			);
		});
	}
}
