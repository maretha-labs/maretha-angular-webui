import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AdministrationContext } from '@maretha/webui-sdk';

/** Analytics view "Invoice aging". */
@Component({
	selector: 'acme-analytics-invoice-aging',
	template: `
		<section>
			<h2>Invoice aging</h2>
			<p>Buckets of unpaid invoices by due date, loaded when this view is shown.</p>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeAnalyticsInvoiceAgingComponent {
	readonly context = input.required<AdministrationContext>();
}
