import {
	ADMINISTRATION_MENU_SLOT,
	ADMINISTRATION_PAGES_SLOT,
	definePairedView,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
import { REPOSITORY_SEARCH } from 'app/modules/search/helpers/repository-search-definitions';
import { isPowerUser } from 'app/helpers/administration-access';
const pages = [
	{ id: 'analytics', labelKey: 'analytics.heading', label: 'Analytics' },
	{ id: 'users', labelKey: 'admin.usersAndGroups.heading', label: 'Users & Groups' },
	{ id: 'directories', labelKey: 'vocabularyManagement.heading', label: 'Vocabularies' },
	{ id: 'audit', labelKey: 'audit.heading', label: 'Audit' },
	{ id: 'cloud', labelKey: 'cloudServices.heading', label: 'Cloud Services' },
	{ id: 'nxql', labelKey: 'app.nxqlSearch', label: 'NXQL Search' },
	{ id: 'retention', labelKey: 'app.settingsShared.retentionRules', label: 'Retention Rules' },
	{
		id: 'metadata-policy',
		labelKey: 'app.settingsShared.metadataLayouts',
		label: 'Metadata layouts',
	},
] as const;
export function provideDefaultAdministration() {
	return provideWebUiExtensions({
		id: 'maretha.core.administration',
		contributions: pages.flatMap((page, index) =>
			definePairedView(
				{ items: ADMINISTRATION_MENU_SLOT, pages: ADMINISTRATION_PAGES_SLOT },
				{
					id: `maretha.admin.${page.id}`,
					viewId: page.id,
					label: page.label,
					labelKey: page.labelKey,
					order: (index + 1) * 10,
					inputs: page.id === 'nxql' ? { definition: REPOSITORY_SEARCH.nxql } : { kind: page.id },
					when: (context) =>
						(context.user?.isAdministrator === true ||
							(isPowerUser(context.user) && ['users', 'directories', 'nxql'].includes(page.id))) &&
						(page.id !== 'retention' || context.features.retention),
					loadComponent: () =>
						page.id === 'metadata-policy'
							? import('./components/metadata-policy/metadata-policy.component').then(
									(m) => m.MetadataPolicyComponent,
								)
							: page.id === 'nxql'
								? import('../search/components/repository-search/repository-search.component').then(
										(m) => m.RepositorySearchComponent,
									)
								: import('./administration-page.component').then(
										(m) => m.AdministrationPageComponent,
									),
				},
			),
		),
	});
}
