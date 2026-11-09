import { WebUiMessagePipe } from '@maretha/webui-sdk';
import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ResultsToolbarContext } from '@maretha/webui-sdk';
import { SelectionDownloadComponent } from './selection-download.component';

@Component({
	selector: 'nx-bulk-zip-download-dialog',
	imports: [SelectionDownloadComponent, WebUiMessagePipe],
	template: `<div class="modal-header">
			<h2 class="modal-title">
				{{
					'app.modules.bulk-zip-download-dialog.download-zip-204feb' | webuiMessage: 'Download ZIP'
				}}
			</h2>
			<button
				type="button"
				class="btn-close"
				[attr.aria-label]="
					'app.modules.bulk-zip-download-dialog.close-6e89a7' | webuiMessage: 'Close'
				"
				(click)="close()"
			></button>
		</div>
		<div class="modal-body">
			@if (context) {
				<nx-selection-download [context]="context" [filename]="filename" [autoStart]="true" />
			}
		</div>`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BulkZipDownloadDialogComponent implements OnInit {
	documentId = '';
	repository = 'default';
	filename = 'selection.zip';
	context?: ResultsToolbarContext;
	private readonly modal = inject(BsModalRef);
	ngOnInit(): void {
		const document = { uid: this.documentId, repository: this.repository };
		this.context = {
			document,
			selectedDocuments: [document],
			noEdit: true,
			busy: false,
			loadedCount: 1,
			totalCount: 1,
			allSelected: true,
			availableCommands: [],
			workflows: [],
			setBusy: () => undefined,
			refresh: async () => undefined,
			reportError: () => undefined,
			execute: async () => undefined,
		};
	}
	close(): void {
		this.modal.hide();
	}
}
