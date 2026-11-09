import { defineContribution, provideWebUiExtensions, SHELL_ACTIONS_SLOT } from '@maretha/webui-sdk';
export function provideDefaultShellActions() {
	return provideWebUiExtensions({
		id: 'maretha.core.shell',
		contributions: [
			defineContribution(SHELL_ACTIONS_SLOT, {
				id: 'maretha.shell.create',
				order: 20,
				when: (c) =>
					!!c.user && !/^\/(settings|unauthorized|page\/administration)([/?#]|$)/.test(c.route),
				loadComponent: () =>
					import('./global-create.component').then((m) => m.GlobalCreateComponent),
			}),
			defineContribution(SHELL_ACTIONS_SLOT, {
				id: 'maretha.shell.quick-search',
				order: 10,
				when: (c) => !!c.user,
				loadComponent: () => import('./quick-search.component').then((m) => m.QuickSearchComponent),
			}),
		],
	});
}
