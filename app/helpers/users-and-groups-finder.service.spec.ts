import { legacyTestProviders } from 'app/testing/legacy-test-providers';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import { UsersAndGroupsFinderService } from './users-and-groups-finder.service';

describe('UsersAndGroupsFinderService', () => {
	let service: UsersAndGroupsFinderService;
	let http: HttpTestingController;

	beforeEach(() => {
		TestBed.configureTestingModule({
			providers: [...legacyTestProviders()],
		});
		service = TestBed.inject(UsersAndGroupsFinderService);
		http = TestBed.inject(HttpTestingController);
	});

	it('should be created', () => {
		expect(service).toBeTruthy();
	});

	it('lists users and groups for a non-administrator whose entries carry no group details', () => {
		let result: any;
		service.getUsersAndGroups().subscribe((x) => (result = x));
		http
			.expectOne((req) => req.url.endsWith('/user/search?q=*'))
			.flush({
				entries: [
					{ id: 'alice', properties: { username: 'alice', firstName: 'Alice', lastName: 'A' } },
					{
						id: 'bob',
						properties: { username: 'bob' },
						extendedGroups: [{ name: 'members', label: 'Members group' }],
					},
				],
			});
		http
			.expectOne((req) => req.url.endsWith('/group/search?q=*'))
			.flush({
				entries: [
					{ id: 'members', groupname: 'members', grouplabel: 'Members group', properties: {} },
					{ id: 'staff', groupname: 'staff', properties: {}, memberUsers: ['alice'] },
				],
			});
		expect(result.users.map((u: any) => u.id)).toEqual(['alice', 'bob']);
		expect(result.users[0].groups).toEqual([]);
		expect(result.users[1].groups[0]).toEqual(jasmine.objectContaining({ id: 'members' }));
		expect(result.groups.find((g: any) => g.id === 'members').users).toEqual([]);
		expect(result.groups.find((g: any) => g.id === 'staff').users[0].id).toBe('alice');
	});
});
