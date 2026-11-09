import { TestBed } from '@angular/core/testing';
import { ExtensionRegistry } from '@maretha/webui-sdk';
import { provideDefaultUiProviders } from 'app/default-ui-providers';
import { defineSearch, REPOSITORY_SEARCH } from './repository-search-definitions';
import { provideRepositorySearches } from './repository-search-providers';

describe('Compiled repository search registration', () => {
	const search = defineSearch({
		id: 'team-documents',
		provider: 'default_search',
		label: 'Team documents',
		labelKey: 'team.documents',
		drawer: { order: 120, icon: 'nuxeo-navigation:search' },
		request: { pageSize: 40, text: { parameter: 'ecm_fulltext' } },
		form: { submission: 'explicit' },
		facets: [],
		defaultMode: 'list',
		views: { list: {} },
	});

	const context = {
		noEdit: false,
		pageId: search.id,
		route: `/page/${search.id}`,
		params: { pageId: search.id },
		query: {},
		opened: true,
		open: jasmine.createSpy('open'),
		close: jasmine.createSpy('close'),
		navigate: jasmine.createSpy('navigate'),
		recentDocuments: [],
		collections: [],
		clipboard: [],
		tasks: {},
	};

	it('adds a paired drawer and lazy page alongside the unchanged production providers', async () => {
		TestBed.configureTestingModule({
			providers: [
				provideDefaultUiProviders(),
				provideRepositorySearches('team.searches', [search]),
			],
		});
		const registry = TestBed.inject(ExtensionRegistry);
		const contributions = registry.snapshot().contributions;
		const page = contributions.find((item) => item.id === 'team.searches.page.team-documents');
		const drawer = contributions.find(
			(item) => item.slot === 'DRAWER_PAGES' && item.id === 'team.searches.drawer.team-documents',
		);
		expect(page?.inputs?.['definition']).toBe(search);
		expect(drawer?.inputs?.['definition']).toBe(search);
		expect(typeof (await page?.loadComponent?.())).toBe('function');
		expect(typeof (await drawer?.loadComponent?.())).toBe('function');
		for (const slot of ['PAGES', 'DRAWER_ITEMS', 'DRAWER_PAGES']) {
			expect(
				registry
					.resolve(slot, { ...context, user: { id: 'reader' } })
					.items.some((item) => item.pairKey === search.id),
			).toBeTrue();
			expect(
				registry
					.resolve(slot, { ...context, user: null })
					.items.some((item) => item.pairKey === search.id),
			).toBeFalse();
		}
		expect(
			contributions.find((item) => item.id === 'maretha.page.assets')?.inputs?.['definition'],
		).toBe(REPOSITORY_SEARCH.assets);
	});

	it('honors administrator-only access for the page and both drawer contributions', () => {
		TestBed.configureTestingModule({
			providers: [
				provideDefaultUiProviders(),
				provideRepositorySearches('team.searches', [{ ...search, access: 'administrator' }]),
			],
		});
		const registry = TestBed.inject(ExtensionRegistry);
		for (const slot of ['PAGES', 'DRAWER_ITEMS', 'DRAWER_PAGES']) {
			for (const user of [null, { id: 'reader' }, { id: 'reader', isAdministrator: false }])
				expect(
					registry
						.resolve(slot, { ...context, user })
						.items.some((item) => item.pairKey === search.id),
				).toBeFalse();
			expect(
				registry
					.resolve(slot, { ...context, user: { id: 'admin', isAdministrator: true } })
					.items.some((item) => item.pairKey === search.id),
			).toBeTrue();
		}
	});

	it('rejects a search ID shared by separate extension registrations', () => {
		TestBed.configureTestingModule({
			providers: [
				provideRepositorySearches('team.one', [search]),
				provideDefaultUiProviders(),
				provideRepositorySearches('team.two', [{ ...search, provider: 'another_provider' }]),
			],
		});
		expect(() => TestBed.inject(ExtensionRegistry)).toThrowError(
			/Search team-documents conflicts with another registered page/,
		);
	});

	it('rejects a collision with a non-search application page registered later', () => {
		TestBed.configureTestingModule({
			providers: [
				provideRepositorySearches('team.searches', [{ ...search, id: 'dashboard' }]),
				provideDefaultUiProviders(),
			],
		});
		expect(() => TestBed.inject(ExtensionRegistry)).toThrowError(
			/Search dashboard conflicts with another registered page/,
		);
	});

	it('rejects a duplicate search identity or an unpaired extension', () => {
		expect(() =>
			provideRepositorySearches('team.searches', [REPOSITORY_SEARCH.assets]),
		).toThrowError(/already provided/);
		expect(() => provideRepositorySearches('team.searches', [search, search])).toThrowError(
			/duplicate search ID/,
		);
		expect(() =>
			provideRepositorySearches('team.searches', [{ ...search, drawer: undefined }]),
		).toThrowError(/drawer placement/);
	});
});
