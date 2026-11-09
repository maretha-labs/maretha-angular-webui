import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { expectedTests } from './expected-matrix.mjs';

function isolatedRun(source, prepare = () => {}) {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maretha-a11y-runner-'));
	try {
		const cli = path.join(directory, 'node_modules/@playwright/test/cli.js');
		fs.mkdirSync(path.dirname(cli), { recursive: true });
		fs.writeFileSync(cli, source);
		const output = path.join(directory, 'dist/verification/a11y');
		fs.mkdirSync(output, { recursive: true });
		fs.writeFileSync(
			path.join(output, 'summary.json'),
			JSON.stringify({ passed: true, old: true }),
		);
		fs.writeFileSync(path.join(output, 'playwright.json'), JSON.stringify({ old: true }));
		prepare(directory);
		const child = spawnSync(
			process.execPath,
			[fileURLToPath(new URL('./run.mjs', import.meta.url))],
			{
				cwd: directory,
				encoding: 'utf8',
			},
		);
		return {
			status: child.status,
			summary: JSON.parse(fs.readFileSync(path.join(output, 'summary.json'), 'utf8')),
			reportExists: fs.existsSync(path.join(output, 'playwright.json')),
			marker: fs.existsSync(path.join(directory, 'observed-fresh-start')),
		};
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
}

test('failed browser startup clears stale evidence, still summarizes and preserves its exit code', () => {
	const result = isolatedRun(`
const fs = require('node:fs');
if (fs.existsSync('dist/verification/a11y/playwright.json')) process.exit(88);
if (JSON.parse(fs.readFileSync('dist/verification/a11y/summary.json')).passed !== false) process.exit(89);
fs.writeFileSync('observed-fresh-start', 'yes');
process.exit(7);
`);
	assert.equal(result.status, 7);
	assert.equal(result.marker, true);
	assert.equal(result.reportExists, false);
	assert.equal(result.summary.passed, false);
	assert.equal(result.summary.old, undefined);
	assert.equal(result.summary.execution.summaryExitCode, 1);
	assert.match(result.summary.evidenceError, /missing, unreadable or malformed/);
});

test('successful browser process cannot hide a malformed or incomplete report', () => {
	for (const report of [
		'not-json',
		JSON.stringify({ suites: [], errors: [], stats: { expected: 0 } }),
	]) {
		const result = isolatedRun(
			`require('node:fs').writeFileSync('dist/verification/a11y/playwright.json', ${JSON.stringify(report)});`,
		);
		assert.equal(result.status, 1);
		assert.equal(result.summary.passed, false);
		assert.equal(result.summary.execution.browserExitCode, 0);
		assert.equal(result.summary.execution.summaryExitCode, 1);
	}
});

const attachment = (name, value) => ({
	name,
	contentType: 'application/json',
	body: Buffer.from(JSON.stringify(value)).toString('base64'),
});
function completeSyntheticReport() {
	return {
		errors: [],
		stats: { expected: expectedTests.length, skipped: 0, unexpected: 0, flaky: 0 },
		suites: [
			{
				title: 'components.e2e.ts',
				file: 'components.e2e.ts',
				suites: expectedTests.map((row) => ({
					title: row.group,
					file: row.file,
					specs: [
						{
							title: row.title,
							file: row.file,
							ok: true,
							tests: [
								{
									status: 'expected',
									expectedStatus: 'passed',
									results: [
										{
											status: 'passed',
											retry: 0,
											errors: [],
											attachments: row.surfaces.flatMap((surface) => [
												attachment(`${surface}-provenance`, {
													scope: 'deterministic runner unit fixture',
													surface,
													locale: row.locale,
													theme: row.theme,
													axe: 'unit',
													ibmEqualAccess: 'unit',
													playwright: 'unit',
													browser: 'unit',
													manualReviewRequired: { axeIncomplete: 0, ibm: 0 },
												}),
												attachment(`${surface}-axe`, {
													testEngine: { name: 'axe-core', version: 'unit' },
													violations: [],
													incomplete: [],
													passes: [{ id: 'unit', nodes: [{}] }],
													inapplicable: [],
												}),
												attachment(`${surface}-ibm-equal-access`, {
													numExecuted: 1,
													results: [
														{
															ruleId: 'unit',
															reasonId: 'Pass_1',
															path: { dom: '/html' },
															value: ['VIOLATION', 'PASS'],
														},
													],
												}),
												attachment(`${surface}-reviewed-exceptions`, {
													id: 'ngx-bootstrap-confirmation-focus-sentinels',
													maximum: 2,
													findings: [],
												}),
											]),
										},
									],
								},
							],
						},
					],
				})),
			},
		],
	};
}

test('a complete report passes only when the browser process also succeeds', () => {
	for (const exit of [0, 7]) {
		const result = isolatedRun(
			`
require('node:fs').copyFileSync('synthetic-report.json', 'dist/verification/a11y/playwright.json');
process.exit(${exit});
`,
			(directory) =>
				fs.writeFileSync(
					path.join(directory, 'synthetic-report.json'),
					JSON.stringify(completeSyntheticReport()),
				),
		);
		assert.equal(result.status, exit);
		assert.equal(result.summary.execution.summaryExitCode, 0);
		assert.equal(result.summary.passed, exit === 0);
	}
});
