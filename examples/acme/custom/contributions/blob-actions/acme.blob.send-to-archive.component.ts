import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BlobActionContext } from '@maretha/webui-sdk';

/**
 * Action beside a file. The host supplies `download` only when the user may read the blob, so
 * the button follows the host's state instead of fetching the blob itself.
 */
@Component({
	selector: 'acme-blob-send-to-archive',
	template: `<button type="button" [disabled]="!context().download" (click)="run()">
		Send to archive
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeBlobSendToArchiveComponent {
	readonly context = input.required<BlobActionContext>();

	run(): void {
		const context = this.context();
		// Hand the blob's xpath and the document id to the archive service with HttpClient here.
		context.reportMessage?.(
			'acme.blob.archived',
			`Sent ${String(context.blob['name'] ?? context.xpath)} to the archive`,
		);
	}
}
