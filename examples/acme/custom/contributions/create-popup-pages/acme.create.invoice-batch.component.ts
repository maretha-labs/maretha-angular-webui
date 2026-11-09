import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DocumentCreateContext } from '@maretha/webui-sdk';

/** Tab in the create dialog that sends the user to the host's import flow for a batch. */
@Component({
	selector: 'acme-create-invoice-batch',
	template: `
		<section>
			<h2>Invoice batch</h2>
			<p>Drop the month's invoices; each file becomes an Invoice through the import layout.</p>
			<button type="button" [disabled]="context().busy" (click)="context().importFiles()">
				Choose the files
			</button>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeCreateInvoiceBatchComponent {
	readonly context = input.required<DocumentCreateContext>();
}
