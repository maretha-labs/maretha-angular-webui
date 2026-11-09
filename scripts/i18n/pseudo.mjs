import fs from 'node:fs';
import path from 'node:path';
import { loadProductionCatalogues, pseudoMessage } from './catalogue.mjs';
const { catalogues } = loadProductionCatalogues(process.cwd());
const output = path.resolve('dist/verification/i18n/pseudo.json');
const catalog = Object.fromEntries(
	Object.entries(catalogues['en-US']).map(([key, text]) => [key, pseudoMessage(text)]),
);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(catalog, null, 2) + '\n');
console.log(
	JSON.stringify({
		keys: Object.keys(catalog).length,
		output: 'dist/verification/i18n/pseudo.json',
		scope: 'Development-only pseudo catalogue; not a production locale.',
	}),
);
