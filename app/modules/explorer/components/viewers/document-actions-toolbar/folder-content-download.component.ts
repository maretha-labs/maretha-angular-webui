import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DocumentActionContext, ResultsToolbarContext, WebUiMessages } from '@maretha/webui-sdk';
import { SelectionDownloadComponent } from '../../document-toolbar/selection-download.component';

/** Source Blob.BulkDownload takes the folder UID and traverses its downloadable content. */
@Component({
	selector: 'nx-folder-content-download',
	imports: [SelectionDownloadComponent],
	template: `<nx-selection-download [context]="downloadContext()" [label]="label()" />`,
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderContentDownloadComponent {
	readonly context = input.required<DocumentActionContext>();
	private readonly messages = inject(WebUiMessages);
	readonly label = computed(() => this.messages.text('bulkDownload.tooltip', 'Download'));
	readonly downloadContext = computed<ResultsToolbarContext>(() => ({
		document: this.context().document,
		noEdit: this.context().noEdit,
		selectedDocuments: this.context().document ? [this.context().document!] : [],
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
	}));
}
