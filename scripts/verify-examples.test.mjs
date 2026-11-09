import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
	CATALOG,
	coverageGaps,
	EXAMPLE,
	KARMA_CONFIG,
	KARMA_CONFIG_TEXT,
	unknownDefaultIds,
} from './verify-examples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

describe('coverageGaps', () => {
	let zone;
	const write = (file, text = 'export {};\n') => {
		const target = path.join(zone, file);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, text);
	};
	beforeEach(() => {
		zone = path.join(mkdtempSync(path.join(tmpdir(), 'examples-coverage-')), 'custom');
		write('owner.json', '{ "prefix": "acme" }\n');
		write('index.ts', '// <custom:imports>\n// <custom:contributions>\n// <custom:layouts>\n');
		write('contributions/document-actions/acme.a.component.ts');
		write('contributions/document-actions/acme.a.component.spec.ts');
		write('layouts/Contract/contract.fields.ts');
		write('layouts/Contract/contract.view.layout.ts');
		write('layouts/Contract/contract.view.layout.spec.ts');
	});
	afterEach(() => rmSync(path.dirname(zone), { recursive: true, force: true }));

	it('is empty when every slot and mode has an implementation with a spec', () => {
		assert.deepEqual(coverageGaps(zone, { slots: ['DOCUMENT_ACTIONS'], modes: ['view'] }), []);
	});

	it('names the uncovered slot, the uncovered mode and the implementation without a spec', () => {
		write('contributions/document-actions/acme.b.component.ts');
		const gaps = coverageGaps(zone, {
			slots: ['DOCUMENT_ACTIONS', 'BLOB_ACTIONS'],
			modes: ['view', 'edit'],
		});
		assert.deepEqual(gaps, [
			'BLOB_ACTIONS: no contribution under contributions/blob-actions/',
			'layout mode edit: no layouts/<Type>/<type>.edit.layout.ts',
			'contributions/document-actions/acme.b.component.ts: no acme.b.component.spec.ts',
		]);
	});

	it('rejects a missing marker and the reserved owner prefix', () => {
		write('index.ts', '// <custom:imports>\n// <custom:layouts>\n');
		write('owner.json', '{ "prefix": "maretha" }\n');
		const gaps = coverageGaps(zone, { slots: [], modes: [] });
		assert.equal(gaps.length, 2);
		assert.match(gaps[0], /other than "maretha"/);
		assert.match(gaps[1], /missing its \/\/ <custom:contributions> marker/);
	});
});

describe('unknownDefaultIds', () => {
	it('lists the maretha.* ids the catalog does not have, once each, sorted', () => {
		const index =
			"'maretha.document.purge' 'maretha.user.themes' 'maretha.nope.x' 'maretha.nope.x' 'acme.y'";
		assert.deepEqual(unknownDefaultIds(index, '`maretha.document.purge`, `maretha.user.themes`'), [
			'maretha.nope.x',
		]);
	});
});

describe(EXAMPLE, () => {
	it('covers every slot and layout mode with a spec per implementation', () => {
		assert.deepEqual(coverageGaps(path.join(root, EXAMPLE)), []);
	});

	it('names only default ids that the slot catalog lists', () => {
		assert.deepEqual(unknownDefaultIds(read(`${EXAMPLE}/index.ts`), read(CATALOG)), []);
	});

	it('runs its specs once, headless, from a karma configuration in the ignored out-tsc/', () => {
		assert.match(KARMA_CONFIG, /^out-tsc\//);
		assert.match(KARMA_CONFIG_TEXT, /singleRun: true/);
		assert.match(KARMA_CONFIG_TEXT, /ChromeHeadless/);
	});
});
