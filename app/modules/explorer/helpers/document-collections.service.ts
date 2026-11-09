import { WebUiMessages } from '@maretha/webui-sdk';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { environment } from 'environments/environment';
import { ToastrService } from 'ngx-toastr';
import {
	catchError,
	combineLatest,
	delay,
	EMPTY,
	forkJoin,
	map,
	mergeMap,
	Observable,
	of,
	Subject,
	switchMap,
	take,
	tap,
	throwError,
} from 'rxjs';
import { AutomationsService } from './automations.service';
import { DocumentEnhancerService } from './document-enhancer.service';
import { FavoriteChanges } from './favorite-changes.service';
import { LayoutService } from './layout.service';

@Injectable({
	providedIn: 'root',
})
export class DocumentCollectionsService {
	private readonly messages = inject(WebUiMessages);
	private readonly favoriteChanges = inject(FavoriteChanges);
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;
	private readonly automationUrl = `${this.apiUrl}/automation`;
	private favoritesUid: string | undefined;
	private readonly collectionsPageSize = 100;

	private readonly _documentCollectionsList = signal<any[]>([]);

	/** The collections `loadCollections()` has loaded, favorites first; empty until then. */
	readonly documentCollectionsList = this._documentCollectionsList.asReadonly();

	/** Events, never replayed: a later subscriber reads `documentCollectionsList` for the state. */
	readonly documentCollectionsUpdated$ = new Subject<any[]>();
	readonly documentsAddedToCollection$ = new Subject<IDocumentsAdded>();
	readonly documentsRemovedFromCollection$ = new Subject<IDocumentsRemoved>();

	documentCollections: any[] = [];

	// --------------------------------------------------------------------------------------------------
	constructor(
		private readonly httpClient: HttpClient,
		private readonly toastrService: ToastrService,
		private readonly layoutService: LayoutService,
		private readonly automationsService: AutomationsService,
		private readonly documentEnhancerService: DocumentEnhancerService,
	) {}

	/**
	 * The user's collections with their member counts, loaded when a view first shows them (the
	 * collections popover). Later calls return the loaded list; mutations keep it current.
	 */
	loadCollections(): Observable<any[]> {
		if (this.documentCollections.length) return of(this.documentCollections);
		return this.getAllCollections().pipe(tap(() => this.publishCollections()));
	}

	private publishCollections(): void {
		this._documentCollectionsList.set([...this.documentCollections]);
		this.documentCollectionsUpdated$.next(this.documentCollectionsList());
	}

	// --------------------------------------------------------------------------------------------------
	// Get the "Favorites" collection along with some of its documents
	private getFavoritesCollection(): Observable<any[]> {
		const body = {
			params: {},
			context: {},
		};

		const headers = {
			headers: new HttpHeaders({
				'enrichers-document': 'thumbnail',
				properties: 'dublincore,common',
				'fetch-document': 'properties',
			}),
		};

		return this.httpClient.post(`${this.automationUrl}/Favorite.Fetch`, body, headers).pipe(
			map((x: any) => {
				this.favoritesUid = x.uid;

				this.documentEnhancerService.setDocumentCustomProperties(x);

				return x;
			}),
			switchMap((collection: any) => {
				return this.getCollectionDocuments(collection.uid, 0, 1).pipe(
					map((x: any) => {
						collection.totalCount = x.totalSize;
						return [collection];
					}),
				);
			}),
			catchError(() => of([])),
		);
	}

	// --------------------------------------------------------------------------------------------------
	// Get all collections along with some of their documents
	private getUserCollections(currentPage = 0): Observable<any[]> {
		const user = encodeURIComponent('$currentUser');
		const searchTerm = encodeURIComponent('%');

		let url = `${this.apiUrl}/search/pp/user_collections/execute?user=${user}&currentPageIndex=${currentPage}&pageSize=${this.collectionsPageSize}&searchTerm=${searchTerm}`;

		if (this.layoutService.sortFields)
			url += `&sortBy=${this.layoutService.sortFields.join(',')}&sortOrder=${this.layoutService.sortAscending ? 'asc' : 'desc'}`;

		const headers = {
			headers: new HttpHeaders({
				'enrichers-document': 'thumbnail',
				properties: 'dublincore,common',
				'fetch-document': 'properties',
			}),
		};

		return this.httpClient.get(url, headers).pipe(
			map((x: any) =>
				x.entries.map((y: any) => {
					this.documentEnhancerService.setDocumentCustomProperties(y);

					y.totalCount = 0;

					return y;
				}),
			),
			mergeMap((collections: any[]) => {
				return collections.length
					? forkJoin(
							collections.map((collection) => {
								return this.getCollectionDocuments(collection.uid, 0, 1).pipe(
									map((x: any) => {
										collection.totalCount = x.totalSize;
										return collection;
									}),
								);
							}),
						)
					: of([]);
			}, 30),
			catchError(() => of([])),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getCollectionDocuments(
		collectionUid: string,
		currentPage = 0,
		pageSize?: number,
		repository?: string,
	) {
		const base =
			repository && repository !== 'default'
				? `${this.apiUrl}/repo/${encodeURIComponent(repository)}`
				: this.apiUrl;
		let url = `${base}/search/pp/default_content_collection/execute?currentPageIndex=${currentPage}&pageSize=${pageSize || this.layoutService.pageSize}`;

		if (this.layoutService.sortFields)
			url += `&sortBy=${this.layoutService.sortFields.join(',')}&sortOrder=${this.layoutService.sortAscending ? 'asc' : 'desc'}`;

		const headers = {
			headers: new HttpHeaders({
				'enrichers-blob': 'appLinks',
				'enrichers-document': 'hasContent,permissions,subscribedNotifications,thumbnail,subtypes',
				properties: '*',
				'fetch-document': 'properties,lock',
			}),
		};

		return this.httpClient.get(`${url}&queryParams=${collectionUid}`, headers).pipe(
			map((x: any) => {
				x.entries.forEach((y: any) => this.documentEnhancerService.setDocumentCustomProperties(y));

				return x;
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	private getAllCollections(): Observable<any[]> {
		if (this.documentCollections.length) return of(this.documentCollections);

		return combineLatest([this.getFavoritesCollection(), this.getUserCollections()]).pipe(
			take(1),
			map((x) => {
				const collections = x.reduce((result, value) => [...result, ...value]);

				collections.sort((a: any, b: any) =>
					a.type === 'Favorites' || b.type === 'Favorites' ? 0 : a.title.localeCompare(b.title),
				);

				this.documentCollections = collections;

				return collections;
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	createCollection(collectionName: string, description = ''): Observable<any> {
		// Avoid creating multiple collections with the same name
		const existingCollection = this.documentCollections.find((x) => x.title === collectionName);
		if (existingCollection) {
			this.toastrService.warning(
				this.messages.format(
					'app.services.collections.exists',
					{ name: collectionName },
					'A collection named \u201c{name}\u201d already exists.',
				),
				this.messages.format(
					'app.services.collections.exists-title',
					{},
					'Collection already exists',
				),
				{ enableHtml: false },
			);
			return of(existingCollection);
		}

		const url = `${this.automationUrl}/Collection.CreateCollection`;

		const headers = {
			headers: new HttpHeaders({
				'enrichers-document': 'thumbnail',
				properties: 'dublincore,common',
				'fetch-document': 'properties',
			}),
		};

		return this.httpClient
			.post(
				url,
				{
					params: {
						name: collectionName,
						description,
					},
					context: {},
				},
				headers,
			)
			.pipe(
				catchError((err) => {
					this.toastrService.error(
						this.messages.format(
							'app.services.collections.create-failed',
							{},
							'Could not create the specified collection.',
						),
						this.messages.format(
							'app.services.collections.create-failed-title',
							{},
							'Error creating collection',
						),
						{ enableHtml: false },
					);

					return throwError(() => new Error(err));
				}),
				map((x: any) => {
					this.documentEnhancerService.setDocumentCustomProperties(x);

					this.documentCollections = [...this.documentCollections, x];

					this.documentCollections.sort((a: any, b: any) =>
						a.type === 'Favorites' || b.type === 'Favorites' ? 0 : a.title.localeCompare(b.title),
					);

					this.publishCollections();

					return x;
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	addToCollection(documentUids: string[], collectionUid: string) {
		// TODO: Use a bulk operation for a large number of documents
		if (documentUids.length > 20) {
			this.toastrService.error(
				this.messages.format(
					'app.services.collections.limit',
					{},
					"You can't add more than 20 documents at a time to a collection.",
				),
				this.messages.format(
					'app.services.collections.update-failed-title',
					{},
					'Error updating collection',
				),
				{ enableHtml: false },
			);

			return of();
		}

		this.toastrService.info(
			this.messages.format('app.services.collections.updating', {}, 'Updating collection...'),
			undefined,
			{ enableHtml: false },
		);

		const url = `${this.automationUrl}/Document.AddToCollection`;

		return this.httpClient
			.post(url, {
				params: {
					collection: collectionUid,
				},
				context: {},
				input: `docs:${documentUids.join(',')}`,
			})
			.pipe(
				catchError(() => {
					if (documentUids.length === 1)
						this.toastrService.error(
							this.messages.format(
								'app.services.collections.add-failed',
								{},
								"The document couldn't be added to the specified collection.",
							),
							this.messages.format(
								'app.services.collections.update-failed-title',
								{},
								'Error updating collection',
							),
							{ enableHtml: false },
						);
					else
						this.toastrService.warning(
							this.messages.format(
								'app.services.collections.many-add-failed',
								{ count: documentUids.length },
								'{count, plural, one {# document could not be added to the specified collection.} other {# documents could not be added to the specified collection.}}',
							),
							this.messages.format(
								'app.services.collections.partially-updated',
								{},
								'Collection partially updated',
							),
							{ enableHtml: false },
						);

					return EMPTY;
				}),
				delay(1000),
				switchMap(() => this.getCollectionDocuments(collectionUid, 0, 1)),
				tap((x: any) => {
					const collection = this.documentCollections.find((x) => x.uid === collectionUid);

					if (!collection) return;

					this.documentsAddedToCollection$.next({
						documentUids,
						collectionUid,
						collectionTotalCount: x.totalSize,
					});

					const notificationMessage = this.messages.format(
						'app.services.collections.added',
						{ count: documentUids.length },
						'{count, plural, one {# document has been added to the specified collection.} other {# documents have been added to the specified collection.}}',
					);

					this.toastrService.success(
						notificationMessage,
						this.messages.format('app.services.collections.updated', {}, 'Collection updated'),
						{ enableHtml: false },
					);
				}),
			);
	}

	// --------------------------------------------------------------------------------------------------
	removeFromCollection(documentUids: string[], collectionUid: string) {
		this.toastrService.info(
			this.messages.format('app.services.collections.updating', {}, 'Updating collection...'),
			undefined,
			{ enableHtml: false },
		);

		const url = `${this.automationUrl}/Collection.RemoveFromCollection`;

		return this.httpClient
			.post(url, {
				params: {
					collection: collectionUid,
				},
				context: {},
				input: `docs:${documentUids.join(',')}`,
			})
			.pipe(
				catchError(() => {
					if (documentUids.length === 1)
						this.toastrService.error(
							this.messages.format(
								'app.services.collections.remove-failed',
								{},
								"The document couldn't be removed from the specified collection.",
							),
							this.messages.format(
								'app.services.collections.update-failed-title',
								{},
								'Error updating collection',
							),
							{ enableHtml: false },
						);
					else
						this.toastrService.warning(
							this.messages.format(
								'app.services.collections.some-remove-failed',
								{},
								"Some documents couldn't be removed from the specified collection.",
							),
							this.messages.format(
								'app.services.collections.partially-updated',
								{},
								'Collection partially updated',
							),
							{ enableHtml: false },
						);

					return EMPTY;
				}),
				delay(1000),
				switchMap(() => this.getCollectionDocuments(collectionUid, 0, 1)),
				tap((x: any) => {
					const collection = this.documentCollections.find((x) => x.uid === collectionUid);

					if (!collection) return;

					this.documentsRemovedFromCollection$.next({
						documentUids,
						collectionUid,
						collectionTotalCount: x.totalSize,
					});

					const notificationMessage = this.messages.format(
						'app.services.collections.removed',
						{ count: documentUids.length },
						'{count, plural, one {# document has been removed from the specified collection.} other {# documents have been removed from the specified collection.}}',
					);

					this.toastrService.success(
						notificationMessage,
						this.messages.format('app.services.collections.updated', {}, 'Collection updated'),
						{ enableHtml: false },
					);
				}),
			);
	}

	/** Removes one enriched document membership using Web UI's exact operation input. */
	removeDocumentMembership(documentUid: string, collectionUid: string): Observable<unknown> {
		return this.httpClient.post(`${this.automationUrl}/Collection.RemoveFromCollection`, {
			params: { collection: collectionUid },
			context: {},
			input: documentUid,
		});
	}

	/** Announces a committed scoped removal without making its success depend on a count refresh. */
	notifyDocumentsRemovedFromCollection(event: IDocumentsRemoved & { repository: string }): void {
		this.documentsRemovedFromCollection$.next(event);
	}

	// --------------------------------------------------------------------------------------------------
	removeFromAllCollections(documentUids: string[]) {
		this.toastrService.info(
			this.messages.format('app.services.collections.updating-all', {}, 'Updating collections...'),
			undefined,
			{ enableHtml: false },
		);

		const url = `${this.automationUrl}/Collection.RemoveFromCollection`;

		const observables = [];

		for (const collection of this.documentCollections)
			observables.push(
				this.httpClient
					.post(url, {
						params: {
							collection: collection.uid,
						},
						context: {},
						input: `docs:${documentUids.join(',')}`,
					})
					.pipe(
						catchError(() => {
							if (documentUids.length === 1)
								this.toastrService.error(
									this.messages.format(
										'app.services.collections.remove-failed',
										{},
										"The document couldn't be removed from the specified collection.",
									),
									this.messages.format(
										'app.services.collections.update-failed-title',
										{},
										'Error updating collection',
									),
									{ enableHtml: false },
								);
							else
								this.toastrService.warning(
									this.messages.format(
										'app.services.collections.some-remove-failed',
										{},
										"Some documents couldn't be removed from the specified collection.",
									),
									this.messages.format(
										'app.services.collections.partially-updated',
										{},
										'Collection partially updated',
									),
									{ enableHtml: false },
								);

							return EMPTY;
						}),
					),
			);

		return forkJoin(observables).pipe(
			delay(1000),
			switchMap(() => this.getAllCollections()),
			tap((x) => {
				this.documentCollections = x;
				this.publishCollections();

				for (const collection of this.documentCollections)
					this.documentsRemovedFromCollection$.next({
						documentUids,
						collectionUid: collection.uid,
						collectionTotalCount: collection.totalCount,
					});

				const notificationMessage = this.messages.format(
					'app.services.collections.removed',
					{ count: documentUids.length },
					'{count, plural, one {# document has been removed from the specified collection.} other {# documents have been removed from the specified collection.}}',
				);

				this.toastrService.success(
					notificationMessage,
					this.messages.format('app.services.collections.updated', {}, 'Collection updated'),
					{ enableHtml: false },
				);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	toggleFavoriteDocument(
		documentUids: string[],
		addToFavorites: boolean,
		repository?: string,
		onCommitted?: () => void,
	) {
		if (documentUids.length > 20) {
			this.toastrService.error(
				this.messages.format(
					'app.services.collections.limit',
					{},
					"You can't add more than 20 documents at a time to a collection.",
				),
				this.messages.format(
					'app.services.collections.update-failed-title',
					{},
					'Error updating collection',
				),
				{ enableHtml: false },
			);

			return of();
		}

		this.toastrService.info(
			this.messages.format('app.services.collections.updating', {}, 'Updating collection...'),
			undefined,
			{ enableHtml: false },
		);

		const url = `${this.automationUrl}/${addToFavorites ? 'Document.AddToFavorites' : 'Document.RemoveFromFavorites'}`;

		const options =
			repository === undefined ? undefined : { headers: { 'X-NXRepository': repository } };
		let favoritesUid = this.favoritesUid;
		return this.httpClient
			.post(
				url,
				{
					params: {},
					context: {},
					input: `docs:${documentUids.join(',')}`,
				},
				options,
			)
			.pipe(
				tap(() => {
					this.favoriteChanges.changes$.next({
						documentUids,
						favorite: addToFavorites,
						...(repository === undefined ? {} : { repository }),
					});
					onCommitted?.();
				}),
				map(() => null),
				catchError(() => {
					if (documentUids.length === 1)
						this.toastrService.error(
							this.messages.format(
								'app.services.collections.add-failed',
								{},
								"The document couldn't be added to the specified collection.",
							),
							this.messages.format(
								'app.services.collections.update-failed-title',
								{},
								'Error updating collection',
							),
							{ enableHtml: false },
						);
					else
						this.toastrService.warning(
							this.messages.format(
								'app.services.collections.many-add-failed',
								{ count: documentUids.length },
								'{count, plural, one {# document could not be added to the specified collection.} other {# documents could not be added to the specified collection.}}',
							),
							this.messages.format(
								'app.services.collections.partially-updated',
								{},
								'Collection partially updated',
							),
							{ enableHtml: false },
						);

					return EMPTY;
				}),
				delay(1000),
				switchMap(() =>
					repository === undefined && this.favoritesUid
						? of(this.favoritesUid)
						: this.httpClient
								.post<any>(
									`${this.automationUrl}/Favorite.Fetch`,
									{ params: {}, context: {} },
									options,
								)
								.pipe(
									map((collection) => {
										// The default repository's favorites id serves later mutations.
										if (repository === undefined) this.favoritesUid = collection.uid;
										return collection.uid as string;
									}),
								),
				),
				switchMap((uid) => {
					favoritesUid = uid;
					return this.getCollectionDocuments(uid!, 0, 1, repository);
				}),
				tap((x: any) => {
					if (addToFavorites)
						this.documentsAddedToCollection$.next({
							documentUids,
							collectionUid: favoritesUid!,
							collectionTotalCount: x.totalSize,
							...(repository === undefined ? {} : { repository }),
						});
					else
						this.documentsRemovedFromCollection$.next({
							documentUids,
							collectionUid: favoritesUid!,
							collectionTotalCount: x.totalSize,
							...(repository === undefined ? {} : { repository }),
						});

					const notificationMessage = addToFavorites
						? this.messages.format(
								'app.services.collections.favorite-added',
								{ count: documentUids.length },
								'{count, plural, one {# document has been added to favorites.} other {# documents have been added to favorites.}}',
							)
						: this.messages.format(
								'app.services.collections.favorite-removed',
								{ count: documentUids.length },
								'{count, plural, one {# document has been removed from favorites.} other {# documents have been removed from favorites.}}',
							);

					this.toastrService.success(
						notificationMessage,
						this.messages.format('app.services.collections.updated', {}, 'Collection updated'),
						{ enableHtml: false },
					);
				}),
			);
	}
}

export interface IDocumentsAdded {
	documentUids: string[];
	collectionUid: string;
	collectionTotalCount: number;
	repository?: string;
}

export interface IDocumentsRemoved {
	documentUids: string[];
	collectionUid: string;
	collectionTotalCount?: number;
	repository?: string;
}
