import { defineSlot } from './contribution';
import { DocumentActionContext, DOCUMENT_ACTIONS_SLOT } from './slots';

/** A publication dialog binds either one document or an explicit, immutable selection. */
export interface PublishContext extends DocumentActionContext {
	readonly selectedDocuments?: readonly Readonly<Record<string, unknown>>[];
}
const isPublishContext = (value: unknown): value is PublishContext =>
	DOCUMENT_ACTIONS_SLOT.isContext(value) &&
	((value as PublishContext).selectedDocuments === undefined ||
		Array.isArray((value as PublishContext).selectedDocuments));
export const PUBLISH_ITEMS_SLOT = defineSlot('PUBLISH_ITEMS', isPublishContext);
export const PUBLISH_PAGES_SLOT = defineSlot('PUBLISH_PAGES', isPublishContext);
