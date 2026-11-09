import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ResultsToolbarContext } from '@maretha/webui-sdk';

/** Collection toolbar action: shares the collection the host shows (`context.collection`). */
@Component({
	selector: 'acme-collection-share-with-legal',
	template: `<button type="button" [disabled]="!context().collection" (click)="run()">
		Share with legal
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeCollectionShareWithLegalComponent {
	readonly context = input.required<ResultsToolbarContext>();

	run(): void {
		const context = this.context();
		// Grant the legal group access to `context.collection` through the server's permission
		// API with HttpClient here; the server validates the caller's right to share.
		context.reportMessage?.('acme.collection.shared', 'Collection shared with legal');
	}
}
