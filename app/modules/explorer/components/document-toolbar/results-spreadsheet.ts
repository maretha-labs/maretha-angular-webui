import { ResultsColumn, SchemaMetadata } from '@maretha/webui-sdk';
import { hasPermission } from 'app/helpers/document-permissions';

/** Columns of Polymer's spreadsheet app when the results view supplies none. */
export const SPREADSHEET_DEFAULT_COLUMNS: readonly ResultsColumn[] = [
	{ field: 'dc:title', label: 'Title', labelKey: 'app.columns.title' },
	{ field: 'dc:modified', label: 'Modified', labelKey: 'app.columns.modified' },
	{
		field: 'dc:lastContributor',
		label: 'Last contributor',
		labelKey: 'app.columns.last-contributor',
	},
	{ field: 'currentLifeCycleState', label: 'State', labelKey: 'app.columns.state' },
];

/**
 * How a column edits. AG Grid Community has no suggestion editors, so user and document
 * references, multi-valued directories, blobs and complex values stay read-only.
 */
export type SpreadsheetFieldKind =
	| 'text'
	| 'list'
	| 'integer'
	| 'number'
	| 'date'
	| 'boolean'
	| 'directory'
	| 'readonly';

export interface SpreadsheetField {
	readonly field: string;
	readonly label: string;
	readonly labelKey?: string;
	readonly kind: SpreadsheetFieldKind;
	readonly directory?: { readonly name: string; readonly dbl10n: boolean };
}

export interface SpreadsheetRow {
	readonly uid: string;
	readonly changeToken?: string;
	readonly state?: string;
	readonly properties: Readonly<Record<string, unknown>>;
	readonly contextParameters?: { readonly permissions?: readonly string[] };
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Readonly<Record<string, unknown>>)
		: undefined;
}

/** Resolves a `prefix:name` column against `/config/schemas`, as Polymer's spreadsheet does. */
export function spreadsheetField(
	column: ResultsColumn,
	schemas: readonly SchemaMetadata[],
): SpreadsheetField {
	const base = { field: column.field, label: column.label, labelKey: column.labelKey };
	const [prefix, name, ...rest] = column.field.split(':');
	if (!name || rest.length || name.includes('/')) return { ...base, kind: 'readonly' };
	const schema = schemas.find(
		(candidate) => (candidate.prefix || candidate['@prefix'] || candidate.name) === prefix,
	);
	const raw = schema?.fields[name];
	const meta = typeof raw === 'string' ? { type: raw } : record(raw);
	const type = typeof meta?.['type'] === 'string' ? meta['type'] : '';
	if (!type || meta?.['readOnly'] === true) return { ...base, kind: 'readonly' };
	const constraints = [
		...(Array.isArray(meta?.['itemConstraints']) ? meta['itemConstraints'] : []),
		...(Array.isArray(meta?.['constraints']) ? meta['constraints'] : []),
	].map(record);
	const resolver = constraints.find((constraint) =>
		['directoryResolver', 'userManagerResolver', 'documentResolver'].includes(
			String(constraint?.['name']),
		),
	);
	if (resolver) {
		const directory = record(resolver['parameters'])?.['directory'];
		return resolver['name'] === 'directoryResolver' &&
			type === 'string' &&
			typeof directory === 'string'
			? {
					...base,
					kind: 'directory',
					directory: { name: directory, dbl10n: directory !== 'nature' },
				}
			: { ...base, kind: 'readonly' };
	}
	const kinds: Readonly<Record<string, SpreadsheetFieldKind>> = {
		string: 'text',
		'string[]': 'list',
		long: 'integer',
		integer: 'integer',
		double: 'number',
		float: 'number',
		date: 'date',
		boolean: 'boolean',
	};
	return { ...base, kind: kinds[type] ?? 'readonly' };
}

/** Polymer edits rows only where the permissions enricher grants Write. */
export function canEditRow(row: SpreadsheetRow): boolean {
	return hasPermission(row, 'Write');
}

/** The value a cell shows; non-property columns read the document entity. */
export function cellValue(row: SpreadsheetRow, field: SpreadsheetField): unknown {
	if (!field.field.includes(':'))
		return field.field === 'currentLifeCycleState'
			? row.state
			: (row as unknown as Record<string, unknown>)[field.field];
	const value = row.properties[field.field];
	if (field.kind === 'list') return Array.isArray(value) ? value.join(', ') : '';
	if (field.kind === 'date') return typeof value === 'string' ? value.slice(0, 10) : null;
	return value ?? null;
}

/** Converts an edited cell back to the property value Nuxeo stores. */
export function propertyValue(field: SpreadsheetField, value: unknown): unknown {
	if (field.kind === 'list')
		return String(value ?? '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	if (field.kind === 'integer' || field.kind === 'number')
		return typeof value === 'number' && Number.isFinite(value)
			? field.kind === 'integer'
				? Math.trunc(value)
				: value
			: null;
	if (field.kind === 'boolean') return value === true;
	if (field.kind === 'date')
		return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
			? `${value}T00:00:00.000Z`
			: null;
	return value === '' || value === undefined ? null : value;
}
