import { WebUiLocale } from '@maretha/webui-sdk';
import { Pipe, PipeTransform, inject } from '@angular/core';

@Pipe({
	name: 'duration',
	pure: false,
})
export class DurationPipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	// --------------------------------------------------------------------------------------------------
	transform(duration: any): string {
		const parsedDuration = Number(duration);
		const totalSeconds = Number.isFinite(parsedDuration) ? Math.max(0, parsedDuration) : 0;

		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		const result = [];
		const format = new Intl.NumberFormat(this.locale.locale(), {
			minimumIntegerDigits: 2,
			maximumFractionDigits: 0,
			useGrouping: false,
		});

		if (hours) result.push(`${format.format(hours)}`);

		if (minutes) result.push(`${format.format(minutes)}`);

		if (seconds) result.push(`${format.format(seconds)}s`);

		return result.join(':');
	}
}
