import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { ResultsQueryScope, SchemaMetadata } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { firstValueFrom, Observable, takeUntil } from 'rxjs';
import { SpreadsheetRow } from './results-spreadsheet';

const PAGE_SIZE = 100;

interface PageResult {
	readonly entries?: readonly SpreadsheetRow[];
	readonly isNextPageAvailable?: boolean;
}

/** Loads every page of an applied query, like Polymer's spreadsheet query loop. */
@Injectable({ providedIn: 'root' })
export class ResultsSpreadsheetService {
	private readonly http = inject(HttpClient);
	private readonly api = `${environment.nuxeoUrl}/api/v1`;

	schemas(until: Observable<unknown>): Promise<readonly SchemaMetadata[]> {
		return firstValueFrom(
			this.http.get<readonly SchemaMetadata[]>(`${this.api}/config/schemas`).pipe(takeUntil(until)),
		);
	}

	async rows(scope: ResultsQueryScope, until: Observable<unknown>): Promise<SpreadsheetRow[]> {
		const headers = new HttpHeaders({
			properties: '*',
			'enrichers-document': 'permissions',
			'X-NXRepository': scope.repository,
		});
		const rows: SpreadsheetRow[] = [];
		for (let page = 0; ; page++) {
			let params = new HttpParams().set('currentPageIndex', page).set('pageSize', PAGE_SIZE);
			for (const value of scope.queryParams) params = params.append('queryParams', value);
			for (const [key, value] of Object.entries(scope.namedParameters))
				params = params.set(key, value);
			const result = await firstValueFrom(
				this.http
					.get<PageResult>(
						`${this.api}/search/pp/${encodeURIComponent(scope.providerName)}/execute`,
						{ headers, params },
					)
					.pipe(takeUntil(until)),
			);
			rows.push(...(result.entries ?? []));
			if (!result.isNextPageAvailable || !result.entries?.length) return rows;
		}
	}
}
