import { NgComponentOutlet } from '@angular/common';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiDatePipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	SimpleChanges,
	inject,
} from '@angular/core';

import { firstValueFrom } from 'rxjs';
import { SchemaFieldComponent, WebUiIconComponent } from '@maretha/webui-sdk';
import { DefaultDocumentMetadataLayoutComponent } from '../default-document-metadata-layout.component';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import { canRunDocumentCommand } from './document-actions-toolbar/document-command-policy';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

const FIELDS = [
	'dc:title',
	'dc:description',
	'dc:nature',
	'dc:subjects',
	'dc:coverage',
	'dc:expired',
];

/** The metadata layouts of Audio, Video and Note contain descriptive fields, never media payloads. */
@Component({
	selector: 'nx-standard-content-metadata',
	standalone: true,
	imports: [
		WebUiDatePipe,
		SchemaFieldComponent,
		WebUiIconComponent,
		FileSizePipe,
		WebUiMessagePipe,
		NgComponentOutlet,
	],
	template: `
		@if (!externalToolbar) {
			<header>
				<h3>
					{{ 'app.modules.standard-content-metadata.details-79a8eb' | webuiMessage: 'Details' }}
				</h3>
				@if (hasEditableFields && !editing) {
					<button
						type="button"
						[attr.aria-label]="
							'app.modules.standard-content-metadata.edit-metadata-8a9af9'
								| webuiMessage: 'Edit metadata'
						"
						[disabled]="saving"
						(click)="beginEdit()"
					>
						<nx-webui-icon name="nuxeo:edit" />
					</button>
				}
			</header>
		}
		@if (saveError) {
			<p role="alert">{{ saveError }}</p>
		}
		@for (schema of visibleSchemas; track schema.name) {
			@for (field of schema.fields; track field.property) {
				<div class="field">
					@if (editing && canEdit(field)) {
						@if (widgetProps(field); as props) {
							@if (customWidget(field); as widget) {
								<ng-container *ngComponentOutlet="widget.component; inputs: { props: props }" />
							} @else {
								<nx-schema-field [props]="props" />
							}
						}
					} @else {
						<div class="field-label">
							{{
								field.property === 'note:mime_type'
									? ('app.modules.standard-content-metadata.format-640546' | webuiMessage: 'Format')
									: field.property === 'dc:expired'
										? ('app.modules.standard-content-metadata.expiration-date-a380a2'
											| webuiMessage: 'Expiration date')
										: fieldLabel(field)
							}}
						</div>
						<div class="value">
							@if (field.property === 'dc:expired') {
								{{ $any(field.value) | webuiDate: 'mediumDate' }}
							} @else if (field.property === 'note:mime_type') {
								{{
									field.value === 'text/html'
										? ('mimetype.text/html' | webuiMessage: 'HTML')
										: field.value === 'text/plain'
											? ('mimetype.text/plain' | webuiMessage: 'Text')
											: field.value
								}}
							} @else {
								{{ display(field.value, directoryFor(field.property)) }}
							}
						</div>
					}
				</div>
			}
		}
		@if (editing && hasEditableFields) {
			<div class="actions">
				<button type="button" [disabled]="saving" (click)="cancelEdit()">
					{{
						'app.modules.standard-content-metadata.cancel-ff3ca4' | webuiMessage: 'Cancel'
					}}</button
				><button type="button" [disabled]="saving || !dirty || hasInvalidChanges" (click)="save()">
					{{
						saving
							? ('sdk.layout.saving' | webuiMessage: 'Saving…')
							: ('app.modules.standard-content-metadata.save-ef93f6' | webuiMessage: 'Save')
					}}
				</button>
			</div>
		}
		@if (mayReadAttachments) {
			<section
				class="attachments"
				[attr.aria-label]="'documentAttachments.heading' | webuiMessage: 'Attachments'"
			>
				<h3>{{ 'documentAttachments.heading' | webuiMessage: 'Attachments' }}</h3>
				@for (item of attachedFiles; track $index) {
					<div class="attachment">
						<!-- Stock lists each attachment as a download link named by its file name. -->
						<a
							class="download"
							[href]="item.file.data || '#'"
							[attr.download]="item.file.name"
							(click)="download($event, item.file)"
							>{{ item.file.name }}</a
						><span>{{ item.file.length | fileSize }}</span>
						@if (mayWriteAttachments) {
							<button
								type="button"
								[disabled]="uploading"
								[attr.aria-label]="
									'action.removeNamed' | webuiMessage: 'Remove {name}' : { name: item.file.name }
								"
								(click)="removeAttachment($index)"
							>
								<nx-webui-icon name="nuxeo:remove" />
							</button>
						}
					</div>
				}
				@if (mayWriteAttachments) {
					<label class="upload"
						>{{
							uploading
								? ('app.modules.standard-content-metadata.uploading-021247'
									| webuiMessage: 'Uploading…')
								: ('app.modules.standard-content-metadata.click-to-upload-files-fd1ef8'
									| webuiMessage: 'Click to upload files')
						}}<input
							type="file"
							multiple
							[disabled]="uploading"
							(change)="uploadAttachments($event)"
					/></label>
				}
				@if (attachmentError) {
					<p role="alert">{{ attachmentError }}</p>
				}
			</section>
		}
	`,
	styles: [
		`
			:host {
				display: block;
				font-size: 12px;
			}
			header,
			.actions,
			.attachment {
				display: flex;
				align-items: center;
				gap: 8px;
			}
			header {
				justify-content: space-between;
				margin-bottom: 16px;
			}
			h3 {
				font-size: 13px;
				font-weight: 600;
				margin: 0;
			}
			button {
				border: 0;
				background: transparent;
				color: var(--nuxeo-primary-color);
				padding: 4px;
			}
			nx-webui-icon {
				width: 18px;
				height: 18px;
			}
			.field {
				margin-bottom: 16px;
			}
			.field-label {
				font-weight: 400;
				margin-bottom: 4px;
			}
			.value {
				white-space: pre-wrap;
				overflow-wrap: anywhere;
			}
			.attachments {
				margin-top: 24px;
			}
			.attachments h3 {
				margin-bottom: 12px;
			}
			.download {
				overflow-wrap: anywhere;
				text-align: start;
				flex: 1;
			}
			.upload {
				display: block;
				text-align: center;
				padding: 16px;
				border: 2px dashed var(--nuxeo-border, #ddd);
				margin-top: 12px;
				cursor: pointer;
			}
			.upload {
				position: relative;
			}
			.upload input {
				position: absolute;
				inset: 0;
				width: 100%;
				opacity: 0;
				cursor: pointer;
			}
			.upload:focus-within {
				outline: 2px solid var(--nuxeo-primary-color);
			}
			[role='alert'] {
				color: var(--bs-danger);
			}
		`,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardContentMetadataComponent extends DefaultDocumentMetadataLayoutComponent {
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly contentPolicy = inject(MetadataPolicyService);
	private readonly contentGateway = inject(DocumentLayoutGatewayService);
	private readonly contentDocuments = inject(DocumentsManagerService);
	private readonly downloads = inject(DocumentAttachmentsService);
	private readonly contentCdr = inject(ChangeDetectorRef);
	private readonly contentDestroy = inject(DestroyRef);
	private contentGeneration = 0;
	uploading = false;
	private readonly attachmentErrorMessageState = localizedText();
	get attachmentError(): string {
		return this.attachmentErrorMessageState();
	}
	set attachmentError(value: string | MessageText) {
		this.attachmentErrorMessageState.set(value);
	}
	override ngOnChanges(changes: SimpleChanges): void {
		if (changes['document']) {
			this.contentGeneration++;
			this.saving = this.uploading = false;
			this.saveError = this.attachmentError = '';
		}
		super.ngOnChanges(changes);
	}
	override get allowedFields() {
		const supplemental = new Set(this.supplementalFields().map((field) => field.property));
		return super.allowedFields.filter(
			(field) =>
				FIELDS.includes(field.property) ||
				supplemental.has(field.property) ||
				(this.document?.type === 'Note' && field.property === 'note:mime_type'),
		);
	}
	override canEdit(
		field: Parameters<DefaultDocumentMetadataLayoutComponent['canEdit']>[0],
	): boolean {
		return (
			!this.document?.isUnderRetentionOrLegalHold &&
			!this.document?.facets?.includes('Immutable') &&
			canRunDocumentCommand(
				{ document: this.document, noEdit: this.noEdit || this.layoutContext?.noEdit === true },
				'edit',
			) &&
			super.canEdit(field)
		);
	}
	override async save(): Promise<void> {
		if (!this.hasEditableFields || !this.dirty || this.saving || this.hasInvalidChanges) return;
		const document = this.document;
		const generation = this.contentGeneration;
		const properties = Object.fromEntries(
			this.allowedFields
				.filter(
					(field) =>
						this.canEdit(field) &&
						JSON.stringify(field.value) !== JSON.stringify(document.properties?.[field.property]),
				)
				.map((field) => [field.property, field.value]),
		);
		if (!Object.keys(properties).length) return;
		this.saving = true;
		this.saveError = '';
		try {
			await this.contentPolicy.assertWritable(document, properties);
			if (!this.isCurrent(document, generation) || !this.hasEditableFields) return;
			const updated = await this.contentGateway.update(
				document,
				properties,
				document.repository ?? 'default',
			);
			if (!this.isCurrent(document, generation)) return;
			this.document = {
				...document,
				...updated,
				properties: { ...document.properties, ...properties, ...updated.properties },
			};
			this.saving = false;
			this.cancelEdit();
			this.saving = true;
			try {
				const refreshed = await firstValueFrom(
					this.contentDocuments.reloadDocument(document.uid, document.repository ?? 'default'),
				);
				if (!this.isCurrent(document, generation)) return;
				this.document = refreshed;
			} catch {
				if (this.isCurrent(document, generation))
					this.saveError = messageText(
						'metadata.savedRefreshFailed',
						'Saved, but the refreshed document could not be loaded. Please reload.',
					);
			}
		} catch {
			if (this.isCurrent(document, generation))
				this.saveError = messageText(
					'metadata.saveRetry',
					'Metadata could not be saved. Your changes have been kept; try again.',
				);
		} finally {
			if (this.isCurrent(document, generation)) {
				this.saving = false;
				this.contentCdr.markForCheck();
			}
		}
	}
	get mayReadAttachments(): boolean {
		return this.contentPolicy.canRead(this.document, 'files:files');
	}
	get mayWriteAttachments(): boolean {
		return (
			!this.document?.isUnderRetentionOrLegalHold &&
			!this.document?.facets?.includes('Immutable') &&
			canRunDocumentCommand(
				{ document: this.document, noEdit: this.noEdit || this.layoutContext?.noEdit === true },
				'edit',
			) &&
			this.contentPolicy.canWrite(this.document, 'files:files')
		);
	}
	get attachedFiles(): any[] {
		return this.document?.properties?.['files:files'] ?? [];
	}
	download(event: Event, blob: any): void {
		// The link href is a stock-compatible fallback; the download itself goes through a grant.
		event.preventDefault();
		this.downloads.downloadDocumentBlob(this.document, blob).subscribe();
	}
	async uploadAttachments(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		if (!this.mayWriteAttachments || this.uploading || !input.files?.length) return;
		const document = this.document;
		const generation = this.contentGeneration;
		const originalFiles = [...this.attachedFiles];
		this.uploading = true;
		this.attachmentError = '';
		const uploaded: any[] = [];
		try {
			for (const file of Array.from(input.files)) {
				if (!this.isCurrent(document, generation) || !this.mayWriteAttachments) return;
				uploaded.push(await this.contentGateway.uploadBlob(file));
			}
			await this.saveAttachments(
				document,
				[...originalFiles, ...uploaded.map((file) => ({ file }))],
				generation,
			);
		} catch {
			if (this.isCurrent(document, generation))
				this.attachmentError = messageText(
					'app.state.the-attachments-could-not-be-saved-please-try-5a9bdd',
					'The attachments could not be saved. Please try again.',
				);
		} finally {
			await Promise.all(
				uploaded.map((blob) => this.contentGateway.releaseBlob(blob).catch(() => undefined)),
			);
			input.value = '';
			if (this.isCurrent(document, generation)) {
				this.uploading = false;
				this.contentCdr.markForCheck();
			}
		}
	}
	async removeAttachment(index: number): Promise<void> {
		if (!this.mayWriteAttachments || this.uploading) return;
		const document = this.document;
		const generation = this.contentGeneration;
		const name = this.attachedFiles[index]?.file?.name ?? '';
		const confirmed = await this.confirmDialog.confirm({
			titleKey: 'attachments.remove.title',
			title: 'Remove attachment',
			messageKey: 'attachments.remove.confirm',
			message: 'Remove the attachment {name}?',
			messageValues: { name },
			confirmKey: 'action.remove',
			confirm: 'Remove',
			destructive: true,
		});
		if (!confirmed || !this.isCurrent(document, generation) || this.uploading) return;
		this.uploading = true;
		this.attachmentError = '';
		try {
			await this.saveAttachments(
				document,
				this.attachedFiles.filter((_, current) => current !== index),
				generation,
			);
		} catch {
			if (this.isCurrent(document, generation))
				this.attachmentError = messageText(
					'app.state.the-attachment-could-not-be-removed-please-tr-0846e5',
					'The attachment could not be removed. Please try again.',
				);
		} finally {
			if (this.isCurrent(document, generation)) {
				this.uploading = false;
				this.contentCdr.markForCheck();
			}
		}
	}
	private isCurrent(document: any, generation: number): boolean {
		return (
			!this.contentDestroy.destroyed &&
			generation === this.contentGeneration &&
			this.document?.uid === document.uid &&
			this.document?.repository === document.repository
		);
	}
	private async saveAttachments(document: any, files: any[], generation: number): Promise<void> {
		if (!this.isCurrent(document, generation) || !this.mayWriteAttachments) return;
		await this.contentPolicy.assertWritable(document, { 'files:files': files });
		if (!this.isCurrent(document, generation) || !this.mayWriteAttachments) return;
		const updated = await this.contentGateway.update(
			document,
			{ 'files:files': files },
			document.repository ?? 'default',
		);
		if (!this.isCurrent(document, generation)) return;
		this.document = {
			...document,
			...updated,
			properties: { ...document.properties, 'files:files': files, ...updated.properties },
		};
		try {
			const refreshed = await firstValueFrom(
				this.contentDocuments.reloadDocument(document.uid, document.repository ?? 'default'),
			);
			if (this.isCurrent(document, generation)) this.document = refreshed;
		} catch {
			if (this.isCurrent(document, generation))
				this.attachmentError = messageText(
					'app.state.saved-but-the-refreshed-document-could-not-be-8ca637',
					'Saved, but the refreshed document could not be loaded. Please reload.',
				);
		}
	}
}
