import { TestBed } from '@angular/core/testing';
import { TranslateCompiler, TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslateFormatJsCompiler } from 'ngx-translate-formatjs-compiler';
import { WebUiLocale } from '../extensions/i18n/webui-locale';
import { WebUiMessages } from '../extensions/webui-messages';
import { WEB_UI_CATALOG_LOADER, WebUiTranslationBridge } from './webui-translation-bridge.service';

describe('Shared WebUI translation bridge', () => {
	let saved: string | null;
	let locale: WebUiLocale;
	let translate: TranslateService;
	let bridge: WebUiTranslationBridge;
	let messages: WebUiMessages;
	let load: jasmine.Spy;
	const english = {
		hello: 'Hello {name}',
		fallback: 'English only',
		count: '{n, plural, one {# file} other {# files}}',
	};
	beforeEach(() => {
		saved = localStorage.getItem('lang');
		localStorage.setItem('lang', 'fr');
		load = jasmine
			.createSpy('load')
			.and.callFake(async (lang: string) =>
				lang === 'en-US' ? english : { hello: 'Bonjour {name}' },
			);
		TestBed.configureTestingModule({
			imports: [
				TranslateModule.forRoot({
					compiler: { provide: TranslateCompiler, useClass: TranslateFormatJsCompiler },
				}),
			],
			providers: [{ provide: WEB_UI_CATALOG_LOADER, useValue: load }],
		});
		locale = TestBed.inject(WebUiLocale);
		translate = TestBed.inject(TranslateService);
		messages = TestBed.inject(WebUiMessages);
		bridge = TestBed.inject(WebUiTranslationBridge);
	});
	afterEach(() => {
		if (saved === null) localStorage.removeItem('lang');
		else localStorage.setItem('lang', saved);
	});
	async function settle() {
		TestBed.tick();
		for (let i = 0; i < 8; i++) await Promise.resolve();
		TestBed.tick();
	}
	it('reads no catalog from the server; the bundled catalog stands below client layers', async () => {
		const fetched = spyOn(window, 'fetch').and.callThrough();
		bridge.initialize();
		await settle();
		expect(fetched).not.toHaveBeenCalled();
		expect(messages.text('hello', '', 'en-US')).toBe('Hello {name}');
		const restore = messages.register('client', { 'en-US': { hello: 'Client hello' } });
		expect(messages.text('hello', '', 'en-US')).toBe('Client hello');
		restore();
	});
	it('initializes both APIs, fixed English fallback and shared ICU formatting', async () => {
		bridge.initialize();
		await settle();
		expect(locale.locale()).toBe('fr');
		expect(translate.getCurrentLang()).toBe('fr');
		expect(translate.getFallbackLang()).toBe('en-US');
		expect(translate.instant('hello', { name: 'Ada' })).toBe('Bonjour Ada');
		expect(translate.instant('fallback')).toBe('English only');
		expect(messages.format('hello', { name: 'Ada' })).toBe('Bonjour Ada');
		expect(translate.instant('count', { n: 2 })).toBe('2 files');
		bridge.initialize();
		expect(bridge.loading()).toBeFalse();
	});
	it('does not overwrite customer catalogs even when core loading finishes later', async () => {
		messages.register('client', { fr: { hello: 'Client {name}' } });
		bridge.initialize();
		await settle();
		expect(translate.instant('hello', { name: 'Ada' })).toBe('Client Ada');
	});
	it('ignores stale locale loading after the user changes language', async () => {
		let resolveFrench!: (value: Record<string, string>) => void;
		load.and.callFake((lang: string) =>
			lang === 'en-US'
				? Promise.resolve(english)
				: lang === 'fr'
					? new Promise((resolve) => {
							resolveFrench = resolve;
						})
					: Promise.resolve({ hello: 'Hola {name}' }),
		);
		bridge.initialize();
		await settle();
		locale.setLocale('es-MX');
		await settle();
		resolveFrench({ hello: 'Stale' });
		await settle();
		expect(translate.getCurrentLang()).toBe('es');
		expect(messages.format('hello', { name: 'Ada' })).toBe('Hola Ada');
	});
	it('synchronizes legacy language switches to the canonical shared locale', async () => {
		bridge.initialize();
		await settle();
		translate.use('it-IT').subscribe();
		await settle();
		expect(locale.locale()).toBe('it');
		expect(translate.getCurrentLang()).toBe('it');
		translate.use('unsupported').subscribe();
		await settle();
		expect(locale.locale()).toBe('it');
		expect(translate.getCurrentLang()).toBe('it');
	});
	it('retains usable English when a selected catalog fails and reports the failure', async () => {
		load.and.callFake((lang: string) =>
			lang === 'en-US' ? Promise.resolve(english) : Promise.reject(new Error('unavailable')),
		);
		bridge.initialize();
		await settle();
		expect(bridge.failedLocale()).toBe('fr');
		expect(translate.instant('hello', { name: 'Ada' })).toBe('Hello Ada');
		expect(bridge.loading()).toBeFalse();
	});
	it('does not install an in-flight catalog after the application injector is destroyed', async () => {
		let complete!: (value: Record<string, string>) => void;
		load.and.returnValue(
			new Promise((resolve) => {
				complete = resolve;
			}),
		);
		bridge.initialize();
		await settle();
		TestBed.resetTestingModule();
		complete(english);
		for (let i = 0; i < 8; i++) await Promise.resolve();
		expect(messages.text('hello', 'untouched')).toBe('untouched');
	});
});
