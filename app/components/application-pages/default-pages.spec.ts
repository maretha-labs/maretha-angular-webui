import { TestBed } from '@angular/core/testing';
import { ExtensionRegistry } from '@maretha/webui-sdk';
import { provideDefaultPages } from './default-pages';
import { AdministrationPageComponent } from './administration-page.component';
import { ComparisonPageComponent } from './comparison-page.component';
import { DashboardPageComponent } from './dashboard-page.component';
import { ExplorerPageComponent } from './explorer-page.component';
import { PrincipalPageComponent } from './principal-page.component';
import { ProfilePageComponent } from './profile-page.component';
import { ThemesPageComponent } from './themes-page.component';
import { UserAuthorizedAppsPageComponent } from './user-authorized-apps-page.component';
import { UserCloudServicesPageComponent } from './user-cloud-services-page.component';

describe('Default application pages', () => {
	beforeEach(() => TestBed.configureTestingModule({ providers: [provideDefaultPages()] }));
	const resolve = (pageId: string, user: unknown = { id: 'jdoe' }) =>
		TestBed.inject(ExtensionRegistry).resolve('PAGES', {
			pageId,
			route: `/${pageId}`,
			noEdit: false,
			params: {},
			query: {},
			user,
		}).items;
	const expected: [string, unknown][] = [
		['compare', ComparisonPageComponent],
		['profile', ProfilePageComponent],
		['themes', ThemesPageComponent],
		['user-authorized-apps', UserAuthorizedAppsPageComponent],
		['user-cloud-services', UserCloudServicesPageComponent],
		['user', PrincipalPageComponent],
		['group', PrincipalPageComponent],
		['dashboard', DashboardPageComponent],
		['explorer', ExplorerPageComponent],
	];
	for (const [pageId, component] of expected) {
		it(`loads the ${pageId} page for a signed-in user only`, async () => {
			const items = resolve(pageId).filter((item) => item.pairKey === pageId);
			expect(items.map((item) => item.id)).toEqual([`maretha.page.${pageId}`]);
			expect(await items[0].loadComponent!()).toBe(component as never);
			expect(resolve(pageId, null).filter((item) => item.pairKey === pageId)).toEqual([]);
		});
	}
	it('loads the administration page for administrators only', async () => {
		const administration = (user: unknown) =>
			resolve('administration', user).filter((item) => item.pairKey === 'administration');
		const items = administration({ isAdministrator: true });
		expect(items.map((item) => item.id)).toEqual(['maretha.page.administration']);
		expect(await items[0].loadComponent!()).toBe(AdministrationPageComponent);
		expect(administration({ groups: ['members'] })).toEqual([]);
	});
});
