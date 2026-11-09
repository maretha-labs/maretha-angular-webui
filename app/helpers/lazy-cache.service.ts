import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { catchError, of, map, tap, throwError } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class LazyCacheService {
	private readonly cache: Record<string, { date: Date; value: any }> = {};
	private readonly cacheAge = 1000 * 60 * 5;

	//---------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly sanitizer: DomSanitizer,
	) {}

	//---------------------------------------------------------------------------------------
	getBlob(src: string, skipCache = false, reportErrors = false) {
		const cached = this.cache[src];

		if (!skipCache && cached && cached.date.getTime() + this.cacheAge > new Date().getTime())
			return of(cached.value);

		// Renditions carry year-long HTTP caching. A previously cached image response
		// without CORS headers cannot be reused by an authenticated cross-origin XHR.
		// Keep our in-memory cache, but give each actual fetch its own browser cache key.
		const requestUrl =
			reportErrors && /^https?:/i.test(src)
				? `${src}${src.includes('?') ? '&' : '?'}marethaPreview=${Date.now()}`
				: src;
		return this.httpClient.get(requestUrl, { responseType: 'blob' }).pipe(
			catchError((error) =>
				reportErrors
					? throwError(() => error)
					: of('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),
			),
			map((x) =>
				typeof x === 'string'
					? this.sanitizer.bypassSecurityTrustResourceUrl(x)
					: this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(x)),
			),
			tap(
				(x) =>
					(this.cache[src] = {
						date: new Date(),
						value: x,
					}),
			),
		);
	}
}
