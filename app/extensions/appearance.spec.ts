import { SUPPORTED_WEB_UI_LOCALES } from './i18n/webui-locale';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WebUiIcons, WebUiIconComponent } from './webui-icons';
import { WebUiMessages, WebUiMessagePipe } from './webui-messages';
import { NUXEO_ICONS } from './nuxeo-icons.generated';
import { POLYMER_MESSAGES } from './polymer-messages.generated';
import { POLYMER_THEME_TOKENS } from './polymer-theme-tokens.generated';

describe('Public appearance catalogs', () => {
	let icons: WebUiIcons;
	let fixture: ComponentFixture<WebUiIconComponent>;
	beforeEach(() => {
		TestBed.configureTestingModule({ imports: [WebUiIconComponent] });
		icons = TestBed.inject(WebUiIcons);
		icons.register('baseline', NUXEO_ICONS);
		fixture = TestBed.createComponent(WebUiIconComponent);
		fixture.componentRef.setInput('name', 'nuxeo:add');
	});
	it('preserves all baseline icons, geometry and transforms without a Polymer runtime', () => {
		expect(Object.keys(icons.catalog()).length).toBe(76);
		fixture.detectChanges();
		const svg = fixture.nativeElement.querySelector('svg');
		expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
		expect(svg.querySelectorAll('path').length).toBe(2);
		expect(svg.querySelector('path').getAttribute('d')).toBe(
			NUXEO_ICONS['nuxeo:add'].nodes[0].children![0].attributes!['d'],
		);
		expect(svg.querySelector('path').getAttribute('transform')).toBe('translate(2, 2.001)');
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		fixture.componentRef.setInput('label', 'Add document');
		fixture.detectChanges();
		expect(svg.getAttribute('role')).toBe('img');
		expect(svg.getAttribute('aria-label')).toBe('Add document');
	});
	it('supports client overrides and restores the exact original icon', () => {
		const restore = icons.register('client', {
			'nuxeo:add': {
				viewBox: '0 0 16 16',
				nodes: [{ tag: 'circle', attributes: { cx: '8', cy: '8', r: '4' } }],
			},
		});
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelector('circle')).not.toBeNull();
		restore();
		fixture.detectChanges();
		expect(fixture.nativeElement.querySelectorAll('path').length).toBe(2);
	});
	it('rejects executable SVG nodes and remote paint references atomically', () => {
		const before = icons.catalog();
		expect(() =>
			icons.register('unsafe', {
				'client:test': { viewBox: '0 0 24 24', nodes: [{ tag: 'script', text: 'alert(1)' }] },
			}),
		).toThrow();
		expect(() =>
			icons.register('unsafe', {
				'client:test': {
					viewBox: '0 0 24 24',
					nodes: [{ tag: 'path', attributes: { fill: 'url(https://example.com/image.svg)' } }],
				},
			}),
		).toThrow();
		expect(icons.catalog()).toBe(before);
	});
	it('retains scalar theme baselines independently of application branding overrides', () => {
		expect(Object.keys(POLYMER_THEME_TOKENS['default']).length).toBe(105);
		expect(POLYMER_THEME_TOKENS['default']['--nuxeo-primary-color']).toBe('#0066ff');
		expect(POLYMER_THEME_TOKENS['default']['--nuxeo-app-font']).toBe("'Inter', Arial, sans-serif");
		expect(Object.keys(POLYMER_THEME_TOKENS)).toEqual(['default', 'light', 'dark', 'kawaii']);
	});
	it('supports the complete reference keys and text-only positional interpolation', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('baseline', POLYMER_MESSAGES);
		const referenceKeys = Object.keys(POLYMER_MESSAGES['en-US']).sort();
		for (const { key } of SUPPORTED_WEB_UI_LOCALES) {
			expect(Object.keys(POLYMER_MESSAGES[key]).sort()).withContext(key).toEqual(referenceKeys);
			expect(
				Object.values(POLYMER_MESSAGES[key]).every(
					(value) => typeof value === 'string' && value.trim().length > 0,
				),
			)
				.withContext(key)
				.toBeTrue();
		}
		expect(messages.text('favoritesToggleButton.tooltip.add', 'missing')).toBe('Add to Favorites');
		expect(messages.text('notificationsToggleButton.tooltip.notify', 'missing')).toBe('Notify Me');
		expect(messages.text('mimetype.text/html', 'missing')).not.toBe('missing');
		const pipe = TestBed.runInInjectionContext(() => new WebUiMessagePipe());
		expect(pipe.transform('app.createdDocument', '', '<b>Sample</b>')).toBe(
			'Created <b>Sample</b>.',
		);
		messages.locale.set('ar');
		expect(messages.text('lockToggleButton.tooltip.lock', 'missing')).not.toBe('missing');
		expect(pipe.transform('browser.history')).toBe('السجل');
		expect(() =>
			messages.register('unsafe', { 'en-US': JSON.parse('{"__proto__":"value"}') }),
		).toThrow();
	});
	it('uses locale fallback and allows reversible client message overrides', () => {
		const messages = TestBed.inject(WebUiMessages);
		messages.register('baseline', POLYMER_MESSAGES);
		messages.locale.set('ar');
		expect(messages.text('browser.history', 'History')).toBe('السجل');
		const restore = messages.register('client', { ar: { 'browser.history': 'Client history' } });
		expect(messages.text('browser.history', 'History')).toBe('Client history');
		restore();
		expect(messages.text('browser.history', 'History')).toBe('السجل');
		messages.locale.set('ro');
		messages.register('english-only', { 'en-US': { 'client.fallback-only': 'English fallback' } });
		expect(messages.text('client.fallback-only', 'Literal fallback')).toBe('English fallback');
		expect(messages.text('client.missing', 'Fallback')).toBe('Fallback');
	});
});
