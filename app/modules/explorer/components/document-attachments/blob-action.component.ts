import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	input,
	signal,
	viewChild,
} from '@angular/core';
import { BlobActionContext, WebUiIconComponent } from '@maretha/webui-sdk';
import { FileUploadComponent } from 'app/modules/shared/components/file-upload/file-upload.component';
import { PlaceholderTemplateDirective } from 'app/directives/placeholder-template.directive';
@Component({
	selector: 'nx-blob-action',
	imports: [
		WebUiIconComponent,
		FileUploadComponent,
		PlaceholderTemplateDirective,
		WebUiMessagePipe,
	],
	template: `@if (action() === 'replace') {
			<button
				type="button"
				[attr.aria-label]="
					'app.modules.blob-action.replace-file-256661' | webuiMessage: 'Replace file'
				"
				[title]="'app.modules.blob-action.replace-file-256661' | webuiMessage: 'Replace file'"
				[disabled]="context().noEdit"
				(click)="openReplace()"
			>
				<nx-webui-icon name="nuxeo:replace" />
			</button>
			<!-- Stock nuxeo-replace-blob-button: a dialog with a drop zone, Cancel and Replace. -->
			<dialog #replaceDialog class="replace-dialog" (close)="pending.set(null)">
				<h2>{{ 'replaceBlobButton.dialog.heading' | webuiMessage: 'Replace File' }}</h2>
				<nx-file-upload
					[allowedMimeTypes]="mimeTypes()"
					[disabled]="context().noEdit"
					(update)="choose($event)"
					><ng-template nxPlaceholderTemplate
						><span>{{
							pending()?.name ??
								('app.modules.blob-action.drop-or-choose-a-file-1b3c4d'
									| webuiMessage: 'Drop a file here or click to choose one')
						}}</span></ng-template
					></nx-file-upload
				>
				<footer>
					<button type="button" (click)="replaceDialog.close()">
						{{ 'command.cancel' | webuiMessage: 'Cancel' }}
					</button>
					<button
						type="button"
						class="primary"
						[disabled]="!pending()"
						(click)="confirmReplace(replaceDialog)"
					>
						{{ 'replaceBlobButton.dialog.replace' | webuiMessage: 'Replace' }}
					</button>
				</footer>
			</dialog>
		} @else {
			<button
				type="button"
				[attr.aria-label]="
					action() === 'download'
						? ('app.modules.blob-action.download-file-10ab9f' | webuiMessage: 'Download file')
						: ('app.modules.standard-content-editor.remove-file-73be3e'
							| webuiMessage: 'Remove file')
				"
				[title]="
					action() === 'download'
						? ('app.modules.blob-action.download-file-10ab9f' | webuiMessage: 'Download file')
						: ('app.modules.standard-content-editor.remove-file-73be3e'
							| webuiMessage: 'Remove file')
				"
				[disabled]="action() !== 'download' && context().noEdit"
				(click)="activate()"
			>
				<nx-webui-icon [name]="action() === 'download' ? 'nuxeo:download' : 'nuxeo:delete'" />
			</button>
		}`,
	styles: `
		:host {
			display: inline-flex;
			align-items: center;
		}
		button {
			border: 0;
			background: transparent;
			color: inherit;
			padding: 8px;
			display: flex;
		}
		dialog.replace-dialog {
			border: 0;
			border-radius: 4px;
			padding: 16px;
			min-width: min(28rem, 90vw);
			box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
		}
		dialog.replace-dialog::backdrop {
			background: rgba(0, 0, 0, 0.35);
		}
		dialog.replace-dialog h2 {
			font-size: 1.1rem;
			margin: 0 0 12px;
		}
		dialog.replace-dialog footer {
			display: flex;
			justify-content: flex-end;
			gap: 8px;
			margin-top: 16px;
		}
		dialog.replace-dialog footer button {
			border: 1px solid currentColor;
			border-radius: 3px;
			padding: 6px 12px;
		}
		dialog.replace-dialog footer button.primary {
			background: var(--nuxeo-primary-color, #0066ff);
			color: #fff;
			border-color: transparent;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlobActionComponent {
	readonly context = input.required<BlobActionContext>();
	readonly action = input.required<'download' | 'replace' | 'remove'>();
	readonly mimeTypes = computed(() => [...this.context().allowedMimeTypes]);

	private readonly replaceDialog = viewChild<ElementRef<HTMLDialogElement>>('replaceDialog');
	readonly pending = signal<File | null>(null);

	activate(): void {
		const c = this.context();
		if (this.action() === 'download') c.download?.();
		else if (!c.noEdit) c.remove?.();
	}
	openReplace(): void {
		if (this.context().noEdit) return;
		this.pending.set(null);
		this.replaceDialog()?.nativeElement.showModal();
	}
	choose(files: File[]): void {
		this.pending.set(files[0] ?? null);
	}
	confirmReplace(dialog: HTMLDialogElement): void {
		const file = this.pending();
		if (!file || this.context().noEdit) return;
		dialog.close();
		this.context().replace?.(file);
	}
	/** Kept for hosts that pass files straight through (tests, programmatic use). */
	replace(files: File[]): void {
		if (!this.context().noEdit && files[0]) this.context().replace?.(files[0]);
	}
}
