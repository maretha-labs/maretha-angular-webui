import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import coverage from 'istanbul-lib-coverage';
import ts from 'typescript';

export const metrics = ['statements', 'branches', 'functions', 'lines'];
const baselinePath = 'contracts/coverage-baseline.json';
const slash = (value) => value.replaceAll('\\', '/');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const hashFile = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function collectInputs(root) {
	const walk = (directory) =>
		readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
			const name = `${directory}/${entry.name}`;
			return entry.isDirectory() ? walk(name) : /\.(ts|html|scss|json)$/.test(name) ? [name] : [];
		});
	const files = [
		...walk('app'),
		'main.ts',
		'polyfills.ts',
		'test.ts',
		'angular.json',
		'karma.conf.js',
		'tsconfig.json',
		'tsconfig.app.json',
		'tsconfig.spec.json',
		'package-lock.json',
	]
		.filter((name) => existsSync(resolve(root, name)))
		.sort();
	return Object.fromEntries(files.map((name) => [name, hashFile(resolve(root, name))]));
}

function sourceFiles(root, directory = 'app') {
	return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const name = `${directory}/${entry.name}`;
		if (entry.isDirectory()) return name === 'app/testing' ? [] : sourceFiles(root, name);
		return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [name] : [];
	});
}

function executable(source, name) {
	if (name.endsWith('.d.ts')) return '';
	const output = ts.transpileModule(source, {
		fileName: name,
		compilerOptions: {
			target: ts.ScriptTarget.ES2022,
			module: ts.ModuleKind.ES2022,
			removeComments: true,
		},
	}).outputText;
	return output.replace(/export\s*\{\s*\}\s*;?/g, '').trim();
}

export function measure(root, raw, reportTime = Infinity) {
	const map = coverage.createCoverageMap(raw);
	const inventory = [...sourceFiles(root), 'main.ts', 'polyfills.ts'].sort();
	const measured = coverage.createCoverageMap({});
	const byPath = new Map(
		map.files().map((path) => [slash(relative(root, resolve(root, path))), path]),
	);
	const files = {};
	const excluded = [];
	const declarations = [];
	const linkage = [];
	const configPath = resolve(root, 'tsconfig.json');
	const compiler = existsSync(configPath)
		? ts.parseJsonConfigFileContent(
				ts.readConfigFile(configPath, ts.sys.readFile).config,
				ts.sys,
				root,
			).options
		: { baseUrl: root };
	for (const name of inventory) {
		const path = resolve(root, name);
		const source = readFileSync(path, 'utf8');
		for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
			const target = ts.resolveModuleName(imported.fileName, path, compiler, ts.sys).resolvedModule
				?.resolvedFileName;
			const resolved = target && slash(relative(root, target));
			if (resolved && (resolved.startsWith('app/testing/') || resolved.endsWith('.spec.ts')))
				throw new Error(`${name}: production code imports excluded test source ${resolved}.`);
		}
		if (/\b(?:istanbul|c8)\s+ignore\b|coverage\s+ignore/.test(source))
			throw new Error(`${name}: coverage-ignore directives must not hide runtime code.`);
		if (statSync(path).mtimeMs > reportTime + 1000)
			throw new Error(
				`${name}: source changed after coverage collection. Run test:coverage again.`,
			);
		const lines = source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
		const entry = { path: name, lines, sha256: createHash('sha256').update(source).digest('hex') };
		const emitted = executable(source, name);
		if (!emitted) {
			declarations.push(entry);
			continue;
		}
		// Re-export-only barrels have linkage but no independently instrumentable statements.
		// Their targets remain in the ordinary source inventory; any executable addition fails this test.
		const parsed = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
		if (parsed.statements.length && parsed.statements.every(ts.isExportDeclaration)) {
			linkage.push(entry);
			continue;
		}
		const key = byPath.get(name);
		if (!key) {
			excluded.push({
				...entry,
				executableSha256: createHash('sha256').update(emitted).digest('hex'),
			});
			continue;
		}
		const file = map.fileCoverageFor(key);
		measured.addFileCoverage(file);
		files[name] = {
			...entry,
			metrics: file.toSummary().toJSON(),
			uncoveredLines: Object.entries(file.getLineCoverage())
				.filter(([, count]) => count === 0)
				.map(([line]) => Number(line)),
		};
	}
	if (!Object.keys(files).length)
		throw new Error('No runtime files were measured. Coverage cannot pass.');
	return {
		version: 1,
		scope:
			'Executable app/**/*.ts, main.ts and polyfills.ts; tests and app/testing excluded by scope.',
		metrics: measured.getCoverageSummary().toJSON(),
		files,
		excluded,
		excludedPhysicalLines: excluded.reduce((sum, entry) => sum + entry.lines, 0),
		declarations,
		linkage,
		linkagePhysicalLines: linkage.reduce((sum, entry) => sum + entry.lines, 0),
	};
}

export function floorFor(report) {
	const percentages = (value) =>
		Object.fromEntries(
			metrics.map((name) => [
				name,
				value[name].total === 0 ? 100 : (100 * value[name].covered) / value[name].total,
			]),
		);
	return {
		version: 1,
		minimum: percentages(report.metrics),
		files: Object.fromEntries(
			Object.entries(report.files).map(([path, file]) => [path, percentages(file.metrics)]),
		),
		excluded: Object.fromEntries(
			report.excluded.map((file) => [
				file.path,
				{ lines: file.lines, sha256: file.executableSha256 },
			]),
		),
	};
}

export function compare(current, baseline, presentPaths) {
	const errors = [];
	if (baseline.version !== 1 || !baseline.minimum || !baseline.files || !baseline.excluded)
		return ['Coverage baseline has an invalid schema.'];
	const check = (actual, expected, label) => {
		for (const name of metrics) {
			if (!Number.isFinite(expected[name]) || expected[name] < 0 || expected[name] > 100)
				errors.push(`${label}: invalid ${name} floor.`);
			else if (!Number.isFinite(actual[name]) || actual[name] < expected[name])
				errors.push(`${label}: ${name} ${actual[name]}% is below ${expected[name]}%.`);
		}
	};
	check(current.minimum, baseline.minimum, 'Overall');
	for (const [path, expected] of Object.entries(baseline.files)) {
		if (!presentPaths.has(path)) continue;
		if (!current.files[path])
			errors.push(`${path}: previously measured source disappeared from coverage.`);
		else check(current.files[path], expected, path);
	}
	for (const [path, { lines, sha256 }] of Object.entries(current.excluded)) {
		const before = baseline.excluded[path];
		if (!Number.isInteger(before?.lines) || lines > before.lines)
			errors.push(
				`${path}: ${lines} uninstrumented physical lines exceed the reviewed exclusion inventory.`,
			);
		else if (!sha256 || sha256 !== before.sha256)
			errors.push(
				`${path}: uninstrumented executable content changed; add coverage before changing it.`,
			);
	}
	return errors;
}

function markdown(report) {
	const percent = (item) => `${item.pct}% (${item.covered}/${item.total})`;
	return [
		'# Runtime coverage',
		'',
		'Percentages describe instrumented executable TypeScript; HTML templates, styles and assets are outside these percentages. Uninstrumented physical source lines are shown beside every percentage; they are not silently counted as covered. Type-only declarations are listed separately in coverage.json. Tests and app/testing are outside this runtime scope.',
		'',
		'| Metric | Covered / eligible | Excluded physical source lines |',
		'| --- | --- | --- |',
		...metrics.map(
			(name) =>
				`| ${name} | ${percent(report.metrics[name])} | ${report.excludedPhysicalLines} (inventory below) |`,
		),
		'',
		'| Source | Statements | Branches | Functions | Lines | Excluded physical lines |',
		'| --- | --- | --- | --- | --- | --- |',
		...Object.entries(report.files).map(
			([path, file]) =>
				`| ${path} | ${metrics.map((name) => percent(file.metrics[name])).join(' | ')} | 0 |`,
		),
		...report.excluded.map(
			(file) =>
				`| ${file.path} | not instrumented | not instrumented | not instrumented | not instrumented | 1–${file.lines} (${file.lines}) |`,
		),
		'',
		'Uncovered executable line numbers for every measured file are included in coverage.json.',
		'',
		`Pure re-export linkage: ${report.linkagePhysicalLines} physical lines (separately hashed in coverage.json). These files have no independently instrumentable statements; their exported implementations remain in the runtime inventory.`,
		...report.linkage.map(
			(file) => `- ${file.path}: ${file.lines} linkage lines; SHA-256 ${file.sha256}`,
		),
		'',
		...(report.errors.length
			? ['## Ratchet failures', '', ...report.errors.map((error) => `- ${error}`), '']
			: ['Ratchet passed.', '']),
	].join('\n');
}

export function verify(root, args = []) {
	const allowed = new Set(['--update']);
	if (args.some((arg) => !allowed.has(arg)))
		throw new Error('Usage: node scripts/verify-coverage.mjs [--update]');
	const angular = readJson(resolve(root, 'angular.json'));
	const options = angular.projects['maretha-angular-webui'].architect.test;
	if (
		[options.options, ...Object.values(options.configurations ?? {})].some(
			(config) => config?.codeCoverageExclude?.length,
		)
	)
		throw new Error(
			'codeCoverageExclude must stay empty; uninstrumented source is explicitly inventoried.',
		);
	const input = resolve(root, 'coverage/maretha-angular-webui/coverage-final.json');
	const snapshotFile = resolve(root, 'coverage/maretha-angular-webui/source-snapshot.json');
	if (!existsSync(snapshotFile))
		throw new Error('Missing coverage source snapshot. Run test:coverage again.');
	const snapshot = readJson(snapshotFile);
	if (
		snapshot.version !== 1 ||
		snapshot.coverageSha256 !== hashFile(input) ||
		JSON.stringify(snapshot.inputs) !== JSON.stringify(collectInputs(root))
	)
		throw new Error('Coverage data or source changed since collection. Run test:coverage again.');
	const report = measure(root, readJson(input), statSync(input).mtimeMs);
	const current = floorFor(report);
	const present = new Set([
		...Object.keys(report.files),
		...report.excluded.map((file) => file.path),
	]);
	const baselineFile = resolve(root, baselinePath);
	const baseline = existsSync(baselineFile) ? readJson(baselineFile) : null;
	const errors = baseline
		? compare(current, baseline, present)
		: args.includes('--update')
			? []
			: [
					'Missing coverage baseline; collect coverage and explicitly run update:coverage-baseline.',
				];
	const base = process.env.COVERAGE_BASE_REF;
	if (base) {
		if (!/^[a-f0-9]{40}$/.test(base))
			throw new Error('COVERAGE_BASE_REF must be an exact Git commit SHA.');
		const listing = spawnSync('git', ['ls-tree', '--name-only', base, '--', baselinePath], {
			cwd: root,
			encoding: 'utf8',
		});
		if (listing.status !== 0)
			throw new Error('Cannot inspect the base commit coverage baseline. Fetch the base commit.');
		if (listing.stdout.trim()) {
			const previous = spawnSync('git', ['show', `${base}:${baselinePath}`], {
				cwd: root,
				encoding: 'utf8',
			});
			if (previous.status !== 0 || !baseline)
				throw new Error('Cannot read the required base coverage baseline.');
			errors.push(
				...compare(baseline, JSON.parse(previous.stdout), present).map(
					(error) => `Baseline lowered: ${error}`,
				),
			);
		}
	}
	if (args.includes('--update') && !errors.length) {
		mkdirSync(dirname(baselineFile), { recursive: true });
		writeFileSync(baselineFile, JSON.stringify(current, null, 2) + '\n');
	}
	report.errors = errors;
	const output = resolve(root, 'dist/verification');
	mkdirSync(output, { recursive: true });
	writeFileSync(resolve(output, 'coverage.json'), JSON.stringify(report, null, 2) + '\n');
	writeFileSync(resolve(output, 'coverage.md'), markdown(report));
	console.log(
		metrics
			.map(
				(name) =>
					`${name}: ${report.metrics[name].pct}% (${report.excludedPhysicalLines} uninstrumented physical lines excluded)`,
			)
			.join('\n'),
	);
	if (errors.length) throw new Error(errors.join('\n'));
	console.log(
		'Coverage ratchet passed; full source/exclusion inventory: dist/verification/coverage.md',
	);
	return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		verify(process.cwd(), process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}
