import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { LinkTarget, pdfDefaultOptions } from 'ngx-extended-pdf-viewer';
import { AudioRendererComponent } from 'app/modules/explorer/components/viewers/audio-renderer/audio-renderer.component';
import { ImageRendererComponent } from 'app/modules/explorer/components/viewers/image-renderer/image-renderer.component';
import { PdfRendererComponent } from 'app/modules/explorer/components/viewers/pdf-renderer/pdf-renderer.component';
import { VideoRendererComponent } from 'app/modules/explorer/components/viewers/video-renderer/video-renderer.component';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { FileSizePipe } from 'app/pipes/file-size.pipe';

export type TaskDocumentPreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'none';
export interface TaskDocumentPreview {
	readonly kind: TaskDocumentPreviewKind;
	readonly contentUrl: string;
	readonly thumbnailUrl: string;
}

const OFFICE_MIME_TYPES = new Set([
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.oasis.opendocument.presentation',
	'application/vnd.oasis.opendocument.spreadsheet',
	'application/vnd.oasis.opendocument.text',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/rtf',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** The main-file preview the document page shows (generic-non-folderish-viewer's mapping). */
export function taskDocumentPreview(document: any): TaskDocumentPreview {
	const renditions: any[] = document?.contextParameters?.renditions ?? [];
	const thumbnailUrl = String(
		renditions.find((rendition) => rendition?.name === 'thumbnail')?.url ??
			document?.contextParameters?.thumbnail?.url ??
			'',
	);
	const attachment = document?.ng?.attachment;
	const mimeType = String(attachment?.['mime-type'] ?? '');
	const contentUrl = String(attachment?.data ?? '');
	if (!attachment || !mimeType) return { kind: 'none', contentUrl: '', thumbnailUrl };
	const family = mimeType.split('/')[0];
	if (family === 'image' || family === 'video' || family === 'audio')
		return { kind: family as TaskDocumentPreviewKind, contentUrl, thumbnailUrl };
	if (mimeType === 'application/pdf') return { kind: 'pdf', contentUrl, thumbnailUrl };
	const pdf = renditions.find((rendition) => rendition?.name === 'pdf');
	if (OFFICE_MIME_TYPES.has(mimeType) && pdf?.url) {
		const url = new URL(pdf.url, globalThis.document.baseURI);
		url.searchParams.set('changeToken', String(document?.changeToken ?? ''));
		return { kind: 'pdf', contentUrl: url.href, thumbnailUrl };
	}
	return { kind: 'none', contentUrl, thumbnailUrl };
}

/**
 * Stock task view's document column (nuxeo-tasks.html:133-137): nuxeo-document-view, the type's
 * view layout. For File and Picture that is nuxeo-document-viewer: the main file's preview over
 * its blob row (name, size, download), or the thumbnail when there is no main file.
 */
@Component({
	selector: 'nx-task-document-view',
	imports: [
		FontAwesomeModule,
		WebUiMessagePipe,
		FileSizePipe,
		ImageRendererComponent,
		PdfRendererComponent,
		VideoRendererComponent,
		AudioRendererComponent,
	],
	template: `@let doc = document();
		@let view = preview();
		@switch (view.kind) {
			@case ('image') {
				<nx-image-renderer [document]="doc" [contentUrl]="view.contentUrl" [externalCards]="true" />
			}
			@case ('pdf') {
				<nx-pdf-renderer class="preview" [document]="doc" [contentUrl]="view.contentUrl" />
			}
			@case ('video') {
				<nx-video-renderer
					class="preview"
					[document]="doc"
					[thumbnailUrl]="view.thumbnailUrl"
					[contentUrl]="view.contentUrl"
				/>
			}
			@case ('audio') {
				<nx-audio-renderer class="preview" [document]="doc" [contentUrl]="view.contentUrl" />
			}
			@default {
				@if (view.thumbnailUrl) {
					<img class="thumbnail" [src]="view.thumbnailUrl" alt="" />
				}
			}
		}
		@if (view.kind !== 'image' && doc?.ng?.attachment; as blob) {
			<footer class="blob">
				<div class="blob-info">
					<span [title]="blob.name">{{ blob.name }}</span>
					<small>{{ blob.length | fileSize: 2 }}</small>
				</div>
				<button
					type="button"
					[attr.aria-label]="
						'app.modules.image-renderer.download-original-file-99f0e9'
							| webuiMessage: 'Download original file'
					"
					[title]="
						'app.modules.image-renderer.download-original-file-99f0e9'
							| webuiMessage: 'Download original file'
					"
					(click)="download()"
				>
					<fa-icon icon="download" />
				</button>
			</footer>
		}`,
	styles: `
		:host {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.preview {
			display: block;
			width: 100%;
			height: calc(80vh - 100px);
			min-height: 280px;
		}
		.thumbnail {
			display: block;
			width: 100%;
			height: calc(80vh - 100px);
			object-fit: contain;
		}
		.blob {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 16px;
			margin-top: 8px;
			font-size: 12px;
		}
		.blob-info {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}
		.blob-info span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.blob-info small {
			margin-top: 4px;
			opacity: 0.7;
		}
		.blob button {
			border: 0;
			padding: 8px;
			background: transparent;
			color: var(--nuxeo-text-default);
			cursor: pointer;
		}
	`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDocumentViewComponent {
	readonly document = input<any>(null);
	readonly preview = computed(() => taskDocumentPreview(this.document()));
	private readonly attachments = inject(DocumentAttachmentsService);

	constructor() {
		// Same viewer assets as the document page's PDF preview.
		pdfDefaultOptions.assetsFolder = 'bleeding-edge';
		pdfDefaultOptions.externalLinkTarget = LinkTarget.BLANK;
	}

	download(): void {
		const document = this.document();
		const blob = document?.ng?.attachment;
		if (blob) this.attachments.downloadDocumentBlob(document, blob).subscribe();
	}
}
