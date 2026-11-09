import { LocalizedUiError } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'environments/environment';
import { AutomationsService } from './automations.service';
import { hasPermission } from 'app/helpers/document-permissions';

export function isPublishableDocument(document: Readonly<Record<string, unknown>>): boolean {
	return (
		!!document['uid'] &&
		!document['isProxy'] &&
		!document['isTrashed'] &&
		!document['isRecord'] &&
		Array.isArray(document['facets']) &&
		document['facets'].includes('Publishable') &&
		hasPermission(document, 'WriteVersion')
	);
}

@Injectable({ providedIn: 'root' })
export class SelectionPublicationService {
	private readonly http = inject(HttpClient);
	private readonly automations = inject(AutomationsService);
	private readonly api = environment.nuxeoUrl + '/api/v1';

	async destinations(
		repository: string,
		searchTerm: string,
	): Promise<{ uid: string; path: string; title: string }[]> {
		const result = await firstValueFrom(
			this.http.post<{ entries: { uid: string; path: string; title: string }[] }>(
				this.api + '/automation/Repository.PageProvider',
				{
					params: {
						providerName: 'publish_space_suggestion',
						pageProviderName: 'publish_space_suggestion',
						repository,
						searchTerm,
						page: 0,
						pageSize: 100,
					},
				},
				{ headers: { 'X-NXRepository': repository } },
			),
		);
		return result.entries;
	}

	/** Re-read each explicit source immediately before mutation; the server checks target permissions. */
	async publish(
		uid: string,
		repository: string,
		target: string,
		override: boolean,
		renditionName?: string,
	): Promise<void> {
		const document = await firstValueFrom(
			this.http.get<Record<string, unknown>>(
				`${this.api}/repo/${encodeURIComponent(repository)}/id/${encodeURIComponent(uid)}`,
				{ headers: { 'enrichers-document': 'permissions', properties: '*' } },
			),
		);
		if (document['uid'] !== uid || !isPublishableDocument(document))
			throw new LocalizedUiError(
				'app.services.publication.no-longer-publishable',
				'The document is no longer publishable. Refresh the selection and check permissions.',
			);
		await firstValueFrom(
			this.http.post(
				this.api + '/automation/Document.PublishToSection',
				{ input: uid, params: { target, override, renditionName } },
				{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
			),
		);
		this.automations.documentPublished$.next({ documentUid: uid, targetUid: target });
	}
}
