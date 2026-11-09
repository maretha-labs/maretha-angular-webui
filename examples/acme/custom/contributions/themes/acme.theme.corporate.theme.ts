import type { WebUiThemeDefinition } from '@maretha/webui-sdk';

/**
 * A theme is a set of `--nuxeo-*` token overrides (the Polymer variable names; the full list is
 * `POLYMER_THEME_TOKENS` in the SDK). Values are scalar CSS declarations or `assets/` references.
 */
export const ACME_THEME_CORPORATE_THEME: WebUiThemeDefinition = {
	id: 'acme.theme.corporate',
	label: 'ACME corporate',
	labelKey: 'acme.theme.corporate',
	order: 100,
	tokens: {
		'--nuxeo-primary-color': '#0b5fff',
		'--nuxeo-secondary-color': '#5b6b85',
		'--nuxeo-link-color': '#0b5fff',
		'--nuxeo-link-hover-color': '#003fbf',
		'--nuxeo-app-header-background': '#101828',
		'--nuxeo-app-header': '#ffffff',
		'--nuxeo-drawer-background': '#f4f6fa',
		'--nuxeo-drawer-text': '#101828',
	},
};
