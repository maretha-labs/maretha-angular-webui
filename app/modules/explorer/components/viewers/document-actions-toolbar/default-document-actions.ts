import { canRunDocumentCommand, DOCUMENT_COMMANDS } from './document-command-policy';
import { hasPermission } from 'app/helpers/document-permissions';
import { isStandardFolder } from '../../../helpers/standard-document-surfaces';
import { hasDocumentVersion } from './document-version-policy';
import {
	canPublishStandardDocument,
	usesStandardPublishAction,
} from './standard-document-publish-policy';
import {
	defineContribution,
	DOCUMENT_ACTIONS_SLOT,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';

export function provideDefaultDocumentActions() {
	return provideWebUiExtensions({
		id: 'maretha.core.document-actions',
		contributions: [
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.export',
				order: 170,
				when: (context) =>
					context.standardHeaderActions === true &&
					['pdf', 'xml', 'zip'].some((command) =>
						canRunDocumentCommand(context, command as 'pdf' | 'xml' | 'zip'),
					),
				loadComponent: () =>
					import('./document-export.component').then((m) => m.DocumentExportComponent),
			}),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.standard-publish',
				order: 50,
				when: canPublishStandardDocument,
				loadComponent: () =>
					import('./standard-document-publish.component').then(
						(m) => m.StandardDocumentPublishComponent,
					),
			}),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.download-folder',
				order: 90,
				when: (context) =>
					isStandardFolder(context.document as { type?: string; facets?: string[] }) &&
					!!(context.document?.['contextParameters'] as { hasContent?: boolean })?.hasContent &&
					!context.document?.['isTrashed'],
				loadComponent: () =>
					import('./folder-content-download.component').then(
						(m) => m.FolderContentDownloadComponent,
					),
			}),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.create',
				order: 5,
				when: (context) =>
					!context.noEdit &&
					!!(context.document?.['ng'] as { isFolder?: boolean })?.isFolder &&
					!context.document?.['isTrashed'] &&
					!context.document?.['hasLegalHold'] &&
					hasPermission(context.document, 'AddChildren'),
				loadComponent: () =>
					import('./document-create-action.component').then((m) => m.DocumentCreateActionComponent),
			}),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.share',
				order: 45,
				when: (context) =>
					typeof context.document?.['uid'] === 'string' && !context.document['isTrashed'],
				loadComponent: () =>
					import('./document-share.component').then((m) => m.DocumentShareComponent),
			}),
			...DOCUMENT_COMMANDS.map((command, index) =>
				defineContribution(DOCUMENT_ACTIONS_SLOT, {
					id: `maretha.document.${command.id}`,
					order: 20 + index * 10,
					inputs: { command: command.id },
					when: (context) =>
						!(command.id === 'publish' && usesStandardPublishAction(context)) &&
						canRunDocumentCommand(context, command.id),
					loadComponent: () =>
						import('./document-command.component').then((m) => m.DocumentCommandComponent),
				}),
			),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.compare-versions',
				// After Edit (order 20). Only the standard document header has shown it.
				order: 25,
				when: (context) =>
					context.standardHeaderActions === true &&
					!context.document?.['isTrashed'] &&
					hasDocumentVersion(context.document),
				loadComponent: () =>
					import('./compare-versions-action.component').then(
						(m) => m.CompareVersionsActionComponent,
					),
			}),
			defineContribution(DOCUMENT_ACTIONS_SLOT, {
				id: 'maretha.document.info',
				order: 10,
				loadComponent: () =>
					import('./document-info-action.component').then((m) => m.DocumentInfoActionComponent),
				when: (context) => !!context.document?.['ng'] && !context.noEdit,
			}),
		],
	});
}
