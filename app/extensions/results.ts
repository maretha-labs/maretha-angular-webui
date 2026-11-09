import { defineSlot } from './contribution';
import type { ResultsProjectionMode } from './results-projection.component';
import { DocumentActionContext } from './slots';
import type { ResultsColumn, ResultsQueryScope } from './toolbar';

export interface ResultsSelectionContext extends DocumentActionContext {
	readonly selectedDocuments: readonly Readonly<Record<string, unknown>>[];
	/** Loaded results in display order: the host's own array, not a copy. */
	readonly items?: readonly Readonly<Record<string, unknown>>[];
	/** How the host currently shows its results. */
	readonly displayMode?: ResultsProjectionMode;
	/** Visible columns that show a document field; omit when the host does not know them. */
	readonly columns?: readonly ResultsColumn[];
	/** Complete applied query. Omit when the host cannot describe every active filter. */
	readonly queryScope?: ResultsQueryScope;
	readonly busy: boolean;
	readonly setBusy: (busy: boolean) => void;
	readonly refresh: (removedIds?: readonly string[]) => Promise<void>;
	readonly reportError: (message: string) => void;
}
export const TRASH_RESULTS_SELECTION_ACTIONS_SLOT = defineSlot<ResultsSelectionContext>(
	'TRASH_RESULTS_SELECTION_ACTIONS',
	(value): value is ResultsSelectionContext => {
		if (!value || typeof value !== 'object') return false;
		const context = value as ResultsSelectionContext;
		return (
			typeof context.noEdit === 'boolean' &&
			Array.isArray(context.selectedDocuments) &&
			typeof context.busy === 'boolean' &&
			typeof context.setBusy === 'function' &&
			typeof context.refresh === 'function' &&
			typeof context.reportError === 'function'
		);
	},
);
