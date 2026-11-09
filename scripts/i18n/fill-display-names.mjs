/** Fill only built-in geographic labels from the host's ICU/CLDR data. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const locales = ['es', 'fr', 'ar', 'ro', 'pt-PT', 'it'];
const read = (name) => JSON.parse(readFileSync(resolve(root, name), 'utf8'));
const write = (name, value) =>
	writeFileSync(resolve(root, name), JSON.stringify(value, null, 2) + '\n');
const english = read('assets/i18n/en-US.json');
const names = new Intl.DisplayNames('en-US', { type: 'region' });
const codes = new Map();
for (let first = 65; first <= 90; first++) {
	for (let second = 65; second <= 90; second++) {
		const code = String.fromCharCode(first, second);
		const label = names.of(code);
		if (label !== code && !codes.has(label)) {
			codes.set(label, code);
			codes.set(label.replaceAll(' & ', ' and '), code);
		}
	}
}
const aliases = {
	'Aland Islands': 'AX',
	'Antarctica (the territory South of 60 deg S)': 'AQ',
	'Bouvet Island (Bouvetoya)': 'BV',
	'British Indian Ocean Territory (Chagos Archipelago)': 'IO',
	'Brunei Darussalam': 'BN',
	'Cape Verde': 'CV',
	'Cocos (Keeling) Islands': 'CC',
	'Congo Democratic Republic': 'CD',
	'Congo Republic': 'CG',
	"Cote D'Ivoire": 'CI',
	'Czech Republic': 'CZ',
	'Falkland Islands (Malvinas)': 'FK',
	Guadaloupe: 'GP',
	Guinea_Bissau: 'GW',
	'Heard and McDonald Islands': 'HM',
	'Holy See (Vatican City State)': 'VA',
	'Hong Kong': 'HK',
	'Kyrgyz Republic': 'KG',
	"Lao People's Democratic Republic": 'LA',
	'Libyan Arab Jamahiriya': 'LY',
	Macao: 'MO',
	Macedonia: 'MK',
	Micronesia: 'FM',
	Moldova: 'MD',
	Myanmar: 'MM',
	'Netherlands Antilles': 'AN',
	'Palestinian Territory': 'PS',
	'Pitcairn Island': 'PN',
	Reunion: 'RE',
	'Russian Federation': 'RU',
	'Sao Tome and Principe': 'ST',
	'Slovakia (Slovak Republic)': 'SK',
	'South Georgia and the South Sandwich Islands': 'GS',
	'St. Kitts and Nevis': 'KN',
	'St. Pierre and Miquelon': 'PM',
	'St. Vincent and the Grenadines': 'VC',
	'Svalbard & Jan Mayen Islands': 'SJ',
	Swaziland: 'SZ',
	'Syrian Arab Republic': 'SY',
	'Tokelau (Tokelau Islands)': 'TK',
	'Turks and Caicos Islands': 'TC',
	Turkey: 'TR',
	'US Virgin Islands': 'VI',
	'United Kingdom of Great Britain & N. Ireland': 'GB',
	'United States Minor Outlying Islands': 'UM',
	'United States of America': 'US',
	'Viet Nam': 'VN',
	'Wallis and Futuna Islands': 'WF',
};
for (const [name, code] of Object.entries(aliases)) codes.set(name, code);
const continents = {
	africa: '002',
	antarctica: 'AQ',
	asia: '142',
	europe: '150',
	'north-america': '003',
	oceania: '009',
	'south-america': '005',
};
const sources = [];
for (const locale of locales) {
	const target = read(`assets/i18n/${locale}.json`);
	const regions = new Intl.DisplayNames(locale, { type: 'region' });
	target.directories ??= {};
	target.directories.country ??= {};
	target.directories.continent ??= {};
	for (const [key, label] of Object.entries(english.directories.country)) {
		const code = codes.get(label);
		if (!code) throw new Error(`No reviewed region code for ${label}`);
		const translated = regions.of(code);
		if (translated === code) throw new Error(`No localized region name for ${code}/${locale}`);
		target.directories.country[key] ??= translated;
		sources.push({ locale, key: `directories.country.${key}`, region: code, value: translated });
	}
	for (const [key, label] of Object.entries(english.directories.continent)) {
		const code = continents[key] ?? codes.get(label);
		if (!code) throw new Error(`No reviewed continent code for ${key}`);
		target.directories.continent[key] ??= regions.of(code);
	}
	write(`assets/i18n/${locale}.json`, target);
}
// SDK keys use a different country identifier set; leave SDK additions to exact-key mapping.
write('scripts/i18n/display-name-provenance.json', {
	provider: 'Node.js Intl.DisplayNames (ICU/CLDR)',
	node: process.version,
	icu: process.versions.icu,
	cldr: process.versions.cldr,
	aliases,
	sources,
});
