import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { type ResultsProjectionContext, WebUiMessagePipe } from '@maretha/webui-sdk';

/**
 * Grid card for Contract rows. Registered in custom/index.ts as an `item` projection for
 * `mode: 'grid'`; the host supplies the `context` input (row, selection, guarded callbacks).
 */
@Component({
	selector: 'acme-contract-card',
	imports: [WebUiMessagePipe],
	template: `
		<article class="acme-contract-card" [class.selected]="context().selected">
			<button type="button" (click)="context().activateRow()">{{ context().row.title }}</button>
			<dl>
				<dt>{{ 'acme.contract.counterparty' | webuiMessage: 'Counterparty' }}</dt>
				<dd>{{ property('contract:counterparty') }}</dd>
				<dt>{{ 'acme.contract.amount' | webuiMessage: 'Amount' }}</dt>
				<dd>{{ property('contract:amount') }}</dd>
			</dl>
		</article>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeContractCardComponent {
	readonly context = input.required<ResultsProjectionContext>();

	property(name: string): string {
		return String(this.context().row.properties?.[name] ?? '');
	}
}
