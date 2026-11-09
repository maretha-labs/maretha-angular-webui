import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { LOCALES } from './catalogue.mjs';
const script = fileURLToPath(new URL('./verify.mjs', import.meta.url));
test('the actual verification command fails for a missing locale key, broken ICU and a newly visible literal', () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maretha-i18n-gate-'));
	try {
		fs.mkdirSync(path.join(root, 'app/extensions'), { recursive: true });
		fs.mkdirSync(path.join(root, 'assets/i18n'), { recursive: true });
		fs.writeFileSync(
			path.join(root, 'app/extensions/polymer-messages.generated.ts'),
			'export const POLYMER_MESSAGES = ' +
				JSON.stringify(Object.fromEntries(LOCALES.map((l) => [l, { library: 'Library' }]))) +
				';',
		);
		const html = path.join(root, 'app/page.html');
		fs.writeFileSync(html, '<h1>{{ "welcome" | translate }}</h1>');
		for (const locale of LOCALES)
			fs.writeFileSync(
				path.join(root, 'assets/i18n', locale + '.json'),
				JSON.stringify({ welcome: 'Hello {name}' }),
			);
		const run = () => {
			const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
			return {
				code: result.status,
				report: JSON.parse(
					fs.readFileSync(path.join(root, 'dist/verification/i18n/verification.json'), 'utf8'),
				),
			};
		};
		assert.equal(run().code, 0);
		const file = path.join(root, 'assets/i18n/fr.json');
		fs.writeFileSync(file, '{}');
		let result = run();
		assert.equal(result.code, 1);
		assert.ok(result.report.catalogueErrors.some((x) => x.includes('fr:')));
		fs.writeFileSync(file, JSON.stringify({ welcome: 'Bonjour {name' }));
		result = run();
		assert.equal(result.code, 1);
		assert.ok(result.report.catalogueErrors.length);
		fs.writeFileSync(file, JSON.stringify({ welcome: 'Bonjour {name}' }));
		assert.equal(run().code, 0);
		// Equal catalogs can still all omit a key referenced by production source.
		fs.writeFileSync(html, '<h1>{{ "missing" | translate }}</h1>');
		result = run();
		assert.equal(result.code, 1);
		assert.equal(result.report.catalogueErrors.length, 0);
		assert.equal(result.report.unreviewedSource.length, 0);
		assert.deepEqual(
			result.report.missingReferences.map((x) => x.key),
			['missing'],
		);
		fs.writeFileSync(html, '<h1>{{ "welcome" | translate }} Untranslated suffix</h1>');
		result = run();
		assert.equal(result.code, 1);
		assert.ok(result.report.unreviewedSource.some((x) => x.text === 'Untranslated suffix'));
		fs.writeFileSync(html, '<h1>{{ "welcome" | translate }}</h1>');
		fs.writeFileSync(
			path.join(root, 'app/extensions/view.ts'),
			`import {WebUiMessages} from '@maretha/webui-sdk'; class View {messages=inject(WebUiMessages); show(){return this.messages.text('welcome','Hello {name}');}}`,
		);
		result = run();
		assert.equal(result.code, 1);
		assert.equal(result.report.missingReferences.length, 0);
		assert.deepEqual(
			result.report.missingSdkReferences.map((x) => x.key),
			['welcome'],
		);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
