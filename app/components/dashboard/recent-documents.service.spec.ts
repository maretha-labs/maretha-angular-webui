import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RecentDocumentsService } from './recent-documents.service';

describe('Recently viewed documents', () => {
	it('rechecks visibility by repository, preserves actual view timestamps and omits inaccessible documents', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
		});
		const http = TestBed.inject(HttpTestingController);
		const history = [
			{ uid: 'b', repository: 'other', lastViewed: '2026-09-16T01:00:00Z' },
			{ uid: 'a', repository: 'default', lastViewed: '2026-09-15T01:00:00Z' },
			{ uid: 'gone', repository: 'default', lastViewed: '2026-09-14T01:00:00Z' },
		];
		let result: any[] = [];
		TestBed.inject(RecentDocumentsService)
			.resolve(history)
			.subscribe((docs) => (result = docs));
		http
			.expectOne((r) => r.url.endsWith('/repo/other/query'))
			.flush({
				entries: [{ uid: 'b', title: 'Fresh title', properties: { 'dc:modified': '2020-01-01' } }],
			});
		const req = http.expectOne((r) => r.url.endsWith('/repo/default/query'));
		expect(req.request.params.get('query')).toContain("ecm:uuid IN ('a','gone')");
		req.flush({ entries: [{ uid: 'a', title: 'Allowed' }] });
		expect(result.map((d) => d.uid)).toEqual(['b', 'a']);
		expect(result[0].lastViewed).toBe(history[0].lastViewed);
		expect(result[0].title).toBe('Fresh title');
		http.verify();
	});
});
