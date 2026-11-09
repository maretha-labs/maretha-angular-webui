import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compare, floorFor, measure, metrics } from './verify-coverage.mjs';

const pct = (value) => Object.fromEntries(metrics.map((name) => [name, value]));
const baseline = () => ({
	version: 1,
	minimum: pct(80),
	files: { 'app/a.ts': pct(80) },
	excluded: { 'main.ts': { lines: 5, sha256: 'bootstrap' } },
});

test('rejects an overall coverage regression and a per-file regression hidden by the aggregate', () => {
	const current = baseline();
	current.minimum.lines = 79.99;
	assert.match(compare(current, baseline(), new Set(['app/a.ts']))[0], /Overall: lines/);
	current.minimum = pct(90);
	current.files['app/a.ts'].branches = 79.99;
	assert.match(compare(current, baseline(), new Set(['app/a.ts']))[0], /app\/a.ts: branches/);
});

test('rejects dropped measured files and new or expanded uninstrumented source', () => {
	const current = baseline();
	delete current.files['app/a.ts'];
	current.excluded['app/a.ts'] = { lines: 2, sha256: 'new' };
	current.excluded['main.ts'].lines = 6;
	const errors = compare(current, baseline(), new Set(['app/a.ts', 'main.ts']));
	assert.equal(errors.length, 3);
	assert.match(errors[0], /disappeared/);
});

test('accepts improved coverage, genuinely deleted source and shrinking exclusions', () => {
	const current = baseline();
	current.minimum = pct(90);
	delete current.files['app/a.ts'];
	current.excluded['main.ts'].lines = 4;
	assert.deepEqual(compare(current, baseline(), new Set(['main.ts'])), []);
});

test('invalid floors cannot silently turn comparisons into NaN', () => {
	const floor = baseline();
	floor.minimum.lines = null;
	assert.match(compare(baseline(), floor, new Set(['app/a.ts']))[0], /invalid lines floor/);
});

test('a lost covered line fails even when the displayed percentage rounds to the same value', () => {
	const metric = { total: 100000, covered: 50000, pct: 50 };
	const report = {
		metrics: Object.fromEntries(metrics.map((name) => [name, { ...metric }])),
		files: {},
		excluded: [],
	};
	const floor = floorFor(report);
	report.metrics.lines.covered--;
	assert.match(compare(floorFor(report), floor, new Set())[0], /lines 49.999% is below 50%/);
});

test('inventory exposes uninstrumented source and exact uncovered lines; ignore pragmas fail', () => {
	const root = mkdtempSync(join(tmpdir(), 'maretha-coverage-'));
	try {
		mkdirSync(join(root, 'app'));
		writeFileSync(join(root, 'app/a.ts'), 'export const value = 1;\n');
		writeFileSync(join(root, 'app/types.ts'), 'export interface Value { count: number; }\n');
		writeFileSync(join(root, 'main.ts'), 'console.log("bootstrap");\n');
		writeFileSync(join(root, 'polyfills.ts'), 'export {};\n');
		const path = join(root, 'app/a.ts');
		const raw = {
			[path]: {
				path,
				statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } } },
				fnMap: {},
				branchMap: {},
				s: { 0: 0 },
				f: {},
				b: {},
			},
		};
		const report = measure(root, raw);
		assert.equal(report.excludedPhysicalLines, 1);
		assert.deepEqual(
			report.excluded.map((file) => file.path),
			['main.ts'],
		);
		assert.equal(report.declarations.length, 2);
		assert.deepEqual(report.files['app/a.ts'].uncoveredLines, [1]);
		assert.equal(floorFor(report).minimum.lines, 0);
		writeFileSync(join(root, 'main.ts'), 'export function hidden() { return true ? 1 : 2; }\n');
		assert.match(
			compare(floorFor(measure(root, raw)), floorFor(report), new Set(['app/a.ts', 'main.ts']))[0],
			/uninstrumented executable content changed/,
		);
		mkdirSync(join(root, 'app/testing'));
		writeFileSync(join(root, 'app/testing/hidden.ts'), 'export const hidden = 1;\n');
		writeFileSync(join(root, 'main.ts'), 'import "./app/testing/hidden";\n');
		assert.throws(() => measure(root, raw), /production code imports excluded test source/);
		writeFileSync(join(root, 'main.ts'), 'console.log("bootstrap");\n');
		writeFileSync(join(root, 'app/a.ts'), '/* istanbul ignore next */\nexport const value = 1;\n');
		assert.throws(() => measure(root, raw), /must not hide runtime code/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test('re-export linkage is inventoried separately and cannot conceal executable additions', () => {
	const root = mkdtempSync(join(tmpdir(), 'maretha-linkage-'));
	try {
		mkdirSync(join(root, 'app'));
		const path = join(root, 'app/value.ts');
		writeFileSync(path, 'export const value = 1;\n');
		writeFileSync(join(root, 'app/index.ts'), "export { value } from './value';\n");
		writeFileSync(join(root, 'main.ts'), 'export {};\n');
		writeFileSync(join(root, 'polyfills.ts'), 'export {};\n');
		const raw = {
			[path]: {
				path,
				statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } } },
				fnMap: {},
				branchMap: {},
				s: { 0: 1 },
				f: {},
				b: {},
			},
		};
		const report = measure(root, raw);
		assert.deepEqual(
			report.linkage.map((file) => file.path),
			['app/index.ts'],
		);
		assert.equal(report.linkagePhysicalLines, 1);
		assert.match(report.linkage[0].sha256, /^[a-f0-9]{64}$/);
		assert.deepEqual(report.excluded, []);
		const before = floorFor(report);
		for (const addition of [
			'export const hidden = 1;',
			'export function hidden() { return 1; }',
			"import './side-effect';",
			"console.log('hidden');",
			'export default (() => 1)();',
		]) {
			writeFileSync(
				join(root, 'app/index.ts'),
				"export { value } from './value';\n" + addition + '\n',
			);
			const changed = measure(root, raw);
			assert.equal(changed.linkage.length, 0, addition);
			assert.ok(
				compare(floorFor(changed), before, new Set(['app/value.ts', 'app/index.ts'])).some(
					(error) => error.includes('uninstrumented'),
				),
				addition,
			);
		}
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
