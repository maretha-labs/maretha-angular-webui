import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UserMenuContext } from '@maretha/webui-sdk';

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-user-menu-language',
	standalone: true,
	templateUrl: './user-menu-language.component.html',
	styleUrl: './user-menu-row.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuLanguageComponent {
	readonly context = input.required<UserMenuContext>();

	selectLanguage(key: string): void {
		const context = this.context();
		if (!context.user || context.locale === key) return;
		context.changeLanguage(key);
	}
}
