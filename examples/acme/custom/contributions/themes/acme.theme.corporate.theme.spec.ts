import { defineWebUiTheme } from '@maretha/webui-sdk';
import { ACME_THEME_CORPORATE_THEME } from './acme.theme.corporate.theme';

describe('ACME_THEME_CORPORATE_THEME', () => {
	it('defines a valid theme', () => {
		expect(defineWebUiTheme(ACME_THEME_CORPORATE_THEME).id).toBe(ACME_THEME_CORPORATE_THEME.id);
	});
});
