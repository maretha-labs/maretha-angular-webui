/**
 * The server decides. `contextParameters.permissions` (the `permissions` enricher) is the
 * only write gate; client policy may hide fields but never a server-granted affordance.
 */
export type PermissionDocument = object | null | undefined;

export function documentPermissions(document: PermissionDocument): readonly string[] {
	const parameters = (document as { contextParameters?: { permissions?: unknown } } | null)
		?.contextParameters;
	return Array.isArray(parameters?.permissions)
		? parameters.permissions.filter((item): item is string => typeof item === 'string')
		: [];
}

/** True when the permissions enricher granted `permission` (or `Everything`) on the document. */
export function hasPermission(document: PermissionDocument, permission: string): boolean {
	const permissions = documentPermissions(document);
	return permissions.includes(permission) || permissions.includes('Everything');
}
