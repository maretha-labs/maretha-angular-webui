import { DefaultUrlSerializer } from '@angular/router';
import {
	documentUrl,
	parseDocumentRoute,
	documentNavigationKey,
	documentRouteMatches,
} from './document-route';

describe('Document browser URLs', () => {
	it('round-trips path segments through Angular without losing reserved characters', () => {
		const path = '/default-domain/a b/100%/résumé (draft);#?';
		const url = documentUrl({ uid: 'one', path });
		const serializer = new DefaultUrlSerializer();
		expect(parseDocumentRoute(serializer.serialize(serializer.parse(url)))?.value).toBe(path);
		expect(url).not.toContain('/documents/one');
	});
	it('keeps root and reserved names unambiguous', () => {
		expect(documentUrl({ path: '/' })).toBe('/browse');
		for (const path of ['/documents/id', '/collections/id', '/path/id']) {
			expect(parseDocumentRoute(documentUrl({ path }))?.value).toBe(path);
			expect(parseDocumentRoute(documentUrl({ path }))?.kind).toBe('path');
		}
	});
	it('retains old document and collection links', () => {
		expect(parseDocumentRoute('/browse/documents/one?view=permissions')?.value).toBe('one');
		expect(parseDocumentRoute('/browse/collections/one')?.kind).toBe('uid');
	});
	it('preserves immutable version identity instead of opening the live document', () => {
		expect(documentUrl({ uid: 'version-id', path: '/live', isVersion: true })).toBe(
			'/browse/documents/version-id',
		);
	});
	it('retains repository identity and ignores view-only changes', () => {
		const document = { uid: 'one', path: '/work', repository: 'archive' };
		expect(
			documentRouteMatches('/browse/work?repository=archive&view=history', document),
		).toBeTrue();
		expect(documentRouteMatches('/browse/work', document)).toBeFalse();
		expect(documentNavigationKey(documentUrl(document) + '&view=history')).toBe(
			'/browse/work?repository=archive',
		);
	});
	it('does not treat unrelated or malformed routes as documents', () => {
		expect(parseDocumentRoute('/search')).toBeNull();
		expect(parseDocumentRoute('/browse/%broken')).toBeNull();
		expect(parseDocumentRoute('/browse/a%2Fb')).toBeNull();
	});
});
