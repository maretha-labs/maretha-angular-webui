import { ChangeDetectorRef, Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { Subject, of, throwError } from 'rxjs';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ToastrService } from 'ngx-toastr';
import { TranslateService } from '@ngx-translate/core';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import {
	ViewNavigation,
	WORKFLOW_LAYOUTS,
	WorkflowLayout,
	WorkflowLayoutContext,
} from '@maretha/webui-sdk';
import { DefaultWorkflowLayoutComponent } from '../default-workflow-layout.component';
import { BaseWorkflowEditorComponent, WorkflowTaskIntent } from './base-workflow-editor.component';

@Component({
	selector: 'nx-test-workflow-layout',
	standalone: true,
	template: '<p>Custom workflow host</p>',
})
class CustomWorkflowLayoutComponent {
	@Input({ required: true }) context!: WorkflowLayoutContext;
}

describe('BaseWorkflowEditorComponent', () => {
	function editor(layouts: readonly WorkflowLayout[] = []) {
		return TestBed.runInInjectionContext(
			() =>
				new BaseWorkflowEditorComponent(
					{ hide: jasmine.createSpy('hide') } as unknown as BsModalRef,
					{
						getUsersAndGroups: () => of({ users: [], groups: [] }),
					} as unknown as UsersAndGroupsFinderService,
					{ error: jasmine.createSpy('error') } as unknown as ToastrService,
					{
						getTask: () => of({}),
						getWorkflow: () => of({}),
						performTaskAction: jasmine.createSpy('performTaskAction').and.returnValue(of({})),
						reassignTask: jasmine.createSpy('reassignTask').and.returnValue(of({})),
						delegateTask: jasmine.createSpy('delegateTask').and.returnValue(of({})),
						abandonWorkflow: jasmine.createSpy('abandonWorkflow').and.returnValue(of({})),
					} as unknown as WorkflowsService,
					{ markForCheck: jasmine.createSpy('markForCheck') } as unknown as ChangeDetectorRef,
					{ register: () => () => undefined } as any,
					layouts,
				),
		);
	}

	function task(id = 'one') {
		return {
			id,
			name: 'workflow.task38e',
			nodeName: 'Task38e',
			state: 'opened',
			variables: {},
			actors: [],
			delegatedActors: [],
			taskInfo: {
				layoutResource: { name: 'Task38e@taskLayout' },
				taskActions: [{ name: 'approve', validate: true }],
			},
		};
	}

	it('lets the abandon confirmation be dismissed although nothing was edited', () => {
		const component = editor();
		component.document = { uid: 'doc' };
		component.intent = WorkflowTaskIntent.AbandonWorkflow;
		component.workflowInstanceId = 'wf';
		component.ngOnInit();
		expect(component.draftDirty).toBeFalse();
		expect(component.canDeactivate()).toBeTrue();
		component.close();
		expect((component as any).bsModalRef.hide).toHaveBeenCalled();
	});
	it('selects an injected custom layout over the default', () => {
		const custom: WorkflowLayout = {
			id: 'custom',
			taskKey: 'task38e',
			component: DefaultWorkflowLayoutComponent,
			priority: 1,
		};
		const component = editor([custom]);
		component.document = { uid: 'document' };
		component.task = task();
		component.ngOnInit();
		expect(component.findLayout()).toBe(custom);
	});

	it('mounts an injected custom layout through the workflow outlet', async () => {
		const custom: WorkflowLayout = {
			id: 'custom',
			taskKey: 'task38e',
			component: CustomWorkflowLayoutComponent,
			priority: 1,
		};
		await TestBed.configureTestingModule({
			imports: [BaseWorkflowEditorComponent, TranslateModule.forRoot()],
			providers: [
				{ provide: WORKFLOW_LAYOUTS, multi: true, useValue: custom },
				{ provide: BsModalRef, useValue: { hide: () => undefined } },
				{
					provide: UsersAndGroupsFinderService,
					useValue: { getUsersAndGroups: () => of({ users: [], groups: [] }) },
				},
				{ provide: ToastrService, useValue: { error: () => undefined } },
				{
					provide: TranslateService,
					useValue: {
						instant: (key: string) => key,
						get: (key: string) => of(key),
						onTranslationChange: new Subject(),
						onLangChange: new Subject(),
						onFallbackLangChange: new Subject(),
						getCurrentLang: () => 'en',
						getFallbackLang: () => 'en',
					},
				},
				{
					provide: WorkflowsService,
					useValue: { getTask: () => of({}), getWorkflow: () => of({}) },
				},
				{ provide: ViewNavigation, useValue: { register: () => () => undefined } },
			],
		}).compileComponents();
		TestBed.inject(FaIconLibrary).addIcons(faExclamationTriangle);
		const fixture: ComponentFixture<BaseWorkflowEditorComponent> = TestBed.createComponent(
			BaseWorkflowEditorComponent,
		);
		fixture.componentRef.setInput('document', { uid: 'document' });
		fixture.componentRef.setInput('task', task());
		fixture.detectChanges();
		expect(fixture.nativeElement.textContent).toContain('Custom workflow host');
		fixture.componentInstance.intent = WorkflowTaskIntent.Reassign;
		fixture.componentInstance.actors = { 'user:alice': true };
		fixture.componentInstance.reassignTask();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'This task can no longer be changed.',
		);
	});

	it('commits a native task2556 end date and enables a validating Start Review action', async () => {
		await TestBed.configureTestingModule({
			imports: [BaseWorkflowEditorComponent, TranslateModule.forRoot()],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: BsModalRef, useValue: { hide: () => undefined } },
				{
					provide: UsersAndGroupsFinderService,
					useValue: { find: () => of([]), getUsersAndGroups: () => of({ users: [], groups: [] }) },
				},
				{ provide: ToastrService, useValue: { error: () => undefined } },
				{
					provide: WorkflowsService,
					useValue: { getTask: () => of({}), getWorkflow: () => of({}) },
				},
				{ provide: ViewNavigation, useValue: { register: () => () => undefined } },
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(BaseWorkflowEditorComponent);
		TestBed.inject(FaIconLibrary).addIcons(faExclamationTriangle);
		fixture.componentRef.setInput('document', { uid: 'document' });
		fixture.componentRef.setInput('task', {
			...task(),
			nodeName: 'Task2556',
			taskInfo: {
				layoutResource: { name: 'Task2556@taskLayout' },
				taskActions: [{ name: 'start', label: 'Start Review', validate: true }],
			},
			variables: { participants: ['user:Administrator'] },
		});
		fixture.detectChanges();
		const date = fixture.nativeElement.querySelector('input[type=date]') as HTMLInputElement;
		date.value = '2026-09-23';
		date.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(fixture.componentInstance.draftVariables['end_date']).toBe('2026-09-23T00:00:00.000Z');
		expect(
			fixture.nativeElement.querySelector('.modal-footer button:last-child').disabled,
		).toBeFalse();
	});

	it('shows embedded task actions as enabled stock primary buttons that validate on click', async () => {
		await TestBed.configureTestingModule({
			imports: [BaseWorkflowEditorComponent, TranslateModule.forRoot()],
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: BsModalRef, useValue: { hide: () => undefined } },
				{
					provide: UsersAndGroupsFinderService,
					useValue: { find: () => of([]), getUsersAndGroups: () => of({ users: [], groups: [] }) },
				},
				{ provide: ToastrService, useValue: { error: () => undefined } },
				{
					provide: WorkflowsService,
					useValue: { getTask: () => of({}), getWorkflow: () => of({}) },
				},
				{ provide: ViewNavigation, useValue: { register: () => () => undefined } },
			],
		}).compileComponents();
		const fixture = TestBed.createComponent(BaseWorkflowEditorComponent);
		fixture.componentRef.setInput('document', { uid: 'document' });
		fixture.componentRef.setInput('embedded', true);
		fixture.componentRef.setInput('task', {
			...task(),
			taskInfo: {
				layoutResource: { name: 'Task38e@taskLayout' },
				taskActions: [
					{ name: 'cancel', label: 'Cancel Review', validate: false },
					{ name: 'start_review', label: 'Start Review', validate: true },
				],
			},
		});
		fixture.detectChanges();
		const host: HTMLElement = fixture.nativeElement;
		expect(host.classList).toContain('nx-workflow-editor--embedded');
		expect(host.querySelector('.modal-footer')).toBeNull();
		const actions = [...host.querySelectorAll<HTMLButtonElement>('.nx-task-actions__primary')];
		expect(actions.map((button) => button.textContent!.trim())).toEqual([
			'Cancel Review',
			'Start Review',
		]);
		expect(actions.map((button) => button.disabled)).toEqual([false, false]);
		actions[1].click();
		fixture.detectChanges();
		expect(host.querySelector('[role=alert]')!.textContent).toContain('Participants are required.');
	});

	it('keys fetched group and user actor entities with their prefixes for reassignment', () => {
		const component = editor();
		component.document = { uid: 'document' };
		component.intent = WorkflowTaskIntent.Reassign;
		component.task = {
			...task(),
			actors: [
				{ 'entity-type': 'user', id: 'alice' },
				{ 'entity-type': 'group', id: 'members' },
				{ id: 'group:legacy' },
			],
		};
		component.ngOnInit();
		expect(component.actors).toEqual({
			'user:alice': false,
			'group:members': false,
			'group:legacy': false,
		});
	});

	it('ignores a write result that arrives for an old task context', () => {
		const component = editor();
		const result = new Subject<unknown>();
		const workflows = (component as any).workflowsService;
		workflows.performTaskAction.and.returnValue(result);
		const processed = jasmine.createSpy('processed');
		component.processed = processed;
		component.document = { uid: 'document' };
		component.task = task('one');
		component.ngOnInit();
		component.performTaskAction(null, { name: 'approve', validate: false });
		component.task = task('two');
		component.ngOnChanges({ task: { firstChange: false } } as any);
		result.next({ uid: 'document' });
		expect(processed).not.toHaveBeenCalled();
	});

	it('ignores a write result that arrives after it was destroyed', () => {
		const component = editor();
		const result = new Subject<unknown>();
		const workflows = (component as any).workflowsService;
		workflows.performTaskAction.and.returnValue(result);
		const processed = jasmine.createSpy('processed');
		component.processed = processed;
		component.document = { uid: 'document' };
		component.task = task();
		component.ngOnInit();
		component.performTaskAction(null, { name: 'approve', validate: false });
		component.ngOnDestroy();
		result.next({ uid: 'document' });
		expect(processed).not.toHaveBeenCalled();
	});

	it('allows embedded task completion navigation after the write succeeds', async () => {
		const component = editor();
		const navigation = TestBed.inject(ViewNavigation);
		(component as any).viewNavigation = navigation;
		const result = new Subject<unknown>();
		const workflows = (component as any).workflowsService;
		workflows.performTaskAction.and.returnValue(result);
		component.document = { uid: 'document' };
		component.task = task();
		component.embedded = true;
		component.ngOnInit();
		component.layoutInputs.context.commit({ participants: ['user:gpt'] });
		let departure: Promise<boolean> | undefined;
		(component as any).bsModalRef.hide.and.callFake(() => {
			departure = navigation.canLeave('/tasks');
		});
		component.performTaskAction(null, { name: 'approve', validate: true });
		expect(await navigation.canLeave('/tasks')).toBeFalse();
		result.next({});
		expect(component.working).toBeFalse();
		expect(component.draftDirty).toBeFalse();
		expect(await departure).toBeTrue();
		component.ngOnDestroy();
	});

	it('hands the reloaded document to an embedded host instead of closing once an action succeeded', () => {
		const component = editor();
		const workflows = (component as any).workflowsService;
		const reloaded = { uid: 'document', contextParameters: { pendingTasks: [{ id: 'next' }] } };
		workflows.getTask = jasmine.createSpy('getTask');
		workflows.performTaskAction.and.returnValue(of(reloaded));
		const processed = jasmine.createSpy('processed');
		component.document = { uid: 'document' };
		component.task = task();
		component.embedded = true;
		component.processed = processed;
		component.ngOnInit();
		component.layoutInputs.context.commit({ participants: ['user:gpt'] });
		component.performTaskAction(null, { name: 'approve', validate: true });
		// Stock nuxeo-document-task sends the PUT alone; the server reports a stale task.
		expect(workflows.getTask).not.toHaveBeenCalled();
		expect(workflows.performTaskAction).toHaveBeenCalledOnceWith(
			{ uid: 'document' },
			'one',
			{ name: 'approve', validate: true },
			{ participants: ['user:gpt'] },
		);
		expect(processed).toHaveBeenCalledOnceWith(reloaded);
		expect((component as any).bsModalRef.hide).not.toHaveBeenCalled();
		expect(component.working).toBeFalse();
		expect(component.draftDirty).toBeFalse();
		component.ngOnDestroy();
	});

	for (const [status, message] of [
		[409, 'The task you tried to submit was already finished by another user.'],
		[403, "You don't have permissions to process this task."],
	] as const)
		it(`notifies a ${status} with the stock message, then moves on with the reloaded document`, () => {
			const component = editor();
			const workflows = (component as any).workflowsService;
			const toastr = (component as any).toastrService;
			const reloaded = { uid: 'document', contextParameters: { pendingTasks: [] } };
			workflows.performTaskAction.and.returnValue(
				throwError(() => new HttpErrorResponse({ status })),
			);
			workflows.refreshAfterTask = jasmine
				.createSpy('refreshAfterTask')
				.and.returnValue(of(reloaded));
			const processed = jasmine.createSpy('processed');
			component.document = { uid: 'document' };
			component.task = task();
			component.processed = processed;
			component.ngOnInit();
			component.performTaskAction(null, { name: 'approve', validate: false });
			expect(toastr.error).toHaveBeenCalledOnceWith(message, undefined, {
				timeOut: 30000,
				closeButton: true,
				enableHtml: false,
			});
			expect(workflows.refreshAfterTask).toHaveBeenCalledOnceWith({ uid: 'document' });
			expect(processed).toHaveBeenCalledOnceWith(reloaded);
			expect(component.working).toBeFalse();
			expect(component.submitError).toBeUndefined();
		});

	it('keeps the task open with an error for other write failures', () => {
		const component = editor();
		const workflows = (component as any).workflowsService;
		workflows.performTaskAction.and.returnValue(
			throwError(() => new HttpErrorResponse({ status: 500 })),
		);
		workflows.refreshAfterTask = jasmine.createSpy('refreshAfterTask');
		const processed = jasmine.createSpy('processed');
		component.document = { uid: 'document' };
		component.task = task();
		component.processed = processed;
		component.ngOnInit();
		component.performTaskAction(null, { name: 'approve', validate: false });
		expect(workflows.refreshAfterTask).not.toHaveBeenCalled();
		expect(processed).not.toHaveBeenCalled();
		expect(component.working).toBeFalse();
		expect(component.submitError).toBe('Unable to save this workflow change.');
	});

	it('requires fields only for validating actions and checks current server rights before reassigning', () => {
		const component = editor();
		const workflows = (component as any).workflowsService;
		component.document = { uid: 'document' };
		component.task = task();
		component.ngOnInit();
		expect(component.shouldPerformTask({ validate: true })).toBeFalse();
		expect(component.shouldPerformTask({ validate: false })).toBeTrue();
		component.intent = WorkflowTaskIntent.Reassign;
		component.actors = { 'user:alice': true };
		workflows.getTask = jasmine
			.createSpy('getTask')
			.and.returnValue(of({ ...task(), taskInfo: { allowTaskReassignment: false } }));
		component.reassignTask();
		expect(workflows.reassignTask).not.toHaveBeenCalled();
	});
});
