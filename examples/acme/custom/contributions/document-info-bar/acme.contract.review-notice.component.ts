import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type DocumentInfoBarContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/** Notice above the document views; custom/index.ts shows it for inactive Contracts only. */
@Component({
	selector: 'acme-contract-review-notice',
	imports: [WebUiMessagePipe],
	template: `<p role="status">
		{{ 'acme.contract.review-notice' | webuiMessage: 'This contract is under review' }}
	</p>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeContractReviewNoticeComponent {
	readonly context = input.required<DocumentInfoBarContext>();
}
