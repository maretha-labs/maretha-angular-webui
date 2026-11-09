import { TestBed } from '@angular/core/testing';
import { DefaultUrlSerializer, NavigationEnd } from '@angular/router';
import { of, Subject } from 'rxjs';
import { DocumentsManagerService, DocumentManagerMode } from './documents-manager.service';
import { fixtureDocument } from 'app/testing/legacy-test-providers';

describe('Document path routing', () => {
	let manager: DocumentsManagerService;
	let router: any;
	let http: any;
	let moves: Subject<any>;
	let copies: Subject<any>;
	let browser: any;
	const serializer = new DefaultUrlSerializer();
	const doc = (path = '/default-domain/work') => ({ ...fixtureDocument(), path });

	beforeEach(() => {
		const idle = new Subject<any>();
		moves = new Subject();
		copies = new Subject();
		router = {
			url: '/browse/default-domain/work',
			events: new Subject(),
			parseUrl: (url: string) => serializer.parse(url),
			serializeUrl: (url: any) => serializer.serialize(url),
			navigateByUrl: jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true)),
			navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)),
		};
		http = {
			get: jasmine.createSpy('get').and.callFake(() => of(doc())),
			post: jasmine.createSpy('post').and.returnValue(of({})),
		};
		browser = {
			loadMore: jasmine.createSpy('loadMore').and.returnValue(of({ entries: [], totalSize: 0 })),
		};
		TestBed.configureTestingModule({});
		manager = TestBed.runInInjectionContext(
			() =>
				new DocumentsManagerService(
					router,
					{} as any,
					http,
					{ settingsUpdated$: idle } as any,
					{
						push: jasmine.createSpy('push'),
						invalidatePaths: jasmine.createSpy('invalidatePaths'),
					} as any,
					browser,
					{
						documentCollectionsUpdated$: idle,
						getCollectionDocuments: () => of({ entries: [], totalSize: 0 }),
					} as any,
					{
						documentsRestoredFromTrash$: idle,
						documentsMovedToTrash$: idle,
						documentsPurged$: idle,
						trashEmptied$: idle,
					} as any,
					{ documentsMoved$: moves, documentsCopied$: copies } as any,
					{} as any,
					{ warning: jasmine.createSpy('warning'), info: jasmine.createSpy('info') } as any,
					{ userInfoUpdated$: idle } as any,
					{ setDocumentCustomProperties: (document: any) => document } as any,
				),
		);
	});
	function visit(url: string) {
		router.url = url;
		router.events.next(new NavigationEnd(1, url, url));
	}
	it('fetches a deep path directly and leaves view changes on the same document', () => {
		visit('/browse/default-domain/a%20b?view=view');
		expect(http.get.calls.mostRecent().args[0]).toContain('/path/default-domain/a%20b');
		visit('/browse/default-domain/a%20b?view=permissions');
		expect(http.get).toHaveBeenCalledTimes(1);
	});
	it('replaces legacy UID URLs with the server path, preserving view and fragment', () => {
		visit('/browse/documents/fixture-document?view=permissions#access');
		expect(http.get.calls.mostRecent().args[0]).toContain('/id/fixture-document');
		const [target, extras] = router.navigateByUrl.calls.mostRecent().args;
		expect(serializer.serialize(target)).toBe(
			'/browse/default-domain/work?view=permissions#access',
		);
		expect(extras).toEqual({ replaceUrl: true });
		visit(serializer.serialize(target));
		expect(http.get).toHaveBeenCalledTimes(1);
	});
	it('loads collections by server type and ordinary root by path', () => {
		http.get.and.returnValue(of({ ...doc('/collections/example'), type: 'Collection' }));
		visit('/browse/path/collections/example');
		expect(manager.mode).toBe(DocumentManagerMode.BrowseCollections);
		visit('/browse');
		expect(http.get.calls.mostRecent().args[0]).toMatch(/\/path\/$/);
	});
	it('does not fetch repository root for unrelated screens', () => {
		visit('/settings/nxql');
		expect(http.get).not.toHaveBeenCalled();
		expect(manager.mode).toBe(DocumentManagerMode.Unknown);
	});
	it('uses the server result after Move, including moves of an ancestor', () => {
		visit('/browse/default-domain/work');
		http.get.and.returnValue(of(doc('/destination/work')));
		moves.next({
			documents: [{ uid: 'parent', path: '/destination' }],
			destinationUid: 'destination',
		});
		expect(http.get.calls.mostRecent().args[0]).toContain('/id/fixture-document');
		expect(serializer.serialize(router.navigateByUrl.calls.mostRecent().args[0])).toBe(
			'/browse/destination/work',
		);
	});
	it('keeps scoped notification and lock operations in their repository', () => {
		const target = { ...doc(), repository: 'archive', ng: { canNotify: false } };
		manager.documentInfo = target;
		manager.toggleNotification(target, 'archive').subscribe();
		manager.toggleLock(target, 'archive')!.subscribe();
		for (const call of http.post.calls.allArgs()) {
			expect(call[2].headers['X-NXRepository']).toBe('archive');
			expect(call[1].input).toBe(target.uid);
		}
		expect(http.post).toHaveBeenCalledTimes(2);
	});
	it('does not replace a same-UID document in a different repository on late reload', () => {
		const next = { ...doc(), repository: 'other' };
		manager.documentInfo = next;
		const response = new Subject<any>();
		http.get.and.returnValue(response);
		manager.reloadDocument(next.uid, 'archive').subscribe();
		expect(http.get.calls.mostRecent().args[0]).toContain('/repo/archive/id/');
		response.next({ ...doc(), repository: 'archive' });
		response.complete();
		expect(manager.documentInfo).toBe(next);
		expect(router.navigateByUrl).not.toHaveBeenCalled();
	});
	it('does not undo navigation while the next document request is pending', () => {
		const previous = doc('/previous');
		manager.documentInfo = previous;
		router.url = '/browse/previous';
		const response = new Subject<any>();
		http.get.and.returnValue(response);
		manager.reloadDocument(previous.uid, 'default').subscribe();
		router.url = '/browse/next';
		response.next({ ...previous, title: 'Reloaded old document' });
		response.complete();
		expect(router.navigateByUrl).not.toHaveBeenCalled();
		expect(manager.documentInfo).toBe(previous);
	});
});
