import { ChangeDetectionStrategy, Component, inject, input, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { defineSlot } from './contribution';
import { DocumentActionContext } from './slots';
import type { ApplicationUser } from './user-menu';
import { WebUiIconComponent } from './webui-icons';
import { WebUiMessages } from './webui-messages';
export interface BlobActionContext extends DocumentActionContext {
	readonly blob: Readonly<Record<string, unknown>>;
	readonly xpath: string;
	readonly draft: boolean;
	readonly allowedMimeTypes: readonly string[];
	readonly download?: () => void;
	readonly replace?: (file: File) => void;
	readonly remove?: () => void;
}
export const BLOB_ACTIONS_SLOT = defineSlot<BlobActionContext>(
	'BLOB_ACTIONS',
	(value): value is BlobActionContext => {
		if (!value || typeof value !== 'object') return false;
		const c = value as BlobActionContext;
		return (
			!!c.blob &&
			typeof c.blob === 'object' &&
			typeof c.xpath === 'string' &&
			typeof c.noEdit === 'boolean' &&
			typeof c.draft === 'boolean' &&
			Array.isArray(c.allowedMimeTypes)
		);
	},
);
export interface FileUploadContext {
	readonly disabled: boolean;
	readonly multiple: boolean;
	readonly allowedMimeTypes: readonly string[];
	readonly label: string;
	readonly className?: string;
	readonly placeholder?: TemplateRef<unknown> | null;
	readonly chooseFiles: () => void;
	/** Signed-in user; slot hosts add it like Polymer's shared slot model. */
	readonly user?: ApplicationUser | null;
	/** Hands files from another source to the host, which validates them like dropped files. */
	readonly addFiles?: (files: readonly File[]) => void;
}
export const FILE_UPLOAD_ACTIONS_SLOT = defineSlot<FileUploadContext>(
	'FILE_UPLOAD_ACTIONS',
	(value): value is FileUploadContext =>
		!!value &&
		typeof value === 'object' &&
		typeof (value as FileUploadContext).chooseFiles === 'function' &&
		typeof (value as FileUploadContext).disabled === 'boolean',
);
@Component({
	selector: 'nx-choose-files-action',
	imports: [NgTemplateOutlet, WebUiIconComponent],
	template: `<button
		type="button"
		[class]="context().className || ''"
		[disabled]="context().disabled"
		[title]="context().label"
		(click)="choose()"
	>
		@if (context().placeholder; as template) {
			<ng-container [ngTemplateOutlet]="template" />
		} @else {
			<nx-webui-icon name="nuxeo:add" />{{ messages.text('fileUpload.chooseFile', 'Choose files') }}
		}
	</button>`,
	styles:
		':host { display:block; width:100%; } button { width:100%; background:transparent; border:0; color:inherit; display:flex; align-items:center; gap:8px; padding:8px; }',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChooseFilesActionComponent {
	readonly context = input.required<FileUploadContext>();
	readonly messages = inject(WebUiMessages);
	choose(): void {
		if (!this.context().disabled) this.context().chooseFiles();
	}
}
