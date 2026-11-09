import { TestBed } from '@angular/core/testing';
import { ExtensionRegistry } from '@maretha/webui-sdk';
import { provideDefaultDrawer } from './default-drawer';
import { ClipboardDrawerComponent } from './clipboard-drawer.component';
import { CollectionsDrawerComponent } from './collections-drawer.component';
import { DefaultDrawerPageComponent } from './default-drawer-page.component';
import { FavoritesDrawerComponent } from './favorites-drawer.component';
import { PersonalWorkspaceDrawerComponent } from './personal-workspace-drawer.component';

const PAGE_IDS = new Set([
	'tree',
	'recents',
	'search',
	'tasks',
	'favorites',
	'collections',
	'personal-workspace',
	'clipboard',
]);

describe('Default drawer contributions', () => {
	beforeEach(() => TestBed.configureTestingModule({ providers: [provideDefaultDrawer()] }));

	it('lazily resolves each rail page to its own drawer component and the rest to the default page', async () => {
		const contributions = TestBed.inject(ExtensionRegistry)
			.snapshot()
			.contributions.filter((item) => item.slot === 'DRAWER_PAGES');
		const page = (id: string) =>
			contributions.find((item) => item.id === `maretha.drawer.${id}`)!.loadComponent!();
		expect(await page('personal-workspace')).toBe(PersonalWorkspaceDrawerComponent);
		expect(await page('collections')).toBe(CollectionsDrawerComponent);
		expect(await page('favorites')).toBe(FavoritesDrawerComponent);
		expect(await page('clipboard')).toBe(ClipboardDrawerComponent);
		expect(await page('tree')).toBe(DefaultDrawerPageComponent);
		expect(await page('recents')).toBe(DefaultDrawerPageComponent);
		expect(await page('tasks')).toBe(DefaultDrawerPageComponent);
	});
	it('shows every rail item and page only to a signed-in user', () => {
		const contributions = TestBed.inject(ExtensionRegistry)
			.snapshot()
			.contributions.filter((item) => PAGE_IDS.has(item.pairKey ?? ''));
		expect(contributions.length).toBe(16);
		const anonymous = {
			user: null,
			noEdit: false,
			opened: true,
			open: () => undefined,
			close: () => undefined,
			navigate: () => undefined,
			recentDocuments: [],
			collections: [],
			clipboard: [],
			tasks: {},
		};
		const reader = { ...anonymous, user: { id: 'reader' } };
		for (const item of contributions) {
			expect(item.when!(anonymous)).withContext(item.id).toBeFalse();
			expect(item.when!(reader)).withContext(item.id).toBeTrue();
		}
	});
});
