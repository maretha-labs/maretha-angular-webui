import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { collectInputs, hashFile } from './verify-coverage.mjs';

const verifier = fileURLToPath(new URL('./verify-coverage.mjs', import.meta.url));
const baselineName = 'contracts/coverage-baseline.json';
const coverageName = 'coverage/maretha-angular-webui/coverage-final.json';
const snapshotName = 'coverage/maretha-angular-webui/source-snapshot.json';

function write(root, name, content) {
	const path = join(root, name);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, content);
}

function writeJson(root, name, value) {
	write(root, name, JSON.stringify(value, null, 2) + '\n');
}

function readJson(root, name) {
	return JSON.parse(readFileSync(join(root, name), 'utf8'));
}

function run(root, args = [], env = {}) {
	const result = spawnSync(process.execPath, [verifier, ...args], {
		cwd: root,
		encoding: 'utf8',
		env: { ...process.env, COVERAGE_BASE_REF: '', ...env },
		timeout: 30_000,
	});
	assert.ifError(result.error);
	assert.equal(result.signal, null);
	return { ...result, output: result.stdout + result.stderr };
}

function expectPass(result) {
	assert.equal(result.status, 0, result.output);
	assert.match(result.output, /Coverage ratchet passed/);
}

function expectFailure(result, diagnostic) {
	assert.equal(result.status, 1, result.output);
	assert.match(result.output, diagnostic);
}

function saveSnapshot(root) {
	writeJson(root, snapshotName, {
		version: 1,
		inputs: collectInputs(root),
		coverageSha256: hashFile(join(root, coverageName)),
	});
}

function saveCoverage(root, secondStatementHits = 1) {
	const path = join(root, 'app/a.ts');
	writeJson(root, coverageName, {
		[path]: {
			path,
			statementMap: {
				0: { start: { line: 1, column: 0 }, end: { line: 1, column: 23 } },
				1: { start: { line: 2, column: 0 }, end: { line: 2, column: 24 } },
			},
			s: { 0: 1, 1: secondStatementHits },
			fnMap: {},
			f: {},
			branchMap: {},
			b: {},
		},
	});
	saveSnapshot(root);
}

function fixture(t) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'maretha-coverage-cli-')));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	write(root, 'app/a.ts', 'export const first = 1;\nexport const second = 2;\n');
	writeJson(root, 'app/catalog.json', { enabled: true });
	write(root, 'main.ts', 'export {};\n');
	write(root, 'polyfills.ts', 'export {};\n');
	writeJson(root, 'angular.json', {
		projects: { 'maretha-angular-webui': { architect: { test: { options: {} } } } },
	});
	saveCoverage(root);
	expectPass(run(root, ['--update']));
	expectPass(run(root));
	return root;
}

test('CLI --update refuses lower coverage and preserves the existing baseline bytes', (t) => {
	const root = fixture(t);
	const before = readFileSync(join(root, baselineName));
	assert.equal(readJson(root, baselineName).minimum.statements, 100);
	saveCoverage(root, 0);

	expectFailure(run(root, ['--update']), /statements 50% is below 100%/);
	assert.deepEqual(readFileSync(join(root, baselineName)), before);
	const report = readJson(root, 'dist/verification/coverage.json');
	assert.equal(report.metrics.statements.pct, 50);
	assert.deepEqual(report.files['app/a.ts'].uncoveredLines, [2]);
	assert.ok(report.errors.some((error) => error.includes('below 100%')));
});

const invalidSnapshots = [
	{
		name: 'missing snapshot',
		mutate: (root) => rmSync(join(root, snapshotName)),
		diagnostic: /Missing coverage source snapshot/,
	},
	{
		name: 'malformed snapshot JSON',
		mutate: (root) => write(root, snapshotName, '{ definitely not JSON'),
		diagnostic: /JSON|property name/i,
	},
	{
		name: 'unsupported snapshot version',
		mutate: (root) =>
			writeJson(root, snapshotName, { ...readJson(root, snapshotName), version: 2 }),
		diagnostic: /Coverage data or source changed since collection/,
	},
	{
		name: 'coverage changed after snapshot',
		mutate: (root) => {
			const raw = readJson(root, coverageName);
			raw[join(root, 'app/a.ts')].s[1] = 0;
			writeJson(root, coverageName, raw);
		},
		diagnostic: /Coverage data or source changed since collection/,
	},
	{
		name: 'source changed after snapshot',
		mutate: (root) =>
			write(root, 'app/a.ts', 'export const first = 1;\nexport const second = 200;\n'),
		diagnostic: /Coverage data or source changed since collection/,
	},
	{
		name: 'runtime JSON changed after snapshot',
		mutate: (root) => writeJson(root, 'app/catalog.json', { enabled: false }),
		diagnostic: /Coverage data or source changed since collection/,
	},
];

for (const { name, mutate, diagnostic } of invalidSnapshots) {
	test(`CLI --update rejects ${name} without touching the baseline`, (t) => {
		const root = fixture(t);
		const before = readFileSync(join(root, baselineName));
		mutate(root);

		expectFailure(run(root, ['--update']), diagnostic);
		assert.deepEqual(readFileSync(join(root, baselineName)), before);
	});
}

test('CLI exact base SHA rejects a manually lowered baseline even when current coverage passes', (t) => {
	const root = fixture(t);
	const baseSha = 'a1'.repeat(20);
	const previous = readFileSync(join(root, baselineName), 'utf8');
	write(root, 'base-baseline.json', previous);
	const lowered = JSON.parse(previous);
	lowered.minimum.statements = 50;
	lowered.minimum.lines = 50;
	lowered.files['app/a.ts'].statements = 50;
	lowered.files['app/a.ts'].lines = 50;
	writeJson(root, baselineName, lowered);
	expectPass(run(root));
	const before = readFileSync(join(root, baselineName));

	// Exercise the verifier's real Git subprocess boundary without creating a repository.
	const gitPath = join(root, 'bin/git');
	const callsPath = join(root, 'git-calls.jsonl');
	write(
		root,
		'bin/git',
		`#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(callsPath)}, JSON.stringify(args) + '\\n');
if (JSON.stringify(args) === JSON.stringify(['ls-tree', '--name-only', ${JSON.stringify(baseSha)}, '--', ${JSON.stringify(baselineName)}])) {
  process.stdout.write(${JSON.stringify(baselineName + '\n')});
} else if (JSON.stringify(args) === JSON.stringify(['show', ${JSON.stringify(`${baseSha}:${baselineName}`)}])) {
  process.stdout.write(fs.readFileSync(${JSON.stringify(join(root, 'base-baseline.json'))}));
} else {
  process.stderr.write('Unexpected Git invocation');
  process.exitCode = 99;
}
`,
	);
	chmodSync(gitPath, 0o755);
	const env = {
		COVERAGE_BASE_REF: baseSha,
		PATH: `${join(root, 'bin')}${delimiter}${process.env.PATH ?? ''}`,
	};
	expectFailure(
		run(root, ['--update'], env),
		/Baseline lowered: Overall: statements 50% is below 100%/,
	);
	assert.deepEqual(readFileSync(join(root, baselineName)), before);
	assert.deepEqual(readFileSync(callsPath, 'utf8').trim().split('\n').map(JSON.parse), [
		['ls-tree', '--name-only', baseSha, '--', baselineName],
		['show', `${baseSha}:${baselineName}`],
	]);
});
