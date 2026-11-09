import fs from 'node:fs';
import path from 'node:path';
import { loadProductionCatalogues, validateCatalogues, LOCALES } from './catalogue.mjs';
import { collectInventory } from './source-inventory.mjs';
import { reviewInventory, combineSourceExceptions } from './source-policy.mjs';
import { collectMessageReferences, missingMessageReferences } from './source-references.mjs';

const root = process.cwd(),
	out = path.join(root, 'dist/verification/i18n');
fs.mkdirSync(out, { recursive: true });
const loaded = loadProductionCatalogues(root);
const sdkCatalogues = Object.fromEntries(
	LOCALES.map((locale) => [locale, loaded.layers[locale].sdk]),
);
const catalogueErrors = [
	...loaded.errors,
	...validateCatalogues(loaded.catalogues),
	...validateCatalogues(sdkCatalogues).map((error) => `SDK: ${error}`),
];
const inventory = collectInventory(root);
const references = collectMessageReferences(root);
const missingReferences = missingMessageReferences(references, loaded.catalogues['en-US']);
const missingSdkReferences = missingMessageReferences(
	references.filter((reference) => reference.file.startsWith('app/extensions/')),
	sdkCatalogues['en-US'],
);
const reviewDirectory = path.join(root, 'scripts/i18n');
const reviews = combineSourceExceptions(
	Object.fromEntries(
		(fs.existsSync(reviewDirectory) ? fs.readdirSync(reviewDirectory) : [])
			.filter((name) => /^source-exceptions(?:-[a-z-]+)?\.json$/.test(name))
			.map((name) => [name, JSON.parse(fs.readFileSync(path.join(reviewDirectory, name), 'utf8'))]),
	),
);
const source = reviewInventory(inventory.findings, reviews.exceptions);
source.errors.push(...reviews.errors);

const report = {
	version: 1,
	scope:
		'Built-in runtime catalogue and source review; no linguistic or installed-browser acceptance implied.',
	locales: LOCALES,
	catalogueErrors,
	missingReferences,
	missingSdkReferences,
	sourceErrors: source.errors,
	unreviewedSource: source.unreviewed,
	passed:
		catalogueErrors.length === 0 &&
		missingReferences.length === 0 &&
		missingSdkReferences.length === 0 &&
		source.errors.length === 0 &&
		source.unreviewed.length === 0,
};
fs.writeFileSync(path.join(out, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
	JSON.stringify({
		passed: report.passed,
		catalogueErrors: catalogueErrors.length,
		missingReferences: missingReferences.length,
		missingSdkReferences: missingSdkReferences.length,
		sourceErrors: source.errors.length,
		unreviewedSource: source.unreviewed.length,
		report: 'dist/verification/i18n/verification.json',
	}),
);
if (!report.passed) process.exitCode = 1;
