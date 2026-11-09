import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type DrawerContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Drawer page paired with the "Contracts" icon (custom/index.ts registers both halves under one
 * `pairKey`). It reads the application's recent documents from the context and opens one through
 * `navigate`, which goes through the router and the departure guards.
 */
@Component({
	selector: 'acme-drawer-contracts',
	imports: [WebUiMessagePipe],
	template: `
		<section>
			<h2>{{ 'acme.drawer.contracts' | webuiMessage: 'Contracts' }}</h2>
			@if (contracts().length) {
				<ul>
					@for (contract of contracts(); track contract['uid']) {
						<li>
							<button type="button" (click)="open(contract)">{{ contract['title'] }}</button>
						</li>
					}
				</ul>
			} @else {
				<p>{{ 'acme.drawer.contracts.empty' | webuiMessage: 'No contract opened recently.' }}</p>
			}
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeDrawerContractsComponent {
	readonly context = input.required<DrawerContext>();
	readonly contracts = computed(() =>
		(this.context().recentDocuments ?? []).filter((document) => document?.['type'] === 'Contract'),
	);

	open(document: Readonly<Record<string, unknown>>): void {
		this.context().navigate(`/browse/documents/${String(document['uid'])}`);
	}
}
