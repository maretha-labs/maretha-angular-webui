import { WebUiMessages } from '@maretha/webui-sdk';
import { DocumentLayoutGatewayService } from '../../helpers/document-layout-gateway.service';

export interface BulkDirectoryChoices extends Record<string, readonly BulkDirectoryChoice[]> {
	readonly 'dc:nature': readonly BulkDirectoryChoice[];
	readonly 'dc:subjects': readonly BulkDirectoryChoice[];
	readonly 'dc:coverage': readonly BulkDirectoryChoice[];
}
export interface BulkDirectoryChoice {
	readonly id: string;
	readonly label: string;
}

const directories = [
	['dc:nature', 'nature'],
	['dc:subjects', 'l10nsubjects'],
	['dc:coverage', 'l10ncoverage'],
] as const;

/** Shared default-profile choices for explicit and server-side bulk forms. */
export async function loadBulkDirectoryChoices(
	gateway: Pick<DocumentLayoutGatewayService, 'bulkDirectoryChoices'>,
	messages: Pick<WebUiMessages, 'text'>,
): Promise<BulkDirectoryChoices> {
	const results = await Promise.all(
		directories.map(([, directoryName]) =>
			gateway.bulkDirectoryChoices(directoryName, directoryName !== 'nature'),
		),
	);
	const build = (index: number) =>
		results[index].map((entry) => ({
			id: entry.id,
			label: displayLabel(directories[index][1], entry.id, entry.label, messages),
		}));
	return {
		'dc:nature': build(0),
		'dc:subjects': build(1),
		'dc:coverage': build(2),
	};
}

export function displayLabel(
	directoryName: string,
	id: string,
	label: string | undefined,
	messages: Pick<WebUiMessages, 'text'>,
): string {
	const fallback = label || id;
	const key =
		directoryName === 'nature'
			? `label.directories.nature.${id}`
			: label?.startsWith('label.')
				? label
				: undefined;
	return messages.text(key, fallback);
}
