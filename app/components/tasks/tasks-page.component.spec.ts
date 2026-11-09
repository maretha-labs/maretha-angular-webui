import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, UrlTree } from '@angular/router';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { AuthService } from 'app/helpers/auth.service';
import { WorkflowInboxService } from 'app/helpers/workflow-inbox.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { POLYMER_MESSAGES, WebUiIcons, WebUiMessages } from '@maretha/webui-sdk';
import { WorkflowGraphDialogService } from 'app/modules/explorer/components/workflows/workflow-graph-dialog/workflow-graph-dialog.service';
import { TaskAssignmentDialogComponent } from './task-assignment-dialog.component';
import { TasksPageComponent } from './tasks-page.component';

const inFiveDays = () => new Date(Date.now() + 5 * 86_400_000 + 60_000).toISOString();

describe('Task route isolation', () => {
	let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
	let workflows: jasmine.SpyObj<WorkflowsService>;
	let saved: Subject<void>;
	let inbox: jasmine.SpyObj<WorkflowInboxService>;
	let modals: jasmine.Spy;
	beforeEach(() => {
		inbox = jasmine.createSpyObj('inbox', ['setCurrent', 'refresh']);
		params = new BehaviorSubject(convertToParamMap({ id: 'old' }));
		workflows = jasmine.createSpyObj('workflows', ['getTask', 'getUserTasks', 'getWorkflowGraph']);
		workflows.getTask.and.returnValue(
			of({
				id: 'old',
				workflowInstanceId: 'old-workflow',
				targetDocumentIds: [{ uid: 'old-doc' }],
			}),
		);
		workflows.getUserTasks.and.returnValue(
			of({ entries: [], resultsCount: 0, isNextPageAvailable: false }),
		);
		saved = new Subject<void>();
		modals = jasmine.createSpy('show').and.callFake(() => ({ content: { assigned: saved } }));
		TestBed.configureTestingModule({
			imports: [TasksPageComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
				{ provide: WorkflowsService, useValue: workflows },
				{ provide: WorkflowInboxService, useValue: inbox },
				{ provide: AuthService, useValue: { userInfoUpdated$: of({ id: 'admin' }) } },
				{ provide: BsModalService, useValue: { show: modals } },
			],
		});
	});
	it('cancels the previous task and keeps its late response out of a newer route', () => {
		const oldTask = new Subject<any>();
		const newTask = new Subject<any>();
		workflows.getTask.and.returnValues(oldTask, newTask);
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		params.next(convertToParamMap({ id: 'new' }));
		expect(oldTask.observed).toBeFalse();
		expect(fixture.componentInstance.task).toBeNull();
		newTask.next({ id: 'new', name: 'New task' });
		oldTask.next({ id: 'old', name: 'Old task' });
		expect(fixture.componentInstance.task?.id).toBe('new');
		expect(fixture.componentInstance.loading).toBeFalse();
		expect(inbox.setCurrent.calls.mostRecent().args[0]?.id).toBe('new');
		expect(inbox.setCurrent).not.toHaveBeenCalledWith(jasmine.objectContaining({ id: 'old' }));
		fixture.destroy();
		expect(inbox.setCurrent).toHaveBeenCalledWith(null);
		expect(inbox.setCurrent.calls.mostRecent().args[0]).toBeNull();
	});
	it('renders the standard task layout inline with translated task labels and the resolved document title', () => {
		TestBed.overrideProvider(DocumentsManagerService, {
			useValue: {
				getDocumentInfo: () =>
					of({
						uid: 'old-doc',
						title: 'Named note',
						properties: {},
						contextParameters: { breadcrumb: { entries: [] } },
					}),
			},
		});
		workflows.getTask.and.returnValue(
			of({
				id: 'old',
				name: 'wf.serialDocumentReview.chooseParticipants',
				directive: 'wf.serialDocumentReview.pleaseSelect',
				targetDocumentIds: [{ uid: 'old-doc' }],
				variables: { participants: [] },
				taskInfo: { layoutResource: { name: 'nuxeo-task38e-layout' }, taskActions: [] },
			}),
		);
		TestBed.inject(WebUiMessages).register('test-workflow-labels', {
			en: {
				'wf.serialDocumentReview.chooseParticipants': 'Choose Participants',
				'wf.serialDocumentReview.pleaseSelect': 'Please select participants.',
			},
		});
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Choose Participants');
		expect(fixture.nativeElement.textContent).toContain('Named note');
		expect(fixture.nativeElement.querySelector('.nx-tasks-page__form input')).not.toBeNull();
		expect(fixture.nativeElement.textContent).not.toContain(
			'wf.serialDocumentReview.chooseParticipants',
		);
	});
	it('encodes task breadcrumb paths exactly once when used by RouterLink', () => {
		const fixture = TestBed.createComponent(TasksPageComponent);
		const router = TestBed.inject(Router);
		const url = fixture.componentInstance.taskDocumentUrl({
			path: '/default-domain/UserWorkspaces/reader/Quarterly review',
			repository: 'secondary',
		});
		expect(router.serializeUrl(url)).toBe(
			'/browse/default-domain/UserWorkspaces/reader/Quarterly%20review?repository=secondary',
		);
	});
	it("opens the current task's workflow graph dialog and cancels an assignment refresh when the task changes", () => {
		const show = spyOn(TestBed.inject(WorkflowGraphDialogService), 'show').and.resolveTo();
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		component.viewGraph();
		expect(show).toHaveBeenCalledOnceWith('old-workflow');
		component.openAssignment('reassign');
		workflows.getTask.and.returnValue(of({ id: 'new', workflowInstanceId: 'new-workflow' }));
		params.next(convertToParamMap({ repo: 'other', id: 'new' }));
		saved.next();
		expect(workflows.getTask).toHaveBeenCalledTimes(2);
		component.viewGraph();
		expect(show.calls.mostRecent().args).toEqual(['new-workflow']);
		expect(workflows.getWorkflowGraph).not.toHaveBeenCalled();
	});
	it('renders the stock task card: links, entity actor tags, relative due date, no directive', () => {
		TestBed.overrideProvider(DocumentsManagerService, {
			useValue: {
				getDocumentInfo: () =>
					of({
						uid: 'old-doc',
						type: 'File',
						title: 'FILE',
						properties: {},
						ng: {
							attachment: {
								name: 'Download.zip',
								length: 10,
								'mime-type': 'application/zip',
								data: 'https://nuxeo.test/blob',
							},
						},
						contextParameters: {
							breadcrumb: {
								entries: [
									{ uid: 'domain', title: 'Domain', path: '/default-domain' },
									{ uid: 'ws', title: 'Workspaces', path: '/default-domain/workspaces' },
									{ uid: 'old-doc', title: 'FILE', path: '/default-domain/workspaces/FILE' },
								],
							},
						},
					}),
			},
		});
		workflows.getTask.and.returnValue(
			of({
				id: 'old',
				name: 'wf.serialDocumentReview.DocumentValidation',
				directive: 'wf.serialDocumentReview.AcceptReject',
				workflowModelName: 'SerialDocumentReview',
				workflowInstanceId: 'old-workflow',
				state: 'opened',
				dueDate: inFiveDays(),
				targetDocumentIds: [{ uid: 'old-doc', title: 'FILE' }],
				actors: [
					{
						'entity-type': 'user',
						id: 'AlexAdmin',
						properties: { firstName: 'Alex', lastName: 'Morgan' },
					},
					{ 'entity-type': 'group', id: 'members', grouplabel: 'Members group' },
					{ id: 'user:deleted' },
				],
				delegatedActors: [],
				variables: { participants: [] },
				taskInfo: {
					allowTaskReassignment: false,
					layoutResource: { name: 'nuxeo-task6d8-layout' },
					taskActions: [
						{ name: 'reject', label: 'wf.serialDocumentReview.Reject' },
						{ name: 'validate', label: 'wf.serialDocumentReview.Validate' },
					],
				},
			}),
		);
		TestBed.inject(WebUiMessages).register('polymer', POLYMER_MESSAGES);
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		const page: HTMLElement = fixture.nativeElement;
		const text = (selector: string) =>
			[...page.querySelectorAll(selector)].map((node) => node.textContent!.trim());
		expect(workflows.getTask).toHaveBeenCalledWith('old', true);
		expect(text('.nx-tasks-page__header h1')).toEqual(['FILE']);
		expect(text('.nx-tasks-page__header li')).toEqual(['Domain', 'Workspaces']);
		expect(page.textContent).not.toContain('All tasks');
		expect(text('.nx-tasks-page__heading h2')).toEqual(['Validate the Document']);
		expect(text('.nx-tasks-page__text-button')).toEqual(['Delegate']);
		expect(text('.nx-tasks-page__view-graph')).toEqual(['View Graph']);
		expect(page.textContent).toContain('Actors in this task:');
		expect(text('nx-user-tag')).toEqual(['Alex Morgan']);
		expect(text('.nx-tasks-page__group-tag')).toEqual(['Members group']);
		expect(text('.nx-tasks-page__date')).toEqual(['in 5 days']);
		expect(page.textContent).not.toContain('Please accept or reject the document.');
		for (const extra of ['Assigned actors', 'Due date', 'Workflow task', 'Unknown workflow'])
			expect(page.textContent).not.toContain(extra);
		expect(text('.nx-task-actions__primary')).toEqual(['Reject', 'Validate']);
		expect(page.querySelector('.modal-footer')).toBeNull();
		expect(text('.nx-tasks-page__document-view .blob-info span')).toEqual(['Download.zip']);
	});
	it('renders stock task cards without a result count and owns the card icon while open', () => {
		params.next(convertToParamMap({}));
		workflows.getUserTasks.and.returnValue(
			of({
				entries: [
					{
						id: 't1',
						name: 'wf.serialDocumentReview.chooseParticipants',
						directive: 'wf.serialDocumentReview.pleaseSelect',
						workflowModelName: 'ParallelDocumentReview',
						dueDate: inFiveDays(),
						targetDocumentIds: [
							{ uid: 'doc', title: 'FILE', path: '/default-domain/workspaces/Alex/FILE' },
						],
					},
				],
				resultsCount: 1,
				isNextPageAvailable: false,
			}),
		);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('polymer', POLYMER_MESSAGES);
		const icons = TestBed.inject(WebUiIcons);
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		const card: HTMLAnchorElement = fixture.nativeElement.querySelector('a.nx-tasks-page__task');
		const text = (selector: string) =>
			[...card.querySelectorAll(selector)].map((node) => node.textContent!.trim());
		expect(card.getAttribute('href')).toBe('/tasks/t1');
		expect(card.querySelector('nx-webui-icon')!.getAttribute('name')).toBe('icons:content-paste');
		expect(icons.catalog()['icons:content-paste']).toBeDefined();
		expect(text('.nx-tasks-page__task-info > span')).toEqual([
			'Choose Participants',
			'Please select some participants for the review.',
			'Parallel document review',
		]);
		expect(text('.nx-tasks-page__task-target > span')).toEqual([
			'On  FILE',
			'In  /default-domain/workspaces/Alex',
		]);
		expect(text('.nx-tasks-page__task-due > span')).toEqual(['Due', 'in 5 days']);
		expect(
			fixture.nativeElement.querySelector('.nx-tasks-page__header h1').textContent.trim(),
		).toBe('Tasks');
		expect(fixture.nativeElement.textContent).not.toMatch(/\b1 task\b/);
		fixture.destroy();
		expect(icons.catalog()['icons:content-paste']).toBeUndefined();
	});
	it('cancels task-list pages when entering a task and clears detail when returning to the list', () => {
		params.next(convertToParamMap({}));
		const oldList = new Subject<any>();
		workflows.getUserTasks.and.returnValue(oldList);
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		params.next(convertToParamMap({ id: 'old' }));
		expect(oldList.observed).toBeFalse();
		oldList.next({ entries: [{ id: 'stale' }], resultsCount: 1 });
		expect(fixture.componentInstance.tasks).toEqual([]);
		expect(fixture.componentInstance.task?.id).toBe('old');
		workflows.getUserTasks.and.returnValue(
			of({ entries: [], resultsCount: 0, isNextPageAvailable: false }),
		);
		params.next(convertToParamMap({}));
		expect(fixture.componentInstance.task).toBeNull();
		expect(fixture.componentInstance.resultsCount).toBe(0);
	});
	it('opens the stock assignment dialog and loads the task again once it assigned the task', () => {
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		fixture.componentInstance.openAssignment('delegate');
		expect(modals).toHaveBeenCalledOnceWith(
			TaskAssignmentDialogComponent,
			jasmine.objectContaining({
				class: 'nx-task-assignment-dialog',
				initialState: { task: jasmine.objectContaining({ id: 'old' }), action: 'delegate' },
			}),
		);
		expect(workflows.getTask).toHaveBeenCalledTimes(1);
		saved.next();
		expect(workflows.getTask).toHaveBeenCalledTimes(2);
		expect(workflows.getTask.calls.mostRecent().args).toEqual(['old', true]);
	});
	it("navigates after a processed task as stock: the document's next pending task, else the document", () => {
		TestBed.overrideProvider(DocumentsManagerService, {
			useValue: {
				getDocumentInfo: () =>
					of({
						uid: 'old-doc',
						title: 'Doc',
						properties: {},
						contextParameters: { breadcrumb: { entries: [] } },
					}),
			},
		});
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		const router = TestBed.inject(Router);
		const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
		const processed = fixture.componentInstance.inlineEditorInputs['processed'] as (
			document: unknown,
		) => void;
		const document = { uid: 'old-doc', path: '/default-domain/workspaces/Doc' };
		processed({ ...document, contextParameters: { pendingTasks: [{ id: 'next-task' }] } });
		expect(navigate).toHaveBeenCalledOnceWith('/tasks/next-task');
		processed({ ...document, contextParameters: { pendingTasks: [] } });
		expect(router.serializeUrl(navigate.calls.mostRecent().args[0] as UrlTree)).toBe(
			'/browse/default-domain/workspaces/Doc',
		);
		processed(undefined);
		expect(navigate).toHaveBeenCalledTimes(2);
	});
	it('refreshes the task count and opens the task list when the task is forbidden, as stock', () => {
		workflows.getTask.and.returnValue(throwError(() => ({ status: 403 })));
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		expect(inbox.refresh).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledOnceWith(['/tasks']);
		expect(fixture.componentInstance.error).toBe('');
	});
	it('loads the next page once at the lower scroll threshold and re-arms it after rendering', () => {
		params.next(convertToParamMap({}));
		const card = (id: string) => ({
			id,
			name: id,
			dueDate: inFiveDays(),
			targetDocumentIds: [{ uid: id, title: id, path: `/workspaces/${id}` }],
		});
		const second = new Subject<any>();
		workflows.getUserTasks.and.returnValues(
			of({
				entries: Array.from({ length: 40 }, (_, index) => card(`t${index}`)),
				resultsCount: 45,
				isNextPageAvailable: true,
			}),
			second,
			of({ entries: [card('t41')], resultsCount: 45, isNextPageAvailable: false }),
		);
		const fixture = TestBed.createComponent(TasksPageComponent);
		const host: HTMLElement = fixture.nativeElement;
		host.style.cssText = 'display: flex; height: 400px;';
		document.body.append(host);
		try {
			fixture.detectChanges();
			const component = fixture.componentInstance;
			const scroller = host.querySelector<HTMLElement>('.nx-tasks-page__content')!;
			expect(host.textContent).not.toContain('Load more');
			component.listScrolled();
			expect(workflows.getUserTasks).toHaveBeenCalledTimes(1);
			scroller.scrollTop = scroller.scrollHeight;
			component.listScrolled();
			component.listScrolled();
			expect(workflows.getUserTasks).toHaveBeenCalledTimes(2);
			expect(workflows.getUserTasks.calls.mostRecent().args).toEqual(['admin', 1]);
			fixture.detectChanges();
			expect(host.querySelectorAll('a.nx-tasks-page__task').length).toBe(40);
			second.next({ entries: [card('t40')], resultsCount: 45, isNextPageAvailable: true });
			second.complete();
			component.listScrolled();
			expect(workflows.getUserTasks).toHaveBeenCalledTimes(2);
			TestBed.inject(ApplicationRef).tick();
			expect(host.querySelectorAll('a.nx-tasks-page__task').length).toBe(41);
			scroller.scrollTop = scroller.scrollHeight;
			component.listScrolled();
			expect(workflows.getUserTasks).toHaveBeenCalledTimes(3);
		} finally {
			fixture.destroy();
			host.remove();
		}
	});
	it('handles pagination, workflow labels, and task/document load failures', () => {
		const fixture = TestBed.createComponent(TasksPageComponent);
		fixture.detectChanges();
		const component = fixture.componentInstance;
		TestBed.inject(WebUiMessages).register('polymer', POLYMER_MESSAGES);
		// Stock i18n(task.workflowModelName): the message for the key, else the key itself.
		expect(component.label('SerialDocumentReview')).toBe('Serial Document Review');
		expect(component.label('ParallelDocumentReview')).toBe('Parallel document review');
		expect(component.label('custom.unknownKey')).toBe('custom.unknownKey');
		expect(component.label(undefined)).toBe('');
		expect(component.parentPath('/default-domain/workspaces/Alex/FILE')).toBe(
			'/default-domain/workspaces/Alex',
		);
		expect(
			component.actorsOfType(
				[{ 'entity-type': 'user', id: 'a' }, { 'entity-type': 'group', id: 'g' }, { id: 'b' }],
				'user',
			),
		).toEqual([{ 'entity-type': 'user', id: 'a' }]);
		expect(component.groupLabel({ id: 'members', properties: { 'group:grouplabel': 'M' } })).toBe(
			'M',
		);

		// Inline editor BsModalRef hide navigates back to /tasks
		spyOn(TestBed.inject(DocumentsManagerService), 'getDocumentInfo').and.returnValue(
			of({
				uid: 'old-doc',
				title: 'Doc',
				contextParameters: { breadcrumb: { entries: [{ uid: 'anc' }, { uid: 'old-doc' }] } },
			}),
		);
		params.next(convertToParamMap({ id: 'old' }));
		expect(component.taskAncestors.length).toBe(1);
		const navSpy = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.inlineEditorInjector?.get(BsModalRef).hide();
		expect(navSpy).toHaveBeenCalledWith(['/tasks']);

		// Task document load failure falls back to target uid
		(TestBed.inject(DocumentsManagerService).getDocumentInfo as jasmine.Spy).and.returnValue(
			throwError(() => new Error('missing doc')),
		);
		workflows.getTask.and.returnValue(
			of({ id: 'doc-fail', workflowInstanceId: 'wf', targetDocumentIds: [{ id: 'fallback-doc' }] }),
		);
		params.next(convertToParamMap({ id: 'doc-fail' }));
		expect(component.taskDocument).toEqual(jasmine.objectContaining({ uid: 'fallback-doc' }));

		// Task load failure sets unavailable error
		workflows.getTask.and.returnValue(throwError(() => new Error('404')));
		params.next(convertToParamMap({ id: 'missing-task' }));
		expect(component.error).toContain('unavailable');

		// Task list pagination and list load error
		workflows.getUserTasks.and.returnValues(
			of({ entries: [{ id: 't1' }], resultsCount: 2, isNextPageAvailable: true }),
			throwError(() => new Error('list error')),
		);
		params.next(convertToParamMap({}));
		expect(component.hasMore).toBeTrue();
		component.loadMore();
		expect(component.error).toContain('Tasks could not be loaded');
	});
});
