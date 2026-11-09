import fs from 'node:fs';
import path from 'node:path';
import { expectedTests } from './expected-matrix.mjs';
import { summarizeReport } from './report-summary.mjs';

const directory = path.resolve('dist/verification/a11y');
let summary;
try {
	const report = JSON.parse(fs.readFileSync(path.join(directory, 'playwright.json'), 'utf8'));
	summary = summarizeReport(report, expectedTests);
} catch (error) {
	// Failures still replace any older passing summary. Never publish a stale pass.
	summary = {
		passed: false,
		scope: 'deterministic local real-component fixture; not installed Nuxeo acceptance',
		evidenceError:
			error instanceof Error && error.message.startsWith('Invalid accessibility evidence:')
				? error.message
				: 'Accessibility report is missing, unreadable or malformed.',
	};
}
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(
	JSON.stringify({
		passed: summary.passed,
		tests: summary.tests?.length,
		scanStates: summary.scanStates,
		pairedScans: summary.pairedScans,
		evidenceError: summary.evidenceError,
		summary: 'dist/verification/a11y/summary.json',
	}),
);
if (!summary.passed) process.exitCode = 1;
