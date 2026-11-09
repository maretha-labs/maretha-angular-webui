import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AdministrationContext } from '@maretha/webui-sdk';

/** Administration page "Invoice settings"; either slot name generates the same paired view. */
@Component({
	selector: 'acme-admin-invoice-settings',
	template: `
		<section>
			<h2>Invoice settings</h2>
			<p>Load and save the settings document with HttpClient on the user's action.</p>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeAdminInvoiceSettingsComponent {
	readonly context = input.required<AdministrationContext>();
}
