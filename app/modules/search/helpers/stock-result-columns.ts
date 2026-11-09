import type {
	ResultsColumnLayout,
	ResultsProjectionColumn,
	ResultsProjectionRow,
} from '@maretha/webui-sdk';

/** Polymer distributes free space after each column's 150px basis; user widths stay fixed. */
export function stockResultColumnWidths<R extends ResultsProjectionRow>(
	columns: readonly ResultsProjectionColumn<R>[],
	tableWidth: number,
	columnChooser: boolean,
): readonly ResultsProjectionColumn<R>[] {
	const visible = columns.filter((column) => !column.hidden);
	const flexible = visible.filter((column) => column.width === undefined);
	const fixedWidth = visible.reduce((sum, column) => sum + (column.width ?? 0), 0);
	// 64px selection, two 2px row frames, and the projection's 32px settings column (the stock
	// gear sits in a 1.5em gutter; the data columns share what remains the same way).
	const gutter = columnChooser ? 32 : 0;
	const extra = Math.max(0, tableWidth - 68 - gutter - fixedWidth - flexible.length * 150);
	const totalFlex = flexible.reduce((sum, column) => sum + (column.flex ?? 1), 0);
	return columns.map((column) => ({
		...column,
		...(tableWidth && !column.hidden && column.width === undefined
			? { width: 150 + (extra * (column.flex ?? 1)) / totalFlex }
			: {}),
	}));
}

/** Reordering must not turn responsive presentation widths into permanent user widths. */
export function userResultColumnLayout(
	layout: readonly ResultsColumnLayout[],
	previousLayout: readonly ResultsColumnLayout[],
	projectedColumns: readonly ResultsProjectionColumn[],
): readonly ResultsColumnLayout[] {
	const projected = new Map(projectedColumns.map((column) => [column.id, column.width]));
	const previous = new Map(previousLayout.map((column) => [column.id, column.width]));
	return layout.map((column) => ({
		id: column.id,
		...(column.width !== undefined &&
		((previous.has(column.id) && previous.get(column.id) !== undefined) ||
			Math.abs(column.width - (projected.get(column.id) ?? 0)) > 1)
			? { width: column.width }
			: {}),
	}));
}
