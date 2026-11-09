import {
	DestroyRef,
	effect,
	inject,
	Injectable,
	InjectionToken,
	Injector,
	signal,
} from '@angular/core';
import { TranslateService, TranslationObject } from '@ngx-translate/core';
import { WebUiMessages, WebUiMessageCatalog } from '@maretha/webui-sdk';
import { WebUiMessageValues } from '@maretha/webui-sdk';
import { normalizeWebUiLocale, WebUiLocale } from '@maretha/webui-sdk';
import { loadWebUiCatalog } from './webui-message-catalog';

export const WEB_UI_CATALOG_LOADER = new InjectionToken<typeof loadWebUiCatalog>(
	'WebUI catalog loader',
	{
		providedIn: 'root',
		factory: () => loadWebUiCatalog,
	},
);

/**
 * Adapts both existing translation APIs to the same locale, catalogs and ICU formatter. The UI
 * reads no catalog from the server: the labels a deployment adds (Nuxeo Studio document types,
 * fields, vocabularies) are customer catalogs under custom/i18n (agent-guides/04-recipes/i18n.md).
 */
@Injectable({ providedIn: 'root' })
export class WebUiTranslationBridge {
	private readonly locale = inject(WebUiLocale);
	private readonly messages = inject(WebUiMessages);
	private readonly translate = inject(TranslateService);
	private readonly injector = inject(Injector);
	private readonly destroy = inject(DestroyRef);
	private readonly loadCatalog = inject(WEB_UI_CATALOG_LOADER);
	private started = false;
	private changing = false;
	private generation = 0;
	private catalog: WebUiMessageCatalog = {};
	private restore: (() => void) | undefined;
	readonly loading = signal(false);
	readonly failedLocale = signal<string | null>(null);

	initialize(): void {
		if (this.started) return;
		this.started = true;
		this.locale.initialize();
		const subscription = this.translate.onLangChange.subscribe(({ lang }) => {
			if (this.changing) return;
			const normalized = normalizeWebUiLocale(lang);
			if (normalized) this.locale.setLocale(normalized);
			else void this.activate(this.locale.locale());
		});
		this.destroy.onDestroy(() => {
			subscription.unsubscribe();
			this.generation++;
			this.restore?.();
		});
		effect(
			() => {
				void this.activate(this.locale.locale());
			},
			{ injector: this.injector },
		);
	}
	private async activate(locale: string): Promise<void> {
		const generation = ++this.generation;
		this.loading.set(true);
		this.failedLocale.set(null);
		try {
			const english = await this.loadCatalog('en-US');
			let selected: Readonly<Record<string, string>>;
			try {
				selected = locale === 'en-US' ? english : await this.loadCatalog(locale);
			} catch {
				selected = english;
				if (generation === this.generation) this.failedLocale.set(locale);
			}
			if (generation !== this.generation) return;
			this.catalog = { ...this.catalog, 'en-US': english, [locale]: selected };
			// Replace the bootstrap core layer in-place; late catalog loads cannot override clients.
			this.restore = this.messages.register('maretha.polymer', this.catalog, -100);
			for (const language of new Set(['en-US', locale])) {
				const entries = this.catalog[language];
				const compiled = Object.fromEntries(
					Object.keys(entries).map((key) => [
						key,
						(values?: WebUiMessageValues) => this.messages.format(key, values ?? {}, key),
					]),
				);
				// FormatJS's compiler leaves already-compiled functions intact. The public
				// setTranslation type describes source catalogs, unlike its runtime store.
				this.translate.setTranslation(language, compiled as unknown as TranslationObject);
			}
			this.changing = true;
			try {
				this.translate.setFallbackLang('en-US').subscribe();
				this.translate.use(locale).subscribe();
			} finally {
				this.changing = false;
			}
		} catch {
			if (generation === this.generation) this.failedLocale.set(locale);
		} finally {
			if (generation === this.generation) this.loading.set(false);
		}
	}
}
