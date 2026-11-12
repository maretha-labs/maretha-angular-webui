import { Subject } from 'rxjs';
import { FavoritesDrawerComponent } from './favorites-drawer.component';
import { DocumentCollectionsService } from 'app/modules/explorer/helpers/document-collections.service';
import { Component, input, signal, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from 'app/helpers/auth.service';
import { PersonalWorkspaceService } from 'app/helpers/personal-workspace.service';
import { DocumentsManagerService } from 'app/modules/explorer/helpers/documents-manager.service';
import { PersonalWorkspaceDrawerComponent } from './personal-workspace-drawer.component';
import { DocumentTreeComponent } from '../document-tree/document-tree.component';
@Component({
	selector: 'nx-document-tree',
	changeDetection: ChangeDetectionStrategy.Eager,
	template: '',
})
class TreeStub {
	rootPath = input('');
	repository = input('');
	showRoot = input(false);
	navigate = input<unknown>();
}
describe('Personal workspace drawer', () => {
	const user = signal<{ id: string } | null>({ id: 'alice' });
	const document = signal<Record<string, unknown> | null>({ repository: 'default' });
	beforeEach(() => {
		user.set({ id: 'alice' });
		document.set({ repository: 'default' });
		TestBed.configureTestingModule({
			imports: [PersonalWorkspaceDrawerComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{ provide: AuthService, useValue: { userInfo: user.asReadonly() } },
				{ provide: DocumentsManagerService, useValue: { documentFetched: document.asReadonly() } },
			],
		});
		TestBed.overrideComponent(PersonalWorkspaceDrawerComponent, {
			remove: { imports: [DocumentTreeComponent] },
			add: { imports: [TreeStub] },
		});
	});
	const context = { user: { id: 'alice' }, navigate: () => undefined };
	it('shows the shared workspace, loaded once per identity and repository, not per document', async () => {
		const fixture = TestBed.createComponent(PersonalWorkspaceDrawerComponent);
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		TestBed.tick();
		const request = http.expectOne((req) => req.url.endsWith('/User.GetUserWorkspace'));
		expect(request.request.headers.get('X-NXRepository')).toBe('default');
		request.flush({ path: '/users/alice' });
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.workspace()?.path).toBe('/users/alice');
		fixture.destroy();
		const reopened = TestBed.createComponent(PersonalWorkspaceDrawerComponent);
		reopened.componentRef.setInput('context', context);
		reopened.detectChanges();
		document.set({ uid: 'another', repository: 'default' });
		TestBed.tick();
		http.expectNone((req) => req.url.endsWith('/User.GetUserWorkspace'));
		expect(reopened.componentInstance.workspace()?.path).toBe('/users/alice');
		document.set({ repository: 'other' });
		TestBed.tick();
		const next = http.expectOne((req) => req.url.endsWith('/User.GetUserWorkspace'));
		expect(next.request.headers.get('X-NXRepository')).toBe('other');
		next.flush({ path: '/other/alice' });
		await reopened.whenStable();
		expect(TestBed.inject(PersonalWorkspaceService).workspace()?.path).toBe('/other/alice');
		http.verify();
	});
	it('clears an obsolete response and offers retry after a failed request', async () => {
		const fixture = TestBed.createComponent(PersonalWorkspaceDrawerComponent);
		const http = TestBed.inject(HttpTestingController);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		TestBed.tick();
		const obsolete = http.expectOne((req) => req.url.endsWith('/User.GetUserWorkspace'));
		user.set({ id: 'bob' });
		TestBed.tick();
		expect(obsolete.cancelled).toBeTrue();
		http
			.expectOne((req) => req.url.endsWith('/User.GetUserWorkspace'))
			.flush({}, { status: 403, statusText: 'Forbidden' });
		await fixture.whenStable();
		fixture.detectChanges();
		expect(fixture.componentInstance.error()).toContain('could not');
		fixture.nativeElement.querySelector('button').click();
		TestBed.tick();
		http
			.expectOne((req) => req.url.endsWith('/User.GetUserWorkspace'))
			.flush({ path: '/users/bob' });
		await fixture.whenStable();
		expect(fixture.componentInstance.workspace()?.path).toBe('/users/bob');
		user.set(null);
		TestBed.tick();
		expect(fixture.componentInstance.workspace()).toBeNull();
		expect(fixture.componentInstance.loading()).toBeFalse();
		http.verify();
	});
});

describe('Favorites member drawer', () => {
	const added = new Subject<any>();
	const removed = new Subject<any>();
	let mutation: Subject<any>;
	let service: { toggleFavoriteDocument: jasmine.Spy };
	const context = {
		user: { id: 'alice' },
		document: { repository: 'archive' },
		noEdit: false,
		navigate: jasmine.createSpy('navigate'),
	};
	beforeEach(() => {
		mutation = new Subject<any>();
		service = { toggleFavoriteDocument: jasmine.createSpy('remove').and.returnValue(mutation) };
		context.navigate.calls.reset();
		TestBed.configureTestingModule({
			imports: [FavoritesDrawerComponent],
			providers: [
				provideHttpClient(withXhr()),
				provideHttpClientTesting(),
				{
					provide: DocumentCollectionsService,
					useValue: {
						...service,
						documentsAddedToCollection$: added,
						documentsRemovedFromCollection$: removed,
					},
				},
			],
		});
	});
	afterEach(() => TestBed.inject(HttpTestingController).verify());
	async function setup(
		entries: any[] = [{ uid: 'member', title: 'Saved Note', path: '/saved' }],
		more = false,
	) {
		const fixture = TestBed.createComponent(FavoritesDrawerComponent);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const favorite = http.expectOne((request) => request.url.endsWith('/Favorite.Fetch'));
		expect(favorite.request.headers.get('X-NXRepository')).toBe('archive');
		favorite.flush({ uid: 'favorites' });
		await Promise.resolve();
		const members = http.expectOne((request) =>
			request.url.endsWith('/default_content_collection/execute'),
		);
		expect(members.request.url).toContain('/repo/archive/');
		expect(members.request.params.get('pageSize')).toBe('30');
		expect(members.request.params.get('queryParams')).toBe('favorites');
		members.flush({ entries, isNextPageAvailable: more });
		await fixture.whenStable();
		fixture.detectChanges();
		return { fixture, http, component: fixture.componentInstance };
	}
	it('loads favorite members rather than the collection and pages without duplicates', async () => {
		const { fixture, http, component } = await setup(undefined, true);
		const navigate = spyOn(TestBed.inject(Router), 'navigateByUrl').and.resolveTo(true);
		expect(fixture.nativeElement.textContent).toContain('Saved Note');
		component.open(component.documents()[0]);
		expect(navigate).toHaveBeenCalledOnceWith('/browse/saved?repository=archive');
		expect(context.navigate).not.toHaveBeenCalled();
		component.loadMore();
		component.loadMore();
		const next = http.expectOne((request) =>
			request.url.endsWith('/default_content_collection/execute'),
		);
		expect(next.request.params.get('currentPageIndex')).toBe('1');
		next.flush({
			entries: [
				{ uid: 'member', title: 'Saved Note' },
				{ uid: 'two', title: 'Second' },
			],
			isNextPageAvailable: false,
		});
		await fixture.whenStable();
		expect(component.documents().map((row) => row.uid)).toEqual(['member', 'two']);
		component.loadMore();
		http.expectNone((request) => request.url.endsWith('/default_content_collection/execute'));
	});
	it('cancels a stale repository request and recovers from a failed lookup', async () => {
		const fixture = TestBed.createComponent(FavoritesDrawerComponent);
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		const http = TestBed.inject(HttpTestingController);
		const stale = http.expectOne((request) => request.url.endsWith('/Favorite.Fetch'));
		fixture.componentRef.setInput('context', { ...context, document: { repository: 'default' } });
		fixture.detectChanges();
		expect(stale.cancelled).toBeTrue();
		const current = http.expectOne((request) => request.url.endsWith('/Favorite.Fetch'));
		expect(current.request.headers.get('X-NXRepository')).toBe('default');
		current.flush({}, { status: 503, statusText: 'Unavailable' });
		await fixture.whenStable();
		expect(fixture.componentInstance.error()).toContain('could not');
		fixture.componentInstance.retry();
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush(null, { status: 204, statusText: 'No Content' });
		await fixture.whenStable();
		expect(fixture.componentInstance.documents()).toEqual([]);
		expect(fixture.componentInstance.error()).toBe('');
	});
	it('removes membership in its repository, suppresses stale rows and honors read-only mode', async () => {
		const { fixture, http, component } = await setup();
		const row = component.documents()[0];
		fixture.componentRef.setInput('context', { ...context, noEdit: true });
		fixture.detectChanges();
		component.remove(row);
		expect(service.toggleFavoriteDocument).not.toHaveBeenCalled();
		fixture.componentRef.setInput('context', context);
		fixture.detectChanges();
		component.remove(row);
		component.remove(row);
		expect(service.toggleFavoriteDocument).toHaveBeenCalledOnceWith(
			['member'],
			false,
			'archive',
			jasmine.any(Function),
		);
		removed.next({ collectionUid: 'favorites', repository: 'archive', documentUids: ['member'] });
		http
			.expectOne((request) => request.url.endsWith('/default_content_collection/execute'))
			.flush({ entries: [row], isNextPageAvailable: false });
		mutation.next({});
		mutation.complete();
		await fixture.whenStable();
		expect(component.documents()).toEqual([]);
		expect(component.removing()).toBeNull();
		removed.next({ collectionUid: 'favorites', repository: 'other', documentUids: ['member'] });
		http.expectNone((request) => request.url.endsWith('/default_content_collection/execute'));
	});
	it('acknowledges a committed removal when the follow-up collection refresh fails', async () => {
		const { fixture, component } = await setup();
		component.remove(component.documents()[0]);
		service.toggleFavoriteDocument.calls.mostRecent().args[3]();
		mutation.error(new Error('count refresh failed'));
		await fixture.whenStable();
		expect(component.documents()).toEqual([]);
		expect(component.error()).toContain('was removed');
		expect(component.removing()).toBeNull();
	});

	it('cancels pending mutation follow-up when the drawer identity changes', async () => {
		const { fixture, http, component } = await setup();
		component.remove(component.documents()[0]);
		expect(mutation.observed).toBeTrue();
		fixture.componentRef.setInput('context', { ...context, document: { repository: 'other' } });
		fixture.detectChanges();
		expect(mutation.observed).toBeFalse();
		http
			.expectOne((request) => request.url.endsWith('/Favorite.Fetch'))
			.flush(null, { status: 204, statusText: 'No Content' });
		await fixture.whenStable();
		expect(component.documents()).toEqual([]);
		expect(component.error()).toBe('');
		expect(component.removing()).toBeNull();
	});
});
