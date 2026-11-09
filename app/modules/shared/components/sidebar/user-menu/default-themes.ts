import { defineWebUiTheme, POLYMER_THEME_TOKENS, provideWebUiExtensions } from '@maretha/webui-sdk';

const legacyVariables: Readonly<Record<string, string>> = {
	'--nuxeo-app-font': '--maretha-style-font-family',
	'--nuxeo-primary-color': '--maretha-style-color-primary',
	'--nuxeo-secondary-color': '--maretha-style-color-accent',
	'--nuxeo-text-default': '--maretha-style-color-text',
	'--nuxeo-page-background': '--maretha-style-color-background',
	'--nuxeo-box': '--maretha-style-color-surface',
	'--nuxeo-border': '--maretha-style-color-border',
	'--nuxeo-link-color': '--maretha-style-color-link',
	'--nuxeo-link-hover-color': '--maretha-style-color-link-hover',
	'--nuxeo-sidebar-background': '--maretha-style-color-sidebar-background',
	'--nuxeo-sidebar-menu': '--nuxeo-sidebar-item-color',
	'--nuxeo-sidebar-menu-hover': '--nuxeo-sidebar-item-hover-color',
};
export function provideDefaultThemes() {
	return provideWebUiExtensions({
		id: 'maretha.core.themes',
		contributions: Object.entries(POLYMER_THEME_TOKENS).map(([name, source]) => {
			const normalized = { ...source };
			if (name === 'kawaii')
				normalized['--nuxeo-page-background'] =
					'url(assets/themes/kawaii-background.png) repeat #f8d3e0';
			// Stock headings share the theme text colour; the bundled Bootstrap default is a fixed grey.
			const tokens: Record<string, string> = {
				...normalized,
				'--maretha-style-color-heading': 'var(--nuxeo-text-default)',
			};
			for (const [key, alias] of Object.entries(legacyVariables))
				if (normalized[key]) {
					tokens[alias] = normalized[key];
					tokens[key] = `var(${alias})`;
				}
			// Enabled document tabs need readable labels in every theme. Keep the stock Nuxeo
			// palette; the other palettes' disabled/brand colours are too faint for 13px text.
			if (name === 'light' || name === 'kawaii') tokens['--nuxeo-document-tab-color'] = '#757575';
			if (name !== 'default')
				tokens['--nuxeo-document-tab-hover-color'] = 'var(--nuxeo-text-default)';
			if (name === 'light' || name === 'dark')
				tokens['--nuxeo-document-tab-selected-color'] = 'var(--nuxeo-text-default)';
			if (name === 'dark') tokens['--nuxeo-confirmation-footer-background'] = 'var(--nuxeo-box)';
			if (name === 'kawaii') {
				tokens['--maretha-style-color-background'] = '#f8d3e0';
				tokens['--nuxeo-page-background'] = normalized['--nuxeo-page-background'];
			}
			return defineWebUiTheme({
				id: `maretha.theme.${name}`,
				label: name === 'default' ? 'Nuxeo' : name[0].toUpperCase() + name.slice(1),
				labelKey: name === 'default' ? 'themes.nuxeo' : `themes.${name}`,
				tokens,
				order: ['default', 'dark', 'kawaii', 'light'].indexOf(name) * 10,
			});
		}),
	});
}
