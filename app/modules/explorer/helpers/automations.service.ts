import { updateToastText } from 'app/helpers/update-toast-text';
import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, Injector, inject, signal, effect } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { environment } from 'environments/environment';
import { ActiveToast, ToastrService } from 'ngx-toastr';
import { catchError, delay, EMPTY, expand, last, of, Subject, switchMap, tap } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class AutomationsService {
	private readonly messages = inject(WebUiMessages);
	private readonly progressNotifications = signal<
		readonly { toast: ActiveToast<any>; operation: string; progress: number }[]
	>([]);
	private apiUrl = `${environment.nuxeoUrl}/api/v1`;

	documentPublished$ = new Subject<{
		targetUid: string;
		documentUid: string;
		repository?: string;
	}>();

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastrService,
	) {
		effect(() => {
			for (const entry of this.progressNotifications()) {
				updateToastText(
					entry.toast,
					this.messages.format(
						'app.services.automations.progress',
						{ progress: entry.progress },
						'Progress: {progress, number, percent}…',
					),
					this.messages.format(
						'app.services.automations.title',
						{ operation: entry.operation },
						'Bulk action {operation}',
					),
				);
			}
		});
		const bulkActions = this.bulkActions;

		for (const commandId in bulkActions) {
			if (Object.prototype.hasOwnProperty.call(bulkActions, commandId)) {
				const bulkAction = bulkActions[commandId];

				const progress = bulkAction.total ? (bulkAction.processed / bulkAction.total) * 100 : 0;

				const _toastr = this.progressToast(bulkAction.operationId, progress / 100);
			}
		}
	}

	private progressToast(operation: string, progress: number): ActiveToast<any> {
		const toast = this.toastrService.info(
			this.messages.format(
				'app.services.automations.progress',
				{ progress },
				'Progress: {progress, number, percent}…',
			),
			this.messages.format(
				'app.services.automations.title',
				{ operation },
				'Bulk action {operation}',
			),
			{ enableHtml: false, disableTimeOut: true, tapToDismiss: false },
		);
		this.progressNotifications.update((entries) => [...entries, { toast, operation, progress }]);
		return toast;
	}
	private removeProgressToast(toast: ActiveToast<any>): void {
		this.progressNotifications.update((entries) =>
			entries.filter((entry) => entry.toast !== toast),
		);
		this.toastrService.remove(toast.toastId);
	}

	// --------------------------------------------------------------------------------------------------
	getDirectoryEntries(
		directoryName: string,
		searchTerm?: string,
		dbl10n = true,
		localize = true,
		lang = 'en',
	) {
		const url = `${this.apiUrl}/automation/Directory.SuggestEntries`;

		const headers = new HttpHeaders({
			properties: '*',
			'X-NXRepository': 'default',
		});

		const payload = {
			context: {},
			params: {
				directoryName,
				dbl10n,
				localize,
				lang,
				searchTerm,
			},
		};

		return this.httpClient.post(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	getPageProviderDocuments(
		pageProviderName: string,
		searchTerm?: string,
		schemas = ['*'],
		pageSize = 20,
		repository = 'default',
	) {
		const url = `${this.apiUrl}/automation/Repository.PageProvider`;

		const headers = new HttpHeaders({
			properties: '*',
			'X-NXRepository': repository,
		});

		const payload = {
			context: {},
			params: {
				pageProviderName,
				providerName: pageProviderName,
				documentSchemas: schemas,
				repository,
				page: 0,
				pageSize,
				searchTerm,
			},
		};

		return this.httpClient.post(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	publishToSection(
		documentUid: string,
		targetUid: string,
		override = false,
		renditionName?: string,
		repository?: string,
	) {
		const url = `${this.apiUrl}/automation/Document.PublishToSection`;

		const headers = new HttpHeaders({
			properties: '*',
			'X-NXRepository': repository ?? 'default',
			...(repository === undefined ? {} : { 'nx-es-sync': 'true' }),
		});

		const payload = {
			context: {},
			input: documentUid,
			params: {
				target: targetUid,
				override,
				renditionName,
			},
		};

		return this.httpClient.post(url, payload, { headers }).pipe(
			tap(() =>
				this.documentPublished$.next({
					documentUid,
					targetUid,
					...(repository === undefined ? {} : { repository }),
				}),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private readonly injector = inject(Injector);
	async bulkDownloadAsZip(
		documentUid: string,
		fileName: string,
		repository = 'default',
	): Promise<void> {
		const { BulkZipDownloadDialogComponent } =
			await import('../components/document-toolbar/bulk-zip-download-dialog.component');
		this.injector.get(BsModalService).show(BulkZipDownloadDialogComponent, {
			initialState: {
				documentId: documentUid,
				repository,
				filename: fileName.endsWith('.zip') ? fileName : `${fileName}.zip`,
			},
			ignoreBackdropClick: true,
		});
	}

	// --------------------------------------------------------------------------------------------------
	bulkAddToCollection(
		collectionUid: string,
		documentsParentUid: string,
		pageProviderName = 'advanced_document_content',
		excludeDocs: any[] = [],
		_pageProviderParameters: any = {},
	) {
		return this.bulkAction(
			pageProviderName,
			BulkActions.AddToCollection,
			{ collection: collectionUid },
			excludeDocs,
			{
				ecm_parentId: documentsParentUid,
				ecm_trashed: false,
			},
		);
	}

	// --------------------------------------------------------------------------------------------------
	bulkRemoveFromCollection(
		collectionUid: string,
		pageProviderName = 'default_content_collection',
		excludeDocs: any[] = [],
	) {
		return this.bulkAction(
			pageProviderName,
			BulkActions.RemoveFromCollection,
			{ collection: collectionUid },
			excludeDocs,
			undefined,
			[collectionUid],
		);
	}

	// --------------------------------------------------------------------------------------------------
	bulkMoveToTrash(
		documentsParentUid: string,
		pageProviderName = 'advanced_document_content',
		excludeDocs: any[] = [],
	) {
		return this.bulkAction(pageProviderName, BulkActions.MoveToTrash, undefined, excludeDocs, {
			ecm_parentId: documentsParentUid,
			ecm_trashed: false,
		});
	}

	// --------------------------------------------------------------------------------------------------
	bulkPurge(
		documentsPath: string,
		pageProviderName = 'default_trash_search',
		excludeDocs: any[] = [],
	) {
		return this.bulkAction(pageProviderName, BulkActions.Purge, undefined, excludeDocs, {
			ecm_path: documentsPath,
		});
	}

	// --------------------------------------------------------------------------------------------------
	bulkRestoreFromTrash(
		documentsPath: string,
		pageProviderName = 'default_trash_search',
		excludeDocs: any[] = [],
	) {
		return this.bulkAction(pageProviderName, BulkActions.RestoreFromTrash, undefined, excludeDocs, {
			ecm_path: documentsPath,
		});
	}

	// --------------------------------------------------------------------------------------------------
	private bulkAction(
		pageProviderName: string,
		operation: BulkActions,
		operationParameters: any | undefined = undefined,
		excludeDocs: any[] = [],
		pageProviderParameters: any = {},
		queryParams: any[] = [],
	) {
		const toastr = this.progressToast(operation, 0);

		const url = `${this.apiUrl}/automation/Bulk.RunAction`;

		const headers = new HttpHeaders({
			properties: '*',
			// 'X-NXRepository': 'default'
		});

		const payload = {
			context: {},
			params: {
				action: 'automationUi',
				parameters: JSON.stringify({
					operationId: operation,
					parameters: operationParameters,
				}), // '{\'operationId\':\'Document.AddToCollection\',\'parameters\':{\'collection\':\'8650a8d5-70ce-48f7-9b41-322a9a13453c\'}}',
				providerName: pageProviderName, //: 'advanced_document_content',
				namedParameters: pageProviderParameters, // {'common_schema_assetTyp_agg': '[\'digital\']'},
				excludeDocs,
				currentPageIndex: 0,
				offset: 0,
				pageSize: 40,
				queryParams,
			},
		};

		return this.httpClient.post(url, payload, { headers, observe: 'response' }).pipe(
			switchMap((response) => {
				if (!response.body) return of();

				const responseBody: any = response.body;

				const commandId = responseBody.value.commandId;

				const bulkActions = this.bulkActions;
				bulkActions[commandId] = responseBody.value;
				bulkActions[commandId].operationId = operation;
				localStorage.setItem('bulkActions', JSON.stringify(bulkActions));

				return this.getBulkActionStatus(commandId, toastr);
			}),
			catchError((error) => {
				this.removeProgressToast(toastr);

				this.toastrService.error(
					error,
					this.messages.format('app.services.automations.error-title', {}, 'Bulk action error'),
					{ enableHtml: false },
				);

				return EMPTY;
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private getBulkActionStatus(commandId: string, toastr: ActiveToast<any>) {
		const query$ = this.httpClient.get(`${this.apiUrl}/bulk/${commandId}`);

		return query$.pipe(
			tap((x: any) => {
				const bulkActions = this.bulkActions;
				bulkActions[x.commandId] = { ...bulkActions[x.commandId], ...x };
				localStorage.setItem('bulkActions', JSON.stringify(bulkActions));

				this.progressNotifications.update((entries) =>
					entries.map((entry) =>
						entry.toast === toastr
							? { ...entry, progress: x.total ? x.processed / x.total : 0 }
							: entry,
					),
				);
				toastr.toastRef.componentInstance.message = this.messages.format(
					'app.services.automations.progress',
					{ progress: x.total ? x.processed / x.total : 0 },
					'Progress: {progress, number, percent}…',
				);
			}),
			delay(1000),
			// Keep polling for the status until finished
			expand((x: any) => (x.completed ? EMPTY : query$)),
			catchError((error) => {
				this.removeProgressToast(toastr);

				this.toastrService.error(
					error,
					this.messages.format('app.services.automations.error-title', {}, 'Bulk action error'),
					{ enableHtml: false },
				);

				return EMPTY;
			}),
			last(),
			tap((x: any) => {
				const bulkActions = this.bulkActions;
				delete bulkActions[x.commandId];
				localStorage.setItem('bulkActions', JSON.stringify(bulkActions));

				this.removeProgressToast(toastr);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private get bulkActions() {
		const bulkActionsAsString = localStorage.getItem('bulkActions');

		try {
			return bulkActionsAsString ? JSON.parse(bulkActionsAsString) : {};
		} catch {
			return {};
		}
	}
}

export enum BulkActions {
	AddToCollection = 'Document.AddToCollection',
	RemoveFromCollection = 'Document.RemoveFromCollection',
	MoveToTrash = 'Document.Trash',
	RestoreFromTrash = 'Document.Untrash',
	Purge = 'Document.Delete',
}
