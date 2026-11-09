import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import type { WorkflowTask } from '@maretha/webui-sdk';
import { catchError, EMPTY, map, merge, Subject, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { WorkflowsService } from './workflows.service';

/** The signed-in user's open tasks and the task being viewed, shared across the shell. */
@Injectable({ providedIn: 'root' })
export class WorkflowInboxService {
	private readonly _tasks = signal<Readonly<Record<string, readonly any[]>>>({});
	private readonly _count = signal(0);
	private readonly _current = signal<WorkflowTask | null>(null);
	private readonly refreshRequests = new Subject<void>();
	/** Open tasks grouped by workflow title. */
	readonly tasks = this._tasks.asReadonly();
	readonly count = this._count.asReadonly();
	readonly current = this._current.asReadonly();

	constructor() {
		const auth = inject(AuthService);
		const workflows = inject(WorkflowsService);
		// Stock parity: the inbox loads for the signed-in user, after each workflow action, and
		// when its drawer opens (`refresh()`). Browsing documents does not reload it.
		merge(
			toObservable(auth.userInfo),
			merge(workflows.tasksChanged$ ?? EMPTY, this.refreshRequests).pipe(
				map(() => auth.userInfo()),
			),
		)
			.pipe(
				switchMap((user) => {
					if (!user) {
						this._tasks.set({});
						this._count.set(0);
						return EMPTY;
					}
					return workflows.getUserTasks(user.id).pipe(catchError(() => EMPTY));
				}),
				takeUntilDestroyed(),
			)
			.subscribe((page) => {
				this._count.set(page.resultsCount ?? page.entries.length);
				this._tasks.set(
					page.entries.reduce<Record<string, any[]>>(
						(groups, item) => ({
							...groups,
							[item.workflowTitle]: [...(groups[item.workflowTitle] ?? []), item],
						}),
						{},
					),
				);
			});
	}

	/** Reloads the open tasks, for a view that shows them opening. */
	refresh(): void {
		this.refreshRequests.next();
	}

	setCurrent(task: WorkflowTask | null): void {
		this._current.set(task);
	}
}
