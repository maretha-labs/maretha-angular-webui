#!/usr/bin/env node
// Runs the checks of one verification mode in order, stops at the first failure, prints the
// failing command and writes dist/verification/verify-report.json. It repairs nothing: a stale
// core.manifest.json is a finding here, never regenerated.
//
//   npm run verify             customization: core untouched; custom/ lints, compiles and passes its specs
//   npm run verify:upstream    upstream: every check the public CI runs
//   npm run verify:release     release: upstream, plus the built archives' notices and the release files
//   node scripts/verify.mjs --list [--upstream|--release]   prints a mode's checks
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPORT = 'dist/verification/verify-report.json';
export const WORKFLOW = '.github/workflows/ci.yml';
export const MODES = Object.freeze(['customization', 'upstream', 'release']);
const ALL = MODES;
const UPSTREAM = Object.freeze(['upstream', 'release']);

/**
 * Every check, in run order. `modes` lists the modes that run it; `command` is the step exactly
 * as .github/workflows/ci.yml runs it (verify.test.mjs keeps the two lists equal); `skip()`
 * returns why a check cannot run here, recorded as not-run. The core manifest is the first
 * customization check (a core edit is the usual failure) and the last upstream check (core may
 * change; the manifest is regenerated as the last step).
 */
export const CHECKS = Object.freeze([
	{ id: 'core-manifest', command: 'npm run verify:core-manifest', modes: ['customization'] },
	{ id: 'lint', command: 'npm run lint', modes: ALL },
	{ id: 'format', command: 'npm run format:check', modes: ALL },
	{ id: 'typecheck', command: 'npm run typecheck', modes: ALL },
	{ id: 'test-apps', command: 'npm run verify:test-apps', modes: UPSTREAM },
	{
		id: 'projection-template',
		command: 'npm run verify:results-projection-template-context',
		modes: UPSTREAM,
	},
	{ id: 'i18n', command: 'npm run verify:i18n', modes: UPSTREAM },
	{ id: 'i18n-guards', command: 'npm run verify:i18n-guards', modes: UPSTREAM },
	{ id: 'coverage-guards', command: 'npm run verify:coverage-guard', modes: UPSTREAM },
	{ id: 'custom-guards', command: 'npm run verify:custom-guards', modes: ALL },
	{
		id: 'contribution-gate',
		command:
			'node --test .github/contribution-gate/gate.test.mjs .github/contribution-gate/run.test.mjs',
		modes: UPSTREAM,
	},
	{ id: 'custom-scaffold', command: 'npm run verify:custom-scaffold', modes: UPSTREAM },
	{ id: 'examples', command: 'npm run verify:examples', modes: UPSTREAM },
	{ id: 'polymer-parity', command: 'npm run verify:polymer-parity', modes: UPSTREAM },
	{ id: 'slot-catalog', command: 'npm run verify:slot-catalog', modes: ALL },
	{ id: 'public-tree', command: 'npm run verify:public-tree', modes: UPSTREAM },
	{ id: 'nuxeo-package', command: 'npm run verify:nuxeo-package', modes: UPSTREAM },
	{ id: 'unit-tests', command: 'npm run test:ci', modes: ['customization'] },
	{ id: 'coverage', command: 'npm run test:coverage', modes: UPSTREAM },
	{ id: 'coverage-ratchet', command: 'npm run verify:coverage', modes: UPSTREAM },
	{ id: 'transfer', command: 'npm run verify:transfer-check-failures', modes: UPSTREAM },
	{ id: 'build', command: 'npm run build:prod', modes: UPSTREAM },
	{
		id: 'package-ui-only',
		command: 'node scripts/nuxeo-package.mjs --no-build --ui-only',
		modes: UPSTREAM,
	},
	{
		id: 'licences',
		command: 'npm run verify:licenses -- --dist dist/maretha-angular-webui',
		modes: UPSTREAM,
	},
	{ id: 'pack-sdk', command: 'npm run pack:sdk', modes: UPSTREAM },
	{ id: 'release-identity', command: 'npm run verify:release-identity', modes: UPSTREAM },
	{ id: 'sdk-api', command: 'npm run verify:sdk-api', modes: UPSTREAM },
	{ id: 'sdk-ids', command: 'npm run verify:sdk-ids', modes: UPSTREAM },
	{ id: 'sdk-consumer', command: 'npm run verify:sdk-consumer', modes: UPSTREAM },
	{ id: 'sdk-upgrade', command: 'npm run verify:sdk-upgrade', modes: UPSTREAM },
	{
		id: 'compiled-search-typecheck',
		command: 'npx tsc --noEmit -p e2e/compiled-search/tsconfig.json',
		modes: UPSTREAM,
	},
	{ id: 'compiled-search', command: 'npm run test:e2e:compiled-search', modes: UPSTREAM },
	{
		id: 'compiled-search-guards',
		command: 'node --test scripts/verify-compiled-search-production.test.mjs',
		modes: UPSTREAM,
	},
	{
		id: 'compiled-search-production',
		command: 'npm run verify:compiled-search-production',
		modes: UPSTREAM,
	},
	{ id: 'pseudo-locale', command: 'node scripts/i18n/pseudo.mjs', modes: UPSTREAM },
	{ id: 'e2e-typecheck', command: 'npx tsc --noEmit -p e2e/tsconfig.json', modes: UPSTREAM },
	{ id: 'a11y-guards', command: 'npm run verify:a11y-guards', modes: UPSTREAM },
	{ id: 'a11y', command: 'npm run test:a11y', modes: UPSTREAM },
	{
		id: 'theme-comparison',
		command: 'node e2e/a11y/theme-comparison.mjs',
		modes: UPSTREAM,
		skip: () =>
			process.env.THEME_COMPARISON_BASE_SHA
				? undefined
				: 'needs THEME_COMPARISON_BASE_SHA, the pull request base commit; CI sets it',
	},
	{ id: 'i18n-browser', command: 'npm run test:i18n', modes: UPSTREAM },
	{ id: 'core-manifest', command: 'npm run verify:core-manifest', modes: UPSTREAM },
	{ id: 'release-artifacts', command: 'npm run verify:release-artifacts', modes: ['release'] },
	{ id: 'release-files', command: 'npm run release:files', modes: ['release'] },
]);

/** The checks of a mode, in run order. */
export const checksFor = (mode) => CHECKS.filter((check) => check.modes.includes(mode));

/**
 * The `run:` commands of each job of a GitHub workflow, with whether the job runs on GitHub's
 * `ubuntu-latest` (public CI) or only on a dedicated runner. `run: |` blocks yield one
 * command per line.
 */
export function workflowCommands(text) {
	const jobs = [];
	let job;
	let block;
	let inJobs = false;
	for (const line of text.split('\n')) {
		if (block) {
			if (line.trim() === '' || line.search(/\S/) > block.indent) {
				if (line.trim()) job.commands.push(line.trim());
				continue;
			}
			block = undefined;
		}
		if (/^jobs:\s*$/.test(line)) {
			inJobs = true;
			continue;
		}
		if (!inJobs) continue;
		const heading = /^ {2}([\w-]+):\s*$/.exec(line);
		if (heading) {
			job = { job: heading[1], public: false, commands: [] };
			jobs.push(job);
			continue;
		}
		if (!job) continue;
		const runsOn = /^ {4}runs-on:\s*(.+)$/.exec(line);
		if (runsOn) job.public = runsOn[1].includes('ubuntu-latest');
		const run = /^(\s+)(?:- )?run:\s*(.*)$/.exec(line);
		if (!run) continue;
		if (run[2] === '|' || run[2] === '>' || run[2] === '')
			block = { indent: run[1].length + (line.includes('- run:') ? 1 : -1) };
		else job.commands.push(run[2].trim());
	}
	return jobs;
}

/** The commit, whether the tree differs from it and a hash of the commit plus every difference. */
export function treeState(cwd = root) {
	const git = (args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	const commit = git(['rev-parse', 'HEAD']);
	const hash = createHash('sha256').update(commit);
	const tokens = git(['status', '--porcelain=v1', '-z', '--untracked-files=all']).split('\0');
	let dirty = false;
	for (let i = 0; i < tokens.length; i++) {
		const entry = tokens[i];
		if (!entry) continue;
		dirty = true;
		hash.update(`\n${entry}`);
		if (/^[RC]/.test(entry)) hash.update(`\n${tokens[++i]}`);
		const file = path.join(cwd, entry.slice(3));
		if (existsSync(file) && statSync(file).isFile()) hash.update(readFileSync(file));
	}
	return { commit, dirty, fingerprint: hash.digest('hex') };
}

const version = (file) =>
	existsSync(path.join(root, file))
		? JSON.parse(readFileSync(path.join(root, file), 'utf8')).version
		: null;

const execute = (command, cwd) => {
	const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
	return result.status ?? 1;
};

/**
 * Runs `checks` in order and returns one entry per check: pass, fail, or not-run with the
 * reason (skipped here, or after an earlier failure). Nothing runs after a failure.
 */
export function runChecks(checks, { cwd = root, run = execute, log = console.log } = {}) {
	const results = [];
	let failed;
	checks.forEach((check, index) => {
		const entry = { id: check.id, command: check.command };
		if (failed) {
			results.push({ ...entry, status: 'not-run', reason: `not run after ${failed} failed` });
			return;
		}
		const reason = check.skip?.();
		if (reason) {
			log(`\n– [${index + 1}/${checks.length}] ${check.id} not run: ${reason}`);
			results.push({ ...entry, status: 'not-run', reason });
			return;
		}
		log(`\n▶ [${index + 1}/${checks.length}] ${check.id}: ${check.command}`);
		const started = Date.now();
		const exitCode = run(check.command, cwd);
		const durationMs = Date.now() - started;
		if (exitCode === 0) results.push({ ...entry, status: 'pass', durationMs });
		else {
			results.push({ ...entry, status: 'fail', exitCode, durationMs });
			failed = check.id;
		}
	});
	return results;
}

export function verify(mode, options = {}) {
	const startedAt = new Date().toISOString();
	const checks = runChecks(checksFor(mode), options);
	const report = {
		mode,
		startedAt,
		finishedAt: new Date().toISOString(),
		node: process.version,
		versions: {
			app: version('package.json'),
			sdk: version('app/extensions/package.json'),
			manifest: version('core.manifest.json'),
		},
		tree: treeState(options.cwd ?? root),
		checks,
	};
	const target = path.join(options.cwd ?? root, REPORT);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
	return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const argv = process.argv.slice(2);
	const mode = argv.includes('--release')
		? 'release'
		: argv.includes('--upstream')
			? 'upstream'
			: 'customization';
	if (argv.includes('--list')) {
		for (const check of checksFor(mode)) console.log(`${check.id}\t${check.command}`);
	} else {
		const report = verify(mode);
		const count = (status) => report.checks.filter((check) => check.status === status).length;
		const failed = report.checks.find((check) => check.status === 'fail');
		console.log('');
		if (failed) {
			console.error(
				`✖ verify (${mode}): ${failed.id} failed (exit code ${failed.exitCode}): ${failed.command}\n  ${count('pass')} passed before it, ${count('not-run')} not run. Report: ${REPORT}`,
			);
			process.exitCode = 1;
		} else
			console.log(
				`✔ verify (${mode}): ${count('pass')} passed, ${count('not-run')} not run. Report: ${REPORT}`,
			);
	}
}
