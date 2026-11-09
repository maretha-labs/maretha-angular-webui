import { defineSlot } from './contribution';
import { POLYMER_SLOTS } from './slots';

export interface ApplicationUser {
	readonly id: string;
	readonly displayName: string;
	readonly isAdministrator: boolean;
	readonly groups: readonly string[];
}

export interface ApplicationContext {
	readonly user: ApplicationUser | null;
	readonly locale: string;
	readonly route: string;
	readonly document: Readonly<Record<string, unknown>> | null;
}

export interface UserMenuLanguage {
	readonly key: string;
	readonly label: string;
}

export interface UserMenuContext extends ApplicationContext {
	readonly languages: readonly UserMenuLanguage[];
	readonly close: () => void;
	readonly openProfile: () => void;
	readonly changeLanguage: (key: string) => void;
	readonly signOut: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApplicationUser(value: unknown): value is ApplicationUser {
	return (
		isRecord(value) &&
		typeof value['id'] === 'string' &&
		typeof value['displayName'] === 'string' &&
		typeof value['isAdministrator'] === 'boolean' &&
		Array.isArray(value['groups']) &&
		Array.from(value['groups']).every((group: unknown) => typeof group === 'string')
	);
}

function isLanguage(value: unknown): value is UserMenuLanguage {
	return isRecord(value) && typeof value['key'] === 'string' && typeof value['label'] === 'string';
}

export const USER_MENU_SLOT = defineSlot<UserMenuContext>(
	POLYMER_SLOTS.USER_MENU,
	(value): value is UserMenuContext =>
		isRecord(value) &&
		(value['user'] === null || isApplicationUser(value['user'])) &&
		typeof value['locale'] === 'string' &&
		typeof value['route'] === 'string' &&
		(value['document'] === null || isRecord(value['document'])) &&
		Array.isArray(value['languages']) &&
		Array.from(value['languages']).every(isLanguage) &&
		typeof value['close'] === 'function' &&
		typeof value['openProfile'] === 'function' &&
		typeof value['changeLanguage'] === 'function' &&
		typeof value['signOut'] === 'function',
);
