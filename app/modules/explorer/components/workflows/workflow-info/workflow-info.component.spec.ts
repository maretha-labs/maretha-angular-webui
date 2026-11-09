import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { WebUiAppState } from '@maretha/webui-sdk';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { fixtureDocument, legacyTestProviders } from 'app/testing/legacy-test-providers';
import { WorkflowGraphDialogService } from '../workflow-graph-dialog/workflow-graph-dialog.service';
import { WorkflowInfoComponent } from './workflow-info.component';

describe('WorkflowInfoComponent', () => {
	let fixture: ComponentFixture<WorkflowInfoComponent>;
	const user = signal<any>(null);
	const workflows = jasmine.createSpyObj<WorkflowsService>('WorkflowsService', ['abandonWorkflow']);
	const graph = { show: jasmine.createSpy('show').and.resolveTo() };
	const documentWith = (runningWorkflows: any[], pendingTasks: any[] = []) => {
		const document = fixtureDocument();
		return {
			...document,
			contextParameters: { ...document.contextParameters, runningWorkflows, pendingTasks },
		};
	};
	const bars = (kind: string) =>
		[...fixture.nativeElement.querySelectorAll(`.bar.${kind}`)] as HTMLElement[];
	const buttons = (bar: HTMLElement) =>
		[...bar.querySelectorAll('button')].map((button) => button.textContent?.trim());
	const render = (document: any) => {
		fixture.componentRef.setInput('document', document);
		fixture.detectChanges();
	};

	beforeEach(async () => {
		user.set({ id: 'jdoe', isAdministrator: false });
		workflows.abandonWorkflow.calls.reset();
		workflows.abandonWorkflow.and.returnValue(of(null));
		graph.show.calls.reset();
		await TestBed.configureTestingModule({
			imports: [WorkflowInfoComponent],
			providers: [
				...legacyTestProviders(),
				{ provide: WebUiAppState, useValue: { user } },
				{ provide: WorkflowsService, useValue: workflows },
				{ provide: WorkflowGraphDialogService, useValue: graph },
			],
		}).compileComponents();
		fixture = TestBed.createComponent(WorkflowInfoComponent);
	});

	it('shows one stock bar per running workflow with View Graph and Abandon for its initiator', () => {
		render(documentWith([{ id: 'wf-1', initiator: 'jdoe', title: 'Serial Document Review' }]));
		const [bar, ...others] = bars('workflow');
		expect(others.length).toBe(0);
		expect(bar.textContent).toContain(
			'You started a Serial Document Review workflow on this document.',
		);
		expect(bar.querySelector('nx-user-tag')).toBeNull();
		expect(buttons(bar)).toEqual(['View Graph', 'Abandon']);
	});

	it('names another initiator with a user tag and lets only administrators abandon', () => {
		render(documentWith([{ id: 'wf-1', initiator: 'asmith', title: 'Serial Document Review' }]));
		expect(bars('workflow')[0].querySelector('nx-user-tag')).not.toBeNull();
		expect(bars('workflow')[0].textContent).toContain(
			'started a Serial Document Review workflow on this document.',
		);
		expect(bars('workflow')[0].textContent).not.toContain('You started');
		expect(buttons(bars('workflow')[0])).toEqual(['View Graph']);
		user.set({ id: 'jdoe', isAdministrator: true });
		fixture.detectChanges();
		expect(buttons(bars('workflow')[0])).toEqual(['View Graph', 'Abandon']);
	});

	it('opens the workflow graph and confirms with the stock question before abandoning', async () => {
		const document = documentWith([{ id: 'wf-1', initiator: 'jdoe', title: 'T' }]);
		render(document);
		(bars('workflow')[0].querySelector('button.view-graph') as HTMLButtonElement).click();
		expect(graph.show).toHaveBeenCalledOnceWith('wf-1');
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		await fixture.componentInstance.abandon({ id: 'wf-1' });
		expect(confirm).toHaveBeenCalledWith('Abandon the process?');
		expect(workflows.abandonWorkflow).not.toHaveBeenCalled();
		confirm.and.returnValue(true);
		await fixture.componentInstance.abandon({ id: 'wf-1' });
		expect(workflows.abandonWorkflow).toHaveBeenCalledOnceWith(document, 'wf-1');
	});

	it('shows one black bar per pending task and opens the task to process it', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		render(documentWith([], [{ id: 'task-one', dueDate: '2026-11-11T12:00:00.000Z' }]));
		const [bar] = bars('task');
		expect(bar.textContent).toContain('You have a task to process before November 11, 2026');
		expect(buttons(bar)).toEqual(['Process']);
		(bar.querySelector('button.primary') as HTMLButtonElement).click();
		expect(navigate).toHaveBeenCalledWith('/tasks/task-one');
	});

	it('renders nothing without workflows or tasks', () => {
		render(documentWith([]));
		expect(fixture.nativeElement.querySelector('.bar')).toBeNull();
	});
});
