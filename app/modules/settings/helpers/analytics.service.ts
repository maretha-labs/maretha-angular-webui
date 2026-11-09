import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { forkJoin, from, map, mergeMap, Observable, of, switchMap, toArray } from 'rxjs';

export interface AuditFilters {
	principalName?: string;
	eventCategory?: string;
	eventIds?: string[];
	startDate?: string;
	endDate?: string;
}

export type AuditSortField = 'eventId' | 'eventDate' | 'principalName' | 'category';
export type AuditSortOrder = 'ASC' | 'DESC';

export interface AuditEntry {
	id: number;
	eventId: string;
	eventDate: string;
	principalName?: string;
	category?: string;
	comment?: string;
	docPath?: string;
	extended?: Record<string, unknown>;
}

export interface AuditPage {
	entries: AuditEntry[];
	resultsCount: number | null;
	isNextPageAvailable: boolean;
}

export interface BoundedAuditEntries {
	entries: AuditEntry[];
	complete: boolean;
	resultsCount: number | null;
}

export interface MetricRow {
	/** Explicit app-owned missing label; repository names are otherwise literal. */
	missingLabel?: true;
	actionParts?: { actor: string | null; task: string | null };
	key: string;
	value: number;
}

/** Bars grouped by label, one series each: stock chart-bar `labels`, `series` and `values`. */
export interface MetricGroups {
	labels: string[];
	series: { label: string; values: number[] }[];
}

export interface DocumentDistributionNode {
	name: string;
	count: number;
	children: DocumentDistributionNode[];
}

export type DocumentDistributionResult =
	| { status: 'ready'; nodes: DocumentDistributionNode[] }
	| { status: 'over-limit'; resultsCount: number; threshold: number }
	| { status: 'unconfigured' };

export interface SearchAnalyticsSummary {
	complete: boolean;
	resultsCount: number | null;
	providers: MetricRow[];
	hours: number[];
	resultRanges: MetricRow[];
	popularTerms: MetricRow[];
	pageRanges: MetricRow[];
	filters: MetricRow[];
}

export interface WorkflowAnalyticsSummary {
	complete: boolean;
	resultsCount: number | null;
	averageWorkflowDurationMs: number | null;
	initiators: MetricRow[];
	actions: MetricRow[];
	taskDurations: MetricRow[];
}

export interface DistributionOptions {
	includeHidden?: boolean;
	includeDeleted?: boolean;
	includeVersion?: boolean;
	onlyFolder?: boolean;
}
export interface RepositoryAnalyticsSummary {
	documents: number;
	downloads: { uid: string; title: string; value: number }[];
	types: MetricRow[];
	creators: MetricRow[];
	created: MetricRow[];
	modified: MetricRow[];
	mimeTypes: MetricRow[];
}

@Injectable({
	providedIn: 'root',
})
export class AnalyticsService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly defaultHeaders = { headers: new HttpHeaders({ properties: '*' }) };

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly httpClient: HttpClient) {}

	// --------------------------------------------------------------------------------------------------
	getDocumentCount(): Observable<number> {
		return this.nxqlCount(`SELECT * FROM Document WHERE ecm:isVersion = 0 AND ecm:isTrashed = 0`);
	}

	// --------------------------------------------------------------------------------------------------
	getFolderCount(): Observable<number> {
		return this.nxqlCount(
			`SELECT * FROM Document WHERE ecm:mixinType = 'Folderish' AND ecm:isVersion = 0 AND ecm:isTrashed = 0`,
		);
	}

	// --------------------------------------------------------------------------------------------------
	getUserCount(): Observable<number> {
		return this.httpClient
			.get<any>(`${this.apiUrl}/user/search?q=*&pageSize=1&currentPageIndex=0`)
			.pipe(map((x) => x.resultsCount ?? 0));
	}

	getUserSuggestions(query: string): Observable<string[]> {
		return this.httpClient
			.get<{ entries?: { id?: string; username?: string }[] }>(`${this.apiUrl}/user/search`, {
				params: { q: query, pageSize: '10', currentPageIndex: '0' },
			})
			.pipe(
				map((response) =>
					(response.entries ?? [])
						.map((entry) => entry.username ?? entry.id)
						.filter((name): name is string => typeof name === 'string' && name.length > 0),
				),
			);
	}

	// --------------------------------------------------------------------------------------------------
	getDocumentTypeDistribution(): Observable<{ type: string; count: number }[]> {
		return this.httpClient
			.get<{ doctypes: Record<string, unknown> }>(`${this.apiUrl}/config/types`)
			.pipe(
				switchMap((metadata) =>
					from(
						Object.keys(metadata.doctypes).filter((type) => /^[A-Za-z][A-Za-z0-9_]*$/.test(type)),
					),
				),
				mergeMap(
					(type) =>
						this.nxqlCount(
							`SELECT * FROM Document WHERE ecm:primaryType = '${type}' AND ecm:isVersion = 0 AND ecm:isProxy = 0 AND ecm:isTrashed = 0`,
						).pipe(map((count) => ({ type, count }))),
					4,
				),
				toArray(),
				map((results) =>
					results.filter((result) => result.count > 0).sort((a, b) => b.count - a.count),
				),
			);
	}

	// Mirrors nuxeo-repository-data in the reference Repository Analytics view.
	getMimeTypeDistribution(startDate: string, endDate: string): Observable<MetricRow[]> {
		return this.repositoryDistribution('file:content.mime-type', startDate, endDate);
	}

	getRepositoryDocumentTypeDistribution(
		startDate: string,
		endDate: string,
	): Observable<MetricRow[]> {
		return this.repositoryDistribution('ecm:primaryType', startDate, endDate);
	}

	private repositoryDistribution(
		field: string,
		startDate: string,
		endDate: string,
	): Observable<MetricRow[]> {
		return this.httpClient
			.post<{
				aggregations?: { by?: { buckets?: { key?: unknown; doc_count?: unknown }[] } };
			}>(`${environment.nuxeoUrl}/site/es/nuxeo/_search`, {
				query: {
					bool: {
						must: [{ range: { 'dc:created': { gte: startDate, lte: endDate } } }],
					},
				},
				size: 0,
				aggs: { by: { terms: { field, size: 10 } } },
			})
			.pipe(
				map((response) =>
					(response.aggregations?.by?.buckets ?? []).flatMap((bucket) =>
						typeof bucket.key === 'string' && typeof bucket.doc_count === 'number'
							? [{ key: bucket.key, value: bucket.doc_count }]
							: [],
					),
				),
			);
	}

	getDocumentDistribution(
		path: string,
		maxDepth: number,
		options: DistributionOptions = {},
	): Observable<DocumentDistributionResult> {
		const scope = normalizedDistributionPath(path);
		if (!scope) return of({ status: 'ready', nodes: [] });
		return this.documentDistributionThreshold().pipe(
			switchMap((threshold) => {
				if (threshold === null) return of({ status: 'unconfigured' } as const);
				return (threshold === 0 ? of(0) : this.documentDistributionScopeCount(scope)).pipe(
					switchMap((resultsCount) => {
						if (threshold > 0 && resultsCount >= threshold)
							return of({ status: 'over-limit', resultsCount, threshold } as const);
						return this.httpClient
							.post<{
								aggregations?: { subLevel?: { buckets?: unknown[] } };
							}>(
								`${environment.nuxeoUrl}/site/es/_all/doc/_search`,
								documentDistributionQuery(scope, maxDepth, options),
							)
							.pipe(
								map((response) => ({
									status: 'ready' as const,
									nodes: distributionNodes(response.aggregations?.subLevel?.buckets ?? []),
								})),
							);
					}),
				);
			}),
		);
	}

	private documentDistributionThreshold(): Observable<number | null> {
		return this.httpClient
			.get(`${environment.nuxeoUrl}/ui/config.jsp`, { responseType: 'text' })
			.pipe(map(distributionThreshold));
	}

	private documentDistributionScopeCount(path: string): Observable<number> {
		return this.httpClient
			.get<{ resultsCount?: number }>(`${this.apiUrl}/search/pp/nxql_search/execute`, {
				headers: new HttpHeaders({
					'Content-Type': 'application/json',
					accept: 'text/plain,application/json',
					'fetch-document': 'properties',
				}),
				params: {
					currentPageIndex: '0',
					pageSize: '1',
					queryParams: documentDistributionScopeQuery(path),
				},
			})
			.pipe(map((response) => response.resultsCount ?? 0));
	}

	// --------------------------------------------------------------------------------------------------
	getActivityOverTime(days: number): Observable<{ date: string; count: number }[]> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days + 1);
		startDate.setHours(0, 0, 0, 0);

		const endDate = new Date();
		const startIso = startDate.toISOString().substring(0, 10);
		const endIso = endDate.toISOString().substring(0, 10);
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

		const payload = {
			query: {
				bool: {
					must: [
						{ term: { category: 'eventDocumentCategory' } },
						{ range: { eventDate: { gte: startIso } } },
					],
				},
			},
			size: 0,
			aggs: {
				by: {
					date_histogram: {
						field: 'eventDate',
						interval: 'day',
						format: 'yyyy-MM-dd',
						min_doc_count: 0,
						time_zone: tz,
						extended_bounds: { min: startIso, max: endIso },
					},
				},
			},
		};

		return this.httpClient.post<any>(`${environment.nuxeoUrl}/site/es/audit/_search`, payload).pipe(
			map((response) => {
				const buckets: any[] = response?.aggregations?.by?.buckets ?? [];
				return buckets.map((b) => ({ date: b.key_as_string, count: b.doc_count }));
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getTopContributors(limit = 10): Observable<{ user: string; count: number }[]> {
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - 90);
		startDate.setHours(0, 0, 0, 0);
		const startIso = startDate.toISOString().substring(0, 10);

		const payload = {
			query: {
				bool: {
					must: [
						{ term: { category: 'eventDocumentCategory' } },
						{ range: { eventDate: { gte: startIso } } },
					],
				},
			},
			size: 0,
			aggs: {
				by: {
					terms: { field: 'principalName', size: limit + 1 },
				},
			},
		};

		return this.httpClient.post<any>(`${environment.nuxeoUrl}/site/es/audit/_search`, payload).pipe(
			map((response) => {
				const buckets: any[] = response?.aggregations?.by?.buckets ?? [];
				return buckets
					.filter((b) => b.key !== 'system')
					.map((b) => ({ user: b.key, count: b.doc_count }))
					.sort((a, b) => b.count - a.count)
					.slice(0, limit);
			}),
		);
	}

	getAuditEvents(
		filters: AuditFilters = {},
		currentPageIndex = 0,
		pageSize = 40,
		sortBy?: AuditSortField,
		sortOrder?: AuditSortOrder,
	): Observable<AuditPage> {
		const namedQueryParams: Record<string, string> = {};
		// EVENTS_VIEW uses the BasicAuditSearch document model. Automation writes these
		// values with DocumentHelper, so property names must be schema-qualified.
		if (filters.principalName)
			namedQueryParams['basicauditsearch:principalName'] = filters.principalName;
		if (filters.eventCategory)
			namedQueryParams['basicauditsearch:eventCategory'] = filters.eventCategory;
		if (filters.eventIds?.length)
			namedQueryParams['basicauditsearch:eventIds'] = filters.eventIds.join();
		if (filters.startDate) namedQueryParams['basicauditsearch:startDate'] = filters.startDate;
		if (filters.endDate) namedQueryParams['basicauditsearch:endDate'] = filters.endDate;
		return this.httpClient
			.post<AuditPage>(`${this.apiUrl}/automation/Audit.QueryWithPageProvider`, {
				params: {
					providerName: 'EVENTS_VIEW',
					namedQueryParams,
					currentPageIndex,
					pageSize,
					...(sortBy ? { sortBy, sortOrder: sortOrder ?? 'ASC' } : {}),
				},
			})
			.pipe(
				map((page) => ({
					entries: page.entries ?? [],
					resultsCount:
						typeof page.resultsCount === 'number' && page.resultsCount >= 0
							? page.resultsCount
							: null,
					isNextPageAvailable: page.isNextPageAvailable === true,
				})),
			);
	}

	// Stock nuxeo-search-data aggregations run on the server, independent of audit row count.
	getSearchAnalytics(startDate: string, endDate: string): Observable<SearchAnalyticsSummary> {
		return this.aggregate(
			'audit',
			[{ term: { eventId: 'search' } }, ...dateTerms('eventDate', startDate, endDate)],
			{
				providers: terms('extended.pageProviderName'),
				hours: {
					date_histogram: {
						field: 'eventDate',
						interval: 'hour',
						format: 'HH',
						min_doc_count: 0,
						time_zone: browserTimezone(),
					},
				},
				resultRanges: {
					range: {
						field: 'extended.resultsCount',
						ranges: [
							{ key: 'No result', to: 1 },
							{ key: 'Less than 50', from: 1, to: 50 },
							{ key: '51 to 200', from: 51, to: 200 },
							{ key: '201 to 1000', from: 201, to: 1000 },
							{ key: 'More than 1000', from: 1001 },
						],
					},
				},
				popularTerms: terms('extended.searchDocumentModel.properties.defaults:ecm_fulltext', 5),
				pageRanges: {
					range: {
						field: 'extended.pageIndex',
						ranges: [
							{ key: 'First page', from: 0, to: 1 },
							{ key: 'Page 2', from: 1, to: 2 },
							{ key: 'Pages 3 to 5', from: 2, to: 5 },
							{ key: 'Pages 6 to 10', from: 6, to: 10 },
							{ key: 'After 10 pages', from: 10 },
						],
					},
				},
				filters: terms('extended.searchFields', 5),
			},
		).pipe(
			map((response) => {
				const aggs = response.aggregations;
				const hours = Array<number>(24).fill(0);
				for (const bucket of aggs.hours?.buckets ?? []) {
					const hour = Number(bucket.key_as_string);
					if (hour >= 0 && hour < 24) hours[hour] += bucket.doc_count;
				}
				return {
					complete: true,
					resultsCount: hitCount(response),
					providers: metricRows(aggs.providers),
					hours,
					resultRanges: metricRows(aggs.resultRanges),
					popularTerms: metricRows(aggs.popularTerms),
					pageRanges: metricRows(aggs.pageRanges),
					filters: metricRows(aggs.filters),
				};
			}),
		);
	}

	getWorkflowAnalytics(
		workflow: string,
		startDate: string,
		endDate: string,
	): Observable<WorkflowAnalyticsSummary> {
		const scope = [
			{ term: { 'extended.modelName': workflow } },
			...dateTerms('eventDate', startDate, endDate),
		];
		return this.aggregate('audit_wf', scope, {
			finished: {
				filter: { term: { eventId: 'afterWorkflowFinish' } },
				aggs: { duration: { avg: { field: 'extended.timeSinceWfStarted' } } },
			},
			started: {
				filter: { term: { eventId: 'afterWorkflowStarted' } },
				aggs: { by: terms('extended.workflowInitiator') },
			},
			tasks: {
				filter: { term: { eventId: 'afterWorkflowTaskEnded' } },
				aggs: {
					actors: { ...terms('extended.taskActor'), aggs: { by: terms('extended.taskName') } },
					duration: {
						...terms('extended.taskActor'),
						aggs: { metrics: { avg: { field: 'extended.timeSinceTaskStarted' } } },
					},
				},
			},
		}).pipe(
			map((response) => {
				const a = response.aggregations;
				return {
					complete: true,
					resultsCount: hitCount(response),
					averageWorkflowDurationMs: a.finished?.duration?.value ?? null,
					initiators: metricRows(a.started?.by),
					actions: (a.tasks?.actors?.buckets ?? []).flatMap((actor: any) =>
						(actor.by?.buckets ?? []).map((task: any) => ({
							key: `${actor.key} · ${task.key}`,
							value: task.doc_count,
							actionParts: { actor: String(actor.key), task: String(task.key) },
						})),
					),
					taskDurations: metricRows(a.tasks?.duration, true),
				};
			}),
		);
	}

	getRepositoryAnalytics(
		startDate: string,
		endDate: string,
	): Observable<RepositoryAnalyticsSummary> {
		return forkJoin({
			content: this.aggregate('_all', dateTerms('dc:created', startDate, endDate), {
				documents: { cardinality: { field: 'ecm:uuid' } },
				types: terms('ecm:primaryType'),
				creators: terms('dc:creator'),
				created: weekly('dc:created', startDate, endDate),
				mimeTypes: terms('file:content.mime-type'),
			}),
			modified: this.aggregate('_all', dateTerms('dc:modified', startDate, endDate), {
				by: weekly('dc:modified', startDate, endDate),
			}),
			downloads: this.aggregate(
				'audit',
				[
					{ term: { eventId: 'download' } },
					{ term: { 'extended.downloadReason': 'download' } },
					...dateTerms('eventDate', startDate, endDate),
				],
				{ by: terms('docUUID') },
			),
		}).pipe(
			switchMap(({ content, modified, downloads }) => {
				const rows = metricRows(downloads.aggregations.by);
				const ids = rows.map((row) => `'${row.key.replace(/'/g, "\\'")}'`).join(',');
				const documents = ids
					? this.httpClient.get<any>(`${this.apiUrl}/search/lang/NXQL/execute`, {
							params: { query: `SELECT * FROM Document WHERE ecm:uuid IN (${ids})`, pageSize: 10 },
							headers: { properties: 'dublincore,common' },
						})
					: of({ entries: [] });
				return documents.pipe(
					map((docs) => ({
						documents: content.aggregations.documents?.value ?? 0,
						types: metricRows(content.aggregations.types),
						creators: metricRows(content.aggregations.creators),
						created: metricRows(content.aggregations.created),
						modified: metricRows(modified.aggregations.by),
						mimeTypes: metricRows(content.aggregations.mimeTypes),
						downloads: (docs.entries ?? []).map((doc: any) => ({
							uid: doc.uid,
							title: doc.title,
							value: rows.find((row) => row.key === doc.uid)?.value ?? 0,
						})),
					})),
				);
			}),
		);
	}

	getDistributionPaths(path: string): Observable<string[]> {
		const value = path.replace(/\/+$/, '');
		return this.httpClient
			.get<any>(`${this.apiUrl}/path${value}`, { headers: { properties: 'dublincore' } })
			.pipe(
				switchMap((scope) =>
					this.httpClient.get<any>(`${this.apiUrl}/search/lang/NXQL/execute`, {
						params: {
							query: `SELECT * FROM Document WHERE ecm:mixinType = 'Folderish' AND ecm:mixinType != 'HiddenInNavigation' AND ecm:isTrashed = 0 AND ecm:isVersion = 0 AND ecm:parentId = '${String(scope.uid).replace(/'/g, "\\'")}'`,
							pageSize: 50,
						},
					}),
				),
				map((response) => (response.entries ?? []).map((doc: any) => `${doc.path}/`)),
			);
	}

	private aggregate(
		index: string,
		must: unknown[],
		aggs: Record<string, unknown>,
	): Observable<any> {
		return this.httpClient
			.post<any>(`${environment.nuxeoUrl}/site/es/${index}/_search`, {
				size: 0,
				query: { bool: { must } },
				aggs,
			})
			.pipe(
				map((response) => {
					if (!response?.aggregations || response.timed_out || response._shards?.failed > 0)
						throw new Error('Incomplete analytics aggregation response');
					return response;
				}),
			);
	}

	getWorkflowModels(): Observable<{ id: string; label: string }[]> {
		return this.httpClient
			.get<{ entries?: { name: string; title?: string }[] }>(`${this.apiUrl}/workflowModel`)
			.pipe(
				map((response) =>
					(response.entries ?? []).map((workflow) => ({
						id: workflow.name,
						label: workflow.title || workflow.name,
					})),
				),
			);
	}

	// --------------------------------------------------------------------------------------------------
	private nxqlCount(query: string): Observable<number> {
		const url = `${this.apiUrl}/search/lang/NXQL/execute?query=${encodeURIComponent(query)}&pageSize=1&currentPageIndex=0`;
		return this.httpClient.get<any>(url, this.defaultHeaders).pipe(map((x) => x.resultsCount ?? 0));
	}
}

function normalizedDistributionPath(path: string): string {
	const normalized = path.trim();
	return normalized && normalized.startsWith('/') ? `${normalized.replace(/\/+$/, '')}/` : '';
}

function distributionThreshold(configScript: string): number | null {
	const match = /Nuxeo\.UI\.config\s*=\s*(\{.*?\});/s.exec(configScript);
	if (!match) return null;
	const config = tryJson(match[1]);
	if (!config || typeof config !== 'object') return null;
	const raw = (config as { analytics?: { documentDistribution?: { disableThreshold?: unknown } } })
		.analytics?.documentDistribution?.disableThreshold;
	if (raw === undefined || raw === null || raw === '' || raw === false || raw === 0 || raw === '0')
		return 0;
	const threshold = numberValue(
		(config as { analytics?: { documentDistribution?: { disableThreshold?: unknown } } }).analytics
			?.documentDistribution?.disableThreshold,
	);
	return threshold !== null && threshold > 0 ? threshold : null;
}

function documentDistributionScopeQuery(path: string): string {
	return (
		'SELECT * FROM Document ' +
		"WHERE ecm:mixinType != 'HiddenInNavigation' " +
		'AND ecm:isProxy = 0 AND ' +
		'ecm:isVersion = 0 AND ' +
		'ecm:isTrashed = 0 AND ' +
		`ecm:path STARTSWITH '${path.replace(/'/g, "\\'")}'`
	);
}

export function documentDistributionQuery(
	path: string,
	maxDepth: number,
	options: DistributionOptions = {},
): Record<string, unknown> {
	const pathDepth = path.replace(/\/$/, '').split('/').length;
	const depth = Math.min(20, Math.max(1, Math.floor(maxDepth)));
	let subLevel: Record<string, unknown> = {
		terms: {
			field: `ecm:path@level${pathDepth - 1 + depth}`,
			size: 1000,
			order: { _count: 'desc' },
		},
	};
	for (let current = pathDepth - 2 + depth; current >= pathDepth; current--) {
		subLevel = {
			terms: {
				field: `ecm:path@level${current}`,
				size: 1000,
				order: { _count: 'desc' },
			},
			aggs: { subLevel },
		};
	}
	return {
		query: {
			bool: {
				must: { match_all: {} },
				must_not: [
					...(!options.includeHidden ? [{ term: { 'ecm:mixinType': 'HiddenInNavigation' } }] : []),
					...(!options.includeDeleted ? [{ term: { 'ecm:isTrashed': true } }] : []),
				],
				filter: [
					...(!options.includeVersion ? [{ term: { 'ecm:isVersion': false } }] : []),
					...(options.onlyFolder ? [{ term: { 'ecm:mixinType': 'Folderish' } }] : []),
					...path
						.replace(/\/$/, '')
						.split('/')
						.slice(1)
						.map((segment, index) => ({
							term: { [`ecm:path@level${index + 1}`]: segment },
						})),
				],
			},
		},
		size: 0,
		aggs: { subLevel },
	};
}

function distributionNodes(buckets: unknown[]): DocumentDistributionNode[] {
	return buckets.flatMap((bucket) => {
		if (!bucket || typeof bucket !== 'object') return [];
		const record = bucket as {
			key?: unknown;
			doc_count?: unknown;
			subLevel?: { buckets?: unknown[] };
		};
		if (typeof record.key !== 'string' || typeof record.doc_count !== 'number') return [];
		return [
			{
				name: record.key,
				count: record.doc_count,
				children: distributionNodes(record.subLevel?.buckets ?? []),
			},
		];
	});
}

export function summarizeSearchAnalytics(result: BoundedAuditEntries): SearchAnalyticsSummary {
	const entries = result.complete ? result.entries : [];
	const extended = (entry: AuditEntry) => entry.extended ?? {};
	return {
		complete: result.complete,
		resultsCount: result.resultsCount,
		providers: countBy(entries, (entry) => stringValue(extended(entry)['pageProviderName']) || ''),
		hours: Array.from(
			{ length: 24 },
			(_, hour) => entries.filter((entry) => new Date(entry.eventDate).getHours() === hour).length,
		),
		resultRanges: countHalfOpenRanges(
			entries,
			(entry) => numberValue(extended(entry)['resultsCount']),
			[
				['No result', -Infinity, 1],
				['Less than 50', 1, 50],
				['51 to 200', 51, 200],
				['201 to 1000', 201, 1000],
				['More than 1000', 1001, Infinity],
			],
		),
		popularTerms: countBy(
			entries.filter((entry) => fullTextTerm(extended(entry)) !== null),
			(entry) => fullTextTerm(extended(entry))!,
		).slice(0, 5),
		pageRanges: countHalfOpenRanges(entries, (entry) => numberValue(extended(entry)['pageIndex']), [
			['First page', 0, 1],
			['Page 2', 1, 2],
			['Pages 3 to 5', 2, 5],
			['Pages 6 to 10', 6, 10],
			['After 10 pages', 10, Infinity],
		]),
		filters: countByValues(entries, (entry) => filterValues(extended(entry))).slice(0, 5),
	};
}

export function summarizeWorkflowAnalytics(
	workflow: string,
	results: BoundedAuditEntries[],
): WorkflowAnalyticsSummary {
	const complete = results.every((result) => result.complete);
	const entries = complete
		? results.flatMap((result) =>
				result.entries.filter((entry) => stringValue(entry.extended?.['modelName']) === workflow),
			)
		: [];
	const finish = entries.filter((entry) => entry.eventId === 'afterWorkflowFinish');
	const tasks = entries.filter((entry) => entry.eventId === 'afterWorkflowTaskEnded');
	const durations = finish
		.map((entry) => numberValue(entry.extended?.['timeSinceWfStarted']))
		.filter(isNumber);
	return {
		complete,
		resultsCount: results.every((result) => result.resultsCount !== null)
			? results.reduce((total, result) => total + (result.resultsCount ?? 0), 0)
			: null,
		averageWorkflowDurationMs: durations.length
			? durations.reduce((total, value) => total + value, 0) / durations.length
			: null,
		initiators: countBy(
			entries.filter((entry) => entry.eventId === 'afterWorkflowStarted'),
			(entry) => stringValue(entry.extended?.['workflowInitiator']) || '',
		),
		actions: countBy(tasks, (entry) =>
			JSON.stringify([
				stringValue(entry.extended?.['taskActor']),
				stringValue(entry.extended?.['taskName']),
			]),
		).map((row) => {
			const [actor, task] = JSON.parse(row.key) as [string | null, string | null];
			return actor && task
				? { key: `${actor} · ${task}`, value: row.value, actionParts: { actor, task } }
				: { ...row, actionParts: { actor, task } };
		}),
		taskDurations: averageBy(tasks, 'taskActor', 'timeSinceTaskStarted'),
	};
}

/**
 * Stock nuxeo-workflow-analytics "Actions per User": a group of bars per task, one bar per user,
 * users and tasks in order of their total actions.
 */
export function groupWorkflowActions(
	rows: readonly MetricRow[],
	taskLabel: (task: string) => string,
	unknownLabel: string,
): MetricGroups {
	const byActor = new Map<string, Map<string, number>>();
	const actorTotals = new Map<string, number>();
	const taskTotals = new Map<string, number>();
	for (const { actionParts, value } of rows) {
		if (!actionParts) continue;
		const actor = actionParts.actor ?? '';
		const task = actionParts.task ?? '';
		const tasks = byActor.get(actor) ?? new Map<string, number>();
		tasks.set(task, (tasks.get(task) ?? 0) + value);
		byActor.set(actor, tasks);
		actorTotals.set(actor, (actorTotals.get(actor) ?? 0) + value);
		taskTotals.set(task, (taskTotals.get(task) ?? 0) + value);
	}
	const byTotal = (totals: Map<string, number>) =>
		[...totals.keys()].sort((left, right) => (totals.get(right) ?? 0) - (totals.get(left) ?? 0));
	const tasks = byTotal(taskTotals);
	return {
		labels: tasks.map((task) => (task ? taskLabel(task) : unknownLabel)),
		series: byTotal(actorTotals).map((actor) => ({
			label: actor || unknownLabel,
			values: tasks.map((task) => byActor.get(actor)?.get(task) ?? 0),
		})),
	};
}

type DurationFormatConstructor = new (
	locale: string,
	options: { style: 'narrow' },
) => { format(duration: Record<string, number>): string };

/**
 * Stock nuxeo-workflow-analytics `_asDuration`: whole days, hours, minutes and seconds without the
 * zero parts, such as "2h 8m 35s", here localized; empty below one second, as stock.
 */
export function formatAnalyticsDuration(milliseconds: number | null, locale: string): string {
	if (milliseconds === null || !Number.isFinite(milliseconds)) return '';
	const total = Math.floor(milliseconds / 1000);
	const parts = Object.entries({
		days: Math.floor(total / 86400),
		hours: Math.floor((total % 86400) / 3600),
		minutes: Math.floor((total % 3600) / 60),
		seconds: total % 60,
	}).filter(([, value]) => value > 0);
	if (!parts.length) return '';
	const DurationFormat = (Intl as unknown as { DurationFormat?: DurationFormatConstructor })
		.DurationFormat;
	if (DurationFormat)
		return new DurationFormat(locale, { style: 'narrow' }).format(Object.fromEntries(parts));
	return parts
		.map(([unit, value]) =>
			new Intl.NumberFormat(locale, {
				style: 'unit',
				unit: unit.slice(0, -1),
				unitDisplay: 'narrow',
			}).format(value),
		)
		.join(' ');
}

function countBy(entries: AuditEntry[], keyFor: (entry: AuditEntry) => string): MetricRow[] {
	const counts = new Map<string, number>();
	for (const entry of entries) counts.set(keyFor(entry), (counts.get(keyFor(entry)) ?? 0) + 1);
	return [...counts.entries()]
		.map(([key, value]) => ({ key, value, ...(key ? {} : { missingLabel: true as const }) }))
		.sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
}

function countHalfOpenRanges(
	entries: AuditEntry[],
	valueFor: (entry: AuditEntry) => number | null,
	ranges: [string, number, number][],
): MetricRow[] {
	return ranges.map(([key, from, to]) => ({
		key,
		value: entries.filter((entry) => {
			const value = valueFor(entry);
			return value !== null && value >= from && value < to;
		}).length,
	}));
}

function averageBy(entries: AuditEntry[], key: string, value: string): MetricRow[] {
	const values = new Map<string, number[]>();
	for (const entry of entries) {
		const group = stringValue(entry.extended?.[key]) || '';
		const duration = numberValue(entry.extended?.[value]);
		if (duration !== null) values.set(group, [...(values.get(group) ?? []), duration]);
	}
	return [...values.entries()]
		.map(([key, durations]) => ({
			key,
			...(key ? {} : { missingLabel: true as const }),
			value: durations.reduce((sum, item) => sum + item, 0) / durations.length,
		}))
		.sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
}

function fullTextTerm(extended: Record<string, unknown>): string | null {
	const model = extended['searchDocumentModel'];
	const value = typeof model === 'string' ? tryJson(model) : model;
	if (!value || typeof value !== 'object') return null;
	return stringValue(
		(value as { properties?: Record<string, unknown> }).properties?.['defaults:ecm_fulltext'],
	);
}

function filterValues(extended: Record<string, unknown>): string[] {
	const fields = extended['searchFields'];
	if (Array.isArray(fields)) return fields.map(String).filter((field) => field.trim());
	const field = stringValue(fields);
	return field ? [field] : [];
}

function countByValues(
	entries: AuditEntry[],
	valuesFor: (entry: AuditEntry) => string[],
): MetricRow[] {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		for (const value of valuesFor(entry)) counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([key, value]) => ({ key, value, ...(key ? {} : { missingLabel: true as const }) }))
		.sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
}

function tryJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function stringValue(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
	if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : null;
}

function isNumber(value: number | null): value is number {
	return value !== null;
}

function dateTerms(field: string, start: string, end: string): unknown[] {
	const range: Record<string, string> = {};
	if (start) range['gte'] = start;
	if (end) range['lte'] = end;
	return Object.keys(range).length ? [{ range: { [field]: range } }] : [];
}
function terms(field: string, size = 10) {
	return { terms: { field, size } };
}
function browserTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
function weekly(field: string, start: string, end: string) {
	return {
		date_histogram: {
			field,
			interval: 'week',
			format: 'yyyy-MM-dd',
			min_doc_count: 0,
			time_zone: browserTimezone(),
			...(start && end ? { extended_bounds: { min: start, max: end } } : {}),
		},
	};
}
function metricRows(aggregation: any, metric = false): MetricRow[] {
	return (aggregation?.buckets ?? []).map((bucket: any) => ({
		key: String(bucket.key_as_string ?? bucket.key),
		value: metric ? (bucket.metrics?.value ?? 0) : bucket.doc_count,
	}));
}
function hitCount(response: any): number | null {
	const total = response.hits?.total;
	return typeof total === 'number' ? total : (total?.value ?? null);
}
