import type { ActiveToast } from './toast.service';

/** Refresh the text of a shown toast without restarting its timeout. */
export function updateToastText(toast: ActiveToast, message: string, title: string): void {
	toast.update(message, title);
}
