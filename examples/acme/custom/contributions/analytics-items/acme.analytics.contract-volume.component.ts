import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AdministrationContext } from '@maretha/webui-sdk';

/** Analytics view "Contract volume": a paired tab and page in the analytics workspace. */
@Component({
	selector: 'acme-analytics-contract-volume',
	template: `
		<section>
			<h2>Contract volume</h2>
			<p>Query the server's analytics page provider with HttpClient when this view is shown.</p>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeAnalyticsContractVolumeComponent {
	readonly context = input.required<AdministrationContext>();
}
