import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { BlobActionContext, WebUiSlotComponent } from '@maretha/webui-sdk';
import {
	Component,
	booleanAttribute,
	EventEmitter,
	Input,
	OnInit,
	Output,
	Renderer2,
	ChangeDetectionStrategy,
} from '@angular/core';
import { ToastService } from 'app/helpers/toast.service';
import { DocumentAttachmentsService } from '../../helpers/document-attachments.service';
import { DragAndDropDirective } from '../../../../directives/drag-and-drop.directive';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
	BsDropdownDirective,
	BsDropdownToggleDirective,
	BsDropdownMenuDirective,
} from 'ngx-bootstrap/dropdown';
import { NgTemplateOutlet, NgClass } from '@angular/common';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { PlaceholderTemplateDirective } from '../../../../directives/placeholder-template.directive';
import { TranslateModule } from '@ngx-translate/core';
import { FileSizePipe } from 'app/pipes/file-size.pipe';

@Component({
	selector: 'nx-document-attachments',
	templateUrl: './document-attachments.component.html',
	styleUrls: ['./document-attachments.component.scss'],
	imports: [
		DragAndDropDirective,
		FontAwesomeModule,
		BsDropdownDirective,
		BsDropdownToggleDirective,
		BsDropdownMenuDirective,
		NgTemplateOutlet,
		FileUploadComponent,
		PlaceholderTemplateDirective,
		NgClass,
		TranslateModule,
		FileSizePipe,
		WebUiSlotComponent,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocumentAttachmentsComponent implements OnInit {
	private readonly uiDocumentAttachmentsComponentMessages = injectUiMessages(RuntimeUiMessages);

	@Input() id: string | undefined;
	@Input({ transform: booleanAttribute }) disabled = false;
	@Input() document: any = null;
	@Input() attachments: any[] = [];
	@Input() multiple = true;
	@Input() allowedMimeTypes: string[] = [];
	@Input() label?: string;
	@Output() attachmentsUpdated = new EventEmitter();
	private readonly blobContexts = new WeakMap<object, BlobActionContext>();

	blobContext(attachment: any): BlobActionContext {
		const previous = this.blobContexts.get(attachment);
		const xpath = this.multiple
			? `files:files/${this.attachments.indexOf(attachment)}/file`
			: 'file:content';
		if (
			previous &&
			previous.document === this.document &&
			previous.noEdit === this.disabled &&
			previous.allowedMimeTypes === this.allowedMimeTypes &&
			previous.xpath === xpath
		)
			return previous;
		const context: BlobActionContext = {
			document: this.document,
			noEdit: this.disabled,
			blob: attachment,
			xpath: this.multiple
				? `files:files/${this.attachments.indexOf(attachment)}/file`
				: 'file:content',
			draft: true,
			allowedMimeTypes: this.allowedMimeTypes,
			download: attachment.digest ? () => this.downloadAttachment(attachment) : undefined,
			replace: (file) => {
				if (!this.disabled) this.replaceAttachment([file], attachment);
			},
			remove: () => {
				if (!this.disabled) this.removeAttachment(attachment);
			},
		};
		this.blobContexts.set(attachment, context);
		return context;
	}
	attachmentsSize = 0;
	attachmentsCount = 0;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly documentAttachmentsService: DocumentAttachmentsService,
		private readonly toastrService: ToastService,
		private readonly renderer: Renderer2,
	) {}

	// --------------------------------------------------------------------------------------------------
	downloadAttachment(attachment: any) {
		this.toastrService.info(
			this.uiDocumentAttachmentsComponentMessages.format(
				'app.notices.downloading-file-value-4ed119',
				{ value0: attachment.name },
				'Downloading file “{value0}”…',
			),
			this.uiDocumentAttachmentsComponentMessages.text(
				'app.notices.file-download-c2574e',
				'File download',
			),
			{ enableHtml: false },
		);

		this.documentAttachmentsService.downloadDocumentBlob(this.document, attachment).subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	attachFiles(files: File[]) {
		if (this.disabled || !files.length) return;
		let filesAdded = 0;

		if (!this.multiple) {
			this.attachments = [files[0]];
			filesAdded++;
		} else {
			for (const file of files)
				if (!this.attachments.includes(file)) {
					filesAdded++;
					this.attachments.push(file);
				}
		}

		if (filesAdded) {
			this.notifyParent();

			this.toastrService.info(
				this.uiDocumentAttachmentsComponentMessages.format(
					'app.notices.-value-plural-one-file-has-been-added-to-the-7162c5',
					{ value0: filesAdded },
					'{value0, plural, one {# file has been added to the list.} other {# files have been added to the list.}}',
				),
				this.uiDocumentAttachmentsComponentMessages.text(
					'app.notices.files-attached-9fcc60',
					'Files attached',
				),
				{ enableHtml: false },
			);
		} else
			this.toastrService.warning(
				this.uiDocumentAttachmentsComponentMessages.text(
					'app.notices.no-files-have-been-added-to-the-list-a4830a',
					'No files have been added to the list.',
				),
				this.uiDocumentAttachmentsComponentMessages.text(
					'app.notices.no-files-attached-367e69',
					'No files attached',
				),
				{ enableHtml: false },
			);
	}

	private attachmentIndex(attachment: object | string): number {
		if (typeof attachment !== 'string') return this.attachments.indexOf(attachment);
		const matches = this.attachments.filter((item) => item.name === attachment);
		return matches.length === 1 ? this.attachments.indexOf(matches[0]) : -1;
	}

	// --------------------------------------------------------------------------------------------------
	discardFile(attachment: object | string) {
		if (this.disabled) return;
		const index = this.attachmentIndex(attachment);

		if (index < 0) return;

		this.attachments.splice(index, 1);

		this.notifyParent();
	}

	// --------------------------------------------------------------------------------------------------
	replaceAttachment(files: any, attachment: object | string) {
		if (this.disabled || !files?.length) return;
		const index = this.attachmentIndex(attachment);

		if (index < 0) return;

		this.attachments.splice(index, 1, files[0]);

		this.notifyParent();
	}

	// --------------------------------------------------------------------------------------------------
	removeAttachment(attachment: object | string) {
		if (this.disabled) return;
		const index = this.attachmentIndex(attachment);

		if (index < 0) return;

		this.attachments.splice(index, 1);

		this.notifyParent();
	}

	// --------------------------------------------------------------------------------------------------
	removeAllAdditionalAttachments() {
		if (this.disabled) return;
		this.attachments = [];

		this.notifyParent();
	}

	// --------------------------------------------------------------------------------------------------
	private notifyParent() {
		this.attachmentsSize = this.attachments.reduce(
			(s: number, a: any) => s + Number(a.size || a.length),
			0,
		);
		this.attachmentsCount = this.attachments?.length;

		this.attachmentsUpdated.emit(this.attachments.filter((x: any) => !x.digest));
	}

	// --------------------------------------------------------------------------------------------------
	filesDragged(fileOver: boolean, elementRef: any) {
		if (fileOver) this.renderer.addClass(elementRef, 'file-over');
		else this.renderer.removeClass(elementRef, 'file-over');
	}

	// --------------------------------------------------------------------------------------------------
	filesDropped(files: any) {
		if (!files.length) return;

		this.attachFiles(files);
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		this.id ??= `attachments_${this.multiple ? 1 : 0}`;

		this.attachments = this.attachments || [];
		this.attachmentsSize = this.attachments.reduce(
			(s: number, a: any) => s + Number(a.size || a.length),
			0,
		);
		this.attachmentsCount = this.attachments.length;
	}
}
