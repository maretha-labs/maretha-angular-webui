import { POLYMER_MESSAGES } from '@maretha/webui-sdk';
import { normalizeWebUiLocale, SupportedWebUiLocale } from '@maretha/webui-sdk';

const imports = {
	'en-US': () => import('../../assets/i18n/en-US.json'),
	es: () => import('../../assets/i18n/es.json'),
	fr: () => import('../../assets/i18n/fr.json'),
	ar: () => import('../../assets/i18n/ar.json'),
	ro: () => import('../../assets/i18n/ro.json'),
	'pt-PT': () => import('../../assets/i18n/pt-PT.json'),
	it: () => import('../../assets/i18n/it.json'),
};
const catalogs = new Map<SupportedWebUiLocale, Promise<Readonly<Record<string, string>>>>();

/** Legacy app keys override imported Polymer keys; customer layers are applied separately. */
export function mergeWebUiCatalog(
	imported: Readonly<Record<string, string>>,
	legacy: unknown,
): Readonly<Record<string, string>> {
	const result: Record<string, string> = Object.assign(Object.create(null), imported);
	const visit = (value: unknown, prefix: string) => {
		if (!value || typeof value !== 'object' || Array.isArray(value))
			throw new Error('Invalid WebUI message catalog.');
		for (const [key, entry] of Object.entries(value)) {
			if (!key || ['__proto__', 'prototype', 'constructor'].includes(key))
				throw new Error('Invalid WebUI message key.');
			const name = prefix ? `${prefix}.${key}` : key;
			if (typeof entry === 'string') result[name] = entry;
			else visit(entry, name);
		}
	};
	visit(legacy, '');
	return Object.freeze(result);
}

export function loadWebUiCatalog(locale: string): Promise<Readonly<Record<string, string>>> {
	const normalized = normalizeWebUiLocale(locale);
	if (!normalized) return Promise.reject(new Error('Unsupported WebUI locale.'));
	let pending = catalogs.get(normalized);
	if (!pending) {
		pending = imports[normalized]()
			.then((module) => mergeWebUiCatalog(POLYMER_MESSAGES[normalized] ?? {}, module.default))
			.catch((error: unknown) => {
				catalogs.delete(normalized);
				throw error;
			});
		catalogs.set(normalized, pending);
	}
	return pending;
}
