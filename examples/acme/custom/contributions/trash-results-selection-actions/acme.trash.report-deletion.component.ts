import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ResultsSelectionContext } from '@maretha/webui-sdk';

/** Trash selection action: reports the selected documents before an administrator purges them. */
@Component({
	selector: 'acme-trash-report-deletion',
	template: `<button type="button" [disabled]="!context().selectedDocuments.length" (click)="run()">
		Report deletion ({{ context().selectedDocuments.length }})
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeTrashReportDeletionComponent {
	readonly context = input.required<ResultsSelectionContext>();

	run(): void {
		const context = this.context();
		// Send the selected ids to the records service with HttpClient here.
		context.reportMessage?.(
			'acme.trash.deletion-reported',
			`Reported ${context.selectedDocuments.length} document(s) for deletion`,
		);
	}
}
