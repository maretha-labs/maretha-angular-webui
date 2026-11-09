/** Apply authored supplements and unambiguous English-source reuse; never fill gaps with English. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	flattenCatalogue,
	loadProductionCatalogues,
	LOCALES,
	messageContract,
} from './catalogue.mjs';

// Keep argument names case-sensitive even when matching otherwise equivalent labels.
const normalized = (value) => {
	const text = value
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[.:…]+$/, '');
	return value.includes('{') ? text : text.toLocaleLowerCase('en-US');
};
const compatible = (source, translation, locale) =>
	JSON.stringify(messageContract(source, 'en-US')) ===
	JSON.stringify(messageContract(translation, locale));
const nested = (catalog) => {
	const result = {};
	for (const [key, value] of Object.entries(catalog)) {
		const parts = key.split('.');
		let parent = result;
		for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
		parent[parts.at(-1)] = value;
	}
	return result;
};
const addChoice = (choices, source, translation) => {
	if (!translation) return;
	const key = normalized(source);
	if (!choices.has(key)) choices.set(key, new Set());
	choices.get(key).add(translation);
};
const uniqueChoice = (choices, source) => {
	const values = choices.get(normalized(source));
	return values?.size === 1 ? [...values][0] : undefined;
};

export function completeCatalogues(root, drafts = []) {
	const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
	const loaded = loadProductionCatalogues(root);
	if (loaded.errors.length) throw new Error(loaded.errors.join('\n'));
	const english = { ...loaded.layers['en-US'].legacy };
	const retiredPath = 'scripts/i18n/retired-fragment-keys.json';
	const retired = new Set(existsSync(resolve(root, retiredPath)) ? read(retiredPath).keys : []);
	for (const key of Object.keys(english))
		if (retired.has(key)) throw new Error(`Retired key remains in English catalog: ${key}`);
	for (const filename of drafts) {
		for (const [key, value] of Object.entries(flattenCatalogue(read(filename)))) {
			if (retired.has(key)) throw new Error(`English draft reintroduces retired key: ${key}`);
			if (Object.hasOwn(english, key) && english[key] !== value)
				throw new Error(`English draft conflicts with existing text: ${key}`);
			english[key] = value;
		}
	}
	const supplements = read('scripts/i18n/legacy-supplements.json');
	const mergedEnglish = { ...loaded.layers['en-US'].sdk, ...english };
	const provenance = {},
		gaps = {},
		catalogs = { 'en-US': english };
	for (const locale of LOCALES) {
		if (locale === 'en-US') continue;
		const catalog = { ...loaded.layers[locale].legacy };
		const keyedPath = `scripts/i18n/${locale}-ui-supplements.json`;
		const keyed = existsSync(resolve(root, keyedPath)) ? read(keyedPath).entries : {};
		for (const [key, entry] of Object.entries(keyed)) {
			// A reviewed migration can retire a key without retaining it in the runtime catalogue.
			if (!Object.hasOwn(english, key)) continue;
			if (english[key] !== entry.source || !compatible(entry.source, entry.translation, locale))
				throw new Error(`Stale or incompatible keyed supplement: ${locale}:${key}`);
			if (Object.hasOwn(catalog, key) && catalog[key] !== entry.translation)
				throw new Error(`Keyed supplement conflicts with existing translation: ${locale}:${key}`);
			catalog[key] = entry.translation;
		}
		const authoredByText = new Map(),
			byText = new Map();
		for (const [source, values] of Object.entries(supplements.entries))
			addChoice(authoredByText, source, values[supplements.locales.indexOf(locale)]);
		for (const [key, source] of Object.entries(mergedEnglish)) {
			const translated = loaded.catalogues[locale][key];
			if (translated && translated !== source) addChoice(byText, source, translated);
		}
		provenance[locale] = {};
		for (const [key, source] of Object.entries(english)) {
			if (Object.hasOwn(catalog, key)) continue;
			const authored = uniqueChoice(authoredByText, source);
			const reuse = uniqueChoice(byText, source);
			if (authored && compatible(source, authored, locale)) {
				catalog[key] = authored;
				provenance[locale][key] = 'assistant-authored supplement; native-speaker review pending';
			} else if (reuse && compatible(source, reuse, locale)) {
				catalog[key] = reuse;
				provenance[locale][key] = 'unambiguous translation for the same normalized English source';
			}
		}
		gaps[locale] = Object.fromEntries(
			Object.entries(english).filter(([key]) => !Object.hasOwn(catalog, key)),
		);
		catalogs[locale] = catalog;
	}
	// Validate every locale before writing any catalog. A stale late-locale supplement must
	// not leave earlier catalogs partly updated or overwrite existing customer translations.
	const write = (name, value) =>
		writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + '\n');
	for (const locale of LOCALES) write(`assets/i18n/${locale}.json`, nested(catalogs[locale]));
	mkdirSync(resolve(root, 'dist/verification/i18n'), { recursive: true });
	write('dist/verification/i18n/catalog-supplementation.json', {
		version: 1,
		independentLinguisticReview: false,
		provenance,
		gaps,
	});
	return {
		legacyEnglishKeys: Object.keys(english).length,
		gaps: Object.fromEntries(
			Object.entries(gaps).map(([locale, values]) => [locale, Object.keys(values).length]),
		),
	};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const root = fileURLToPath(new URL('../../', import.meta.url));
	console.log(JSON.stringify(completeCatalogues(root, process.argv.slice(2))));
}
