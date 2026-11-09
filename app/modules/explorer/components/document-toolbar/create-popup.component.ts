import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { documentTypeIcon, documentTypeLabel } from 'app/helpers/document-type-presentation';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	inject,
	input,
	Input,
	viewChild,
} from '@angular/core';
import {
	DocumentCreateContext,
	DocumentViewItemContext,
	DocumentViewsComponent,
	WebUiIconComponent,
	WebUiMessagePipe,
	DocumentViewTabComponent,
	FileUploadContext,
	WebUiMessages,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { BsModalRef } from 'ngx-bootstrap/modal';

@Component({
	selector: 'nx-create-popup-tab',
	imports: [DocumentViewTabComponent, WebUiMessagePipe],
	template: `<nx-document-view-tab
		[context]="context()"
		[label]="
			destinationCreate()
				? ('app.modules.create-popup.create-9d65fb' | webuiMessage: 'Create')
				: label()
		"
		[labelKey]="destinationCreate() ? 'documentCreatePopup.create' : labelKey()"
		[icon]="icon()"
	/>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePopupTabComponent {
	readonly context = input.required<DocumentViewItemContext & Partial<DocumentCreateContext>>();
	readonly label = input.required<string>();
	readonly labelKey = input<string>();
	readonly icon = input<string>();
	destinationCreate(): boolean {
		return this.context().destinationPicker === true && this.context().viewId === 'create';
	}
}

@Component({
	selector: 'nx-create-popup',
	imports: [DocumentViewsComponent, WebUiMessagePipe],
	template: `<div class="modal-header">
			<h2 class="modal-title">
				{{ 'app.modules.create-popup.create-9d65fb' | webuiMessage: 'Create' }}
			</h2>
			<button
				type="button"
				class="btn-close"
				[attr.aria-label]="'app.modules.create-popup.close-7416a7' | webuiMessage: 'Close'"
				(click)="close()"
			></button>
		</div>
		<div class="modal-body">
			<nx-paired-views
				itemSlot="CREATE_POPUP_ITEMS"
				pageSlot="CREATE_POPUP_PAGES"
				[label]="'app.modules.create-popup.create-content-a04138' | webuiMessage: 'Create content'"
				[context]="context"
			/>
		</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePopupComponent {
	@Input({ required: true }) context!: DocumentCreateContext;
	private readonly modal = inject(BsModalRef);
	private readonly views = viewChild(DocumentViewsComponent);
	async close(): Promise<void> {
		if (await this.views()?.canDeactivate({ reason: 'navigation', nextViewId: null, nextUrl: '' }))
			this.modal.hide();
	}
}
@Component({
	selector: 'nx-create-action',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: `<button
		type="button"
		class="btn btn-primary"
		[disabled]="context().noEdit"
		(click)="open()"
	>
		<nx-webui-icon name="nuxeo:add" />{{
			'app.modules.create-popup.create-9d65fb' | webuiMessage: 'Create'
		}}
	</button>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateActionComponent {
	readonly context = input.required<DocumentCreateContext>();
	open(): void {
		if (!this.context().noEdit) this.context().open();
	}
}
@Component({
	selector: 'nx-create-type-page',
	imports: [WebUiIconComponent, WebUiMessagePipe],
	template: `@if (context().destinationPicker) {
			<div class="type-tiles">
				@for (type of sortedTypes(); track type.name) {
					<button
						type="button"
						class="type-tile"
						[disabled]="context().noEdit"
						[attr.aria-label]="typeLabel(type.name, type.label)"
						(click)="create(type.name)"
					>
						<nx-webui-icon
							[name]="typeIcon({ type: type.name, facets: type.folder ? ['Folderish'] : [] })"
						/>
						<span>{{ typeLabel(type.name, type.label) }}</span>
					</button>
				} @empty {
					<p>
						{{
							'app.modules.create-popup.no-creatable-document-types-are-available--e78ab3'
								| webuiMessage: 'No creatable document types are available here.'
						}}
					</p>
				}
			</div>
		} @else {
			<div class="d-grid gap-2">
				@for (type of sortedTypes(); track type.name) {
					<div class="d-flex gap-2">
						<button
							type="button"
							class="btn btn-outline-secondary flex-grow-1 text-start"
							[disabled]="context().noEdit"
							(click)="create(type.name)"
						>
							<nx-webui-icon
								[name]="typeIcon({ type: type.name, facets: type.folder ? ['Folderish'] : [] })"
							/>{{ type.label }}
						</button>
						@if (type.file) {
							<button
								type="button"
								class="btn btn-outline-secondary"
								[disabled]="context().noEdit"
								(click)="create(type.name, true)"
								[attr.aria-label]="
									'create.typeFromFiles'
										| webuiMessage: 'Create {type} from files' : { type: type.label }
								"
							>
								{{ 'app.modules.create-popup.from-files-a3510a' | webuiMessage: 'From files' }}
							</button>
						}
					</div>
				} @empty {
					<p>
						{{
							'app.modules.create-popup.no-creatable-document-types-are-available--e78ab3'
								| webuiMessage: 'No creatable document types are available here.'
						}}
					</p>
				}
			</div>
		}`,
	styles: `
		.type-tiles {
			display: flex;
			flex-wrap: wrap;
			min-height: 200px;
			align-content: start;
		}
		.type-tile {
			width: 128px;
			height: 128px;
			margin: 4px;
			padding: 4px;
			border: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			background: var(--nuxeo-input-background, rgba(0, 0, 0, 0.05));
			color: inherit;
			font: inherit;
		}
		.type-tile nx-webui-icon {
			width: 42px;
			height: 42px;
		}
		.type-tile span {
			margin-top: 1em;
			max-width: 100%;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.type-tile:not(:disabled):hover,
		.type-tile:focus-visible {
			color: var(--nuxeo-primary-color);
			box-shadow:
				0 0 10px #0003,
				0 -3px 0 var(--nuxeo-primary-color) inset;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTypePageComponent {
	private readonly messages = inject(WebUiMessages);
	/** Stock nuxeo-document-create lists the creatable types by type id. */
	readonly sortedTypes = computed(() =>
		[...this.context().types].sort((a, b) => a.name.localeCompare(b.name, 'en')),
	);
	readonly typeIcon = documentTypeIcon;
	typeLabel(name: string, fallback: string): string {
		const label = documentTypeLabel(name);
		return this.messages.text(
			label.key,
			name === 'OrderedFolder' ? 'Ordered Folder' : fallback || label.fallback,
		);
	}
	readonly context = input.required<DocumentCreateContext>();
	create(type: string, bulk = false): void {
		if (!this.context().noEdit) this.context().create(type, bulk);
	}
}
@Component({
	selector: 'nx-create-import-page',
	imports: [WebUiMessagePipe, WebUiSlotComponent, WebUiIconComponent, FileSizePipe],
	template: `@if (context().destinationPicker) {
			@if (!canImport()) {
				<p class="import-guidance" role="status">
					{{
						'documentImport.error.cannotImport'
							| webuiMessage: 'Select a different container to import your content.'
					}}
				</p>
			}
			<div class="import-dropzone" (dragover)="dragOver($event)" (drop)="drop($event)">
				<button type="button" class="upload-link" [disabled]="!canChooseFiles()" (click)="open()">
					{{
						'documentImportForm.clickOrDrop' | webuiMessage: 'Click or drop files here to upload'
					}}
				</button>
				<div class="import-actions" [hidden]="!hasUploadActions()">
					<span>{{ 'documentImportForm.linkFilesFrom' | webuiMessage: 'or link files from' }}</span>
					<nx-webui-slot
						name="FILE_UPLOAD_ACTIONS"
						[context]="uploadContext()"
						[excludeIds]="['maretha.upload.choose']"
					/>
				</div>
			</div>
			@if (context().selectedFiles?.length) {
				<!-- Keep quoted ICU braces intact: Prettier misreads them as Angular interpolation endings. -->
				<!-- prettier-ignore -->
				<p role="status">
					{{ 'selection.files' | webuiMessage:'{count, plural, one {# file selected} other {# files selected}}': {count: (context().selectedFiles!.length)} }}
				</p>
				<ul class="selected-files">
					@for (file of context().selectedFiles; track $index) {
						<li>
							<span
								>{{ file.name }} <small>{{ file.size | fileSize: 1 }}</small></span
							><button
								type="button"
								[disabled]="context().busy"
								[attr.aria-label]="
									'action.removeNamed' | webuiMessage: 'Remove {name}' : { name: file.name }
								"
								(click)="context().removeSelectedFile?.($index)"
							>
								<nx-webui-icon name="nuxeo:remove" />
							</button>
						</li>
					}
				</ul>
				<button type="button" class="upload-link" [disabled]="context().busy" (click)="open()">
					{{ 'documentImportForm.addMoreFiles' | webuiMessage: 'Add more files' }}
				</button>
			}
		} @else {
			<p>
				{{
					'app.modules.create-popup.create-documents-from-uploaded-files-69fa7e'
						| webuiMessage: 'Create documents from uploaded files.'
				}}
			</p>
			<button type="button" class="btn btn-primary" [disabled]="context().noEdit" (click)="open()">
				{{ 'app.modules.create-popup.select-files-ff2231' | webuiMessage: 'Select files' }}
			</button>
		}`,
	styles: `
		.import-guidance {
			border-inline-start: 4px solid var(--nuxeo-warn-text, #f57c00);
			padding-inline-start: 8px;
		}
		.import-dropzone {
			border: 2px dashed var(--nuxeo-border, #ddd);
			border-radius: 4px;
			background: rgba(0, 0, 0, 0.05);
			min-height: 250px;
			display: flex;
			flex-direction: column;
			gap: 8px;
			justify-content: center;
			align-items: center;
			padding: 1em;
			margin: 16px 0;
		}
		.import-actions:not([hidden]) {
			display: flex;
			flex-wrap: wrap;
			gap: 8px;
			align-items: center;
			justify-content: center;
		}
		.upload-link {
			border: 0;
			background: transparent;
			color: var(--nuxeo-primary-color);
			font: inherit;
			text-decoration: underline;
		}
		.upload-link:disabled {
			color: var(--nuxeo-text-default);
		}
		.selected-files {
			padding: 0;
			list-style: none;
		}
		.selected-files li {
			display: flex;
			gap: 16px;
			justify-content: space-between;
			padding: 12px;
			border: 1px solid var(--nuxeo-border);
			margin-block: 8px;
		}
		.selected-files span {
			overflow-wrap: anywhere;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateImportPageComponent {
	private readonly messages = inject(WebUiMessages);
	readonly context = input.required<DocumentCreateContext>();
	private readonly uploadActions = viewChild(WebUiSlotComponent);
	/** Polymer shows "or link files from" only when FILE_UPLOAD_ACTIONS has visible contributions. */
	readonly hasUploadActions = computed(() => !!this.uploadActions()?.visibleItems().length);
	/** The drop area is the file chooser, so the core choose-files action is excluded here. */
	readonly uploadContext = computed<FileUploadContext>(() => ({
		disabled: !this.canChooseFiles(),
		multiple: true,
		allowedMimeTypes: [],
		label: this.messages.text(
			'documentImportForm.clickOrDrop',
			'Click or drop files here to upload',
		),
		chooseFiles: () => this.open(),
		addFiles: (files) => {
			if (this.canChooseFiles() && files.length) this.context().importSelection?.(files);
		},
	}));
	canImport(): boolean {
		return (
			!this.context().noEdit &&
			(!this.context().destinationPicker || this.context().types.some((type) => type.file))
		);
	}
	canChooseFiles(): boolean {
		return this.context().destinationPicker ? !this.context().busy : !this.context().noEdit;
	}
	open(): void {
		if (this.canChooseFiles()) this.context().importFiles();
	}
	dragOver(event: DragEvent): void {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		event.stopPropagation();
		event.dataTransfer.dropEffect = this.canChooseFiles() ? 'copy' : 'none';
	}
	drop(event: DragEvent): void {
		event.preventDefault();
		event.stopPropagation();
		if (this.context().destinationPicker && this.canChooseFiles()) {
			const files = Array.from(event.dataTransfer?.files ?? []);
			if (files.length) this.context().importSelection?.(files);
		}
	}
}
