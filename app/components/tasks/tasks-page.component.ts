import { localizedMessage } from 'app/helpers/localized-message';
import { WebUiIcon, WebUiIconComponent, WebUiIcons, WebUiLocale } from '@maretha/webui-sdk';
import {
	afterNextRender,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	DestroyRef,
	ElementRef,
	inject,
	OnDestroy,
	OnInit,
	Injector,
	viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink, UrlTree } from '@angular/router';
import { NgComponentOutlet, NgTemplateOutlet } from '@angular/common';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { WebUiMessagePipe, WebUiMessages } from '@maretha/webui-sdk';
import { AuthService } from 'app/helpers/auth.service';
import { documentUrl } from 'app/helpers/document-route';
import { taskUrl } from 'app/helpers/task-route';
import { documentTypeIcon, documentTypeIconUrl } from 'app/helpers/document-type-presentation';
import { UserTagComponent } from 'app/modules/shared/components/user-tag/user-tag.component';
import { RelativeDatePipe } from 'app/pipes/relative-date.pipe';
import { TaskDocumentViewComponent, taskDocumentPreview } from './task-document-view.component';
import {
	TaskAssignmentDialogComponent,
	taskAssignmentDialogOptions,
} from './task-assignment-dialog.component';
import { WorkflowGraphDialogService } from 'app/modules/explorer/components/workflows/workflow-graph-dialog/workflow-graph-dialog.service';
import { WorkflowInboxService } from 'app/helpers/workflow-inbox.service';
import {
	TaskAssignmentAction,
	WorkflowTaskPage,
	WorkflowsService,
} from 'app/helpers/workflows.service';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { Subject, filter, switchMap, take, takeUntil } from 'rxjs';
import {
	BaseWorkflowEditorComponent,
	WorkflowTaskIntent,
} from 'app/modules/explorer/components/workflows/base-workflow-editor/base-workflow-editor.component';

/** A task actor; `fetch-task: actors` returns user and group entities. */
interface TaskActor {
	id?: string;
	'entity-type'?: string;
	groupname?: string;
	grouplabel?: string;
	properties?: Record<string, unknown>;
}

interface Task {
	id: string;
	name?: string;
	directive?: string;
	workflowModelName?: string;
	workflowInstanceId?: string;
	state?: string;
	dueDate?: string;
	actors?: TaskActor[];
	delegatedActors?: TaskActor[];
	targetDocumentIds?: {
		uid?: string;
		id?: string;
		title?: string;
		path?: string;
		repository?: string;
	}[];
	taskInfo?: {
		allowTaskReassignment?: boolean;
		allowDelegate?: boolean;
		taskActions?: { name?: string; label?: string }[];
	};
}

/** iron-scroll-threshold `lowerThreshold` default: px from the bottom that load the next page. */
const LIST_LOWER_THRESHOLD = 100;

/** iron-icons `content-paste` (Apache 2.0): the stock tasks list's task icon. */
const TASKS_PAGE_ICONS: Readonly<Record<string, WebUiIcon>> = {
	'icons:content-paste': {
		viewBox: '0 0 24 24',
		nodes: [
			{
				tag: 'path',
				attributes: {
					d: 'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
				},
			},
		],
	},
};

@Component({
	selector: 'nx-tasks-page',
	templateUrl: './tasks-page.component.html',
	styleUrls: ['./tasks-page.component.scss'],
	imports: [
		RouterLink,
		WebUiMessagePipe,
		WebUiIconComponent,
		NgComponentOutlet,
		NgTemplateOutlet,
		RelativeDatePipe,
		UserTagComponent,
		TaskDocumentViewComponent,
	],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TasksPageComponent implements OnInit, OnDestroy {
	readonly messages = inject(WebUiMessages);
	private readonly inbox = inject(WorkflowInboxService);
	private readonly destroyed$ = new Subject<void>();
	private readonly routeChanged$ = new Subject<void>();
	private readonly documents = inject(DocumentsManagerService);
	private readonly injector = inject(Injector);
	private readonly router = inject(Router);
	readonly editorComponent = BaseWorkflowEditorComponent;
	inlineEditorInjector: Injector | null = null;
	inlineEditorInputs: Record<string, unknown> = {};
	taskDocument: any = null;
	get taskAncestors(): any[] {
		return (this.taskDocument?.contextParameters?.breadcrumb?.entries ?? []).filter(
			(entry: any) => entry.uid !== this.taskDocument?.uid,
		);
	}
	readonly documentTypeIcon = documentTypeIcon;
	readonly documentTypeIconUrl = documentTypeIconUrl;
	/** The UI language, for the stock relative due dates. */
	readonly locale = inject(WebUiLocale).locale;
	private readonly listScroller = viewChild<ElementRef<HTMLElement>>('listScroller');
	/** iron-scroll-threshold `lowerTriggered`: set when a page is requested, cleared once it renders. */
	private lowerTriggered = false;
	/** A further page of the list is loading; the loaded cards stay on screen. */
	loadingMore = false;
	/** Called by the embedded task form once an action succeeded, with the reloaded document. */
	private readonly taskProcessed = (document: unknown): void =>
		this.navigateAfterTaskProcessed(document);
	/** Stock `i18n(key)` for task names, directives and workflow model names: else the key. */
	label(value: unknown): string {
		return typeof value === 'string' && value ? this.messages.text(value, value) : '';
	}
	/** Stock nuxeo-document-task `_getActorsByType`: only resolved user or group entities. */
	actorsOfType(actors: readonly TaskActor[] | undefined, type: 'user' | 'group'): TaskActor[] {
		return (actors ?? []).filter((actor) => actor?.['entity-type'] === type);
	}
	/** Stock nuxeo-group-tag label. */
	groupLabel(group: TaskActor): string {
		const properties = group.properties ?? {};
		return String(
			group.grouplabel ||
				properties['group:grouplabel'] ||
				group.groupname ||
				properties['group:groupname'] ||
				group.id ||
				'',
		);
	}
	/** The document column has a main file preview, a thumbnail or a main file row to show. */
	hasDocumentView(document: any): boolean {
		if (!document?.ng) return false;
		const preview = taskDocumentPreview(document);
		return preview.kind !== 'none' || !!preview.thumbnailUrl || !!document.ng.attachment;
	}
	/** Stock nuxeo-tasks `_getPath`: the target document's parent path. */
	parentPath(path: unknown): string {
		return typeof path === 'string' ? path.substring(0, path.lastIndexOf('/')) : '';
	}
	tasks: Task[] = [];
	task: Task | null = null;
	loading = true;
	private readonly errorMessage = localizedMessage();
	get error(): string {
		return this.errorMessage.text();
	}
	page = 0;
	resultsCount: number | null = null;
	hasMore = false;
	private readonly graphDialog = inject(WorkflowGraphDialogService);
	taskId: string | null = null;

	constructor(
		private readonly route: ActivatedRoute,
		private readonly auth: AuthService,
		private readonly workflows: WorkflowsService,
		private readonly modalService: BsModalService,
		private readonly cdr: ChangeDetectorRef,
	) {
		inject(DestroyRef).onDestroy(
			inject(WebUiIcons).register('maretha.tasks-page', TASKS_PAGE_ICONS),
		);
	}

	ngOnInit(): void {
		this.route.paramMap.pipe(takeUntil(this.destroyed$)).subscribe((params) => {
			this.routeChanged$.next();
			this.taskId = params.get('id');
			this.task = null;
			this.inlineEditorInjector = null;
			this.taskDocument = null;
			this.inbox.setCurrent(null);
			this.tasks = [];
			this.resultsCount = null;
			this.hasMore = false;
			this.loadingMore = false;
			this.lowerTriggered = false;
			if (this.taskId) this.loadTask();
			else this.loadFirstPage();
		});
	}

	ngOnDestroy(): void {
		this.inbox.setCurrent(null);
		this.destroyed$.next();
		this.destroyed$.complete();
		this.routeChanged$.complete();
	}

	loadMore(): void {
		if (!this.hasMore || this.loading || this.loadingMore || this.taskId) return;
		this.loadPage(this.page + 1, false);
	}

	/**
	 * Stock list paging on scroll, as iron-scroll-threshold: within `lowerThreshold` of the bottom
	 * the next page is requested once; the trigger is cleared after that page renders.
	 */
	listScrolled(): void {
		const scroller = this.listScroller()?.nativeElement;
		if (!scroller || this.lowerTriggered || !this.hasMore || this.loading || this.loadingMore)
			return;
		if (scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > LIST_LOWER_THRESHOLD)
			return;
		this.lowerTriggered = true;
		this.loadMore();
	}

	/**
	 * Stock Reassign/Delegate (nuxeo-document-task `_toggleAssignmentDialog`): the assignment
	 * dialog; once it has assigned the task, the task is loaded again (nuxeo-app
	 * `_workflowTaskAssigned`).
	 */
	openAssignment(action: TaskAssignmentAction): void {
		const task = this.task;
		if (this.loading || !task || task.id !== this.taskId || task.state === 'ended') return;
		const modal = this.modalService.show(
			TaskAssignmentDialogComponent,
			taskAssignmentDialogOptions(task, action),
		);
		modal.content?.assigned
			.pipe(take(1), takeUntil(this.routeChanged$), takeUntil(this.destroyed$))
			.subscribe(() => this.loadTask());
	}

	/** Stock nuxeo-document-task `_toggleGraphDialog`: the workflow graph dialog. */
	viewGraph(): void {
		const workflowInstanceId = this.task?.workflowInstanceId;
		if (!this.loading && workflowInstanceId) void this.graphDialog.show(workflowInstanceId);
	}

	taskDocumentUrl(document: NonNullable<Task['targetDocumentIds']>[number]): UrlTree {
		return this.router.parseUrl(documentUrl({ ...document, uid: document.uid ?? document.id }));
	}

	private loadFirstPage(): void {
		this.page = 0;
		this.tasks = [];
		this.loadPage(0, true);
	}

	private loadPage(page: number, replace: boolean): void {
		if (replace) this.loading = true;
		else this.loadingMore = true;
		this.errorMessage.clear();
		this.auth.userInfoUpdated$
			.pipe(
				filter((user): user is NonNullable<typeof user> => user !== null),
				take(1),
				switchMap((user) => this.workflows.getUserTasks(user.id, page)),
				takeUntil(this.routeChanged$),
				takeUntil(this.destroyed$),
			)
			.subscribe({
				next: (result: WorkflowTaskPage) => {
					this.tasks = replace
						? (result.entries as Task[])
						: [...this.tasks, ...(result.entries as Task[])];
					this.page = page;
					this.resultsCount = result.resultsCount;
					this.hasMore = result.isNextPageAvailable === true;
					this.loading = false;
					this.loadingMore = false;
					this.cdr.markForCheck();
					this.clearTriggerAfterRender();
				},
				error: () => {
					this.loading = false;
					this.loadingMore = false;
					this.errorMessage.set(
						'app.components.tasks-page.tasks-could-not-be-loaded-check-your-connection-and-per',
						'Tasks could not be loaded. Check your connection and permissions, then retry.',
					);
					this.cdr.markForCheck();
					this.clearTriggerAfterRender();
				},
			});
	}

	/** iron-scroll-threshold `clearTriggers()`, once the page has rendered. */
	private clearTriggerAfterRender(): void {
		afterNextRender(() => (this.lowerTriggered = false), { injector: this.injector });
	}

	/**
	 * Stock nuxeo-app `_navigateAfterTaskProcessed`: the document's first pending task, else the
	 * document. Nothing happens without a document.
	 */
	private navigateAfterTaskProcessed(document: any): void {
		if (!document) return;
		const nextTaskId = document.contextParameters?.pendingTasks?.find((task: any) => task?.id)?.id;
		void this.router.navigateByUrl(
			nextTaskId ? taskUrl(nextTaskId) : this.router.parseUrl(documentUrl(document)),
		);
	}

	private loadTask(): void {
		if (!this.taskId) return;
		this.loading = true;
		this.errorMessage.clear();
		this.task = null;
		this.workflows
			.getTask(this.taskId, true)
			.pipe(takeUntil(this.routeChanged$), takeUntil(this.destroyed$))
			.subscribe({
				next: (task) => {
					this.task = task as Task;
					this.loadTaskDocument(task);
					this.inbox.setCurrent(task);
					this.loading = false;
					this.cdr.markForCheck();
				},
				error: (error: unknown) => {
					this.loading = false;
					// Stock nuxeo-app `_handleTaskLoadError`: a forbidden task refreshes the task count
					// and opens the task list.
					if ((error as { status?: number } | null)?.status === 403) {
						this.inbox.refresh();
						void this.router.navigate(['/tasks']);
						return;
					}
					this.errorMessage.set(
						'app.components.tasks-page.this-task-is-unavailable-or-you-no-longer-have-permissi',
						'This task is unavailable or you no longer have permission to view it.',
					);
					this.cdr.markForCheck();
				},
			});
	}
	private loadTaskDocument(task: Task): void {
		const target = task.targetDocumentIds?.[0];
		const uid = target?.uid ?? target?.id;
		this.taskDocument = null;
		this.inlineEditorInjector = null;
		if (!uid) return;
		this.documents
			.getDocumentInfo(uid, target?.repository ?? 'default')
			.pipe(takeUntil(this.routeChanged$), takeUntil(this.destroyed$))
			.subscribe({
				next: (document) => {
					if (this.task?.id !== task.id) return;
					this.taskDocument = document;
					this.inlineEditorInputs = {
						document,
						task,
						intent: WorkflowTaskIntent.Process,
						embedded: true,
						processed: this.taskProcessed,
					};
					this.inlineEditorInjector = Injector.create({
						parent: this.injector,
						providers: [
							{
								provide: BsModalRef,
								useValue: {
									hide: () => {
										void this.router.navigate(['/tasks']);
									},
								},
							},
						],
					});
					this.cdr.markForCheck();
				},
				error: () => {
					this.taskDocument = { ...target, uid };
					this.cdr.markForCheck();
				},
			});
	}
}
