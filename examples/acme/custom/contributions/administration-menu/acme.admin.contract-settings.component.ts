import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AdministrationContext } from '@maretha/webui-sdk';

/**
 * Administration page paired with its "Contract settings" menu entry. `features` are the server
 * feature flags the host knows about; `user` is the signed-in user. Both drive presentation; the
 * bundled administration page already requires the administration visibility rule.
 */
@Component({
	selector: 'acme-admin-contract-settings',
	template: `
		<section>
			<h2>Contract settings</h2>
			<p>Signed in as {{ context().user?.displayName ?? 'unknown' }}.</p>
			<p>Retention {{ context().features?.retention ? 'is' : 'is not' }} enabled on this server.</p>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeAdminContractSettingsComponent {
	readonly context = input.required<AdministrationContext>();
}
