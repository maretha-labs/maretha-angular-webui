import { Event, NavigationEnd, NavigationStart } from '@angular/router';
import { Subject } from 'rxjs';
import { documentNavigationPaths, documentPath } from './document-navigation';

describe('Document navigation paths', () => {
	it('excludes query parameters and fragments from document identifiers', () => {
		expect(documentPath('/browse/documents/contract-1?view=review#section')).toBe(
			'/browse/documents/contract-1',
		);
		expect(documentPath('/browse/documents/contract-1%3Fpart?view=view')).toBe(
			'/browse/documents/contract-1%3Fpart',
		);
	});
	it('ignores view-only navigation while preserving real document transitions and revisits', () => {
		const events = new Subject<Event>();
		const paths: string[] = [];
		documentNavigationPaths(events).subscribe((path) => paths.push(path));
		events.next(new NavigationStart(1, '/browse/documents/one'));
		for (const [index, url] of [
			'/browse/documents/one?view=view',
			'/browse/documents/one?view=review',
			'/browse/documents/two?view=review',
			'/browse/documents/one?view=view',
		].entries())
			events.next(new NavigationEnd(index, url, url));
		expect(paths).toEqual([
			'/browse/documents/one',
			'/browse/documents/two',
			'/browse/documents/one',
		]);
	});
	it('uses the redirected document path', () => {
		const events = new Subject<Event>();
		const observed = jasmine.createSpy('path');
		documentNavigationPaths(events).subscribe(observed);
		events.next(new NavigationEnd(1, '/old', '/browse/documents/current?view=view'));
		expect(observed).toHaveBeenCalledOnceWith('/browse/documents/current');
	});
});
