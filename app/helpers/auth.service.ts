import { HttpContext, HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { UserInfo } from 'app/models/user-info';
import { environment } from 'environments/environment';
import { filter, finalize, tap, switchMap, takeWhile } from 'rxjs';
import { TokenService } from './token.service';
import { UsersAndGroupsFinderService } from './users-and-groups-finder.service';
import { BlobDeliveryService } from './blob-delivery.service';
import { UNAUTHORIZED_IS_FORM_ERROR } from './http-interceptor.service';

@Injectable({
	providedIn: 'root',
})
export class AuthService {
	private readonly delivery = inject(BlobDeliveryService);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly authUrl = `${environment.nuxeoUrl}/oauth2`;
	private readonly _userInfo = signal<UserInfo | null>(null);
	private authorizationCodeExchangeInFlight = false;
	private handledAuthorizationCode: string | null = null;
	readonly userInfo = this._userInfo.asReadonly();
	readonly userInfoUpdated$ = toObservable(this._userInfo);

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly httpClient: HttpClient,
		private readonly tokenService: TokenService,
		private readonly usersAndGroupsFinderService: UsersAndGroupsFinderService,
	) {
		if (tokenService.isAccessTokenValid) {
			this.usersAndGroupsFinderService.getUserInfo().subscribe((x) => {
				this.tokenService.isAdministrator = x.isAdministrator;
				this._userInfo.set(x);
			});
		} else {
			this.tokenService.returnUrl = captureLoginReturnPath(
				window.location.href,
				document.baseURI,
				this.tokenService.returnUrl,
			);

			// Act when a navigation starts, not when it ends: a guard that waits for the signed-in
			// user (the administration routes) holds the first navigation open, and the sign-in
			// that produces that user must not wait behind it.
			router.events
				.pipe(
					filter((e) => e instanceof NavigationStart),
					takeWhile(() => !tokenService.isAccessTokenValid),
				)
				.subscribe(() => {
					if (tokenService.isAccessTokenValid) return;

					const code = authorizationCode(window.location.href);

					if (code) this.getAccessToken(code);
					else if (!this.authorizationCodeExchangeInFlight) this.logIn();
				});
		}
	}

	// --------------------------------------------------------------------------------------------------
	updateUserInfo(userInfo: any) {
		const payload = {
			'entity-type': 'user',
			id: userInfo?.userName,
			properties: {
				firstName: userInfo.firstName,
				lastName: userInfo.lastName,
				company: userInfo.company,
				email: userInfo.email,
				groups: userInfo.groups,
			},
		};

		return this.httpClient
			.put<UserInfo>(`${this.apiUrl}/user/${userInfo?.userName}`, payload)
			.pipe(tap((x: any) => this._userInfo.set(this.usersAndGroupsFinderService.mapToUserInfo(x))));
	}

	// --------------------------------------------------------------------------------------------------
	changePassword(oldPassword: string, newPassword: string) {
		return this.httpClient.put(
			`${this.apiUrl}/me/changepassword`,
			{ oldPassword, newPassword },
			{ context: new HttpContext().set(UNAUTHORIZED_IS_FORM_ERROR, true) },
		);
	}

	// --------------------------------------------------------------------------------------------------
	logOff() {
		this.tokenService.returnUrl = this.router.routerState.snapshot.url;
		this.delivery
			.revokeSession()
			.pipe(finalize(() => this.finishLogOff()))
			.subscribe({ error: () => undefined });
	}

	private finishLogOff(): void {
		// Create a hidden IFrame
		const iframe = document.createElement('iframe');

		iframe.style.display = 'none';

		// And point it to the /logout endpoint
		iframe.src = `${environment.nuxeoUrl}/logout`;

		iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');

		// Allowing us to tap into its "onload" event
		iframe.onload = () => {
			this.tokenService.accessToken = null;
			this.tokenService.isAdministrator = false;

			this.logIn();
		};

		document.body.appendChild(iframe);
	}

	// --------------------------------------------------------------------------------------------------
	private logIn() {
		const params = {
			client_id: environment.authClientId,
			response_type: 'code',
			redirect_uri: environment.webAppUrl,
			state: this.tokenService.returnUrl || '/',
		};

		location.href = `${this.authUrl}/authorize?${new URLSearchParams(params)}`;
	}

	// --------------------------------------------------------------------------------------------------
	private getAccessToken(code: string) {
		// Nuxeo authorization codes are single-use. Route churn or a refreshed
		// callback URL must not submit the same code more than once.
		if (this.authorizationCodeExchangeInFlight || this.handledAuthorizationCode === code) return;

		this.authorizationCodeExchangeInFlight = true;
		this.handledAuthorizationCode = code;

		const payload = new HttpParams({
			fromObject: {
				grant_type: 'authorization_code',
				code,
				client_id: environment.authClientId,
				redirect_uri: environment.webAppUrl,
			},
		});

		const headers = {
			headers: new HttpHeaders({
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: '*/*',
			}),
		};

		this.getToken(payload, headers, 'authorization_code');
	}

	// --------------------------------------------------------------------------------------------------
	private getRefreshToken() {
		const token = this.tokenService.refreshToken;

		if (!token) return this.logOff();

		const payload = new HttpParams({
			fromObject: {
				grant_type: 'refresh_token',
				refresh_token: token,
				client_id: environment.authClientId,
			},
		});

		const headers = {
			headers: new HttpHeaders({
				'Content-Type': 'application/x-www-form-urlencoded',
				Accept: '*/*',
			}),
		};

		this.getToken(payload, headers, 'refresh_token');
	}

	// --------------------------------------------------------------------------------------------------
	private getToken(
		payload: HttpParams,
		headers: { headers: HttpHeaders },
		source: 'authorization_code' | 'refresh_token',
	) {
		this.httpClient
			.post(`${this.authUrl}/token`, payload, headers)
			.pipe(
				switchMap((result: any) => {
					this.tokenService.accessToken = result;

					if (result.refresh_token) {
						this.tokenService.refreshToken = result.refresh_token;

						setTimeout(() => this.getRefreshToken(), result.expires_in * 1000);
					}

					return this.usersAndGroupsFinderService.getUserInfo().pipe(
						tap((x) => {
							this.tokenService.isAdministrator = x.isAdministrator;
							this._userInfo.set(x);
						}),
					);
				}),
				tap(() => {
					if (source !== 'authorization_code') return;
					const previousUrl = this.tokenService.returnUrl;
					this.tokenService.returnUrl = null;
					this.clearAuthorizationCallback();
					const target =
						previousUrl?.startsWith('/') && !previousUrl.startsWith('//') && previousUrl !== '/'
							? previousUrl
							: '/dashboard';
					void this.router.navigateByUrl(target, { replaceUrl: true });
				}),
				finalize(() => {
					if (source === 'authorization_code') this.authorizationCodeExchangeInFlight = false;
				}),
			)
			.subscribe({
				error: () => {
					if (source === 'authorization_code') {
						this.clearAuthorizationCallback();
						this.logIn();
					} else {
						this.logOff();
					}
				},
			});
	}

	// --------------------------------------------------------------------------------------------------
	private clearAuthorizationCallback() {
		const url = new URL(window.location.href);
		url.searchParams.delete('code');
		url.searchParams.delete('state');

		if (url.hash.includes('code=')) {
			const hashPath = url.hash.split('?')[0];
			url.hash = hashPath && hashPath !== '#' ? hashPath : '#/';
		}

		window.history.replaceState(null, document.title, url.toString());
	}
}

/** Only an OAuth callback may reuse a pending return path; a new deep link replaces stale state. */
export function captureLoginReturnPath(
	href: string,
	baseUri: string,
	pending: string | null,
): string {
	return authorizationCode(href) !== null ? (pending ?? '/') : loginReturnPath(href, baseUri);
}

/** The single-use code of a root, hash or hash-route OAuth callback; null for any other URL. */
export function authorizationCode(href: string): string | null {
	const url = new URL(href);
	const hash = url.hash.slice(1);
	const route = hash.startsWith('/') ? new URL(hash, url.origin) : url;
	return route.searchParams.get('code') ?? new URLSearchParams(hash).get('code');
}

/** Preserve the application route, selected view and fragment across an OAuth round trip. */
export function loginReturnPath(href: string, baseUri: string): string {
	const url = new URL(href);
	const base = new URL(baseUri).pathname;
	const hash = url.hash.slice(1);
	const route = hash.startsWith('/') ? new URL(hash, url.origin) : url;
	if (authorizationCode(href) !== null) return '/';
	route.searchParams.delete('state');
	let path = route.pathname;
	if (!hash.startsWith('/') && base !== '/' && path.startsWith(base))
		path = '/' + path.slice(base.length);
	if (path === '/index.html') path = '/';
	return path + route.search + route.hash;
}
