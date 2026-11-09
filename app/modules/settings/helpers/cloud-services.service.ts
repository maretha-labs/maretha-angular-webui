import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'environments/environment';
import { map } from 'rxjs';
import { CloudServiceProvider } from '../models/cloud-service-provider';
import { CloudClient } from '../models/cloud-client';
import { CloudApplication } from '../models/cloud-application';
import { CloudAccount } from '../models/cloud-account';

@Injectable({
	providedIn: 'root',
})
export class CloudServicesService {
	private apiUrl = `${environment.nuxeoUrl}/api/v1`;

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly httpClient: HttpClient) {}

	// --------------------------------------------------------------------------------------------------
	getProviders() {
		const url = `${this.apiUrl}/oauth2/provider`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		return this.httpClient.get(url, { headers }).pipe(map((x: any) => x.entries));
	}

	// --------------------------------------------------------------------------------------------------
	addProvider(provider: CloudServiceProvider) {
		const url = `${this.apiUrl}/oauth2/provider`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...provider };
		payload['entity-type'] = 'nuxeoOAuth2ServiceProvider';

		return this.httpClient.post(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	updateProvider(serviceName: string, provider: CloudServiceProvider) {
		const url = `${this.apiUrl}/oauth2/provider/${serviceName}`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...provider };
		payload['entity-type'] = 'nuxeoOAuth2ServiceProvider';

		return this.httpClient.put(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	deleteProvider(provider: CloudServiceProvider) {
		const url = `${this.apiUrl}/oauth2/provider/${provider.serviceName}`;

		return this.httpClient.delete(url);
	}

	// --------------------------------------------------------------------------------------------------
	getClients() {
		const url = `${this.apiUrl}/oauth2/client`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		return this.httpClient.get(url, { headers }).pipe(map((x: any) => x.entries));
	}

	// --------------------------------------------------------------------------------------------------
	addClient(client: CloudClient) {
		const url = `${this.apiUrl}/oauth2/client`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...client };
		payload['entity-type'] = 'oauth2Client';

		return this.httpClient.post(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	updateClient(client: CloudClient) {
		const url = `${this.apiUrl}/oauth2/client/${client.id}`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...client };
		payload['entity-type'] = 'oauth2Client';

		return this.httpClient.put(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	deleteClient(client: CloudClient) {
		const url = `${this.apiUrl}/oauth2/client/${client.id}`;

		return this.httpClient.delete(url);
	}

	// --------------------------------------------------------------------------------------------------
	getApplications() {
		const url = `${this.apiUrl}/oauth2/token/AS_PROVIDER`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		return this.httpClient.get(url, { headers }).pipe(map((x: any) => x.entries));
	}

	// --------------------------------------------------------------------------------------------------
	updateApplication(application: CloudApplication) {
		const url = `${this.apiUrl}/oauth2/token/AS_PROVIDER/${application.nuxeoLogin}`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...application };
		payload['entity-type'] = 'nuxeoOAuth2Token';

		return this.httpClient.put(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	revokeApplication(application: CloudApplication) {
		const url = `${this.apiUrl}/oauth2/token/AS_PROVIDER/${application.nuxeoLogin}`;

		return this.httpClient.delete(url);
	}

	// --------------------------------------------------------------------------------------------------
	getAccounts() {
		const url = `${this.apiUrl}/oauth2/token/AS_CLIENT`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		return this.httpClient.get(url, { headers }).pipe(map((x: any) => x.entries));
	}

	// --------------------------------------------------------------------------------------------------
	updateAccount(account: CloudAccount) {
		const url = `${this.apiUrl}/oauth2/token/AS_CLIENT/${account.nuxeoLogin}`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload: any = { ...account };
		payload['entity-type'] = 'nuxeoOAuth2Token';

		return this.httpClient.put(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	deleteAccount(account: CloudAccount) {
		const url = `${this.apiUrl}/oauth2/token/AS_CLIENT/${account.nuxeoLogin}`;

		return this.httpClient.delete(url);
	}
}
