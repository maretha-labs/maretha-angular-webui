import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { completeCatalogues } from './complete-catalogs.mjs';
import { LOCALES } from './catalogue.mjs';

function fixture(t, english, targets = {}) {
	const root = mkdtempSync(path.join(os.tmpdir(), 'maretha-catalog-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const write = (file, value) => {
		const full = path.join(root, file);
		mkdirSync(path.dirname(full), { recursive: true });
		writeFileSync(full, JSON.stringify(value));
	};
	for (const locale of LOCALES)
		write(`assets/i18n/${locale}.json`, locale === 'en-US' ? english : (targets[locale] ?? {}));
	write('scripts/i18n/legacy-supplements.json', { locales: LOCALES.slice(1), entries: {} });
	mkdirSync(path.join(root, 'app/extensions'), { recursive: true });
	writeFileSync(
		path.join(root, 'app/extensions/polymer-messages.generated.ts'),
		`export const POLYMER_MESSAGES = ${JSON.stringify(Object.fromEntries(LOCALES.map((locale) => [locale, {}])))};`,
	);
	return {
		root,
		write,
		catalog: (locale) =>
			JSON.parse(readFileSync(path.join(root, `assets/i18n/${locale}.json`), 'utf8')),
	};
}

test('retains customer translations and leaves genuinely untranslated messages missing', (t) => {
	const f = fixture(
		t,
		{ retained: 'Existing label', missing: 'No translation yet' },
		{ es: { retained: 'Customer {literal} <b>text</b>' } },
	);
	f.write('scripts/i18n/legacy-supplements.json', {
		locales: ['es'],
		entries: { 'Existing label': ['Etiqueta existente'] },
	});
	const report = completeCatalogues(f.root);
	assert.deepEqual(f.catalog('es'), { retained: 'Customer {literal} <b>text</b>' });
	assert.equal(report.gaps.es, 1);
	assert.equal(f.catalog('ar').missing, undefined);
});

test('does not choose the last authored translation when normalized English sources conflict', (t) => {
	const f = fixture(t, { action: 'COPY' });
	f.write('scripts/i18n/legacy-supplements.json', {
		locales: ['es'],
		entries: { Copy: ['Copiar'], 'copy.': ['Copia'] },
	});
	completeCatalogues(f.root);
	assert.equal(f.catalog('es').action, undefined);
});

test('reuses a unique compatible phrase without changing placeholder case', (t) => {
	const f = fixture(
		t,
		{ existing: 'Hello {user}', same: 'Hello {user}', different: 'Hello {User}' },
		{ es: { existing: 'Hola {user}' } },
	);
	completeCatalogues(f.root);
	assert.equal(f.catalog('es').same, 'Hola {user}');
	assert.equal(f.catalog('es').different, undefined);
});

test('a stale late-locale supplement rejects the entire update before any catalog write', (t) => {
	const f = fixture(t, { existing: 'Existing' });
	f.write('draft.json', { added: 'New label' });
	f.write('scripts/i18n/legacy-supplements.json', {
		locales: ['es'],
		entries: { 'New label': ['Etiqueta nueva'] },
	});
	f.write('scripts/i18n/it-ui-supplements.json', {
		entries: { existing: { source: 'Old meaning', translation: 'Esistente' } },
	});
	const before = LOCALES.map((locale) =>
		readFileSync(path.join(f.root, `assets/i18n/${locale}.json`), 'utf8'),
	);
	assert.throws(
		() => completeCatalogues(f.root, ['draft.json']),
		/Stale or incompatible keyed supplement: it:existing/,
	);
	assert.deepEqual(
		LOCALES.map((locale) => readFileSync(path.join(f.root, `assets/i18n/${locale}.json`), 'utf8')),
		before,
	);
});

test('an explicit supplement cannot overwrite a customer translation or drop its arguments', (t) => {
	const f = fixture(t, { greeting: 'Hello {name}' }, { es: { greeting: 'Saludos {name}' } });
	f.write('scripts/i18n/es-ui-supplements.json', {
		entries: { greeting: { source: 'Hello {name}', translation: 'Hola {name}' } },
	});
	assert.throws(() => completeCatalogues(f.root), /conflicts with existing translation/);
	f.write('scripts/i18n/es-ui-supplements.json', {
		entries: { greeting: { source: 'Hello {name}', translation: 'Hola' } },
	});
	assert.throws(() => completeCatalogues(f.root), /Stale or incompatible keyed supplement/);
	assert.equal(f.catalog('es').greeting, 'Saludos {name}');
});

test('a stale draft cannot reintroduce a retired fragmented message', (t) => {
	const f = fixture(t, { active: 'Active message' });
	f.write('scripts/i18n/retired-fragment-keys.json', { keys: ['retired'] });
	f.write('draft.json', { retired: 'Old fragmented message' });
	assert.throws(
		() => completeCatalogues(f.root, ['draft.json']),
		/English draft reintroduces retired key/,
	);
	assert.deepEqual(f.catalog('en-US'), { active: 'Active message' });
});
