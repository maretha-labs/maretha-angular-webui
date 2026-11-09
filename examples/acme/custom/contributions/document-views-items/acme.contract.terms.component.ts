import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type DocumentViewContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Document tab "Terms", shown for Contracts only (custom/index.ts). The context carries the
 * document the host shows; read its `properties` and never mutate the object.
 */
@Component({
	selector: 'acme-contract-terms',
	imports: [WebUiMessagePipe],
	template: `
		<section>
			<h2>{{ 'acme.contract.terms' | webuiMessage: 'Terms' }}</h2>
			<dl>
				<dt>{{ 'acme.contract.counterparty' | webuiMessage: 'Counterparty' }}</dt>
				<dd>{{ property('contract:counterparty') }}</dd>
				<dt>{{ 'acme.contract.amount' | webuiMessage: 'Amount' }}</dt>
				<dd>{{ property('contract:amount') }}</dd>
				<dt>{{ 'acme.contract.effective-date' | webuiMessage: 'Effective date' }}</dt>
				<dd>{{ property('contract:effectiveDate') }}</dd>
			</dl>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeContractTermsComponent {
	readonly context = input.required<DocumentViewContext>();

	property(name: string): string {
		const properties = this.context().document?.['properties'] as
			| Readonly<Record<string, unknown>>
			| undefined;
		return String(properties?.[name] ?? '');
	}
}
