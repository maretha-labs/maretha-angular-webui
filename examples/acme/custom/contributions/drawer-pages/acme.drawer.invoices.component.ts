import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type DrawerContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/** Drawer page for the "Invoices" icon: recent invoices with their paid state. */
@Component({
	selector: 'acme-drawer-invoices',
	imports: [WebUiMessagePipe],
	template: `
		<section>
			<h2>{{ 'acme.drawer.invoices' | webuiMessage: 'Invoices' }}</h2>
			@if (invoices().length) {
				<ul>
					@for (invoice of invoices(); track invoice['uid']) {
						<li>
							<button type="button" (click)="open(invoice)">{{ invoice['title'] }}</button>
							@if (paid(invoice)) {
								<span class="badge">{{ 'acme.invoice.paid' | webuiMessage: 'Paid' }}</span>
							}
						</li>
					}
				</ul>
			} @else {
				<p>{{ 'acme.drawer.invoices.empty' | webuiMessage: 'No invoice opened recently.' }}</p>
			}
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeDrawerInvoicesComponent {
	readonly context = input.required<DrawerContext>();
	readonly invoices = computed(() =>
		(this.context().recentDocuments ?? []).filter((document) => document?.['type'] === 'Invoice'),
	);

	paid(document: Readonly<Record<string, unknown>>): boolean {
		const properties = document['properties'] as Readonly<Record<string, unknown>> | undefined;
		return properties?.['invoice:paid'] === true;
	}

	open(document: Readonly<Record<string, unknown>>): void {
		this.context().navigate(`/browse/documents/${String(document['uid'])}`);
	}
}
