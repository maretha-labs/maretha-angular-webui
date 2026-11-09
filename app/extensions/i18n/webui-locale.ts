import { DOCUMENT, registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import localeEn from '@angular/common/locales/en';
import localeEs from '@angular/common/locales/es';
import localeFr from '@angular/common/locales/fr';
import localeIt from '@angular/common/locales/it';
import localePt from '@angular/common/locales/pt-PT';
import localeRo from '@angular/common/locales/ro';
import { computed, inject, Injectable, signal } from '@angular/core';

export const SUPPORTED_WEB_UI_LOCALES = [
	{ key: 'en-US', label: 'English', direction: 'ltr' },
	{ key: 'es', label: 'Español', direction: 'ltr' },
	{ key: 'fr', label: 'Français', direction: 'ltr' },
	{ key: 'ar', label: 'العربية', direction: 'rtl' },
	{ key: 'ro', label: 'Română', direction: 'ltr' },
	{ key: 'pt-PT', label: 'Português', direction: 'ltr' },
	{ key: 'it', label: 'Italiano', direction: 'ltr' },
] as const;
export type SupportedWebUiLocale = (typeof SUPPORTED_WEB_UI_LOCALES)[number]['key'];

/** Match supported language families without accepting malformed locale identifiers. */
export function normalizeWebUiLocale(value: unknown): SupportedWebUiLocale | undefined {
	if (typeof value !== 'string' || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value))
		return undefined;
	try {
		const language = new Intl.Locale(value).language;
		return SUPPORTED_WEB_UI_LOCALES.find((locale) => locale.key.split('-')[0] === language)?.key;
	} catch {
		return undefined;
	}
}

@Injectable({ providedIn: 'root' })
export class WebUiLocale {
	private readonly document = inject(DOCUMENT);
	private initialized = false;
	readonly locale = signal<string>('en-US');
	readonly direction = computed<'ltr' | 'rtl'>(() => (this.locale() === 'ar' ? 'rtl' : 'ltr'));

	constructor() {
		for (const [locale, data] of [
			['en-US', localeEn],
			['es', localeEs],
			['fr', localeFr],
			['ar', localeAr],
			['ro', localeRo],
			['pt-PT', localePt],
			['it', localeIt],
		] as const)
			registerLocaleData(data, locale);
		// Keep the existing writable SDK signal API while validating every write.
		const write = this.locale.set;
		this.locale.set = (value: string) => {
			const locale = normalizeWebUiLocale(value);
			if (!locale) throw new Error('Unsupported WebUI locale.');
			write(locale);
			if (this.initialized)
				try {
					this.document.defaultView?.localStorage.setItem('lang', locale);
				} catch {
					/* Storage can be unavailable. */
				}
		};
		this.locale.update = (update) => this.locale.set(update(this.locale()));
	}
	/** Called by the application bridge; standalone SDK consumers retain the English default. */
	initialize(): void {
		if (this.initialized) return;
		this.initialized = true;
		this.locale.set(this.initialLocale());
	}
	setLocale(value: string): void {
		this.locale.set(value);
	}
	private initialLocale(): SupportedWebUiLocale {
		const view = this.document.defaultView;
		try {
			const saved = normalizeWebUiLocale(view?.localStorage.getItem('lang'));
			if (saved) return saved;
		} catch {
			/* Fall through to browser preferences when storage is unavailable. */
		}
		for (const language of view?.navigator.languages ?? []) {
			const locale = normalizeWebUiLocale(language);
			if (locale) return locale;
		}
		return normalizeWebUiLocale(view?.navigator.language) ?? 'en-US';
	}
}
