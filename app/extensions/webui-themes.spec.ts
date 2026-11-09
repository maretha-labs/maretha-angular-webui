import { TestBed } from '@angular/core/testing';
import { ExtensionRegistry } from './extension-registry.service';
import { defineWebUiTheme, WebUiThemes } from './webui-themes';

describe('Theme contributions', () => {
	let registry: ExtensionRegistry;
	let themes: WebUiThemes;
	beforeEach(() => {
		TestBed.configureTestingModule({});
		registry = TestBed.inject(ExtensionRegistry);
		themes = TestBed.inject(WebUiThemes);
		localStorage.removeItem('maretha.webui.theme');
	});
	afterEach(() => {
		TestBed.resetTestingModule();
		document.documentElement.style.removeProperty('--test-webui-color');
		localStorage.removeItem('maretha.webui.theme');
	});
	it('applies selected tokens and restores prior values when contributions disappear', () => {
		document.documentElement.style.setProperty('--test-webui-color', 'red');
		const remove = registry.register({
			id: 'themes',
			contributions: [
				defineWebUiTheme({ id: 'light', label: 'Light', tokens: { '--test-webui-color': 'blue' } }),
				defineWebUiTheme({ id: 'dark', label: 'Dark', tokens: { '--test-webui-color': 'black' } }),
			],
		});
		themes.activate();
		TestBed.tick();
		expect(document.documentElement.style.getPropertyValue('--test-webui-color')).toBe('blue');
		themes.select('dark');
		TestBed.tick();
		expect(document.documentElement.style.getPropertyValue('--test-webui-color')).toBe('black');
		expect(localStorage.getItem('maretha.webui.theme')).toBe('dark');
		remove();
		TestBed.tick();
		expect(document.documentElement.style.getPropertyValue('--test-webui-color')).toBe('red');
	});
	it('preserves subsequent external changes on teardown', () => {
		registry.register({
			id: 'themes',
			contributions: [
				defineWebUiTheme({ id: 'light', label: 'Light', tokens: { '--test-webui-color': 'blue' } }),
			],
		});
		themes.activate();
		TestBed.tick();
		document.documentElement.style.setProperty('--test-webui-color', 'orange');
		TestBed.resetTestingModule();
		expect(document.documentElement.style.getPropertyValue('--test-webui-color')).toBe('orange');
	});
	it('rejects executable and resource-loading CSS values', () => {
		expect(() =>
			defineWebUiTheme({
				id: 'bad',
				label: 'Bad',
				tokens: { '--test-webui-color': 'url(https://example.org/tracker)' },
			}),
		).toThrowError();
	});
	it('restores saved theme on activation, exposes context.select and provideWebUiThemeApplication', () => {
		localStorage.setItem('maretha.webui.theme', 'dark');
		registry.register({
			id: 'themes',
			contributions: [
				defineWebUiTheme({ id: 'light', label: 'Light', tokens: { '--test-webui-color': 'blue' } }),
				defineWebUiTheme({ id: 'dark', label: 'Dark', tokens: { '--test-webui-color': 'black' } }),
			],
		});
		themes.activate();
		TestBed.tick();
		expect(themes.selected()?.id).toBe('dark');
		themes.context().select('light');
		TestBed.tick();
		expect(themes.selected()?.id).toBe('light');
	});
});
