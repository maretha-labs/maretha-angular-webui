/** True when a document carries a version label, so it may have other versions to compare. */
export function hasDocumentVersion(document: Readonly<Record<string, unknown>> | null): boolean {
	const properties = document?.['properties'] as Record<string, unknown> | undefined;
	return (
		Number(properties?.['uid:major_version']) > 0 || Number(properties?.['uid:minor_version']) > 0
	);
}
