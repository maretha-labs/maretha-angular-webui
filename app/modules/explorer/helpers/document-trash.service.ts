import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from 'environments/environment';
import { ToastService } from 'app/helpers/toast.service';
import { defer, finalize, Observable, Subject, tap } from 'rxjs';
import { LayoutService } from './layout.service';

@Injectable({
	providedIn: 'root',
})
export class DocumentTrashService {
	private readonly messages = inject(WebUiMessages);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly automationUrl = `${this.apiUrl}/automation`;

	documentsMovedToTrash$ = new Subject<string[]>();
	documentsRestoredFromTrash$ = new Subject<string[]>();
	documentsPurged$ = new Subject<string[]>();
	trashEmptied$ = new Subject();
	fetchingDocuments$ = new Subject<boolean>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly layoutService: LayoutService,
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastService,
	) {}

	// --------------------------------------------------------------------------------------------------
	loadMore(documentPath: string, currentPage = 0): Observable<any> {
		let query = `?currentPageIndex=${currentPage}&pageSize=${this.layoutService.pageSize}`;

		if (this.layoutService.sortFields)
			query += `&sortBy=${this.layoutService.sortFields.join(',')}&sortOrder=${this.layoutService.sortAscending ? 'asc' : 'desc'}`;

		if (documentPath) query += `&ecm_path=${encodeURIComponent(JSON.stringify([documentPath]))}`;

		const url = `${this.apiUrl}/search/pp/default_trash_search/execute${query}`;
		const headers = {
			headers: new HttpHeaders({
				'enrichers-document':
					'thumbnail,permissions,highlight,subscribedNotifications,thumbnail,renditions',
				properties: '*', //'dublincore,common,uid',
				'fetch-aggregate': 'key',
				'fetch-document': 'properties',
			}),
		};

		return defer(() => {
			this.fetchingDocuments$.next(true);
			return this.httpClient
				.get(url, headers)
				.pipe(finalize(() => this.fetchingDocuments$.next(false)));
		});
	}

	// --------------------------------------------------------------------------------------------------
	moveDocumentsToTrash(documentUids: string[], repository = 'default') {
		const url = `${this.automationUrl}/Document.Trash`;

		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: `docs:${documentUids.join(',')}`,
				},
				{ headers: { 'X-NXRepository': repository, 'nx-es-sync': 'true' } },
			)
			.pipe(
				tap(() => {
					const message = this.messages.format(
						'app.services.trash.moved',
						{ count: documentUids.length },
						'{count, plural, one {# document has been moved to trash.} other {# documents have been moved to trash.}}',
					);

					this.toastrService.success(
						message,
						this.messages.format('app.services.trash.removed-title', {}, 'Documents removed'),
						{ enableHtml: false },
					);

					this.documentsMovedToTrash$.next(documentUids);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	restoreDocumentsFromTrash(documentUids: string[], repository = 'default') {
		const url = `${this.automationUrl}/Document.Untrash`;

		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: `docs:${documentUids.join(',')}`,
				},
				{ headers: { 'X-NXRepository': repository } },
			)
			.pipe(
				tap(() => {
					const message = this.messages.format(
						'app.services.trash.restored',
						{ count: documentUids.length },
						'{count, plural, one {# document has been restored from trash.} other {# documents have been restored from trash.}}',
					);

					this.toastrService.success(
						message,
						this.messages.format('app.services.trash.restored-title', {}, 'Documents restored'),
						{ enableHtml: false },
					);

					this.documentsRestoredFromTrash$.next(documentUids);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	purgeDocuments(documentUids: string[], repository = 'default') {
		const url = `${this.automationUrl}/Document.Delete`;

		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: `docs:${documentUids.join(',')}`,
				},
				{ headers: { 'X-NXRepository': repository } },
			)
			.pipe(
				tap(() => {
					const message = this.messages.format(
						'app.services.trash.purged',
						{ count: documentUids.length },
						'{count, plural, one {# document has been permanently deleted.} other {# documents have been permanently deleted.}}',
					);

					this.toastrService.success(
						message,
						this.messages.format('app.services.trash.purged-title', {}, 'Documents purged'),
						{ enableHtml: false },
					);

					this.documentsPurged$.next(documentUids);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	emptyTrash(parentDocument?: any) {
		const url = `${this.automationUrl}/Document.EmptyTrash`;

		const payload = {
			params: {
				parent: parentDocument?.uid || '00000000-0000-0000-0000-000000000000',
			},
		};

		return this.httpClient.post(url, payload).pipe(
			tap(() => {
				const message = parentDocument?.title
					? this.messages.format(
							'app.services.trash.emptied-folder',
							{ title: parentDocument.title },
							'All trashed documents inside “{title}” have been permanently removed.',
						)
					: this.messages.format(
							'app.services.trash.emptied-all',
							{},
							'All trashed documents have been permanently removed.',
						);

				this.toastrService.success(
					message,
					this.messages.format('app.services.trash.emptied-title', {}, 'Trash emptied'),
					{ enableHtml: false },
				);

				this.trashEmptied$.next(null);
			}),
		);
	}
}
