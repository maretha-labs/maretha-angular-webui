import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type ShellActionContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/** Application header action; `navigate` uses the router and the existing departure guards. */
@Component({
	selector: 'acme-shell-contract-register',
	imports: [WebUiMessagePipe],
	template: `<button type="button" (click)="run()">
		{{ 'acme.page.contract-register' | webuiMessage: 'Contract register' }}
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeShellContractRegisterComponent {
	readonly context = input.required<ShellActionContext>();

	run(): void {
		void this.context().navigate('/page/acme.page.contract-register');
	}
}
