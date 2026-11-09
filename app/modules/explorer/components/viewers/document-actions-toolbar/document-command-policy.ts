import { DocumentActionContext } from '@maretha/webui-sdk';
import { usesStandardDocumentHeader } from '../../../helpers/standard-document-surfaces';
import { hasPermission } from 'app/helpers/document-permissions';

export type DocumentCommand =
	| 'edit'
	| 'clipboard'
	| 'pdf'
	| 'xml'
	| 'zip'
	| 'trash'
	| 'restore'
	| 'purge'
	| 'collect'
	| 'favorite'
	| 'notifications'
	| 'lock'
	| 'download'
	| 'publish'
	| 'remove-collection';
export const DOCUMENT_COMMANDS: readonly {
	id: DocumentCommand;
	label: string;
	key: string;
	icon: string;
}[] = [
	{ id: 'edit', label: 'Edit document', key: 'documentEditAction.tooltip', icon: 'nuxeo:edit' },
	{
		id: 'clipboard',
		label: 'Copy to clipboard',
		key: 'clipboardToggleButton.tooltip.add',
		icon: 'nuxeo:clipboard-add',
	},
	{
		id: 'collect',
		label: 'Add to collection',
		key: 'addToCollectionDocumentsButton.tooltip',
		icon: 'nuxeo:collections',
	},
	{
		id: 'remove-collection',
		label: 'Remove from collection',
		key: 'collectionRemoveAction.tooltip',
		icon: 'nuxeo:remove',
	},
	{ id: 'pdf', label: 'Export PDF', key: 'maretha.export.pdf', icon: 'nuxeo:export' },
	{ id: 'xml', label: 'Export XML', key: 'maretha.export.xml', icon: 'nuxeo:export' },
	{ id: 'zip', label: 'Export ZIP', key: 'maretha.export.zip', icon: 'nuxeo:export' },
	{ id: 'trash', label: 'Move to trash', key: 'documentTrashAction.tooltip', icon: 'nuxeo:delete' },
	{
		id: 'restore',
		label: 'Restore',
		key: 'untrashDocumentsButton.tooltip',
		icon: 'nuxeo:restore-deleted',
	},
	{
		id: 'purge',
		label: 'Delete permanently',
		key: 'deleteDocumentsButton.tooltip.permanently',
		icon: 'nuxeo:delete-permanently',
	},
	{
		id: 'favorite',
		label: 'Add to favorites',
		key: 'favoritesToggleButton.tooltip.add',
		icon: 'nuxeo:favorites',
	},
	{
		id: 'notifications',
		label: 'Subscribe to notifications',
		key: 'notificationsToggleButton.tooltip.notify',
		icon: 'nuxeo:notify',
	},
	{
		id: 'lock',
		label: 'Lock document',
		key: 'lockToggleButton.tooltip.lock',
		icon: 'nuxeo:unlock',
	},
	{ id: 'download', label: 'Download file', key: 'downloadButton.tooltip', icon: 'nuxeo:download' },
	{ id: 'publish', label: 'Publish document', key: 'publishButton.tooltip', icon: 'nuxeo:upload' },
];
/**
 * Stock `nuxeo-*-button._isAvailable` rules per document state (nuxeo-ui-elements 3.1.x).
 * The server decides: a server-granted permission is never hidden by client policy.
 */
export function canRunDocumentCommand(
	context: DocumentActionContext,
	command: DocumentCommand,
): boolean {
	const doc = context.document as any;
	if (!doc?.uid) return false;
	const facets: string[] = Array.isArray(doc.facets) ? doc.facets : [];
	const trashed = doc.isTrashed === true;
	const version = doc.isVersion === true;
	const immutable = facets.includes('Immutable') || doc.type === 'Root' || doc.path === '/';
	if (context.standardHeaderActions && usesStandardDocumentHeader(doc)) {
		// Collection membership changes the collection, including for an immutable version.
		if (command === 'collect' || command === 'favorite' || command === 'clipboard') {
			return (
				!context.noEdit &&
				!trashed &&
				!(command === 'clipboard' && (version || doc.type === 'Favorites')) &&
				Array.isArray(doc.facets) &&
				(!facets.includes('NotCollectionMember') ||
					(command === 'clipboard' && facets.includes('Collection')))
			);
		}
	}
	switch (command) {
		case 'download':
			return !trashed && !!doc.properties?.['file:content']?.data;
		case 'favorite':
			// Version membership is only offered by the standard header branch above.
			return (
				!context.noEdit &&
				!trashed &&
				!version &&
				Array.isArray(doc.facets) &&
				!facets.includes('NotCollectionMember') &&
				!facets.includes('SystemDocument')
			);
		case 'notifications':
			// Stock: available unless the document is a version; a proxy is subscribable.
			return !context.noEdit && !trashed && !version;
		case 'lock':
			// Stock: Write holders, or any reader while the document is locked (NXP-27822).
			return (
				!context.noEdit &&
				!trashed &&
				!version &&
				!immutable &&
				!facets.includes('Folderish') &&
				(hasPermission(doc, 'Write') || (!!doc.lockOwner && hasPermission(doc, 'Read')))
			);
		case 'publish':
			return (
				!context.noEdit &&
				!trashed &&
				!doc.isProxy &&
				!doc.isRecord &&
				facets.includes('Publishable') &&
				hasPermission(doc, 'WriteVersion')
			);
		case 'pdf':
		case 'xml':
		case 'zip':
			return !trashed && !!doc.ng?.[`exportUrlFor${command[0].toUpperCase()}${command.slice(1)}`];
		case 'clipboard':
			return !trashed && !version && doc.type !== 'Favorites';
		case 'edit':
			return (
				!context.noEdit &&
				!trashed &&
				!version &&
				!immutable &&
				!doc.isProxy &&
				hasPermission(doc, 'WriteProperties')
			);
		case 'remove-collection':
			return (
				!context.noEdit &&
				!trashed &&
				!!context.collection?.['uid'] &&
				!!doc.ng?.collections?.[String(context.collection['uid'])] &&
				hasPermission(context.collection, 'WriteProperties')
			);
		case 'collect':
			return (
				!context.noEdit &&
				!trashed &&
				!version &&
				!doc.isProxy &&
				Array.isArray(doc.facets) &&
				!facets.includes('NotCollectionMember')
			);
		case 'trash':
			// Stock: `!isVersion && Remove && !isTrashed`; a proxy can be deleted.
			return (
				!context.noEdit && !trashed && !version && doc.path !== '/' && hasPermission(doc, 'Remove')
			);
		case 'restore':
			return !context.noEdit && trashed && hasPermission(doc, 'Write');
		case 'purge':
			// A held or retained document cannot be purged; the server enforces the same rule.
			return (
				!context.noEdit &&
				trashed &&
				!version &&
				!doc.hasLegalHold &&
				!doc.isRecord &&
				!doc.retainUntil &&
				hasPermission(doc, 'Remove')
			);
	}
}
