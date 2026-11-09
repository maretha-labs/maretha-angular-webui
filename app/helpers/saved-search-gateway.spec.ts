import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WebUiAppState } from '@maretha/webui-sdk';
import { NativeSavedSearchGateway } from './saved-search-gateway';

describe('NativeSavedSearchGateway', () => {
	let gateway: NativeSavedSearchGateway;
	let http: HttpTestingController;
	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [
				provideHttpClient(),
				provideHttpClientTesting(),
				{ provide: WebUiAppState, useValue: { nuxeoUrl: 'https://nuxeo.example/nuxeo/' } },
			],
		});
		gateway = TestBed.inject(NativeSavedSearchGateway);
		http = TestBed.inject(HttpTestingController);
	});
	afterEach(() => http.verify());

	it('lists the requested provider without relying on mutable global search state', async () => {
		const response = gateway.list('addon_provider');
		const request = http.expectOne((req) => req.url.endsWith('/api/v1/search/saved'));
		expect(request.request.params.get('pageProvider')).toBe('addon_provider');
		request.flush({
			entries: [
				{ id: 'z', title: 'Zulu', params: {} },
				{ id: 'a', title: 'Alpha', params: { vectorQuery: 'query' } },
			],
		});
		expect((await response).map((item) => item.id)).toEqual(['a', 'z']);
	});

	it('persists provider-bound criteria and escapes IDs for update and removal', async () => {
		const params = { vectorQuery: 'contract', limit: 20, locations: ['one', 'two'] };
		const saved = { id: 'saved/id', title: 'Contracts', params };
		const create = gateway.save('addon_provider', saved.title, params);
		let request = http.expectOne('https://nuxeo.example/nuxeo/api/v1/search/saved');
		expect(request.request.method).toBe('POST');
		expect(request.request.body).toEqual({
			'entity-type': 'savedSearch',
			pageProviderName: 'addon_provider',
			title: saved.title,
			params,
		});
		request.flush(saved);
		expect(await create).toEqual(saved);
		const update = gateway.update(saved.id, 'other_provider', 'Renamed', params);
		request = http.expectOne('https://nuxeo.example/nuxeo/api/v1/search/saved/saved%2Fid');
		expect(request.request.method).toBe('PUT');
		expect(request.request.body.pageProviderName).toBe('other_provider');
		request.flush({ ...saved, title: 'Renamed' });
		await update;
		const remove = gateway.remove(saved.id);
		request = http.expectOne('https://nuxeo.example/nuxeo/api/v1/search/saved/saved%2Fid');
		expect(request.request.method).toBe('DELETE');
		request.flush(null);
		await remove;
	});

	it('reads permission enrichment and shares using the existing Read ACL operation', async () => {
		const permissions = gateway.permissions('saved/id');
		let request = http.expectOne('https://nuxeo.example/nuxeo/api/v1/id/saved%2Fid');
		expect(request.request.headers.get('enrichers-document')).toBe('permissions');
		request.flush({ contextParameters: { permissions: ['Read', 'Write', 'ManageSecurity'] } });
		expect(await permissions).toEqual(['Read', 'Write', 'ManageSecurity']);
		const share = gateway.share('saved/id', 'reviewers', true);
		request = http.expectOne(
			'https://nuxeo.example/nuxeo/api/v1/automation/Document.AddPermission',
		);
		expect(request.request.body).toEqual({
			input: 'saved/id',
			params: { username: 'reviewers', permission: 'Read', begin: null, end: null, notify: true },
		});
		request.flush({});
		await share;
	});

	it('propagates server failures to the owning drawer', async () => {
		const operation = gateway.save('addon_provider', 'Rejected', {});
		const request = http.expectOne('https://nuxeo.example/nuxeo/api/v1/search/saved');
		request.flush('Denied', { status: 403, statusText: 'Forbidden' });
		await expectAsync(operation).toBeRejected();
	});
});
