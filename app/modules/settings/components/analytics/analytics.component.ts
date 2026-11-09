import { inject as injectI18n, effect, DestroyRef } from '@angular/core';
import { WebUiIcons, WebUiMessages } from '@maretha/webui-sdk';
import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { WebUiNumberPipe } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	ChangeDetectorRef,
	Component,
	OnInit,
	ChangeDetectionStrategy,
	computed,
	input,
	signal,
} from '@angular/core';
import { Chart, registerables } from 'chart.js';
import { ChartData, ChartOptions } from 'chart.js';
import { catchError, forkJoin, map, of, Subject, switchMap, takeUntil } from 'rxjs';
import { OnDestroy } from '@angular/core';
import {
	AnalyticsService,
	formatAnalyticsDuration,
	groupWorkflowActions,
	MetricGroups,
} from '../../helpers/analytics.service';
import { mimeTypeLabel } from '../../helpers/mime-type-labels';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { BaseChartDirective } from 'ng2-charts';
import { NgSelectModule } from '@ng-select/ng-select';

import { ADMIN_ANALYTICS_ICONS } from './admin-analytics-icons';
import { AnalyticsMetricComponent } from './analytics-metric.component';
import { DistributionChartComponent } from './distribution-chart.component';
import { WebUiIconComponent } from '@maretha/webui-sdk';
import { FormsModule } from '@angular/forms';
import {
	DocumentDistributionNode,
	DocumentDistributionResult,
	SearchAnalyticsSummary,
	WorkflowAnalyticsSummary,
	MetricRow,
	RepositoryAnalyticsSummary,
	DistributionOptions,
} from '../../helpers/analytics.service';

Chart.register(...registerables);

let nextWorkflowSelectId = 0;

const CHART_TOKENS = [
	'--maretha-style-color-primary',
	'--maretha-style-color-accent',
	'--maretha-style-color-success',
	'--maretha-style-color-info',
];

@Component({
	selector: 'nx-analytics',
	templateUrl: './analytics.component.html',
	styleUrls: ['./analytics.component.scss'],
	imports: [
		AnalyticsMetricComponent,
		DistributionChartComponent,
		WebUiIconComponent,
		FontAwesomeModule,
		BaseChartDirective,
		WebUiNumberPipe,
		FormsModule,
		NgSelectModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit, OnDestroy {
	readonly i18n = injectI18n(WebUiMessages);
	readonly workflowSelectId = `nx-analytics-workflow-${nextWorkflowSelectId++}`;
	private activityDates: string[] = [];
	private mimeTypes: string[] = [];
	hourLabel(hour: number): string {
		return new Intl.DateTimeFormat(this.i18n.locale(), {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'UTC',
		}).format(new Date(Date.UTC(2026, 0, 1, hour)));
	}

	metricLabel(row: MetricRow): string {
		if (row.missingLabel)
			return this.i18n.format('app.settingsShared.unknown-b764cd', {}, 'Unknown');
		if (row.actionParts)
			return this.i18n.format(
				'app.settingsShared.actorknown-select-true-actor-other-unknown-task-2940b7',
				{
					actorKnown: !!row.actionParts.actor,
					actor: row.actionParts.actor ?? '',
					taskKnown: !!row.actionParts.task,
					task: row.actionParts.task ?? '',
				},
				'{actorKnown, select, true {{actor}} other {Unknown}} · {taskKnown, select, true {{task}} other {Task}}',
			);
		return row.key;
	}
	rangeLabel(key: string): string {
		const labels: Record<string, string> = {
			'No result': this.i18n.format('app.settingsShared.no-result-c6008b', {}, 'No result'),
			'Less than 50': this.i18n.format('app.settingsShared.less-than-181ad0', {}, 'Less than 50'),
			'51 to 200': this.i18n.format('app.settingsShared.to-d5b660', {}, '51 to 200'),
			'201 to 1000': this.i18n.format('app.settingsShared.to-6b2752', {}, '201 to 1000'),
			'More than 1000': this.i18n.format(
				'app.settingsShared.more-than-016b89',
				{},
				'More than 1000',
			),
			'First page': this.i18n.format('app.settingsShared.first-page-0bdbb7', {}, 'First page'),
			'Page 2': this.i18n.format('app.settingsShared.page-794f70', {}, 'Page 2'),
			'Pages 3 to 5': this.i18n.format('app.settingsShared.pages-to-b3c307', {}, 'Pages 3 to 5'),
			'Pages 6 to 10': this.i18n.format('app.settingsShared.pages-to-ef2bc9', {}, 'Pages 6 to 10'),
			'After 10 pages': this.i18n.format(
				'app.settingsShared.after-pages-8280ea',
				{},
				'After 10 pages',
			),
		};
		return labels[key] ?? key;
	}

	readonly section = input<'overview' | 'distribution' | 'repository' | 'search' | 'workflow'>(
		'overview',
	);
	private readonly cancel$ = new Subject<void>();
	private readonly errorMessageState = localizedText();
	get error(): string {
		return this.errorMessageState();
	}
	set error(value: string | MessageText) {
		this.errorMessageState.set(value);
	}
	auditUnavailable = false;
	rangeTooLarge = false;
	loading = true;
	startDate = datePreviousMonth();
	endDate = dateToday();
	workflows: { id: string; label: string }[] = [];
	workflow = '';
	searchSummary: SearchAnalyticsSummary | null = null;
	private readonly workflowSummaryState = signal<WorkflowAnalyticsSummary | null>(null);
	get workflowSummary(): WorkflowAnalyticsSummary | null {
		return this.workflowSummaryState();
	}
	set workflowSummary(value: WorkflowAnalyticsSummary | null) {
		this.workflowSummaryState.set(value);
	}
	/** Stock "Actions per User": bars per task, one per user; task names localized as stock. */
	readonly workflowActions = computed<MetricGroups | null>(() => {
		const summary = this.workflowSummaryState();
		return summary
			? groupWorkflowActions(
					summary.actions,
					(task) => this.i18n.text(task, task),
					this.i18n.format('app.settingsShared.unknown-b764cd', {}, 'Unknown'),
				)
			: null;
	});
	distributionPath = '/default-domain/';
	distributionOptions: DistributionOptions = {};
	distributionPaths: string[] = [];
	repositorySummary: RepositoryAnalyticsSummary | null = null;
	distributionDepth = 1;
	distribution: DocumentDistributionNode[] = [];
	distributionGuard: Exclude<DocumentDistributionResult, { status: 'ready' }> | null = null;

	totalDocuments = 0;
	totalFolders = 0;
	totalUsers = 0;

	// --------------------------------------------------------------------------------------------------
	docTypeChartData: ChartData<'doughnut'> = { labels: [], datasets: [{ data: [] }] };

	docTypeChartOptions: ChartOptions<'doughnut'> = {
		responsive: true,
		maintainAspectRatio: false,
		plugins: {
			legend: { position: 'right', labels: { padding: 14, font: { size: 11 } } },
			tooltip: {
				callbacks: {
					label: (ctx) =>
						` ${ctx.label}: ${(ctx.parsed as number).toLocaleString(this.i18n.locale())}`,
				},
			},
		},
	};

	// --------------------------------------------------------------------------------------------------
	activityChartData: ChartData<'line'> = { labels: [], datasets: [{ data: [] }] };

	activityChartOptions: ChartOptions<'line'> = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
			y: { beginAtZero: true, ticks: { precision: 0 } },
		},
		plugins: { legend: { display: false } },
	};

	// --------------------------------------------------------------------------------------------------
	contributorsChartData: ChartData<'bar'> = { labels: [], datasets: [{ data: [] }] };
	mimeTypeChartData: ChartData<'doughnut'> = { labels: [], datasets: [{ data: [] }] };

	contributorsChartOptions: ChartOptions<'bar'> = {
		responsive: true,
		maintainAspectRatio: false,
		indexAxis: 'y',
		scales: {
			x: { beginAtZero: true, ticks: { precision: 0 } },
			y: { grid: { display: false }, ticks: { font: { size: 11 } } },
		},
		plugins: { legend: { display: false } },
	};

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly analyticsService: AnalyticsService,
		private readonly cdr: ChangeDetectorRef,
	) {
		const unregister = injectI18n(WebUiIcons).register(
			'maretha.core.analytics',
			ADMIN_ANALYTICS_ICONS,
		);
		injectI18n(DestroyRef).onDestroy(unregister);
		effect(() => {
			const locale = this.i18n.locale();
			const events = this.i18n.format('app.settingsShared.events-8d14f6', {}, 'Events');
			const formatDate = new Intl.DateTimeFormat(locale, {
				month: 'short',
				day: 'numeric',
				timeZone: 'UTC',
			});
			this.activityChartData = {
				...this.activityChartData,
				labels: this.activityDates.map((value) => formatDate.format(new Date(value))),
				datasets: this.activityChartData.datasets.map((dataset) => ({ ...dataset, label: events })),
			};
			this.contributorsChartData = {
				...this.contributorsChartData,
				datasets: this.contributorsChartData.datasets.map((dataset) => ({
					...dataset,
					label: events,
				})),
			};
			this.mimeTypeChartData = {
				...this.mimeTypeChartData,
				labels: this.mimeTypes.map((value) =>
					mimeTypeLabel(value, (key, fallback) => this.i18n.text(key, fallback)),
				),
			};
			this.docTypeChartOptions = { ...this.docTypeChartOptions, locale };
			this.activityChartOptions = { ...this.activityChartOptions, locale };
			this.contributorsChartOptions = { ...this.contributorsChartOptions, locale };
			this.cdr.markForCheck();
		});
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (this.section() === 'repository') this.startDate = datePreviousMonth();
		this.load();
		if (this.section() === 'distribution') this.suggestPaths();
	}

	// --------------------------------------------------------------------------------------------------
	load(): void {
		this.cancel$.next();
		this.loading = true;
		this.error = '';
		this.auditUnavailable = false;
		this.rangeTooLarge = false;
		if (this.startDate > this.endDate) {
			this.loading = false;
			this.error = messageText(
				'app.state.the-start-date-must-be-before-the-end-date-88c4c0',
				'The start date must be before the end date.',
			);
			this.cdr.markForCheck();
			return;
		}
		if (this.section() === 'distribution') return this.loadDistribution();
		if (this.section() === 'search') return this.loadSearchAnalytics();
		if (this.section() === 'workflow') return this.loadWorkflowAnalytics();
		if (this.section() === 'repository') return this.loadRepositoryAnalytics();

		forkJoin({
			docCount: this.analyticsService.getDocumentCount(),
			folderCount: this.analyticsService.getFolderCount(),
			userCount: this.analyticsService.getUserCount(),
			docTypes:
				this.section() === 'repository'
					? this.analyticsService
							.getRepositoryDocumentTypeDistribution(this.startDate, this.endDate)
							.pipe(map((rows) => rows.map((row) => ({ type: row.key, count: row.value }))))
					: this.analyticsService.getDocumentTypeDistribution(),
			mimeTypes:
				this.section() === 'repository'
					? this.analyticsService.getMimeTypeDistribution(this.startDate, this.endDate)
					: of([]),
			activity:
				this.section() === 'distribution'
					? of([])
					: this.analyticsService.getActivityOverTime(30).pipe(
							catchError(() => {
								this.auditUnavailable = true;
								return of([]);
							}),
						),
			contributors:
				this.section() === 'distribution'
					? of([])
					: this.analyticsService.getTopContributors(10).pipe(
							catchError(() => {
								this.auditUnavailable = true;
								return of([]);
							}),
						),
		})
			.pipe(takeUntil(this.cancel$))
			.subscribe({
				next: (r) => {
					const chartColors = chartPalette();
					this.totalDocuments = r.docCount;
					this.totalFolders = r.folderCount;
					this.totalUsers = r.userCount;

					this.docTypeChartData = {
						labels: r.docTypes.map((x) => x.type),
						datasets: [
							{
								data: r.docTypes.map((x) => x.count),
								backgroundColor: r.docTypes.map(
									(_, index) => chartColors[index % chartColors.length],
								),
								hoverOffset: 6,
							},
						],
					};
					this.mimeTypes = r.mimeTypes.map((x) => x.key);
					this.mimeTypeChartData = {
						labels: r.mimeTypes.map((x) =>
							mimeTypeLabel(x.key, (key, fallback) => this.i18n.text(key, fallback)),
						),
						datasets: [
							{
								data: r.mimeTypes.map((x) => x.value),
								backgroundColor: r.mimeTypes.map(
									(_, index) => chartColors[index % chartColors.length],
								),
								hoverOffset: 6,
							},
						],
					};

					this.activityDates = r.activity.map((x) => x.date);
					this.activityChartData = {
						labels: r.activity.map((x) =>
							new Intl.DateTimeFormat(this.i18n.locale(), {
								month: 'short',
								day: 'numeric',
								timeZone: 'UTC',
							}).format(new Date(x.date)),
						),
						datasets: [
							{
								data: r.activity.map((x) => x.count),
								label: this.i18n.format('app.settingsShared.events-8d14f6', {}, 'Events'),
								borderColor: chartColors[0],
								backgroundColor: chartColors[0],
								fill: true,
								tension: 0.3,
								pointRadius: 2,
								pointHoverRadius: 5,
							},
						],
					};

					this.contributorsChartData = {
						labels: r.contributors.map((x) => x.user),
						datasets: [
							{
								data: r.contributors.map((x) => x.count),
								label: this.i18n.format('app.settingsShared.events-8d14f6', {}, 'Events'),
								backgroundColor: chartColors[0],
							},
						],
					};

					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => {
					this.loading = false;
					this.error = messageText(
						'app.state.analytics-could-not-be-loaded-check-your-conn-b46033',
						'Analytics could not be loaded. Check your connection and permissions, then retry.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	private loadDistribution(): void {
		const path = normalizedPath(this.distributionPath);
		this.distributionGuard = null;
		if (!path) {
			this.loading = false;
			this.distribution = [];
			this.cdr.markForCheck();
			return;
		}
		this.analyticsService
			.getDocumentDistribution(path, this.distributionDepth, this.distributionOptions)
			.pipe(takeUntil(this.cancel$))
			.subscribe({
				next: (result) => {
					this.distribution = result.status === 'ready' ? result.nodes : [];
					this.distributionGuard = result.status === 'ready' ? null : result;
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => {
					this.loading = false;
					this.error = messageText(
						'app.state.document-distribution-could-not-be-loaded-sel-02b1b2',
						'Document distribution could not be loaded. Select a smaller scope or check the search index.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	distributionRows(): { key: string; name: string; count: number; depth: number }[] {
		return flattenDistribution(this.distribution);
	}

	durationLabel(value: number | null): string {
		return formatAnalyticsDuration(value, this.i18n.locale());
	}

	workflowLabel(item: { id: string; label: string }): string {
		const core: Record<string, string> = {
			'wf.parallelDocumentReview.ParallelDocumentReview': 'Parallel Document Review',
			'wf.serialDocumentReview.SerialDocumentReview': 'Serial Document Review',
		};
		return core[item.label] ? this.i18n.text(item.label, core[item.label]) : item.label;
	}
	downloadRows(): MetricRow[] {
		return (this.repositorySummary?.downloads ?? []).map((row) => ({
			key: row.title,
			value: row.value,
		}));
	}
	repositoryMimeRows(): MetricRow[] {
		return (this.repositorySummary?.mimeTypes ?? []).map((row) => ({
			...row,
			key: mimeTypeLabel(row.key, (key, fallback) => this.i18n.text(key, fallback)),
		}));
	}
	hourRows(): MetricRow[] {
		return (this.searchSummary?.hours ?? []).map((value, hour) => ({ key: String(hour), value }));
	}
	navigateDistribution(path: string): void {
		this.distributionPath = path;
		this.load();
		this.suggestPaths();
	}
	suggestPaths(): void {
		const path = normalizedPath(this.distributionPath);
		if (!path) return;
		this.analyticsService
			.getDistributionPaths(path)
			.pipe(takeUntil(this.cancel$))
			.subscribe({
				next: (paths) => {
					this.distributionPaths = paths;
					this.cdr.markForCheck();
				},
				error: () => {
					this.distributionPaths = [];
					this.cdr.markForCheck();
				},
			});
	}
	distributionParents(): { path: string; name: string }[] {
		let path = '';
		return this.distributionPath
			.split('/')
			.filter(Boolean)
			.map((name) => {
				path += `/${name}`;
				return { name, path: `${path}/` };
			});
	}
	private loadRepositoryAnalytics(): void {
		this.repositorySummary = null;
		this.analyticsService
			.getRepositoryAnalytics(this.startDate, this.endDate)
			.pipe(takeUntil(this.cancel$))
			.subscribe({
				next: (summary) => {
					this.repositorySummary = summary;
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => this.handleAnalyticsError(),
			});
	}
	private loadSearchAnalytics(): void {
		this.searchSummary = null;
		this.analyticsService
			.getSearchAnalytics(this.startDate, this.endDate)
			.pipe(takeUntil(this.cancel$))
			.subscribe({
				next: (summary) => {
					this.searchSummary = summary;
					this.rangeTooLarge = !summary.complete;
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => this.handleAnalyticsError(),
			});
	}

	private loadWorkflowAnalytics(): void {
		this.workflowSummary = null;
		this.analyticsService
			.getWorkflowModels()
			.pipe(
				switchMap((workflows) => {
					this.workflows = workflows;
					this.workflow = workflows.some((item) => item.id === this.workflow)
						? this.workflow
						: workflows[0]?.id || '';
					return this.workflow
						? this.analyticsService.getWorkflowAnalytics(
								this.workflow,
								this.startDate,
								this.endDate,
							)
						: of(null);
				}),
				takeUntil(this.cancel$),
			)
			.subscribe({
				next: (summary) => {
					this.workflowSummary = summary;
					this.rangeTooLarge = summary ? !summary.complete : false;
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: () => this.handleAnalyticsError(),
			});
	}

	private handleAnalyticsError(): void {
		this.loading = false;
		this.error = messageText(
			'app.state.analytics-could-not-be-loaded-check-your-conn-b46033',
			'Analytics could not be loaded. Check your connection and permissions, then retry.',
		);
		this.cdr.markForCheck();
	}
	ngOnDestroy(): void {
		this.cancel$.next();
		this.cancel$.complete();
	}
}

function dateToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function datePreviousMonth(): string {
	const date = new Date();
	const day = date.getDate();
	date.setDate(1);
	date.setMonth(date.getMonth() - 1);
	const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
	date.setDate(Math.min(day, lastDay));
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizedPath(path: string): string {
	const normalized = path.trim();
	return normalized && normalized.startsWith('/') ? `${normalized.replace(/\/+$/, '')}/` : '';
}

function flattenDistribution(
	nodes: DocumentDistributionNode[],
	depth = 0,
	prefix = '',
): { key: string; name: string; count: number; depth: number }[] {
	return nodes.flatMap((node) => {
		const key = `${prefix}/${node.name}`;
		return [
			{ key, name: node.name, count: node.count, depth },
			...flattenDistribution(node.children, depth + 1, key),
		];
	});
}

function chartPalette(): string[] {
	if (typeof document === 'undefined') return [];
	const styles = getComputedStyle(document.documentElement);
	const colors = CHART_TOKENS.map((token) => styles.getPropertyValue(token).trim()).filter(Boolean);
	return colors.length
		? colors
		: [styles.getPropertyValue('--nuxeo-primary-color').trim() || 'transparent'];
}
