import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { type PageContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Routed page at `/page/acme.page.contract-register`. `query` carries the URL query parameters,
 * so `?counterparty=Globex` filters the register. Load the rows from a server page provider
 * (`/api/v1/search/pp/<name>/execute`) with HttpClient when the user applies a filter; never on
 * registration.
 */
@Component({
	selector: 'acme-page-contract-register',
	imports: [WebUiMessagePipe],
	template: `
		<section>
			<h2>{{ 'acme.page.contract-register' | webuiMessage: 'Contract register' }}</h2>
			@if (counterparty()) {
				<p>
					{{ 'acme.contract.counterparty' | webuiMessage: 'Counterparty' }}: {{ counterparty() }}
				</p>
			}
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmePageContractRegisterComponent {
	readonly context = input.required<PageContext>();
	readonly counterparty = computed(() => this.context().query?.['counterparty'] ?? '');
}
