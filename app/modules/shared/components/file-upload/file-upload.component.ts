import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { FileUploadContext, WebUiSlotComponent } from '@maretha/webui-sdk';
import {
	Component,
	afterEveryRender,
	booleanAttribute,
	ContentChild,
	EventEmitter,
	Input,
	Output,
	TemplateRef,
	ChangeDetectionStrategy,
	ElementRef,
	ViewChild,
} from '@angular/core';
import { PlaceholderTemplateDirective } from 'app/directives/placeholder-template.directive';
import { DragAndDropDirective } from '../../../../directives/drag-and-drop.directive';

@Component({
	selector: 'nx-file-upload',
	templateUrl: './file-upload.component.html',
	styleUrls: ['./file-upload.component.scss'],
	imports: [DragAndDropDirective, WebUiSlotComponent],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileUploadComponent {
	private readonly host = injectUiMessages<ElementRef<HTMLElement>>(ElementRef);
	private autofocusApplied = false;
	constructor() {
		afterEveryRender(() => {
			if (!this.autoFocus) {
				this.autofocusApplied = false;
				return;
			}
			if (this.disabled || this.autofocusApplied) return;
			const control = this.host.nativeElement.querySelector<HTMLElement>(
				'nx-webui-slot button:not(:disabled), nx-webui-slot input:not(:disabled), nx-webui-slot [href], nx-webui-slot [tabindex="0"]',
			);
			if (!control) return;
			control.focus();
			this.autofocusApplied = control.ownerDocument.activeElement === control;
		});
	}
	private readonly uiLabels = injectUiMessages(RuntimeUiMessages);
	@Input({ transform: booleanAttribute }) disabled = false;
	@Input() allowDragAndDrop = true;
	@Input() multiple = false;
	@Input() allowedMimeTypes: string[] = [];
	@Input() id: string | undefined;
	@Input() className: string | undefined;
	private tooltipInput: string | undefined;
	@Input() set tooltip(value: string | undefined) {
		this.tooltipInput = value;
	}
	get tooltip(): string {
		return (
			this.tooltipInput ??
			this.uiLabels.text(
				'app.labels.you-can-either-manually-select-files-or-drag--ced9be',
				'You can either manually select files or drag them over',
			)
		);
	}
	@Input() autoFocus = false;
	@Output() update = new EventEmitter();
	@Output() error = new EventEmitter();

	@ContentChild(PlaceholderTemplateDirective, { read: TemplateRef, static: false })
	placeholderTemplate: TemplateRef<any> | null = null;

	@ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
	private cachedUploadContext?: FileUploadContext;
	get uploadContext(): FileUploadContext {
		const previous = this.cachedUploadContext;
		if (
			previous &&
			previous.disabled === this.disabled &&
			previous.multiple === this.multiple &&
			previous.allowedMimeTypes === this.allowedMimeTypes &&
			previous.label === this.tooltip &&
			previous.className === this.className &&
			previous.placeholder === this.placeholderTemplate
		)
			return previous;
		return (this.cachedUploadContext = {
			disabled: this.disabled,
			multiple: this.multiple,
			allowedMimeTypes: this.allowedMimeTypes,
			label: this.tooltip,
			className: this.className,
			placeholder: this.placeholderTemplate,
			chooseFiles: () => {
				if (!this.disabled) this.fileInput?.nativeElement.click();
			},
			addFiles: (files) => this.filesDropped(files),
		});
	}
	fileOver = false;

	// --------------------------------------------------------------------------------------------------
	filesDropped(files: any) {
		if (this.disabled || !files.length) return;

		for (const file of files) {
			if (!this.isMimeTypeValid(file)) {
				this.error.emit({
					error: 'Invalid MIME type',
					file,
				});
				return;
			}
		}

		this.update.emit(this.multiple ? Array.from(files) : [files[0]]);
	}

	// --------------------------------------------------------------------------------------------------
	filesDragged(fileOver: any) {
		this.fileOver = fileOver;
	}

	// --------------------------------------------------------------------------------------------------
	fileInputChanged(event: any) {
		if (this.disabled) return;
		const filesArray: File[] = Array.from(event.target.files ?? []);
		event.target.value = ''; // Permit reselecting the same file after acceptance or rejection.

		if (!filesArray.length) return;

		for (const file of filesArray) {
			if (!this.isMimeTypeValid(file)) {
				this.error.emit({
					error: 'Invalid MIME type',
					file,
				});
				return;
			}
		}

		this.update.emit(this.multiple ? filesArray : filesArray.slice(0, 1));
	}

	// --------------------------------------------------------------------------------------------------
	private isMimeTypeValid(file: File) {
		if (!this.allowedMimeTypes?.length) return true;
		const mime = file.type.toLowerCase();
		const name = file.name.toLowerCase();
		return this.allowedMimeTypes.some((raw) => {
			const accepted = raw.trim().toLowerCase();
			return accepted.startsWith('.')
				? name.endsWith(accepted)
				: accepted.endsWith('/*')
					? mime.startsWith(accepted.slice(0, -1))
					: !!mime && mime === accepted;
		});
	}
}
