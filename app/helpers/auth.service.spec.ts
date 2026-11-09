import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NavigationStart, Router } from '@angular/router';

import {
	AuthService,
	authorizationCode,
	captureLoginReturnPath,
	loginReturnPath,
} from './auth.service';
import { BlobDeliveryService } from './blob-delivery.service';
import { TokenService } from './token.service';
import { Subject } from 'rxjs';

describe('AuthService', () => {
	let service: AuthService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(AuthService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
});

describe('Streaming session logout', () => {
	it('waits for browser-session revocation before starting the existing Nuxeo logout', () => {
		const revoked = new Subject<void>();
		const revokeSession = jasmine.createSpy('revokeSession').and.returnValue(revoked);
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: BlobDeliveryService, useValue: { revokeSession } },
			],
		});
		const append = spyOn(document.body, 'appendChild').and.callFake((node) => node);
		TestBed.inject(AuthService).logOff();
		expect(revokeSession).toHaveBeenCalledTimes(1);
		expect(append).not.toHaveBeenCalled();
		revoked.complete();
		expect(append).toHaveBeenCalledTimes(1);
		expect((append.calls.mostRecent().args[0] as HTMLIFrameElement).src).toContain('/logout');
	});
	it('continues the existing logout after a failed revocation attempt', () => {
		const revoked = new Subject<void>();
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: BlobDeliveryService, useValue: { revokeSession: () => revoked } },
			],
		});
		const append = spyOn(document.body, 'appendChild').and.callFake((node) => node);
		TestBed.inject(AuthService).logOff();
		revoked.error(new Error('Offline'));
		expect(append).toHaveBeenCalledTimes(1);
	});
});

describe('Login return path', () => {
	it('replaces stale return state with a fresh deep link', () => {
		expect(
			captureLoginReturnPath(
				'http://localhost:8080/nuxeo/ng/browse/documents/new?view=edit',
				'http://localhost:8080/nuxeo/ng/',
				'/dashboard',
			),
		).toBe('/browse/documents/new?view=edit');
	});
	it('preserves the pending destination through root and hash OAuth callbacks', () => {
		for (const href of [
			'http://localhost:4200/?code=one-use',
			'http://localhost:4200/#code=one-use',
			'http://localhost:4200/#/?code=one-use',
		])
			expect(
				captureLoginReturnPath(href, 'http://localhost:4200/', '/browse/documents/one?view=edit'),
			).toBe('/browse/documents/one?view=edit');
	});
	it('preserves view selection and fragment under a deployed application base', () => {
		expect(
			loginReturnPath(
				'http://localhost:8080/nuxeo/ng/browse/documents/one?view=edit#field',
				'http://localhost:8080/nuxeo/ng/',
			),
		).toBe('/browse/documents/one?view=edit#field');
	});
	it('treats the served index.html under the application base as the root route', () => {
		expect(
			loginReturnPath(
				'http://localhost:8080/nuxeo/ng/index.html',
				'http://localhost:8080/nuxeo/ng/',
			),
		).toBe('/');
	});
	it('supports legacy hash routes without treating OAuth callback codes as destinations', () => {
		expect(
			loginReturnPath(
				'http://localhost:4200/#/browse/documents/one?p=edit',
				'http://localhost:4200/',
			),
		).toBe('/browse/documents/one?p=edit');
		expect(
			loginReturnPath(
				'http://localhost:4200/?code=one-use&state=/browse',
				'http://localhost:4200/',
			),
		).toBe('/');
	});
});

describe('Authorization code', () => {
	it('reads the single-use code of root, hash and hash-route callbacks', () => {
		for (const href of [
			'http://localhost:4200/?code=one-use&state=%2Fsettings%3Fadmin%3Dusers',
			'http://localhost:8080/nuxeo/ng/#?code=one-use&state=%2Fsettings%3Fadmin%3Dusers',
			'http://localhost:4200/#code=one-use',
			'http://localhost:4200/#/?code=one-use',
		])
			expect(authorizationCode(href)).withContext(href).toBe('one-use');
	});
	it('finds no code in a deep link', () => {
		for (const href of [
			'http://localhost:8080/nuxeo/ng/settings?admin=users',
			'http://localhost:4200/#/browse/documents/one?p=edit',
		])
			expect(authorizationCode(href)).withContext(href).toBeNull();
	});
});

describe('Sign-in start', () => {
	const href = window.location.href;
	let navigation: Subject<NavigationStart>;
	let navigateByUrl: jasmine.Spy;
	let token: {
		isAccessTokenValid: boolean;
		accessToken: unknown;
		refreshToken: string | null;
		returnUrl: string | null;
		isAdministrator?: boolean;
	};

	beforeEach(() => {
		navigation = new Subject<NavigationStart>();
		navigateByUrl = jasmine.createSpy('navigateByUrl').and.resolveTo(true);
		token = {
			isAccessTokenValid: false,
			accessToken: null,
			refreshToken: null,
			returnUrl: '/settings?admin=users',
		};
		TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{
					provide: Router,
					useValue: {
						events: navigation.asObservable(),
						navigateByUrl,
						routerState: { snapshot: { url: '/' } },
					},
				},
				{ provide: TokenService, useValue: token },
			],
		});
	});
	afterEach(() => {
		history.replaceState(null, '', href);
		TestBed.inject(HttpTestingController).verify();
	});

	it('starts the sign-in when the first navigation starts, before a guard can hold it open', () => {
		const service = TestBed.inject(AuthService);
		const logIn = spyOn<any>(service, 'logIn');
		navigation.next(new NavigationStart(1, '/settings?admin=users'));
		expect(logIn).toHaveBeenCalledTimes(1);
		expect(navigateByUrl).not.toHaveBeenCalled();
	});

	it('exchanges the callback code once at navigation start and returns to the pending deep link', () => {
		history.replaceState(null, '', '#?code=one-use&state=%2Fsettings%3Fadmin%3Dusers');
		const service = TestBed.inject(AuthService);
		const logIn = spyOn<any>(service, 'logIn');
		const http = TestBed.inject(HttpTestingController);
		navigation.next(new NavigationStart(1, '/'));
		navigation.next(new NavigationStart(2, '/dashboard'));
		const exchange = http.expectOne((request) => request.url.endsWith('/oauth2/token'));
		expect(exchange.request.body.get('grant_type')).toBe('authorization_code');
		expect(exchange.request.body.get('code')).toBe('one-use');
		exchange.flush({ access_token: 'issued', expires_in: 3600 });
		http
			.expectOne((request) => request.url.endsWith('/api/v1/me/'))
			.flush({
				id: 'Administrator',
				extendedGroups: [],
				isAdministrator: true,
				isAnonymous: false,
			});
		expect(logIn).not.toHaveBeenCalled();
		expect(token.isAdministrator).toBeTrue();
		expect(service.userInfo()?.id).toBe('Administrator');
		expect(token.returnUrl).toBeNull();
		expect(navigateByUrl).toHaveBeenCalledOnceWith('/settings?admin=users', { replaceUrl: true });
	});
});
