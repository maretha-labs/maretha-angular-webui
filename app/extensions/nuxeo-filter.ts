/**
 * Condition semantics and helpers ported from Nuxeo Elements `ui/nuxeo-filter.js` and
 * `ui/nuxeo-filters-behavior.js` (revision in polymer-assets.provenance.json),
 * ©2023 Hyland Software, Inc. and its affiliates, Apache License 2.0. See NOTICE.
 */

export type NuxeoFilterDocument = Readonly<Record<string, unknown>> | null | undefined;
type Value = Readonly<Record<string, unknown>>;

const record = (value: unknown): Value | undefined =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Value) : undefined;
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const parameters = (doc: NuxeoFilterDocument) => record(doc?.['contextParameters']);
const properties = (doc: NuxeoFilterDocument) => record(doc?.['properties']);

/**
 * The `FiltersBehavior` helpers that Polymer filter expressions call as `this.*`, as pure
 * functions. Each returns a boolean; a missing or malformed document yields `false`.
 */
export const NUXEO_FILTERS = Object.freeze({
	isFavorite: (doc: NuxeoFilterDocument) =>
		!!record(parameters(doc)?.['favorites'])?.['isFavorite'],
	isSubscribed: (doc: NuxeoFilterDocument) =>
		list(parameters(doc)?.['subscribedNotifications']).length > 0,
	/** Polymer's name: true when the document can be added to a collection. */
	isCollectionMember: (doc: NuxeoFilterDocument) =>
		Array.isArray(doc?.['facets']) && !list(doc['facets']).includes('NotCollectionMember'),
	isTrashed: (doc: NuxeoFilterDocument): boolean =>
		!!doc &&
		(doc['isTrashed'] === undefined ? NUXEO_FILTERS.hasState(doc, 'deleted') : !!doc['isTrashed']),
	canSetRetention: (doc: NuxeoFilterDocument): boolean =>
		!!doc &&
		!NUXEO_FILTERS.hasRunningWorkflows(doc) &&
		!doc['hasLegalHold'] &&
		!NUXEO_FILTERS.isVersion(doc) &&
		NUXEO_FILTERS.hasPermission(doc, 'MakeRecord') &&
		NUXEO_FILTERS.hasPermission(doc, 'SetRetention') &&
		Object.hasOwn(properties(doc) ?? {}, 'file:content'),
	canSetLegalHold: (doc: NuxeoFilterDocument): boolean =>
		!NUXEO_FILTERS.isVersion(doc) &&
		NUXEO_FILTERS.hasPermission(doc, 'MakeRecord') &&
		NUXEO_FILTERS.hasPermission(doc, 'ManageLegalHold') &&
		Object.hasOwn(properties(doc) ?? {}, 'file:content'),
	isRetentionDateIndeterminate: (doc: NuxeoFilterDocument) =>
		typeof doc?.['retainUntil'] === 'string' &&
		Date.parse(doc['retainUntil']) === Date.parse('9999-01-01T00:00:00.000+00:00'),
	isVersion: (doc: NuxeoFilterDocument) => !!doc?.['isVersion'],
	isImmutable: (doc: NuxeoFilterDocument): boolean => NUXEO_FILTERS.hasFacet(doc, 'Immutable'),
	isUnderRetentionOrLegalHold: (doc: NuxeoFilterDocument) => !!doc?.['isUnderRetentionOrLegalHold'],
	isRecord: (doc: NuxeoFilterDocument) => !!doc?.['isRecord'],
	hasType: (doc: NuxeoFilterDocument, type: string) => !!doc && doc['type'] === type,
	isProxy: (doc: NuxeoFilterDocument) => !!doc?.['isProxy'],
	/** `pattern` is a regular expression source, as in Polymer. */
	pathMatches: (doc: NuxeoFilterDocument, pattern: string) =>
		typeof doc?.['path'] === 'string' && !!doc['path'] && new RegExp(pattern).test(doc['path']),
	/** Like Polymer, `path` is a regular expression source anchored at the start. */
	pathStartsWith: (doc: NuxeoFilterDocument, path: string): boolean =>
		NUXEO_FILTERS.pathMatches(doc, `^${path}`),
	hasState: (doc: NuxeoFilterDocument, state: string) => !!doc && doc['state'] === state,
	hasFacet: (doc: NuxeoFilterDocument, facet: string) => list(doc?.['facets']).includes(facet),
	hasPermission: (doc: NuxeoFilterDocument, permission: string) =>
		list(parameters(doc)?.['permissions']).includes(permission),
	/** Reads a dotted property path in `properties`, `file:content` by default. */
	hasContent: (doc: NuxeoFilterDocument, xpath?: string) =>
		!!(xpath || 'file:content')
			.split('.')
			.reduce<unknown>((value, key) => record(value)?.[key], properties(doc)),
	hasAttachments: (doc: NuxeoFilterDocument) => list(properties(doc)?.['files:files']).length > 0,
	hasVersions: (doc: NuxeoFilterDocument) =>
		Number(properties(doc)?.['uid:major_version']) > 0 ||
		Number(properties(doc)?.['uid:minor_version']) > 0,
	hasCollections: (doc: NuxeoFilterDocument) => list(parameters(doc)?.['collections']).length > 0,
	/** Matches a schema name or prefix. */
	hasSchema: (doc: NuxeoFilterDocument, schema: string) =>
		list(doc?.['schemas']).some(
			(item) => record(item)?.['prefix'] === schema || record(item)?.['name'] === schema,
		),
	/** Accepts the SDK `ApplicationUser` (`groups`) and the Nuxeo user entity (`extendedGroups`). */
	isMember: (user: unknown, group: string) =>
		list(record(user)?.['groups']).includes(group) ||
		list(record(user)?.['extendedGroups']).some((item) => record(item)?.['name'] === group),
	isPublishable: (doc: NuxeoFilterDocument): boolean =>
		!!doc &&
		!NUXEO_FILTERS.isProxy(doc) &&
		!NUXEO_FILTERS.isRecord(doc) &&
		!NUXEO_FILTERS.isTrashed(doc) &&
		NUXEO_FILTERS.hasFacet(doc, 'Publishable') &&
		NUXEO_FILTERS.hasPermission(doc, 'WriteVersion'),
	isPublication: (doc: NuxeoFilterDocument): boolean =>
		NUXEO_FILTERS.isProxy(doc) && NUXEO_FILTERS.hasFacet(doc, 'Immutable'),
	isTaggable: (doc: NuxeoFilterDocument): boolean =>
		!!doc &&
		!NUXEO_FILTERS.isProxy(doc) &&
		!doc['isVersion'] &&
		NUXEO_FILTERS.hasPermission(doc, 'Write'),
	hasAdministrationPermissions: (user: unknown): boolean =>
		record(user)?.['isAdministrator'] === true || NUXEO_FILTERS.isMember(user, 'powerusers'),
	hasRunningWorkflows: (doc: NuxeoFilterDocument) =>
		list(parameters(doc)?.['runningWorkflows']).length > 0,
	hasRunnableWorkflows: (doc: NuxeoFilterDocument) =>
		list(parameters(doc)?.['runnableWorkflows']).length > 0,
});

export type NuxeoFilters = typeof NUXEO_FILTERS;

/** Any slot context: conditions read its `document` and, for `group`, its `user`. */
export interface NuxeoFilterContext {
	readonly document?: NuxeoFilterDocument;
	readonly user?: unknown;
}

/**
 * The `<nuxeo-filter>` attributes. Comma-separated values pass when any value matches;
 * every condition that is set must pass. Empty strings are ignored, as in Polymer.
 */
export interface NuxeoFilterConditions {
	readonly type?: string;
	readonly facet?: string;
	readonly schema?: string;
	readonly state?: string;
	/** A single path prefix. Like Polymer, it is a regular expression source. */
	readonly path?: string;
	readonly permission?: string;
	readonly group?: string;
	/**
	 * Replaces Polymer's string `expression`: `this.isTrashed(document)` becomes
	 * `(document, user, filters) => filters.isTrashed(document)`.
	 */
	readonly expression?: (
		document: NuxeoFilterDocument,
		user: unknown,
		filters: NuxeoFilters,
	) => boolean;
}

const CONDITIONS = {
	type: { check: NUXEO_FILTERS.hasType, multiple: true },
	facet: { check: NUXEO_FILTERS.hasFacet, multiple: true },
	schema: { check: NUXEO_FILTERS.hasSchema, multiple: true },
	state: { check: NUXEO_FILTERS.hasState, multiple: true },
	path: { check: NUXEO_FILTERS.pathStartsWith, multiple: false },
	permission: { check: NUXEO_FILTERS.hasPermission, multiple: true },
} as const;

/**
 * Builds a contribution `when` predicate with `<nuxeo-filter>` semantics. Invalid conditions
 * throw when the filter is defined, so a migrated filter fails at registration, not at runtime.
 */
export function nuxeoFilter(
	conditions: NuxeoFilterConditions,
): (context: NuxeoFilterContext) => boolean {
	if (!record(conditions)) throw new Error('nuxeo-filter conditions must be an object.');
	const known = [...Object.keys(CONDITIONS), 'group', 'expression'];
	for (const [key, value] of Object.entries(conditions)) {
		if (!known.includes(key)) throw new Error(`Unknown nuxeo-filter condition: ${key}.`);
		if (value !== undefined && typeof value !== (key === 'expression' ? 'function' : 'string'))
			throw new Error(`nuxeo-filter condition ${key} has the wrong type.`);
	}
	const values = (value: string, multiple: boolean) =>
		multiple ? value.trim().split(/\s*,\s*/) : [value];
	const checks: ((context: NuxeoFilterContext) => boolean)[] = Object.entries(CONDITIONS)
		.filter(([key]) => conditions[key as keyof typeof CONDITIONS])
		.map(([key, { check, multiple }]) => {
			const accepted = values(conditions[key as keyof typeof CONDITIONS]!, multiple);
			return (context) => accepted.some((value) => check(context.document, value));
		});
	if (conditions.expression) {
		const expression = conditions.expression;
		checks.push((context) => !!expression(context.document, context.user, NUXEO_FILTERS));
	}
	if (conditions.group) {
		const groups = values(conditions.group, true);
		checks.push((context) => groups.some((group) => NUXEO_FILTERS.isMember(context.user, group)));
	}
	return (context) => checks.every((check) => check(context));
}
