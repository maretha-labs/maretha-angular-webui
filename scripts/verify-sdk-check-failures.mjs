import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { candidateArchive, root, run, writeReport } from './sdk-consumer.mjs';

const { values } = parseArgs({
	options: {
		archive: { type: 'string' },
		report: { type: 'string', default: join(root, 'dist/verification/sdk-negative-checks.json') },
	},
});
const directory = await mkdtemp(join(tmpdir(), 'maretha-sdk-negative-'));
const archive = resolve(values.archive ?? (await candidateArchive()));
const checks = [];

function execute(args) {
	const result = spawnSync(process.execPath, args, {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

async function expectFailure(name, args, symptom) {
	console.log(`Demonstrating ${name} failure...`);
	const result = execute(args);
	const log = resolve(values.report, '..', `${name}-intentional-failure.log`);
	await mkdir(resolve(log, '..'), { recursive: true });
	await writeFile(log, result.output);
	if (result.status === 0 || result.signal || !symptom.test(result.output))
		throw new Error(`${name} did not fail for the intended reason. Inspect ${log}`);
	checks.push({ name, exitCode: result.status, detected: result.output.match(symptom)[0], log });
	console.log(`Verified ${name} rejects the intentional break.`);
}

function replaceOnce(source, before, after) {
	if (source.split(before).length !== 2)
		throw new Error(`Expected exactly one SDK mutation target: ${before}`);
	return source.replace(before, after);
}

async function removeExport(packageDirectory) {
	const manifest = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));
	const declarations = join(packageDirectory, manifest.exports['.'].types);
	const source = await readFile(declarations, 'utf8');
	const exports = source.match(/^export \{[^\n]+\};$/m);
	if (!exports) throw new Error('The package no longer uses a flattened declaration export.');
	await writeFile(
		declarations,
		source.replace(exports[0], replaceOnce(exports[0], 'DocumentViewsComponent, ', '')),
	);
}

async function pack(packageDirectory, destination) {
	await mkdir(destination);
	const result = spawnSync(
		'npm',
		['pack', '--ignore-scripts', '--json', '--pack-destination', destination],
		{ cwd: packageDirectory, encoding: 'utf8' },
	);
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`Cannot pack negative fixture: ${result.stderr}`);
	// npm 12 reports packed packages keyed by name; earlier versions return an array.
	const packed = JSON.parse(result.stdout);
	return join(destination, (Array.isArray(packed) ? packed[0] : Object.values(packed)[0]).filename);
}

try {
	const pristine = join(directory, 'pristine');
	await mkdir(pristine);
	run('tar', ['-xzf', archive, '-C', pristine], root);
	const packageDirectory = join(pristine, 'package');
	const expected = join(directory, 'pristine.api.md');
	run(
		process.execPath,
		[
			join(root, 'scripts/check-sdk-api.mjs'),
			'--sdk-dir',
			packageDirectory,
			'--report',
			expected,
			'--update',
		],
		root,
	);
	const nonPortable = join(directory, 'non-portable');
	await cp(packageDirectory, nonPortable, { recursive: true });
	const nonPortableManifest = JSON.parse(await readFile(join(nonPortable, 'package.json'), 'utf8'));
	const nonPortableDeclarations = join(nonPortable, nonPortableManifest.exports['.'].types);
	await writeFile(
		nonPortableDeclarations,
		(await readFile(nonPortableDeclarations, 'utf8')) +
			'\ntype NonPortable = import("node_modules/ag-grid-community/dist/types/src/api/gridApi").GridApi;\n',
	);
	await expectFailure(
		'sdk-portability',
		[
			join(root, 'scripts/check-sdk-api.mjs'),
			'--sdk-dir',
			nonPortable,
			'--report',
			join(directory, 'unacceptable-api-update.md'),
			'--update',
		],
		/SDK declaration import is not portable: node_modules\/ag-grid-community/,
	);
	const brokenApi = join(directory, 'broken-api');
	await cp(packageDirectory, brokenApi, { recursive: true });
	await removeExport(brokenApi);
	await expectFailure(
		'sdk-api',
		[join(root, 'scripts/check-sdk-api.mjs'), '--sdk-dir', brokenApi, '--report', expected],
		/SDK public API changed at report line \d+/,
	);
	const brokenConsumer = await pack(brokenApi, join(directory, 'consumer-archive'));
	await expectFailure(
		'sdk-consumer',
		[
			join(root, 'scripts/verify-sdk-consumer.mjs'),
			'--archive',
			brokenConsumer,
			'--report',
			join(directory, 'unexpected-consumer-success.json'),
		],
		/has no exported member (?:named )?['"]DocumentViewsComponent['"]/,
	);
	const brokenRuntime = join(directory, 'broken-runtime');
	await cp(packageDirectory, brokenRuntime, { recursive: true });
	const manifest = JSON.parse(await readFile(join(brokenRuntime, 'package.json'), 'utf8'));
	const module = join(brokenRuntime, manifest.exports['.'].default);
	await writeFile(
		module,
		replaceOnce(
			await readFile(module, 'utf8'),
			'disabled: patch.disabled ?? previous.disabled',
			'disabled: previous.disabled',
		),
	);
	const brokenUpgrade = await pack(brokenRuntime, join(directory, 'upgrade-archive'));
	await expectFailure(
		'sdk-upgrade',
		[
			join(root, 'scripts/verify-sdk-upgrade.mjs'),
			'--archive',
			brokenUpgrade,
			'--report',
			join(directory, 'unexpected-upgrade-success.json'),
		],
		/Upgrade contract failed: the custom\/ hide\/order override must retain its meaning/,
	);
	await writeReport(values.report, { checks, verifiedAt: new Date().toISOString() });
	console.log(`All SDK guards rejected actual breaks: ${values.report}`);
} finally {
	await rm(directory, { recursive: true, force: true });
}
