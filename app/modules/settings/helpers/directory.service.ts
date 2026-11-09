import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { Observable } from 'rxjs';

export type DirectorySchema = 'vocabulary' | 'xvocabulary' | 'l10nvocabulary' | 'l10nxvocabulary';

export interface DirectoryMetadata {
	name: string;
	schema?: string;
	parent?: string;
	readOnly?: boolean;
	idField?: string;
}

export interface DirectoryEntry {
	id: string;
	directoryName: string;
	properties: Record<string, unknown>;
}

export interface DirectoryPage {
	entries: DirectoryEntry[];
	resultsCount?: number;
	isNextPageAvailable?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DirectoryService {
	private readonly url = `${environment.nuxeoUrl}/api/v1/directory`;

	constructor(private readonly http: HttpClient) {}

	listDirectories(): Observable<{ entries: DirectoryMetadata[] }> {
		return this.http.get<{ entries: DirectoryMetadata[] }>(this.url, {
			params: new HttpParams().set('pageSize', '0'),
		});
	}

	listEntries(name: string, currentPageIndex = 0, pageSize = 40): Observable<DirectoryPage> {
		return this.http.get<DirectoryPage>(`${this.url}/${encodeURIComponent(name)}`, {
			params: new HttpParams().set('currentPageIndex', currentPageIndex).set('pageSize', pageSize),
		});
	}

	create(name: string, entry: DirectoryEntry): Observable<DirectoryEntry> {
		return this.http.post<DirectoryEntry>(`${this.url}/${encodeURIComponent(name)}`, {
			'entity-type': 'directoryEntry',
			...entry,
		});
	}

	update(name: string, id: string, entry: DirectoryEntry): Observable<DirectoryEntry> {
		return this.http.put<DirectoryEntry>(
			`${this.url}/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
			{ 'entity-type': 'directoryEntry', ...entry },
		);
	}

	delete(name: string, id: string): Observable<void> {
		return this.http.delete<void>(
			`${this.url}/${encodeURIComponent(name)}/${encodeURIComponent(id)}`,
		);
	}
}

export function isVocabularyDirectory(
	directory: DirectoryMetadata,
): directory is DirectoryMetadata & { schema: DirectorySchema } {
	return ['vocabulary', 'xvocabulary', 'l10nvocabulary', 'l10nxvocabulary'].includes(
		directory.schema ?? '',
	);
}
