import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { WebUiLocale, SUPPORTED_WEB_UI_LOCALES } from '@maretha/webui-sdk';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';

@Component({
	selector: 'nx-footer',
	templateUrl: './footer.component.html',
	styleUrls: ['./footer.component.scss'],
	imports: [TooltipDirective],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
	private readonly locale = inject(WebUiLocale);
	readonly languages = SUPPORTED_WEB_UI_LOCALES;
	readonly currentLanguage = this.locale.locale;

	changeLanguage(language: string) {
		if (this.languages.some((entry) => entry.key === language)) this.locale.setLocale(language);
	}
}
