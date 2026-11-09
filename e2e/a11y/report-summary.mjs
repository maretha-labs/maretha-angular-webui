import { findingIdentity, unreviewedFindings, validateIbmReport } from './reviewed-findings.mjs';

const scope = 'deterministic local real-component fixture; not installed Nuxeo acceptance';
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const check = (condition, message) => {
	if (!condition) throw new Error(`Invalid accessibility evidence: ${message}`);
};
const testIdentity = ({ file, group, title }) => JSON.stringify([file, group, title]);
const stateIdentity = ({ locale, theme }, surface) => JSON.stringify([locale, theme, surface]);

function validateAxeReport(report, version) {
	check(report?.testEngine?.name === 'axe-core', 'missing axe engine identity');
	check(nonempty(version) && report.testEngine.version === version, 'axe version mismatch');
	for (const category of ['violations', 'incomplete', 'passes', 'inapplicable'])
		check(
			Array.isArray(report[category]) &&
				report[category].every((entry) => nonempty(entry?.id) && Array.isArray(entry.nodes)),
			`malformed axe ${category}`,
		);
	check(
		report.violations.length + report.incomplete.length + report.passes.length > 0,
		'empty axe execution',
	);
}

function readAttachments(result) {
	check(Array.isArray(result.attachments), 'missing attachments');
	const attachments = new Map();
	for (const entry of result.attachments) {
		if (entry.contentType !== 'application/json') continue;
		check(nonempty(entry.name) && nonempty(entry.body), 'invalid JSON attachment');
		check(!attachments.has(entry.name), 'duplicate JSON attachment');
		let value;
		try {
			value = JSON.parse(Buffer.from(entry.body, 'base64').toString('utf8'));
		} catch {
			throw new Error('Invalid accessibility evidence: malformed JSON attachment');
		}
		attachments.set(entry.name, value);
	}
	return attachments;
}

function scanSummary(attachments, surface, expected, test) {
	for (const suffix of ['provenance', 'axe', 'ibm-equal-access', 'reviewed-exceptions'])
		check(attachments.has(`${surface}-${suffix}`), `missing ${surface} ${suffix}`);
	const provenance = attachments.get(`${surface}-provenance`);
	check(
		provenance?.surface === surface &&
			provenance.locale === expected.locale &&
			provenance.theme === expected.theme &&
			typeof provenance.scope === 'string' &&
			provenance.scope.startsWith('deterministic'),
		`provenance mismatch for ${surface}`,
	);
	for (const name of ['axe', 'ibmEqualAccess', 'playwright', 'browser'])
		check(nonempty(provenance[name]), `missing ${name} provenance`);
	const axe = attachments.get(`${surface}-axe`);
	const ibm = attachments.get(`${surface}-ibm-equal-access`);
	validateAxeReport(axe, provenance.axe);
	validateIbmReport(ibm);
	const raw = ibm.results.filter(
		(entry) => entry.value[0] === 'VIOLATION' && entry.value[1] === 'FAIL',
	);
	const review = ibm.results.filter(
		(entry) =>
			entry.value[1] !== 'PASS' && !(entry.value[0] === 'VIOLATION' && entry.value[1] === 'FAIL'),
	);
	check(
		provenance.manualReviewRequired?.axeIncomplete === axe.incomplete.length &&
			provenance.manualReviewRequired?.ibm === review.length,
		`manual-review count mismatch for ${surface}`,
	);
	const exceptions = attachments.get(`${surface}-reviewed-exceptions`);
	check(
		exceptions?.id === 'ngx-bootstrap-confirmation-focus-sentinels' &&
			exceptions.maximum === 2 &&
			Array.isArray(exceptions.findings),
		'invalid exception record',
	);
	const reviewed = exceptions.findings;
	const rawIdentities = new Set(raw.map(findingIdentity));
	check(rawIdentities.size === raw.length, 'duplicate IBM violation identity');
	const identities = reviewed.map(findingIdentity);
	check(
		reviewed.length <= 2 &&
			(surface === 'confirmation-dialog' || reviewed.length === 0) &&
			new Set(identities).size === identities.length &&
			identities.every((identity) => rawIdentities.has(identity)) &&
			reviewed.every(
				(entry) => entry.ruleId === 'aria_hidden_nontabbable' && entry.reasonId === 'Fail_1',
			),
		'exception outside reviewed confirmation sentinel scope',
	);
	return {
		test,
		surface,
		provenance,
		axeViolations: axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
		ibmViolations: raw.map(({ ruleId, reasonId, path }) => ({ ruleId, reasonId, path: path.dom })),
		reviewedExceptions: exceptions,
		unreviewedIbmViolations: unreviewedFindings(raw, reviewed).length,
		humanReview: {
			axe: axe.incomplete.map(({ id, nodes }) => ({ id, nodes: nodes.length })),
			ibm: [...new Set(review.map((entry) => `${entry.ruleId}:${entry.value.join('/')}`))],
		},
	};
}

// Expected rows are a reviewed matrix, not inferred from whichever tests happened to run.
// A passing aggregate count cannot substitute for an absent locale/theme/surface.
export function summarizeReport(report, expectedTests) {
	check(Array.isArray(expectedTests) && expectedTests.length > 0, 'empty expected matrix');
	const expected = new Map();
	const expectedStates = new Set();
	for (const row of expectedTests) {
		check(
			['file', 'group', 'title', 'locale', 'theme'].every((key) => nonempty(row[key])) &&
				Array.isArray(row.surfaces) &&
				row.surfaces.length > 0 &&
				row.surfaces.every(nonempty),
			'malformed expected matrix row',
		);
		const identity = testIdentity(row);
		check(!expected.has(identity), 'duplicate expected test');
		expected.set(identity, row);
		for (const surface of row.surfaces) {
			const identity = stateIdentity(row, surface);
			check(!expectedStates.has(identity), 'duplicate expected state');
			expectedStates.add(identity);
		}
	}
	check(Array.isArray(report?.errors) && report.errors.length === 0, 'report-level error');
	check(Array.isArray(report.suites), 'missing suites');
	check(
		report.stats?.expected === expected.size &&
			['skipped', 'unexpected', 'flaky'].every((key) => report.stats[key] === 0),
		'unexpected, missing, skipped or flaky tests',
	);
	const tests = [];
	const scans = [];
	const seen = new Set();
	function walk(suite, groups = []) {
		const groupNames = suite.file === suite.title ? groups : [...groups, suite.title];
		for (const child of suite.suites ?? []) walk(child, groupNames);
		for (const spec of suite.specs ?? []) {
			const identity = testIdentity({
				file: spec.file,
				group: groupNames.join(' / '),
				title: spec.title,
			});
			const row = expected.get(identity);
			check(row && !seen.has(identity), 'unexpected or duplicate test identity');
			seen.add(identity);
			check(spec.ok === true && spec.tests?.length === 1, 'failed or duplicate test project');
			const test = spec.tests[0];
			check(
				test.status === 'expected' &&
					test.expectedStatus === 'passed' &&
					test.results?.length === 1,
				'failed, skipped or retried test',
			);
			const result = test.results[0];
			check(
				result.status === 'passed' &&
					result.retry === 0 &&
					Array.isArray(result.errors) &&
					result.errors.length === 0 &&
					!result.error,
				'failed test attempt',
			);
			const attachments = readAttachments(result);
			for (const name of attachments.keys()) {
				const match = name.match(/^(.*)-(provenance|axe|ibm-equal-access|reviewed-exceptions)$/);
				check(!match || row.surfaces.includes(match[1]), 'unexpected scan attachment');
			}
			const title = `${row.file} / ${row.group} / ${row.title}`;
			tests.push({ title, status: test.status });
			for (const surface of row.surfaces) scans.push(scanSummary(attachments, surface, row, title));
		}
	}
	for (const suite of report.suites) walk(suite);
	check(seen.size === expected.size, 'missing expected test');
	check(scans.length === expectedStates.size, 'missing expected scan state');
	return {
		scope,
		tests,
		scanStates: scans.length,
		pairedScans: scans.length * 2,
		scans,
		passed: scans.every(
			(entry) => entry.axeViolations.length === 0 && entry.unreviewedIbmViolations === 0,
		),
	};
}
