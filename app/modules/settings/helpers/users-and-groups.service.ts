import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { User } from 'app/models/user';
import { UserGroup } from 'app/models/user-group';
import { UserInfo } from 'app/models/user-info';
import { environment } from 'environments/environment';
import { forkJoin, map, Observable } from 'rxjs';

export interface ManagedUserGroup extends UserGroup {
	memberGroups: string[];
}

export interface AdministrationPage<T> {
	entries: T[];
	pageIndex: number;
	numberOfPages: number | null;
	hasNext: boolean;
}

interface DirectoryResult {
	users: User[];
	groups: ManagedUserGroup[];
	usersPage: AdministrationPage<User>;
	groupsPage: AdministrationPage<ManagedUserGroup>;
	recentEntries?: any[];
}

@Injectable({
	providedIn: 'root',
})
export class UsersAndGroupsService {
	private apiUrl = `${environment.nuxeoUrl}/api/v1`;

	// --------------------------------------------------------------------------------------------------
	constructor(private readonly httpClient: HttpClient) {}

	getDirectory(query = '*', usersPage = 0, groupsPage = 0): Observable<DirectoryResult> {
		if (!query) return this.getRecentDirectory();
		return forkJoin({
			usersPage: this.getAdministrationPage<User>('user/search', query, usersPage, false),
			groupsPage: this.getAdministrationPage<ManagedUserGroup>(
				'group/search',
				query,
				groupsPage,
				true,
			),
		}).pipe(
			map((result) => ({
				...result,
				users: result.usersPage.entries,
				groups: result.groupsPage.entries,
			})),
		);
	}

	// The stock landing list is backed by the audit recent-creation provider.
	getRecentDirectory(): Observable<DirectoryResult> {
		return this.httpClient
			.get<any>(`${this.apiUrl}/query/LATEST_CREATED_USERS_OR_GROUPS_PROVIDER`, {
				headers: { properties: '*' },
			})
			.pipe(
				map((response) => {
					const recentEntries = (response.entries ?? []).map((entry: any) => {
						const p = entry.properties ?? {};
						const group = entry.type === 'group';
						const id = entry.uid ?? entry.id;
						return group
							? {
									id,
									name: p['group:grouplabel'] || id,
									users: [],
									memberGroups: [],
									kind: 'group' as const,
								}
							: {
									id,
									name:
										[p['user:firstName'], p['user:lastName']].filter(Boolean).join(' ') ||
										p['user:email'] ||
										id,
									firstName: p['user:firstName'],
									lastName: p['user:lastName'],
									email: p['user:email'],
									groups: [],
									kind: 'user' as const,
								};
					});
					const users = recentEntries.filter((row: any) => row.kind === 'user');
					const groups = recentEntries.filter((row: any) => row.kind === 'group');
					const page = (entries: any[]) => ({
						entries,
						pageIndex: 0,
						numberOfPages: 1,
						hasNext: false,
					});
					return { users, groups, usersPage: page(users), groupsPage: page(groups), recentEntries };
				}),
			);
	}

	getGroupMembers(groupId: string, kind: 'user' | 'group', query = '', pageIndex = 0) {
		return this.getAdministrationPage<User | ManagedUserGroup>(
			`group/${encodeURIComponent(groupId)}/@${kind === 'user' ? 'users' : 'groups'}`,
			query,
			pageIndex,
			kind === 'group',
		);
	}

	private getAdministrationPage<T extends User | ManagedUserGroup>(
		path: string,
		query: string,
		pageIndex: number,
		isGroup: boolean,
	) {
		return this.httpClient
			.get<any>(`${this.apiUrl}/${path}`, {
				params: { q: query, currentPageIndex: pageIndex },
				headers: { 'fetch-group': 'memberUsers,memberGroups', properties: '*' },
			})
			.pipe(
				map((response): AdministrationPage<T> => {
					const entries = (response.entries ?? []).map((entry: any) => {
						const properties = entry.properties ?? {};
						return isGroup
							? {
									id: entry.groupname || entry.id,
									name: entry.grouplabel || entry.groupname || entry.id,
									description: properties.description,
									memberGroups: entry.memberGroups ?? [],
									users: (entry.memberUsers ?? []).map((id: string) => ({
										id,
										name: id,
										groups: [],
									})),
								}
							: {
									id: entry.id,
									name:
										[properties.firstName, properties.lastName].filter(Boolean).join(' ') ||
										entry.id,
									firstName: properties.firstName,
									lastName: properties.lastName,
									email: properties.email,
									company: properties.company,
									isAdministrator: !!entry.isAdministrator,
									isAnonymous: !!entry.isAnonymous,
									groups: (entry.extendedGroups ?? []).map((group: any) => ({
										id: group.name,
										name: group.label || group.name,
										users: [],
									})),
								};
					}) as T[];
					const index = Number.isInteger(response.currentPageIndex)
						? response.currentPageIndex
						: pageIndex;
					const count =
						Number.isInteger(response.numberOfPages) && response.numberOfPages >= 0
							? response.numberOfPages
							: null;
					return {
						entries,
						pageIndex: index,
						numberOfPages: count,
						hasNext:
							typeof response.isNextPageAvailable === 'boolean'
								? response.isNextPageAvailable
								: count !== null && index + 1 < count,
					};
				}),
			);
	}

	getUser(id: string) {
		return this.httpClient.get<any>(`${this.apiUrl}/user/${encodeURIComponent(id)}`).pipe(
			map((entry): User => {
				const properties = entry.properties ?? {};
				return {
					id: entry.id,
					email: properties.email,
					firstName: properties.firstName,
					lastName: properties.lastName,
					company: properties.company,
					name: [properties.firstName, properties.lastName].filter(Boolean).join(' ') || entry.id,
					isAdministrator: !!entry.isAdministrator,
					isAnonymous: !!entry.isAnonymous,
					groups: (entry.extendedGroups ?? [])
						.filter(
							(group: any) =>
								!Array.isArray(properties.groups) || properties.groups.includes(group.name),
						)
						.map((group: any) => ({
							id: group.name,
							name: group.label || group.name,
							users: [],
						})),
				};
			}),
		);
	}

	getGroup(id: string) {
		return this.httpClient
			.get<any>(`${this.apiUrl}/group/${encodeURIComponent(id)}`, {
				headers: { 'fetch-group': 'memberUsers,memberGroups', properties: '*' },
			})
			.pipe(
				map(
					(entry): ManagedUserGroup => ({
						id: entry.groupname || entry.id,
						name: entry.grouplabel || entry.groupname || entry.id,
						description: entry.properties?.description,
						memberGroups: entry.memberGroups ?? [],
						users: (entry.memberUsers ?? []).map((userId: string) => ({
							id: userId,
							name: userId,
							groups: [],
						})),
					}),
				),
			);
	}

	// --------------------------------------------------------------------------------------------------
	getPermissions(userOrGroupId: string) {
		const url = `${this.apiUrl}/automation/Repository.Query`;

		const headers = new HttpHeaders({
			'enrichers-document': 'acls',
			properties: '*',
		});

		const payload = {
			context: {},
			params: {
				query: `SELECT * FROM Document WHERE NOT (ecm:path STARTSWITH "/maretha") AND ecm:isProxy = 0 AND ecm:isVersion = 0 AND ecm:isTrashed = 0 AND ecm:acl/*1/principal = "${userOrGroupId}"`,
				page: 0,
				pageSize: 25,
			},
		};

		return this.httpClient.post(url, payload, { headers }).pipe(
			map((x: any) => {
				const permissions = x.entries
					.map((y: any) => {
						const acls = y.contextParameters.acls.find((acl: any) =>
							acl.aces.some((access: any) => access.username === userOrGroupId),
						);
						const access = acls?.aces.find((access: any) => access.username === userOrGroupId);

						return {
							id: access.id,
							uid: y.uid,
							on: y.title,
							type: y.type,
							path: y.path,
							creator: access.creator,
							granted: access.granted,
							externalUser: access.externalUser,
							right: access.permission,
							begin: access.begin,
							end: access.end,
						};
					})
					.sort((a: any, b: any) => a.on.localeCompare(b.on));

				return permissions.filter(
					(value: any, index: number, self: any) =>
						self.findIndex((s: any) => s.uid === value.uid) === index,
				);
			}),
		);
	}

	// --------------------------------------------------------------------------------------------------
	removePermission(permissionId: string, permissionUid: string) {
		const url = `${this.apiUrl}/automation/Document.RemovePermission`;

		const headers = new HttpHeaders({
			properties: '*',
		});

		const payload = {
			context: {},
			input: permissionUid,
			params: {
				id: permissionId,
			},
		};

		return this.httpClient.post(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	setGroupUsers(groupId: string, userIds: string[]) {
		const url = `${this.apiUrl}/group/${encodeURIComponent(groupId)}`;

		const headers = new HttpHeaders({
			'enrichers-user': 'userprofile',
			'fetch-document': '',
			properties: '*',
		});

		const payload = {
			'entity-type': 'group',
			id: groupId,
			memberUsers: userIds,
		};

		return this.httpClient.put(url, payload, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	attachUserToGroup(userId: string, groupId: string) {
		const url = `${this.apiUrl}/user/${encodeURIComponent(userId)}/group/${encodeURIComponent(groupId)}`;

		const headers = new HttpHeaders({
			'enrichers-user': 'userprofile',
			'fetch-document': '',
			properties: '*',
		});

		return this.httpClient.post(url, null, { headers });
	}

	// --------------------------------------------------------------------------------------------------
	detachUserFromGroup(userId: string, groupId: string) {
		const url = `${this.apiUrl}/user/${encodeURIComponent(userId)}/group/${encodeURIComponent(groupId)}`;

		const headers = new HttpHeaders({
			'enrichers-user': 'userprofile',
			'fetch-document': '',
			properties: '*',
			accept: 'text/plain,application/json',
			'Content-Type': 'application/json',
		});

		return this.httpClient.delete(url, { headers, responseType: 'text' }).pipe(map(() => ({})));
	}

	// --------------------------------------------------------------------------------------------------
	addUser(user: User, password?: string, includeMemberships = false) {
		const payload = {
			'entity-type': 'user',
			id: user.id,
			properties: {
				firstName: user.firstName,
				lastName: user.lastName,
				company: user.company,
				email: user.email,
				username: user.id,
				password,
				...(includeMemberships ? { groups: user.groups.map((group) => group.id) } : {}),
			},
		};

		return this.httpClient.post<User>(`${this.apiUrl}/user`, payload);
	}

	// --------------------------------------------------------------------------------------------------
	updateUser(user: UserInfo, password?: string, includeMemberships = false) {
		const payload = {
			'entity-type': 'user',
			id: user.id,
			isAdministrator: user.isAdministrator,
			isAnonymous: user.isAnonymous,
			properties: {
				firstName: user.firstName,
				lastName: user.lastName,
				company: user.company,
				email: user.email,
				// username: user.id,
				password,
				...(includeMemberships ? { groups: user.groups.map((group) => group.id) } : {}),
			},
			contextParameters: {
				userprofile: {
					avatar: user.avatar,
					birthdate: user.birthDate,
					gender: user.gender,
					phonenumber: user.phoneNumber,
					locale: user.locale,
					language: user.language,
					dateformat: user.dateFormat,
					timeformat: user.timeFormat,
					timezone: user.timeZone,
				},
			},
		};

		return this.httpClient.put<User>(`${this.apiUrl}/user/${encodeURIComponent(user.id)}`, payload);
	}

	// --------------------------------------------------------------------------------------------------
	deleteUser(user: User) {
		return this.httpClient.delete(`${this.apiUrl}/user/${encodeURIComponent(user.id)}`);
	}

	// --------------------------------------------------------------------------------------------------
	addGroup(group: UserGroup, includeMemberships = false) {
		const payload = {
			'entity-type': 'group',
			id: group.id,
			...(includeMemberships
				? {
						groupname: group.id,
						grouplabel: group.name,
						memberUsers: group.users.map((user) => user.id),
						...(Array.isArray((group as Partial<ManagedUserGroup>).memberGroups)
							? { memberGroups: (group as ManagedUserGroup).memberGroups }
							: {}),
					}
				: {}),
			properties: {
				groupname: group.id,
				grouplabel: group.name,
				description: group.description,
			},
		};

		return this.httpClient.post<UserGroup>(`${this.apiUrl}/group`, payload);
	}

	// --------------------------------------------------------------------------------------------------
	updateGroup(group: UserGroup, includeMemberships = false) {
		const payload = {
			'entity-type': 'group',
			id: group.id,
			...(includeMemberships
				? {
						groupname: group.id,
						grouplabel: group.name,
						memberUsers: group.users.map((user) => user.id),
						...(Array.isArray((group as Partial<ManagedUserGroup>).memberGroups)
							? { memberGroups: (group as ManagedUserGroup).memberGroups }
							: {}),
					}
				: {}),
			properties: {
				groupname: group.id,
				grouplabel: group.name,
				description: group.description,
			},
		};

		return this.httpClient.put<UserGroup>(
			`${this.apiUrl}/group/${encodeURIComponent(group.id)}`,
			payload,
		);
	}

	// --------------------------------------------------------------------------------------------------
	deleteGroup(group: UserGroup) {
		return this.httpClient.delete(`${this.apiUrl}/group/${encodeURIComponent(group.id)}`);
	}

	// --------------------------------------------------------------------------------------------------
	changePassword(userId: string, oldPassword: string, newPassword: string) {
		return this.httpClient.put(`${this.apiUrl}/${encodeURIComponent(userId)}/changepassword`, {
			oldPassword,
			newPassword,
		});
	}
}
