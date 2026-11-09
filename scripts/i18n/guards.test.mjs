import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { LOCALES, validateCatalogues, pseudoMessage, flattenCatalogue } from './catalogue.mjs';
import { inventorySource, collectInventory } from './source-inventory.mjs';
import { reviewInventory, combineSourceExceptions } from './source-policy.mjs';

const all = (english) => Object.fromEntries(LOCALES.map((locale) => [locale, { ...english }]));
test('only the excluded app/testing fixture tree is omitted, not production folders with the same basename', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-inventory-scope-'));
	try {
		for (const dir of ['app/testing', 'app/modules/testing', 'app/components'])
			fs.mkdirSync(path.join(root, dir), { recursive: true });
		fs.writeFileSync(path.join(root, 'app/testing/fixture.html'), '<p>Fixture-only text</p>');
		fs.writeFileSync(path.join(root, 'app/modules/testing/page.html'), '<p>Production text</p>');
		fs.writeFileSync(
			path.join(root, 'app/components/page.html'),
			'<p>Another production literal</p>',
		);
		const inventory = collectInventory(root);
		assert.equal(inventory.files, 2);
		assert.deepEqual(inventory.findings.map((x) => x.text).sort(), [
			'Another production literal',
			'Production text',
		]);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
test('missing translations, empty messages and flattened key collisions fail', () => {
	const values = all({ save: 'Save' });
	assert.deepEqual(validateCatalogues(values), []);
	delete values.fr.save;
	values.ar.save = '';
	assert.equal(validateCatalogues(values).length, 2);
	assert.throws(() => flattenCatalogue({ 'a.b': 'one', a: { b: 'two' } }), /Duplicate/);
});
test('ICU malformed syntax, argument renaming, selector loss and Arabic plural loss fail', () => {
	const values = all({ hello: 'Hello {name}' });
	values.es.hello = 'Hola {user}';
	values.it.hello = 'Ciao {name';
	assert.equal(validateCatalogues(values).length, 2);
	const select = all({ choice: '{kind, select, yes {Yes} no {No} other {Other}}' });
	select.fr.choice = '{kind, select, yes {Oui} other {Autre}}';
	assert.ok(validateCatalogues(select).some((error) => error.includes('lost a required branch')));
	const plural = all({ count: '{count, plural, =1 {One} other {# things}}' });
	assert.ok(
		validateCatalogues(plural).some((error) => error.startsWith('ar:') && error.includes('zero')),
	);
});
test('pseudo generation preserves nested ICU, named customer values and markup', () => {
	const source =
		'{kind, select, file {<b>Hello</b> {name}: {count, plural, one {one file} other {# files}}} other {No files}}';
	const pseudo = pseudoMessage(source);
	const formatted = new IntlMessageFormat(pseudo, 'en-US', undefined, { ignoreTag: true }).format({
		kind: 'file',
		name: 'Save.customer.literal',
		count: 2,
	});
	assert.match(formatted, /Save\.customer\.literal/);
	assert.match(formatted, /⟦/);
	assert.match(formatted, /<b>/);
	assert.match(formatted, /2/);
	assert.doesNotMatch(formatted, /Hello|files/);
});
test('inventory detects inline templates, accessible names and mixed translated/plain text', () => {
	const html =
		'<button aria-label="Close">{{ "known" | translate }} left outside {{ document.title }}</button>';
	const entries = inventorySource('app/a.html', html);
	assert.ok(entries.some((entry) => entry.text === 'Close' && entry.kind === 'template-attribute'));
	assert.ok(
		entries.some((entry) => entry.text === 'left outside' && entry.kind === 'mixed-template-text'),
	);
	assert.ok(!entries.some((entry) => entry.text === 'known'));
	assert.ok(
		inventorySource('app/a.ts', '@Component({template: `<p>Save changes</p>`}) class A {}').some(
			(entry) => entry.text === 'Save changes',
		),
	);
});
test('customer fields are not silently certified as translated literals', () => {
	const entries = inventorySource(
		'app/a.html',
		'<p>{{ document.title }}</p><p>{{ document.properties["dc:title"] }}</p>',
	);
	assert.ok(entries.some((entry) => entry.ownership === 'dynamic-review'));
	assert.ok(!entries.some((entry) => entry.ownership === 'app-owned'));
});
test('source exceptions are exact and bounded, never whole-file/container suppressions', () => {
	const findings = inventorySource('app/a.html', '<p>Customer product</p>');
	const finding = findings[0];
	const exception = {
		id: finding.id,
		file: finding.file,
		kind: finding.kind,
		text: finding.text,
		ownership: 'brand',
		reason: 'Reviewed product name displayed verbatim.',
		maximum: 1,
	};
	assert.equal(reviewInventory(findings, [exception]).unreviewed.length, 0);
	assert.ok(reviewInventory([...findings, { ...finding, line: 2 }], [exception]).errors.length);
	assert.ok(reviewInventory(findings, [{ ...exception, selector: '.customer' }]).errors.length);
	assert.equal(
		reviewInventory(
			[...findings, ...inventorySource('app/b.html', '<p>Customer product</p>')],
			[exception],
		).unreviewed.length,
		1,
	);
});

test('inventory covers Angular grouped switch cases, empty and deferred branches', () => {
	const findings = inventorySource(
		'app/switch.html',
		'@switch(kind){@case("a"){<p>Case message</p>}@default{<p>Default message</p>}} @for(item of items; track item){<p>{{item}}</p>} @empty{<p>Empty message</p>} @defer{<p>Ready message</p>} @loading{<p>Loading message</p>} @error{<p>Error message</p>}',
	);
	for (const text of [
		'Case message',
		'Default message',
		'Empty message',
		'Ready message',
		'Loading message',
		'Error message',
	])
		assert.ok(
			findings.some((x) => x.text === text),
			text,
		);
});

test('imported message descriptors identify only their fallback, never arbitrary literal setters', () => {
	const source = `import { messageText as appText, localizedText } from 'app/helpers/localized-message';
	const translated = localizedText(appText('app.key', 'Known fallback', { detail: 'Customer detail' }));
	const untranslated = localizedText('Still untranslated');
	untranslated.set('Another untranslated value');
	const unrelated = messageText('other.key', 'Unrelated helper');`;
	const findings = inventorySource('app/a.ts', source);
	assert.ok(!findings.some((x) => x.text === 'Known fallback'));
	for (const text of [
		'Customer detail',
		'Still untranslated',
		'Another untranslated value',
		'Unrelated helper',
	])
		assert.ok(
			findings.some((x) => x.text === text),
			text,
		);
});

test('JSON UI field names are identifiers while their displayed values remain audited', () => {
	const findings = inventorySource(
		'app/config.json',
		'{"label":"Visible label","nested":{"title":"Heading"}}',
	);
	assert.ok(!findings.some((x) => x.text === 'label' || x.text === 'title'));
	assert.ok(findings.some((x) => x.text === 'Visible label'));
	assert.ok(findings.some((x) => x.text === 'Heading'));
});

test('message service aliases are recognized from their SDK import while customer parameters stay audited', () => {
	const findings = inventorySource(
		'app/a.ts',
		`import {WebUiMessages as Labels} from '@maretha/webui-sdk';
	class A { readonly uiLabels = inject(Labels); label(){return this.uiLabels.format('known', {label:'Customer content'}, 'Known fallback');} }`,
	);
	assert.ok(!findings.some((x) => x.text === 'Known fallback'));
	assert.ok(findings.some((x) => x.text === 'Customer content'));
	const html = inventorySource(
		'app/a.html',
		'<ng-select bindLabel="displayLabel" placeholder="Choose entry"></ng-select>',
	);
	assert.ok(!html.some((x) => x.text === 'displayLabel'));
	assert.ok(html.some((x) => x.text === 'Choose entry'));
});

test('scoped review files reject cross-scope entries, widened declarations and duplicate identities', () => {
	const record = { id: '1234567890123456', file: 'app/extensions/example.ts' };
	const sdk = { version: 1, scopes: ['app/extensions/'], exceptions: [record] };
	assert.deepEqual(combineSourceExceptions({ 'source-exceptions-sdk.json': sdk }).errors, []);
	assert.ok(
		combineSourceExceptions({ 'source-exceptions-sdk.json': { ...sdk, scopes: ['app/'] } }).errors
			.length,
	);
	assert.ok(
		combineSourceExceptions({
			'source-exceptions-sdk.json': {
				...sdk,
				exceptions: [{ ...record, file: 'app/components/a.ts' }],
			},
		}).errors.length,
	);
	assert.ok(
		combineSourceExceptions({
			'source-exceptions-sdk.json': sdk,
			'source-exceptions.json': [record],
		}).errors.length,
	);
	assert.ok(combineSourceExceptions({ 'source-exceptions-unreviewed.json': sdk }).errors.length);
});
