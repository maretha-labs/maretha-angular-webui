import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedUiError } from '@maretha/webui-sdk';
import {
	HttpContextToken,
	HttpErrorResponse,
	HttpEvent,
	HttpHandler,
	HttpInterceptor,
	HttpRequest,
} from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { environment } from 'environments/environment';
import { ToastrService } from 'ngx-toastr';
import { catchError, filter, mergeMap, Observable, retry, take, throwError, timer } from 'rxjs';
import { TokenService } from './token.service';

/** Marks a request whose 401 means "wrong credentials in the form", not an expired session. */
export const UNAUTHORIZED_IS_FORM_ERROR = new HttpContextToken<boolean>(() => false);

@Injectable({
	providedIn: 'root',
})
export class HttpInterceptorService implements HttpInterceptor {
	private readonly messages = inject(WebUiMessages);
	private toastrOptions = {
		enableHtml: false,
		disableTimeOut: true,
		tapToDismiss: false,
		positionClass: 'toast-center-center',
	};

	constructor(
		private readonly tokenService: TokenService,
		private readonly router: Router,
		private readonly toastrService: ToastrService,
	) {}

	intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
		const endpoint = this.nuxeoEndpoint(req.url);

		// Client extensions and application assets can use HttpClient without sharing
		// Nuxeo credentials, authentication lifecycle, or retry behavior.
		if (!endpoint) return next.handle(req);

		// Suppress browser-native Basic Auth dialogs for Nuxeo requests only.
		req = req.clone({ headers: req.headers.set('X-Requested-With', 'XMLHttpRequest') });

		// Token exchanges must not wait for a token, attach a bearer, or replay a code.
		if (endpoint === 'token')
			return next.handle(req).pipe(
				catchError((error) => {
					if (error instanceof HttpErrorResponse && error.status === 403) {
						const message = this.messages.format(
							'app.services.http.configuration',
							{},
							'The Maretha Angular WebUI is not properly configured in your Nuxeo instance.',
						);
						this.toastrService.error(
							message,
							this.messages.format('app.services.http.error-title', {}, 'Error'),
							this.toastrOptions,
						);
					}

					return throwError(() => error);
				}),
			);

		if (this.tokenService.accessToken) {
			if (!this.tokenService.isAccessTokenValid) {
				const message = this.messages.format(
					'app.services.http.expired',
					{},
					'Your session has expired. Click here to return to the login page.',
				);
				this.toastrService.error(
					message,
					this.messages.format('app.services.http.expired-title', {}, 'Session expired'),
					this.toastrOptions,
				);
				this.logIn();

				return throwError(
					() =>
						new LocalizedUiError(
							'app.services.http.expired',
							'Your session has expired. Click here to return to the login page.',
						),
				);
			}

			return this.sendAuthenticated(req, next, this.tokenService.accessToken, true);
		}

		return this.tokenService.tokenUpdated$.pipe(
			filter((token): token is string => !!token && this.tokenService.isAccessTokenValid),
			// A later refresh must never replay the original request (especially a write).
			take(1),
			// AuthService owns failures during the initial token exchange. Preserve that
			// flow rather than starting a second redirect from a waiting request.
			mergeMap((token) => this.sendAuthenticated(req, next, token, false)),
		);
	}

	private nuxeoEndpoint(requestUrl: string): 'token' | 'resource' | undefined {
		if (!environment.nuxeoUrl) return undefined;

		try {
			const base = new URL(environment.nuxeoUrl, document.baseURI);
			const target = new URL(requestUrl, document.baseURI);
			const contextPath = base.pathname.replace(/\/+$/, '');

			if (
				!['http:', 'https:'].includes(base.protocol) ||
				target.origin !== base.origin ||
				target.username ||
				target.password ||
				(target.pathname !== contextPath && !target.pathname.startsWith(`${contextPath}/`))
			)
				return undefined;

			return target.pathname === `${contextPath}/oauth2/token` ? 'token' : 'resource';
		} catch {
			// Invalid or unavailable runtime configuration must not broaden credential scope.
			return undefined;
		}
	}

	private sendAuthenticated(
		req: HttpRequest<any>,
		next: HttpHandler,
		token: string,
		redirectOnUnauthorized: boolean,
	): Observable<HttpEvent<any>> {
		return next
			.handle(req.clone({ headers: req.headers.set('Authorization', `Bearer ${token}`) }))
			.pipe(
				retry({
					// Nuxeo automation uses POST, including for some reads. Only HTTP reads
					// are safe to replay without an explicit operation-specific contract.
					count: ['GET', 'HEAD'].includes(req.method) ? 3 : 0,
					delay: (error, retryCount) => {
						if (
							error instanceof HttpErrorResponse &&
							[0, 408, 429, 500, 502, 503, 504].includes(error.status)
						)
							return timer(retryCount * 1000);

						return throwError(() => error);
					},
				}),
				catchError((error) => {
					if (
						redirectOnUnauthorized &&
						!req.context.get(UNAUTHORIZED_IS_FORM_ERROR) &&
						error instanceof HttpErrorResponse &&
						error.status === 401
					) {
						const message = this.messages.format(
							'app.services.http.expired',
							{},
							'Your session has expired. Click here to return to the login page.',
						);
						this.toastrService.error(
							message,
							this.messages.format('app.services.http.expired-title', {}, 'Session expired'),
							this.toastrOptions,
						);
						this.logIn();
					}

					return throwError(() => error);
				}),
			);
	}

	private logIn() {
		this.tokenService.returnUrl = this.router.routerState.snapshot.url;

		this.tokenService.accessToken = null;

		const params = {
			client_id: environment.authClientId,
			response_type: 'code',
			redirect_uri: environment.webAppUrl,
			state: this.tokenService.returnUrl || '/',
		};

		location.href = `${environment.nuxeoUrl}/oauth2/authorize?${new URLSearchParams(params)}`;
	}
}
