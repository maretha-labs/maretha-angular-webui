import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isDeepStrictEqual } from 'node:util';
import {
	candidateArchive,
	installArchive,
	prepareConsumer,
	root,
	run,
	sha256,
	writeReport,
} from './sdk-consumer.mjs';

const { values } = parseArgs({
	options: {
		archive: { type: 'string' },
		'baseline-dir': { type: 'string', default: join(root, 'contracts/sdk-baseline') },
		'fixture-dir': { type: 'string', default: join(root, 'contracts/sdk-upgrade') },
		report: { type: 'string', default: join(root, 'dist/verification/sdk-upgrade.json') },
		keep: { type: 'boolean', default: false },
	},
});
const baselineDirectory = resolve(values['baseline-dir']);
const baseline = JSON.parse(await readFile(join(baselineDirectory, 'manifest.json'), 'utf8'));
const baselineArchive = join(baselineDirectory, 'sdk.tgz');
if (
	baseline.format !== 1 ||
	baseline.package !== '@maretha/webui-sdk' ||
	sha256(await readFile(baselineArchive)) !== baseline.sha256
)
	throw new Error('The frozen upgrade baseline does not match its recorded artifact hash.');
run(process.execPath, [join(root, 'scripts/check-sdk-ids.mjs')], root);
const directory = await prepareConsumer();
const outcomes = {};
const consumerManifest = join(directory, 'package.json');
const fixtureManifest = JSON.parse(await readFile(consumerManifest, 'utf8'));
/**
 * The baseline builds with the Angular and TypeScript versions its peer range accepts, recorded
 * as `consumer` in its manifest; the candidate builds with the example's own versions.
 */
async function pinConsumer(pins = {}) {
	const manifest = structuredClone(fixtureManifest);
	for (const section of ['dependencies', 'devDependencies'])
		Object.assign(manifest[section], pins[section]);
	await writeFile(consumerManifest, JSON.stringify(manifest, null, 2) + '\n');
	await rm(join(directory, 'package-lock.json'), { force: true });
	await rm(join(directory, 'node_modules'), { recursive: true, force: true });
}
try {
	const rehearsalDirectory = join(directory, 'rehearsal');
	await mkdir(rehearsalDirectory);
	await cp(
		join(resolve(values['fixture-dir']), 'client-extension.ts'),
		join(rehearsalDirectory, 'client-extension.ts'),
	);
	await writeFile(
		join(directory, 'tsconfig.rehearsal.json'),
		JSON.stringify({
			compilerOptions: {
				target: 'ES2022',
				module: 'ES2022',
				moduleResolution: 'bundler',
				strict: true,
				skipLibCheck: true,
				lib: ['ES2022', 'DOM'],
				rootDir: 'rehearsal',
				outDir: 'rehearsal-build',
			},
			files: ['rehearsal/client-extension.ts'],
		}),
	);
	await writeFile(
		join(directory, 'run-rehearsal.mjs'),
		`
import '@angular/compiler';
import { writeFile } from 'node:fs/promises';
import { rehearse } from './rehearsal-build/client-extension.js';
const result = rehearse(process.argv[2]);
await writeFile('./rehearsal-result.json', JSON.stringify(result));
console.log('Upgrade semantics passed:', process.argv[2]);
`,
	);
	for (const [revision, archive] of [
		['baseline', baselineArchive],
		['candidate', values.archive ?? (await candidateArchive())],
	]) {
		console.log(`Checking ${revision} SDK and unchanged client extension...`);
		await pinConsumer(revision === 'baseline' ? baseline.consumer : undefined);
		const sdk = await installArchive(directory, archive);
		if (revision === 'baseline' && sdk.version !== baseline.version)
			throw new Error('The frozen SDK version does not match its manifest.');
		run('npm', ['run', 'build'], directory);
		await rm(join(directory, 'rehearsal-build'), { recursive: true, force: true });
		run(
			process.execPath,
			['node_modules/typescript/bin/tsc', '-p', 'tsconfig.rehearsal.json'],
			directory,
		);
		await writeFile(join(directory, 'rehearsal-build/package.json'), '{"type":"module"}\n');
		run(process.execPath, ['run-rehearsal.mjs', revision], directory);
		outcomes[revision] = {
			sdk,
			result: JSON.parse(await readFile(join(directory, 'rehearsal-result.json'), 'utf8')),
		};
	}
	if (
		!isDeepStrictEqual(
			outcomes.baseline.result.beforeRemoval,
			outcomes.candidate.result.beforeRemoval,
		)
	)
		throw new Error('custom/ overrides changed meaning across SDK artifacts.');
	await writeReport(values.report, {
		...outcomes,
		clientExtensionSha256: sha256(await readFile(join(rehearsalDirectory, 'client-extension.ts'))),
		verifiedAt: new Date().toISOString(),
	});
	console.log(`Verified SDK upgrade rehearsal: ${values.report}`);
} finally {
	if (values.keep) console.log(`Upgrade workspace retained: ${directory}`);
	else await rm(directory, { recursive: true, force: true });
}
