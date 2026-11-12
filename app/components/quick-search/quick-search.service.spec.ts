import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
	QuickSearchService,
	SearchSuggestion,
	parseSuggestionHighlights,
} from './quick-search.service';
describe('Quick search transport', () => {
	it('uses the suggester contract, preserves result kinds and rejects foreign thumbnail URLs', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		let result: SearchSuggestion[] = [];
		TestBed.inject(QuickSearchService)
			.search(' "Contract" ')
			.subscribe((x) => (result = x));
		const req = http.expectOne((r) => r.url.endsWith('/automation/Search.SuggestersLauncher'));
		expect(req.request.body.params.searchTerm).toBe('%22Contract%22');
		req.flush([
			{
				id: 'a',
				label: 'Contract',
				type: 'document',
				url: 'nxdoc/default/a/view_documents',
				thumbnailUrl: 'api/v1/repo/default/id/a/@rendition/thumbnail',
				highlights: [{ segments: ['<em>Contract</em> <script>untrusted</script>'] }],
			},
			{
				id: 'Administrator',
				label: 'Administrator',
				type: 'user',
				thumbnailUrl: 'https://outside.example/pixel',
			},
			{ id: 'members', label: 'Members', type: 'group' },
			{ id: 'bad', label: 'Unsupported', type: 'unknown' },
		]);
		const pathReq = http.expectOne((r) => r.url.endsWith('/search/lang/NXQL/execute'));
		expect(pathReq.request.params.get('query')).toContain("ecm:uuid IN ('a')");
		pathReq.flush({ entries: [{ uid: 'a', path: '/default-domain/workspaces/Contract' }] });
		expect(result.map((x) => x.type)).toEqual(['document', 'user', 'group']);
		expect(result[0].path).toBe('/default-domain/workspaces/Contract');
		expect(result[0].thumbnail).toContain('/nuxeo/api/v1/repo/default/id/a/');
		expect(result[0].highlights).toEqual(['Contract untrusted']);
		expect(result[1].thumbnail).toBeNull();

		// Preserves existing path and survives NXQL lookup failure on non-default repository
		TestBed.inject(QuickSearchService)
			.search('archive')
			.subscribe((x) => (result = x));
		http
			.expectOne((r) => r.url.endsWith('/automation/Search.SuggestersLauncher'))
			.flush([
				{ id: 'b', label: 'B', type: 'document', url: 'nxdoc/archive/b/view_documents' },
				{ id: 'c', path: '/existing/path', label: 'C', type: 'document' },
			]);
		http
			.expectOne((r) => r.url.endsWith('/search/lang/NXQL/execute'))
			.error(new ProgressEvent('error'));
		expect(result[0].path).toBeUndefined();
		expect(result[1].path).toBe('/existing/path');
		http.verify();
	});
});

describe('Quick search safe highlighting', () => {
	it('retains field identity and every matched segment as text without response HTML', () => {
		const [title] = parseSuggestionHighlights([
			{
				field: 'dc:title',
				segments: ['before <em>Birdy</em> and <em>bird</em><script>unsafe()</script>'],
			},
		]);
		expect(title.field).toBe('dc:title');
		expect(title.segments[0].filter((chunk) => chunk.matched).map((chunk) => chunk.text)).toEqual([
			'Birdy',
			'bird',
		]);
		expect(title.segments[0].every((chunk) => !chunk.text.includes('<'))).toBeTrue();
	});
});
