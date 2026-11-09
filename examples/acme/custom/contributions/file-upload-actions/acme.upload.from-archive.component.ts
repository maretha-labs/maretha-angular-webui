import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FileUploadContext } from '@maretha/webui-sdk';

/**
 * Extra source beside the file chooser. `addFiles` hands files to the host, which validates them
 * like dropped files (MIME types, multiplicity) and runs its own upload; the host omits it where
 * it accepts no extra sources, and the button is disabled then.
 */
@Component({
	selector: 'acme-upload-from-archive',
	template: `<button
		type="button"
		[class]="context().className ?? ''"
		[disabled]="context().disabled || !context().addFiles"
		(click)="run()"
	>
		From archive
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AcmeUploadFromArchiveComponent {
	readonly context = input.required<FileUploadContext>();

	async run(): Promise<void> {
		const context = this.context();
		// Fetch the archived files with HttpClient here (as Blobs), then hand them to the host.
		const files: File[] = [];
		context.addFiles?.(files);
	}
}
