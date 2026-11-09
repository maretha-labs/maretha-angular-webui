/** Stock folderish types opt in explicitly; custom layouts remain unchanged. */
export const STANDARD_FOLDER_RESULTS_TYPES = new Set([
	'Folder',
	'Collection',
	'Favorites',
	'OrderedFolder',
	'PictureBook',
	'Workspace',
	'Domain',
	'Root',
	'WorkspaceRoot',
	'SectionRoot',
	'TemplateRoot',
	'UserWorkspacesRoot',
	'Collections',
	'Section',
]);

type SurfaceDocument = { type?: string; facets?: readonly string[] } | null | undefined;

const hasFacet = (document: SurfaceDocument, facet: string): boolean =>
	Array.isArray(document?.facets) && document.facets.includes(facet);

/** Folder-style surfaces (scoped results, folder download, trash view): stock folderish types and any
 *  document carrying the Folderish facet, so add-on and Studio folder types behave like Folder. */
export function isStandardFolder(document: SurfaceDocument): boolean {
	return (
		!!document?.type &&
		(STANDARD_FOLDER_RESULTS_TYPES.has(document.type) || hasFacet(document, 'Folderish'))
	);
}

/** Every typed document uses the stock header, actions and view set. Custom types are not special:
 *  facets and the main blob decide their rendering, never the type name. */
export function usesStandardDocumentHeader(document: SurfaceDocument): boolean {
	return !!document?.type;
}
