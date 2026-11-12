import { localizedText, messageText, MessageText } from 'app/helpers/localized-message';
import { inject as injectUiMessages } from '@angular/core';
import { WebUiMessages as RuntimeUiMessages } from '@maretha/webui-sdk';
import { WebUiMessagePipe } from '@maretha/webui-sdk';
import {
	Component,
	Input,
	OnChanges,
	OnDestroy,
	SimpleChanges,
	OnInit,
	ChangeDetectionStrategy,
	Inject,
	Optional,
	ChangeDetectorRef,
	inject,
} from '@angular/core';
import { UsersAndGroupsFinderService } from 'app/helpers/users-and-groups-finder.service';
import { WorkflowsService } from 'app/helpers/workflows.service';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from 'app/helpers/toast.service';
import { catchError, EMPTY, Observable, of, pipe, Subject, takeUntil, tap, throwError } from 'rxjs';
import { TooltipDirective } from 'ngx-bootstrap/tooltip';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
	SuggestionScope,
	ViewNavigation,
	WORKFLOW_LAYOUTS,
	WorkflowLayout,
	WorkflowLayoutContext,
} from '@maretha/webui-sdk';
import { DEFAULT_WORKFLOW_LAYOUTS } from '../default-workflow-layouts';

@Component({
	selector: 'nx-base-workflow-editor',
	templateUrl: './base-workflow-editor.component.html',
	styleUrls: ['./base-workflow-editor.component.scss'],
	imports: [
		TooltipDirective,
		FontAwesomeModule,
		NgComponentOutlet,
		NgTemplateOutlet,
		TranslateModule,
		WebUiMessagePipe,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
	host: { '[class.nx-workflow-editor--embedded]': 'embedded' },
	// The workflow layout's id (such as nuxeo.task38e) scopes its suggestion fields.
	providers: [SuggestionScope],
})
export class BaseWorkflowEditorComponent implements OnInit, OnChanges, OnDestroy {
	private readonly uiBaseWorkflowEditorComponentMessages = injectUiMessages(RuntimeUiMessages);
	private readonly suggestionScope = inject(SuggestionScope, { optional: true });

	@Input() document: any;
	@Input() embedded = false;
	label(value: unknown): string {
		const text = typeof value === 'string' ? value : '';
		return text ? this.uiBaseWorkflowEditorComponentMessages.text(text, text) : '';
	}
	@Input() intent = WorkflowTaskIntent.Process;
	@Input() task?: any;
	/**
	 * Embedded: called with the reloaded target document once a task action succeeded, instead of
	 * closing, so the host can navigate as stock nuxeo-app does after `workflowTaskProcessed`.
	 */
	@Input() processed?: (document: unknown) => void;
	@Input() workflowInstanceId?: string;
	users: any[] = [];
	groups: any[] = [];
	actors: any = {};
	delegatedActors: any = {};
	save$ = new Subject();
	working = false;
	workflowName?: string;
	taskName?: string;
	taskKey?: string;
	private taskKeys: readonly string[] = [];
	draftVariables: Readonly<Record<string, unknown>> = {};
	private initialVariables = '';
	private initialActors = '';
	private initialDelegatedActors = '';
	private draftRevision = 0;
	private readonly destroyed$ = new Subject<void>();
	private mutationScope = 0;
	private unregisterNavigation?: () => void;
	private layoutInputsCache?: { signature: string; value: { context: WorkflowLayoutContext } };
	private readonly submitErrorMessageState = localizedText(undefined, true);
	get submitError(): string | undefined {
		return this.submitErrorMessageState();
	}
	set submitError(value: string | undefined | MessageText) {
		this.submitErrorMessageState.set(value);
	}
	readonly layouts: readonly WorkflowLayout[];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly bsModalRef: BsModalRef,
		private readonly usersAndGroupsFinderService: UsersAndGroupsFinderService,
		private readonly toastrService: ToastService,
		private readonly workflowsService: WorkflowsService,
		private readonly cdr: ChangeDetectorRef,
		private readonly viewNavigation: ViewNavigation,
		@Optional()
		@Inject(WORKFLOW_LAYOUTS)
		private readonly customLayouts: readonly WorkflowLayout[] | null,
	) {
		this.layouts = [...DEFAULT_WORKFLOW_LAYOUTS, ...(customLayouts ?? [])].sort(
			(a, b) => (b.priority ?? 0) - (a.priority ?? 0),
		);
	}

	// --------------------------------------------------------------------------------------------------
	close(force = false) {
		if (!force && (this.working || this.draftDirty)) return;
		this.bsModalRef.hide();
	}

	ngOnDestroy() {
		this.unregisterNavigation?.();
		this.destroyed$.next();
		this.destroyed$.complete();
	}

	ngOnChanges(changes: SimpleChanges) {
		if (Object.values(changes).some((change) => !change.firstChange)) {
			this.mutationScope++;
			this.resetTaskDraft();
		}
	}

	discardChanges() {
		if (this.working) return;
		this.draftVariables = { ...(this.task?.variables ?? {}) };
		this.draftRevision++;
		this.initialVariables = JSON.stringify(this.draftVariables);
		this.close(true);
	}

	canDeactivate(): boolean {
		return !this.working && !this.draftDirty;
	}

	// --------------------------------------------------------------------------------------------------
	shouldPerformTask(taskAction: any) {
		if (taskAction.validate === false) return true;
		return !this.requiredError();
	}

	// --------------------------------------------------------------------------------------------------
	performTaskAction(event: any, taskAction: any) {
		if (event) event.preventDefault();
		if (this.working || !this.task || !this.taskKey || !this.findLayout()) return;
		const error = taskAction.validate === false ? null : this.requiredError();
		if (error) {
			this.submitError = error;
			return;
		}
		this.working = true;
		this.cdr.markForCheck();
		this.submitError = undefined;
		const scope = this.mutationScope;
		const document = this.document;
		// Stock nuxeo-document-task `_processTask`: one PUT; the server reports a stale task.
		this.workflowsService
			.performTaskAction(document, this.task.id, taskAction, this.draftVariables)
			.pipe(
				takeUntil(this.destroyed$),
				catchError((failure) => this.taskSubmitFailed(failure, document, scope)),
				this.saveOrCatchError(),
			)
			.subscribe((processed) => {
				if (scope !== this.mutationScope) return;
				this.initialVariables = JSON.stringify(this.draftVariables);
				this.working = false;
				this.cdr.markForCheck();
				if (this.processed) this.processed(processed);
				else this.close(true);
			});
	}

	/**
	 * Stock: 409 (already finished by another user) and 403 (no permission) notify for 30 s, then
	 * continue as a processed task: the document is reloaded and the page moves on.
	 */
	private taskSubmitFailed(failure: unknown, document: any, scope: number): Observable<unknown> {
		const status = failure instanceof HttpErrorResponse ? failure.status : 0;
		if (status !== 409 && status !== 403) return throwError(() => failure);
		if (scope === this.mutationScope)
			this.toastrService.error(
				status === 409
					? this.uiBaseWorkflowEditorComponentMessages.text(
							'tasks.submit.error.alreadyFinished',
							'The task you tried to submit was already finished by another user.',
						)
					: this.uiBaseWorkflowEditorComponentMessages.text(
							'tasks.submit.error.noPermissions',
							"You don't have permissions to process this task.",
						),
				undefined,
				{ timeOut: 30000, closeButton: true, enableHtml: false },
			);
		return this.workflowsService.refreshAfterTask(document).pipe(catchError(() => of(undefined)));
	}

	// --------------------------------------------------------------------------------------------------
	abandonWorkflow() {
		if (this.working || !this.workflowInstanceId || !this.document?.uid) return;
		this.working = true;
		const workflowId = this.workflowInstanceId;
		const documentId = this.document.uid;
		const scope = this.mutationScope;
		this.workflowsService
			.getWorkflow(workflowId)
			.pipe(takeUntil(this.destroyed$))
			.subscribe({
				next: (fresh) => {
					if (
						fresh?.id !== workflowId ||
						this.document?.uid !== documentId ||
						scope !== this.mutationScope ||
						fresh?.state !== 'running'
					) {
						this.working = false;
						this.submitError = messageText(
							'app.state.this-workflow-can-no-longer-be-abandoned-6f4699',
							'This workflow can no longer be abandoned.',
						);
						this.cdr.markForCheck();
						return;
					}
					this.workflowsService
						.abandonWorkflow(this.document!, workflowId)
						.pipe(takeUntil(this.destroyed$), this.saveOrCatchError())
						.subscribe(() => {
							if (scope === this.mutationScope) this.close(true);
						});
				},
				error: () => {
					this.working = false;
					this.submitError = messageText(
						'app.state.unable-to-refresh-this-workflow-72164e',
						'Unable to refresh this workflow.',
					);
					this.cdr.markForCheck();
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	get shouldReassign() {
		return Object.values(this.actors).filter(Boolean).length > 0;
	}

	// --------------------------------------------------------------------------------------------------
	reassignTask(comment?: string) {
		if (this.working || !this.shouldReassign) return;
		this.working = true;
		this.mutateFreshTask(
			(fresh) => fresh?.taskInfo?.allowTaskReassignment === true,
			(fresh) =>
				this.workflowsService.reassignTask(
					this.document!,
					fresh.id,
					Object.keys(this.actors).filter((id) => this.actors[id]),
					comment,
				),
		);
	}

	// --------------------------------------------------------------------------------------------------
	get shouldDelegate() {
		return Object.values(this.delegatedActors).filter(Boolean).length > 0;
	}

	// --------------------------------------------------------------------------------------------------
	delegateTask(comment?: string) {
		if (this.working || !this.shouldDelegate) return;
		this.working = true;
		this.mutateFreshTask(
			() => true,
			(fresh) =>
				this.workflowsService.delegateTask(
					this.document!,
					fresh.id,
					Object.keys(this.delegatedActors).filter((id) => this.delegatedActors[id]),
					comment,
				),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private saveOrCatchError = () =>
		pipe(
			tap(() => this.save$.next(null)),
			catchError(() => {
				this.working = false;
				this.submitError = messageText(
					'app.state.unable-to-save-this-workflow-change-f3bddb',
					'Unable to save this workflow change.',
				);
				this.cdr.markForCheck();
				this.toastrService.error(
					this.uiBaseWorkflowEditorComponentMessages.text(
						'app.notices.an-error-occurred-please-try-again-in-a-few-m-5b0be8',
						'An error occurred, please try again in a few moments.',
					),
					this.uiBaseWorkflowEditorComponentMessages.text('app.notices.error-54a0e8', 'Error'),
					{ enableHtml: false },
				);
				return EMPTY;
			}),
		);

	// --------------------------------------------------------------------------------------------------
	setUser(event: any, user: any) {
		if (event.currentTarget.checked) {
			if (this.intent === WorkflowTaskIntent.Reassign) this.actors[`user:${user.id}`] = true;
			else if (this.intent === WorkflowTaskIntent.Delegate)
				this.delegatedActors[`user:${user.id}`] = true;
		} else {
			if (this.intent === WorkflowTaskIntent.Reassign) delete this.actors[`user:${user.id}`];
			else if (this.intent === WorkflowTaskIntent.Delegate)
				delete this.delegatedActors[`user:${user.id}`];
		}
	}

	// --------------------------------------------------------------------------------------------------
	setGroup(event: any, group: any) {
		const actorId = `group:${group.id}`;
		if (event.currentTarget.checked) {
			if (this.intent === WorkflowTaskIntent.Reassign) this.actors[actorId] = true;
			else if (this.intent === WorkflowTaskIntent.Delegate) this.delegatedActors[actorId] = true;
		} else {
			if (this.intent === WorkflowTaskIntent.Reassign) delete this.actors[actorId];
			else if (this.intent === WorkflowTaskIntent.Delegate) delete this.delegatedActors[actorId];
		}
	}

	// --------------------------------------------------------------------------------------------------
	ngOnInit(): void {
		if (
			!this.workflowInstanceId &&
			!this.task &&
			(this.intent === WorkflowTaskIntent.Reassign || this.intent === WorkflowTaskIntent.Delegate)
		)
			throw 'nx-generic-workflow-editor: You must specify either the workflow instance id or task';

		if (!this.document) throw 'nx-generic-workflow-editor: You must specify the document';

		if (
			this.intent === WorkflowTaskIntent.Reassign ||
			this.intent === WorkflowTaskIntent.Delegate
		) {
			this.usersAndGroupsFinderService.getUsersAndGroups().subscribe((x) => {
				this.users = x.users;
				this.groups = x.groups;
				// OnPush: the asynchronous list must be scheduled for rendering.
				this.cdr.markForCheck();
			});

			for (const actor of this.task!.actors) this.actors[actorKey(actor)] = false;

			if (this.intent === WorkflowTaskIntent.Delegate)
				for (const actor of this.task!.delegatedActors)
					this.delegatedActors[actorKey(actor)] = false;
		} else if (this.task) this.resetTaskDraft();
		this.unregisterNavigation = this.viewNavigation.register(async () => this.canDeactivate());
	}

	private resetTaskDraft() {
		this.mutationScope++;
		if (
			this.intent === WorkflowTaskIntent.Reassign ||
			this.intent === WorkflowTaskIntent.Delegate
		) {
			this.actors = Object.fromEntries(
				(this.task?.actors ?? []).map((actor: any) => [actorKey(actor), false]),
			);
			this.delegatedActors = Object.fromEntries(
				(this.task?.delegatedActors ?? []).map((actor: any) => [actorKey(actor), false]),
			);
		}
		const layoutName = this.task?.taskInfo?.layoutResource?.name;
		const rawLayout = layoutName?.toLowerCase().replace(/^nuxeo-/, '');
		const canonical = [rawLayout, this.task?.nodeName, this.task?.name]
			.map((value) => value?.toLowerCase().match(/task[0-9a-f]+/)?.[0])
			.find(Boolean);
		this.taskKeys = [rawLayout, canonical].filter((value): value is string => !!value);
		this.taskKey = canonical;
		this.suggestionScope?.layout.set(this.findLayout()?.id ?? null);
		this.working = false;
		this.draftVariables = { ...(this.task?.variables ?? {}) };
		this.draftRevision++;
		this.initialVariables = JSON.stringify(this.draftVariables);
		this.initialActors = JSON.stringify(this.actors);
		this.initialDelegatedActors = JSON.stringify(this.delegatedActors);
		this.layoutInputsCache = undefined;
		this.submitError = undefined;
		this.cdr.markForCheck();
	}

	get layoutInputs(): { context: WorkflowLayoutContext } {
		const signature = `${this.task?.id ?? ''}:${this.draftRevision}:${this.working}:${this.submitError ?? ''}`;
		if (this.layoutInputsCache?.signature === signature) return this.layoutInputsCache.value;
		const revision = this.draftRevision;
		const task = JSON.parse(JSON.stringify(this.task));
		const variables = JSON.parse(JSON.stringify(this.draftVariables));
		const value: { context: WorkflowLayoutContext } = {
			context: {
				document: Object.freeze({ ...this.document }),
				task,
				taskKey: this.taskKey!,
				variables,
				mode: 'process',
				readOnly: this.working,
				noEdit: this.working,
				busy: this.working,
				errors: this.submitError ? { form: this.submitError } : {},
				commit: (nextVariables: Readonly<Record<string, unknown>>) => {
					if (!this.working && revision === this.draftRevision) {
						this.draftVariables = JSON.parse(JSON.stringify(nextVariables));
						this.draftRevision++;
						this.cdr.markForCheck();
					}
				},
			},
		};
		this.layoutInputsCache = { signature, value };
		return value;
	}
	get draftDirty(): boolean {
		// Abandoning edits nothing: Go back, Escape and the close control always dismiss.
		if (this.intent === WorkflowTaskIntent.AbandonWorkflow) return false;
		return JSON.stringify(this.draftVariables) !== this.initialVariables || this.intentDirty;
	}
	get intentDirty(): boolean {
		return (
			JSON.stringify(this.actors) !== this.initialActors ||
			JSON.stringify(this.delegatedActors) !== this.initialDelegatedActors
		);
	}
	findLayout(): WorkflowLayout | undefined {
		return this.layouts.find((layout) => this.taskKeys.includes(layout.taskKey.toLowerCase()));
	}
	requiredError(): string | null {
		const issue = this.requiredIssue();
		return issue
			? this.uiBaseWorkflowEditorComponentMessages.format(issue.key, issue.values, issue.fallback)
			: null;
	}
	private requiredIssue(): MessageText | null {
		if (
			this.taskKey === 'task38e' &&
			(!Array.isArray(this.draftVariables['participants']) ||
				!this.draftVariables['participants'].length)
		)
			return messageText('workflow.participantsRequired', 'Participants are required.');
		if (
			this.taskKey === 'task2556' &&
			(!Array.isArray(this.draftVariables['participants']) ||
				!this.draftVariables['participants'].length ||
				!this.draftVariables['end_date'])
		)
			return messageText(
				'workflow.participantsAndEndRequired',
				'Participants and end date are required.',
			);
		return null;
	}
	private mutateFreshTask(
		allowed: (task: any) => boolean,
		mutate: (task: any) => ReturnType<WorkflowsService['delegateTask']>,
	) {
		const taskId = this.task?.id;
		const documentId = this.document?.uid;
		if (!taskId || !documentId) {
			this.working = false;
			return;
		}
		this.cdr.markForCheck();
		const revision = this.draftRevision;
		const scope = this.mutationScope;
		const intent = this.intent;
		this.workflowsService
			.getTask(taskId)
			.pipe(takeUntil(this.destroyed$))
			.subscribe({
				next: (fresh) => {
					if (
						fresh?.id !== taskId ||
						fresh?.state !== 'opened' ||
						this.document?.uid !== documentId ||
						revision !== this.draftRevision ||
						scope !== this.mutationScope ||
						intent !== this.intent ||
						!allowed(fresh)
					) {
						this.working = false;
						this.submitError = messageText(
							'app.state.this-task-can-no-longer-be-changed-a6f145',
							'This task can no longer be changed.',
						);
						this.cdr.markForCheck();
						return;
					}
					mutate(fresh)
						.pipe(takeUntil(this.destroyed$), this.saveOrCatchError())
						.subscribe(() => {
							if (scope === this.mutationScope) this.close(true);
						});
				},
				error: () => {
					this.working = false;
					this.submitError = messageText(
						'app.state.unable-to-refresh-this-task-6c7927',
						'Unable to refresh this task.',
					);
					this.cdr.markForCheck();
				},
			});
	}
}

export enum WorkflowTaskIntent {
	Process,
	Reassign,
	Delegate,
	AbandonWorkflow,
}

/** A prefixed actor id; fetched actors are user or group entities with a bare `id`. */
function actorKey(actor: any): string {
	const value = String(actor?.id ?? '');
	if (/^(user|group):/.test(value)) return value;
	return `${actor?.['entity-type'] === 'group' ? 'group' : 'user'}:${value}`;
}
