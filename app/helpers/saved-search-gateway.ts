import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { SavedSearchDefinition, SavedSearchGateway, WebUiAppState } from '@maretha/webui-sdk';
import { firstValueFrom } from 'rxjs';

/** Stateless adapter: every request names its provider, so drawers stay isolated. */
@Injectable({ providedIn: 'root' })
export class NativeSavedSearchGateway implements SavedSearchGateway {
	private readonly http = inject(HttpClient);
	private readonly app = inject(WebUiAppState);
	private readonly api = `${this.app.nuxeoUrl.replace(/\/+$/, '')}/api/v1`;

	async list(providerName: string): Promise<readonly SavedSearchDefinition[]> {
		const result = await firstValueFrom(
			this.http.get<{ entries: SavedSearchDefinition[] }>(`${this.api}/search/saved`, {
				params: { pageProvider: providerName },
			}),
		);
		return [...(result.entries ?? [])].sort((a, b) => a.title.localeCompare(b.title));
	}

	save(
		providerName: string,
		title: string,
		params: Readonly<Record<string, unknown>>,
	): Promise<SavedSearchDefinition> {
		return firstValueFrom(
			this.http.post<SavedSearchDefinition>(`${this.api}/search/saved`, {
				'entity-type': 'savedSearch',
				pageProviderName: providerName,
				title,
				params,
			}),
		);
	}

	update(
		id: string,
		providerName: string,
		title: string,
		params: Readonly<Record<string, unknown>>,
	): Promise<SavedSearchDefinition> {
		return firstValueFrom(
			this.http.put<SavedSearchDefinition>(`${this.api}/search/saved/${encodeURIComponent(id)}`, {
				'entity-type': 'savedSearch',
				pageProviderName: providerName,
				title,
				params,
			}),
		);
	}

	remove(id: string): Promise<void> {
		return firstValueFrom(
			this.http.delete<void>(`${this.api}/search/saved/${encodeURIComponent(id)}`),
		);
	}

	async permissions(id: string): Promise<readonly string[]> {
		const document = await firstValueFrom(
			this.http.get<{ contextParameters?: { permissions?: string[] } }>(
				`${this.api}/id/${encodeURIComponent(id)}`,
				{ headers: { 'enrichers-document': 'permissions' } },
			),
		);
		return document.contextParameters?.permissions ?? [];
	}

	async share(id: string, principal: string, notify = false): Promise<void> {
		await firstValueFrom(
			this.http.post(`${this.api}/automation/Document.AddPermission`, {
				input: id,
				params: { username: principal, permission: 'Read', begin: null, end: null, notify },
			}),
		);
	}
}
