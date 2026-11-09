import fs from 'node:fs';
import path from 'node:path';
const directory = path.resolve('dist/verification/i18n');
const locales = ['en-US', 'es', 'fr', 'ar', 'ro', 'pt-PT', 'it'];
const surfaces = [
	'shell',
	'rail-tooltip',
	'user-menu',
	'quick-search',
	'confirmation',
	'signed-out',
];
const matrix = [
	...locales.flatMap((locale) =>
		['default', 'dark'].map((theme) => ({
			locale,
			theme,
			pseudo: false,
			title: `${locale} ${theme} production catalog surfaces`,
		})),
	),
	...['default', 'dark'].map((theme) => ({
		locale: 'en-US',
		theme,
		pseudo: true,
		title: `pseudo ${theme} complete visible text`,
	})),
];
const errors = [],
	results = [];
const tests = JSON.parse(fs.readFileSync(path.join(directory, 'playwright.json'), 'utf8'));
if (
	tests.stats.expected !== 16 ||
	tests.stats.unexpected ||
	tests.stats.skipped ||
	tests.stats.flaky
)
	errors.push('The exact16-test browser matrix did not pass without skips/retries.');
for (const entry of matrix)
	for (const surface of surfaces) {
		const folder = entry.title.replace(/[^a-z0-9_-]+/gi, '_');
		const file = path.join(directory, 'browser', folder, surface + '.json');
		if (!fs.existsSync(file)) {
			errors.push(`Missing ${folder}/${surface}`);
			continue;
		}
		const result = JSON.parse(fs.readFileSync(file, 'utf8'));
		const url = new URL(result.url);
		if (
			result.surface !== surface ||
			result.pseudo !== entry.pseudo ||
			!result.records.length ||
			result.failures.length
		)
			errors.push(`Invalid scan ${folder}/${surface}`);
		if (
			url.origin !== 'http://127.0.0.1:4311' ||
			url.pathname !== '/' ||
			url.searchParams.get('locale') !== entry.locale ||
			url.searchParams.get('theme') !== entry.theme ||
			(url.searchParams.get('surface') === 'signed-out') !== (surface === 'signed-out')
		)
			errors.push(`Wrong route ${folder}/${surface}`);
		if (entry.pseudo && !result.records.some((x) => /⟦[^⟦⟧]+⟧/u.test(x.text)))
			errors.push(`Pseudo locale is not active at ${folder}/${surface}`);
		results.push({
			locale: entry.locale,
			theme: entry.theme,
			pseudo: entry.pseudo,
			surface,
			visibleRecords: result.records.length,
		});
	}
const report = {
	version: 1,
	passed: !errors.length,
	scope:
		'Actual component fixture using production catalogs and explicit mock repository data. Six settled surfaces, including rail tooltips; active loading, all editor states, installed Nuxeo and native assistive technology are not covered.',
	locales,
	surfaces,
	tests: 16,
	scans: results.length,
	errors,
	results,
};
fs.writeFileSync(
	path.join(directory, 'browser-summary.json'),
	JSON.stringify(report, null, 2) + '\n',
);
console.log(
	JSON.stringify({
		passed: report.passed,
		tests: 16,
		scans: results.length,
		errors,
		report: 'dist/verification/i18n/browser-summary.json',
	}),
);
if (errors.length) process.exitCode = 1;
