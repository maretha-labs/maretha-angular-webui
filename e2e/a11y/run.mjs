import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.resolve('dist/verification/a11y');
const summaryPath = path.join(directory, 'summary.json');
fs.mkdirSync(directory, { recursive: true });
// These two files belong to this run. A startup failure or interruption must
// never leave the previous report/summary available as a passing result.
fs.rmSync(path.join(directory, 'playwright.json'), { force: true });
fs.writeFileSync(
	summaryPath,
	JSON.stringify(
		{ passed: false, evidenceError: 'Accessibility run has not completed.' },
		null,
		2,
	) + '\n',
);

const browser = spawnSync(
	process.execPath,
	[
		path.resolve('node_modules/@playwright/test/cli.js'),
		'test',
		'-c',
		'e2e/playwright.a11y.config.ts',
		...process.argv.slice(2),
	],
	{ stdio: 'inherit' },
);
// Always attempt the summary, including browser startup/assertion failures.
const summarizer = spawnSync(
	process.execPath,
	[fileURLToPath(new URL('./summarize.mjs', import.meta.url))],
	{ stdio: 'inherit' },
);
let summary;
try {
	summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
} catch {
	summary = { passed: false, evidenceError: 'Accessibility summary could not be read.' };
}
summary.passed = summary.passed === true && browser.status === 0 && summarizer.status === 0;
summary.execution = {
	browserExitCode: browser.status,
	browserSignal: browser.signal,
	summaryExitCode: summarizer.status,
	summarySignal: summarizer.signal,
};
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
console.log(
	JSON.stringify({
		passed: summary.passed,
		...summary.execution,
		summary: 'dist/verification/a11y/summary.json',
	}),
);
process.exitCode =
	browser.status !== 0
		? browser.status || 1
		: summarizer.status !== 0
			? summarizer.status || 1
			: summary.passed
				? 0
				: 1;
