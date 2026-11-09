import type { WebUiMessageValues } from './i18n/message-format';
import { defineSlot } from './contribution';
import type { ApplicationUser } from './user-menu';

export const POLYMER_SLOTS = Object.freeze({
	DRAWER_ITEMS: 'DRAWER_ITEMS',
	DRAWER_PAGES: 'DRAWER_PAGES',
	PAGES: 'PAGES',
	USER_MENU: 'USER_MENU',
	ADMINISTRATION_MENU: 'ADMINISTRATION_MENU',
	ADMINISTRATION_PAGES: 'ADMINISTRATION_PAGES',
	DOCUMENT_ACTIONS: 'DOCUMENT_ACTIONS',
	DOCUMENT_VIEWS_ITEMS: 'DOCUMENT_VIEWS_ITEMS',
	DOCUMENT_VIEWS_PAGES: 'DOCUMENT_VIEWS_PAGES',
	DOCUMENT_INFO_BAR: 'DOCUMENT_INFO_BAR',
	BLOB_ACTIONS: 'BLOB_ACTIONS',
	RESULTS_ACTIONS: 'RESULTS_ACTIONS',
	RESULTS_SELECTION_ACTIONS: 'RESULTS_SELECTION_ACTIONS',
	TRASH_RESULTS_SELECTION_ACTIONS: 'TRASH_RESULTS_SELECTION_ACTIONS',
	COLLECTION_ACTIONS: 'COLLECTION_ACTIONS',
	DOCUMENT_CREATE_ACTIONS: 'DOCUMENT_CREATE_ACTIONS',
	CREATE_POPUP_ITEMS: 'CREATE_POPUP_ITEMS',
	CREATE_POPUP_PAGES: 'CREATE_POPUP_PAGES',
	FILE_UPLOAD_ACTIONS: 'FILE_UPLOAD_ACTIONS',
	PUBLISH_ITEMS: 'PUBLISH_ITEMS',
	PUBLISH_PAGES: 'PUBLISH_PAGES',
	ANALYTICS_ITEMS: 'ANALYTICS_ITEMS',
	ANALYTICS_PAGES: 'ANALYTICS_PAGES',
	THEMES: 'THEMES',
} as const);

export interface DocumentActionContext {
	readonly document: Readonly<Record<string, unknown>> | null;
	readonly noEdit: boolean;
	/** Signed-in user; slot hosts add it like Polymer's shared slot model. */
	readonly user?: ApplicationUser | null;
	readonly collection?: Readonly<Record<string, unknown>> | null;
	readonly refreshDocument?: () => void;
	/** Report an app-owned message identifier so the host can reformat it when its locale changes. */
	readonly reportMessage?: (key: string, fallback: string, values?: WebUiMessageValues) => void;
	/** Explicit header opt-in; shared/protected document and selection callers keep legacy rules. */
	readonly standardHeaderActions?: boolean;
}

export const DOCUMENT_ACTIONS_SLOT = defineSlot<DocumentActionContext>(
	POLYMER_SLOTS.DOCUMENT_ACTIONS,
	(value): value is DocumentActionContext => {
		if (!value || typeof value !== 'object') return false;
		const context = value as Record<string, unknown>;
		return (
			typeof context['noEdit'] === 'boolean' &&
			(context['document'] === null ||
				(typeof context['document'] === 'object' && !Array.isArray(context['document'])))
		);
	},
);
