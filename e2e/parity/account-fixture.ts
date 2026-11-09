import { HttpRequest, HttpResponse } from '@angular/common/http';
import {
	ChangeDetectionStrategy,
	Component,
	makeEnvironmentProviders,
	signal,
} from '@angular/core';
import { PageContext } from '@maretha/webui-sdk';
import { ProfilePageComponent } from 'app/components/application-pages/profile-page.component';
import { ThemesPageComponent } from 'app/components/application-pages/themes-page.component';
import { UserCloudServicesPageComponent } from 'app/components/application-pages/user-cloud-services-page.component';
import { AuthService } from 'app/helpers/auth.service';
import { AnalyticsComponent } from 'app/modules/settings/components/analytics/analytics.component';
import { UsersAndGroupsComponent } from 'app/modules/settings/components/users-and-groups/users-and-groups.component';
import { AnalyticsService } from 'app/modules/settings/helpers/analytics.service';
import { of, throwError } from 'rxjs';

const user = {
	id: 'fixture-account',
	firstName: '',
	lastName: '',
	email: 'fixture-account@example.invalid',
	company: 'Fixture Company',
	groups: [
		{ id: 'administrators', name: 'Administrators group' },
		{ id: 'members', name: 'Members group' },
	],
	isAdministrator: true,
	isAnonymous: false,
};
const rows = (entries: [string, number][]) => entries.map(([key, value]) => ({ key, value }));
export function provideAccountFixture() {
	return makeEnvironmentProviders([
		{
			provide: AuthService,
			useValue: {
				userInfo: signal(user),
				userInfoUpdated$: of(user),
				logOff: () => undefined,
				changePassword: (old: string) =>
					old === 'wrong' ? throwError(() => new Error('Fixture old password rejected')) : of(null),
			},
		},
		{
			provide: AnalyticsService,
			useValue: {
				getDocumentDistribution: (path: string, depth: number, options: any) =>
					of({
						status: 'ready',
						nodes:
							path === '/default-domain/'
								? [
										{
											name: 'workspaces',
											count: 80 + (options.includeHidden ? 5 : 0),
											children: depth > 1 ? [{ name: 'Team', count: 30, children: [] }] : [],
										},
										{ name: 'sections', count: 20, children: [] },
									]
								: [{ name: 'Team', count: 30, children: [] }],
					}),
				getDistributionPaths: () =>
					of(['/default-domain/workspaces/', '/default-domain/sections/']),
				getSearchAnalytics: () =>
					of({
						complete: true,
						resultsCount: 5000,
						providers: rows([
							['default_search', 4000],
							['nxql_search', 1000],
						]),
						hours: Array.from({ length: 24 }, (_, hour) =>
							hour > 8 && hour < 17 ? 200 + hour * 5 : 0,
						),
						resultRanges: rows([
							['No result', 242],
							['Less than 50', 1260],
							['51 to 200', 3],
							['201 to 1000', 13],
							['More than 1000', 119],
						]),
						popularTerms: rows([
							['Birdy', 6],
							['beach', 2],
						]),
						pageRanges: rows([
							['First page', 1578],
							['Page 2', 50],
						]),
						filters: rows([
							['dc:title', 20],
							['dc:creator', 10],
						]),
					}),
				getWorkflowModels: () =>
					of([
						{
							id: 'ParallelDocumentReview',
							label: 'wf.parallelDocumentReview.ParallelDocumentReview',
						},
						{ id: 'SerialDocumentReview', label: 'wf.serialDocumentReview.SerialDocumentReview' },
					]),
				getWorkflowAnalytics: () =>
					of({
						complete: true,
						resultsCount: 5,
						averageWorkflowDurationMs: 120000,
						initiators: rows([
							['fixture-account', 3],
							['fixture-reviewer', 2],
						]),
						actions: rows([['fixture-reviewer · Review', 3]]),
						taskDurations: rows([['fixture-reviewer', 30000]]),
					}),
				getRepositoryAnalytics: () =>
					of({
						documents: 66,
						downloads: [{ uid: 'fixture-doc', title: 'Fixture report', value: 10 }],
						types: rows([
							['File', 40],
							['Folder', 26],
						]),
						creators: rows([
							['fixture-account', 50],
							['fixture-reviewer', 16],
						]),
						created: rows([
							['2026-09-21', 4],
							['2026-09-28', 10],
							['2026-10-05', 26],
							['2026-10-12', 26],
						]),
						modified: rows([
							['2026-09-21', 9],
							['2026-09-28', 7],
							['2026-10-05', 30],
							['2026-10-12', 20],
						]),
						mimeTypes: rows([
							['application/pdf', 40],
							['image/jpeg', 26],
						]),
					}),
			},
		},
	]);
}

/** Synthetic local responses only; a missing route falls through to the fixture's network denial. */
export function accountFixtureResponse(
	request: HttpRequest<unknown>,
): HttpResponse<unknown> | null {
	let body: any;
	if (request.url.includes('/automation/Repository.Query')) {
		const principal = String((request.body as any)?.params?.query ?? '').includes('administrators')
			? 'administrators'
			: 'fixture-account';
		body = {
			numberOfPages: 1,
			entries: [
				{
					uid: 'fixture-doc',
					title: principal === 'administrators' ? 'Workspaces' : 'Fixture Account',
					path: '/default-domain/workspaces',
					contextParameters: {
						acls: [
							{
								name: 'local',
								aces: [
									{
										username: principal,
										permission: 'Everything',
										creator: 'fixture-account',
										granted: true,
									},
								],
							},
						],
					},
				},
			],
		};
	} else if (request.url.endsWith('/query/LATEST_CREATED_USERS_OR_GROUPS_PROVIDER'))
		body = {
			entries: [
				{
					type: 'group',
					uid: 'fixture-reviewers',
					properties: { 'group:grouplabel': 'Fixture Reviewers' },
				},
				{
					type: 'user',
					uid: 'fixture-account',
					properties: {
						'user:firstName': 'Fixture',
						'user:lastName': 'Account',
						'user:email': 'fixture-account@example.invalid',
					},
				},
			],
		};
	else if (request.url.endsWith('/user/search'))
		body = {
			entries: [
				{
					id: user.id,
					properties: { firstName: 'Fixture', lastName: 'Account', email: user.email },
					extendedGroups: [],
				},
			],
		};
	else if (request.url.endsWith('/group/search'))
		body = {
			entries: [
				{
					id: 'members',
					groupname: 'members',
					grouplabel: 'Members group',
					memberUsers: [],
					memberGroups: [],
					properties: {},
				},
			],
		};
	else if (request.url.includes('/api/v1/user/'))
		body = {
			id: user.id,
			properties: { firstName: 'Fixture', lastName: 'Account', email: user.email },
			extendedGroups: [],
		};
	else if (request.url.endsWith('/automation/UserGroup.Suggestion'))
		body = [{ id: 'members', label: 'Members group', type: 'GROUP_TYPE' }];
	else if (request.url.includes('/oauth2/')) body = { entries: [] };
	else return null;
	return new HttpResponse({ body });
}

@Component({
	selector: 'nx-account-parity-fixture',
	imports: [
		ProfilePageComponent,
		ThemesPageComponent,
		UserCloudServicesPageComponent,
		UsersAndGroupsComponent,
		AnalyticsComponent,
	],
	template: `<nav class="fixture-views" aria-label="Fixture views">
			<a href="?surface=account-parity&view=profile">Profile</a
			><a href="?surface=account-parity&view=themes">Themes</a
			><a href="?surface=account-parity&view=cloud">Cloud</a
			><a href="?surface=account-parity&view=users">Users</a
			><a href="?surface=account-parity&view=distribution">Distribution</a
			><a href="?surface=account-parity&view=repository">Repository</a
			><a href="?surface=account-parity&view=search">Search</a
			><a href="?surface=account-parity&view=workflow">Workflow</a>
		</nav>
		@switch (view) {
			@case ('themes') {
				<nx-themes-page [context]="context" />
			}
			@case ('cloud') {
				<nx-user-cloud-services-page [context]="context" />
			}
			@case ('users') {
				<nx-users-and-groups />
			}
			@case ('distribution') {
				<nx-analytics section="distribution" />
			}
			@case ('repository') {
				<nx-analytics section="repository" />
			}
			@case ('search') {
				<nx-analytics section="search" />
			}
			@case ('workflow') {
				<nx-analytics section="workflow" />
			}
			@default {
				<nx-profile-page [context]="context" />
			}
		}`,
	styles:
		':host{display:block;min-width:0}.fixture-views{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}',
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountParityFixture {
	readonly view = new URLSearchParams(location.search).get('view') ?? 'profile';
	readonly context = {
		pageId: this.view,
		user: { ...user, displayName: 'Fixture Reader', groups: user.groups.map((group) => group.id) },
		params: {},
		query: {},
		route: '/profile',
		locale: new URLSearchParams(location.search).get('locale') ?? 'en-US',
		noEdit: false,
		document: null,
		features: { retention: false },
	} as PageContext;
}
