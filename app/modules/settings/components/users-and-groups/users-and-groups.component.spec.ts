import { WebUiMessages } from '@maretha/webui-sdk';
import { signal } from '@angular/core';
import { AuthService } from 'app/helpers/auth.service';
import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { BsModalService } from 'ngx-bootstrap/modal';
import { UsersAndGroupsService } from '../../helpers/users-and-groups.service';
import { UsersAndGroupsComponent } from './users-and-groups.component';

describe('UsersAndGroupsComponent', () => {
	let component: UsersAndGroupsComponent;
	let fixture: ComponentFixture<UsersAndGroupsComponent>;
	let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
	let directory: Subject<any>;
	let http: HttpTestingController;
	beforeEach(async () => {
		params = new BehaviorSubject(convertToParamMap({ admin: 'users' }));
		directory = new Subject();
		await TestBed.configureTestingModule({
			providers: [
				...legacyTestProviders(),
				{ provide: ActivatedRoute, useValue: { queryParamMap: params } },
				{
					provide: AuthService,
					useValue: { userInfo: signal({ id: 'fixture-reader', isAdministrator: true }) },
				},
			],
			imports: [UsersAndGroupsComponent],
		}).compileComponents();
		http = TestBed.inject(HttpTestingController);
		const service = TestBed.inject(UsersAndGroupsService);
		spyOn(service, 'getDirectory').and.returnValue(directory);
		spyOn(service, 'getGroupMembers').and.callFake((id, kind) => {
			const group = component.userGroups.find((entry) => entry.id === id);
			const entries =
				kind === 'user'
					? (group?.users ?? [])
					: (group?.memberGroups ?? []).map(
							(member: string) =>
								component.userGroups.find((entry) => entry.id === member) ?? {
									id: member,
									name: member,
									users: [],
									memberGroups: [],
								},
						);
			return of({ entries, pageIndex: 0, numberOfPages: 1, hasNext: false });
		});
		fixture = TestBed.createComponent(UsersAndGroupsComponent);
		component = fixture.componentInstance;
		fixture.detectChanges();
	});
	afterEach(() => http.verify());

	for (const [column, index, ascending] of [
		['name', 0, ['c', 'a', 'b']],
		['id', 1, ['a', 'b', 'c']],
		['email', 2, ['c', 'b', 'a']],
	] as const) {
		it(`cycles recent ${column} sorting ascending, descending and off without refetching or changing provider order`, () => {
			const recent = Object.freeze([
				{ id: 'b', firstName: 'Carla', email: 'b@example.test', kind: 'user' },
				{ id: 'c', name: 'Ada', email: 'a@example.test', kind: 'group' },
				{ id: 'a', firstName: 'Berta', email: 'c@example.test', kind: 'user' },
			]);
			directory.next({ users: [], groups: [], recentEntries: recent });
			fixture.detectChanges();
			const headers = fixture.nativeElement.querySelectorAll('.directory-table .sort-button');
			expect(headers.length).toBe(3);
			const ids = () => component.directoryRows().map((row) => row.id);
			expect(ids()).toEqual(['b', 'c', 'a']);
			headers[index].click();
			fixture.detectChanges();
			expect(ids()).toEqual([...ascending]);
			headers[index].click();
			fixture.detectChanges();
			expect(ids()).toEqual([...ascending].reverse());
			headers[index].click();
			fixture.detectChanges();
			expect(ids()).toEqual(['b', 'c', 'a']);
			expect(recent.map((row) => row.id)).toEqual(['b', 'c', 'a']);
			expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(1);
		});
	}

	it('uses secondary column sorting only for ties and keeps the first clicked column primary', () => {
		const recent = Object.freeze([
			{ id: 'z', firstName: 'Sam', email: 'a@example.test', kind: 'user' },
			{ id: 'a', firstName: 'Ada', email: 'z@example.test', kind: 'user' },
			{ id: 'b', firstName: 'Sam', email: 'z@example.test', kind: 'user' },
			{ id: 'y', firstName: 'Ada', email: 'a@example.test', kind: 'user' },
		]);
		directory.next({ users: [], groups: [], recentEntries: recent });
		component.sortDirectory('name');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['a', 'y', 'z', 'b']);
		expect(component.directorySortPriority('name')).toBe(1);
		expect(component.directorySortPriority('email')).toBe(0);
		component.sortDirectory('email');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['y', 'a', 'z', 'b']);
		expect(component.directorySortPriority('email')).toBe(2);
		component.sortDirectory('email');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['a', 'y', 'b', 'z']);
		component.sortDirectory('email');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['a', 'y', 'z', 'b']);
		component.sortDirectory('name');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['z', 'b', 'a', 'y']);
		component.sortDirectory('name');
		expect(component.directoryRows().map((row) => row.id)).toEqual(['z', 'a', 'b', 'y']);
		expect(recent.map((row) => row.id)).toEqual(['z', 'a', 'b', 'y']);
		expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(1);
	});

	it('preserves server page order for directory searches and hides local recent-list sort controls', () => {
		directory.next({
			users: [],
			groups: [],
			recentEntries: [{ id: 'recent', name: 'Recent', kind: 'user' }],
		});
		component.sortDirectory('name');
		component.searchDirectory('matching');
		directory.next({
			users: [
				{ id: 'z-user', name: 'Zed', groups: [] },
				{ id: 'a-user', name: 'Ada', groups: [] },
			],
			groups: [
				{ id: 'z-group', name: 'Zed', users: [] },
				{ id: 'a-group', name: 'Ada', users: [] },
			],
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('.directory-table .sort-button').length).toBe(0);
		expect(component.directoryRows().map((row) => row.id)).toEqual([
			'z-group',
			'a-group',
			'z-user',
			'a-user',
		]);
		component.sortDirectory('id');
		expect(component.directoryRows().map((row) => row.id)).toEqual([
			'z-group',
			'a-group',
			'z-user',
			'a-user',
		]);
		expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(2);
	});

	for (const kind of ['user', 'group'] as const) {
		it(`opens the rendered ${kind} pill in management once without a nested profile link`, () => {
			const row = {
				id: kind + '-one',
				name: 'Principal One',
				firstName: 'Principal',
				lastName: 'One',
				kind,
			};
			directory.next({ users: [], groups: [], recentEntries: [row] });
			const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
			fixture.detectChanges();
			const action = fixture.nativeElement.querySelector(
				'.directory-table .principal-action',
			) as HTMLButtonElement;
			expect(action).not.toBeNull();
			expect(action.disabled).toBeFalse();
			expect(action.querySelector('a, button, [role="link"]')).toBeNull();
			const pill = action.querySelector(
				kind === 'user' ? 'nx-user-tag .user-tag' : '.principal-tag',
			) as HTMLElement;
			expect(pill).not.toBeNull();
			pill.click();
			expect(navigate).toHaveBeenCalledOnceWith(
				[],
				jasmine.objectContaining({
					queryParams: { admin: 'users', entity: kind, id: row.id },
					queryParamsHandling: 'merge',
				}),
			);
			navigate.calls.reset();
			const identifier = action.closest('tr')!.querySelector('td:nth-child(2)') as HTMLElement;
			identifier.click();
			expect(navigate).toHaveBeenCalledOnceWith(
				[],
				jasmine.objectContaining({
					queryParams: { admin: 'users', entity: kind, id: row.id },
					queryParamsHandling: 'merge',
				}),
			);
			expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(1);
		});
	}

	it('relocalizes directory and member failures while retaining customer server text', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('directory-failure-test', {
			fr: {
				'app.settingsShared.unable-to-load-this-directory-page-8ae94c': 'Page indisponible.',
				'app.settingsShared.unable-to-load-group-members-retry-a1725f': 'Membres indisponibles.',
			},
		});
		directory.error(new Error('offline'));
		expect(component.pageError('users')).toBe('Unable to load this directory page.');
		messages.locale.set('fr');
		expect(component.pageError('users')).toBe('Page indisponible.');
		component.pages.memberUsers.error = 'Unable to load group members. Retry.';
		expect(component.pageError('memberUsers')).toBe('Membres indisponibles.');
		component.pages.groups.error = 'Customer upstream diagnostic';
		expect(component.pageError('groups')).toBe('Customer upstream diagnostic');
	});
	it('selects the routed entity after the directory loads and restores selection on back navigation', () => {
		params.next(convertToParamMap({ admin: 'users', entity: 'user', id: 'bob' }));
		directory.next({
			users: [{ id: 'bob', name: 'Bob', groups: [] }],
			groups: [{ id: 'team', name: 'Team', users: [], memberGroups: [] }],
		});
		expect(component.users[0].expanded).toBeTrue();
		params.next(convertToParamMap({ admin: 'users', entity: 'group', id: 'team' }));
		expect(component.users[0].expanded).toBeFalse();
		expect(component.userGroups[0].expanded).toBeTrue();
		params.next(convertToParamMap({ admin: 'users', entity: 'user', id: 'bob' }));
		expect(component.users[0].expanded).toBeTrue();
		expect(component.userGroups[0].expanded).toBeFalse();
	});

	it('fetches an entity absent from the directory and cancels obsolete route requests', () => {
		directory.next({ users: [], groups: [] });
		params.next(convertToParamMap({ entity: 'user', id: 'outside' }));
		const obsolete = http.expectOne((request) => request.url.endsWith('/user/outside'));
		params.next(convertToParamMap({ entity: 'group', id: 'remote' }));
		expect(obsolete.cancelled).toBeTrue();
		http
			.expectOne((request) => request.url.endsWith('/group/remote'))
			.flush({ groupname: 'remote', grouplabel: 'Remote', memberUsers: ['bob'] });
		expect(component.users).toEqual([]);
		expect(component.userGroups[0]).toEqual(
			jasmine.objectContaining({ id: 'remote', expanded: true }),
		);
		expect(component.userGroups[0].users[0].id).toBe('bob');
		expect(component.selectionLoading).toBeFalse();
	});

	it('reports a missing linked entity and clears the error when returning to the directory', () => {
		directory.next({ users: [], groups: [] });
		params.next(convertToParamMap({ entity: 'user', id: 'missing' }));
		http
			.expectOne((request) => request.url.endsWith('/user/missing'))
			.flush({}, { status: 404, statusText: 'Not Found' });
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'Unable to load user missing',
		);
		params.next(convertToParamMap({ admin: 'users' }));
		expect(component.selectionError).toBe('');
	});

	it('records expanded entities in the URL and cancels their requests on destruction', () => {
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.toggleUser({ id: 'bob' });
		expect(navigate).toHaveBeenCalledWith(
			[],
			jasmine.objectContaining({
				queryParams: { admin: 'users', entity: 'user', id: 'bob' },
				queryParamsHandling: 'merge',
			}),
		);
		directory.next({ users: [], groups: [] });
		params.next(convertToParamMap({ entity: 'user', id: 'pending' }));
		const pending = http.expectOne((request) => request.url.endsWith('/user/pending'));
		fixture.destroy();
		expect(pending.cancelled).toBeTrue();
	});
	it('refreshes saved profile fields and keeps memberships outside the initially loaded directory', () => {
		const user = { id: 'bob', name: 'Bob', email: 'old@example.com', groups: [] };
		directory.next({ users: [user], groups: [] });
		const saved = {
			...user,
			email: 'new@example.com',
			company: 'New Company',
			groups: [{ id: 'outside', name: 'Outside', users: [] }],
		};
		spyOn(TestBed.inject(BsModalService), 'show').and.returnValue({
			content: { save$: of(saved) },
		} as any);
		component.showEditor(false, user);
		expect(component.users[0].email).toBe('new@example.com');
		expect(component.users[0].company).toBe('New Company');
		expect(component.users[0].groups[0].id).toBe('outside');
	});
	it('keeps a failed deletion visible and allows retry without duplicate delete requests', () => {
		const group = { id: 'team/a', name: 'Team A', users: [{ id: 'bob', name: 'Bob', groups: [] }] };
		const user = { id: 'bob', name: 'Bob', groups: [group] };
		const parent = { id: 'parent', name: 'Parent', users: [], memberGroups: ['team/a'] };
		directory.next({ users: [user], groups: [group, parent] });
		const first = new Subject();
		const retry = new Subject();
		const modal = spyOn(TestBed.inject(BsModalService), 'show').and.returnValues(
			{ content: { confirm$: first, decline$: new Subject() }, hide: jasmine.createSpy() } as any,
			{ content: { confirm$: retry, decline$: new Subject() }, hide: jasmine.createSpy() } as any,
		);
		component.deleteUserOrGroup(true, group);
		component.deleteUserOrGroup(true, group);
		expect(modal).toHaveBeenCalledTimes(1);
		first.next(true);
		first.next(true);
		const deletion = http.expectOne(
			(request) => request.method === 'DELETE' && request.url.endsWith('/group/team%2Fa'),
		);
		deletion.flush({}, { status: 403, statusText: 'Forbidden' });
		expect(component.userGroups).toContain(group);
		expect(component.users[0].groups).toContain(group);
		expect(component.actionBusy).toBeFalse();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
			'Unable to delete group team/a',
		);
		component.deleteUserOrGroup(true, group);
		retry.next(true);
		http
			.expectOne(
				(request) => request.method === 'DELETE' && request.url.endsWith('/group/team%2Fa'),
			)
			.flush(null);
		expect(component.userGroups).toEqual([parent]);
		expect(parent.memberGroups).toEqual([]);
		expect(component.users[0].groups).toEqual([]);
		expect(component.actionError).toBe('');
	});
	it('invalidates a pending destructive confirmation when navigation changes', () => {
		const group = { id: 'team', name: 'Team', users: [] };
		directory.next({ users: [{ id: 'bob', name: 'Bob', groups: [] }], groups: [group] });
		const confirmation = new Subject();
		const hide = jasmine.createSpy();
		spyOn(TestBed.inject(BsModalService), 'show').and.returnValue({
			content: { confirm$: confirmation, decline$: new Subject() },
			hide,
		} as any);
		component.deleteUserOrGroup(true, group);
		params.next(convertToParamMap({ admin: 'users', entity: 'user', id: 'bob' }));
		confirmation.next(true);
		expect(hide).toHaveBeenCalled();
		expect(component.pendingDelete).toBeFalse();
		expect(component.userGroups).toContain(group);
		http.expectNone((request) => request.method === 'DELETE');
	});
	it('keeps membership after a failed detach and permits a single retry even for off-page groups', () => {
		const group = { id: 'outside', name: 'Outside', users: [] };
		const user = { id: 'bob', name: 'Bob', groups: [group] };
		directory.next({ users: [user], groups: [] });
		component.detachUserFromGroup('bob', 'outside');
		component.detachUserFromGroup('bob', 'outside');
		http
			.expectOne(
				(request) => request.method === 'DELETE' && request.url.endsWith('/user/bob/group/outside'),
			)
			.flush({}, { status: 503, statusText: 'Unavailable' });
		expect(user.groups).toContain(group);
		expect(component.actionBusy).toBeFalse();
		expect(component.actionError).toContain('Unable to remove bob from outside');
		component.detachUserFromGroup('bob', 'outside');
		http
			.expectOne(
				(request) => request.method === 'DELETE' && request.url.endsWith('/user/bob/group/outside'),
			)
			.flush(null);
		expect(user.groups).toEqual([]);
		expect(component.actionError).toBe('');
	});
	it('loads nested groups for an expanded directory result and routes a nested group link', () => {
		const parent = { id: 'parent', name: 'Parent', users: [] };
		directory.next({
			users: [],
			groups: [parent, { id: 'child', name: 'Child Group', users: [] }],
		});
		params.next(convertToParamMap({ admin: 'users', entity: 'group', id: 'parent' }));
		http
			.expectOne((request) => request.url.endsWith('/group/parent'))
			.flush({
				groupname: 'parent',
				grouplabel: 'Parent',
				memberUsers: [],
				memberGroups: ['child'],
			});
		expect(component.userGroups.find((group) => group.id === 'parent').memberGroups).toEqual([
			'child',
		]);
		const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		fixture.detectChanges();
		const nested = [...fixture.nativeElement.querySelectorAll('button.badge')].find((button: any) =>
			button.textContent.includes('Child Group'),
		) as HTMLButtonElement;
		expect(nested).toBeTruthy();
		nested.click();
		expect(navigate).toHaveBeenCalledWith(
			[],
			jasmine.objectContaining({ queryParams: { admin: 'users', entity: 'group', id: 'child' } }),
		);
	});
	it('opens the in-page creator and refreshes each create-another result without leaving it', () => {
		directory.next({ users: [], groups: [], recentEntries: [] });
		const modal = spyOn(TestBed.inject(BsModalService), 'show');
		component.showEditor(true);
		expect(component.creating).toBe('group');
		expect(modal).not.toHaveBeenCalled();
		component.created();
		component.created();
		expect(component.creating).toBe('group');
		expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(3);
	});
	it('cancels obsolete directory searches and preserves each list page when navigating', () => {
		directory.next({ users: [], groups: [] });
		(TestBed.inject(UsersAndGroupsService).getDirectory as jasmine.Spy).and.callThrough();
		component.searchDirectory('old');
		const oldUsers = http.expectOne((request) => request.url.endsWith('/user/search'));
		const oldGroups = http.expectOne((request) => request.url.endsWith('/group/search'));
		component.searchDirectory('new');
		expect(oldUsers.cancelled).toBeTrue();
		expect(oldGroups.cancelled).toBeTrue();
		http
			.expectOne((request) => request.url.endsWith('/user/search'))
			.flush({ entries: [{ id: 'new-user' }], numberOfPages: 3 });
		http
			.expectOne((request) => request.url.endsWith('/group/search'))
			.flush({ entries: [], numberOfPages: 2 });
		expect(component.users.map((user) => user.id)).toEqual(['new-user']);
		component.changePage('users', 1);
		const nextUsers = http.expectOne((request) => request.url.endsWith('/user/search'));
		const sameGroups = http.expectOne((request) => request.url.endsWith('/group/search'));
		expect(nextUsers.request.params.get('q')).toBe('new');
		expect(nextUsers.request.params.get('currentPageIndex')).toBe('1');
		expect(sameGroups.request.params.get('currentPageIndex')).toBe('0');
		nextUsers.flush({ entries: [{ id: 'next-user' }], currentPageIndex: 1, numberOfPages: 3 });
		sameGroups.flush({ entries: [], numberOfPages: 2 });
		component.searchDirectory('reset');
		const reset = http.expectOne((request) => request.url.endsWith('/user/search'));
		expect(reset.request.params.get('currentPageIndex')).toBe('0');
		const pendingGroups = http.expectOne((request) => request.url.endsWith('/group/search'));
		fixture.destroy();
		expect(reset.cancelled).toBeTrue();
		expect(pendingGroups.cancelled).toBeTrue();
	});
	it('pages members separately from complete memberships, cancels stale filters and returns from an emptied last page', () => {
		const group = {
			id: 'parent',
			name: 'Parent',
			users: [
				{ id: 'alice', name: 'Alice', groups: [] },
				{ id: 'bob', name: 'Bob', groups: [] },
			],
			memberGroups: ['child'],
		};
		directory.next({ users: [], groups: [group] });
		const members = TestBed.inject(UsersAndGroupsService).getGroupMembers as jasmine.Spy;
		members.and.callThrough();
		params.next(convertToParamMap({ entity: 'group', id: 'parent' }));
		const first = http.expectOne((request) => request.url.endsWith('/parent/@users'));
		http
			.expectOne((request) => request.url.endsWith('/parent/@groups'))
			.flush({ entries: [{ groupname: 'child' }], numberOfPages: 1 });
		component.searchMembers('memberUsers', 'bob');
		expect(first.cancelled).toBeTrue();
		const filtered = http.expectOne((request) => request.url.endsWith('/parent/@users'));
		expect(filtered.request.params.get('q')).toBe('bob');
		filtered.flush({ entries: [{ id: 'bob' }], numberOfPages: 2 });
		expect(group.users.map((user) => user.id)).toEqual(['alice', 'bob']);
		expect(group.memberGroups).toEqual(['child']);
		component.changePage('memberUsers', 1);
		http
			.expectOne((request) => request.url.endsWith('/parent/@users'))
			.flush({ entries: [], currentPageIndex: 1, numberOfPages: 1 });
		const previous = http.expectOne((request) => request.url.endsWith('/parent/@users'));
		expect(previous.request.params.get('currentPageIndex')).toBe('0');
		params.next(convertToParamMap({ admin: 'users' }));
		expect(previous.cancelled).toBeTrue();
		expect(component.pages.memberUsers.entries).toEqual([]);
	});
	it('refreshes after an invitation without inserting a user before the account exists', () => {
		directory.next({ users: [], groups: [] });
		component.showEditor(false);
		component.created();
		expect(component.users).toEqual([]);
		expect(TestBed.inject(UsersAndGroupsService).getDirectory).toHaveBeenCalledTimes(2);
	});
	it('honors list-only administration links without requiring an entity identifier', () => {
		directory.next({ users: [], groups: [] });
		params.next(convertToParamMap({ admin: 'users', entity: 'group' }));
		fixture.detectChanges();
		const lists = fixture.nativeElement.querySelectorAll('.row > .col');
		expect(lists[0].hidden).toBeFalse();
		expect(lists[1].hidden).toBeTrue();
		params.next(convertToParamMap({ admin: 'users', entity: 'user' }));
		fixture.detectChanges();
		expect(lists[0].hidden).toBeTrue();
		expect(lists[1].hidden).toBeFalse();
	});
	it('returns from a directory page removed by concurrent deletions without resetting the other list', () => {
		directory.next({ users: [], groups: [] });
		const service = TestBed.inject(UsersAndGroupsService);
		component.pages.users.pageIndex = 4;
		component.pages.groups.pageIndex = 2;
		component.getUsersAndGroups();
		directory.next({
			users: [],
			groups: [{ id: 'team', name: 'Team', users: [] }],
			usersPage: { entries: [], pageIndex: 4, numberOfPages: 2, hasNext: false },
			groupsPage: {
				entries: [{ id: 'team', name: 'Team', users: [] }],
				pageIndex: 2,
				numberOfPages: 3,
				hasNext: false,
			},
		});
		expect(service.getDirectory).toHaveBeenCalledWith('', 1, 2);
		expect(component.pages.users.pageIndex).toBe(1);
		expect(component.pages.groups.pageIndex).toBe(2);
	});
	it('handles Escape drag cancel, directory row selection, error states, and modal editor updates for users and groups', () => {
		const ev = new KeyboardEvent('keyup', { key: 'Escape' });
		component.handleKeyboardEvent(ev);
		expect((component as any).dragCanceled).toBeTrue();

		directory.next({
			users: [{ id: 'u1', name: 'U1', groups: [] }],
			groups: [{ id: 'g1', name: 'G1', users: [], memberGroups: [] }],
			recentEntries: [{ id: 'u1', kind: 'user' }],
		});
		expect(component.directoryRows()).toEqual([{ id: 'u1', kind: 'user' }]);
		component.directoryQuery = 'u1';
		expect(component.directoryRows().length).toBe(2);
		const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
		component.openDirectoryRow({ id: 'u1', kind: 'user', expanded: false });
		expect(nav).toHaveBeenCalled();
		component.openDirectoryRow({ id: 'u1', kind: 'user', expanded: true });
		expect(nav).toHaveBeenCalledTimes(2);

		// Modal editor save updates existing user and group in place
		const userSaved$ = new Subject<any>();
		const groupSaved$ = new Subject<any>();
		spyOn(TestBed.inject(BsModalService), 'show').and.returnValues(
			{ content: { save$: userSaved$ }, onHidden: new Subject<void>() } as any,
			{ content: { save$: groupSaved$ }, onHidden: new Subject<void>() } as any,
		);
		component.showEditor(false, component.users[0] as any);
		userSaved$.next({
			id: 'u1',
			name: 'Updated U1',
			firstName: 'Up',
			lastName: 'User',
			email: 'u1@example.org',
			company: 'Maretha',
			groups: [{ id: 'g1', name: 'G1', users: [] }],
		});
		expect(component.users[0].name).toBe('Updated U1');
		expect(component.userGroups[0].users.length).toBe(1);

		component.showEditor(true, component.userGroups[0] as any);
		groupSaved$.next({
			id: 'g1',
			name: 'Updated G1',
			description: 'Desc',
			memberGroups: [],
			users: [],
		});
		expect(component.userGroups[0].name).toBe('Updated G1');
		expect(component.users[0].groups.length).toBe(0);
	});
});
