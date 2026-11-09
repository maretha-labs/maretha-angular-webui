import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { UsersAndGroupsService } from './users-and-groups.service';

describe('UsersAndGroupsService', () => {
	let service: UsersAndGroupsService;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(UsersAndGroupsService);
	});

	afterEach(() => TestBed.inject(HttpTestingController).verify());

	it('loads and maps an encoded user identifier for a direct administration link', () => {
		let result: any;
		service.getUser('team/bob').subscribe((value) => (result = value));
		TestBed.inject(HttpTestingController)
			.expectOne((request) => request.url.endsWith('/user/team%2Fbob'))
			.flush({
				id: 'team/bob',
				properties: { firstName: 'Bob', email: 'bob@example.com' },
				extendedGroups: [{ name: 'members', label: 'Members' }],
			});
		expect(result.name).toBe('Bob');
		expect(result.groups[0]).toEqual({ id: 'members', name: 'Members', users: [] });
	});

	it('loads and maps a group outside the initial directory page', () => {
		let result: any;
		service.getGroup('team/a').subscribe((value) => (result = value));
		TestBed.inject(HttpTestingController)
			.expectOne((request) => request.url.endsWith('/group/team%2Fa'))
			.flush({
				groupname: 'team/a',
				grouplabel: 'Team A',
				memberGroups: ['child'],
				memberUsers: ['bob'],
				properties: { description: 'A team' },
			});
		expect(result).toEqual({
			id: 'team/a',
			name: 'Team A',
			description: 'A team',
			memberGroups: ['child'],
			users: [{ id: 'bob', name: 'bob', groups: [] }],
		});
	});

	it('uses the stock recent provider for the empty landing query and maps user/group document fields', () => {
		let result: any;
		service.getDirectory('').subscribe((value) => (result = value));
		const request = TestBed.inject(HttpTestingController).expectOne((item) =>
			item.url.endsWith('/query/LATEST_CREATED_USERS_OR_GROUPS_PROVIDER'),
		);
		request.flush({
			entries: [
				{ type: 'group', uid: 'reviewers', properties: { 'group:grouplabel': 'Reviewers' } },
				{
					type: 'user',
					uid: 'alice',
					properties: {
						'user:firstName': 'Alice',
						'user:lastName': 'Example',
						'user:email': 'alice@example.invalid',
					},
				},
			],
		});
		expect(
			result.recentEntries.map((entry: any) => [entry.kind, entry.id, entry.name, entry.email]),
		).toEqual([
			['group', 'reviewers', 'Reviewers', undefined],
			['user', 'alice', 'Alice Example', 'alice@example.invalid'],
		]);
		expect(result.users.length).toBe(1);
		expect(result.groups.length).toBe(1);
	});
	it('should be created', () => {
		expect(service).toBeTruthy();
	});
	it('keeps directory pages independent and uses the server page count without a client result cap', () => {
		const http = TestBed.inject(HttpTestingController);
		let result: any;
		service.getDirectory('review', 2, 4).subscribe((value) => (result = value));
		const users = http.expectOne((request) => request.url.endsWith('/user/search'));
		const groups = http.expectOne((request) => request.url.endsWith('/group/search'));
		expect(users.request.params.get('q')).toBe('review');
		expect(users.request.params.get('currentPageIndex')).toBe('2');
		expect(groups.request.params.get('currentPageIndex')).toBe('4');
		expect(groups.request.params.has('pageSize')).toBeFalse();
		expect(groups.request.headers.get('fetch-group')).toBe('memberUsers,memberGroups');
		users.flush({
			entries: [{ id: 'bob', properties: { firstName: 'Bob' } }],
			currentPageIndex: 2,
			numberOfPages: 8,
		});
		groups.flush({
			entries: [{ groupname: 'review', memberGroups: ['child'], memberUsers: ['bob'] }],
			currentPageIndex: 4,
			numberOfPages: 5,
		});
		expect(result.usersPage.hasNext).toBeTrue();
		expect(result.groupsPage.hasNext).toBeFalse();
		expect(result.groups[0].memberGroups).toEqual(['child']);
	});
	it('loads filtered group member pages through encoded group adapters', () => {
		let result: any;
		service.getGroupMembers('team/a', 'group', 'review', 3).subscribe((value) => (result = value));
		const request = TestBed.inject(HttpTestingController).expectOne((value) =>
			value.url.endsWith('/group/team%2Fa/@groups'),
		);
		expect(request.request.params.get('q')).toBe('review');
		expect(request.request.params.get('currentPageIndex')).toBe('3');
		request.flush({
			entries: [{ groupname: 'child', grouplabel: 'Reviewers' }],
			currentPageIndex: 3,
			numberOfPages: 10,
		});
		expect(result.entries[0].name).toBe('Reviewers');
		expect(result.hasNext).toBeTrue();
	});
	it('preserves default caller membership payloads while allowing an explicit administration update', () => {
		const user = {
			id: 'team/user',
			email: 'user@example.com',
			groups: [{ id: 'members', name: 'Members', users: [] }],
		};
		service.updateUser(user).subscribe();
		const original = TestBed.inject(HttpTestingController).expectOne((request) =>
			request.url.endsWith('/user/team%2Fuser'),
		);
		expect(original.request.body.properties.groups).toBeUndefined();
		original.flush({});
		service.updateUser(user, undefined, true).subscribe();
		const scoped = TestBed.inject(HttpTestingController).expectOne((request) =>
			request.url.endsWith('/user/team%2Fuser'),
		);
		expect(scoped.request.body.properties.groups).toEqual(['members']);
		scoped.flush({});
	});
});
