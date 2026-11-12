import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { BlobActionContext, WebUiSlotComponent } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	viewChild,
	ElementRef,
	EventEmitter,
	Injector,
	Input,
	TemplateRef,
	inject,
	OnDestroy,
	Output,
	ChangeDetectionStrategy,
	computed,
	effect,
	signal,
} from '@angular/core';
import { animations } from 'app/shared.constants';
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
import { LinkTarget, pdfDefaultOptions } from 'ngx-extended-pdf-viewer';
import { ToastService } from 'app/helpers/toast.service';
import { DocumentsManagerService } from '../../../helpers/documents-manager.service';
import { DocumentAttachmentsService } from 'app/modules/explorer/helpers/document-attachments.service';
import { DocumentSnapshotsService } from 'app/modules/explorer/helpers/document-snapshots.service';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { NoteRendererComponent } from '../note-renderer/note-renderer.component';
import { NgTemplateOutlet } from '@angular/common';
import { ImageRendererComponent } from '../image-renderer/image-renderer.component';
import { VideoRendererComponent } from '../video-renderer/video-renderer.component';
import { AudioRendererComponent } from '../audio-renderer/audio-renderer.component';
import { PdfRendererComponent } from '../pdf-renderer/pdf-renderer.component';
import { ThreedRendererComponent } from '../threed-renderer/threed-renderer.component';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { TranslateModule } from '@ngx-translate/core';
import { FileSizePipe } from 'app/pipes/file-size.pipe';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import { DocumentDetailsPanelComponent } from '../document-details-panel.component';
import { documentUrl } from 'app/helpers/document-route';
import { MetadataPolicyService } from 'app/modules/explorer/helpers/metadata-policy.service';
import { DocumentLayoutGatewayService } from 'app/modules/explorer/helpers/document-layout-gateway.service';
import { canRunDocumentCommand } from '../document-actions-toolbar/document-command-policy';
import { DocumentPaneResizeHandleComponent } from './document-pane-resize-handle.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

@Component({
	selector: 'nx-generic-non-folderish-viewer',
	templateUrl: './generic-non-folderish-viewer.component.html',
	styleUrls: ['./generic-non-folderish-viewer.component.scss'],
	animations: [animations.itemsAnimation],
	imports: [
		DocumentPaneResizeHandleComponent,
		WebUiNumberPipe,
		WebUiSlotComponent,
		FontAwesomeModule,
		TooltipDirective,
		NoteRendererComponent,
		NgTemplateOutlet,
		ImageRendererComponent,
		VideoRendererComponent,
		AudioRendererComponent,
		PdfRendererComponent,
		ThreedRendererComponent,
		DocumentDetailsPanelComponent,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		TranslateModule,
		FileSizePipe,
		NgxTranslateCutModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GenericNonFolderishViewerComponent implements OnDestroy {
	private readonly uiGenericNonFolderishViewerComponentMessages =
		injectUiMessages(RuntimeUiMessages);

	readonly pictureRenderer = viewChild(ImageRendererComponent);
	private _document: any | undefined;
	private readonly sourceDocument = signal<any>(undefined);
	private metadataDocumentSource?: any;
	private metadataVisibilityKey = '';
	private cachedMetadataDocument?: any;
	readonly metadataDocument = computed(() => {
		this.metadataPolicy.revision();
		const document = this.sourceDocument();
		if (!document) return document;
		const visible = this.metadataPolicy.visibleDocument(document);
		const visibilityKey = JSON.stringify(Object.keys(visible.properties || {}));
		if (this.metadataDocumentSource !== document || this.metadataVisibilityKey !== visibilityKey) {
			this.metadataDocumentSource = document;
			this.metadataVisibilityKey = visibilityKey;
			this.cachedMetadataDocument = visible;
		}
		return this.cachedMetadataDocument;
	});
	private destroy$ = new Subject();

	@Output() entryAddedToCollection = new EventEmitter<string>();
	@Input() noEdit = false;
	@Input() mainContentTemplate?: TemplateRef<unknown>;
	private readonly confirmDialog = inject(ConfirmDialogService);
	private readonly gateway = inject(DocumentLayoutGatewayService);
	private destroyed = false;
	savingBlob = false;
	blobError = '';

	mimeType = '';
	contentUrl = '';
	thumbnailUrl = '';
	allowedMimeTypes: string[] = [];
	loading = false;
	metadataHidden = false;
	readonly documentMimeTypes = [
		'application/x-abiword',
		'application/x-freearc',
		'application/vnd.amazon.ebook',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/epub+zip',
		'text/javascript',
		'application/vnd.oasis.opendocument.presentation',
		'application/vnd.oasis.opendocument.spreadsheet',
		'application/vnd.oasis.opendocument.text',
		'application/pdf',
		'application/x-httpd-php',
		'application/vnd.ms-powerpoint',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/rtf',
		'application/xhtml+xml',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'application/xml',
	];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly documentSnapshotsService: DocumentSnapshotsService,
		private readonly toastrService: ToastService,
		public injector: Injector,
		private readonly elementRef: ElementRef,
		private readonly cdr: ChangeDetectorRef,
		private readonly metadataPolicy: MetadataPolicyService,
	) {
		pdfDefaultOptions.assetsFolder = 'bleeding-edge';
		pdfDefaultOptions.externalLinkTarget = LinkTarget.BLANK;
		effect(() => {
			const document = this.sourceDocument();
			this.metadataPolicy.revision();
			if (document)
				this.metadataHidden = this.metadataPolicy.userPreferences(document.type).metadataHidden;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentFetched$.pipe(takeUntil(this.destroy$)).subscribe((x: any) => {
			this.document = x;
			this.cdr.markForCheck();
		});

		documentsManagerService.documentsUpdated$
			.pipe(takeUntil(this.destroy$))
			.subscribe((documents: any[]) => {
				const current = documents.find(
					(document) =>
						document.uid === this.document?.uid &&
						(document.repository ?? 'default') === (this.document?.repository ?? 'default'),
				);
				if (current) {
					this.document = current;
					this.cdr.markForCheck();
				}
			});
	}

	// --------------------------------------------------------------------------------------------------
	get document() {
		return this._document;
	}

	// --------------------------------------------------------------------------------------------------
	@Input()
	set document(value: any) {
		this.contentUrl = '';
		this.thumbnailUrl = '';
		this.mimeType = '';

		if (!value) return;

		this._document = value;
		this.sourceDocument.set(value);

		if (!value.ng.attachment) return;

		this.thumbnailUrl = value.contextParameters.renditions?.find(
			(x: any) => x.name === 'thumbnail',
		)?.url;

		const mimeType = value.ng.attachment['mime-type'];

		if (
			mimeType.startsWith('image') ||
			mimeType.startsWith('audio') ||
			mimeType.startsWith('video')
		) {
			this.contentUrl = value.ng.attachment.data;
			this.mimeType = mimeType.split('/')[0];

			return;
		}

		if (mimeType === 'application/pdf') {
			this.contentUrl = value.ng.attachment.data;
			this.mimeType = 'pdf';

			return;
		}

		const pdfRendition = value.contextParameters?.renditions?.find((x: any) => x.name === 'pdf');
		if (this.isDocumentMimeType(mimeType) && pdfRendition) {
			const renditionUrl = new URL(pdfRendition.url, globalThis.document.baseURI);
			renditionUrl.searchParams.set('changeToken', String(value.changeToken ?? ''));
			this.contentUrl = renditionUrl.href;
			this.mimeType = 'pdf';

			return;
		}

		if (value.type === 'ThreeD') {
			this.contentUrl = value.properties['threed:transmissionFormats']?.length
				? value.properties['threed:transmissionFormats'][0].content.data
				: value.ng.attachment.data;
			this.mimeType = '3d';

			return;
		}

		this.contentUrl = value.ng.attachment.data;
		this.mimeType = mimeType.split('/')[1];
	}

	// --------------------------------------------------------------------------------------------------
	toggleMetadata(): void {
		if (!this.document) return;
		this.metadataHidden = !this.metadataHidden;
		this.metadataPolicy.setUserPreferences(this.document.type, {
			metadataHidden: this.metadataHidden,
		});
		this.cdr.markForCheck();
	}

	// --------------------------------------------------------------------------------------------------
	openInFullscreen() {
		const mediaElementContainer = this.elementRef.nativeElement.querySelector('#media');

		if (!mediaElementContainer) return;

		let mediaElement = mediaElementContainer.querySelector('img');

		if (!mediaElement) mediaElement = mediaElementContainer.querySelector('video');

		if (!mediaElement) return;

		if (mediaElement.requestFullscreen) mediaElement.requestFullscreen();
		else if (mediaElement.webkitRequestFullscreen)
			/* Safari */
			mediaElement.webkitRequestFullscreen();
		else if (mediaElement.msRequestFullscreen) /* IE11 */ mediaElement.msRequestFullscreen();
		else
			this.toastrService.error(
				this.uiGenericNonFolderishViewerComponentMessages.text(
					'app.notices.fullscreen-is-not-available-in-your-browser-abce6c',
					'Fullscreen is not available in your browser.',
				),
				this.uiGenericNonFolderishViewerComponentMessages.text(
					'app.notices.fullscreen-not-available-bdc19a',
					'Fullscreen not available',
				),
				{ enableHtml: false },
			);
	}

	private readonly blobContexts = new WeakMap<object, BlobActionContext>();

	blobContext(blob: any, xpath: string): BlobActionContext {
		const document = this.document;
		const previous = this.blobContexts.get(blob);
		const noEdit = !this.canModifyMainBlob(xpath) || this.savingBlob;
		if (
			previous &&
			previous.document === this.document &&
			previous.xpath === xpath &&
			previous.noEdit === noEdit
		)
			return previous;
		const context: BlobActionContext = {
			document,
			blob,
			xpath,
			noEdit,
			draft: false,
			allowedMimeTypes: [],
			download: () => {
				if (this.currentDocument(document)) this.downloadAttachment(blob);
			},
			replace: (file) => {
				if (xpath === 'file:content' && this.currentDocument(document))
					void this.replaceMainBlob(file);
			},
			remove: () => {
				if (
					xpath !== 'file:content' ||
					!this.currentDocument(document) ||
					!this.canModifyMainBlob(xpath) ||
					this.savingBlob
				)
					return;
				void this.confirmDialog
					.confirm({
						titleKey: 'blob.remove.title',
						title: 'Remove file',
						messageKey: 'app.modules.standard-content-layout.remove-the-attached-file-172d95',
						message: 'Remove the attached file?',
						confirmKey: 'action.remove',
						confirm: 'Remove',
						destructive: true,
					})
					.then((confirmed) => {
						if (
							confirmed &&
							this.currentDocument(document) &&
							this.canModifyMainBlob(xpath) &&
							!this.savingBlob
						)
							void this.saveMainBlob(null);
					});
			},
		};
		this.blobContexts.set(blob, context);
		return context;
	}
	canModifyMainBlob(xpath = 'file:content'): boolean {
		return (
			xpath === 'file:content' &&
			Object.prototype.hasOwnProperty.call(this.document?.properties ?? {}, 'file:content') &&
			!this.document?.isUnderRetentionOrLegalHold &&
			!this.document?.facets?.includes('Immutable') &&
			canRunDocumentCommand({ document: this.document, noEdit: this.noEdit }, 'edit') &&
			this.metadataPolicy.canWrite(this.document, xpath)
		);
	}
	selectMainBlob(event: Event): void {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) void this.replaceMainBlob(file);
		input.value = '';
	}
	async replaceMainBlob(file: File): Promise<void> {
		if (!this.canModifyMainBlob() || this.savingBlob) return;
		const document = this.document;
		this.savingBlob = true;
		this.blobError = '';
		let uploaded: any;
		try {
			uploaded = await this.gateway.uploadBlob(file);
			if (this.currentDocument(document) && this.canModifyMainBlob())
				await this.persistMainBlob(uploaded, document);
		} catch {
			if (this.currentDocument(document))
				this.blobError = this.uiGenericNonFolderishViewerComponentMessages.text(
					'editor.retrySave',
					'Unable to save the document. Your changes have been kept; try again.',
				);
		} finally {
			if (uploaded) await this.gateway.releaseBlob(uploaded).catch(() => undefined);
			this.savingBlob = false;
			if (!this.destroyed) this.cdr.markForCheck();
		}
	}
	async saveMainBlob(blob: unknown): Promise<void> {
		if (!this.canModifyMainBlob() || this.savingBlob) return;
		const document = this.document;
		this.savingBlob = true;
		this.blobError = '';
		try {
			await this.persistMainBlob(blob, document);
		} catch {
			if (this.currentDocument(document))
				this.blobError = this.uiGenericNonFolderishViewerComponentMessages.text(
					'editor.retrySave',
					'Unable to save the document. Your changes have been kept; try again.',
				);
		} finally {
			this.savingBlob = false;
			if (!this.destroyed) this.cdr.markForCheck();
		}
	}
	private currentDocument(document: any): boolean {
		return (
			!this.destroyed &&
			this.document?.uid === document.uid &&
			(this.document?.repository ?? 'default') === (document.repository ?? 'default')
		);
	}
	private async persistMainBlob(blob: unknown, document: any): Promise<void> {
		const properties = { 'file:content': blob };
		await this.metadataPolicy.assertWritable(document, properties);
		if (!this.currentDocument(document) || !this.canModifyMainBlob()) return;
		await this.gateway.update(document, properties, document.repository ?? 'default');
		if (!this.currentDocument(document)) return;
		try {
			const refreshed = await firstValueFrom(
				this.documentsManagerService.reloadDocument(document.uid, document.repository ?? 'default'),
			);
			if (this.currentDocument(document)) this.document = refreshed;
		} catch {
			if (this.currentDocument(document))
				this.blobError = this.uiGenericNonFolderishViewerComponentMessages.text(
					'app.state.saved-but-the-refreshed-document-could-not-be-8ca637',
					'Saved, but the refreshed document could not be loaded. Please reload.',
				);
		}
	}
	// --------------------------------------------------------------------------------------------------
	downloadAttachment(attachment: any = undefined) {
		attachment = attachment || this.document.ng.attachment;

		this.toastrService.info(
			this.uiGenericNonFolderishViewerComponentMessages.format(
				'app.notices.downloading-file-value-4ed119',
				{ value0: attachment.name },
				'Downloading file “{value0}”…',
			),
			this.uiGenericNonFolderishViewerComponentMessages.text(
				'app.notices.file-download-c2574e',
				'File download',
			),
			{ enableHtml: false },
		);

		this.documentAttachmentsService.downloadDocumentBlob(this.document, attachment).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	pdfLoading(loading: boolean) {
		this.loading = loading;
		this.cdr.markForCheck();
	}

	// --------------------------------------------------------------------------------------------------
	refreshRoute() {
		this.router
			.navigateByUrl('/', { skipLocationChange: true })
			.then(() => this.router.navigateByUrl(documentUrl(this.document)));
	}

	// --------------------------------------------------------------------------------------------------
	private isDocumentMimeType(mimeType: string): boolean {
		if (mimeType.startsWith('text/')) return true;

		return this.documentMimeTypes.indexOf(mimeType) >= 0;
	}

	// --------------------------------------------------------------------------------------------------
	ngOnDestroy(): void {
		this.destroyed = true;
		this.destroy$.next(0);
	}
}
