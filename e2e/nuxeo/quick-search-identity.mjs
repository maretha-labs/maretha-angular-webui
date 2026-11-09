/** Native Quick Search localizes the type label but renders an exact persisted identity. */
export function quickSearchDocumentIdentityPattern(documentId) {
	if (typeof documentId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(documentId))
		throw new Error('Supply one exact native test document ID.');
	return new RegExp(`^[^\\r\\n]+ / ${documentId}$`);
}
