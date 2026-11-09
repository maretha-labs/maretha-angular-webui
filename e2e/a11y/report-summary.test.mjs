import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { summarizeReport } from './report-summary.mjs';

const matrix = [
	{
		file: 'components.e2e.ts',
		group: 'en-US default',
		title: 'shell',
		locale: 'en-US',
		theme: 'default',
		surfaces: ['shell'],
	},
	{
		file: 'components.e2e.ts',
		group: 'ar dark',
		title: 'confirmation',
		locale: 'ar',
		theme: 'dark',
		surfaces: ['confirmation-dialog'],
	},
];
const attachment = (name, value) => ({
	name,
	contentType: 'application/json',
	body: Buffer.from(JSON.stringify(value)).toString('base64'),
});
const pass = {
	ruleId: 'test_rule',
	reasonId: 'Pass_1',
	path: { dom: '/html' },
	value: ['VIOLATION', 'PASS'],
};
const sentinel = {
	ruleId: 'aria_hidden_nontabbable',
	reasonId: 'Fail_1',
	path: { dom: '/html/body/modal-container/div[1]' },
	value: ['VIOLATION', 'FAIL'],
};
function fixture() {
	return {
		errors: [],
		stats: { expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
		suites: [
			{
				title: 'components.e2e.ts',
				file: 'components.e2e.ts',
				suites: matrix.map((row) => ({
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
													scope: 'deterministic fixture',
													surface,
													locale: row.locale,
													theme: row.theme,
													axe: '4.13.0',
													ibmEqualAccess: '4.0.34',
													playwright: '1.63.0',
													browser: '154',
													manualReviewRequired: { axeIncomplete: 0, ibm: 0 },
												}),
												attachment(`${surface}-axe`, {
													testEngine: { name: 'axe-core', version: '4.13.0' },
													violations: [],
													incomplete: [],
													passes: [{ id: 'document-title', nodes: [{}] }],
													inapplicable: [],
												}),
												attachment(`${surface}-ibm-equal-access`, {
													numExecuted: 1,
													results: [pass],
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
const spec = (report, index = 0) => report.suites[0].suites[index].specs[0];
const result = (report, index = 0) => spec(report, index).tests[0].results[0];
function updateAttachment(report, name, change, index = 0) {
	const entries = result(report, index).attachments;
	const entry = entries.find((entry) => entry.name === name);
	const value = JSON.parse(Buffer.from(entry.body, 'base64').toString());
	change(value);
	entry.body = attachment(name, value).body;
}

test('exact matrix succeeds and manual findings remain visible', () => {
	const report = fixture();
	updateAttachment(report, 'shell-ibm-equal-access', (data) =>
		data.results.push({ ...pass, value: ['VIOLATION', 'MANUAL'] }),
	);
	updateAttachment(report, 'shell-provenance', (data) => data.manualReviewRequired.ibm++);
	const summary = summarizeReport(report, matrix);
	assert.equal(summary.passed, true);
	assert.equal(summary.scanStates, 2);
	assert.equal(summary.pairedScans, 4);
	assert.deepEqual(summary.scans[0].humanReview.ibm, ['test_rule:VIOLATION/MANUAL']);
});

test('same-count replacement cannot conceal a missing locale, theme or test', () => {
	for (const mutate of [
		(report) => report.suites[0].suites.splice(1, 1, structuredClone(report.suites[0].suites[0])),
		(report) => {
			spec(report).title = 'unknown';
		},
		(report) =>
			updateAttachment(report, 'shell-provenance', (data) => {
				data.locale = 'ar';
			}),
		(report) =>
			updateAttachment(report, 'shell-provenance', (data) => {
				data.theme = 'dark';
			}),
		(report) =>
			updateAttachment(report, 'shell-provenance', (data) => {
				data.surface = 'other';
			}),
	]) {
		const report = fixture();
		mutate(report);
		assert.throws(() => summarizeReport(report, matrix), /Invalid accessibility evidence/);
	}
});

test('duplicate, missing and unexpected paired attachments fail closed', () => {
	for (const mutate of [
		(report) => result(report).attachments.push(structuredClone(result(report).attachments[0])),
		(report) => result(report).attachments.splice(1, 1),
		(report) => result(report).attachments.push(attachment('unexpected-provenance', {})),
		(report) => {
			result(report).attachments[0].body = Buffer.from('not json').toString('base64');
		},
	]) {
		const report = fixture();
		mutate(report);
		assert.throws(() => summarizeReport(report, matrix), /Invalid accessibility evidence/);
	}
});

test('failed, skipped, flaky, retried and report-error runs cannot pass from old attachments', () => {
	for (const mutate of [
		(report) => {
			report.stats.skipped = 1;
		},
		(report) => {
			report.stats.flaky = 1;
		},
		(report) => report.errors.push({ message: 'fixture server failed' }),
		(report) => {
			spec(report).ok = false;
		},
		(report) => {
			spec(report).tests[0].expectedStatus = 'failed';
		},
		(report) => {
			result(report).status = 'failed';
		},
		(report) => {
			result(report).retry = 1;
		},
		(report) => result(report).errors.push({ message: 'assertion failed' }),
		(report) => spec(report).tests[0].results.push(structuredClone(result(report))),
		(report) => report.suites[0].suites.pop(),
	]) {
		const report = fixture();
		mutate(report);
		assert.throws(() => summarizeReport(report, matrix), /Invalid accessibility evidence/);
	}
});

test('malformed or empty engine output and mismatched review counts fail closed', () => {
	for (const mutate of [
		(report) =>
			updateAttachment(report, 'shell-axe', (data) => {
				data.passes = [];
			}),
		(report) =>
			updateAttachment(report, 'shell-axe', (data) => {
				data.violations = {};
			}),
		(report) =>
			updateAttachment(report, 'shell-axe', (data) => {
				data.testEngine.version = 'other';
			}),
		(report) =>
			updateAttachment(report, 'shell-ibm-equal-access', (data) => {
				data.results = [];
			}),
		(report) =>
			updateAttachment(report, 'shell-ibm-equal-access', (data) => {
				data.results[0].value = [];
			}),
		(report) =>
			updateAttachment(report, 'shell-provenance', (data) => {
				data.manualReviewRequired.ibm = 5;
			}),
	]) {
		const report = fixture();
		mutate(report);
		assert.throws(
			() => summarizeReport(report, matrix),
			/invalid scan report|Invalid accessibility evidence/,
		);
	}
});

test('approved sentinel identity does not exempt another rule or another surface', () => {
	const report = fixture();
	updateAttachment(
		report,
		'confirmation-dialog-ibm-equal-access',
		(data) => data.results.push(sentinel),
		1,
	);
	updateAttachment(
		report,
		'confirmation-dialog-reviewed-exceptions',
		(data) => data.findings.push(sentinel),
		1,
	);
	assert.equal(summarizeReport(report, matrix).passed, true);
	updateAttachment(
		report,
		'confirmation-dialog-ibm-equal-access',
		(data) => data.results.push({ ...sentinel, ruleId: 'other_rule' }),
		1,
	);
	assert.equal(summarizeReport(report, matrix).passed, false);
	const wrongSurface = fixture();
	updateAttachment(wrongSurface, 'shell-ibm-equal-access', (data) => data.results.push(sentinel));
	updateAttachment(wrongSurface, 'shell-reviewed-exceptions', (data) =>
		data.findings.push(sentinel),
	);
	assert.throws(() => summarizeReport(wrongSurface, matrix), /exception outside/);
});

test('axe violations are failures and duplicate reviewed records cannot conceal count changes', () => {
	const report = fixture();
	updateAttachment(report, 'shell-axe', (data) =>
		data.violations.push({ id: 'color-contrast', nodes: [{}] }),
	);
	assert.equal(summarizeReport(report, matrix).passed, false);
	updateAttachment(
		report,
		'confirmation-dialog-ibm-equal-access',
		(data) => data.results.push(sentinel),
		1,
	);
	updateAttachment(
		report,
		'confirmation-dialog-reviewed-exceptions',
		(data) => data.findings.push(sentinel, sentinel),
		1,
	);
	assert.throws(() => summarizeReport(report, matrix), /exception outside/);
	const duplicatedRaw = fixture();
	updateAttachment(
		duplicatedRaw,
		'confirmation-dialog-ibm-equal-access',
		(data) => data.results.push(sentinel, sentinel),
		1,
	);
	updateAttachment(
		duplicatedRaw,
		'confirmation-dialog-reviewed-exceptions',
		(data) => data.findings.push(sentinel),
		1,
	);
	assert.throws(() => summarizeReport(duplicatedRaw, matrix), /duplicate IBM violation/);
});

test('summary CLI replaces an old pass when the new browser report is missing', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'maretha-a11y-summary-'));
	try {
		const output = path.join(directory, 'dist/verification/a11y');
		fs.mkdirSync(output, { recursive: true });
		fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ passed: true }));
		const command = spawnSync(
			process.execPath,
			[fileURLToPath(new URL('./summarize.mjs', import.meta.url))],
			{
				cwd: directory,
				encoding: 'utf8',
			},
		);
		assert.equal(command.status, 1);
		const summary = JSON.parse(fs.readFileSync(path.join(output, 'summary.json'), 'utf8'));
		assert.equal(summary.passed, false);
		assert.match(summary.evidenceError, /missing, unreadable or malformed/);
	} finally {
		fs.rmSync(directory, { recursive: true, force: true });
	}
});
