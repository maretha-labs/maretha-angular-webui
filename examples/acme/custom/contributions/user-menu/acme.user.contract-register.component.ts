import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type UserMenuContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Account menu entry. Entries are plain links and buttons in a vertical slot; the application
 * uses hash routing, so a page link is `#/page/<pageId>`. Close the drawer after choosing.
 */
@Component({
	selector: 'acme-user-contract-register',
	imports: [WebUiMessagePipe],
	template: `<a href="#/page/acme.page.contract-register" (click)="context().close()">
		{{ 'acme.page.contract-register' | webuiMessage: 'Contract register' }}
	</a>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeUserContractRegisterComponent {
	readonly context = input.required<UserMenuContext>();
}
