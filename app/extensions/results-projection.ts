import { Directive, Input, TemplateRef, Type } from '@angular/core';

/** A row consumed by the Nuxeo results, data-list, data-grid and data-table projections. */
export interface ResultsProjectionRow {
	readonly uid: string;
	readonly title?: string;
	readonly type?: string;
	readonly properties?: Readonly<Record<string, unknown>>;
	/** Document projections carry schema-specific fields in addition to these common keys. */
	readonly [key: string]: unknown;
}

export interface ResultsProjectionColumn<R extends ResultsProjectionRow = ResultsProjectionRow> {
	readonly id: string;
	readonly label: string;
	/** Optional catalog key; label remains the literal fallback. */
	readonly labelKey?: string;
	readonly value?: (row: R) => unknown;
	readonly hidden?: boolean;
	/** `false`: the header offers no sorting, as a stock column without `sort-by`. Default true. */
	readonly sortable?: boolean;
	/** Optional sizing hints passed through to the default AG Grid column. */
	readonly width?: number;
	readonly minWidth?: number;
	readonly flex?: number;
	/** Optional AG Grid header renderer; built-in sorting, resizing and moving remain available. */
	readonly headerComponent?: Type<unknown>;
	readonly headerComponentParams?: Readonly<Record<string, unknown>>;
}

/** User-adjusted column order and optional fixed width for explicitly opted-in hosts. */
export interface ResultsColumnLayout {
	readonly id: string;
	readonly width?: number;
}

export interface ResultsProjectionContext<R extends ResultsProjectionRow = ResultsProjectionRow> {
	/** Search identity, when this listing belongs to a search definition. */
	readonly searchId?: string;
	readonly row: R;
	readonly index: number;
	readonly selected: boolean;
	readonly selection: ReadonlySet<string>;
	readonly readonly: boolean;
	readonly loading: boolean;
	readonly columns: readonly ResultsProjectionColumn<R>[];
	readonly column?: ResultsProjectionColumn<R>;
	readonly value?: unknown;
	readonly scope: unknown;
	readonly toggleSelection: () => void;
	/** Selects a row only when its own surface received the keyboard/click event. */
	readonly selectRow: (event: Event) => void;
	/** Opens this row through the host's guarded activation handler. */
	readonly activateRow: () => void;
	readonly invokeAction: (action: string, argument?: unknown) => void;
}

export interface ResultsProjectionHostContext<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> {
	readonly searchId?: string;
	readonly rows: readonly R[];
	readonly selection: ReadonlySet<string>;
	readonly readonly: boolean;
	readonly loading: boolean;
	readonly columns: readonly ResultsProjectionColumn<R>[];
	readonly scope: unknown;
	readonly toggleAll: () => void;
	readonly clearSelection: () => void;
	readonly invokeAction: (action: string, argument?: unknown) => void;
}

export type ResultsProjectionTemplateName =
	| `cell:${string}`
	| 'default'
	| 'selectiontoolbar'
	| 'selectionActions'
	| 'actions'
	| 'cell'
	/** One list/grid item. It is deliberately distinct from the whole-result `default` hook. */
	| 'item'
	| 'rowdetail'
	| 'checkbox'
	| 'settings'
	| 'detail'
	| 'action'
	| 'form'
	| 'empty';
export type ResultsProjectionRowTemplateName = Exclude<
	ResultsProjectionTemplateName,
	'default' | 'selectiontoolbar' | 'selectionActions' | 'actions' | 'form' | 'empty'
>;
export type ResultsProjectionHostTemplateName = Extract<
	ResultsProjectionTemplateName,
	'default' | 'selectiontoolbar' | 'selectionActions' | 'actions' | 'form' | 'empty'
>;

/** A compiled, on-demand renderer. Components receive a `context` input. */
export type ResultsProjectionComponentLoader = () => Promise<Type<unknown>>;

/** Instance-local row renderers. Registered add-ons retain precedence over these defaults. */
export type ResultsProjectionComponents = Readonly<
	Partial<Record<'item' | 'cell' | `cell:${string}`, ResultsProjectionComponentLoader>>
>;

/**
 * A typed public row hook. Whole-result hooks use nxResultsHostTemplate.
 *
 * Example: `<ng-template nxResultsTemplate="cell" let-row="row">{{ row.title }}</ng-template>`.
 */
@Directive({ selector: 'ng-template[nxResultsTemplate]', standalone: true })
export class ResultsProjectionTemplateDirective<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> {
	@Input({ required: true }) nxResultsTemplate!: ResultsProjectionRowTemplateName;

	constructor(readonly template: TemplateRef<ResultsProjectionContext<R>>) {}

	static ngTemplateContextGuard<R extends ResultsProjectionRow>(
		_dir: ResultsProjectionTemplateDirective<R>,
		_context: unknown,
	): _context is ResultsProjectionContext<R> {
		return true;
	}
}

/** Host-only hook for whole-result templates such as default, toolbar, form and empty. */
@Directive({ selector: 'ng-template[nxResultsHostTemplate]', standalone: true })
export class ResultsProjectionHostTemplateDirective<
	R extends ResultsProjectionRow = ResultsProjectionRow,
> {
	@Input({ required: true }) nxResultsHostTemplate!: ResultsProjectionHostTemplateName;
	constructor(readonly template: TemplateRef<ResultsProjectionHostContext<R>>) {}
	static ngTemplateContextGuard<R extends ResultsProjectionRow>(
		_dir: ResultsProjectionHostTemplateDirective<R>,
		_context: unknown,
	): _context is ResultsProjectionHostContext<R> {
		return true;
	}
}
