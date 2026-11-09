import { WebUiMessages } from '@maretha/webui-sdk';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faRotateRight, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { of, Subject } from 'rxjs';
import { AnalyticsService, WorkflowAnalyticsSummary } from '../../helpers/analytics.service';
import { AnalyticsComponent } from './analytics.component';

describe('AnalyticsComponent workflow view', () => {
	let fixture: ComponentFixture<AnalyticsComponent>;
	let component: AnalyticsComponent;
	let summaries: Subject<WorkflowAnalyticsSummary>[];

	beforeEach(async () => {
		summaries = [];
		await TestBed.configureTestingModule({
			imports: [AnalyticsComponent],
			providers: [
				{
					provide: AnalyticsService,
					useValue: {
						getWorkflowModels: () => of([{ id: 'review', label: 'Review' }]),
						getWorkflowAnalytics: () => {
							const summary = new Subject<WorkflowAnalyticsSummary>();
							summaries.push(summary);
							return summary;
						},
					},
				},
			],
		}).compileComponents();
		fixture = TestBed.createComponent(AnalyticsComponent);
		TestBed.inject(FaIconLibrary).addIcons(faRotateRight, faSpinner);
		fixture.componentRef.setInput('section', 'workflow');
		component = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('formats missing workflow actor/task names without changing supplied customer names', () => {
		expect(
			component.metricLabel({ key: 'raw', value: 1, actionParts: { actor: null, task: null } }),
		).toBe('Unknown · Task');
		expect(
			component.metricLabel({
				key: 'raw',
				value: 1,
				actionParts: { actor: 'Unknown.customer', task: 'Task.customer' },
			}),
		).toBe('Unknown.customer · Task.customer');
		const messages = TestBed.inject(WebUiMessages);
		messages.register('metric-test', {
			fr: { 'app.settingsShared.no-result-c6008b': 'Aucun résultat' },
		});
		messages.locale.set('fr');
		expect(component.rangeLabel('No result')).toBe('Aucun résultat');
		expect(component.rangeLabel('Customer bucket')).toBe('Customer bucket');
		expect(component.hourLabel(13)).toBe(
			new Intl.DateTimeFormat('fr', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
				new Date(Date.UTC(2026, 0, 1, 13)),
			),
		);
	});
	it('rejects an inverted date range before another analytics request starts', () => {
		component.startDate = '2026-10-03';
		component.endDate = '2026-10-01';
		component.load();
		expect(component.loading).toBeFalse();
		expect(component.error).toContain('start date');
		expect(summaries.length).toBe(1);
	});
	it('renders selected workflow metrics and ignores stale requests', () => {
		component.load();
		summaries[0].next(summary({ averageWorkflowDurationMs: 1000 }));
		expect(component.workflowSummary).toBeNull();
		summaries[1].next(summary({ averageWorkflowDurationMs: 3000 }));
		fixture.detectChanges();
		// Stock _asDuration: "3s", not a seconds count.
		expect(fixture.nativeElement.querySelector('.nx-analytics__duration').textContent.trim()).toBe(
			'3s',
		);
	});

	it('cancels the active workflow aggregate when destroyed', () => {
		component.ngOnDestroy();
		summaries[0].next(summary({ averageWorkflowDurationMs: 3000 }));
		expect(component.workflowSummary).toBeNull();
	});
	it('localizes only explicit metric labels and formats charts without changing customer names', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('metrics-locale', {
			fr: {
				'app.settingsShared.unknown-b764cd': 'Inconnu',
				'app.settingsShared.events-8d14f6': 'Événements',
			},
		});
		messages.locale.set('fr');
		fixture.detectChanges();
		expect(component.metricLabel({ key: 'Unknown', value: 2 })).toBe('Unknown');
		expect(component.metricLabel({ key: '', value: 2, missingLabel: true })).toBe('Inconnu');
		expect(component.docTypeChartOptions.locale).toBe('fr');
		expect(component.workflow).toBe('review');
	});

	it('loads overview analytics and marks auditUnavailable when activity or contributor queries fail', () => {
		const service = TestBed.inject(AnalyticsService) as any;
		service.getDocumentCount = () => of(10);
		service.getFolderCount = () => of(3);
		service.getUserCount = () => of(5);
		service.getDocumentTypeDistribution = () => of([{ type: 'File', count: 7 }]);
		service.getActivityOverTime = () => of([{ date: '2026-10-01', count: 4 }]);
		service.getTopContributors = () => of([{ contributor: 'alice', count: 4 }]);
		fixture.componentRef.setInput('section', 'overview');
		component.load();
		expect(component.totalDocuments).toBe(10);
		expect(component.totalFolders).toBe(3);
		expect(component.totalUsers).toBe(5);
		expect(component.docTypeChartData.labels).toEqual(['File']);
	});
});

function summary(overrides: Partial<WorkflowAnalyticsSummary>): WorkflowAnalyticsSummary {
	return {
		complete: true,
		resultsCount: 1,
		averageWorkflowDurationMs: null,
		initiators: [],
		actions: [],
		taskDurations: [],
		...overrides,
	};
}
