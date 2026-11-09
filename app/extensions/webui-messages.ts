import {
	computed,
	DestroyRef,
	inject,
	Injectable,
	makeEnvironmentProviders,
	provideEnvironmentInitializer,
	signal,
	Pipe,
	PipeTransform,
} from '@angular/core';
import { WebUiLocale } from './i18n/webui-locale';
import { formatWebUiMessage, WebUiMessageValues } from './i18n/message-format';

export type WebUiMessageCatalog = Readonly<Record<string, Readonly<Record<string, string>>>>;

@Injectable({ providedIn: 'root' })
export class WebUiMessages {
	readonly locale = inject(WebUiLocale).locale;
	private readonly layers = signal<
		ReadonlyMap<string, { token: symbol; catalog: WebUiMessageCatalog; priority: number }>
	>(new Map());
	private readonly catalog = computed(() => {
		const result: Record<string, Record<string, string>> = Object.create(null);
		for (const layer of [...this.layers().values()].sort((a, b) => a.priority - b.priority)) {
			for (const [locale, values] of Object.entries(layer.catalog))
				result[locale] = { ...result[locale], ...values };
		}
		return result;
	});
	text(key: string | undefined, fallback: string, locale = this.locale()): string {
		if (!key) return fallback;
		const catalog = this.catalog();
		return (
			catalog[locale]?.[key] ??
			catalog[locale.split('-')[0]]?.[key] ??
			catalog['en-US']?.[key] ??
			fallback
		);
	}
	/** Complete ICU messages; malformed translations fall back to the English message. */
	format(
		key: string,
		values: WebUiMessageValues = {},
		fallback = key,
		locale = this.locale(),
	): string {
		const candidates = [this.text(key, fallback, locale), this.catalog()['en-US']?.[key], fallback];
		for (const message of candidates) {
			if (message === undefined) continue;
			try {
				return formatWebUiMessage(message, values, locale);
			} catch {
				/* Try the next complete message. */
			}
		}
		return fallback;
	}
	register(owner: string, catalog: WebUiMessageCatalog, priority = 0): () => void {
		if (!Number.isFinite(priority)) throw new Error('Invalid message priority.');
		const token = Symbol(owner);
		const copy: Record<string, Readonly<Record<string, string>>> = Object.create(null);
		for (const [locale, entries] of Object.entries(catalog)) {
			if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale))
				throw new Error('Invalid message locale.');
			for (const [key, value] of Object.entries(entries)) {
				if (
					!key ||
					[...key].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
					['__proto__', 'prototype', 'constructor'].includes(key) ||
					typeof value !== 'string'
				)
					throw new Error('Invalid message entry.');
			}
			copy[locale] = Object.freeze({ ...entries });
		}
		this.layers.update((layers) =>
			new Map(layers).set(owner, { token, catalog: Object.freeze(copy), priority }),
		);
		return () => {
			if (this.layers().get(owner)?.token !== token) return;
			this.layers.update((layers) => {
				const next = new Map(layers);
				next.delete(owner);
				return next;
			});
		};
	}
}

export function provideWebUiMessages(owner: string, catalog: WebUiMessageCatalog) {
	return makeEnvironmentProviders([
		provideEnvironmentInitializer(() => {
			inject(DestroyRef).onDestroy(inject(WebUiMessages).register(owner, catalog));
		}),
	]);
}

/** Text-only Polymer-compatible positional interpolation; never interprets HTML. */
@Pipe({ name: 'webuiMessage', standalone: true, pure: false })
export class WebUiMessagePipe implements PipeTransform {
	private readonly messages = inject(WebUiMessages);
	transform(key: string, fallback = key, ...values: readonly unknown[]): string {
		if (
			values.length === 1 &&
			values[0] &&
			typeof values[0] === 'object' &&
			!Array.isArray(values[0]) &&
			!(values[0] instanceof Date)
		)
			return this.messages.format(key, values[0] as WebUiMessageValues, fallback);
		const message = this.messages.text(key, fallback);
		// Keep legacy positional strings (including incomplete substitutions) compatible.
		if (!/\{[^{}]+,\s*(?:plural|select|selectordinal|number|date|time)\b/.test(message))
			return message.replace(/\{(\d+)\}/g, (match, index: string) =>
				Number(index) < values.length ? String(values[Number(index)] ?? '') : match,
			);
		return this.messages.format(
			key,
			Object.fromEntries(
				values.map((value, index) => [String(index), value]),
			) as WebUiMessageValues,
			fallback,
		);
	}
}
