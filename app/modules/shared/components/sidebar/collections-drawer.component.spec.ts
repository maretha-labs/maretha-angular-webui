import { WebUiLocale } from '@maretha/webui-sdk';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { CollectionDrawerNavigation } from 'app/helpers/collection-drawer-navigation.service';
import { CollectionsDrawerComponent } from './collections-drawer.component';
import { ResultsPagingSettings } from '@maretha/webui-sdk';

describe('Collections drawer', () => {
	const context = (repository = 'secondary', uid = 'workspace') => ({
		document: { uid, repository },
		user: { id: 'member' },
		noEdit: false,
	});
	const collection = (uid = 'collection') => ({
		uid,
		repository: 'secondary',
		type: 'Collection',
		title: uid,
		contextParameters: { permissions: ['ReadCanCollect'] },
	});
	const member = (uid = 'member') => ({ uid, repository: 'secondary', type: 'Note', title: uid });
	const listing = (request: { url: string }) => request.url.endsWith('/user_collections/execute');
	const members = (request: { url: string }) =>
		request.url.endsWith('/default_content_collection/execute');
	beforeEach(() => {
		TestBed.configureTestingModule({
			imports: [CollectionsDrawerComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{
					provide: Router,
					useValue: {
						url: '/browse',
						navigateByUrl: jasmine.createSpy('navigateByUrl').and.resolveTo(true),
					},
				},
				{
					provide: DocumentCollectionsService,
					useFactory: () => {
						const removed = new Subject();
						return {
							documentsAddedToCollection$: new Subject(),
							documentsRemovedFromCollection$: removed,
							notifyDocumentsRemovedFromCollection: jasmine
								.createSpy('committedRemoval')
								.and.callFake((event) => removed.next(event)),
						};
					},
				},
			],
		}).overrideComponent(CollectionsDrawerComponent, { set: { template: '' } });
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup(openMembers = false) {
		const fixture = TestBed.createComponent(CollectionsDrawerComponent);
		fixture.componentRef.setInput('context', context());
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController),
			component = fixture.componentInstance;
		const request = http.expectOne(listing);
		expect(request.request.url).toContain('/repo/secondary/');
		expect(request.request.params.get('pageSize')).toBe('40');
		expect(request.request.params.get('user')).toBe('$currentUser');
		expect(request.request.params.get('searchTerm')).toBe('%');
		expect(request.request.params.has('sortBy')).toBeFalse();
		request.flush({ entries: [collection()], isNextPageAvailable: true });
		await fixture.whenStable();
		if (openMembers) {
			component.displayMembers(component.collections()[0]);
			const request = http.expectOne(members);
			expect(request.request.params.get('queryParams')).toBe('collection');
			expect(request.request.params.get('pageSize')).toBe('40');
			request.flush({ entries: [member(), member('remaining')], isNextPageAvailable: false });
			await fixture.whenStable();
		}
		return { fixture, component, http };
	}
	it('mirrors collection drill-in and back arrows while retaining vi shortcuts', async () => {
		const { component } = await setup();
		const row = document.createElement('div');
		row.className = 'collection-row';
		const button = document.createElement('button');
		button.className = 'row-primary';
		button.dataset['rowUid'] = 'collection';
		row.append(button);
		button.addEventListener('keydown', (event) => component.navigateKeys(event));
		const open = spyOn(component, 'displayMembers');
		const back = spyOn(component, 'back').and.resolveTo();
		spyOn<any>(component, 'position');
		TestBed.inject(WebUiLocale).setLocale('ar');
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
		expect(open).toHaveBeenCalledOnceWith(component.collections()[0]);
		component.showingMembers.set(true);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		expect(back).toHaveBeenCalledOnceWith(true);
		component.showingMembers.set(false);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }));
		expect(open).toHaveBeenCalledTimes(2);
		TestBed.inject(WebUiLocale).setLocale('en-US');
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
		expect(open).toHaveBeenCalledTimes(3);
	});

	it('pages and deduplicates the source collection provider, with repository-preserving collection navigation', async () => {
		const { fixture, component, http } = await setup();
		component.loadMore();
		const next = http.expectOne(listing);
		expect(next.request.params.get('currentPageIndex')).toBe('1');
		next.flush({ entries: [collection(), collection('second')], isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.collections().map((row) => row.uid)).toEqual(['collection', 'second']);
		expect(component.hasMore()).toBeFalse();
		await component.selectCollection(component.collections()[0]);
		expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith(
			jasmine.stringContaining('collection'),
		);
		fixture.componentRef.setInput('context', context('secondary', 'collection'));
		fixture.detectChanges();
		expect(component.selectedCollection().uid).toBe('collection');
		http.expectNone(listing);
	});
	it('cancels old repository reads and resets the selected collection on scope change', async () => {
		const { fixture, component, http } = await setup();
		component.displayMembers(component.collections()[0]);
		const old = http.expectOne(members);
		fixture.componentRef.setInput('context', context('another'));
		fixture.detectChanges();
		expect(old.cancelled).toBeTrue();
		const next = http.expectOne(listing);
		expect(next.request.url).toContain('/repo/another/');
		next.flush({ entries: [], isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.selectedCollection()).toBeNull();
		expect(component.showingMembers()).toBeFalse();
		expect(component.members()).toEqual([]);
	});
	it('loads on scroll only while enabled and keeps explicit paging available', async () => {
		const { fixture, http, component } = await setup();
		const event = {
			target: { scrollHeight: 1000, scrollTop: 500, clientHeight: 500 },
		} as unknown as Event;
		const settings = TestBed.inject(ResultsPagingSettings);
		component.onScroll(event);
		http.expectNone(listing);
		component.loadMore();
		http.expectOne(listing).flush({ entries: [collection('second')], isNextPageAvailable: true });
		await fixture.whenStable();
		settings.apply({ scrollPagingEnabled: true });
		component.onScroll(event);
		const next = http.expectOne(listing);
		expect(next.request.params.get('currentPageIndex')).toBe('2');
		next.flush({ entries: [collection('third')], isNextPageAvailable: true });
		await fixture.whenStable();
		settings.apply({ scrollPagingEnabled: false });
		component.onScroll(event);
		http.expectNone(listing);
		expect(component.collections().map((row) => row.uid)).toEqual([
			'collection',
			'second',
			'third',
		]);
	});
	it('checks fresh collection permission rather than member permissions before removal', async () => {
		const { component, http } = await setup(true);
		expect(component.canRemove()).toBeTrue();
		const removal = component.remove(component.members()[0]);
		http
			.expectOne((request) => request.url.endsWith('/repo/secondary/id/collection'))
			.flush({ ...collection(), contextParameters: { permissions: [] } });
		await removal;
		http.expectNone((request) => request.method === 'POST');
		expect(component.members().length).toBe(2);
		expect(component.error()).toContain('Permission');
	});
	it('removes only the membership and keeps committed removal through a stale refreshed page', async () => {
		const { fixture, component, http } = await setup(true);
		const removal = component.remove(component.members()[0]);
		http
			.expectOne((request) => request.url.endsWith('/repo/secondary/id/collection'))
			.flush(collection());
		await Promise.resolve();
		const operation = http.expectOne((request) =>
			request.url.endsWith('/Collection.RemoveFromCollection'),
		);
		expect(operation.request.headers.get('X-NXRepository')).toBe('secondary');
		expect(operation.request.body).toEqual({
			input: 'member',
			params: { collection: 'collection' },
		});
		operation.flush({});
		await removal;
		expect(
			TestBed.inject(DocumentCollectionsService).notifyDocumentsRemovedFromCollection,
		).toHaveBeenCalledWith({
			documentUids: ['member'],
			collectionUid: 'collection',
			repository: 'secondary',
		});
		http.expectNone(listing);
		expect(component.members().map((row) => row.uid)).toEqual(['remaining']);
		const reload = http.expectOne(members);
		expect(reload.request.params.get('currentPageIndex')).toBe('0');
		reload.flush({ entries: [member(), member('remaining')], isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.members().map((row) => row.uid)).toEqual(['remaining']);
		component.openMember(component.members()[0]);
		expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith(
			jasmine.stringContaining('remaining'),
		);
		await component.back();
		expect(component.showingMembers()).toBeFalse();
		expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith(
			jasmine.stringContaining('collection'),
		);
	});
	it('does not mutate a previously selected collection after a pending preflight returns', async () => {
		const { component, http } = await setup(true);
		const removal = component.remove(component.members()[0]);
		const fresh = http.expectOne((request) =>
			request.url.endsWith('/repo/secondary/id/collection'),
		);
		component.displayMembers(collection('second'));
		http.expectOne(members).flush({ entries: [], isNextPageAvailable: false });
		fresh.flush(collection());
		await removal;
		http.expectNone((request) => request.method === 'POST');
		expect(component.selectedCollection().uid).toBe('second');
		expect(component.removing()).toBeNull();
	});
	it('opens the originating Collection and locates a member on a later provider page by UID', async () => {
		const { fixture, component, http } = await setup();
		fixture.componentRef.setInput('context', context('secondary', 'target'));
		TestBed.inject(CollectionDrawerNavigation).accepted.set({
			sequence: 1,
			userId: 'member',
			repository: 'secondary',
			collection: collection(),
			member: member('target'),
		});
		fixture.detectChanges();
		expect(component.showingMembers()).toBeTrue();
		expect(component.selectedCollection().uid).toBe('collection');
		http.expectOne(members).flush({ entries: [member('first')], isNextPageAvailable: true });
		await Promise.resolve();
		const next = http.expectOne(members);
		expect(next.request.params.get('currentPageIndex')).toBe('1');
		next.flush({ entries: [member('target')], isNextPageAvailable: false });
		await fixture.whenStable();
		expect(component.members().map((row) => row.uid)).toEqual(['first', 'target']);
		expect(component.positionMessage()).toBe('');
		expect(TestBed.inject(CollectionDrawerNavigation).accepted()).toBeNull();
		expect(TestBed.inject(Router).navigateByUrl).not.toHaveBeenCalled();
	});
	it('does not apply a member request belonging to another repository or user', async () => {
		const { fixture, component, http } = await setup();
		const navigation = TestBed.inject(CollectionDrawerNavigation);
		navigation.accepted.set({
			sequence: 1,
			userId: 'member',
			repository: 'another',
			collection: collection(),
			member: member(),
		});
		fixture.detectChanges();
		expect(component.showingMembers()).toBeFalse();
		navigation.accepted.set({
			sequence: 2,
			userId: 'another-user',
			repository: 'secondary',
			collection: collection(),
			member: member(),
		});
		fixture.detectChanges();
		http.expectNone(members);
		expect(component.selectedCollection()).toBeNull();
	});
	it('preserves the open member list when return navigation is cancelled', async () => {
		const { component } = await setup(true);
		(TestBed.inject(Router).navigateByUrl as jasmine.Spy).and.resolveTo(false);
		await component.back();
		expect(component.showingMembers()).toBeTrue();
		expect(component.members().length).toBe(2);
		expect(component.navigationError()).toContain('cancelled');
	});
});
