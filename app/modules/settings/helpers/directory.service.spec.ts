import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DirectoryService } from './directory.service';

describe('DirectoryService', () => {
	it('uses metadata, paginated entry and encoded deletion routes', () => {
		TestBed.configureTestingModule({
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		const service = TestBed.inject(DirectoryService);
		const http = TestBed.inject(HttpTestingController);
		service.listDirectories().subscribe();
		http
			.expectOne(
				(request) => request.url.endsWith('/directory') && request.params.get('pageSize') === '0',
			)
			.flush({ entries: [] });
		service.listEntries('nature', 2).subscribe();
		http
			.expectOne(
				(request) =>
					request.url.endsWith('/directory/nature') &&
					request.params.get('currentPageIndex') === '2',
			)
			.flush({ entries: [] });
		service.delete('nature', 'x y').subscribe();
		http
			.expectOne(
				(request) => request.method === 'DELETE' && request.url.endsWith('/directory/nature/x%20y'),
			)
			.flush({});
		http.verify();
	});
});
