/** Records the actual current layers and authored sources without claiming linguistic acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadProductionCatalogues, validateCatalogues, LOCALES } from './catalogue.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (file) =>
	createHash('sha256')
		.update(fs.readFileSync(path.join(root, file)))
		.digest('hex');
const { layers, catalogues, errors } = loadProductionCatalogues(root);
const validation = [...errors, ...validateCatalogues(catalogues)];
const inputs = [
	'app/extensions/polymer-assets.provenance.json',
	'scripts/import-polymer-assets.py',
	'scripts/i18n/complete-catalogs.mjs',
	...fs
		.readdirSync(path.join(root, 'scripts/i18n'))
		.filter(
			(file) =>
				file.endsWith('.json') &&
				!file.endsWith('.generated.json') &&
				!file.endsWith('.english-draft.json') &&
				!file.startsWith('source-'),
		)
		.map((file) => `scripts/i18n/${file}`),
].sort();
const records = Object.fromEntries(
	LOCALES.map((locale) => {
		const legacy = layers[locale].legacy,
			sdk = layers[locale].sdk;
		return [
			locale,
			{
				legacy: {
					file: `assets/i18n/${locale}.json`,
					sha256: sha256(`assets/i18n/${locale}.json`),
					keys: Object.keys(legacy).length,
				},
				sdkKeys: Object.keys(sdk).length,
				mergedKeys: Object.keys(catalogues[locale]).length,
				missingLegacyKeys: Object.keys(layers['en-US'].legacy).filter(
					(key) => !Object.hasOwn(legacy, key),
				),
				missingSdkKeys: Object.keys(layers['en-US'].sdk).filter((key) => !Object.hasOwn(sdk, key)),
				englishEqualLegacyKeys:
					locale === 'en-US'
						? []
						: Object.keys(legacy).filter((key) => legacy[key] === layers['en-US'].legacy[key]),
			},
		];
	}),
);
const result = {
	version: 1,
	independentLinguisticReview: false,
	reviewStatus:
		'Assistant-authored and assistant-reviewed supplements; fluent human review is still required. Exact key and ICU contract checks do not prove translation quality or complete source extraction.',
	composition: [
		'Pinned Nuxeo Elements and Web UI catalogs, with source paths/hashes/commits and fixed positional-quote normalization recorded in polymer-assets.provenance.json.',
		'Authored SDK additions and gap translations are retained in polymer-overrides.json. No missing locale is populated with the English catalog.',
		'Existing legacy translations are preserved; missing messages use authored keyed/text supplements or one unambiguous compatible English-source match. Initial reuse evidence remains in legacy-provenance.json.',
		'Country and continent display names use the recorded CLDR/ICU provider; source mappings and versions remain in display-name-provenance.json.',
		'Runtime composition overlays flattened legacy messages on SDK messages. Extension layers from custom/ have higher priority, and document or server text is not inferred to be a translation key.',
	],
	sdk: {
		file: 'app/extensions/polymer-messages.generated.ts',
		sha256: sha256('app/extensions/polymer-messages.generated.ts'),
	},
	locales: records,
	validation: { structurallyComplete: validation.length === 0, errors: validation },
	inputs: Object.fromEntries(inputs.map((file) => [file, { sha256: sha256(file) }])),
};
fs.writeFileSync(
	path.join(root, 'scripts/i18n/translation-provenance.generated.json'),
	JSON.stringify(result, null, 2) + '\n',
);
console.log(
	JSON.stringify({
		locales: LOCALES.length,
		legacyEnglishKeys: Object.keys(layers['en-US'].legacy).length,
		sdkEnglishKeys: Object.keys(layers['en-US'].sdk).length,
		validationErrors: validation.length,
	}),
);
