import { inject, makeEnvironmentProviders, provideAppInitializer } from '@angular/core';
import {
	defineContribution,
	definePage,
	DRAWER_ITEMS_SLOT,
	DRAWER_PAGES_SLOT,
	DrawerItemComponent,
	ExtensionRegistry,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
import {
	type CompiledSearchDefinition,
	REPOSITORY_SEARCH,
	repositorySearchNavigation,
} from './repository-search-definitions';

/** Shared by the stock page provider and compiled search extensions. */
export function repositorySearchPages(
	definitions: readonly CompiledSearchDefinition[],
	prefix = 'maretha',
) {
	return repositorySearchNavigation(definitions).map(({ id, target }) =>
		definePage({
			id: `${prefix}.page.${id}`,
			pageId: id,
			inputs: { definition: target },
			when: (context) =>
				!!context.user &&
				(target.access !== 'administrator' || context.user.isAdministrator === true),
			loadComponent: () =>
				import('../components/repository-search/repository-search.component').then(
					(m) => m.RepositorySearchComponent,
				),
		}),
	);
}

/** Shared by the stock drawer provider and compiled search extensions. */
export function repositorySearchDrawer(
	definitions: readonly CompiledSearchDefinition[],
	prefix = 'maretha',
) {
	return repositorySearchNavigation(definitions).flatMap(
		({ id, target, order, label, labelKey, icon }) => [
			defineContribution(DRAWER_ITEMS_SLOT, {
				id: `${prefix}.drawer.${id}`,
				pairKey: id,
				order,
				component: DrawerItemComponent,
				inputs: { pageId: id, label, labelKey, icon },
				when: (context) =>
					!!context.user &&
					(target.access !== 'administrator' || context.user.isAdministrator === true),
			}),
			defineContribution(DRAWER_PAGES_SLOT, {
				id: `${prefix}.drawer.${id}`,
				pairKey: id,
				inputs: { definition: target },
				when: (context) =>
					!!context.user &&
					(target.access !== 'administrator' || context.user.isAdministrator === true),
				loadComponent: () =>
					import('app/modules/shared/components/sidebar/repository-search-drawer.component').then(
						(m) => m.RepositorySearchDrawerComponent,
					),
			}),
		],
	);
}

/**
 * Add compiled searches to an application assembly alongside provideDefaultUiProviders().
 * The stock providers use the same contribution builders. Definitions remain trusted,
 * compiled application code; this is not a runtime search installation API.
 */
export function provideRepositorySearches(
	extensionId: string,
	definitions: readonly CompiledSearchDefinition[],
) {
	for (const definition of definitions) {
		if (Object.hasOwn(REPOSITORY_SEARCH, definition.id))
			throw new Error(`Search ${definition.id} is already provided by the application`);
		if (!definition.drawer)
			throw new Error(`Search ${definition.id} must declare a drawer placement`);
	}
	return makeEnvironmentProviders([
		provideWebUiExtensions({
			id: extensionId,
			contributions: [
				...repositorySearchPages(definitions, extensionId),
				...repositorySearchDrawer(definitions, extensionId),
			],
		}),
		// Extension environment initializers finish before app initialization, so this sees
		// pages from the whole assembly regardless of provider ordering.
		provideAppInitializer(() => {
			const pages = inject(ExtensionRegistry)
				.snapshot()
				.contributions.filter((item) => item.slot === 'PAGES');
			for (const definition of definitions) {
				if (pages.filter((page) => page.pairKey === definition.id).length > 1)
					throw new Error(`Search ${definition.id} conflicts with another registered page`);
			}
		}),
	]);
}
