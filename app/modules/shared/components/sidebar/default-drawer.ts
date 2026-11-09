import { CORE_PRESENTATION_ICONS } from 'app/helpers/core-presentation-icons';
import { makeEnvironmentProviders } from '@angular/core';
import { REPOSITORY_SEARCH_DEFINITIONS } from 'app/modules/search/helpers/repository-search-definitions';
import { repositorySearchDrawer } from 'app/modules/search/helpers/repository-search-providers';
import {
	defineContribution,
	DRAWER_ITEMS_SLOT,
	DRAWER_PAGES_SLOT,
	DrawerItemComponent,
	provideWebUiExtensions,
	provideWebUiIcons,
} from '@maretha/webui-sdk';
import { NAVIGATION_ICONS } from './navigation-icons.generated';
const pages = [
	{ id: 'tree', label: 'Browse', icon: 'browse', order: 10, labelKey: 'app.browse' },
	{
		id: 'recents',
		label: 'Recently Viewed',
		icon: 'recent',
		order: 20,
		labelKey: 'app.recentlyViewed',
	},
	{ id: 'search', label: 'Search', icon: 'search', order: 30, labelKey: 'app.search' },
	{ id: 'tasks', label: 'Tasks', icon: 'tasks', order: 60, labelKey: 'app.tasks' },
	{ id: 'favorites', label: 'Favorites', icon: 'favorites', order: 70, labelKey: 'app.favorites' },
	{
		id: 'collections',
		label: 'Collections',
		icon: 'collections',
		order: 80,
		labelKey: 'app.collections',
	},
	{
		id: 'personal-workspace',
		label: 'Personal Space',
		icon: 'user-space',
		order: 90,
		labelKey: 'app.personalSpace',
	},
	{ id: 'clipboard', label: 'Clipboard', icon: 'clipboard', order: 100, labelKey: 'app.clipboard' },
];
export function provideDefaultDrawer() {
	return makeEnvironmentProviders([
		provideWebUiIcons('maretha.core.navigation-icons', NAVIGATION_ICONS),
		provideWebUiIcons('maretha.core.presentation-icons', CORE_PRESENTATION_ICONS),
		provideWebUiExtensions({
			id: 'maretha.core.drawer',
			contributions: [
				...repositorySearchDrawer(REPOSITORY_SEARCH_DEFINITIONS),
				...pages.flatMap((page) => [
					defineContribution(DRAWER_ITEMS_SLOT, {
						id: `maretha.drawer.${page.id}`,
						pairKey: page.id,
						order: page.order,
						component: DrawerItemComponent,
						inputs: {
							pageId: page.id,
							label: page.label,
							labelKey: page.labelKey,
							icon: `nuxeo-navigation:${page.icon}`,
						},
						when: (context) => !!context.user,
					}),
					defineContribution(DRAWER_PAGES_SLOT, {
						id: `maretha.drawer.${page.id}`,
						pairKey: page.id,
						when: (context) => !!context.user,
						loadComponent: () =>
							page.id === 'personal-workspace'
								? import('./personal-workspace-drawer.component').then(
										(m) => m.PersonalWorkspaceDrawerComponent,
									)
								: page.id === 'collections'
									? import('./collections-drawer.component').then(
											(m) => m.CollectionsDrawerComponent,
										)
									: page.id === 'favorites'
										? import('./favorites-drawer.component').then((m) => m.FavoritesDrawerComponent)
										: page.id === 'clipboard'
											? import('./clipboard-drawer.component').then(
													(m) => m.ClipboardDrawerComponent,
												)
											: import('./default-drawer-page.component').then(
													(m) => m.DefaultDrawerPageComponent,
												),
					}),
				]),
			],
		}),
	]);
}
