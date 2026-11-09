import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { WebUiMessages } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { UserAuthorizedAppsPageComponent } from './user-authorized-apps-page.component';
import { UserCloudServicesPageComponent } from './user-cloud-services-page.component';

const api = `${environment.nuxeoUrl}/api/v1`;

describe('Authorized application page', () => {
	let fixture: ComponentFixture<UserAuthorizedAppsPageComponent>;
	let http: HttpTestingController;
	const application = {
		client: { id: 'client/a', name: 'Save.customer.literal' },
		token: { clientId: 'client/a', creationDate: '2026-01-01', nuxeoLogin: 'user/a' },
	};
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [UserAuthorizedAppsPageComponent],
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
		fixture = TestBed.createComponent(UserAuthorizedAppsPageComponent);
	});
	afterEach(() => http.verify());
	const load = () => {
		http
			.expectOne(`${api}/oauth2/client`)
			.flush({ entries: [application.client, { id: 'without-token', name: 'Ignored' }] });
		http.expectOne(`${api}/oauth2/token/client`).flush({ entries: [application.token] });
	};
	it('joins current tokens, localizes confirmation/failure and preserves customer names and endpoint identities', () => {
		load();
		const component = fixture.componentInstance;
		expect(component.applications()).toEqual([application]);
		expect(component.loading()).toBeFalse();
		const messages = TestBed.inject(WebUiMessages);
		messages.register('accounts-test', {
			fr: {
				'app.components.user-authorized-apps-page.confirm': 'Révoquer {name} ?',
				'app.components.user-authorized-apps-page.failed': 'Échec pour {name}.',
			},
		});
		messages.locale.set('fr');
		const confirm = spyOn(window, 'confirm').and.returnValue(true);
		component.revoke(application);
		component.revoke(application);
		expect(confirm).toHaveBeenCalledOnceWith('Révoquer Save.customer.literal ?');
		const request = http.expectOne(`${api}/oauth2/token/client/client%2Fa/user/user%2Fa`);
		expect(request.request.method).toBe('DELETE');
		request.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(component.revokingId()).toBeNull();
		expect(component.error()).toBe('Échec pour Save.customer.literal.');
		messages.locale.set('en-US');
		expect(component.error()).toBe('Could not revoke Save.customer.literal.');
		expect(component.applications()[0].client.name).toBe('Save.customer.literal');
	});
	it('does not revoke after cancellation and refreshes the joined list after successful revoke', () => {
		load();
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		fixture.componentInstance.revoke(application);
		http.expectNone((request) => request.method === 'DELETE');
		confirm.and.returnValue(true);
		fixture.componentInstance.revoke(application);
		http.expectOne(`${api}/oauth2/token/client/client%2Fa/user/user%2Fa`).flush(null);
		expect(fixture.componentInstance.loading()).toBeTrue();
		http.expectOne(`${api}/oauth2/client`).flush({ entries: [application.client] });
		http.expectOne(`${api}/oauth2/token/client`).flush({ entries: [] });
		expect(fixture.componentInstance.applications()).toEqual([]);
	});
	it('treats a forbidden client registry as the stock empty table for plain users', () => {
		http.expectOne(`${api}/oauth2/client`).flush({}, { status: 403, statusText: 'Forbidden' });
		http.expectOne(`${api}/oauth2/token/client`).flush({ entries: [] });
		expect(fixture.componentInstance.loading()).toBeFalse();
		expect(fixture.componentInstance.error()).toBe('');
		expect(fixture.componentInstance.applications()).toEqual([]);
	});
	it('clears loading on failure and cancels outstanding loads when destroyed', () => {
		const clients = http.expectOne(`${api}/oauth2/client`);
		const tokens = http.expectOne(`${api}/oauth2/token/client`);
		clients.flush({}, { status: 500, statusText: 'Server Error' });
		expect(tokens.cancelled).toBeTrue();
		expect(fixture.componentInstance.loading()).toBeFalse();
		expect(fixture.componentInstance.error()).toContain('Authorized applications are unavailable');
		fixture.componentInstance.refresh();
		const pending = http.match((request) => request.method === 'GET');
		fixture.destroy();
		expect(pending.length).toBe(2);
		expect(pending.every((request) => request.cancelled)).toBeTrue();
	});
});

describe('Cloud account page', () => {
	let fixture: ComponentFixture<UserCloudServicesPageComponent>;
	let http: HttpTestingController;
	const account = {
		serviceName: 'Customer/cloud',
		nuxeoLogin: 'customer',
		serviceLogin: 'Save.customer.literal',
		creationDate: new Date('2026-01-01'),
	};
	const provider = {
		serviceName: 'Customer/cloud',
		isEnabled: true,
		authorizationURL: 'https://provider.invalid/authorize',
	};
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [UserCloudServicesPageComponent],
			providers: [provideHttpClient(), provideHttpClientTesting()],
		});
		http = TestBed.inject(HttpTestingController);
		fixture = TestBed.createComponent(UserCloudServicesPageComponent);
	});
	afterEach(() => http.verify());
	const load = () => {
		http
			.expectOne(`${api}/oauth2/provider/`)
			.flush({ entries: [provider, { serviceName: 'disabled', isEnabled: false }] });
		http.expectOne(`${api}/oauth2/token/provider`).flush({ entries: [account] });
	};
	it('filters disabled providers and localizes disconnect errors while preserving account data', () => {
		load();
		const component = fixture.componentInstance;
		expect(component.enabledProviders()).toEqual([provider]);
		const messages = TestBed.inject(WebUiMessages);
		messages.register('cloud-test', {
			fr: {
				'app.components.user-cloud-services-page.confirm': 'Déconnecter {name} ?',
				'app.components.user-cloud-services-page.failed': 'Échec pour {name}.',
			},
		});
		messages.locale.set('fr');
		const confirm = spyOn(window, 'confirm').and.returnValue(true);
		component.disconnect(account);
		component.disconnect(account);
		expect(confirm).toHaveBeenCalledOnceWith('Déconnecter Customer/cloud ?');
		http
			.expectOne(`${api}/oauth2/token/provider/Customer%2Fcloud`)
			.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(component.error()).toBe('Échec pour Customer/cloud.');
		messages.locale.set('en-US');
		expect(component.error()).toBe('Could not disconnect Customer/cloud.');
		expect(component.accounts()[0].serviceLogin).toBe('Save.customer.literal');
		expect(component.disconnectingKey()).toBeNull();
	});
	it('honors cancellation and reloads after successful disconnect', () => {
		load();
		const confirm = spyOn(window, 'confirm').and.returnValue(false);
		fixture.componentInstance.disconnect(account);
		http.expectNone((request) => request.method === 'DELETE');
		confirm.and.returnValue(true);
		fixture.componentInstance.disconnect(account);
		http.expectOne(`${api}/oauth2/token/provider/Customer%2Fcloud`).flush(null);
		load();
		expect(fixture.componentInstance.disconnectingKey()).toBeNull();
	});
	it('refreshes after popup closure and clears popup polling on destroy', fakeAsync(() => {
		load();
		const popup = { closed: false };
		const open = spyOn(window, 'open').and.returnValue(popup as Window);
		const component = fixture.componentInstance;
		component.connect({ serviceName: 'no-url', isEnabled: true });
		expect(open).not.toHaveBeenCalled();
		component.connect(provider);
		component.connect(provider);
		expect(open).toHaveBeenCalledTimes(1);
		tick(100);
		expect(component.connecting()).toBeTrue();
		popup.closed = true;
		tick(100);
		load();
		expect(component.connecting()).toBeFalse();
		popup.closed = false;
		component.connect(provider);
		fixture.destroy();
		tick(300);
		http.expectNone((request) => request.method === 'GET');
	}));
	it('reports load failures without retaining a loading state', () => {
		const providers = http.expectOne(`${api}/oauth2/provider/`);
		const accounts = http.expectOne(`${api}/oauth2/token/provider`);
		providers.flush({}, { status: 500, statusText: 'Failure' });
		expect(accounts.cancelled).toBeTrue();
		expect(fixture.componentInstance.loading()).toBeFalse();
		expect(fixture.componentInstance.error()).toContain('Cloud services are unavailable');
	});
});
