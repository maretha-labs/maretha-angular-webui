import { CORE_RESULTS_OPTIONS, CoreResultsOptions } from 'app/helpers/core-results-options';
import { makeEnvironmentProviders } from '@angular/core';
import {
	COLLECTION_ACTIONS_SLOT,
	CREATE_POPUP_ITEMS_SLOT,
	CREATE_POPUP_PAGES_SLOT,
	defineContribution,
	definePairedView,
	DOCUMENT_ACTIONS_SLOT,
	DOCUMENT_CREATE_ACTIONS_SLOT,
	provideWebUiExtensions,
	provideWebUiIcons,
	RESULTS_ACTIONS_SLOT,
	RESULTS_SELECTION_ACTIONS_SLOT,
	ResultsToolbarContext,
} from '@maretha/webui-sdk';
import { isPublishableDocument } from '../../helpers/selection-publication.service';
import { CreatePopupTabComponent } from './create-popup.component';
const definitions = [
	['move-up', 'Move up', 'icons:arrow-upward'],
	['move-down', 'Move down', 'icons:arrow-downward'],
	['select-loaded', 'Select displayed', 'nuxeo:check'],
	['clear-selection', 'Clear selection', 'nuxeo:clear'],
	['display', 'Display settings', 'nuxeo:view-list'],
	['edit-selection', 'Edit selection', 'nuxeo:edit'],
	['compare', 'Compare', 'nuxeo:compare'],
	['clipboard', 'Copy to clipboard', 'nuxeo:clipboard-add'],
	['collect', 'Add to collection', 'nuxeo:collections'],
	['trash', 'Move to trash', 'nuxeo:delete'],
	['remove-collection', 'Remove from collection', 'nuxeo:remove'],
	['versions', 'Versions', 'nuxeo:asset-versions'],
	['workflow', 'Start a workflow', 'nuxeo:workflow'],
] as const;
export function provideDefaultToolbar(options: Partial<CoreResultsOptions> = {}) {
	return makeEnvironmentProviders([
		{
			provide: CORE_RESULTS_OPTIONS,
			useValue: { spreadsheet: false, bulkEdit: false, ...options },
		},
		provideWebUiIcons('maretha.ordering', {
			'icons:arrow-upward': {
				viewBox: '0 0 24 24',
				nodes: [
					{
						tag: 'path',
						attributes: { d: 'M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z' },
					},
				],
			},
			'icons:arrow-downward': {
				viewBox: '0 0 24 24',
				nodes: [
					{
						tag: 'path',
						attributes: { d: 'M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z' },
					},
				],
			},
		}),
		provideWebUiExtensions({
			id: 'maretha.core.toolbar',
			contributions: [
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'maretha.results.query-trash',
					order: -90,
					when: (context) => !!context.queryScope,
					loadComponent: () => import('./query-trash.component').then((m) => m.QueryTrashComponent),
				}),
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'maretha.results.query-restore',
					order: -89,
					inputs: {
						operation: 'restore',
						label: 'Restore all matching',
						labelKey: 'query.restoreAll',
					},
					when: (context) => context.queryScope?.providerName === 'default_trash_search',
					loadComponent: () => import('./query-trash.component').then((m) => m.QueryTrashComponent),
				}),
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'maretha.results.query-edit',
					order: -88,
					when: (context) => options.bulkEdit === true && !!context.queryScope && !context.noEdit,
					loadComponent: () => import('./query-edit.component').then((m) => m.QueryEditComponent),
				}),
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'maretha.results.spreadsheet',
					order: -150,
					when: (context) => options.spreadsheet === true && !!context.queryScope,
					loadComponent: () =>
						import('./results-spreadsheet.component').then((m) => m.ResultsSpreadsheetComponent),
				}),
				defineContribution(RESULTS_ACTIONS_SLOT, {
					id: 'maretha.results.csv-export',
					order: -100,
					when: (context) => !!context.queryScope,
					loadComponent: () =>
						import('./results-csv-export.component').then((m) => m.ResultsCsvExportComponent),
				}),
				defineContribution(COLLECTION_ACTIONS_SLOT, {
					id: 'maretha.toolbar.clipboard',
					order: 105,
					inputs: {
						command: 'clipboard',
						label: 'Copy to clipboard',
						labelKey: 'app.toolbar.clipboard',
						icon: 'nuxeo:clipboard-add',
					},
					when: (context) =>
						!!context.collection && context.availableCommands.includes('clipboard'),
					loadComponent: () =>
						import('./toolbar-action.component').then((m) => m.ToolbarActionComponent),
				}),
				...[RESULTS_SELECTION_ACTIONS_SLOT, COLLECTION_ACTIONS_SLOT].map((slot) =>
					defineContribution(slot, {
						id: 'maretha.selection.publish',
						order: 6,
						when: (context) =>
							!context.noEdit &&
							!!context.selectedDocuments.length &&
							context.selectedDocuments.every(isPublishableDocument) &&
							(slot === COLLECTION_ACTIONS_SLOT ? !!context.collection : !context.collection),
						loadComponent: () =>
							import('./selection-publish.component').then((m) => m.SelectionPublishComponent),
					}),
				),
				...[RESULTS_SELECTION_ACTIONS_SLOT, COLLECTION_ACTIONS_SLOT].map((slot) =>
					defineContribution(slot, {
						id: 'maretha.selection.download',
						order: 5,
						when: (context) =>
							!!context.selectedDocuments.length &&
							!context.selectedDocuments.some((doc) => doc['isTrashed']) &&
							(slot === COLLECTION_ACTIONS_SLOT ? !!context.collection : !context.collection),
						loadComponent: () =>
							import('./selection-download.component').then((m) => m.SelectionDownloadComponent),
					}),
				),
				...definitions.map(([command, label, icon], order) => {
					const slot = ['select-loaded', 'clear-selection', 'display'].includes(command)
						? RESULTS_ACTIONS_SLOT
						: command === 'remove-collection'
							? COLLECTION_ACTIONS_SLOT
							: ['versions', 'workflow'].includes(command)
								? DOCUMENT_ACTIONS_SLOT
								: RESULTS_SELECTION_ACTIONS_SLOT;
					return defineContribution(slot, {
						id: `maretha.toolbar.${command}`,
						order: command === 'move-up' ? -50 : command === 'move-down' ? -49 : 98 + order,
						inputs: {
							command,
							label,
							labelKey: `app.toolbar.${command}`,
							icon,
							...(command === 'move-up' || command === 'move-down'
								? {
										labelKey: `moveDocumentButton.${command === 'move-up' ? 'up' : 'down'}.tooltip`,
									}
								: {}),
						},
						when: (context) =>
							((context as ResultsToolbarContext).availableCommands?.includes(command) ?? false) &&
							(command !== 'clipboard' || !context.collection) &&
							(command !== 'edit-selection' || options.bulkEdit === true),
						loadComponent: () =>
							import('./toolbar-action.component').then((m) => m.ToolbarActionComponent),
					});
				}),
				defineContribution(DOCUMENT_CREATE_ACTIONS_SLOT, {
					id: 'maretha.create.open',
					when: (c) => !c.noEdit && c.types.length > 0,
					loadComponent: () =>
						import('./create-popup.component').then((m) => m.CreateActionComponent),
				}),
				...definePairedView(
					{ items: CREATE_POPUP_ITEMS_SLOT, pages: CREATE_POPUP_PAGES_SLOT },
					{
						id: 'maretha.create.types',
						viewId: 'create',
						label: 'New document',
						labelKey: 'create.newDocument',
						order: 10,
						loadComponent: () =>
							import('./create-popup.component').then((m) => m.CreateTypePageComponent),
					},
				).map((contribution) =>
					contribution.slot === CREATE_POPUP_ITEMS_SLOT.name
						? { ...contribution, component: CreatePopupTabComponent, loadComponent: undefined }
						: contribution,
				),
				...definePairedView(
					{ items: CREATE_POPUP_ITEMS_SLOT, pages: CREATE_POPUP_PAGES_SLOT },
					{
						id: 'maretha.create.import',
						viewId: 'import',
						label: 'Import',
						labelKey: 'create.import',
						order: 20,
						when: (c) => c.destinationPicker === true || (!c.noEdit && c.types.some((t) => t.file)),
						loadComponent: () =>
							import('./create-popup.component').then((m) => m.CreateImportPageComponent),
					},
				),
			],
		}),
	]);
}
