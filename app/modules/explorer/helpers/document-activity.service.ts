import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { toObservable, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WebUiLocale } from '@maretha/webui-sdk';
import { environment } from 'environments/environment';
import { of, map, Observable, tap, forkJoin, filter, catchError, switchMap } from 'rxjs';

interface IInitialized {
	categories: any[];
	types: any[];
}

@Injectable({
	providedIn: 'root',
})
export class DocumentActivityService {
	private readonly locale = inject(WebUiLocale);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private eventCategories: any[] = [];
	private eventTypes: any[] = [];

	private readonly _initialized = signal<IInitialized | null>(null);
	readonly initialized = this._initialized.asReadonly();
	readonly initialized$: Observable<IInitialized> = toObservable(this._initialized).pipe(
		filter((x): x is IInitialized => x !== null),
	);

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly httpClient: HttpClient) {
		toObservable(this.locale.locale)
			.pipe(
				switchMap((locale) => {
					this.eventTypes = [];
					this._initialized.set({ categories: [], types: [] });
					return forkJoin([
						this.getEventCategories(locale).pipe(catchError(() => of([]))),
						this.getEventTypes(locale).pipe(catchError(() => of([]))),
					]);
				}),
				takeUntilDestroyed(),
			)
			.subscribe(([categories, types]) => this._initialized.set({ categories, types }));
	}

	// --------------------------------------------------------------------------------------------------
	getDocumentActivity(
		documentUid: string,
		filters: any,
		currentPage = 1,
		pageSize = 40,
	): Observable<any> {
		if (!documentUid) return of();

		currentPage = currentPage > 0 ? currentPage : 1;
		pageSize = pageSize > 0 ? pageSize : 40;

		const url = `${this.apiUrl}/id/${documentUid}/@audit?currentPageIndex=${currentPage - 1}&pageSize=${pageSize}&${new URLSearchParams(filters).toString()}`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		return this.httpClient.get(url, headers).pipe(
			map((x: any) => {
				return {
					entries: x.entries.map((y: any) => {
						// const result = y.eventId.replace(/([a-z])([A-Z])/g, '$1 $2');
						// y.event = result.charAt(0).toUpperCase() + result.slice(1);
						y.event = this.eventTypes.find((z) => z.id === y.eventId)?.label || y.eventId;

						return y;
					}),
					canLoadMore: x.isNextPageAvailable,
				};
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getEventCategories(locale = this.locale.locale()) {
		const url = `${this.apiUrl}/automation/Directory.SuggestEntries`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {
				directoryName: 'eventCategories',
				dbl10n: false,
				localize: true,
				lang: locale,
				searchTerm: '',
			},
			context: {},
		};

		return this.httpClient
			.post<any[]>(url, payload, headers)
			.pipe(tap((x) => (this.eventCategories = x)));
	}

	// --------------------------------------------------------------------------------------------------
	getEventTypes(locale = this.locale.locale()) {
		const url = `${this.apiUrl}/automation/Directory.SuggestEntries`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {
				directoryName: 'eventTypes',
				dbl10n: false,
				localize: true,
				lang: locale,
				searchTerm: '',
			},
			context: {},
		};

		return this.httpClient
			.post<any[]>(url, payload, headers)
			.pipe(tap((x) => (this.eventTypes = x)));
	}
}
