import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { environment } from 'environments/environment';

export const AUTH_STORAGE_SCOPE = new InjectionToken<string>('WebUI authentication storage scope', {
	providedIn: 'root',
	factory: () =>
		JSON.stringify([environment.nuxeoUrl, environment.authClientId, environment.webAppUrl]),
});

@Injectable({
	providedIn: 'root',
})
export class TokenService {
	private readonly prefix = `maretha.auth.${encodeURIComponent(inject(AUTH_STORAGE_SCOPE))}.`;
	private readonly _tokenUpdated = signal<string | null>(
		this.isAccessTokenValid ? this.accessToken : null,
	);
	readonly tokenUpdated = this._tokenUpdated.asReadonly();
	readonly tokenUpdated$ = toObservable(this._tokenUpdated);
	isAdministrator?: boolean;

	// --------------------------------------------------------------------------------------------------
	get accessToken(): string | null {
		const accessToken = sessionStorage.getItem(this.prefix + 'accessToken');

		if (accessToken) return accessToken;

		return null;
	}

	// --------------------------------------------------------------------------------------------------
	set accessToken(token: any) {
		if (token) {
			sessionStorage.setItem(this.prefix + 'accessToken', token.access_token);

			const accessTokenValidity = new Date();
			accessTokenValidity.setSeconds(accessTokenValidity.getSeconds() + parseInt(token.expires_in));

			sessionStorage.setItem(this.prefix + 'accessTokenValidity', accessTokenValidity.toString());
		} else {
			for (const key of ['accessToken', 'accessTokenValidity', 'refreshToken'])
				sessionStorage.removeItem(this.prefix + key);
		}

		this._tokenUpdated.set(token?.access_token ?? null);
	}

	// --------------------------------------------------------------------------------------------------
	get isAccessTokenValid(): boolean {
		const accessToken = this.accessToken;
		if (!accessToken) return false;

		const accessTokenValidity = sessionStorage.getItem(this.prefix + 'accessTokenValidity');
		if (!accessTokenValidity) return false;

		return new Date(accessTokenValidity) > new Date();
	}

	get refreshToken(): string | null {
		return sessionStorage.getItem(this.prefix + 'refreshToken');
	}
	set refreshToken(value: string | null) {
		this.store('refreshToken', value);
	}
	get returnUrl(): string | null {
		return sessionStorage.getItem(this.prefix + 'returnUrl');
	}
	set returnUrl(value: string | null) {
		this.store('returnUrl', value);
	}
	private store(key: string, value: string | null): void {
		if (value === null) sessionStorage.removeItem(this.prefix + key);
		else sessionStorage.setItem(this.prefix + key, value);
	}
}
