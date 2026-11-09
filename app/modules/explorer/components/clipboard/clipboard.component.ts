import { inject as injectMessages } from '@angular/core';
import { WebUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectorRef, Component, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { DocumentClipboardService } from 'app/modules/explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from 'app/modules/explorer/helpers/document-trash.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { animations } from 'app/shared.constants';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { DocumentIconAndTitleComponent } from '../../../shared/components/document-icon-and-title/document-icon-and-title.component';
import { NgClass } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NgxTranslateCutModule } from 'ngx-translate-cut';
import {
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionTemplateDirective,
} from '@maretha/webui-sdk';

@Component({
	selector: 'nx-clipboard',
	templateUrl: './clipboard.component.html',
	styleUrls: ['./clipboard.component.scss'],
	animations: [
		animations.itemsAnimation,
		animations.listAnimation,
		animations.horizontalInOutAnimation,
	],
	imports: [
		FontAwesomeModule,
		TooltipDirective,
		DocumentIconAndTitleComponent,
		NgClass,
		TranslateModule,
		NgxTranslateCutModule,
		ResultsProjectionComponent,
		ResultsProjectionTemplateDirective,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClipboardComponent {
	private readonly messages = injectMessages(WebUiMessages);
	clipboardDocuments: any[] = [];
	destinationUid: string | null;
	selectedDocuments: any[] = [];
	canPasteAllSelectedDocuments = false;
	someDocumentCannotBePasted = false;
	readonly columns: readonly ResultsProjectionColumn<any>[] = [
		{
			id: 'title',
			label: 'Title',
			labelKey: 'app.columns.title',
			value: (document) => document.title,
		},
		{
			id: 'status',
			label: 'Status',
			labelKey: 'app.columns.status',
			value: (document) =>
				document.canPaste ? '' : this.messages.text('clipboard.cannotPaste', 'Cannot paste'),
		},
	];
	get selectedDocumentIds(): readonly string[] {
		return this.selectedDocuments.map((document) => document.uid);
	}

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly documentClipboardService: DocumentClipboardService,
		private readonly documentTrashService: DocumentTrashService,
		private readonly documentsManagerService: DocumentsManagerService,
		private readonly cdr: ChangeDetectorRef,
	) {
		this.destinationUid = documentsManagerService.documentInfo?.uid;

		documentsManagerService.documentFetched$.subscribe((x: any) => {
			this.destinationUid = x?.uid;
			this.cdr.markForCheck();
		});

		documentClipboardService.documentClipboardUpdated$.subscribe((x) => {
			let allDocumentCannotBePasted = true;

			x.forEach((y) => {
				y.canPaste =
					documentsManagerService.documentInfo.ng.isFolder &&
					!documentsManagerService.documents.find((document: any) => document.uid === y.uid) &&
					documentsManagerService.documentInfo.contextParameters.subtypes?.find(
						(subType: any) => subType.type === y.type,
					);

				allDocumentCannotBePasted = allDocumentCannotBePasted && y.canPaste;
			});

			this.clipboardDocuments = x;
			const available = new Set(x.map((document) => document.uid));
			this.selectedDocuments = this.selectedDocuments.filter((document) =>
				available.has(document.uid),
			);
			this.updatePasteState();
			this.someDocumentCannotBePasted = !allDocumentCannotBePasted;
			this.cdr.markForCheck();
		});

		documentTrashService.documentsMovedToTrash$.subscribe((uids) =>
			this.documentClipboardService.removeFromClipboard(uids, false),
		);
	}

	// --------------------------------------------------------------------------------------------------
	copy() {
		if (!this.destinationUid) return;

		const destinationUid = this.destinationUid;

		this.documentClipboardService
			.copyTo(
				this.selectedDocuments.map((x) => x.uid),
				destinationUid,
			)
			.subscribe(() => {
				this.selectedDocuments = [];
				this.cdr.markForCheck();
			});
	}

	// --------------------------------------------------------------------------------------------------
	move() {
		if (!this.destinationUid) return;

		const destinationUid = this.destinationUid;

		this.documentClipboardService
			.moveTo(
				this.selectedDocuments.map((x) => x.uid),
				destinationUid,
			)
			.subscribe(() => this.removeFromClipboard());
	}

	// --------------------------------------------------------------------------------------------------
	removeFromClipboard() {
		this.documentClipboardService.removeFromClipboard(this.selectedDocuments.map((x) => x.uid));

		this.selectedDocuments = [];
	}

	// --------------------------------------------------------------------------------------------------
	clearClipboard = () => this.documentClipboardService.clearClipboard();

	// --------------------------------------------------------------------------------------------------
	selectAll() {
		this.selectedDocuments = [...this.clipboardDocuments];
		this.updatePasteState();
		this.cdr.markForCheck();
	}

	// --------------------------------------------------------------------------------------------------
	projectionSelectionChange(ids: readonly string[]): void {
		const selected = new Set(ids);
		this.selectedDocuments = this.clipboardDocuments.filter((document) =>
			selected.has(document.uid),
		);
		this.updatePasteState();
		this.cdr.markForCheck();
	}

	private updatePasteState(): void {
		this.canPasteAllSelectedDocuments =
			this.selectedDocuments.length > 0 &&
			this.selectedDocuments.every((x) => x.canPaste && x.uid !== this.destinationUid);
	}
}
