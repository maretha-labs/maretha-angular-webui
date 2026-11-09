import { CORE_RESULTS_OPTIONS } from 'app/helpers/core-results-options';
import { inject, Injectable, Injector } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { Router } from '@angular/router';
import { BulkLayoutResolver, ResultsToolbarContext } from '@maretha/webui-sdk';
import { DocumentClipboardService } from '../../explorer/helpers/document-clipboard.service';
import { DocumentTrashService } from '../../explorer/helpers/document-trash.service';
import { BulkEditorModalComponent } from '../../explorer/components/document-toolbar/bulk-editor-modal.component';
import { ConfirmDialogService } from 'app/modules/shared/components/confirmation-dialog/confirm-dialog.service';

export interface SearchResultsToolbarContext extends ResultsToolbarContext {
	readonly csvSchemas: readonly string[];
	readonly csvSort?: { readonly sortBy: string; readonly sortOrder: 'asc' | 'desc' };
}

export const QUERY_SEARCH_ACTIONS = [
	'maretha.results.query-trash',
	'maretha.results.query-restore',
	'maretha.results.query-edit',
];

export const UNSELECTED_SEARCH_ACTIONS = [
	...QUERY_SEARCH_ACTIONS,
	'maretha.toolbar.select-loaded',
	'maretha.toolbar.clear-selection',
];

export { searchSelectionCommands } from './search-selection-policy';
/** Search-only actions keep protected document hosts and their shared manager untouched. */
@Injectable({ providedIn: 'root' })
export class SearchSelectionActions {
	private readonly injector = inject(Injector);

	async execute(
		command: string,
		context: ResultsToolbarContext,
		current: () => boolean,
	): Promise<readonly string[]> {
		if (context.busy || !context.availableCommands.includes(command) || !current()) return [];
		const documents = [...context.selectedDocuments];
		if (command === 'clipboard') {
			this.injector.get(DocumentClipboardService).addToClipboard(
				documents.map((document) => ({
					...document,
					ng: { ...(document['ng'] as object | undefined), canAddToCollection: true },
				})),
			);
		} else if (command === 'compare') {
			const ids = documents.map((document) => String(document['uid']));
			await this.injector.get(Router).navigate(['/page/compare'], {
				queryParams: {
					left: ids[1],
					right: ids[0],
					ids: ids.join(','),
					repository: context.document?.['repository'] ?? 'default',
				},
			});
		} else if (command === 'edit-selection' && this.injector.get(CORE_RESULTS_OPTIONS).bulkEdit) {
			this.injector.get(BsModalService).show(BulkEditorModalComponent, {
				class: 'modal-lg',
				ignoreBackdropClick: true,
				keyboard: false,
				initialState: {
					documents: structuredClone(documents),
					isCurrentScope: current,
					layoutComponent:
						this.injector.get(BulkLayoutResolver).resolve('default')?.component ??
						BulkEditorModalComponent.defaultLayout,
				},
			});
		} else if (
			command === 'trash' &&
			(await this.injector.get(ConfirmDialogService).confirm({
				// Stock nuxeo-delete-documents-button asks only this question before trashing.
				titleKey: 'deleteDocumentsButton.confirm.deleteDocuments',
				title: 'Delete selected document(s)?',
				confirmKey: 'documentTrashAction.tooltip',
				confirm: 'Move to trash',
				icon: 'nuxeo:delete',
			}))
		) {
			context.setBusy(true);
			try {
				const ids = documents.map((document) => String(document['uid']));
				await firstValueFrom(this.injector.get(DocumentTrashService).moveDocumentsToTrash(ids));
				return current() ? ids : [];
			} finally {
				context.setBusy(false);
			}
		}
		return [];
	}
}
