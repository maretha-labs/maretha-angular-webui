import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
	type ResultsProjectionContext,
	WebUiIconComponent,
	WebUiMessages,
} from '@maretha/webui-sdk';

/** Stock search Flags column: an icon per flag, its stock tooltip as the accessible name. */
@Component({
	selector: 'nx-default-search-flags-cell',
	imports: [WebUiIconComponent],
	template: `@for (flag of flags(); track flag.icon) {
		<span class="flag" role="img" [attr.aria-label]="flag.label" [attr.title]="flag.label"
			><nx-webui-icon [name]="flag.icon" aria-hidden="true"
		/></span>
	}`,
	styles: `
		:host {
			display: inline-flex;
			align-items: center;
			gap: 4px;
		}
		.flag {
			display: inline-flex;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefaultSearchFlagsCellComponent {
	readonly context = input.required<ResultsProjectionContext<any>>();
	private readonly messages = inject(WebUiMessages);
	readonly flags = computed(() => {
		const row = this.context().row;
		const flags: { icon: string; label: string }[] = [];
		if (row.isRecord)
			flags.push({
				icon: 'nuxeo:retain',
				label: this.messages.text(
					'documentContentView.datatable.flags.retention',
					'Under retention',
				),
			});
		if (row.hasLegalHold)
			flags.push({
				icon: 'nuxeo:hold',
				label: this.messages.text(
					'documentContentView.datatable.flags.legalHold',
					'Under legal hold',
				),
			});
		if (row.contextParameters?.favorites?.isFavorite)
			flags.push({
				icon: 'nuxeo:favorites',
				label: this.messages.text(
					'documentContentView.datatable.flags.favorite',
					'Under favorites',
				),
			});
		if (row.facets?.includes('ColdStorage') && row.properties?.['coldstorage:coldContent'])
			flags.push({
				icon: 'nuxeo:coldstorage',
				label: this.messages.text(
					'documentContentView.datatable.flags.coldStorage',
					'Under cold storage',
				),
			});
		return flags;
	});
}
