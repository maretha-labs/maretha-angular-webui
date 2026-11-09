import {
	FetchBackend,
	HttpContext,
	HttpContextToken,
	HttpErrorResponse,
	HttpEventType,
	HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

const PDF_RANGE_FETCH = new HttpContextToken<boolean>(() => false);

/** Opt a PDF request into header-first delivery without changing other HTTP requests. */
export function pdfRangeHttpContext(): HttpContext {
	return new HttpContext().set(PDF_RANGE_FETCH, true);
}

/** Register last so authentication and progress interceptors still wrap PDF requests. */
export const pdfRangeHttpInterceptor: HttpInterceptorFn = (request, next) => {
	if (!request.context.get(PDF_RANGE_FETCH)) return next(request);
	return inject(FetchBackend)
		.handle(request.clone({ redirect: 'error', reportProgress: true }))
		.pipe(
			tap((event) => {
				if (event.type === HttpEventType.ResponseHeader && !event.ok) {
					// Raise the HTTP failure inside the authentication chain, before buffering an
					// error page. In particular, a 401 must still reach its existing login handler.
					throw new HttpErrorResponse({
						headers: event.headers,
						status: event.status,
						statusText: event.statusText,
						url: event.url ?? undefined,
					});
				}
			}),
		);
};
