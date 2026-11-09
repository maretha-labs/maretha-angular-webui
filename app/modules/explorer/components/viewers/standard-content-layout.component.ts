import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Input,
	OnChanges,
	DestroyRef,
	inject,
	effect,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
	BlobActionContext,
	DocumentLayoutContext,
	WebUiIconComponent,
	WebUiSlotComponent,
} from '@maretha/webui-sdk';
import { DocumentDetailsPanelComponent } from './document-details-panel.component';
import { canRunDocumentCommand } from './document-actions-toolbar/document-command-policy';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';
import { DocumentsManagerService } from '../../helpers/documents-manager.service';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { FileSizePipe } from '../../../../pipes/file-size.pipe';
import { LazyLoadDirective } from '../../../../directives/lazy-load.directive';
import { StreamMediaDirective } from '../../../../directives/stream-media.directive';
import { NoteRichtextEditorComponent } from './note-richtext-editor.component';
import { MetadataPolicyService } from '../../helpers/metadata-policy.service';
import { environment } from 'environments/environment';
import { NoteContentLocaleDirective, NoteHtmlPipe } from './note-html.pipe';
import { MarkdownComponent } from 'ngx-markdown';
import { hasPermission } from 'app/helpers/document-permissions';

/** Used only by Audio, Video and Note; the approved File/Picture/Folder viewers stay unchanged. */
@Component({
	selector: 'nx-standard-content-layout',
	standalone: true,
	imports: [
		WebUiNumberPipe,
		FormsModule,
		LazyLoadDirective,
		StreamMediaDirective,
		NoteRichtextEditorComponent,
		NoteContentLocaleDirective,
		NoteHtmlPipe,
		MarkdownComponent,
		WebUiIconComponent,
		WebUiSlotComponent,
		DocumentDetailsPanelComponent,
		FileSizePipe,
		WebUiMessagePipe,
	],
	templateUrl: './standard-content-layout.component.html',
	styleUrl: './standard-content-layout.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandardContentLayoutComponent implements OnChanges {
	@Input() document: any;
	@Input() layoutContext?: DocumentLayoutContext;
	@Input() noEdit = false;
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private readonly documents = inject(DocumentsManagerService);
	private readonly attachments = inject(DocumentAttachmentsService);
	private readonly cdr = inject(ChangeDetectorRef);
	private readonly metadataPolicy = inject(MetadataPolicyService);
	private readonly http = inject(HttpClient);
	private readonly destroyRef = inject(DestroyRef);
	private generation = 0;
	private readonly videoCapabilities = globalThis.document.createElement('video');
	versionKind = 'major';
	versionSaving = false;
	private readonly versionErrorMessageState = localizedText();
	get versionError(): string {
		return this.versionErrorMessageState();
	}
	set versionError(value: string | MessageText) {
		this.versionErrorMessageState.set(value);
	}
	private documentId?: string;
	draft = '';
	editing = false;
	sourceMode = false;
	saving = false;
	confirmRemove = false;
	private readonly errorMessageState = localizedText();
	get error(): string {
		return this.errorMessageState();
	}
	set error(value: string | MessageText) {
		this.errorMessageState.set(value);
	}
	mediaError = '';
	metadataHidden = false;
	private originalNote = '';
	private noteMimeType = '';
	private cachedBlobActions?: BlobActionContext;

	constructor() {
		this.destroyRef.onDestroy(() => this.generation++);
		effect(() => {
			this.metadataPolicy.revision();
			if (this.document)
				this.metadataHidden = this.metadataPolicy.userPreferences(
					this.document.type,
				).metadataHidden;
			if (!this.canEdit) this.resetNote();
			else if (!this.editing && !this.hasNoteValue) this.editing = this.defaultNoteEditing();
			this.cdr.markForCheck();
		});
	}
	ngOnChanges(): void {
		const identity = this.document
			? `${this.document.repository ?? 'default'}:${this.document.uid}`
			: undefined;
		if (this.documentId !== identity) {
			this.documentId = identity;
			this.generation++;
			this.editing = false;
			this.saving = this.versionSaving = false;
			this.confirmRemove = false;
			this.sourceMode = false;
			this.error = '';
			this.mediaError = '';
			this.versionError = '';
		}
		if (
			!this.editing ||
			!this.canEdit ||
			this.originalNote !== (this.document?.properties?.['note:note'] ?? '') ||
			this.noteMimeType !== (this.document?.properties?.['note:mime_type'] ?? '')
		)
			this.resetNote();
		if (!this.canEdit) this.editing = false;
		if (this.document)
			this.metadataHidden = this.metadataPolicy.userPreferences(this.document.type).metadataHidden;
	}

	get canEdit(): boolean {
		return (
			this.metadataPolicy.canWrite(
				this.document,
				this.document?.type === 'Note' ? 'note:note' : 'file:content',
			) &&
			!this.document?.isUnderRetentionOrLegalHold &&
			!this.document?.facets?.includes('Immutable') &&
			canRunDocumentCommand(
				{
					document: this.document,
					noEdit: this.noEdit || this.layoutContext?.noEdit === true,
				},
				'edit',
			)
		);
	}
	get hasNoteValue(): boolean {
		const value = this.document?.properties?.['note:note'];
		return typeof value === 'string' && value.length > 0;
	}
	get mayReadContent(): boolean {
		return this.metadataPolicy.canRead(
			this.document,
			this.document?.type === 'Note' ? 'note:note' : 'file:content',
		);
	}
	get isHtml(): boolean {
		return this.document?.properties?.['note:mime_type'] === 'text/html';
	}
	get isMarkdown(): boolean {
		return /^text\/(?:.*-)?markdown$/.test(this.document?.properties?.['note:mime_type'] ?? '');
	}
	get canCreateVersion(): boolean {
		return (
			!this.noEdit &&
			this.layoutContext?.noEdit !== true &&
			!this.document?.isVersion &&
			!this.document?.isProxy &&
			!this.document?.isTrashed &&
			!this.document?.isUnderRetentionOrLegalHold &&
			!this.document?.isRecord &&
			!this.document?.facets?.includes('Immutable') &&
			!this.document?.facets?.includes('Record') &&
			this.document?.facets?.includes('Versionable') &&
			hasPermission(this.document, 'WriteVersion')
		);
	}
	get nextMinorVersion(): string {
		return `${this.document?.properties?.['uid:major_version'] ?? 0}.${Number(this.document?.properties?.['uid:minor_version'] ?? 0) + 1}`;
	}
	get nextMajorVersion(): string {
		return `${Number(this.document?.properties?.['uid:major_version'] ?? 0) + 1}.0`;
	}
	async createVersion(dialog: HTMLDialogElement): Promise<void> {
		if (!this.canCreateVersion || this.versionSaving) return;
		const document = this.document;
		const generation = this.generation;
		this.versionSaving = true;
		this.versionError = '';
		try {
			await firstValueFrom(
				this.http.post(
					`${environment.nuxeoUrl}/api/v1/automation/Document.CreateVersion`,
					{
						input: document.uid,
						params: { increment: this.versionKind, saveDocument: true },
						context: {},
					},
					{
						headers: {
							'X-Versioning-Option': this.versionKind,
							'X-NXRepository': document.repository ?? 'default',
						},
					},
				),
			);
			if (generation !== this.generation) return;
			dialog.close();
			try {
				const refreshed = await firstValueFrom(
					this.documents.reloadDocument(document.uid, document.repository ?? 'default'),
				);
				if (generation !== this.generation) return;
				this.document = refreshed;
			} catch {
				if (generation === this.generation)
					this.error = messageText(
						'app.state.the-version-was-created-but-the-refreshed-doc-8e261a',
						'The version was created, but the refreshed document could not be loaded. Please reload.',
					);
			}
		} catch {
			if (generation === this.generation)
				this.versionError = messageText(
					'app.state.the-version-could-not-be-created-please-try-a-71fe33',
					'The version could not be created. Please try again.',
				);
		} finally {
			if (generation === this.generation) {
				this.versionSaving = false;
				this.cdr.markForCheck();
			}
		}
	}
	get blob(): any {
		return this.document?.properties?.['file:content'];
	}
	get videoInfo(): any {
		return this.metadataPolicy.canRead(this.document, 'vid:info')
			? this.document?.properties?.['vid:info']
			: undefined;
	}
	get conversions(): any[] {
		if (!this.metadataPolicy.canRead(this.document, 'vid:transcodedVideos')) return [];
		return (this.document?.properties?.['vid:transcodedVideos'] ?? []).filter(
			(item: any) => item.content?.data,
		);
	}
	get previewBlob(): any {
		if (this.document?.type !== 'Video') return this.blob;
		return (
			this.conversions.find((conversion) => {
				const type = conversion.content?.['mime-type'] ?? conversion.content?.mimeType ?? '';
				return type.startsWith('video/') && this.videoCapabilities.canPlayType(type);
			})?.content ?? this.blob
		);
	}
	get storyboard(): any[] {
		return this.metadataPolicy.canRead(this.document, 'vid:storyboard')
			? (this.document?.properties?.['vid:storyboard'] ?? [])
			: [];
	}
	get thumbnail(): string {
		return (
			this.document?.contextParameters?.thumbnail?.url ??
			this.document?.contextParameters?.renditions?.find((item: any) => item.name === 'thumbnail')
				?.url ??
			''
		);
	}
	get blobActions(): BlobActionContext {
		if (
			this.cachedBlobActions &&
			this.cachedBlobActions.document === this.document &&
			this.cachedBlobActions.blob === this.blob &&
			this.cachedBlobActions.noEdit === (!this.canEdit || this.saving)
		)
			return this.cachedBlobActions;
		this.cachedBlobActions = {
			document: this.document,
			blob: this.blob,
			xpath: 'file:content',
			noEdit: !this.canEdit || this.saving,
			draft: false,
			allowedMimeTypes: [this.document.type === 'Audio' ? 'audio/*' : 'video/*'],
			replace: (file) => {
				void this.replaceBlob(file);
			},
			remove: () => {
				if (this.canEdit && !this.saving) this.confirmRemove = true;
			},
			download: () => this.attachments.downloadDocumentBlob(this.document, this.blob).subscribe(),
		};
		return this.cachedBlobActions;
	}
	beginEdit(): void {
		if (!this.canEdit || this.saving) return;
		this.draft = this.document.properties['note:note'] ?? '';
		this.originalNote = this.draft;
		this.error = '';
		this.editing = true;
	}
	cancelEdit(): void {
		if (this.saving) return;
		this.draft = this.originalNote;
		this.error = '';
		this.editing = this.defaultNoteEditing();
		this.sourceMode = false;
	}
	toggleMetadata(): void {
		this.metadataHidden = !this.metadataHidden;
		this.metadataPolicy.setUserPreferences(this.document.type, {
			metadataHidden: this.metadataHidden,
		});
	}
	async saveNote(): Promise<void> {
		if (!this.canEdit || this.saving || this.draft === this.originalNote) return;
		await this.save({ 'note:note': this.draft });
	}
	async upload(event: Event): Promise<void> {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) await this.replaceBlob(file);
		input.value = '';
	}
	async replaceBlob(file: File): Promise<void> {
		if (!this.canEdit || this.saving) return;
		const document = this.document;
		const generation = this.generation;
		this.saving = true;
		this.error = '';
		try {
			const blob = await this.gateway.uploadBlob(file);
			try {
				if (generation === this.generation)
					await this.persist({ 'file:content': blob }, document, generation);
			} finally {
				await this.gateway.releaseBlob(blob).catch(() => undefined);
			}
		} catch (error) {
			if (generation === this.generation) this.error = this.errorText(error);
		} finally {
			if (generation === this.generation) {
				this.saving = false;
				this.cdr.markForCheck();
			}
		}
	}
	async removeBlob(): Promise<void> {
		if (!this.canEdit || this.saving || !this.confirmRemove) return;
		await this.save({ 'file:content': null });
		if (!this.error) this.confirmRemove = false;
	}
	download(event: Event, blob: any): void {
		event.preventDefault();
		this.attachments.downloadDocumentBlob(this.document, blob).subscribe();
	}
	seek(player: HTMLVideoElement, position: unknown): void {
		const seconds = Number(position);
		if (Number.isFinite(seconds) && seconds >= 0) player.currentTime = seconds;
	}
	private async save(properties: Record<string, unknown>): Promise<void> {
		const generation = this.generation;
		this.saving = true;
		this.error = '';
		try {
			await this.persist(properties);
		} catch (error) {
			if (generation === this.generation) this.error = this.errorText(error);
		} finally {
			if (generation === this.generation) {
				this.saving = false;
				this.cdr.markForCheck();
			}
		}
	}
	private async persist(
		properties: Record<string, unknown>,
		document = this.document,
		generation = this.generation,
	): Promise<void> {
		await this.metadataPolicy.assertWritable(document, properties);
		if (generation !== this.generation || !this.canEdit) return;
		const updated = await this.gateway.update(
			document,
			properties,
			document.repository ?? 'default',
		);
		if (generation !== this.generation) return;
		this.document = {
			...document,
			...updated,
			properties: { ...document.properties, ...properties, ...updated.properties },
		};
		this.editing = false;
		this.ngOnChanges();
		if (properties['file:content'] === null) this.confirmRemove = false;
		try {
			const refreshed = await firstValueFrom(
				this.documents.reloadDocument(document.uid, document.repository ?? 'default'),
			);
			if (generation !== this.generation) return;
			this.document = refreshed;
			this.ngOnChanges();
		} catch {
			if (generation === this.generation)
				this.error = messageText(
					'app.state.saved-but-the-refreshed-document-could-not-be-8ca637',
					'Saved, but the refreshed document could not be loaded. Please reload.',
				);
		}
	}
	private resetNote(): void {
		this.originalNote = this.document?.properties?.['note:note'] ?? '';
		this.noteMimeType = this.document?.properties?.['note:mime_type'] ?? '';
		this.draft = this.originalNote;
		this.editing = this.defaultNoteEditing();
		this.sourceMode = false;
	}
	private defaultNoteEditing(): boolean {
		if (this.document?.type !== 'Note' || !this.canEdit) return false;
		return !this.hasNoteValue;
	}
	private errorText(error: any): MessageText {
		return error?.status === 409
			? messageText('editor.changed', 'This document changed. Reload it before saving again.')
			: messageText(
					'editor.retrySave',
					'Unable to save the document. Your changes have been kept; try again.',
				);
	}
}
