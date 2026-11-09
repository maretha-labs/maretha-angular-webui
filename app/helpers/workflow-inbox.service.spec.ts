import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { WorkflowInboxService } from './workflow-inbox.service';
import { WorkflowTaskPage, WorkflowsService } from './workflows.service';

describe('WorkflowInboxService', () => {
	const user = signal<{ id: string } | null>(null);
	let tasksChanged$: Subject<void>;
	let responses: Subject<WorkflowTaskPage>;
	let getUserTasks: jasmine.Spy;
	beforeEach(() => {
		user.set(null);
		tasksChanged$ = new Subject<void>();
		getUserTasks = jasmine
			.createSpy('getUserTasks')
			.and.callFake(() => (responses = new Subject<WorkflowTaskPage>()));
		TestBed.configureTestingModule({
			providers: [
				{ provide: AuthService, useValue: { userInfo: user.asReadonly() } },
				{ provide: WorkflowsService, useValue: { getUserTasks, tasksChanged$ } },
			],
		});
	});

	it("groups the user's open tasks and reloads only on workflow actions and explicit refreshes", () => {
		const inbox = TestBed.inject(WorkflowInboxService);
		TestBed.tick();
		expect(getUserTasks).not.toHaveBeenCalled();
		user.set({ id: 'alice' });
		TestBed.tick();
		expect(getUserTasks).toHaveBeenCalledOnceWith('alice');
		responses.next({
			entries: [
				{ id: '1', workflowTitle: 'Review' },
				{ id: '2', workflowTitle: 'Review' },
				{ id: '3', workflowTitle: 'Approve' },
			],
			resultsCount: 5,
			isNextPageAvailable: true,
		});
		expect(inbox.count()).toBe(5);
		expect(Object.keys(inbox.tasks())).toEqual(['Review', 'Approve']);
		expect(inbox.tasks()['Review'].map((task) => task.id)).toEqual(['1', '2']);

		tasksChanged$.next();
		expect(getUserTasks).toHaveBeenCalledTimes(2);
		responses.error(new Error('offline'));
		expect(inbox.count()).toBe(5);
		inbox.refresh();
		expect(getUserTasks).toHaveBeenCalledTimes(3);
		responses.next({
			entries: [{ id: '4', workflowTitle: 'Review' }],
			resultsCount: null,
			isNextPageAvailable: false,
		});
		expect(inbox.count()).toBe(1);

		user.set(null);
		TestBed.tick();
		expect(getUserTasks).toHaveBeenCalledTimes(3);
		expect(inbox.count()).toBe(0);
		expect(inbox.tasks()).toEqual({});
	});

	it('tracks the task being viewed', () => {
		const inbox = TestBed.inject(WorkflowInboxService);
		expect(inbox.current()).toBeNull();
		inbox.setCurrent({ id: 'task', name: 'review' });
		expect(inbox.current()?.id).toBe('task');
		inbox.setCurrent(null);
		expect(inbox.current()).toBeNull();
	});
});
