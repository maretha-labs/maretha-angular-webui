import { defineSlot } from './contribution';
import { DocumentActionContext } from './slots';
import type { ApplicationUser } from './user-menu';
export interface AdministrationContext extends DocumentActionContext {
	readonly user: ApplicationUser | null;
	readonly features: { readonly retention: boolean };
}
function isAdministrationContext(value: unknown): value is AdministrationContext {
	if (!value || typeof value !== 'object') return false;
	const context = value as AdministrationContext;
	return (
		typeof context.noEdit === 'boolean' &&
		!!context.features &&
		typeof context.features.retention === 'boolean' &&
		(context.user === null ||
			(typeof context.user?.id === 'string' && typeof context.user.isAdministrator === 'boolean'))
	);
}
export const ADMINISTRATION_MENU_SLOT = defineSlot('ADMINISTRATION_MENU', isAdministrationContext);
export const ADMINISTRATION_PAGES_SLOT = defineSlot(
	'ADMINISTRATION_PAGES',
	isAdministrationContext,
);
