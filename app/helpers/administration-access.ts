/** Nuxeo exposes administration to administrators and the powerusers group. */
export function isPowerUser(user: any): boolean {
	return [...(user?.groups ?? []), ...(user?.extendedGroups ?? [])].some(
		(group) => (typeof group === 'string' ? group : (group?.id ?? group?.name)) === 'powerusers',
	);
}
export function hasAdministrationAccess(user: any): boolean {
	return user?.isAdministrator === true || isPowerUser(user);
}
