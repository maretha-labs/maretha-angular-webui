import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ResultsToolbarContext } from '@maretha/webui-sdk';

/**
 * Selection toolbar action. It acts on `selectedDocuments` only (never on the whole query),
 * marks the host busy while it works and refreshes the listing afterwards.
 */
@Component({
	selector: 'acme-selection-mark-reviewed',
	template: `<button
		type="button"
		[disabled]="context().busy || !context().selectedDocuments.length"
		(click)="run()"
	>
		Mark reviewed ({{ context().selectedDocuments.length }})
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeSelectionMarkReviewedComponent {
	readonly context = input.required<ResultsToolbarContext>();

	async run(): Promise<void> {
		const context = this.context();
		context.setBusy(true);
		try {
			// Update each of `context.selectedDocuments` with HttpClient here; the server enforces
			// permissions on every write.
			await context.refresh();
		} finally {
			context.setBusy(false);
		}
	}
}
