import { TestBed } from '@angular/core/testing';
import { DrawerItemComponent, ExtensionRegistry, POLYMER_SLOTS } from '@maretha/webui-sdk';
import { provideDefaultUiProviders } from 'app/default-ui-providers';
import { RepositorySearchComponent } from 'app/modules/search/components/repository-search/repository-search.component';
import { RepositorySearchDrawerComponent } from 'app/modules/shared/components/sidebar/repository-search-drawer.component';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';
import catalog from './ui-catalog.json';

/** Defaults use the application's providers. */
describe('Default contribution catalog', () => {
	beforeEach(() => {
		TestBed.configureTestingModule({ providers: [provideDefaultUiProviders()] });
	});
	const expectedRows = () =>
		catalog.slots
			.flatMap((slot) => slot.contributions.map((item) => ({ slot: slot.name, ...item })))
			.sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));
	it('matches every canonical registration, default, label, condition marker and exact pair', () => {
		const registry = TestBed.inject(ExtensionRegistry);
		const all = registry.snapshot().contributions;
		const visibilityRules = [...registry.visibilityRuleIds()].sort();
		const rows = all
			.map((item) => ({
				slot: item.slot,
				id: item.id,
				extensionId: item.extensionId,
				order: item.order,
				disabled: item.disabled,
				conditional: !!item.when || !!item.requiredVisibilityRule,
				requiredVisibilityRule: item.requiredVisibilityRule ?? null,
				label: typeof item.inputs?.['label'] === 'string' ? item.inputs['label'] : null,
				pairKey: item.pairKey ?? null,
				pairedTargets: all
					.filter(
						(other) =>
							other.key !== item.key &&
							!!item.pairKey &&
							other.pairKey === item.pairKey &&
							other.id === item.id &&
							other.extensionId === item.extensionId,
					)
					.map((other) => ({ slot: other.slot, id: other.id }))
					.sort((a, b) => a.slot.localeCompare(b.slot)),
			}))
			.sort((a, b) => a.slot.localeCompare(b.slot) || a.id.localeCompare(b.id));
		// The maintenance script requests the same normalized snapshot used by this assertion.
		// We never invoke a contribution's condition or load its component to build the catalog.
		const karma = (window as unknown as { __karma__?: { config?: { args?: string[] } } }).__karma__;
		if (karma?.config?.args?.includes('capture-ui-catalog')) {
			const bytes = new TextEncoder().encode(JSON.stringify({ rows, visibilityRules }));
			console.log(
				'CATALOG_SNAPSHOT_BASE64:' +
					btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')),
			);
		}
		expect(visibilityRules).toEqual(catalog.visibilityRules);
		const expected = expectedRows();
		const registered = new Set(rows.map((row) => `${row.slot}/${row.id}`));
		const catalogued = new Set(expected.map((row) => `${row.slot}/${row.id}`));
		expect([...registered].filter((key) => !catalogued.has(key)))
			.withContext('Registered contribution IDs missing from catalog')
			.toEqual([]);
		expect([...catalogued].filter((key) => !registered.has(key)))
			.withContext('Catalog contribution IDs missing from runtime registration')
			.toEqual([]);
		expect(rows)
			.withContext('Update catalog.json from the real provider snapshot when registrations change.')
			.toEqual(expected);
		expect(catalog.slots.map((slot) => slot.name).sort()).toEqual(
			[...Object.values(POLYMER_SLOTS), 'SHELL_ACTIONS', 'QUICK_SEARCH_ACTIONS'].sort(),
		);
	});
	it('connects the signed-in search pages and paired drawers to the correct hosts', async () => {
		const registry = TestBed.inject(ExtensionRegistry);
		for (const [kind, labelKey, icon] of [
			['trash', 'app.trashSearch', 'nuxeo-navigation:delete'],
			['expired', 'app.expiredSearch', 'nuxeo-navigation:expired'],
			['assets', 'dam.assets.heading', 'nuxeo-navigation:assets'],
		] as const) {
			const context = {
				user: { id: 'reader' },
				noEdit: false,
				pageId: kind,
				route: `/page/${kind}`,
				params: { pageId: kind },
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
			const paired = (slot: string, user: typeof context.user | null) =>
				registry.resolve(slot, { ...context, user }).items.find((item) => item.pairKey === kind);
			const page = paired('PAGES', context.user);
			const drawer = paired('DRAWER_PAGES', context.user);
			const item = paired('DRAWER_ITEMS', context.user);

			expect(await page?.loadComponent?.()).toBe(RepositorySearchComponent);
			expect(page?.inputs).toEqual({ definition: REPOSITORY_SEARCH[kind] });
			expect(await drawer?.loadComponent?.()).toBe(RepositorySearchDrawerComponent);
			expect(drawer?.inputs).toEqual({ definition: REPOSITORY_SEARCH[kind] });
			expect(item?.component).toBe(DrawerItemComponent);
			expect(item?.inputs).toEqual(jasmine.objectContaining({ pageId: kind, labelKey, icon }));
			expect(item?.inputs?.['route']).toBeUndefined();
			for (const slot of ['PAGES', 'DRAWER_ITEMS', 'DRAWER_PAGES']) {
				expect(paired(slot, null)).withContext(`${kind} in ${slot}`).toBeUndefined();
			}
		}
	});
	it('keeps the test-only example out of the production provider set', () => {
		const contributions = TestBed.inject(ExtensionRegistry).snapshot().contributions;
		for (const slot of ['PAGES', 'DRAWER_ITEMS', 'DRAWER_PAGES']) {
			expect(
				contributions
					.filter((item) => item.slot === slot)
					.some(
						(item) =>
							item.pairKey === 'example-documents' ||
							item.inputs?.['pageId'] === 'example-documents',
					),
			)
				.withContext(slot)
				.toBeFalse();
		}
	});
	it('never pairs document variants or unrelated pages that share a view key', () => {
		const rows = expectedRows();
		const history = rows.find(
			(row) => row.slot === 'DOCUMENT_VIEWS_ITEMS' && row.id === 'maretha.document.history',
		);
		expect(history?.pairedTargets).toEqual([
			{ slot: 'DOCUMENT_VIEWS_PAGES', id: 'maretha.document.history' },
		]);
		expect(
			rows.find((row) => row.slot === 'PAGES' && row.id === 'maretha.page.trash')?.pairedTargets,
		).toEqual([]);
	});
});
