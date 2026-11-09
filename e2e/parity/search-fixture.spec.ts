import { HttpRequest } from '@angular/common/http';
import { searchFixtureDocuments, searchFixtureResponse } from './search-fixture';

describe('Local search thumbnail fixture transport', () => {
	it('serves its SVG thumbnail as a Blob for the real lazy image/cache path', async () => {
		const url = searchFixtureDocuments[0].contextParameters.thumbnail.url;
		const response = searchFixtureResponse(new HttpRequest('GET', url, { responseType: 'blob' }));
		expect(response?.body instanceof Blob).toBeTrue();
		const blob = response!.body as Blob;
		expect(blob.type).toBe('image/svg+xml');
		expect(await blob.text()).toContain('Fixture 1');
		expect(await blob.text()).toContain('width="1200"');
	});
	it('leaves unrelated external image requests outside the closed fixture transport', () => {
		expect(
			searchFixtureResponse(
				new HttpRequest('GET', 'https://unrelated.invalid/image', { responseType: 'blob' }),
			),
		).toBeNull();
	});
});
