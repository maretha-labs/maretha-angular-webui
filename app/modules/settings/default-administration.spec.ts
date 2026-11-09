import { TestBed } from '@angular/core/testing';
import { ExtensionRegistry, resolveDocumentViews } from '@maretha/webui-sdk';
import { provideDefaultAdministration } from './default-administration';
describe('Administration contributions', () => {
	it('applies identity and addon eligibility to paired menus and pages', () => {
		TestBed.configureTestingModule({ providers: [provideDefaultAdministration()] });
		const registry = TestBed.inject(ExtensionRegistry);
		const context = {
			document: null,
			noEdit: false,
			user: { id: 'admin', displayName: 'admin', isAdministrator: true, groups: [] },
			features: { retention: false },
		};
		const slots = { items: 'ADMINISTRATION_MENU', pages: 'ADMINISTRATION_PAGES' };
		expect(resolveDocumentViews(registry, context, slots).views.map((view) => view.viewId)).toEqual(
			['analytics', 'users', 'directories', 'audit', 'cloud', 'nxql', 'metadata-policy'],
		);
		expect(
			resolveDocumentViews(
				registry,
				{ ...context, user: { ...context.user, isAdministrator: false } },
				slots,
			).views,
		).toEqual([]);
		expect(
			resolveDocumentViews(
				registry,
				{
					...context,
					user: {
						id: 'power',
						displayName: 'power',
						isAdministrator: false,
						groups: ['powerusers'],
					},
				},
				slots,
			).views.map((view) => view.viewId),
		).toEqual(['users', 'directories', 'nxql']);
		expect(
			resolveDocumentViews(
				registry,
				{ ...context, features: { retention: true } },
				slots,
			).views.map((view) => view.viewId),
		).toContain('retention');
		registry.register({
			id: 'client.admin',
			overrides: [{ slot: slots.items, id: 'maretha.admin.cloud', disabled: true }],
		});
		expect(
			resolveDocumentViews(registry, context, slots).views.map((view) => view.viewId),
		).not.toContain('cloud');
	});
	it('lazy-loads a component for every administration page', async () => {
		TestBed.configureTestingModule({ providers: [provideDefaultAdministration()] });
		const pages = TestBed.inject(ExtensionRegistry)
			.snapshot()
			.contributions.filter((item) => item.slot === 'ADMINISTRATION_PAGES');
		expect(pages.length).toBeGreaterThan(0);
		const components = await Promise.all(pages.map((page) => page.loadComponent!()));
		expect(components.every((component) => typeof component === 'function')).toBeTrue();
	});
});
