import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, UrlSegment } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppRoutingModule, defaultSearchMatcher } from './app-routing.module';
import { TasksPageComponent } from './components/tasks/tasks-page.component';
import { DefaultSearchResultsComponent } from './modules/search/components/default-search-results/default-search-results.component';
import { ExplorerModule } from './modules/explorer/explorer.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SettingsGuardService } from './helpers/settings-guard.service';
import { documentViewsNavigationGuard } from '@maretha/webui-sdk';

@Component({ template: '' })
class RouteDestinationComponent {
	constructor(readonly route: ActivatedRoute) {}
}

describe('Task route loading', () => {
	it('loads the task page on demand for every supported task URL and retains departure guards', async () => {
		TestBed.configureTestingModule({ imports: [AppRoutingModule] });
		const routes = TestBed.inject(Router).config;
		for (const path of ['tasks', 'tasks/:repo/:id', 'tasks/:id']) {
			const route = routes.find((route) => route.path === path)!;
			expect(route.component).withContext(path).toBeUndefined();
			expect(route.canActivate).withContext(path).toContain(documentViewsNavigationGuard);
			expect(await route.loadComponent!())
				.withContext(path)
				.toBe(TasksPageComponent);
		}
	});
});

describe('Default search route', () => {
	const segments = (...paths: string[]) => paths.map((path) => new UrlSegment(path, {}));
	it('matches only /search/default with an optional saved search id', () => {
		expect(defaultSearchMatcher(segments('search'))).toBeNull();
		expect(defaultSearchMatcher(segments('search', 'default', 'saved', 'extra'))).toBeNull();
		expect(defaultSearchMatcher(segments('browse', 'default'))).toBeNull();
		expect(defaultSearchMatcher(segments('search', 'other'))).toBeNull();
		const plain = segments('search', 'default');
		expect(defaultSearchMatcher(plain)).toEqual({ consumed: plain, posParams: {} });
		const saved = segments('search', 'default', 'saved-1');
		expect(defaultSearchMatcher(saved)).toEqual({
			consumed: saved,
			posParams: { savedSearchId: saved[2] },
		});
	});
	it('lazily loads the results page and the browse and settings feature modules with their guards', async () => {
		TestBed.configureTestingModule({ imports: [AppRoutingModule] });
		const routes = TestBed.inject(Router).config;
		const search = routes.find((route) => route.matcher === defaultSearchMatcher)!;
		expect(search.canActivate).toContain(documentViewsNavigationGuard);
		expect(await search.loadComponent!()).toBe(DefaultSearchResultsComponent);
		const browse = routes.find((route) => route.path === 'browse')!;
		expect(await browse.loadChildren!()).toBe(ExplorerModule);
		const settings = routes.find((route) => route.path === 'settings')!;
		expect(settings.canActivate).toEqual([documentViewsNavigationGuard, SettingsGuardService]);
		expect(await settings.loadChildren!()).toBe(SettingsModule);
	});
});

describe('Legacy route aliases', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [AppRoutingModule, RouteDestinationComponent] });
		const router = TestBed.inject(Router);
		// Exercise real route matching and redirects with lightweight target views.
		router.resetConfig(
			router.config.map((route) =>
				route.redirectTo
					? route
					: {
							...(route.matcher ? { matcher: route.matcher } : { path: route.path }),
							component: RouteDestinationComponent,
						},
			),
		);
	});
	it('accepts the optional legacy task repository segment without changing the task id', async () => {
		const harness = await RouterTestingHarness.create();
		const destination = await harness.navigateByUrl(
			'/tasks/other/task-123',
			RouteDestinationComponent,
		);
		expect(destination.route.snapshot.paramMap.get('repo')).toBe('other');
		expect(destination.route.snapshot.paramMap.get('id')).toBe('task-123');
	});
	it('preserves the legacy diff left/right order and navigation context', async () => {
		const harness = await RouterTestingHarness.create();
		const destination = await harness.navigateByUrl(
			'/diff/older/newer?repository=other#details',
			RouteDestinationComponent,
		);
		expect(destination.route.snapshot.paramMap.get('pageId')).toBe('compare');
		expect(destination.route.snapshot.queryParams).toEqual({
			repository: 'other',
			left: 'older',
			right: 'newer',
			ids: 'newer,older',
		});
		expect(destination.route.snapshot.fragment).toBe('details');
	});
	for (const entity of ['user', 'group']) {
		it(`preserves the short source ${entity} link`, async () => {
			const harness = await RouterTestingHarness.create();
			const destination = await harness.navigateByUrl(
				`/${entity}/team%2Fmember%40example.com?repository=other#details`,
				RouteDestinationComponent,
			);
			expect(destination.route.snapshot.queryParams).toEqual({
				repository: 'other',
				admin: 'users',
				entity,
				id: 'team/member@example.com',
			});
			expect(destination.route.snapshot.fragment).toBe('details');
		});
		it(`opens a source ${entity} management deep link with the decoded identifier`, async () => {
			const harness = await RouterTestingHarness.create();
			const destination = await harness.navigateByUrl(
				`/admin/user-group-management/${entity}/team%2Fmember%40example.com?repository=other#details`,
				RouteDestinationComponent,
			);
			expect(destination.route.snapshot.queryParams).toEqual({
				repository: 'other',
				admin: 'users',
				entity,
				id: 'team/member@example.com',
			});
			expect(destination.route.snapshot.fragment).toBe('details');
		});
	}
	it('redirects fragment-less source links without inventing an empty fragment', async () => {
		const harness = await RouterTestingHarness.create();
		const router = TestBed.inject(Router);
		for (const url of [
			'/admin/user-group-management/user/jdoe',
			'/user/jdoe',
			'/admin/audit',
			'/diff/older/newer',
		]) {
			const destination = await harness.navigateByUrl(url, RouteDestinationComponent);
			expect(destination.route.snapshot.fragment).withContext(url).toBeNull();
			expect(router.url).withContext(url).not.toContain('#');
		}
		expect(router.url).toBe('/page/compare?left=older&right=newer&ids=newer,older');
	});
	it('opens the source users and groups administration landing route', async () => {
		const harness = await RouterTestingHarness.create();
		const destination = await harness.navigateByUrl(
			'/admin/user-group-management',
			RouteDestinationComponent,
		);
		expect(destination.route.snapshot.queryParams).toEqual({ admin: 'users' });
	});
	it('maps source administration sections and directory list types while preserving URL context', async () => {
		const harness = await RouterTestingHarness.create();
		for (const [path, admin] of [
			['analytics', 'analytics'],
			['vocabulary-management', 'directories'],
			['audit', 'audit'],
			['cloud-services', 'cloud'],
			['nxql', 'nxql'],
		]) {
			const destination = await harness.navigateByUrl(
				`/admin/${path}?repository=other#details`,
				RouteDestinationComponent,
			);
			expect(destination.route.snapshot.queryParams).toEqual({ repository: 'other', admin });
			expect(destination.route.snapshot.fragment).toBe('details');
		}
		const groups = await harness.navigateByUrl(
			'/admin/user-group-management/group',
			RouteDestinationComponent,
		);
		expect(groups.route.snapshot.queryParams).toEqual({ admin: 'users', entity: 'group' });
	});
});
