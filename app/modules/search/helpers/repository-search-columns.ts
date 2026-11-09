import type { ResultsProjectionColumn } from '@maretha/webui-sdk';

/** Nuxeo directory entries and people have different label precedence. Keep that policy
 * explicit while sharing object/array normalization across all search presenters. */
export function metadataLabel(
	value: unknown,
	presentation: 'metadata' | 'contributor' | 'mixed' = 'metadata',
): string {
	if (Array.isArray(value) && presentation !== 'contributor')
		return value
			.map((entry) => metadataLabel(entry, presentation))
			.filter(Boolean)
			.join(', ');
	if (!value || typeof value !== 'object')
		return presentation === 'contributor'
			? typeof value === 'string'
				? value
				: ''
			: String(value ?? '');
	const entry = value as Record<string, any>;
	const properties =
		presentation === 'mixed'
			? (entry['properties'] ?? entry)
			: entry['properties'] && typeof entry['properties'] === 'object'
				? (entry['properties'] as Record<string, any>)
				: entry;
	if (presentation === 'metadata')
		return String(properties['label'] ?? entry['label'] ?? entry['id'] ?? '');
	const name = [properties['firstName'], properties['lastName']]
		.filter((part) =>
			presentation === 'contributor' ? typeof part === 'string' && !!part : !!part,
		)
		.join(' ');
	if (presentation === 'mixed')
		return String(
			properties['label'] ?? entry['label'] ?? entry['displayName'] ?? (name || entry['id'] || ''),
		);
	const displayName = entry['displayName'] ?? properties['displayName'];
	if (typeof displayName === 'string' && displayName) return displayName;
	if (name) return name;
	const id = entry['id'] ?? properties['id'];
	return typeof id === 'string' ? id : '';
}

/** Existing people columns retain their person-first presentation. */
export const contributorLabel = (value: unknown): string => metadataLabel(value, 'contributor');
/** `sortable: false` marks the stock columns declared without `sort-by`. */
export const DEFAULT_RESULT_COLUMNS: readonly ResultsProjectionColumn<any>[] = [
	{ id: 'title', label: 'Title', labelKey: 'app.columns.title', value: (row) => row.title },
	{
		id: 'type',
		label: 'Type',
		labelKey: 'app.columns.type',
		value: (row) => row.type,
		hidden: true,
		sortable: false,
	},
	{
		id: 'modified',
		label: 'Modified',
		labelKey: 'app.columns.modified',
		value: (row) => row.properties?.['dc:modified'] ?? '',
	},
	{
		id: 'lastContributor',
		label: 'Last contributor',
		labelKey: 'label.dublincore.lastContributor',
		value: (row) => contributorLabel(row.properties?.['dc:lastContributor']),
	},
];
export const ASSET_RESULT_COLUMNS: readonly ResultsProjectionColumn<any>[] = [
	...DEFAULT_RESULT_COLUMNS,
	{
		id: 'state',
		label: 'State',
		labelKey: 'app.columns.state',
		hidden: true,
		sortable: false,
		value: (row) => row.state ?? row.currentLifeCycleState ?? '',
	},
	{
		id: 'version',
		label: 'Version',
		labelKey: 'app.columns.version',
		hidden: true,
		sortable: false,
		value: (row) => row.versionLabel ?? '',
	},
	{
		// Stock Assets declares Created and Author without `sort-by`.
		id: 'created',
		label: 'Created',
		labelKey: 'app.columns.created',
		hidden: true,
		sortable: false,
		value: (row) => row.properties?.['dc:created'] ?? '',
	},
	{
		id: 'author',
		label: 'Author',
		labelKey: 'app.columns.author',
		hidden: true,
		sortable: false,
		value: (row) => contributorLabel(row.properties?.['dc:creator']),
	},
	{
		id: 'nature',
		label: 'Nature',
		labelKey: 'app.columns.nature',
		hidden: true,
		sortable: false,
		value: (row) => metadataLabel(row.properties?.['dc:nature']),
	},
	{
		id: 'coverage',
		label: 'Coverage',
		labelKey: 'app.columns.coverage',
		hidden: true,
		sortable: false,
		value: (row) => metadataLabel(row.properties?.['dc:coverage']),
	},
	{
		id: 'subjects',
		label: 'Subjects',
		labelKey: 'app.columns.subjects',
		hidden: true,
		sortable: false,
		value: (row) => metadataLabel(row.properties?.['dc:subjects']),
	},
];
export const NXQL_RESULT_COLUMNS: readonly ResultsProjectionColumn<any>[] = [
	{
		id: 'title',
		label: 'Title',
		labelKey: 'app.columns.title',
		value: (row) => row.title,
		flex: 50,
		hidden: true,
	},
	{
		id: 'path',
		label: 'Path',
		labelKey: 'app.columns.path',
		value: (row) => row.path ?? row.properties?.['ecm:path'] ?? '',
		flex: 100,
	},
	{
		id: 'size',
		label: 'Size',
		labelKey: 'app.columns.size',
		value: (row) => row.properties?.['file:content']?.length ?? '',
		flex: 10,
	},
	...ASSET_RESULT_COLUMNS.filter((column) => column.id !== 'title').map((column) => ({
		...column,
		...(['modified', 'lastContributor', 'created'].includes(column.id) ? { flex: 50 } : {}),
		...(column.id === 'subjects' ? { flex: 60 } : {}),
		// Stock NXQL sorts Created and Author (`sort-by`), unlike Assets.
		...(['created', 'author'].includes(column.id) ? { sortable: true } : {}),
	})),
];
