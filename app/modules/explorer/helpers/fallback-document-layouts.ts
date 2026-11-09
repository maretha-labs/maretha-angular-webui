/** Identity of the wildcard metadata layouts and the developer notice they emit. Component-free so
 *  hosts can import it without pulling the layout manifest (and its components) into a cycle. */
export const FALLBACK_METADATA_LAYOUT_ID = 'default.document-layout.any.metadata';
export const FALLBACK_MEDIA_METADATA_LAYOUT_ID = 'default.document-layout.any-media.metadata';
export const FALLBACK_LAYOUT_IDS: readonly string[] = Object.freeze([
	FALLBACK_MEDIA_METADATA_LAYOUT_ID,
	FALLBACK_METADATA_LAYOUT_ID,
]);
export const LAYOUT_AUTHORING_DOC =
	'https://github.com/maretha-labs/maretha-angular-webui/blob/main/docs/polymer-parity.md#define-a-layout-for-a-custom-type';

/** Stock document types whose Web UI registration declares `no-layout` (server type list).
 *  These are technical or hidden types; the wildcard layouts never serve them. */
export const STOCK_NO_LAYOUT_TYPES: ReadonlySet<string> = new Set([
	'Document',
	'ManagementRoot',
	'AdministrativeStatusContainer',
	'AdministrativeStatus',
	'HiddenFolder',
	'Relation',
	'shibbGroup',
	'PermissionsSearch',
	'adobe-connector-all-images_pp',
	'adobe-connector-search_pp',
	'AssetsSearch',
	'UserInvitation',
	'UserInvitationContainer',
	'BasicAuditSearch',
	'CommentRoot',
	'Comment',
	'Annotation',
	'RoutingTask',
	'DocumentRouteInstancesRoot',
	'DocumentRouteModelsRoot',
	'DocumentRoute',
	'RouteNode',
	'PublicationRelation',
	'DefaultRelation',
	'Tag',
	'Tagging',
	'TaskRoot',
	'TaskDoc',
	'QueryNav',
	'AdvancedSearch',
	'AdvancedContent',
	'quota_heaviest_containers_cv',
	'SavedSearch',
	'DefaultSearch',
	'ExpiredSearch',
	'TemplateBasedFile',
	'SnapshotableFolder',
	'UserProfile',
]);

const NO_LAYOUT_TYPES_LOWER: ReadonlySet<string> = new Set(
	[...STOCK_NO_LAYOUT_TYPES].map((type) => type.toLowerCase()),
);

/** True when stock Web UI declares `no-layout` for this type: no wildcard layout may serve it.
 *  Case-insensitive, because layout contexts carry the type lower-cased. */
export function declaresNoLayout(documentType: unknown): boolean {
	return (
		typeof documentType === 'string' && NO_LAYOUT_TYPES_LOWER.has(documentType.trim().toLowerCase())
	);
}

export function isFallbackLayout(layoutId: unknown): boolean {
	return typeof layoutId === 'string' && FALLBACK_LAYOUT_IDS.includes(layoutId);
}

const reportedFallbackTypes = new Set<string>();
/** Tell developers, once per type and session, that a wildcard metadata layout is serving a type. */
export function reportFallbackMetadataLayout(
	documentType: unknown,
	layoutId = FALLBACK_METADATA_LAYOUT_ID,
): void {
	const type = typeof documentType === 'string' ? documentType.trim() : '';
	if (!type || reportedFallbackTypes.has(type)) return;
	reportedFallbackTypes.add(type);
	console.info(
		`[maretha-angular-webui] Document type "${type}" has no metadata layout; the wildcard layout (${layoutId}) is rendering it from the server schema and facets. Register a layout for this type: ${LAYOUT_AUTHORING_DOC}`,
	);
}
/** Test hook: forget which types were reported. */
export function resetFallbackMetadataLayoutReports(): void {
	reportedFallbackTypes.clear();
}
