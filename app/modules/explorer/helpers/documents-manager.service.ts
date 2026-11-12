import { WebUiMessages } from '@maretha/webui-sdk';
import { LocalizedUiError } from '@maretha/webui-sdk';
import {
	documentUrl,
	documentNavigationKey,
	documentRouteMatches,
	parseDocumentRoute,
	encodeDocumentPath,
} from 'app/helpers/document-route';
import { DocumentCreationError } from './document-creation-error';
import { CreationParentService, allowsCreateType } from './creation-parent.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, signal, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'app/helpers/auth.service';
import { TokenService } from 'app/helpers/token.service';
import { UserInfo } from 'app/models/user-info';
import { environment } from 'environments/environment';
import { ToastService } from 'app/helpers/toast.service';
import {
	filter,
	map,
	merge,
	tap,
	switchMap,
	forkJoin,
	of,
	catchError,
	Subject,
	Observable,
	EMPTY,
	defer,
	throwError,
} from 'rxjs';
import { DocumentBrowserService } from './document-browser.service';
import { DocumentClipboardService } from './document-clipboard.service';
import { DocumentCollectionsService } from './document-collections.service';
import { DocumentEnhancerService } from './document-enhancer.service';
import { DocumentHistoryService } from './document-history.service';
import { DocumentTrashService } from './document-trash.service';
import { LayoutService } from './layout.service';
import { documentNavigationPaths } from './document-navigation';

/** What a loaded document view needs, whether the document is read or returned by a write. */
const DOCUMENT_INFO_HEADERS = {
	'enrichers-blob': 'appLinks',
	'enrichers-document':
		'hasContent,documentURL,permissions,subscribedNotifications,thumbnail,renditions,pendingTasks,runnableWorkflows,runningWorkflows,subtypes,tags,publications,breadcrumb,collections,favorites,audit',
	properties: '*',
	'fetch-document': 'properties,lock',
};
/** Stock's sync-indexing: listings reloaded after this write already see it. */
const SYNC_INDEXING = { 'nx-es-sync': 'true' };
/** A write answered with one of these was not applied; any other failure can follow a commit. */
const REJECTED_WRITE_STATUSES = [400, 401, 403, 404, 405, 409, 412, 413, 415, 422];

@Injectable({
	providedIn: 'root',
})
export class DocumentsManagerService {
	private readonly messages = inject(WebUiMessages);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private _documents: any[] = [];
	private canonicalNavigation: string | null = null;
	private _deselectedDocuments: any[] = [];
	private _currentPage = 0;
	private _totalCount = 0;
	private _canLoadMore = true;
	private _selectionCount = 0;
	private currentUser: UserInfo | null = null;
	private _showOnlyTrashedDocuments = false;

	mode = DocumentManagerMode.Unknown;
	documentInfo: any;
	readonly fetchingDocument$ = new Subject<string | null>();
	private readonly _documentFetched = signal<any>(null);
	readonly documentFetched = this._documentFetched.asReadonly();
	readonly documentFetched$ = toObservable(this._documentFetched);
	private readonly _fetchingDocuments = signal(false);
	readonly fetchingDocuments = this._fetchingDocuments.asReadonly();
	readonly fetchingDocuments$ = new Subject<boolean>();
	readonly documentsUpdated$ = new Subject<any[]>();
	/** Successful creation commits, including destinations outside the currently displayed list. */
	readonly documentCreated$ = new Subject<{ repository: string; document: any }>();
	readonly selectedDocumentsUpdated$ = new Subject();
	/** Display mode of the folder listing on screen, or null when none is shown. */
	readonly listingDisplayMode = signal<'table' | 'grid' | null>(null);
	schemas: any = {};
	fields: any = {};
	_maxTotalCount = 200;

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly router: Router,
		private readonly route: ActivatedRoute,
		private readonly httpClient: HttpClient,
		private readonly layoutService: LayoutService,
		private readonly documentHistoryService: DocumentHistoryService,
		private readonly documentBrowserService: DocumentBrowserService,
		private readonly documentCollectionsService: DocumentCollectionsService,
		private readonly documentTrashService: DocumentTrashService,
		private readonly documentClipboardService: DocumentClipboardService,
		private readonly tokenService: TokenService,
		private readonly toastrService: ToastService,
		private readonly authService: AuthService,
		private readonly documentEnhancerService: DocumentEnhancerService,
	) {
		documentNavigationPaths(router.events)
			.pipe(
				filter((url) => {
					if (url !== this.canonicalNavigation) return true;
					this.canonicalNavigation = null;
					return false;
				}),
				map((url) => parseDocumentRoute(url)),
				tap((location) => {
					this.mode = location ? DocumentManagerMode.BrowseDocuments : DocumentManagerMode.Unknown;
					this.fetchingDocument$.next(location?.value ?? null);
				}),
				switchMap((location) =>
					(location
						? location.kind === 'uid'
							? this.getDocumentInfo(location.value, location.repository)
							: this.getDocumentPathInfo(location.value, location.repository)
						: of(null)
					).pipe(
						catchError((error) => {
							if (error.status === 401 || error.status === 403) {
								toastrService.warning(
									this.messages.format(
										'app.services.documents.unauthorized',
										{},
										'You are not authorized to view this document.',
									),
									this.messages.format('app.services.documents.error-title', {}, 'Error'),
									{ enableHtml: false },
								);
								// The same stock error page as a missing document, at 403; the address stays.
								router.navigate(['/unauthorized'], {
									skipLocationChange: true,
									state: { error: { code: 403, document: location?.value } },
								});

								return of(null);
							} else if (error.status === 404) {
								toastrService.warning(
									this.messages.format(
										'app.services.documents.not-found',
										{},
										"The specified document couldn't be found.",
									),
									this.messages.format('app.services.documents.error-title', {}, 'Error'),
									{ enableHtml: false },
								);
								// Stock keeps the address: the page names the missing document, reload retries
								// it, and Back leaves it instead of returning to a redirect.
								router.navigate(['/not-found'], {
									skipLocationChange: true,
									state: { error: { document: location?.value } },
								});

								return of(null);
							} else {
								toastrService.warning(
									error.error?.message || error.error?.error?.message || error.message,
									this.messages.format('app.services.documents.error-title', {}, 'Error'),
									{ enableHtml: false },
								);

								return of(null);
							}
						}),
					),
				),
			)
			.subscribe((documentInfo) => {
				this.documentInfo = documentInfo;
				if (documentInfo) {
					this.mode =
						documentInfo.ng?.facets?.collection ||
						['Collection', 'Favorites'].includes(documentInfo.type)
							? DocumentManagerMode.BrowseCollections
							: DocumentManagerMode.BrowseDocuments;
					this.canonicalizeDocumentUrl(documentInfo);
				}

				this._documentFetched.set(documentInfo);

				if (documentInfo && !this.documentInfo.ng.facets.collection)
					this.documentHistoryService.push(this.documentInfo);

				if (!documentInfo && router.url.indexOf('?code=') >= 0 && tokenService.isAccessTokenValid)
					router.navigate(['/']);
			});

		this.documentFetched$
			.pipe(
				switchMap((documentInfo) => {
					this.clearSelection();

					this.clearDocuments({ emitEvent: false });

					// Children are listed by the view that renders them (generic folderish viewer,
					// trash view, content layouts), never speculatively here: standard folders render
					// the content layout, which owns its own page-provider listing.
					if (documentInfo && this.showOnlyTrashedDocuments && this.documentInfo.ng.isFolder)
						return this.loadMore();

					return EMPTY;
				}),
			)
			.subscribe();

		documentTrashService.documentsRestoredFromTrash$.subscribe((uids) => {
			if (this.showOnlyTrashedDocuments) this.removeDocuments(uids);
			else if (
				this.mode === DocumentManagerMode.BrowseDocuments ||
				this.mode === DocumentManagerMode.BrowseCollections
			) {
				const documents = this._documents.filter((x) => uids.includes(x.uid));

				documents.forEach((document: any) => (document.isTrashed = false));

				this.editDocuments(documents);
			}
		});

		const navigateToParentOnRemoval = (current: any): void => {
			const ancestor = [...(current.contextParameters?.breadcrumb?.entries ?? [])]
				.reverse()
				.find((entry: any) => entry.uid !== current.uid);
			const parentPath =
				typeof ancestor?.path === 'string' && ancestor.path.startsWith('/')
					? ancestor.path
					: !ancestor && typeof current.path === 'string' && current.path.startsWith('/')
						? current.path.slice(0, current.path.lastIndexOf('/')) || '/'
						: undefined;
			const parentUid = ancestor?.uid ?? current.parentRef;
			void router.navigateByUrl(
				parentPath || parentUid
					? documentUrl({ path: parentPath, uid: parentUid, repository: current.repository })
					: '/browse',
			);
		};

		documentTrashService.documentsMovedToTrash$.subscribe((uids) => {
			this.documentHistoryService.invalidatePaths();
			documentClipboardService.removeFromClipboard(uids, false);
			const current = this.documentInfo;
			if (current && uids.includes(current.uid)) {
				this.documentInfo = { ...current, isTrashed: true };
				this._documentFetched.set(this.documentInfo);
				navigateToParentOnRemoval(current);
			}

			if (
				this.mode !== DocumentManagerMode.BrowseDocuments &&
				this.mode !== DocumentManagerMode.BrowseCollections
			)
				return;

			if (!this.showOnlyTrashedDocuments) this.removeDocuments(uids);
			else {
				const documents = this._documents.filter((x) => uids.includes(x.uid));

				documents.forEach((document: any) => (document.isTrashed = true));

				this.editDocuments(documents);
			}
		});

		documentTrashService.documentsPurged$.subscribe((uids) => {
			this.documentHistoryService.invalidatePaths();
			documentClipboardService.removeFromClipboard(uids, false);
			if (this.documentInfo && uids.includes(this.documentInfo.uid))
				navigateToParentOnRemoval(this.documentInfo);
			if (this.showOnlyTrashedDocuments) this.removeDocuments(uids);
		});

		documentTrashService.trashEmptied$.subscribe(() => {
			if (this.showOnlyTrashedDocuments) this.clearDocuments({ emitEvent: true });
		});

		documentClipboardService.documentsMoved$.subscribe(() => {
			this.documentHistoryService.invalidatePaths();
			if (this.documentInfo?.uid && parseDocumentRoute(this.router.url)) {
				this.reloadDocument(this.documentInfo.uid)
					.pipe(catchError(() => EMPTY))
					.subscribe();
			}
		});

		documentClipboardService.documentsCopied$.subscribe((event) => {
			if (event.destinationUid === this.documentInfo?.uid && parseDocumentRoute(this.router.url)) {
				this.clearDocuments({ emitEvent: true });
				this.loadMore().subscribe();
			}
		});

		merge(
			documentCollectionsService.documentsAddedToCollection$ ?? EMPTY,
			documentCollectionsService.documentsRemovedFromCollection$ ?? EMPTY,
		)
			.pipe(
				filter(
					(event) =>
						event.documentUids.includes(this.documentInfo?.uid) &&
						(event.repository ?? 'default') === (this.documentInfo?.repository ?? 'default') &&
						documentRouteMatches(this.router.url, this.documentInfo),
				),
				switchMap(() =>
					this.reloadDocument(
						this.documentInfo.uid,
						this.documentInfo.repository ?? 'default',
					).pipe(catchError(() => EMPTY)),
				),
			)
			.subscribe();

		layoutService.settingsUpdated$
			.pipe(
				tap(() => this.clearDocuments({ emitEvent: false })),
				switchMap(() => this.loadMore()),
			)
			.subscribe();

		this.authService.userInfoUpdated$.subscribe((x) => (this.currentUser = x));
	}

	// --------------------------------------------------------------------------------------------------
	/** The next page of the listing for the current document: its children, trash or members. */
	loadMore() {
		this._canLoadMore = false;

		this._fetchingDocuments.set(true);
		this.fetchingDocuments$.next(true);

		let result: Observable<any> = of(null);

		if (this.showOnlyTrashedDocuments)
			result = this.documentTrashService.loadMore(
				this.documentInfo.ng?.isFolder
					? this.documentInfo?.path
					: this.documentInfo?.path.substring(0, this.documentInfo?.path.lastIndexOf('/')),
				this._currentPage,
			);
		else if (this.mode === DocumentManagerMode.BrowseDocuments && this.documentInfo?.uid)
			result = this.documentBrowserService.loadMore(
				this.documentInfo.ng?.isFolder ? this.documentInfo?.uid : this.documentInfo?.parentRef,
				this._currentPage,
				!!this.documentInfo.facets?.includes('Orderable'),
				this.documentInfo.repository ?? 'default',
				this.documentInfo.isTrashed === true,
			);
		else if (this.mode === DocumentManagerMode.BrowseCollections && this.documentInfo?.uid)
			result = this.documentCollectionsService.getCollectionDocuments(
				this.documentInfo!.uid,
				this._currentPage,
			);

		return result.pipe(
			tap((x: any) => {
				this._fetchingDocuments.set(false);
				this.fetchingDocuments$.next(false);

				// Because the user might browse too fast from one document to another, we need to make sure we're exposing the right data,
				// so we need to be sure the "entries" belong to the right parent
				if (
					!x ||
					(!this.showOnlyTrashedDocuments &&
						x.entries?.length &&
						this.mode === DocumentManagerMode.BrowseDocuments &&
						x.entries[0].parentRef !== this.documentInfo?.uid)
				)
					return;

				this.currentPage += 1;

				this._canLoadMore = x.isNextPageAvailable; //this._documents.length < this._totalCount

				this.addDocuments(
					this.currentPage,
					x.entries.filter((y: any) => y.facets?.indexOf('HiddenInNavigation') < 0),
					x.totalSize,
				);

				this._maxTotalCount = x.resultsCountLimit | 0;
			}),
			catchError((error) => {
				this._fetchingDocuments.set(false);
				this.fetchingDocuments$.next(false);

				this.toastrService.error(
					error.error?.message || error.message || error,
					this.messages.format('app.services.documents.error-title', {}, 'Error'),
					{ enableHtml: false },
				);

				return EMPTY;
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	set showOnlyTrashedDocuments(value: boolean) {
		this._showOnlyTrashedDocuments = value;

		this.clearDocuments();

		this.loadMore().subscribe();
	}

	// --------------------------------------------------------------------------------------------------
	get showOnlyTrashedDocuments() {
		return this._showOnlyTrashedDocuments;
	}

	// --------------------------------------------------------------------------------------------------
	set currentPage(currentPage: number) {
		this._currentPage = currentPage > 0 ? currentPage : 0;
	}

	// --------------------------------------------------------------------------------------------------
	get currentPage() {
		return this._currentPage;
	}

	// --------------------------------------------------------------------------------------------------
	private setTotalCount(totalCount: number) {
		this._totalCount = totalCount;
	}

	// --------------------------------------------------------------------------------------------------
	get totalCount() {
		return this._totalCount;
	}

	// --------------------------------------------------------------------------------------------------
	get maxTotalCount() {
		return this._maxTotalCount;
	}

	// --------------------------------------------------------------------------------------------------
	get canLoadMore() {
		return this._canLoadMore;
	}

	// --------------------------------------------------------------------------------------------------
	private addDocuments(currentPage: number, documents: any[], totalCount: number) {
		documents.forEach((x) => {
			const result = this.documentEnhancerService.setDocumentCustomProperties(x);

			if (this._selectionCount === Number.POSITIVE_INFINITY) result.ng.isSelected = true;

			return result;
		});

		this.currentPage = currentPage;

		this._documents = this.currentPage === 0 ? documents : [...this._documents, ...documents];

		if (this._totalCount >= 0) this.setTotalCount(totalCount);

		this.documentsUpdated$.next(this._documents);
	}

	// --------------------------------------------------------------------------------------------------
	private editDocuments(documents: any[]) {
		this._documents = this._documents.map(
			(document) => documents.find((x) => x.uid === document.uid) || document,
		);

		this.documentsUpdated$.next(this._documents.length ? this._documents : documents);

		// The viewed document is held separately from the listed ones; a save on it (metadata
		// editor, inline note editor) must refresh the view without a reload.
		const current = this.documentInfo?.uid
			? documents.find(
					(x) =>
						x.uid === this.documentInfo.uid &&
						(x.repository ?? 'default') === (this.documentInfo.repository ?? 'default'),
				)
			: undefined;
		if (current) {
			this.documentInfo = current;
			this._documentFetched.set(current);
		}
	}

	// --------------------------------------------------------------------------------------------------
	private removeDocuments(documentUids: string[]) {
		if (!documentUids || this.selectionCount === Number.POSITIVE_INFINITY) return;

		const removedDocuments: any[] = [];
		const remainingDocuments: any[] = [];
		let selectionCount = 0;

		for (const document of this._documents) {
			if (documentUids.includes(document.uid) || documentUids.includes(document.parentRef)) {
				removedDocuments.push(document);

				if (document.ng.isSelected) selectionCount++;
			} else remainingDocuments.push(document);
		}

		this._documents = remainingDocuments;

		this.setTotalCount(this._totalCount - removedDocuments.length);

		this.documentsUpdated$.next(this._documents);

		if (selectionCount) {
			this._selectionCount -= selectionCount;
			this.selectedDocumentsUpdated$.next(this._documents);
		}
	}

	// --------------------------------------------------------------------------------------------------
	clearDocuments(options?: { emitEvent: boolean } | undefined) {
		this._currentPage = 0;
		this._documents = [];
		this.setTotalCount(0);
		this._selectionCount = 0;

		if (!options || options.emitEvent) {
			this.documentsUpdated$.next([]);
			this.selectedDocumentsUpdated$.next([]);
		}
	}

	applySiblingOrder(order: readonly string[]): void {
		const positions = new Map(order.map((uid, index) => [uid, index]));
		if (this._documents.some((doc) => !positions.has(doc.uid))) return;
		this._documents = [...this._documents].sort(
			(a, b) => positions.get(a.uid)! - positions.get(b.uid)!,
		);
		this.documentsUpdated$.next(this._documents);
	}

	// --------------------------------------------------------------------------------------------------
	get documents() {
		return this._documents;
	}

	// --------------------------------------------------------------------------------------------------
	getDocumentType(documentType: string) {
		return this.httpClient.get(`${this.apiUrl}/config/types/${documentType}`);
	}

	// --------------------------------------------------------------------------------------------------
	toggleSelection(uid: string, enable: boolean | undefined = undefined) {
		const document = this._documents.find((x) => x.uid === uid);

		if (!document) return;

		document.ng.isSelected = enable !== undefined ? enable : !document.ng.isSelected;

		if (this.selectionCount === Number.POSITIVE_INFINITY) {
			if (!document.ng.isSelected) this._deselectedDocuments.push(document);
			else {
				const index = this._deselectedDocuments.findIndex((x) => x.uid === document.uid);
				if (index >= 0) this._deselectedDocuments.splice(index, 1);
			}
		} else this._selectionCount += document.ng.isSelected ? 1 : -1;

		this.selectedDocumentsUpdated$.next(
			this.selectionCount !== Number.POSITIVE_INFINITY
				? this._documents.filter((x) => x.ng.isSelected)
				: [],
		);
	}

	// --------------------------------------------------------------------------------------------------
	selectAllLoaded() {
		this._documents.forEach((x) => (x.ng.isSelected = true));

		const totalDocumentCount = this._totalCount > 0 ? this._totalCount : this._maxTotalCount;
		this._selectionCount =
			totalDocumentCount > 200 ? Number.POSITIVE_INFINITY : this._documents.length;

		this.selectedDocumentsUpdated$.next(this._documents);
	}

	// --------------------------------------------------------------------------------------------------
	selectAll() {
		this._documents.forEach((x) => (x.ng.isSelected = true));

		this._selectionCount = Number.POSITIVE_INFINITY;

		this.selectedDocumentsUpdated$.next(this._documents);
	}

	// --------------------------------------------------------------------------------------------------
	clearSelection() {
		this._deselectedDocuments = [];

		this._documents.forEach((x) => (x.ng.isSelected = false));

		this._selectionCount = 0;

		this.selectedDocumentsUpdated$.next(this._documents);
	}

	// --------------------------------------------------------------------------------------------------
	get selectionCount() {
		return this._selectionCount;
	}

	/** Immutable ids excluded from the current all-matching selection. */
	get deselectedDocumentIds(): readonly string[] {
		return this._deselectedDocuments.map((document) => String(document?.uid ?? '')).filter(Boolean);
	}

	// --------------------------------------------------------------------------------------------------
	get deselectedDocuments() {
		return this._deselectedDocuments;
	}

	// --------------------------------------------------------------------------------------------------
	private readonly creationParents = inject(CreationParentService);
	/**
	 * `parent` is a destination its caller read for this same action, so it is not read again.
	 * `keepBatch` leaves a shared upload batch on the server for the other files (stock's
	 * `X-Batch-No-Drop`); the caller removes it.
	 */
	createDocument(
		destinationPath: string,
		documentType: string,
		properties: any,
		expectedParentId?: string,
		options: { parent?: any; keepBatch?: boolean } = {},
	) {
		return defer(() =>
			options.parent ? of(options.parent) : this.creationParents.read(destinationPath),
		).pipe(
			switchMap((parent) => {
				if (
					(expectedParentId && parent.uid !== expectedParentId) ||
					!allowsCreateType(parent, documentType)
				)
					throw new LocalizedUiError(
						'app.services.documents.destination-changed',
						'The destination or its creation permissions have changed. Refresh and try again.',
					);
				return this.httpClient
					.post<any>(
						`${this.apiUrl}/id/${encodeURIComponent(parent.uid)}`,
						{
							'entity-type': 'document',
							type: documentType,
							name: properties['dc:title'],
							properties,
						},
						{
							headers: options.keepBatch
								? { ...SYNC_INDEXING, 'X-Batch-No-Drop': 'true' }
								: SYNC_INDEXING,
						},
					)
					.pipe(
						catchError((error) =>
							throwError(() =>
								REJECTED_WRITE_STATUSES.includes(error.status)
									? error
									: new DocumentCreationError(),
							),
						),
						switchMap((response) => {
							if (typeof response?.uid !== 'string' || !response.uid)
								return throwError(() => new DocumentCreationError());
							this.documentCreated$.next({
								repository: response.repository ?? parent.repository ?? 'default',
								document: response,
							});
							return this.getDocumentInfo(response.uid).pipe(
								catchError(() => throwError(() => new DocumentCreationError(response.uid))),
							);
						}),
					);
			}),
			tap((document) => this.addCreatedDocument(document)),
		);
	}

	/**
	 * Stock's default import: FileManager.Import turns every file of an upload batch into a document
	 * whose type the server's importers choose (plain text becomes a Note). Like stock, the batch is
	 * kept for a retry and the caller removes it. The response carries the loaded documents.
	 */
	importFiles(destinationPath: string, batchId: string): Observable<any[]> {
		return this.httpClient
			.post<any>(
				`${this.apiUrl}/upload/${encodeURIComponent(batchId)}/execute/FileManager.Import`,
				{ params: {}, context: { currentDocument: destinationPath } },
				{
					headers: new HttpHeaders({
						...DOCUMENT_INFO_HEADERS,
						...SYNC_INDEXING,
						'X-Batch-No-Drop': 'true',
					}),
				},
			)
			.pipe(
				catchError((error) =>
					throwError(() =>
						REJECTED_WRITE_STATUSES.includes(error.status) ? error : new DocumentCreationError(),
					),
				),
				map((response) =>
					(Array.isArray(response?.entries) ? response.entries : [response]).map((document: any) =>
						this.documentEnhancerService.setDocumentCustomProperties(document),
					),
				),
				tap((documents) =>
					documents
						.filter((document) => typeof document?.uid === 'string')
						.forEach((document) => {
							this.documentCreated$.next({
								repository: document.repository ?? 'default',
								document,
							});
							this.addCreatedDocument(document);
						}),
				),
			);
	}

	/** Syncs the loaded listing with a document saved elsewhere, such as by a custom layout. */
	syncSavedDocument(documentUid: string, created: boolean) {
		if (!created) return this.reloadDocument(documentUid);
		return this.getDocumentInfo(documentUid).pipe(
			tap((document) => {
				this.documentCreated$.next({ repository: document.repository ?? 'default', document });
				this.addCreatedDocument(document);
			}),
		);
	}

	private addCreatedDocument(document: any) {
		if (
			this.mode === DocumentManagerMode.BrowseDocuments &&
			!this.showOnlyTrashedDocuments &&
			document.parentRef === this.documentInfo?.uid &&
			documentRouteMatches(this.router.url, this.documentInfo)
		)
			this.addDocuments(this._currentPage, [document], this._totalCount + 1);
	}

	// --------------------------------------------------------------------------------------------------
	updateDocument(documentUid: string, properties: any) {
		return this.httpClient
			.put(
				`${this.apiUrl}/id/${documentUid}`,
				{ 'entity-type': 'document', uid: documentUid, properties: properties },
				{ headers: SYNC_INDEXING },
			)
			.pipe(
				switchMap(() => this.getDocumentInfo(documentUid)),
				tap((document) => this.editDocuments([document])),
			);
	}

	// --------------------------------------------------------------------------------------------------
	updateDocuments(changes: { documentUid: string; properties: any }[]) {
		return forkJoin(
			changes.map((change: any) => {
				return this.httpClient
					.put(
						`${this.apiUrl}/id/${change.documentUid}`,
						{ 'entity-type': 'document', uid: change.documentUid, properties: change.properties },
						{ headers: SYNC_INDEXING },
					)
					.pipe(switchMap(() => this.getDocumentInfo(change.documentUid)));
			}),
		).pipe(tap((documents) => this.editDocuments(documents)));
	}

	// --------------------------------------------------------------------------------------------------
	reloadDocument(documentUid: string, repository?: string) {
		return documentUid
			? this.getDocumentInfo(documentUid, repository).pipe(
					tap((x) => {
						if (
							repository !== undefined &&
							!documentRouteMatches(this.router.url, this.documentInfo)
						)
							return;
						if (repository === undefined) this.editDocuments([x]);
						else {
							this._documents = this._documents.map((item) =>
								item.uid === documentUid && (item.repository ?? 'default') === repository
									? x
									: item,
							);
							if (this._documents.some((item) => item === x))
								this.documentsUpdated$.next(this._documents);
						}

						if (
							this.documentInfo?.uid === documentUid &&
							(repository === undefined ||
								(this.documentInfo.repository ?? 'default') === repository)
						) {
							this.documentInfo = x;
							this.canonicalizeDocumentUrl(x);
							this._documentFetched.set(x);
						}
					}),
				)
			: of();
	}

	// --------------------------------------------------------------------------------------------------
	getDocumentInfo(uid: string, repository = 'default'): Observable<any> {
		const base =
			repository === 'default'
				? this.apiUrl
				: `${this.apiUrl}/repo/${encodeURIComponent(repository)}`;
		return this.fetchDocument(uid ? `${base}/id/${encodeURIComponent(uid)}` : `${base}/path/`);
	}

	getDocumentPathInfo(path: string, repository = 'default'): Observable<any> {
		const base =
			repository === 'default'
				? this.apiUrl
				: `${this.apiUrl}/repo/${encodeURIComponent(repository)}`;
		return this.fetchDocument(`${base}/path/${encodeDocumentPath(path.replace(/^\/+/, ''))}`);
	}

	private fetchDocument(url: string): Observable<any> {
		return this.httpClient
			.get(url, { headers: new HttpHeaders(DOCUMENT_INFO_HEADERS) })
			.pipe(
				map((document: any) => this.documentEnhancerService.setDocumentCustomProperties(document)),
			);
	}

	private canonicalizeDocumentUrl(document: any): void {
		if (!parseDocumentRoute(this.router.url) || !document?.path) return;
		const current = this.router.parseUrl(this.router.url);
		const target = this.router.parseUrl(documentUrl(document));
		target.queryParams = { ...current.queryParams, ...target.queryParams };
		target.fragment = current.fragment;
		const url = this.router.serializeUrl(target);
		if (url === this.router.url) return;
		this.canonicalNavigation = documentNavigationKey(url);
		void this.router.navigateByUrl(target, { replaceUrl: true }).finally(() => {
			this.canonicalNavigation = null;
		});
	}

	// --------------------------------------------------------------------------------------------------
	toggleNotification(document: any, repository?: string) {
		if (!document) return EMPTY;

		const state = document.ng.canNotify;

		const url = `${this.apiUrl}/automation/${state ? 'Document.Unsubscribe' : 'Document.Subscribe'}`;

		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: document.uid,
				},
				repository === undefined ? undefined : { headers: { 'X-NXRepository': repository } },
			)
			.pipe(
				tap(() => {
					if (
						repository !== undefined &&
						(this.documentInfo?.uid !== document.uid ||
							(this.documentInfo.repository ?? 'default') !== repository)
					)
						return;
					const documentToUpdate = this._documents.find(
						(x: any) =>
							x.uid === document.uid &&
							(repository === undefined || (x.repository ?? 'default') === repository),
					);

					if (documentToUpdate) documentToUpdate.ng.canNotify = !state;
					else document.ng.canNotify = !state;

					if (
						this.documentInfo?.uid === document.uid &&
						(repository === undefined || (this.documentInfo.repository ?? 'default') === repository)
					)
						this.documentInfo.ng.canNotify = !state;

					if (this._documents.length) this.documentsUpdated$.next(this._documents);
					else if (!documentToUpdate) this.documentsUpdated$.next([document]);
					else if (this.documentInfo) this.documentsUpdated$.next([this.documentInfo]);

					const message = state
						? this.messages.format(
								'app.services.documents.unsubscribed',
								{ title: document.title },
								'You will no longer receive notifications when the document \u201c{title}\u201d changes.',
							)
						: this.messages.format(
								'app.services.documents.subscribed',
								{ title: document.title },
								'You will receive notifications when the document \u201c{title}\u201d changes.',
							);

					this.toastrService.info(
						message,
						this.messages.format(
							'app.services.documents.notifications-title',
							{},
							'Document notifications',
						),
						{ enableHtml: false },
					);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	toggleLock(document: any, repository?: string) {
		if (!document) return;

		const state = !!document.ng.lockedBy;

		const url = `${this.apiUrl}/automation/${state ? 'Document.Unlock' : 'Document.Lock'}`;

		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: document.uid,
				},
				repository === undefined ? undefined : { headers: { 'X-NXRepository': repository } },
			)
			.pipe(
				tap(() => {
					if (
						repository !== undefined &&
						(this.documentInfo?.uid !== document.uid ||
							(this.documentInfo.repository ?? 'default') !== repository)
					)
						return;
					const documentToUpdate = this._documents.find(
						(x: any) =>
							x.uid === document.uid &&
							(repository === undefined || (x.repository ?? 'default') === repository),
					);

					if (documentToUpdate) {
						documentToUpdate.ng.lockedBy = state ? null : this.currentUser?.id;
						documentToUpdate.lockCreated = new Date();
					} else {
						document.ng.lockedBy = state ? null : this.currentUser?.id;
						document.lockCreated = new Date();
					}

					if (
						this.documentInfo?.uid === document.uid &&
						(repository === undefined || (this.documentInfo.repository ?? 'default') === repository)
					) {
						this.documentInfo.ng.lockedBy = state ? null : this.currentUser?.id;
						this.documentInfo.lockCreated = new Date();
					}

					if (this._documents.length) this.documentsUpdated$.next(this._documents);
					else if (!documentToUpdate) this.documentsUpdated$.next([document]);
					else if (this.documentInfo) this.documentsUpdated$.next([this.documentInfo]);

					const message = state
						? this.messages.format(
								'app.services.documents.unlocked',
								{ title: document.title },
								'The document \u201c{title}\u201d has been unlocked.',
							)
						: this.messages.format(
								'app.services.documents.locked',
								{ title: document.title },
								'The document \u201c{title}\u201d is now locked.',
							);

					this.toastrService.info(
						message,
						this.messages.format('app.services.documents.lock-title', {}, 'Document lock changed'),
						{ enableHtml: false },
					);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	toggleLegalHold(document: any, reason?: string) {
		if (!document) return;

		const state = document.hasLegalHold;

		const url = `${this.apiUrl}/automation/${state ? 'Document.Unhold' : 'Document.Hold'}`;

		return this.httpClient
			.post(url, {
				params: {
					description: reason,
				},
				context: {},
				input: document.uid,
			})
			.pipe(
				tap(() => {
					const documentToUpdate = this._documents.find((x: any) => x.uid === document.uid);

					if (documentToUpdate) documentToUpdate.hasLegalHold = !state;
					else document.hasLegalHold = !state;

					if (this.documentInfo?.uid === document.uid) this.documentInfo.hasLegalHold = !state;

					if (this._documents.length) this.documentsUpdated$.next(this._documents);
					else if (!documentToUpdate) this.documentsUpdated$.next([document]);
					else if (this.documentInfo) this.documentsUpdated$.next([this.documentInfo]);

					const message = state
						? this.messages.format(
								'app.services.documents.unheld',
								{ title: document.title },
								'The document \u201c{title}\u201d is no longer under legal hold.',
							)
						: this.messages.format(
								'app.services.documents.held',
								{ title: document.title },
								'The document \u201c{title}\u201d is now under legal hold and cannot be altered.',
							);

					this.toastrService.info(
						message,
						this.messages.format(
							'app.services.documents.legal-hold-title',
							{},
							'Document legal hold changed',
						),
						{ enableHtml: false },
					);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	addTag(documentUid: string, tags: string[]) {
		const url = `${this.apiUrl}/automation/Services.TagDocument`;

		const payload = {
			params: {
				tags: tags.join(','),
			},
			context: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			switchMap(() => this.getDocumentInfo(documentUid)),
			tap((document) => this.editDocuments([document])),
		);
	}

	// --------------------------------------------------------------------------------------------------
	removeTag(documentUid: string, tag: string) {
		const url = `${this.apiUrl}/automation/Services.UntagDocument`;

		const payload = {
			params: {
				tags: tag,
			},
			context: {},
			input: documentUid,
		};

		return this.httpClient.post(url, payload).pipe(
			switchMap(() => this.getDocumentInfo(documentUid)),
			tap((document) => this.editDocuments([document])),
		);
	}

	// --------------------------------------------------------------------------------------------------
	suggestTag(searchTerm: string) {
		const url = `${this.apiUrl}/automation/Tag.Suggestion`;

		return this.httpClient.post(url, {
			params: {
				searchTerm,
			},
			context: {},
		});
	}

	// --------------------------------------------------------------------------------------------------
	leaveComment(parentId: string, comment: string, commentId?: string) {
		if (!parentId) return of();

		const payload = {
			'entity-type': 'comment',
			parentId,
			text: comment,
		};

		return commentId
			? this.httpClient.put(`${this.apiUrl}/id/${parentId}/@comment/${commentId}`, payload)
			: this.httpClient.post(`${this.apiUrl}/id/${parentId}/@comment`, payload);
	}

	// --------------------------------------------------------------------------------------------------
	deleteComment(parentId: string, commentId: string) {
		if (!commentId) return of();

		return this.httpClient.delete(`${this.apiUrl}/id/${parentId}/@comment/${commentId}`);
	}

	// --------------------------------------------------------------------------------------------------
	getComments(uid: string, currentPage = 0) {
		if (!uid) return of();

		const url = `${this.apiUrl}/id/${uid}/@comment?pageSize=5&currentPageIndex=${currentPage}`;

		const headers = {
			headers: new HttpHeaders({
				'fetch-comment': 'repliesSummary',
				properties: '*',
			}),
		};

		return this.httpClient.get(url, headers);
	}
}

export enum DocumentManagerMode {
	Unknown,
	BrowseDocuments,
	BrowseCollections,
}
