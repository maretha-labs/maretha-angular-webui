import { definePage, provideWebUiExtensions } from '@maretha/webui-sdk';
import { hasAdministrationAccess } from 'app/helpers/administration-access';
import { REPOSITORY_SEARCH_DEFINITIONS } from 'app/modules/search/helpers/repository-search-definitions';
import { repositorySearchPages } from 'app/modules/search/helpers/repository-search-providers';
export function provideDefaultPages() {
	return provideWebUiExtensions({
		id: 'maretha.core.pages',
		visibilityRules: [
			{
				id: 'maretha.administration-access',
				evaluate: (context) =>
					!!context &&
					typeof context === 'object' &&
					'user' in context &&
					hasAdministrationAccess(context.user),
			},
		],
		contributions: [
			definePage({
				id: 'maretha.page.compare',
				pageId: 'compare',
				when: (context) => !!context.user,
				loadComponent: () =>
					import('./comparison-page.component').then((m) => m.ComparisonPageComponent),
			}),
			...['profile', 'themes', 'user-authorized-apps', 'user-cloud-services'].map((pageId) =>
				definePage({
					id: `maretha.page.${pageId}`,
					pageId,
					when: (context) => !!context.user,
					loadComponent: () =>
						pageId === 'profile'
							? import('./profile-page.component').then((m) => m.ProfilePageComponent)
							: pageId === 'themes'
								? import('./themes-page.component').then((m) => m.ThemesPageComponent)
								: pageId === 'user-authorized-apps'
									? import('./user-authorized-apps-page.component').then(
											(m) => m.UserAuthorizedAppsPageComponent,
										)
									: import('./user-cloud-services-page.component').then(
											(m) => m.UserCloudServicesPageComponent,
										),
				}),
			),
			...(['user', 'group'] as const).map((kind) =>
				definePage({
					id: `maretha.page.${kind}`,
					pageId: kind,
					when: (c) => !!c.user,
					loadComponent: () =>
						import('./principal-page.component').then((m) => m.PrincipalPageComponent),
				}),
			),
			...repositorySearchPages(REPOSITORY_SEARCH_DEFINITIONS),
			definePage({
				id: 'maretha.page.dashboard',
				pageId: 'dashboard',
				when: (context) => !!context.user,
				loadComponent: () =>
					import('./dashboard-page.component').then((m) => m.DashboardPageComponent),
			}),
			definePage({
				id: 'maretha.page.explorer',
				pageId: 'explorer',
				when: (context) => !!context.user,
				loadComponent: () =>
					import('./explorer-page.component').then((m) => m.ExplorerPageComponent),
			}),
			definePage({
				id: 'maretha.page.administration',
				requiredVisibilityRule: 'maretha.administration-access',
				pageId: 'administration',
				when: (context) => hasAdministrationAccess(context.user),
				loadComponent: () =>
					import('./administration-page.component').then((m) => m.AdministrationPageComponent),
			}),
		],
	});
}
