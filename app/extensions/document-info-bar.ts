import { defineSlot } from './contribution';
import { DocumentActionContext } from './slots';

export interface DocumentInfoBarContext extends DocumentActionContext {
	readonly loading: boolean;
	readonly searchActive: boolean;
}
export const DOCUMENT_INFO_BAR_SLOT = defineSlot<DocumentInfoBarContext>(
	'DOCUMENT_INFO_BAR',
	(value): value is DocumentInfoBarContext => {
		if (!value || typeof value !== 'object') return false;
		const context = value as DocumentInfoBarContext;
		return (
			typeof context.noEdit === 'boolean' &&
			typeof context.loading === 'boolean' &&
			typeof context.searchActive === 'boolean' &&
			(context.document === null ||
				(typeof context.document === 'object' && !Array.isArray(context.document)))
		);
	},
);
