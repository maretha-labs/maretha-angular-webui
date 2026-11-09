import { inject, NgModule } from '@angular/core';
import {
	RedirectFunction,
	Router,
	RouterModule,
	Routes,
	UrlMatchResult,
	UrlSegment,
} from '@angular/router';
import { ApplicationPageComponent } from './components/application-pages/application-page.component';
import { NotFoundComponent } from './components/not-found/not-found.component';
import { UnauthorizedComponent } from './components/unauthorized/unauthorized.component';
import { SettingsGuardService } from './helpers/settings-guard.service';
import { documentViewsNavigationGuard } from '@maretha/webui-sdk';

const loadTasksPage = () =>
	import('./components/tasks/tasks-page.component').then((module) => module.TasksPageComponent);

/** The default search results page, with or without a saved search id. */
export function defaultSearchMatcher(segments: UrlSegment[]): UrlMatchResult | null {
	if (
		segments.length < 2 ||
		segments.length > 3 ||
		segments[0].path !== 'search' ||
		segments[1].path !== 'default'
	)
		return null;
	return { consumed: segments, posParams: segments[2] ? { savedSearchId: segments[2] } : {} };
}

const routes: Routes = [
	{
		path: '',
		pathMatch: 'full',
		redirectTo: 'dashboard',
	},
	{
		path: 'dashboard',
		component: ApplicationPageComponent,
		data: { pageId: 'dashboard' },
	},
	...['profile', 'themes', 'user-authorized-apps', 'user-cloud-services'].map((pageId) => ({
		path: pageId,
		component: ApplicationPageComponent,
		data: { pageId },
	})),
	{
		// `/search/default` and `/search/default/:savedSearchId` are one route: choosing a saved
		// search changes a parameter of the mounted results page instead of recreating it.
		matcher: defaultSearchMatcher,
		loadComponent: () =>
			import('./modules/search/components/default-search-results/default-search-results.component').then(
				(x) => x.DefaultSearchResultsComponent,
			),
	},
	{ path: 'search', pathMatch: 'full', redirectTo: 'search/default' },
	{
		path: 'browse',
		loadChildren: () => import('./modules/explorer/explorer.module').then((x) => x.ExplorerModule),
	},
	{
		path: 'settings',
		canActivate: [SettingsGuardService],
		loadChildren: () => import('./modules/settings/settings.module').then((x) => x.SettingsModule),
	},
	...['user', 'group'].map((entity) => ({
		path: `admin/user-group-management/${entity}/:id`,
		pathMatch: 'full' as const,
		redirectTo: ({ params, queryParams, fragment }: Parameters<RedirectFunction>[0]) =>
			inject(Router).createUrlTree(['/settings'], {
				queryParams: { ...queryParams, admin: 'users', entity, id: params['id'] },
				fragment: fragment ?? undefined,
			}),
	})),
	{
		path: 'admin/user-group-management',
		pathMatch: 'full',
		redirectTo: ({ queryParams, fragment }) =>
			inject(Router).createUrlTree(['/settings'], {
				queryParams: { ...queryParams, admin: 'users' },
				fragment: fragment ?? undefined,
			}),
	},
	...['user', 'group'].map((entity) => ({
		path: `admin/user-group-management/${entity}`,
		pathMatch: 'full' as const,
		redirectTo: ({ queryParams, fragment }: Parameters<RedirectFunction>[0]) =>
			inject(Router).createUrlTree(['/settings'], {
				queryParams: { ...queryParams, admin: 'users', entity },
				fragment: fragment ?? undefined,
			}),
	})),
	...Object.entries({
		analytics: 'analytics',
		'vocabulary-management': 'directories',
		audit: 'audit',
		'cloud-services': 'cloud',
		nxql: 'nxql',
	}).map(([source, admin]) => ({
		path: `admin/${source}`,
		pathMatch: 'full' as const,
		redirectTo: ({ queryParams, fragment }: Parameters<RedirectFunction>[0]) =>
			inject(Router).createUrlTree(['/settings'], {
				queryParams: { ...queryParams, admin },
				fragment: fragment ?? undefined,
			}),
	})),
	{ path: 'admin', pathMatch: 'full', redirectTo: 'settings' },
	...['user', 'group'].map((entity) => ({
		path: `${entity}/:id`,
		pathMatch: 'full' as const,
		redirectTo: ({ params, queryParams, fragment }: Parameters<RedirectFunction>[0]) =>
			inject(Router).createUrlTree(['/settings'], {
				queryParams: { ...queryParams, admin: 'users', entity, id: params['id'] },
				fragment: fragment ?? undefined,
			}),
	})),
	{ path: 'tasks', loadComponent: loadTasksPage },
	// The source accepts a repository segment but task identifiers are globally resolved.
	{ path: 'tasks/:repo/:id', loadComponent: loadTasksPage },
	{ path: 'tasks/:id', loadComponent: loadTasksPage },
	{
		path: 'diff/:left/:right',
		pathMatch: 'full',
		redirectTo: ({ params, queryParams, fragment }) =>
			inject(Router).createUrlTree(['/page/compare'], {
				queryParams: {
					...queryParams,
					left: params['left'],
					right: params['right'],
					ids: [params['right'], params['left']].join(','),
				},
				fragment: fragment ?? undefined,
			}),
	},
	{ path: 'page/:pageId', component: ApplicationPageComponent },
	{
		path: 'unauthorized',
		component: UnauthorizedComponent,
		data: { state: 'unauthorized' },
	},
	{
		path: '**',
		component: NotFoundComponent,
	},
];

@NgModule({
	imports: [
		RouterModule.forRoot(
			routes.map((route) =>
				route.redirectTo
					? route
					: {
							...route,
							runGuardsAndResolvers: 'always' as const,
							canActivate: [documentViewsNavigationGuard, ...(route.canActivate ?? [])],
						},
			),
			{ scrollPositionRestoration: 'enabled' },
		),
	],
	exports: [RouterModule],
})
export class AppRoutingModule {}
