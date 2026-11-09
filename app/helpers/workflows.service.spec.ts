import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
	let service: WorkflowsService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(WorkflowsService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('uses the task API result count for paged task lists', () => {
		let page: any;
		service.getUserTasks('alice@example.test', 1).subscribe((result) => (page = result));
		const request = TestBed.inject(HttpTestingController).expectOne((item) =>
			item.url.includes('/api/v1/task?'),
		);
		expect(request.request.urlWithParams).toContain('currentPageIndex=1');
		expect(request.request.urlWithParams).toContain('pageSize=40');
		expect(request.request.headers.get('fetch-task')).toBe('targetDocumentIds,actors');
		expect(request.request.urlWithParams).toContain('userId=alice%40example.test');
		request.flush({ entries: [{ id: 'task' }], resultsCount: 41, isNextPageAvailable: true });
		expect(page.resultsCount).toBe(41);
	});

	it('assigns a task with the stock request: comment first, then each actor, no body', () => {
		const http = TestBed.inject(HttpTestingController);
		service
			.assignTask('task-1', 'reassign', ['Administrator', 'members'], 'Over to you')
			.subscribe();
		service.assignTask('task-2', 'delegate', ['jdoe'], '').subscribe();
		const reassign = http.expectOne((item) => item.url.includes('/api/v1/task/task-1/reassign'));
		expect(reassign.request.method).toBe('PUT');
		expect(reassign.request.urlWithParams).toMatch(
			/\/task\/task-1\/reassign\?comment=Over%20to%20you&actors=Administrator&actors=members$/,
		);
		expect(reassign.request.body).toBeNull();
		const delegate = http.expectOne((item) => item.url.includes('/api/v1/task/task-2/delegate'));
		expect(delegate.request.urlWithParams).toMatch(
			/\/task\/task-2\/delegate\?comment=&delegatedActors=jdoe$/,
		);
		reassign.flush({ id: 'task-1' });
		delegate.flush({ id: 'task-2' });
		http.expectNone((item) => item.url.includes('/task') && item.method === 'GET');
	});

	it('reads a task with its target documents and actors as entities only when asked', () => {
		const http = TestBed.inject(HttpTestingController);
		service.getTask('task/1', true).subscribe();
		service.getTask('task/2').subscribe();
		const viewed = http.expectOne((item) => item.url.endsWith('/api/v1/task/task%2F1'));
		expect(viewed.request.headers.get('fetch-task')).toBe('targetDocumentIds,actors');
		const fresh = http.expectOne((item) => item.url.endsWith('/api/v1/task/task%2F2'));
		expect(fresh.request.headers.has('fetch-task')).toBeFalse();
		viewed.flush({});
		fresh.flush({});
	});
});
