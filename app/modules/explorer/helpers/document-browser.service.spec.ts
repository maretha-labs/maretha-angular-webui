import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DocumentBrowserService } from './document-browser.service';

describe('DocumentBrowserService', () => {
	let service: DocumentBrowserService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentBrowserService);
	});

	it('encodes repository and path segments without treating a document name as a query', () => {
		const http = TestBed.inject(HttpTestingController);
		service.getTreeNode('/users/A #?%', 'repo one').subscribe();
		http
			.expectOne((req) => req.url.endsWith('/repo/repo%20one/path/users/A%20%23%3F%25'))
			.flush({});
		http.verify();
	});
	it('requests a bounded, ordered page of navigable folders and escapes the parent identifier', () => {
		const http = TestBed.inject(HttpTestingController);
		service.getTreeChildren("parent'", 2, 'other').subscribe();
		const req = http.expectOne((req) =>
			req.url.includes('/repo/other/search/pp/tree_children/execute?'),
		);
		const url = new URL(req.request.url, 'http://localhost');
		expect(url.searchParams.get('currentPageIndex')).toBe('2');
		expect(url.searchParams.get('pageSize')).toBe('100');
		expect(url.searchParams.get('queryParams')).toBe("parent'");
		expect(req.request.headers.get('enrichers-document')).toBe('hasFolderishChild');
		req.flush({ entries: [] });
		http.verify();
	});
	it('uses ascending repository position for ordered folders regardless of display sorting', () => {
		const http = TestBed.inject(HttpTestingController);
		service.loadMore('parent ?&', 1, true, 'other').subscribe();
		const req = http.expectOne((r) => r.url.includes('/repo/other/query?'));
		const params = new URL(req.request.url, 'http://localhost').searchParams;
		expect(params.get('query')).toContain("ecm:parentId='parent ?&'");
		expect(params.get('query')).toContain('ORDER BY ecm:pos');
		expect(params.get('query')).toContain('ecm:isTrashed=0');
		req.flush({ entries: [] });
		http.verify();
	});
	it('browses trashed children when the parent is trashed', () => {
		const http = TestBed.inject(HttpTestingController);
		service.loadMore('trashed-parent', 0, false, 'other', true).subscribe();
		const request = http.expectOne((request) =>
			request.url.includes('/advanced_document_content/execute'),
		);
		expect(new URL(request.request.url, 'http://localhost').searchParams.get('ecm_trashed')).toBe(
			'true',
		);
		request.flush({ entries: [] });
		service.loadMore('trashed-parent', 0, true, 'other', true).subscribe();
		const ordered = http.expectOne((request) => request.url.includes('/repo/other/query?'));
		expect(new URL(ordered.request.url, 'http://localhost').searchParams.get('query')).toContain(
			'ecm:isTrashed=1',
		);
		ordered.flush({ entries: [] });
		http.verify();
	});
	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});
