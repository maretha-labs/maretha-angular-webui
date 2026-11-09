import { defineSlot } from './contribution';
import { DocumentActionContext } from './slots';
import { ResultsSelectionContext } from './results';

/** Host capabilities, not service instances. A callback rechecks availability before executing. */
export interface ResultsQueryScope {
	readonly repository: string;
	readonly providerName: string;
	readonly queryParams: readonly string[];
	readonly namedParameters: Readonly<Record<string, string>>;
}
/** A visible result column bound to a document field, like Polymer's results `columns`. */
export interface ResultsColumn {
	readonly field: string;
	readonly label: string;
	readonly labelKey?: string;
}
export interface ResultsToolbarContext extends ResultsSelectionContext {
	/** Changes whenever the host replaces the successfully applied result set. */
	readonly queryToken?: number;
	/** Changes on navigation even when an applied query happens to have the same token. */
	readonly routeToken?: number;
	/** IDs explicitly deselected after choosing all matching results. */
	readonly queryExclusions?: readonly string[];
	readonly loadedCount: number;
	readonly totalCount: number;
	readonly allSelected: boolean;
	readonly availableCommands: readonly string[];
	readonly workflows: readonly { name: string; title: string }[];
	readonly execute: (command: string, argument?: string) => Promise<void>;
}
const isToolbarContext = (value: unknown): value is ResultsToolbarContext => {
	const c = value as ResultsToolbarContext | null;
	return (
		!!c &&
		Array.isArray(c.selectedDocuments) &&
		Array.isArray(c.availableCommands) &&
		typeof c.execute === 'function'
	);
};
export const RESULTS_ACTIONS_SLOT = defineSlot('RESULTS_ACTIONS', isToolbarContext);
export const RESULTS_SELECTION_ACTIONS_SLOT = defineSlot(
	'RESULTS_SELECTION_ACTIONS',
	isToolbarContext,
);
export const COLLECTION_ACTIONS_SLOT = defineSlot('COLLECTION_ACTIONS', isToolbarContext);

export interface DocumentCreateContext extends DocumentActionContext {
	/** Enables the source creation wizard presentation only in the destination picker. */
	readonly destinationPicker?: boolean;
	readonly busy?: boolean;
	readonly selectedFiles?: readonly File[];
	readonly removeSelectedFile?: (index: number) => void;
	readonly types: readonly { name: string; label: string; file: boolean; folder: boolean }[];
	readonly create: (type: string, bulk?: boolean) => void;
	readonly importFiles: () => void;
	readonly importSelection?: (files: readonly File[]) => void;
	readonly open: () => void;
}
const isCreateContext = (value: unknown): value is DocumentCreateContext => {
	const c = value as DocumentCreateContext | null;
	return (
		!!c &&
		Array.isArray(c.types) &&
		typeof c.create === 'function' &&
		typeof c.open === 'function' &&
		typeof c.noEdit === 'boolean'
	);
};
export const DOCUMENT_CREATE_ACTIONS_SLOT = defineSlot('DOCUMENT_CREATE_ACTIONS', isCreateContext);
export const CREATE_POPUP_ITEMS_SLOT = defineSlot('CREATE_POPUP_ITEMS', isCreateContext);
export const CREATE_POPUP_PAGES_SLOT = defineSlot('CREATE_POPUP_PAGES', isCreateContext);
