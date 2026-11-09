import type {
	ResultsColumn,
	ResultsColumnLayout,
	ResultsProjectionColumn,
	ResultsProjectionRow,
} from '@maretha/webui-sdk';

/** Document fields behind the standard result column ids. */
const RESULT_COLUMN_FIELDS: Readonly<Record<string, string>> = {
	title: 'dc:title',
	modified: 'dc:modified',
	lastContributor: 'dc:lastContributor',
	state: 'currentLifeCycleState',
	created: 'dc:created',
	author: 'dc:creator',
	nature: 'dc:nature',
	coverage: 'dc:coverage',
	subjects: 'dc:subjects',
};

/** Visible columns that show a document field, as a results context's `columns`. */
export function resultFieldColumns(
	columns: readonly Pick<ResultsProjectionColumn, 'id' | 'label' | 'labelKey' | 'hidden'>[],
): ResultsColumn[] {
	return columns.flatMap((column) =>
		!column.hidden && RESULT_COLUMN_FIELDS[column.id]
			? [{ field: RESULT_COLUMN_FIELDS[column.id], label: column.label, labelKey: column.labelKey }]
			: [],
	);
}

/** Local preferences used only by the standard scoped folderish and search adapters. */
export function readResultColumnLayout(value: unknown): readonly ResultsColumnLayout[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	return value.flatMap((entry) => {
		if (
			!entry ||
			typeof entry.id !== 'string' ||
			!entry.id ||
			entry.id.startsWith('__') ||
			seen.has(entry.id)
		)
			return [];
		seen.add(entry.id);
		const width =
			typeof entry.width === 'number' &&
			Number.isFinite(entry.width) &&
			entry.width >= 48 &&
			entry.width <= 4000
				? entry.width
				: undefined;
		return [{ id: entry.id, ...(width === undefined ? {} : { width }) }];
	});
}

export function mergeResultColumnLayout(
	previous: readonly ResultsColumnLayout[],
	visible: readonly ResultsColumnLayout[],
): readonly ResultsColumnLayout[] {
	const changed = readResultColumnLayout(visible);
	const ids = new Set(changed.map((column) => column.id));
	return [...changed, ...previous.filter((column) => !ids.has(column.id))];
}

export function applyResultColumnLayout<R extends ResultsProjectionRow>(
	columns: readonly ResultsProjectionColumn<R>[],
	layout: readonly ResultsColumnLayout[],
): readonly ResultsProjectionColumn<R>[] {
	const saved = new Map(layout.map((column, order) => [column.id, { ...column, order }]));
	return columns
		.map((column, index) => ({ column, index }))
		.sort(
			(a, b) =>
				(saved.get(a.column.id)?.order ?? layout.length + a.index) -
				(saved.get(b.column.id)?.order ?? layout.length + b.index),
		)
		.map(({ column }) => ({
			...column,
			...(saved.get(column.id)?.width === undefined
				? {}
				: { width: Math.max(column.minWidth ?? 100, saved.get(column.id)!.width!) }),
		}));
}
