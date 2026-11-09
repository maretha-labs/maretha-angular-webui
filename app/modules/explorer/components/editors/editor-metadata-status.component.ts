import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	imports: [WebUiMessagePipe],
	selector: 'nx-editor-metadata-status',
	changeDetection: ChangeDetectionStrategy.OnPush,
	template: `
		<div class="modal-header">
			<h2 class="modal-title fs-5">
				{{
					documentType() ||
						('app.runtime.editor-metadata-status.document-8efccc' | webuiMessage: 'Document')
				}}
			</h2>
			<button
				type="button"
				class="btn-close"
				[attr.aria-label]="
					'app.modules.editor-metadata-status.close-89fadc' | webuiMessage: 'Close'
				"
				(click)="closed.emit()"
			></button>
		</div>
		<div class="modal-body" [attr.aria-busy]="loading()">
			@if (loading()) {
				<p role="status">
					{{
						'app.modules.editor-metadata-status.loading-document-type-information-0bbebb'
							| webuiMessage: 'Loading document type information…'
					}}
				</p>
			}
			@if (error()) {
				<p role="alert">{{ error() }}</p>
			}
		</div>
		<div class="modal-footer">
			<button type="button" class="btn btn-secondary" (click)="closed.emit()">
				{{ 'app.modules.editor-metadata-status.close-89fadc' | webuiMessage: 'Close' }}
			</button>
			@if (error()) {
				<button type="button" class="btn btn-primary" [disabled]="loading()" (click)="retry.emit()">
					{{ 'app.modules.editor-metadata-status.retry-efb1df' | webuiMessage: 'Retry' }}
				</button>
			}
		</div>
	`,
})
export class EditorMetadataStatusComponent {
	readonly documentType = input<string>();
	readonly loading = input(false);
	readonly error = input('');
	readonly retry = output<void>();
	readonly closed = output<void>();
}
