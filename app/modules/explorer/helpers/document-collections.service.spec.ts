import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';

import { DocumentCollectionsService } from './document-collections.service';
import { FavoriteChange, FavoriteChanges } from './favorite-changes.service';

describe('DocumentCollectionsService', () => {
	let service: DocumentCollectionsService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(DocumentCollectionsService);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('resolves repository favorites without overwriting the default collection cache', fakeAsync(() => {
		const http = {
			get: jasmine.createSpy('get').and.returnValue(of({ entries: [], totalSize: 2 })),
			post: jasmine.createSpy('post').and.callFake((_url: string, _body: unknown, options: any) =>
				of({
					uid:
						options?.headers?.['X-NXRepository'] === 'archive'
							? 'archive-favorites'
							: 'default-favorites',
				}),
			),
		};
		const scoped = TestBed.runInInjectionContext(
			() =>
				new DocumentCollectionsService(
					http as any,
					{
						info: jasmine.createSpy('info'),
						success: jasmine.createSpy('success'),
						error: jasmine.createSpy('error'),
						warning: jasmine.createSpy('warning'),
					} as any,
					{ pageSize: 40 } as any,
					{} as any,
					{ setDocumentCustomProperties: jasmine.createSpy('setDocumentCustomProperties') } as any,
				),
		);
		http.get.calls.reset();
		http.post.calls.reset();
		const committed = jasmine.createSpy('committed');
		const added: any[] = [];
		scoped.documentsAddedToCollection$.subscribe((event) => added.push(event));
		scoped.toggleFavoriteDocument(['note-one'], true, 'archive', committed).subscribe();
		expect(committed).toHaveBeenCalledTimes(1);
		expect(http.get).not.toHaveBeenCalled();
		tick(1000);
		expect(http.post.calls.allArgs().map((call) => call[2].headers['X-NXRepository'])).toEqual([
			'archive',
			'archive',
		]);
		expect(http.get.calls.mostRecent().args[0]).toContain(
			'/repo/archive/search/pp/default_content_collection/execute',
		);
		expect(http.get.calls.mostRecent().args[0]).toContain('queryParams=archive-favorites');
		expect(added.at(-1)?.collectionUid).toBe('archive-favorites');
		http.get.calls.reset();
		http.post.calls.reset();
		scoped.toggleFavoriteDocument(['note-two'], false).subscribe();
		tick(1000);
		// The default repository's favorites id is fetched on its first use, then kept.
		expect(http.post).toHaveBeenCalledTimes(2);
		expect(http.post.calls.mostRecent().args[0]).toContain('/Favorite.Fetch');
		expect(http.post.calls.mostRecent().args[2]).toBeUndefined();
		expect(http.get.calls.mostRecent().args[0]).toContain('queryParams=default-favorites');
		expect(http.get.calls.mostRecent().args[0]).not.toContain('/repo/');
		http.post.calls.reset();
		scoped.toggleFavoriteDocument(['note-three'], true).subscribe();
		tick(1000);
		expect(http.post).toHaveBeenCalledTimes(1);
	}));
	it('announces a committed favorites change at once, and none when the mutation fails', fakeAsync(() => {
		let fail = false;
		const http = {
			get: jasmine.createSpy('get').and.returnValue(of({ entries: [], totalSize: 0 })),
			post: jasmine
				.createSpy('post')
				.and.callFake((url: string) =>
					fail && !url.endsWith('/Favorite.Fetch')
						? throwError(() => new Error('denied'))
						: of({ uid: 'default-favorites' }),
				),
		};
		const toastr = {
			info: jasmine.createSpy('info'),
			success: jasmine.createSpy('success'),
			error: jasmine.createSpy('error'),
			warning: jasmine.createSpy('warning'),
		};
		const scoped = TestBed.runInInjectionContext(
			() =>
				new DocumentCollectionsService(
					http as any,
					toastr as any,
					{ pageSize: 40 } as any,
					{} as any,
					{ setDocumentCustomProperties: jasmine.createSpy('setDocumentCustomProperties') } as any,
				),
		);
		const changes: FavoriteChange[] = [];
		TestBed.inject(FavoriteChanges).changes$.subscribe((change) => changes.push(change));
		scoped.toggleFavoriteDocument(['note'], false).subscribe();
		// Before the one-second settle and the favorites refetch: the star must not wait on them.
		expect(changes).toEqual([{ documentUids: ['note'], favorite: false }]);
		tick(1000);
		scoped.toggleFavoriteDocument(['note'], true, 'archive').subscribe();
		expect(changes.at(-1)).toEqual({
			documentUids: ['note'],
			favorite: true,
			repository: 'archive',
		});
		tick(1000);
		fail = true;
		scoped.toggleFavoriteDocument(['note'], false).subscribe();
		tick(1000);
		expect(changes.length).toBe(2);
	}));
	it('waits for the default favorites id fetched by the first mutation', fakeAsync(() => {
		const favorites = new Subject<any>();
		const http = {
			get: jasmine.createSpy('get').and.returnValue(of({ entries: [], totalSize: 0 })),
			post: jasmine
				.createSpy('post')
				.and.callFake((url: string) => (url.endsWith('/Favorite.Fetch') ? favorites : of({}))),
		};
		const pending = TestBed.runInInjectionContext(
			() =>
				new DocumentCollectionsService(
					http as any,
					{
						info: jasmine.createSpy('info'),
						success: jasmine.createSpy('success'),
						error: jasmine.createSpy('error'),
						warning: jasmine.createSpy('warning'),
					} as any,
					{ pageSize: 40 } as any,
					{} as any,
					{ setDocumentCustomProperties: jasmine.createSpy('setDocumentCustomProperties') } as any,
				),
		);
		pending.toggleFavoriteDocument(['note'], true).subscribe();
		http.get.calls.reset();
		tick(1000);
		expect(http.get).not.toHaveBeenCalled();
		favorites.next({ uid: 'arrived-late' });
		favorites.complete();
		expect(http.get.calls.mostRecent().args[0]).toContain('queryParams=arrived-late');
	}));
	it('prevents duplicate collection creation and loads collection documents with sort options', () => {
		(service as any).documentCollections = [{ uid: 'col-1', title: 'Existing' }];
		let result: any;
		service.createCollection('Existing').subscribe((r) => (result = r));
		expect(result).toEqual({ uid: 'col-1', title: 'Existing' });
	});
});

describe('DocumentCollectionsService collection loading and membership', () => {
	let http: { get: jasmine.Spy; post: jasmine.Spy };
	let toastr: {
		info: jasmine.Spy;
		success: jasmine.Spy;
		error: jasmine.Spy;
		warning: jasmine.Spy;
	};
	let enhancer: { setDocumentCustomProperties: jasmine.Spy };
	let service: DocumentCollectionsService;
	const favorites = { uid: 'favorites', type: 'Favorites', title: 'Favorites' };
	const userCollections = [
		{ uid: 'zeta', type: 'Collection', title: 'Zeta' },
		{ uid: 'alpha', type: 'Collection', title: 'Alpha' },
	];
	const create = () =>
		TestBed.runInInjectionContext(
			() =>
				new DocumentCollectionsService(
					http as any,
					toastr as any,
					{ pageSize: 40, sortFields: ['dc:title'], sortAscending: false } as any,
					{} as any,
					enhancer as any,
				),
		);
	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [...legacyTestProviders()] });
		http = {
			get: jasmine
				.createSpy('get')
				.and.callFake((url: string) =>
					url.includes('/user_collections/')
						? of({ entries: userCollections.map((c) => ({ ...c })) })
						: of({ entries: [{ uid: 'member' }], totalSize: url.includes('zeta') ? 3 : 1 }),
				),
			post: jasmine
				.createSpy('post')
				.and.callFake((url: string) =>
					url.endsWith('/Favorite.Fetch') ? of({ ...favorites }) : of({}),
				),
		};
		toastr = {
			info: jasmine.createSpy('info'),
			success: jasmine.createSpy('success'),
			error: jasmine.createSpy('error'),
			warning: jasmine.createSpy('warning'),
		};
		enhancer = { setDocumentCustomProperties: jasmine.createSpy('setDocumentCustomProperties') };
		service = create();
	});

	it('loads favorites first, the other collections by title with their counts, then serves the cache', () => {
		const updates: any[][] = [];
		service.documentCollectionsUpdated$.subscribe((list) => updates.push(list));
		let loaded: any[] = [];
		service.loadCollections().subscribe((list) => (loaded = list));
		expect(loaded.map((c) => c.uid)).toEqual(['favorites', 'alpha', 'zeta']);
		expect(loaded.map((c) => c.totalCount)).toEqual([1, 1, 3]);
		expect(service.documentCollectionsList()).toEqual(loaded);
		expect(updates.length).toBe(1);
		expect(enhancer.setDocumentCustomProperties).toHaveBeenCalledTimes(3 + 3);
		const listing = http.get.calls
			.allArgs()
			.map((args) => args[0] as string)
			.find((url) => url.includes('/user_collections/'));
		expect(listing).toContain('sortBy=dc%3Atitle'.replace('%3A', ':'));
		expect(listing).toContain('sortOrder=desc');
		expect(listing).toContain('pageSize=100');
		http.get.calls.reset();
		http.post.calls.reset();
		let again: any[] = [];
		service.loadCollections().subscribe((list) => (again = list));
		expect(again).toBe(loaded);
		expect(http.get).not.toHaveBeenCalled();
		expect(http.post).not.toHaveBeenCalled();
		expect(updates.length).toBe(1);
	});

	it('tolerates a missing favorites collection and an empty collection listing', () => {
		http.post.and.returnValue(throwError(() => new Error('no favorites')));
		http.get.and.returnValue(of({ entries: [] }));
		let loaded: any[] | undefined;
		service.loadCollections().subscribe((list) => (loaded = list));
		expect(loaded).toEqual([]);
		expect(service.documentCollectionsList()).toEqual([]);
	});

	it('reads collection members with the layout page size and the repository route', () => {
		service.getCollectionDocuments('col').subscribe();
		expect(http.get.calls.mostRecent().args[0]).toContain('pageSize=40');
		expect(http.get.calls.mostRecent().args[0]).toContain('queryParams=col');
		expect(http.get.calls.mostRecent().args[0]).not.toContain('/repo/');
		service.getCollectionDocuments('col', 2, 5, 'default').subscribe();
		expect(http.get.calls.mostRecent().args[0]).toContain('currentPageIndex=2&pageSize=5');
		expect(http.get.calls.mostRecent().args[0]).not.toContain('/repo/');
		service.getCollectionDocuments('col', 0, 5, 'archive').subscribe();
		expect(http.get.calls.mostRecent().args[0]).toContain('/repo/archive/search/pp/');
		expect(enhancer.setDocumentCustomProperties).toHaveBeenCalledWith({ uid: 'member' });
	});

	it('creates a collection, keeps the list sorted with favorites first and publishes it', () => {
		service.loadCollections().subscribe();
		const updates: any[][] = [];
		service.documentCollectionsUpdated$.subscribe((list) => updates.push(list));
		http.post.and.returnValue(of({ uid: 'beta', type: 'Collection', title: 'Beta' }));
		let created: any;
		service.createCollection('Beta', 'A description').subscribe((value) => (created = value));
		expect(http.post.calls.mostRecent().args[0]).toContain('/Collection.CreateCollection');
		expect(http.post.calls.mostRecent().args[1]).toEqual({
			params: { name: 'Beta', description: 'A description' },
			context: {},
		});
		expect(created.uid).toBe('beta');
		expect(enhancer.setDocumentCustomProperties).toHaveBeenCalledWith(created);
		expect(service.documentCollectionsList().map((c) => c.uid)).toEqual([
			'favorites',
			'alpha',
			'beta',
			'zeta',
		]);
		expect(updates.length).toBe(1);
		expect(toastr.warning).not.toHaveBeenCalled();
	});

	it('reports a failed creation and rethrows it without changing the list', () => {
		http.post.and.returnValue(throwError(() => new Error('denied')));
		let error: unknown;
		service.createCollection('Gamma').subscribe({ error: (value) => (error = value) });
		expect(error instanceof Error).toBeTrue();
		expect(toastr.error).toHaveBeenCalledTimes(1);
		expect(service.documentCollectionsList()).toEqual([]);
	});

	it('adds documents to a loaded collection and announces the refreshed count', fakeAsync(() => {
		service.loadCollections().subscribe();
		const added: any[] = [];
		service.documentsAddedToCollection$.subscribe((event) => added.push(event));
		service.addToCollection(['d1', 'd2'], 'zeta').subscribe();
		expect(toastr.info).toHaveBeenCalledTimes(1);
		expect(http.post.calls.mostRecent().args[0]).toContain('/Document.AddToCollection');
		expect(http.post.calls.mostRecent().args[1]).toEqual({
			params: { collection: 'zeta' },
			context: {},
			input: 'docs:d1,d2',
		});
		expect(added).toEqual([]);
		tick(1000);
		expect(added).toEqual([
			{ documentUids: ['d1', 'd2'], collectionUid: 'zeta', collectionTotalCount: 3 },
		]);
		expect(toastr.success).toHaveBeenCalledTimes(1);
	}));

	it('stays silent for an unknown collection and refuses more than twenty documents', fakeAsync(() => {
		const added: any[] = [];
		service.documentsAddedToCollection$.subscribe((event) => added.push(event));
		service.addToCollection(['d1'], 'unknown').subscribe();
		tick(1000);
		expect(added).toEqual([]);
		expect(toastr.success).not.toHaveBeenCalled();
		http.post.calls.reset();
		const many = Array.from({ length: 21 }, (_, index) => `d${index}`);
		let completed = false;
		service.addToCollection(many, 'zeta').subscribe({ complete: () => (completed = true) });
		expect(completed).toBeTrue();
		expect(http.post).not.toHaveBeenCalled();
		expect(toastr.error).toHaveBeenCalledTimes(1);
		service.toggleFavoriteDocument(many, true).subscribe({ complete: () => (completed = true) });
		expect(http.post).not.toHaveBeenCalled();
		expect(toastr.error).toHaveBeenCalledTimes(2);
	}));

	it('distinguishes a single failed addition from a partial one', fakeAsync(() => {
		http.post.and.returnValue(throwError(() => new Error('denied')));
		let completed = false;
		service.addToCollection(['d1'], 'zeta').subscribe({ complete: () => (completed = true) });
		tick(1000);
		expect(completed).toBeTrue();
		expect(toastr.error).toHaveBeenCalledTimes(1);
		expect(toastr.warning).not.toHaveBeenCalled();
		service.addToCollection(['d1', 'd2'], 'zeta').subscribe();
		tick(1000);
		expect(toastr.warning).toHaveBeenCalledTimes(1);
		expect(http.get).not.toHaveBeenCalled();
	}));

	it('removes documents from a loaded collection and announces the refreshed count', fakeAsync(() => {
		service.loadCollections().subscribe();
		const removed: any[] = [];
		service.documentsRemovedFromCollection$.subscribe((event) => removed.push(event));
		service.removeFromCollection(['d1'], 'alpha').subscribe();
		expect(http.post.calls.mostRecent().args[0]).toContain('/Collection.RemoveFromCollection');
		expect(http.post.calls.mostRecent().args[1].input).toBe('docs:d1');
		tick(1000);
		expect(removed).toEqual([
			{ documentUids: ['d1'], collectionUid: 'alpha', collectionTotalCount: 1 },
		]);
		expect(toastr.success).toHaveBeenCalledTimes(1);
		service.removeFromCollection(['d1'], 'missing').subscribe();
		tick(1000);
		expect(removed.length).toBe(1);
		http.post.and.returnValue(throwError(() => new Error('denied')));
		service.removeFromCollection(['d1'], 'alpha').subscribe();
		tick(1000);
		expect(toastr.error).toHaveBeenCalledTimes(1);
		service.removeFromCollection(['d1', 'd2'], 'alpha').subscribe();
		tick(1000);
		expect(toastr.warning).toHaveBeenCalledTimes(1);
		expect(removed.length).toBe(1);
	}));

	it('removes one membership with the document as operation input and relays scoped removals', () => {
		service.removeDocumentMembership('doc', 'alpha').subscribe();
		expect(http.post.calls.mostRecent().args[0]).toContain('/Collection.RemoveFromCollection');
		expect(http.post.calls.mostRecent().args[1]).toEqual({
			params: { collection: 'alpha' },
			context: {},
			input: 'doc',
		});
		const removed: any[] = [];
		service.documentsRemovedFromCollection$.subscribe((event) => removed.push(event));
		const event = { documentUids: ['doc'], collectionUid: 'alpha', repository: 'archive' };
		service.notifyDocumentsRemovedFromCollection(event);
		expect(removed).toEqual([event]);
	});

	it('removes documents from every loaded collection and republishes, but not after a refused removal', fakeAsync(() => {
		service.loadCollections().subscribe();
		http.post.calls.reset();
		const removed: any[] = [];
		service.documentsRemovedFromCollection$.subscribe((event) => removed.push(event));
		const updates: any[][] = [];
		service.documentCollectionsUpdated$.subscribe((list) => updates.push(list));
		service.removeFromAllCollections(['d1', 'd2']).subscribe();
		expect(toastr.info).toHaveBeenCalledTimes(1);
		expect(http.post.calls.count()).toBe(3);
		expect(http.post.calls.allArgs().map((args) => args[1].params.collection)).toEqual([
			'favorites',
			'alpha',
			'zeta',
		]);
		expect(removed).toEqual([]);
		tick(1000);
		expect(removed.map((event) => event.collectionUid)).toEqual(['favorites', 'alpha', 'zeta']);
		expect(removed[2]).toEqual({
			documentUids: ['d1', 'd2'],
			collectionUid: 'zeta',
			collectionTotalCount: 3,
		});
		expect(updates.length).toBe(1);
		expect(toastr.success).toHaveBeenCalledTimes(1);
		// One refused removal: the join never settles, so nothing is announced or republished.
		http.post.and.callFake((_url: string, body: any) =>
			body.params.collection === 'zeta' ? throwError(() => new Error('denied')) : of({}),
		);
		service.removeFromAllCollections(['d1', 'd2']).subscribe();
		tick(1000);
		expect(toastr.warning).toHaveBeenCalledTimes(1);
		expect(removed.length).toBe(3);
		expect(updates.length).toBe(1);
		expect(toastr.success).toHaveBeenCalledTimes(1);
		service.removeFromAllCollections(['d1']).subscribe();
		tick(1000);
		expect(toastr.error).toHaveBeenCalledTimes(1);
	}));
});
