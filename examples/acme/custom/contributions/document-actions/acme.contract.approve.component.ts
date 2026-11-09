import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type DocumentActionContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Document toolbar action. custom/index.ts shows it only for Contract documents the user may
 * write (`nuxeoFilter`) and, through the `acme.rules.legal-team` visibility rule, only to the
 * legal group. Visibility is presentation: the server still decides permissions.
 */
@Component({
	selector: 'acme-contract-approve',
	imports: [WebUiMessagePipe],
	template: `<button type="button" [disabled]="context().noEdit" (click)="run()">
		{{ 'acme.contract.approve' | webuiMessage: 'Approve' }}
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeContractApproveComponent {
	readonly context = input.required<DocumentActionContext>();

	run(): void {
		const context = this.context();
		// Call the server here (an Automation operation or a REST update) with Angular's
		// HttpClient, then report the outcome and refresh the document the host shows.
		context.reportMessage?.('acme.contract.approved', 'Contract approved');
		context.refreshDocument?.();
	}
}
