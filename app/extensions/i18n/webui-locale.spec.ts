import { DOCUMENT, formatDate } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { normalizeWebUiLocale, SUPPORTED_WEB_UI_LOCALES, WebUiLocale } from './webui-locale';

describe('WebUI locale preferences', () => {
	function create(saved: string | null, languages = ['en-US'], unavailable = false) {
		const storage = {
			getItem: () => {
				if (unavailable) throw new Error('denied');
				return saved;
			},
			setItem: jasmine.createSpy('setItem'),
		};
		TestBed.configureTestingModule({
			providers: [
				{
					provide: DOCUMENT,
					useValue: {
						defaultView: {
							localStorage: storage,
							navigator: { languages, language: languages[0] },
						},
					},
				},
			],
		});
		return { locale: TestBed.inject(WebUiLocale), storage };
	}
	it('negotiates browser families after rejecting an invalid persisted preference', () => {
		const { locale, storage } = create('../outside', ['de-DE', 'pt-BR', 'fr']);
		locale.initialize();
		expect(locale.locale()).toBe('pt-PT');
		expect(storage.setItem).toHaveBeenCalledWith('lang', 'pt-PT');
	});
	it('prefers canonical persisted language and initializes only once', () => {
		const { locale } = create('AR-EG', ['fr']);
		locale.initialize();
		expect(locale.locale()).toBe('ar');
		expect(locale.direction()).toBe('rtl');
		locale.setLocale('it-IT');
		locale.initialize();
		expect(locale.locale()).toBe('it');
		expect(locale.direction()).toBe('ltr');
	});
	it('works when storage is blocked and falls back to English for unsupported browsers', () => {
		const { locale, storage } = create(null, ['de'], true);
		storage.setItem.and.throwError('denied');
		expect(() => locale.initialize()).not.toThrow();
		expect(locale.locale()).toBe('en-US');
	});
	it('validates writable signal writes without mutating the active preference', () => {
		const { locale } = create(null);
		locale.setLocale('fr-CA');
		expect(() => locale.locale.set('de')).toThrowError('Unsupported WebUI locale.');
		expect(() => locale.locale.update(() => 'ar/evil')).toThrow();
		expect(locale.locale()).toBe('fr');
	});
	it('normalizes all supported families and rejects malformed locale values', () => {
		for (const item of SUPPORTED_WEB_UI_LOCALES)
			expect(normalizeWebUiLocale(item.key)).toBe(item.key);
		for (const value of [null, '', ' fr', 'es_MX', 'ar--EG', 'abc-12', 'de-DE'])
			expect(normalizeWebUiLocale(value)).toBeUndefined();
	});
	it('registers Angular formatting data for every supported locale', () => {
		create(null);
		for (const { key } of SUPPORTED_WEB_UI_LOCALES)
			expect(() => formatDate('2026-01-12', 'longDate', key, 'UTC')).not.toThrow();
		expect(formatDate('2026-01-12', 'longDate', 'fr', 'UTC')).toContain('janvier');
	});
});
