import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { QuickSearchContext } from '@maretha/webui-sdk';

/**
 * Command in the Quick Search overlay; custom/index.ts shows it when the term is "contract" or
 * "contracts". `navigate` goes through the router and the departure guards and resolves to
 * whether navigation happened; close the overlay only then.
 */
@Component({
	selector: 'acme-quick-search-contracts',
	template: `<button type="button" (click)="run()">Open the contract register</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeQuickSearchContractsComponent {
	readonly context = input.required<QuickSearchContext>();

	async run(): Promise<void> {
		const context = this.context();
		if (await context.navigate('/page/acme.page.contract-register')) context.close();
	}
}
