#!/usr/bin/env node
// Verifies examples/acme the way a release is received: a fresh worktree of HEAD (tracked
// core and the committed manifest only) gets its custom/ replaced by examples/acme/custom. The
// example must then cover every slot and layout mode with a file and a spec, name only existing
// default ids, lint as custom/, compile with strict templates, pass its specs and leave every core
// file untouched. `--prove-failures` plants a missing spec, a template error and a write outside
// custom/, each of which must fail. `--keep` leaves the worktree for diagnosis.
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { compareManifest, MANIFEST } from './core-manifest.mjs';
import { SLOTS } from './custom/new-contribution.mjs';
import { MODES } from './custom/new-layout.mjs';
import { kebab, ownerPrefix } from './custom/scaffold.mjs';

export const EXAMPLE = 'examples/acme/custom';
export const CATALOG = 'agent-guides/02-slot-catalog.md';
export const REPORT = 'dist/verification/examples.json';
/** Written into the worktree's ignored out-tsc/ so the worktree stays exactly HEAD plus custom/. */
export const KARMA_CONFIG = 'out-tsc/examples/karma.conf.js';
export const KARMA_CONFIG_TEXT = `// Written by scripts/verify-examples.mjs: the example's specs run once, headless, on their own port.
const original = require('../../karma.conf');

module.exports = (config) => {
	original({
		set: (settings) =>
			config.set({
				...settings,
				port: 9889,
				autoWatch: false,
				singleRun: true,
				browsers: ['ChromeHeadless'],
				reporters: ['progress'],
				client: { ...settings.client, clearContext: true },
			}),
	});
};
`;
const MARKERS = ['// <custom:imports>', '// <custom:contributions>', '// <custom:layouts>'];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const posix = (file) => file.split(path.sep).join('/');
export const listFiles = (directory) =>
	existsSync(directory)
		? readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
				entry.isDirectory()
					? listFiles(path.join(directory, entry.name))
					: [path.join(directory, entry.name)],
			)
		: [];
const isSpec = (file) => file.endsWith('.spec.ts');
const specOf = (file) => file.replace(/\.ts$/, '.spec.ts');
/** Source files that need a spec: components, themes and projections; not data or the entry. */
const needsSpec = (file) =>
	file.endsWith('.ts') &&
	!isSpec(file) &&
	!file.endsWith('.fields.ts') &&
	path.basename(file) !== 'index.ts';

/**
 * What the example at `zone` (a custom/ directory) fails to cover: a slot without an
 * implementation file in `contributions/<slot>/`, a layout mode without a `layouts/<Type>/` file,
 * an implementation without its spec, a missing marker in index.ts or an invalid owner prefix.
 */
export function coverageGaps(zone, { slots = Object.keys(SLOTS), modes = MODES } = {}) {
	const gaps = [];
	try {
		ownerPrefix(path.dirname(zone));
	} catch (error) {
		gaps.push(error.message);
	}
	const index = path.join(zone, 'index.ts');
	const text = existsSync(index) ? readFileSync(index, 'utf8') : '';
	for (const marker of MARKERS)
		if (!text.includes(marker)) gaps.push(`index.ts is missing its ${marker} marker`);
	const files = listFiles(zone).map((file) => posix(path.relative(zone, file)));
	const implementations = files.filter(needsSpec);
	for (const slot of slots) {
		const directory = `contributions/${kebab(slot)}/`;
		if (!implementations.some((file) => file.startsWith(directory)))
			gaps.push(`${slot}: no contribution under ${directory}`);
	}
	for (const mode of modes)
		if (
			!implementations.some(
				(file) => /^layouts\/[^/]+\/[^/]+\./.test(file) && file.endsWith(`.${mode}.layout.ts`),
			)
		)
			gaps.push(`layout mode ${mode}: no layouts/<Type>/<type>.${mode}.layout.ts`);
	for (const file of implementations)
		if (!files.includes(specOf(file))) gaps.push(`${file}: no ${path.basename(specOf(file))}`);
	return gaps;
}

/** Default (`maretha.*`) ids that index.ts names and the slot catalog does not list. */
export function unknownDefaultIds(indexText, catalogText) {
	const named = new Set([...indexText.matchAll(/'(maretha\.[a-z0-9.-]+)'/g)].map((m) => m[1]));
	return [...named].filter((id) => !catalogText.includes(`\`${id}\``)).sort();
}

/** The locked files that differ from the worktree's committed manifest, as `kind: file` lines. */
export function manifestDrift(worktree) {
	const manifest = JSON.parse(readFileSync(path.join(worktree, MANIFEST), 'utf8'));
	return Object.entries(compareManifest(worktree, manifest)).flatMap(([kind, files]) =>
		files.map((file) => `${kind}: ${file}`),
	);
}

function createWorktree() {
	const worktree = mkdtempSync(path.join(tmpdir(), 'maretha-examples-'));
	execFileSync('git', ['worktree', 'add', '--detach', '-q', worktree, 'HEAD'], {
		cwd: root,
		stdio: 'inherit',
	});
	symlinkSync(
		path.join(root, 'node_modules'),
		path.join(worktree, 'node_modules'),
		process.platform === 'win32' ? 'junction' : 'dir',
	);
	rmSync(path.join(worktree, 'custom'), { recursive: true, force: true });
	cpSync(path.join(root, EXAMPLE), path.join(worktree, 'custom'), { recursive: true });
	return worktree;
}

function removeWorktree(worktree) {
	spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
	rmSync(worktree, { recursive: true, force: true });
}

async function lint(worktree) {
	const eslint = new ESLint({ cwd: worktree });
	const results = await eslint.lintFiles(['custom/**/*.ts']);
	const failed = results.some((result) => result.errorCount || result.warningCount);
	if (failed) console.error((await eslint.loadFormatter('stylish')).format(results));
	return !failed;
}

function compiles(worktree, quiet = false) {
	const files = listFiles(path.join(worktree, 'custom')).filter((file) => file.endsWith('.ts'));
	const project = path.join(worktree, 'out-tsc', 'examples');
	mkdirSync(project, { recursive: true });
	writeFileSync(
		path.join(project, 'tsconfig.json'),
		JSON.stringify({
			extends: '../../tsconfig.json',
			compilerOptions: { noEmit: true, types: ['jasmine'] },
			files: files.map((file) => posix(path.relative(project, file))),
		}),
	);
	const compiler = path.join(
		path.dirname(require.resolve('@angular/compiler-cli/package.json')),
		require('@angular/compiler-cli/package.json').bin.ngc,
	);
	const result = spawnSync(
		process.execPath,
		[compiler, '-p', path.join(project, 'tsconfig.json')],
		{
			stdio: quiet ? 'pipe' : 'inherit',
		},
	);
	return result.status === 0;
}

function specsPass(worktree) {
	const ng = require.resolve('@angular/cli/bin/ng.js');
	mkdirSync(path.join(worktree, path.dirname(KARMA_CONFIG)), { recursive: true });
	writeFileSync(path.join(worktree, KARMA_CONFIG), KARMA_CONFIG_TEXT);
	const result = spawnSync(
		process.execPath,
		[
			ng,
			'test',
			'--watch=false',
			'--progress=false',
			'--browsers=ChromeHeadless',
			`--karma-config=${KARMA_CONFIG}`,
			'--include=custom/**/*.spec.ts',
		],
		{ cwd: worktree, stdio: 'inherit', env: { ...process.env, NG_CLI_ANALYTICS: 'false' } },
	);
	return result.status === 0;
}

function proveFailures(worktree) {
	const zone = path.join(worktree, 'custom');
	// A deleted spec is a coverage gap.
	const spec = listFiles(zone).find((file) => isSpec(file) && file.includes('/contributions/'));
	const specText = readFileSync(spec, 'utf8');
	unlinkSync(spec);
	const missingSpecFails = coverageGaps(zone).some((gap) => gap.endsWith(path.basename(spec)));
	writeFileSync(spec, specText);
	// A template that names a missing member fails the strict compilation.
	const view = listFiles(zone).find((file) => file.endsWith('.view.layout.ts'));
	const viewText = readFileSync(view, 'utf8');
	writeFileSync(view, viewText.replace('documentId()', 'missingMember()'));
	const templateFails = !compiles(worktree, true);
	writeFileSync(view, viewText);
	// A file written outside custom/ is reported by the manifest check.
	const escape = path.join(worktree, 'app', 'acme-escape.ts');
	writeFileSync(escape, 'export const escaped = true;\n');
	const escapeFails = manifestDrift(worktree).includes('added: app/acme-escape.ts');
	unlinkSync(escape);
	return { missingSpecFails, templateFails, escapeFails };
}

async function main(argv) {
	const keep = argv.includes('--keep');
	const prove = argv.includes('--prove-failures');
	const example = path.join(root, EXAMPLE);
	if (!existsSync(path.join(example, 'owner.json'))) throw new Error(`${EXAMPLE} is missing.`);
	const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
	const checks = {};
	const fail = (check, lines) => {
		checks[check] = 'fail';
		throw new Error(`${check}:\n${lines.map((line) => `  ${line}`).join('\n')}`);
	};
	const pass = (check) => {
		checks[check] = 'pass';
		console.log(`✔ ${check}`);
	};

	const gaps = coverageGaps(example);
	if (gaps.length) fail('coverage', gaps);
	pass(
		`coverage: ${Object.keys(SLOTS).length} slots and ${MODES.length} layout modes, a spec per implementation`,
	);
	const unknown = unknownDefaultIds(
		readFileSync(path.join(example, 'index.ts'), 'utf8'),
		readFileSync(path.join(root, CATALOG), 'utf8'),
	);
	if (unknown.length)
		fail(
			'default ids',
			unknown.map((id) => `${id} is not in ${CATALOG}`),
		);
	pass('default ids: every maretha.* id in index.ts is in the slot catalog');

	const worktree = createWorktree();
	console.log(`Worktree of ${commit.slice(0, 8)} with ${EXAMPLE} as custom/: ${worktree}`);
	if (!keep) process.on('exit', () => removeWorktree(worktree));
	try {
		if (!(await lint(worktree))) fail('lint', ['custom/ lint findings above']);
		pass('lint as custom/');
		if (!compiles(worktree)) fail('compile', ['Angular compiler errors above']);
		pass('strict template compilation');
		let drift = manifestDrift(worktree);
		if (drift.length) fail('core manifest', drift);
		if (!specsPass(worktree)) fail('specs', ['Karma failures above']);
		pass('specs');
		drift = manifestDrift(worktree);
		if (drift.length) fail('core manifest', drift);
		pass(`core manifest: only custom/ differs from ${MANIFEST}`);
		let proved;
		if (prove) {
			proved = proveFailures(worktree);
			const unproved = Object.entries(proved)
				.filter(([, failed]) => !failed)
				.map(([name]) => name);
			if (unproved.length)
				fail(
					'planted defects',
					unproved.map((name) => `${name} passed`),
				);
			pass('planted defects: a missing spec, a template error and a write outside custom/ fail');
		}
		mkdirSync(path.join(root, path.dirname(REPORT)), { recursive: true });
		writeFileSync(
			path.join(root, REPORT),
			`${JSON.stringify(
				{
					commit,
					example: EXAMPLE,
					slots: Object.keys(SLOTS).length,
					layoutModes: MODES.length,
					files: listFiles(example).length,
					specs: listFiles(example).filter(isSpec).length,
					checks,
					plantedDefects: proved ?? null,
				},
				null,
				2,
			)}\n`,
		);
		console.log(`Report: ${REPORT}`);
	} catch (error) {
		if (
			checks['core manifest'] === 'fail' &&
			!readFileSync(path.join(root, MANIFEST), 'utf8').includes('"version"')
		)
			console.error('');
		console.error(
			`✖ verify:examples failed at ${error.message}\n  A core manifest failure here means the example wrote outside custom/, or the committed ${MANIFEST} is stale for HEAD (an upstream change regenerates it last).`,
		);
		process.exitCode = 1;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
