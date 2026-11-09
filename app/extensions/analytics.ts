import { defineSlot } from './contribution';
import { ADMINISTRATION_MENU_SLOT } from './administration';
export const ANALYTICS_ITEMS_SLOT = defineSlot(
	'ANALYTICS_ITEMS',
	ADMINISTRATION_MENU_SLOT.isContext,
);
export const ANALYTICS_PAGES_SLOT = defineSlot(
	'ANALYTICS_PAGES',
	ADMINISTRATION_MENU_SLOT.isContext,
);
