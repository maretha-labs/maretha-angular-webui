import { Pipe, PipeTransform, inject } from '@angular/core';
import { WebUiLocale } from '@maretha/webui-sdk';
import { TranslateService } from '@ngx-translate/core';

@Pipe({ name: 'fileSize', pure: false })
export class FileSizePipe implements PipeTransform {
	private readonly locale = inject(WebUiLocale);
	// --------------------------------------------------------------------------------------------------
	constructor(private readonly translate: TranslateService) {}

	// --------------------------------------------------------------------------------------------------
	transform(bytes: any, ...args: any[]): string {
		bytes = Number(bytes);
		if (!Number.isFinite(bytes) || bytes < 0) bytes = 0;

		const base = 1024;

		const i =
			bytes > 0 ? Math.min(8, Math.max(0, Math.floor(Math.log(bytes) / Math.log(base)))) : 0;

		const sizeInBytes = bytes / Math.pow(base, i);

		const decimals = Number.isFinite(args[0]) ? Math.min(20, Math.max(0, Math.trunc(args[0]))) : 0;
		const size = parseFloat(sizeInBytes.toFixed(decimals));

		const literals = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb', 'eb', 'zb', 'yb'];
		const literal = this.translate.instant(`general.fileSize.${literals[i]}`, { size });

		return `${new Intl.NumberFormat(this.locale.locale(), { maximumFractionDigits: decimals }).format(size)} ${literal}`;
	}
}
