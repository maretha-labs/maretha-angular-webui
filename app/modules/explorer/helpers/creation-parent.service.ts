import { LocalizedUiError } from '@maretha/webui-sdk';
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { DocumentCreateContext } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { hasPermission } from 'app/helpers/document-permissions';
export interface CreationDestination {
	document: any;
	types: DocumentCreateContext['types'];
	allowed: boolean;
}
export function canCreateIn(document: any): boolean {
	return (
		!!document?.facets?.includes('Folderish') &&
		hasPermission(document, 'AddChildren') &&
		!document.isTrashed &&
		!document.isVersion &&
		!document.isProxy &&
		!document.isRecord &&
		!document.hasLegalHold &&
		!document.retainUntil
	);
}
export function allowsCreateType(document: any, type: string): boolean {
	return (
		canCreateIn(document) &&
		!!document.contextParameters?.subtypes?.some(
			(t: any) => t.type === type && !t.facets?.includes('HiddenInCreation'),
		)
	);
}
@Injectable({ providedIn: 'root' })
export class CreationParentService {
	private readonly http = inject(HttpClient);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;
	private repositoryApi(repository: string): string {
		return repository === 'default'
			? this.api
			: `${this.api}/repo/${encodeURIComponent(repository)}`;
	}
	read(path: string, repository = 'default'): Observable<any> {
		if (!path.startsWith('/'))
			throw new LocalizedUiError(
				'app.state.enter-an-absolute-repository-path-d6ebeb',
				'Enter an absolute repository path.',
			);
		return this.http.get(
			`${this.repositoryApi(repository)}/path${path.split('/').map(encodeURIComponent).join('/')}`,
			{
				headers: { 'enrichers-document': 'permissions,subtypes', properties: 'dublincore' },
			},
		);
	}
	readId(uid: string, repository = 'default'): Observable<any> {
		return this.http.get(`${this.repositoryApi(repository)}/id/${encodeURIComponent(uid)}`, {
			headers: { 'enrichers-document': 'permissions,subtypes', properties: 'dublincore' },
		});
	}
	load(path: string, repository = 'default'): Observable<CreationDestination> {
		return this.read(path, repository).pipe(
			switchMap((document) => {
				const subtypes: any[] = canCreateIn(document)
					? (document.contextParameters?.subtypes ?? []).filter(
							(t: any) => !t.facets?.includes('HiddenInCreation'),
						)
					: [];
				const types = subtypes.map((t) =>
					this.http.get<any>(`${this.api}/config/types/${encodeURIComponent(t.type)}`).pipe(
						map((meta) => ({
							name: t.type,
							label: t.type,
							// Note stores a text clob rather than file:content, but is a supported
							// file-import destination. Keep this explicit so other non-blob types
							// do not accidentally acquire an import action.
							file: meta.schemas?.some((s: any) => s.name === 'file') === true || t.type === 'Note',
							folder: t.facets?.includes('Folderish') === true,
						})),
					),
				);
				return (types.length ? forkJoin(types) : of([])).pipe(
					map((types) => ({
						document: {
							...document,
							ng: {
								...document.ng,
								isFolder: document.facets?.includes('Folderish') === true,
								subTypes: types.map((t) => ({
									name: t.name,
									label: t.label,
									schemas: { file: t.file },
									isFolder: t.folder,
								})),
							},
						},
						types,
						allowed: canCreateIn(document),
					})),
				);
			}),
		);
	}
}
