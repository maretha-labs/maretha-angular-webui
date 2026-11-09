import {
	ANALYTICS_ITEMS_SLOT,
	ANALYTICS_PAGES_SLOT,
	definePairedView,
	provideWebUiExtensions,
} from '@maretha/webui-sdk';
export function provideDefaultAnalytics() {
	return provideWebUiExtensions({
		id: 'maretha.core.analytics',
		contributions: [
			{
				id: 'distribution',
				label: 'Document Distribution',
				key: 'analytics.document.distribution',
			},
			{ id: 'repository', label: 'Repository', key: 'analytics.repository' },
			{ id: 'search', label: 'Search', key: 'analytics.search' },
			{ id: 'workflow', label: 'Workflow', key: 'analytics.workflow' },
		].flatMap((page, order) =>
			definePairedView(
				{ items: ANALYTICS_ITEMS_SLOT, pages: ANALYTICS_PAGES_SLOT },
				{
					id: `maretha.analytics.${page.id}`,
					viewId: page.id,
					label: page.label,
					labelKey: page.key,
					order,
					inputs: { section: page.id },
					when: (context) => context.user?.isAdministrator === true,
					loadComponent: () =>
						import('./components/analytics/analytics-page.component').then(
							(m) => m.AnalyticsPageComponent,
						),
				},
			),
		),
	});
}
