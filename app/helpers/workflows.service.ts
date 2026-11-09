import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { environment } from 'environments/environment';
import { Subject, switchMap, tap } from 'rxjs';

/** GET /workflow/{id}/graph, as stock nuxeo-workflow-graph reads it. */
export interface WorkflowGraphNode {
	id: string;
	title?: string;
	x: number;
	y: number;
	state?: string;
	isStartNode?: boolean;
	isEndNode?: boolean;
	isForkNode?: boolean;
	isMerge?: boolean;
	isMultiTask?: boolean;
	hasSubWorkflow?: boolean;
}
export interface WorkflowGraphTransition {
	nodeSourceId: string;
	nodeTargetId: string;
	label?: string;
	path?: { x: number; y: number }[] | null;
}
export interface WorkflowGraph {
	nodes?: WorkflowGraphNode[];
	transitions?: WorkflowGraphTransition[];
}
/** The stock task assignment actions (`PUT /task/{id}/{action}`). */
export type TaskAssignmentAction = 'reassign' | 'delegate';

export interface WorkflowTaskPage {
	entries: any[];
	resultsCount: number | null;
	isNextPageAvailable: boolean;
}

@Injectable({
	providedIn: 'root',
})
export class WorkflowsService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	/** A workflow action of this user completed: open tasks may have changed. */
	readonly tasksChanged$ = new Subject<void>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly documentsManagerService: DocumentsManagerService,
	) {}

	// --------------------------------------------------------------------------------------------------
	getUserTasks(userId: string, currentPage = 0, pageSize = 40) {
		const headers = {
			headers: new HttpHeaders({
				properties: '*',
				'fetch-task': 'targetDocumentIds,actors',
			}),
		};

		return this.httpClient.get<WorkflowTaskPage>(
			`${this.apiUrl}/task?currentPageIndex=${currentPage}&pageSize=${pageSize}&userId=${encodeURIComponent(userId)}`,
			headers,
		);
	}

	/** `entities`: as stock nuxeo-app's task resource, target documents and actors come as entities. */
	getTask(taskId: string, entities = false) {
		return this.httpClient.get<any>(
			`${this.apiUrl}/task/${encodeURIComponent(taskId)}`,
			entities ? { headers: new HttpHeaders({ 'fetch-task': 'targetDocumentIds,actors' }) } : {},
		);
	}

	getWorkflow(workflowInstanceId: string) {
		return this.httpClient.get<any>(
			`${this.apiUrl}/workflow/${encodeURIComponent(workflowInstanceId)}`,
		);
	}

	getWorkflowGraph(workflowInstanceId: string) {
		return this.httpClient.get<WorkflowGraph>(
			`${this.apiUrl}/workflow/${encodeURIComponent(workflowInstanceId)}/graph`,
		);
	}

	// --------------------------------------------------------------------------------------------------
	startWorkflow(document: any, workflowModelName: string) {
		const url = `${this.apiUrl}/id/${document.uid}/@workflow`;

		const payload: any = {
			'entity-type': 'workflow',
			workflowModelName,
			attachedDocumentIds: [document.uid],
		};

		return this.httpClient.post(url, payload).pipe(
			tap(() => this.tasksChanged$.next()),
			switchMap(() => this.documentsManagerService.reloadDocument(document.uid)),
		);
	}

	// --------------------------------------------------------------------------------------------------
	abandonWorkflow(document: any, workflowInstanceId: string) {
		const url = `${this.apiUrl}/workflow/${workflowInstanceId}`;

		return this.httpClient.delete(url).pipe(
			tap(() => this.tasksChanged$.next()),
			switchMap(() => this.documentsManagerService.reloadDocument(document.uid)),
		);
	}

	// --------------------------------------------------------------------------------------------------
	performTaskAction(document: any, taskId: string, taskAction: any, variables: any) {
		const url = `${this.apiUrl}/task/${taskId}/${taskAction.name}`;

		const payload = {
			'entity-type': 'task',
			id: taskId,
			variables /*: {
			  "comment": "I'm the manager",
			  "validationOrReview": null,
			  "secondary_cm": [
				"Administrator"
			  ],
			  "participant": "Administrator"
			}/**/,
		};

		return this.httpClient.put(url, payload).pipe(
			tap(() => this.tasksChanged$.next()),
			switchMap(() => this.documentsManagerService.reloadDocument(document.uid)),
		);
	}

	/**
	 * Stock nuxeo-app `_refreshAndFetchTasks` for a task the server refused as already finished
	 * (409) or not the user's (403): refresh the tasks, then reload the document.
	 */
	refreshAfterTask(document: any) {
		this.tasksChanged$.next();
		return this.documentsManagerService.reloadDocument(document.uid);
	}

	/**
	 * Stock nuxeo-document-task-assignment-popup: one PUT with the comment, then each actor, as
	 * query parameters (querystring encoding) and no body. Nothing else is reloaded here.
	 */
	assignTask(
		taskId: string,
		action: TaskAssignmentAction,
		actors: readonly string[],
		comment: string | null,
	) {
		const actorParameter = action === 'delegate' ? 'delegatedActors' : 'actors';
		const query = [
			`comment=${encodeURIComponent(comment ?? '')}`,
			...actors.map((actor) => `${actorParameter}=${encodeURIComponent(actor)}`),
		].join('&');
		return this.httpClient.put<unknown>(
			`${this.apiUrl}/task/${encodeURIComponent(taskId)}/${action}?${query}`,
			null,
		);
	}

	// --------------------------------------------------------------------------------------------------
	reassignTask(document: any, taskId: string, usersOrGroups: string[], comment?: string) {
		const actors = usersOrGroups.map((x) => `actors=${encodeURIComponent(x)}`).join('&');

		let url = `${this.apiUrl}/task/${taskId}/reassign?${actors}`;

		if (comment) url += `&comment=${encodeURIComponent(comment)}`;

		return this.httpClient.put(url, {}).pipe(
			tap(() => this.tasksChanged$.next()),
			switchMap(() => this.documentsManagerService.reloadDocument(document.uid)),
		);
	}

	// --------------------------------------------------------------------------------------------------
	delegateTask(document: any, taskId: string, usersOrGroups: string[], comment?: string) {
		const delegatedActors = usersOrGroups
			.map((x) => `delegatedActors=${encodeURIComponent(x)}`)
			.join('&');

		let url = `${this.apiUrl}/task/${taskId}/delegate?${delegatedActors}`;

		if (comment) url += `&comment=${encodeURIComponent(comment)}`;

		return this.httpClient.put(url, {}).pipe(tap(() => this.tasksChanged$.next()));
	}
}
