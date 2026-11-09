import { canRunDocumentCommand } from '../../explorer/components/viewers/document-actions-toolbar/document-command-policy';

export function searchSelectionCommands(
	documents: readonly any[],
	noEdit: boolean,
	bulkEdit = false,
): string[] {
	if (!documents.length) return [];
	const commands: string[] = [];
	for (const command of ['clipboard', 'collect', 'trash'] as const) {
		if (
			documents.every(
				(document) =>
					canRunDocumentCommand({ document, noEdit }, command) &&
					(command !== 'clipboard' ||
						(Array.isArray(document.facets) &&
							!document.facets.includes('NotCollectionMember') &&
							!document.facets.includes('SystemDocument'))),
			)
		) {
			commands.push(command);
		}
	}
	if (documents.length > 1 && documents.length < 200) commands.push('compare');
	if (
		bulkEdit &&
		documents.length < 200 &&
		documents.every((document) => canRunDocumentCommand({ document, noEdit }, 'edit'))
	)
		commands.push('edit-selection');
	return commands;
}
