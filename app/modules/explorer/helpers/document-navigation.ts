import { documentNavigationKey } from 'app/helpers/document-route';
import { Event, NavigationEnd } from '@angular/router';
import { distinctUntilChanged, filter, map, Observable } from 'rxjs';

export function documentPath(url: string): string {
	return url.split(/[?#]/, 1)[0];
}

export function documentNavigationPaths(events: Observable<Event>): Observable<string> {
	return events.pipe(
		filter((event): event is NavigationEnd => event instanceof NavigationEnd),
		map((event) => documentNavigationKey(event.urlAfterRedirects)),
		distinctUntilChanged(),
	);
}
