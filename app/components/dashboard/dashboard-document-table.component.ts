import {
	ChangeDetectionStrategy,
	Component,
	computed,
	ElementRef,
	inject,
	input,
	signal,
} from '@angular/core';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import {
	ResultsProjectionColumn,
	ResultsProjectionComponent,
	ResultsProjectionHostContext,
	ResultsProjectionRow,
	WebUiMessagePipe,
	WebUiIconComponent,
} from '@maretha/webui-sdk';

const FILTER_OPERATORS = [
	'contains',
	'notContains',
	'equals',
	'notEqual',
	'startsWith',
	'endsWith',
	'blank',
	'notBlank',
] as const;
type FilterOperator = (typeof FILTER_OPERATORS)[number];
interface Condition {
	readonly operator: FilterOperator;
	readonly value: string;
}
interface ColumnFilter {
	readonly conditions: readonly [Condition, Condition];
	readonly join: 'AND' | 'OR';
}
interface Sort {
	readonly column: string;
	readonly direction: 'ascending' | 'descending';
}
const EMPTY_FILTER: ColumnFilter = {
	conditions: [
		{ operator: 'contains', value: '' },
		{ operator: 'contains', value: '' },
	],
	join: 'AND',
};

/** Dashboard-only renderer; customer projection lookup and contexts stay on the SDK host. */
@Component({
	selector: 'nx-dashboard-document-table',
	imports: [WebUiIconComponent, NgComponentOutlet, NgTemplateOutlet, WebUiMessagePipe],
	templateUrl: './dashboard-document-table.component.html',
	styleUrl: './dashboard-document-table.component.scss',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardDocumentTableComponent {
	private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
	private static nextId = 0;
	readonly sortDescriptionId = `dashboard-table-sort-${++DashboardDocumentTableComponent.nextId}`;
	readonly projection = input.required<ResultsProjectionComponent>();
	readonly context = input.required<ResultsProjectionHostContext>();
	readonly caption = input.required<string>();
	readonly operators = FILTER_OPERATORS;
	readonly sorts = signal<readonly Sort[]>([]);
	readonly filters = signal<Readonly<Record<string, ColumnFilter>>>({});
	readonly filterOpen = signal<string | null>(null);
	private readonly cursor = signal({ row: -1, column: 0, detail: false });
	readonly columns = computed(() => this.context().columns);
	readonly hasActions = computed(() =>
		this.context().rows.some((row, index) => this.projection().hasRowActions(row, index)),
	);
	readonly columnCount = computed(() => this.columns().length + (this.hasActions() ? 1 : 0));
	readonly displayedRows = computed(() => {
		const host = this.projection();
		const columns = this.columns();
		const filters = this.filters();
		const rows = this.context().rows.filter((row) =>
			columns.every((column) =>
				this.matches(host.value(row, column), filters[column.id] ?? EMPTY_FILTER),
			),
		);
		const sorts = this.sorts();
		return rows
			.map((row, index) => ({ row, index }))
			.sort((a, b) => {
				for (const sort of sorts) {
					const column = columns.find((item) => item.id === sort.column);
					if (!column) continue;
					const result = this.compare(host.value(a.row, column), host.value(b.row, column));
					if (result) return sort.direction === 'ascending' ? result : -result;
				}
				return a.index - b.index;
			})
			.map(({ row }) => row);
	});
	readonly focusCursor = computed(() => ({
		row: Math.min(this.cursor().row, this.displayedRows().length - 1),
		column: Math.min(
			this.cursor().column,
			(this.cursor().row < 0 ? this.columns().length : this.columnCount()) - 1,
		),
		detail: this.cursor().detail && this.hasDetail(this.cursor().row),
	}));
	readonly sortDescription = computed(() =>
		this.sorts()
			.map((sort, index) => {
				const column = this.columns().find((item) => item.id === sort.column);
				return column
					? `${index + 1}. ${column.label}: ${this.locale(sort.direction === 'ascending' ? 'sortAscending' : 'sortDescending')}`
					: '';
			})
			.filter(Boolean)
			.join('; '),
	);

	locale(key: string): string {
		return this.projection().gridMessages()[key];
	}
	filter(column: string): ColumnFilter {
		return this.filters()[column] ?? EMPTY_FILTER;
	}
	filterActive(column: string): boolean {
		return this.filter(column).conditions.some((condition) => this.active(condition));
	}
	private active(condition: Condition): boolean {
		return (
			condition.operator === 'blank' ||
			condition.operator === 'notBlank' ||
			condition.value.length > 0
		);
	}
	private matches(value: unknown, filter: ColumnFilter): boolean {
		const conditions = filter.conditions.filter((condition) => this.active(condition));
		if (!conditions.length) return true;
		const actual = value == null ? '' : String(value).toLowerCase();
		const results = conditions.map(({ operator, value: query }) => {
			const expected = query.toLowerCase();
			switch (operator) {
				case 'blank':
					return !actual.trim();
				case 'notBlank':
					return !!actual.trim();
				case 'contains':
					return actual.includes(expected);
				case 'notContains':
					return !actual.includes(expected);
				case 'equals':
					return actual === expected;
				case 'notEqual':
					return actual !== expected;
				case 'startsWith':
					return actual.startsWith(expected);
				case 'endsWith':
					return actual.endsWith(expected);
			}
		});
		return filter.join === 'AND' ? results.every(Boolean) : results.some(Boolean);
	}
	private compare(a: unknown, b: unknown): number {
		if (typeof a === 'object' && a && 'toNumber' in a && typeof a.toNumber === 'function')
			a = a.toNumber();
		if (typeof b === 'object' && b && 'toNumber' in b && typeof b.toNumber === 'function')
			b = b.toNumber();
		if (a === b) return 0;
		if (a == null) return -1;
		if (b == null) return 1;
		if (typeof a === 'number' && typeof b === 'number') return a - b;
		// Match AG Grid's default relational ordering without coercing mixed values to text.
		return (a as string) > (b as string) ? 1 : (a as string) < (b as string) ? -1 : 0;
	}
	setCondition(column: string, index: number, value: string, operator?: string): void {
		if (this.context().loading || (index !== 0 && index !== 1)) return;
		if (operator !== undefined && !this.operators.some((item) => item === operator)) return;
		const filter = this.filter(column);
		const conditions: [Condition, Condition] = [...filter.conditions];
		conditions[index] = {
			value,
			operator: (operator as FilterOperator | undefined) ?? conditions[index].operator,
		};
		this.filters.update((filters) => ({ ...filters, [column]: { ...filter, conditions } }));
	}
	setJoin(column: string, join: string): void {
		if (this.context().loading || (join !== 'AND' && join !== 'OR')) return;
		this.filters.update((filters) => ({ ...filters, [column]: { ...this.filter(column), join } }));
	}
	clearFilter(column: string): void {
		if (!this.context().loading)
			this.filters.update((filters) => ({ ...filters, [column]: EMPTY_FILTER }));
	}
	sort(column: string, multiple = false): void {
		if (this.context().loading) return;
		const current = this.sorts().find((item) => item.column === column);
		const next: Sort | undefined =
			current?.direction === 'descending'
				? undefined
				: { column, direction: current ? 'descending' : 'ascending' };
		this.sorts.update((sorts) => {
			if (!multiple) return next ? [next] : [];
			if (current)
				return sorts.flatMap((item) => (item.column === column ? (next ? [next] : []) : [item]));
			return next ? [...sorts, next] : sorts;
		});
	}
	sortDirection(column: string): 'ascending' | 'descending' | null {
		return this.sorts()[0]?.column === column ? this.sorts()[0].direction : null;
	}
	sortSymbol(column: string): string {
		const sort = this.sorts().find((item) => item.column === column);
		return sort
			? `${sort.direction === 'ascending' ? '↑' : '↓'}${this.sorts().length > 1 ? this.sorts().indexOf(sort) + 1 : ''}`
			: '';
	}
	tabIndex(row: number, column: number, detail = false): number {
		const cursor = this.focusCursor();
		return cursor.row === row && cursor.column === column && cursor.detail === detail ? 0 : -1;
	}
	focused(row: number, column: number, detail = false): void {
		this.cursor.set({ row, column, detail });
	}
	private hasDetail(index: number): boolean {
		const row = this.displayedRows()[index];
		return !!row && this.projection().hasDetail(row, index);
	}
	rowContext(row: ResultsProjectionRow, index: number, column?: ResultsProjectionColumn) {
		return this.projection().rowContext(row, index, column);
	}
	cellComponent(row: ResultsProjectionRow, index: number, column: ResultsProjectionColumn) {
		const host = this.projection(),
			context = this.rowContext(row, index, column);
		return (
			host.projectionComponent(`cell:${column.id}`, context) ||
			host.projectionComponent('cell', context)
		);
	}
	actionComponent(name: 'action' | 'settings', row: ResultsProjectionRow, index: number) {
		return this.projection().projectionComponent(name, this.rowContext(row, index));
	}
	filterToggled(event: Event, column: string): void {
		const details = event.target as HTMLDetailsElement;
		if (details.open) this.filterOpen.set(column);
		else if (this.filterOpen() === column) this.filterOpen.set(null);
	}
	private focusCell(row: number, column: number, detail = false): void {
		if (row < 0) column = Math.min(column, this.columns().length - 1);
		this.cursor.set({ row, column, detail });
		const cell = this.element.nativeElement.querySelector<HTMLElement>(
			`[data-dashboard-row="${row}"][data-dashboard-column="${column}"][data-dashboard-detail="${detail}"]`,
		);
		(row < 0 ? cell?.querySelector<HTMLElement>('[data-dashboard-header-focus]') : cell)?.focus();
	}
	keyDown(event: KeyboardEvent): void {
		const target = event.target as HTMLElement;
		const cell = target.closest<HTMLElement>('[data-dashboard-cell]');
		if (!cell) return;
		const row = Number(cell.dataset['dashboardRow']),
			column = Number(cell.dataset['dashboardColumn']);
		const detail = cell.dataset['dashboardDetail'] === 'true';
		const headerButton = row < 0 ? cell.querySelector('[data-dashboard-header-focus]') : null;
		if (event.key === 'Escape' && target !== cell && target !== headerButton) {
			this.filterOpen.set(null);
			cell.querySelectorAll('details').forEach((details) => {
				details.open = false;
			});
			event.preventDefault();
			this.focusCell(row, column, detail);
			return;
		}
		if (target !== cell && target !== headerButton) return;
		if (event.key === 'Enter' && row === -1) {
			event.preventDefault();
			if (this.context().loading) return;
			if (event.ctrlKey || event.metaKey) {
				const details = cell.querySelector('details');
				if (details) {
					details.open = true;
					this.filterOpen.set(this.columns()[column].id);
					details.querySelector('select')?.focus();
				}
			} else if (this.columns()[column]) this.sort(this.columns()[column].id, event.shiftKey);
			return;
		}
		if (event.key === 'F2') {
			const interactive = cell.querySelector<HTMLElement>(
				'a[href],button:not(:disabled),summary,input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
			);
			if (interactive) {
				event.preventDefault();
				interactive.focus();
			}
			return;
		}
		if (event.key === 'Enter' || event.key === ' ') {
			const document = this.displayedRows()[row];
			if (document) this.projection().keyDown(event, document);
			return;
		}
		let nextRow = row,
			nextColumn = column,
			nextDetail = false;
		const lastRow = this.displayedRows().length - 1,
			lastColumn = (row < 0 ? this.columns().length : this.columnCount()) - 1;
		const control = event.ctrlKey || event.metaKey;
		switch (event.key) {
			case 'ArrowUp':
				nextRow = control && row >= 0 ? 0 : detail ? row : Math.max(-1, row - 1);
				if (!control && !detail && this.hasDetail(nextRow)) {
					nextDetail = true;
					nextColumn = 0;
				}
				break;
			case 'ArrowDown':
				if (detail && row === lastRow && !control) return;
				if (!control && !detail && this.hasDetail(row)) {
					nextDetail = true;
					nextColumn = 0;
				} else nextRow = control && row >= 0 ? lastRow : Math.min(lastRow, row + 1);
				break;
			case 'ArrowLeft':
				if (detail) return;
				nextColumn =
					this.projection().locale.direction() === 'rtl'
						? control
							? lastColumn
							: Math.min(lastColumn, column + 1)
						: control
							? 0
							: Math.max(0, column - 1);
				break;
			case 'ArrowRight':
				if (detail) return;
				nextColumn =
					this.projection().locale.direction() === 'rtl'
						? control
							? 0
							: Math.max(0, column - 1)
						: control
							? lastColumn
							: Math.min(lastColumn, column + 1);
				break;
			case 'Home':
				if (row < 0) return;
				nextColumn = 0;
				nextRow = 0;
				break;
			case 'End':
				if (row < 0) return;
				nextColumn = lastColumn;
				nextRow = lastRow;
				break;
			case 'PageUp':
			case 'PageDown': {
				if (row < 0 || event.altKey || control) return;
				const viewport = this.element.nativeElement.closest<HTMLElement>('.card-body');
				const header = this.element.nativeElement.querySelector('thead');
				const page = Math.max(
					1,
					Math.floor(
						((viewport?.clientHeight ?? 350) - (header?.clientHeight ?? 47)) /
							Math.max(1, cell.clientHeight),
					),
				);
				nextRow = Math.max(0, Math.min(lastRow, row + (event.key === 'PageUp' ? -page : page)));
				break;
			}
			case 'Tab':
				if (event.shiftKey) {
					if (detail) nextColumn = lastColumn;
					else if (column > 0) nextColumn--;
					else if (row > -1) {
						nextRow--;
						nextDetail = this.hasDetail(nextRow);
						nextColumn = nextDetail ? 0 : lastColumn;
					} else return;
				} else {
					if (!detail && column < lastColumn) nextColumn++;
					else if (!detail && this.hasDetail(row)) {
						nextDetail = true;
						nextColumn = 0;
					} else if (row < lastRow) {
						nextRow++;
						nextColumn = 0;
					} else return;
				}
				break;
			default:
				return;
		}
		event.preventDefault();
		this.focusCell(nextRow, nextColumn, nextDetail);
	}
}
