import { LocalizedUiError } from '@maretha/webui-sdk';
export interface DocumentBlobTarget {
	readonly repository: string;
	readonly documentId: string;
	readonly xpath: string;
	readonly expectedDigest: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !(value instanceof Blob)
		? (value as Record<string, unknown>)
		: undefined;
}

export function resolveDocumentBlobTarget(document: unknown, blob: unknown): DocumentBlobTarget {
	const doc = record(document);
	const requested = record(blob);
	const properties = record(doc?.['properties']);
	const digest = requested?.['digest'];
	if (
		!doc ||
		typeof doc['uid'] !== 'string' ||
		!doc['uid'] ||
		!properties ||
		typeof digest !== 'string' ||
		!digest
	)
		throw new LocalizedUiError(
			'app.errors.save-the-file-before-streaming-or-downlo-e2e304',
			'Save the file before streaming or downloading it.',
		);
	const candidates: { blob: Record<string, unknown>; xpath: string }[] = [];
	const add = (value: unknown, xpath: string) => {
		const candidate = record(value);
		if (candidate) candidates.push({ blob: candidate, xpath });
	};
	add(properties['file:content'], 'file:content');
	for (const [property, child] of [
		['files:files', 'file'],
		['vid:transcodedVideos', 'content'],
		['picture:views', 'content'],
	] as const) {
		const entries = properties[property];
		if (Array.isArray(entries))
			entries.forEach((entry, index) =>
				add(record(entry)?.[child], `${property}/${index}/${child}`),
			);
	}
	const identical = candidates.filter((candidate) => candidate.blob === blob);
	const matches = identical.length
		? identical
		: candidates.filter((candidate) => candidate.blob['digest'] === digest);
	if (matches.length !== 1)
		throw new LocalizedUiError(
			'app.errors.the-saved-file-could-not-be-identified-u-ab5c25',
			'The saved file could not be identified uniquely. Refresh the document and try again.',
		);
	const repository = doc['repository'] ?? 'default';
	if (typeof repository !== 'string' || !repository)
		throw new LocalizedUiError(
			'app.errors.the-saved-file-has-no-repository--d67912',
			'The saved file has no repository.',
		);
	return { repository, documentId: doc['uid'], xpath: matches[0].xpath, expectedDigest: digest };
}
