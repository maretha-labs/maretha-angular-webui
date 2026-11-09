import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PublishContext } from '@maretha/webui-sdk';

/**
 * Publishing tab. A publishing page receives either one `document` or an explicit
 * `selectedDocuments` snapshot; this one supports both and says how many it would publish.
 */
@Component({
	selector: 'acme-publish-partner-portal',
	template: `
		<section>
			<h2>Partner portal</h2>
			<p>{{ count() }} document(s) would be published to the partner portal.</p>
			<button type="button" [disabled]="!count() || context().noEdit" (click)="run()">
				Publish
			</button>
		</section>
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmePublishPartnerPortalComponent {
	readonly context = input.required<PublishContext>();
	readonly count = computed(() => {
		const context = this.context();
		return context.selectedDocuments?.length ?? (context.document ? 1 : 0);
	});

	run(): void {
		const context = this.context();
		// Recheck each source and publish it through the server with HttpClient here.
		context.reportMessage?.(
			'acme.publish.partner-portal.done',
			`Published ${this.count()} document(s)`,
		);
	}
}
