import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';

import { AUTH_STORAGE_SCOPE, TokenService } from './token.service';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';

describe('TokenService', () => {
	let service: TokenService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(TokenService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});

describe('Application-scoped authentication storage', () => {
	let first: EnvironmentInjector;
	let second: EnvironmentInjector;
	beforeEach(() => {
		TestBed.configureTestingModule({});
		const parent = TestBed.inject(EnvironmentInjector);
		first = createEnvironmentInjector(
			[TokenService, { provide: AUTH_STORAGE_SCOPE, useValue: 'token-spec-first' }],
			parent,
		);
		second = createEnvironmentInjector(
			[TokenService, { provide: AUTH_STORAGE_SCOPE, useValue: 'token-spec-second' }],
			parent,
		);
	});
	afterEach(() => {
		for (const injector of [first, second]) {
			const service = injector.get(TokenService);
			service.accessToken = null;
			service.returnUrl = null;
			injector.destroy();
		}
		sessionStorage.removeItem('unrelated-fixture');
	});
	it('isolates two clients on the same origin and preserves other state on logout', () => {
		const a = first.get(TokenService),
			b = second.get(TokenService);
		a.accessToken = { access_token: 'first-token', expires_in: 3600 };
		b.accessToken = { access_token: 'second-token', expires_in: 3600 };
		a.refreshToken = 'first-refresh';
		b.refreshToken = 'second-refresh';
		a.returnUrl = '/browse/documents/first?view=edit';
		sessionStorage.setItem('unrelated-fixture', 'preserve');
		expect(a.isAccessTokenValid).toBeTrue();
		expect(b.accessToken).toBe('second-token');
		a.accessToken = null;
		expect(a.isAccessTokenValid).toBeFalse();
		expect(a.refreshToken).toBeNull();
		expect(a.returnUrl).toBe('/browse/documents/first?view=edit');
		expect(b.accessToken).toBe('second-token');
		expect(b.refreshToken).toBe('second-refresh');
		expect(sessionStorage.getItem('unrelated-fixture')).toBe('preserve');
	});
	it('rejects expired tokens and invalid validity dates', () => {
		const a = first.get(TokenService);
		a.accessToken = { access_token: 'old', expires_in: -1 };
		expect(a.isAccessTokenValid).toBeFalse();
		a.accessToken = { access_token: 'invalid', expires_in: 'not-a-number' };
		expect(a.isAccessTokenValid).toBeFalse();
	});
});
