import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { QueryBulkActionService } from './query-bulk-action.service';

describe('Query bulk action transport', () => {
	it('submits the immutable provider scope to the public BAF operation with exclusions', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const service = TestBed.inject(QueryBulkActionService);
		const http = TestBed.inject(HttpTestingController);
		service
			.trash(
				{
					repository: 'repo one',
					providerName: 'default_search',
					queryParams: ['SELECT * FROM Document'],
					namedParameters: {
						ecm_fulltext: 'draft',
						facet: '["File"]',
						quickFilters: 'recent,mine',
					},
				},
				['skip-one'],
			)
			.subscribe();
		let request = http.expectOne((r) => r.url.endsWith('/automation/Bulk.RunAction'));
		expect(request.request.headers.get('X-NXRepository')).toBe('repo one');
		expect(request.request.body).toEqual({
			context: {},
			params: jasmine.objectContaining({
				action: 'automationUi',
				providerName: 'default_search',
				repositoryName: 'repo one',
				queryParams: ['SELECT * FROM Document'],
				quickFilters: ['recent', 'mine'],
				namedParameters: { ecm_fulltext: 'draft', facet: '["File"]' },
				excludeDocs: ['skip-one'],
				parameters: JSON.stringify({ operationId: 'Document.Trash', parameters: {} }),
			}),
		});
		request.flush({ 'entity-type': 'bulkStatus', value: { commandId: 'job', state: 'RUNNING' } });
		service.status('repo one', 'job/id').subscribe();
		request = http.expectOne((r) => r.url.endsWith('/repo/repo%20one/bulk/job%2Fid'));
		expect(request.request.method).toBe('GET');
		request.flush({ commandId: 'job/id', state: 'RUNNING' });
		service.abort('repo one', 'job/id').subscribe();
		request = http.expectOne((r) => r.url.endsWith('/repo/repo%20one/bulk/job%2Fid/abort'));
		expect(request.request.method).toBe('PUT');
		request.flush({ commandId: 'job/id', state: 'ABORTED' });
		http.verify();
	});
});
