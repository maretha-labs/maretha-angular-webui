import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type DocumentViewContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/** Document tab "Invoice lines", shown for Invoices only (custom/index.ts). */
@Component({
	selector: 'acme-invoice-lines',
	imports: [WebUiMessagePipe],
	template: `
		<section>
			<h2>{{ 'acme.invoice.lines' | webuiMessage: 'Invoice lines' }}</h2>
			<dl>
				<dt>{{ 'acme.invoice.number' | webuiMessage: 'Invoice number' }}</dt>
				<dd>{{ property('invoice:number') }}</dd>
				<dt>{{ 'acme.invoice.amount' | webuiMessage: 'Amount' }}</dt>
				<dd>{{ property('invoice:amount') }}</dd>
				<dt>{{ 'acme.invoice.due-date' | webuiMessage: 'Due date' }}</dt>
				<dd>{{ property('invoice:dueDate') }}</dd>
				<dt>{{ 'acme.invoice.paid' | webuiMessage: 'Paid' }}</dt>
				<dd>{{ property('invoice:paid') === 'true' ? 'Yes' : 'No' }}</dd>
			</dl>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeInvoiceLinesComponent {
	readonly context = input.required<DocumentViewContext>();

	property(name: string): string {
		const properties = this.context().document?.['properties'] as
			| Readonly<Record<string, unknown>>
			| undefined;
		return String(properties?.[name] ?? '');
	}
}
