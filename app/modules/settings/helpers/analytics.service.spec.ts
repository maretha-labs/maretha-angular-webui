import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
	AnalyticsService,
	summarizeWorkflowAnalytics,
	formatAnalyticsDuration,
	groupWorkflowActions,
	summarizeSearchAnalytics,
	documentDistributionQuery,
} from './analytics.service';
import { mimeTypeLabel } from './mime-type-labels';
describe('Analytics transport', () => {
	beforeEach(() =>
		TestBed.configureTestingModule({
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		}),
	);
	it('limits repository charts to ten buckets within the selected creation dates', () => {
		const service = TestBed.inject(AnalyticsService);
		const http = TestBed.inject(HttpTestingController);
		let types: unknown;
		let mimeTypes: unknown;
		service
			.getRepositoryDocumentTypeDistribution('2026-08-17', '2026-09-17')
			.subscribe((rows) => (types = rows));
		service
			.getMimeTypeDistribution('2026-08-17', '2026-09-17')
			.subscribe((rows) => (mimeTypes = rows));
		const requests = http.match((request) => request.url.endsWith('/site/es/nuxeo/_search'));
		expect(requests.length).toBe(2);
		for (const request of requests) {
			const field = request.request.body.aggs.by.terms.field;
			expect(request.request.body.query.bool.must).toEqual([
				{ range: { 'dc:created': { gte: '2026-08-17', lte: '2026-09-17' } } },
			]);
			expect(request.request.body.aggs.by.terms.size).toBe(10);
			request.flush({
				aggregations: {
					by: {
						buckets: [
							{ key: field === 'ecm:primaryType' ? 'File' : 'application/pdf', doc_count: 3 },
						],
					},
				},
			});
		}
		expect(types).toEqual([{ key: 'File', value: 3 }]);
		expect(mimeTypes).toEqual([{ key: 'application/pdf', value: 3 }]);
		expect(mimeTypeLabel('application/pdf')).toBe('PDF');
		expect(mimeTypeLabel('image/heic')).toBe('image/heic');
		http.verify();
	});
	it('counts custom types by exact primary type without inherited double counts', () => {
		let rows: { type: string; count: number }[] = [];
		TestBed.inject(AnalyticsService)
			.getDocumentTypeDistribution()
			.subscribe((value) => (rows = value));
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.endsWith('/config/types'))
			.flush({ doctypes: { File: {}, Contract: {} } });
		const requests = http.match((request) => request.url.includes('/search/lang/NXQL/execute'));
		expect(requests.length).toBe(2);
		for (const request of requests) {
			const query = new URL(request.request.url).searchParams.get('query');
			expect(query).toContain('ecm:primaryType =');
			expect(query).toContain('ecm:isProxy = 0');
			request.flush({ resultsCount: query?.includes("'Contract'") ? 2 : 1 });
		}
		expect(rows).toEqual([
			{ type: 'Contract', count: 2 },
			{ type: 'File', count: 1 },
		]);
		http.verify();
	});
	it('scopes Document Distribution to the selected path and hierarchy depth', () => {
		let distribution: any[] = [];
		TestBed.inject(AnalyticsService)
			.getDocumentDistribution('/default-domain/workspaces/', 2)
			.subscribe((value) => (distribution = value.status === 'ready' ? value.nodes : []));
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((item) => item.url.endsWith('/ui/config.jsp'))
			.flush(
				'Nuxeo.UI.config = {"analytics":{"documentDistribution":{"disableThreshold":"100"}}};',
			);
		const preflight = http.expectOne((item) => item.url.endsWith('/search/pp/nxql_search/execute'));
		expect(preflight.request.method).toBe('GET');
		expect(preflight.request.params.get('currentPageIndex')).toBe('0');
		expect(preflight.request.params.get('pageSize')).toBe('1');
		expect(preflight.request.params.get('queryParams')).toBe(
			"SELECT * FROM Document WHERE ecm:mixinType != 'HiddenInNavigation' AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0 AND ecm:path STARTSWITH '/default-domain/workspaces/'",
		);
		preflight.flush({ resultsCount: 3 });
		const request = http.expectOne((item) => item.url.endsWith('/site/es/_all/doc/_search'));
		expect(request.request.method).toBe('POST');
		expect(request.request.body).toEqual({
			query: {
				bool: {
					must: { match_all: {} },
					must_not: [
						{ term: { 'ecm:mixinType': 'HiddenInNavigation' } },
						{ term: { 'ecm:isTrashed': true } },
					],
					filter: [
						{ term: { 'ecm:isVersion': false } },
						{ term: { 'ecm:path@level1': 'default-domain' } },
						{ term: { 'ecm:path@level2': 'workspaces' } },
					],
				},
			},
			size: 0,
			aggs: {
				subLevel: {
					terms: {
						field: 'ecm:path@level3',
						size: 1000,
						order: { _count: 'desc' },
					},
					aggs: {
						subLevel: {
							terms: {
								field: 'ecm:path@level4',
								size: 1000,
								order: { _count: 'desc' },
							},
						},
					},
				},
			},
		});
		request.flush({
			aggregations: {
				subLevel: {
					buckets: [
						{
							key: 'team-a',
							doc_count: 3,
							subLevel: { buckets: [{ key: 'project', doc_count: 2 }] },
						},
					],
				},
			},
		});
		expect(distribution).toEqual([
			{ name: 'team-a', count: 3, children: [{ name: 'project', count: 2, children: [] }] },
		]);
		http.verify();
	});
	it('does not issue an aggregation when the server has no numeric distribution threshold', () => {
		let result: any;
		TestBed.inject(AnalyticsService)
			.getDocumentDistribution('/default-domain/', 1)
			.subscribe((value) => (result = value));
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((item) => item.url.endsWith('/ui/config.jsp'))
			.flush(
				'Nuxeo.UI.config = {"analytics":{"documentDistribution":{"disableThreshold":"${missing}"}}};',
			);
		expect(result).toEqual({ status: 'unconfigured' });
		http.expectNone((item) => item.url.includes('/search/pp/nxql_search/execute'));
		http.expectNone((item) => item.url.includes('/site/es/_all/doc/_search'));
		http.verify();
	});
	it('propagates disabled audit aggregation instead of fabricating an empty series', () => {
		const error = jasmine.createSpy('error');
		const next = jasmine.createSpy('next');
		TestBed.inject(AnalyticsService).getActivityOverTime(30).subscribe({ next, error });
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((request) => request.url.includes('/site/es/audit/'))
			.flush(
				{ message: 'Audit ElasticSearch passthrough is disabled' },
				{ status: 400, statusText: 'Bad Request' },
			);
		expect(next).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalled();
		http.verify();
	});
	it('uses complete server search aggregations for more than 1,000 events', () => {
		let summary: any;
		TestBed.inject(AnalyticsService)
			.getSearchAnalytics('2026-09-01', '2026-09-02')
			.subscribe((value) => (summary = value));
		const http = TestBed.inject(HttpTestingController);
		const request = http.expectOne((item) => item.url.endsWith('/site/es/audit/_search'));
		expect(request.request.body.size).toBe(0);
		expect(request.request.body.query.bool.must).toEqual([
			{ term: { eventId: 'search' } },
			{ range: { eventDate: { gte: '2026-09-01', lte: '2026-09-02' } } },
		]);
		expect(request.request.body.aggs.providers.terms.field).toBe('extended.pageProviderName');
		expect(request.request.body.aggs.popularTerms.terms).toEqual({
			field: 'extended.searchDocumentModel.properties.defaults:ecm_fulltext',
			size: 5,
		});
		expect(request.request.body.aggs.resultRanges.range.ranges[2]).toEqual({
			key: '51 to 200',
			from: 51,
			to: 200,
		});
		request.flush({
			hits: { total: 5000 },
			aggregations: {
				providers: { buckets: [{ key: 'default', doc_count: 5000 }] },
				hours: {
					buckets: [
						{ key_as_string: '09', doc_count: 2000 },
						{ key_as_string: '09', doc_count: 3000 },
					],
				},
				resultRanges: { buckets: [{ key: 'No result', doc_count: 200 }] },
				popularTerms: { buckets: [] },
				pageRanges: { buckets: [] },
				filters: { buckets: [] },
			},
		});
		expect(summary.complete).toBeTrue();
		expect(summary.resultsCount).toBe(5000);
		expect(summary.providers).toEqual([{ key: 'default', value: 5000 }]);
		expect(summary.hours[9]).toBe(5000);
		http.verify();
	});
	it('uses stock workflow index, model/event filters and task averages', () => {
		let summary: any;
		TestBed.inject(AnalyticsService)
			.getWorkflowAnalytics('ParallelDocumentReview', '2026-09-01', '2026-09-02')
			.subscribe((value) => (summary = value));
		const http = TestBed.inject(HttpTestingController);
		const request = http.expectOne((item) => item.url.endsWith('/site/es/audit_wf/_search'));
		expect(request.request.body.query.bool.must[0]).toEqual({
			term: { 'extended.modelName': 'ParallelDocumentReview' },
		});
		expect(request.request.body.aggs.tasks.aggs.duration.aggs.metrics.avg.field).toBe(
			'extended.timeSinceTaskStarted',
		);
		request.flush({
			aggregations: {
				finished: { duration: { value: 12000 } },
				started: { by: { buckets: [{ key: 'alice', doc_count: 2 }] } },
				tasks: {
					actors: { buckets: [{ key: 'bob', by: { buckets: [{ key: 'Review', doc_count: 3 }] } }] },
					duration: { buckets: [{ key: 'bob', metrics: { value: 6000 } }] },
				},
			},
		});
		expect(summary.averageWorkflowDurationMs).toBe(12000);
		expect(summary.taskDurations).toEqual([{ key: 'bob', value: 6000 }]);
		expect(summary.actions[0].value).toBe(3);
		http.verify();
	});
	it('filters repository cardinality, weekly charts and downloads using selected dates', () => {
		let summary: any;
		TestBed.inject(AnalyticsService)
			.getRepositoryAnalytics('2026-09-01', '2026-09-02')
			.subscribe((value) => (summary = value));
		const http = TestBed.inject(HttpTestingController);
		const requests = http.match((item) => item.url.endsWith('/_search'));
		expect(requests.length).toBe(3);
		for (const request of requests) {
			const body = request.request.body;
			if (body.aggs.documents) {
				expect(body.aggs.documents).toEqual({ cardinality: { field: 'ecm:uuid' } });
				expect(body.query.bool.must).toEqual([
					{ range: { 'dc:created': { gte: '2026-09-01', lte: '2026-09-02' } } },
				]);
				request.flush({
					aggregations: {
						documents: { value: 66 },
						types: { buckets: [{ key: 'File', doc_count: 66 }] },
						created: { buckets: [] },
					},
				});
			} else if (body.query.bool.must.some((term: any) => term.term?.eventId === 'download')) {
				expect(body.query.bool.must).toContain({ term: { 'extended.downloadReason': 'download' } });
				request.flush({ aggregations: { by: { buckets: [{ key: 'doc-1', doc_count: 5 }] } } });
			} else {
				expect(body.query.bool.must).toEqual([
					{ range: { 'dc:modified': { gte: '2026-09-01', lte: '2026-09-02' } } },
				]);
				request.flush({ aggregations: { by: { buckets: [] } } });
			}
		}
		http
			.expectOne((item) => item.url.endsWith('/search/lang/NXQL/execute'))
			.flush({ entries: [{ uid: 'doc-1', title: 'Downloaded document' }] });
		expect(summary.documents).toBe(66);
		expect(summary.downloads).toEqual([{ uid: 'doc-1', title: 'Downloaded document', value: 5 }]);
		http.verify();
	});
	it('binds all stock distribution inclusion options without changing hierarchy scope', () => {
		const query: any = documentDistributionQuery('/default-domain/', 2, {
			includeHidden: true,
			includeDeleted: true,
			includeVersion: true,
			onlyFolder: true,
		});
		expect(query.query.bool.must_not).toEqual([]);
		expect(query.query.bool.filter).toEqual([
			{ term: { 'ecm:mixinType': 'Folderish' } },
			{ term: { 'ecm:path@level1': 'default-domain' } },
		]);
	});
	it('uses the schema-qualified EVENTS_VIEW properties for every audit filter', () => {
		TestBed.inject(AnalyticsService)
			.getAuditEvents(
				{
					principalName: 'nobody',
					eventCategory: 'eventDocumentCategory',
					eventIds: ['documentCreated', 'documentModified'],
					startDate: '2026-09-01',
					endDate: '2026-09-02',
				},
				2,
				25,
			)
			.subscribe();
		const request = TestBed.inject(HttpTestingController).expectOne((item) =>
			item.url.endsWith('/automation/Audit.QueryWithPageProvider'),
		);
		expect(request.request.body).toEqual({
			params: {
				providerName: 'EVENTS_VIEW',
				namedQueryParams: {
					'basicauditsearch:principalName': 'nobody',
					'basicauditsearch:eventCategory': 'eventDocumentCategory',
					'basicauditsearch:eventIds': 'documentCreated,documentModified',
					'basicauditsearch:startDate': '2026-09-01',
					'basicauditsearch:endDate': '2026-09-02',
				},
				currentPageIndex: 2,
				pageSize: 25,
			},
		});
		request.flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		TestBed.inject(HttpTestingController).verify();
	});
	it('sends the automation operation sorting parameters for a paged audit request', () => {
		TestBed.inject(AnalyticsService).getAuditEvents({}, 1, 40, 'principalName', 'ASC').subscribe();
		const request = TestBed.inject(HttpTestingController).expectOne((item) =>
			item.url.endsWith('/automation/Audit.QueryWithPageProvider'),
		);
		expect(request.request.body.params).toEqual({
			providerName: 'EVENTS_VIEW',
			namedQueryParams: {},
			currentPageIndex: 1,
			pageSize: 40,
			sortBy: 'principalName',
			sortOrder: 'ASC',
		});
		request.flush({ entries: [], resultsCount: 0, isNextPageAvailable: false });
		TestBed.inject(HttpTestingController).verify();
	});
	it('maps source workflow events and durations only for the selected model', () => {
		const complete = (entries: any[]) => ({
			entries,
			resultsCount: entries.length,
			complete: true,
		});
		const summary = summarizeWorkflowAnalytics('ParallelDocumentReview', [
			complete([
				{
					id: 1,
					eventId: 'afterWorkflowFinish',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { modelName: 'ParallelDocumentReview', timeSinceWfStarted: 6000 },
				},
				{
					id: 2,
					eventId: 'afterWorkflowFinish',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { modelName: 'Other', timeSinceWfStarted: 1000 },
				},
			]),
			complete([
				{
					id: 3,
					eventId: 'afterWorkflowStarted',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { modelName: 'ParallelDocumentReview', workflowInitiator: 'alice' },
				},
			]),
			complete([
				{
					id: 4,
					eventId: 'afterWorkflowTaskEnded',
					eventDate: '2026-09-01T00:00:00Z',
					extended: {
						modelName: 'ParallelDocumentReview',
						taskActor: 'alice',
						taskName: 'Review',
						timeSinceTaskStarted: '3000',
					},
				},
			]),
		]);
		expect(summary.complete).toBeTrue();
		expect(summary.averageWorkflowDurationMs).toBe(6000);
		expect(summary.initiators).toEqual([{ key: 'alice', value: 1 }]);
		expect(summary.actions).toEqual([
			{ key: 'alice · Review', value: 1, actionParts: { actor: 'alice', task: 'Review' } },
		]);
		expect(summary.taskDurations).toEqual([{ key: 'alice', value: 3000 }]);
	});
	it('groups workflow actions per task with a bar per user, as stock Actions per User', () => {
		const row = (actor: string | null, task: string | null, value: number) => ({
			key: `${actor} · ${task}`,
			value,
			actionParts: { actor, task },
		});
		const groups = groupWorkflowActions(
			[
				row('gpt', 'wf.validate', 1),
				row('audit-member', 'wf.choose', 15),
				row('gpt', 'wf.choose', 10),
				row('audit-member', 'wf.validate', 7),
				row(null, 'wf.validate', 2),
			],
			(task) => task.toUpperCase(),
			'Unknown',
		);
		expect(groups).toEqual({
			labels: ['WF.CHOOSE', 'WF.VALIDATE'],
			series: [
				{ label: 'audit-member', values: [15, 7] },
				{ label: 'gpt', values: [10, 1] },
				{ label: 'Unknown', values: [0, 2] },
			],
		});
	});
	it('formats durations as stock _asDuration, localized and without zero parts', () => {
		expect(formatAnalyticsDuration(7715_999, 'en')).toBe('2h 8m 35s');
		expect(formatAnalyticsDuration(16_796_696.6, 'en')).toBe('4h 39m 56s');
		expect(formatAnalyticsDuration(5_688.462, 'en')).toBe('5s');
		expect(formatAnalyticsDuration(90_061_000, 'en')).toBe('1d 1h 1m 1s');
		expect(formatAnalyticsDuration(999, 'en')).toBe('');
		expect(formatAnalyticsDuration(null, 'en')).toBe('');
	});
	it('uses source half-open Search ranges and counts every selected filter field', () => {
		const summary = summarizeSearchAnalytics({
			complete: true,
			resultsCount: 5,
			entries: [
				{
					id: 1,
					eventId: 'search',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { resultsCount: 0, pageIndex: 0, searchFields: ['dc:title', 'dc:creator'] },
				},
				{
					id: 2,
					eventId: 'search',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { resultsCount: 50, pageIndex: 5, searchFields: ['dc:title'] },
				},
				{
					id: 3,
					eventId: 'search',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { resultsCount: 51, pageIndex: 10 },
				},
				{
					id: 4,
					eventId: 'search',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { resultsCount: null, pageIndex: null },
				},
				{
					id: 5,
					eventId: 'search',
					eventDate: '2026-09-01T00:00:00Z',
					extended: { resultsCount: true, pageIndex: false },
				},
			],
		});
		expect(summary.resultRanges).toEqual([
			{ key: 'No result', value: 1 },
			{ key: 'Less than 50', value: 0 },
			{ key: '51 to 200', value: 1 },
			{ key: '201 to 1000', value: 0 },
			{ key: 'More than 1000', value: 0 },
		]);
		expect(summary.pageRanges).toEqual([
			{ key: 'First page', value: 1 },
			{ key: 'Page 2', value: 0 },
			{ key: 'Pages 3 to 5', value: 0 },
			{ key: 'Pages 6 to 10', value: 0 },
			{ key: 'After 10 pages', value: 1 },
		]);
		expect(summary.filters).toEqual([
			{ key: 'dc:title', value: 2 },
			{ key: 'dc:creator', value: 1 },
		]);
		TestBed.inject(HttpTestingController).verify();
	});
	it('rejects timed-out server aggregations instead of displaying partial totals', () => {
		const error = jasmine.createSpy('error');
		TestBed.inject(AnalyticsService).getSearchAnalytics('', '').subscribe({ error });
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((item) => item.url.endsWith('/site/es/audit/_search'))
			.flush({ timed_out: true, aggregations: {} });
		expect(error).toHaveBeenCalled();
		http.verify();
	});
	it('rejects responses without aggregation data', () => {
		const error = jasmine.createSpy('error');
		TestBed.inject(AnalyticsService).getSearchAnalytics('', '').subscribe({ error });
		const http = TestBed.inject(HttpTestingController);
		http
			.expectOne((item) => item.url.endsWith('/site/es/audit/_search'))
			.flush({ hits: { total: 10000 } });
		expect(error).toHaveBeenCalled();
		http.verify();
	});
});
