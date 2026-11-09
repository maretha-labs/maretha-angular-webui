import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { User } from 'app/models/user';
import { UserGroup } from 'app/models/user-group';
import { UserInfo } from 'app/models/user-info';
import { environment } from 'environments/environment';
import { forkJoin, map, Observable } from 'rxjs';

@Injectable({
	providedIn: 'root',
})
export class UsersAndGroupsFinderService {
	private readonly apiUrl = `${environment.nuxeoUrl}/api/v1`;

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly httpClient: HttpClient) {}

	// --------------------------------------------------------------------------------------------------
	getUserInfo(userId = 'me'): Observable<UserInfo> {
		const headers = {
			headers: new HttpHeaders({
				properties: '*',
				'Enrichers-User': 'userprofile',
			}),
		};

		return this.httpClient
			.get(`${this.apiUrl}/${userId}/`, headers)
			.pipe(map((x: any) => this.mapToUserInfo(x)));
	}

	// --------------------------------------------------------------------------------------------------
	find(searchTerm: string) {
		const url = `${this.apiUrl}/automation/UserGroup.Suggestion`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {
				searchTerm,
				searchType: 'USER_GROUP_TYPE',
			},
			context: {},
		};

		return this.httpClient.post<any[]>(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	findUsers(searchTerm: string) {
		const url = `${this.apiUrl}/automation/UserGroup.Suggestion`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {
				searchTerm,
				searchType: 'USER_TYPE',
			},
			context: {},
		};

		return this.httpClient.post<any[]>(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	findGroups(searchTerm: string) {
		const url = `${this.apiUrl}/automation/UserGroup.Suggestion`;

		const headers = {
			headers: new HttpHeaders({
				properties: '*',
			}),
		};

		const payload = {
			params: {
				searchTerm,
				searchType: 'GROUP_TYPE',
			},
			context: {},
		};

		return this.httpClient.post<any[]>(url, payload, headers);
	}

	// --------------------------------------------------------------------------------------------------
	getUsers(): Observable<Record<string, User>> {
		const url = `${this.apiUrl}/user/search?q=*`;

		return this.httpClient.get(url).pipe(
			map((x: any) =>
				x.entries.reduce((agg: any, val: any) => {
					const user: User = {
						id: val.id,
						email: val.properties.email,
						firstName: val.properties.firstName,
						lastName: val.properties.lastName,
						name:
							val.properties.firstName || val.properties.lastName
								? `${val.properties.firstName} ${val.properties.lastName}`
								: val.properties.username,
						// A non-administrator sees users without `extendedGroups` (stock Nuxeo).
						groups: (val.extendedGroups ?? []).map((y: any) => {
							return {
								id: y.name,
								name: y.name,
								label: y.label,
								users: [],
								permissions: [],
							};
						}),
						isAdministrator: !!val.isAdministrator,
						isAnonymous: val.isAnonymous,
					};

					agg[val.id] = user;

					return agg;
				}, {}),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getGroups(): Observable<Record<string, UserGroup>> {
		const url = `${this.apiUrl}/group/search?q=*`;

		const headers = new HttpHeaders({
			properties: '*',
			'fetch-group': 'memberUsers',
		});

		return this.httpClient.get(url, { headers }).pipe(
			map((x: any) =>
				x.entries.reduce((agg: any, val: any) => {
					const group: UserGroup = {
						id: val.groupname,
						name: val.grouplabel || val.groupname,
						description: val.properties.description,
						users:
							(val.memberUsers ?? []).map((y: string) => {
								return {
									id: y,
									name: y,
									groups: [],
									permissions: [],
								};
							}) || [],
						permissions: [],
					};

					agg[val.id] = group;

					return agg;
				}, {}),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getUsersAndGroups() {
		return forkJoin({
			users: this.getUsers(),
			groups: this.getGroups(),
		}).pipe(
			map((response) => {
				const users = Object.values(response.users);

				users.forEach((user: any) =>
					user.groups.forEach((group: UserGroup) =>
						Object.assign(group, response.groups[group.id]),
					),
				);

				const groups = Object.values(response.groups);

				groups.forEach((x: any) =>
					x.users.forEach((user: User) => Object.assign(user, response.users[user.id])),
				);

				return { users, groups };
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	getPermissions(userOrGroupId: string) {
		const url = `${this.apiUrl}/automation/Repository.Query`;

		const payload = {
			params: {
				page: 0,
				pageSize: 25,
				query: `SELECT * FROM Document WHERE NOT (ecm:path STARTSWITH "/maretha") AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0 AND ecm:acl/*1/principal = "${userOrGroupId}"`,
			},
		};

		return this.httpClient.post(url, payload, { headers: { 'enrichers-document': 'acls' } }).pipe(
			map((x: any) =>
				x.entries.map((y: any) => {
					const acl = y.contextParameters.acls.find(
						(acl: any) =>
							acl.name === 'local' &&
							acl.aces.some((access: any) => access.username === userOrGroupId),
					);
					const access = acl?.aces.find((access: any) => access.username === userOrGroupId);

					return {
						on: y.title,
						uid: y.uid,
						type: y.type,
						path: y.path,
						right: access.permission,
						begin: access.begin,
						end: access.end,
					};
				}),
			),
		);
	}

	// --------------------------------------------------------------------------------------------------
	mapToUserInfo(userData: any): UserInfo {
		return {
			id: userData.id,
			firstName: userData.properties?.firstName,
			lastName: userData.properties?.lastName,
			company: userData.properties?.company,
			email: userData.properties?.email,
			phoneNumber: userData.contextParameters?.userprofile?.phonenumber,
			avatar: userData.contextParameters?.userprofile?.avatar,
			locale: userData.contextParameters?.userprofile?.locale,
			language: userData.contextParameters?.userprofile?.language,
			dateFormat: userData.contextParameters?.userprofile?.dateFormat,
			timeFormat: userData.contextParameters?.userprofile?.timeFormat,
			timeZone: userData.contextParameters?.userprofile?.timeZone,
			groups: userData.extendedGroups.map((group: any) => {
				return {
					id: group.name,
					name: group.label,
					description: group.properties?.description,
				};
			}),
			isAdministrator: userData.isAdministrator,
			isAnonymous: userData.isAnonymous,
		};
	}
}
