import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CloudServicesService } from './cloud-services.service';

describe('CloudServicesService', () => {
	let service: CloudServicesService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(CloudServicesService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('maps and sends OAuth2 provider, client and token requests against the Nuxeo REST endpoints', () => {
		const http = TestBed.inject(HttpTestingController);

		let providers: any[] = [];
		service.getProviders().subscribe((res) => (providers = res));
		http
			.expectOne((req) => req.method === 'GET' && req.url.endsWith('/oauth2/provider'))
			.flush({ entries: [{ serviceName: 'gdrive', clientId: 'cid', isEnabled: true }] });
		expect(providers.length).toBe(1);
		expect(providers[0].serviceName).toBe('gdrive');

		service.addProvider({ serviceName: 'box' } as any).subscribe();
		const addProv = http.expectOne(
			(req) => req.method === 'POST' && req.url.endsWith('/oauth2/provider'),
		);
		expect(addProv.request.body.serviceName).toBe('box');
		addProv.flush({});

		service.updateProvider('box', { serviceName: 'box', isEnabled: false } as any).subscribe();
		http
			.expectOne((req) => req.method === 'PUT' && req.url.endsWith('/oauth2/provider/box'))
			.flush({});

		service.deleteProvider({ serviceName: 'box' } as any).subscribe();
		http
			.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/oauth2/provider/box'))
			.flush({});

		let clients: any[] = [];
		service.getClients().subscribe((res) => (clients = res));
		http
			.expectOne((req) => req.method === 'GET' && req.url.endsWith('/oauth2/client'))
			.flush({ entries: [{ id: 'cli-1', name: 'Mobile Client', enabled: true }] });
		expect(clients[0].id).toBe('cli-1');

		service.addClient({ id: 'cli-2' } as any).subscribe();
		http.expectOne((req) => req.method === 'POST' && req.url.endsWith('/oauth2/client')).flush({});

		service.updateClient({ id: 'cli-2', enabled: false } as any).subscribe();
		http
			.expectOne((req) => req.method === 'PUT' && req.url.endsWith('/oauth2/client/cli-2'))
			.flush({});

		service.deleteClient({ id: 'cli-2' } as any).subscribe();
		http
			.expectOne((req) => req.method === 'DELETE' && req.url.endsWith('/oauth2/client/cli-2'))
			.flush({});

		let apps: any[] = [];
		service.getApplications().subscribe((res) => (apps = res));
		http
			.expectOne((req) => req.method === 'GET' && req.url.endsWith('/oauth2/token/AS_PROVIDER'))
			.flush({
				entries: [
					{ serviceName: 'gdrive', nuxeoLogin: 'Administrator', serviceLogin: 'admin@org' },
				],
			});
		expect(apps[0].serviceName).toBe('gdrive');

		service
			.updateApplication({ serviceName: 'gdrive', nuxeoLogin: 'Administrator' } as any)
			.subscribe();
		http
			.expectOne(
				(req) =>
					req.method === 'PUT' && req.url.endsWith('/oauth2/token/AS_PROVIDER/Administrator'),
			)
			.flush({});

		service
			.revokeApplication({ serviceName: 'gdrive', nuxeoLogin: 'Administrator' } as any)
			.subscribe();
		http
			.expectOne(
				(req) =>
					req.method === 'DELETE' && req.url.endsWith('/oauth2/token/AS_PROVIDER/Administrator'),
			)
			.flush({});

		http.verify();
	});
});
