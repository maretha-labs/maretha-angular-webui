import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const fixtureMarkers = ['example-documents', 'fixture.exampleDocuments', 'e2e/compiled-search/'];

/** Check both minified code and source-map sources/content, including lazy chunks. */
export async function verifyFixtureExclusion(directory) {
	let scripts = 0;
	let sourceMaps = 0;
	async function inspect(current) {
		for (const entry of await readdir(current, { withFileTypes: true })) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) await inspect(path);
			else if (entry.isFile() && /\.js(?:\.map)?$/.test(entry.name)) {
				if (entry.name.endsWith('.map')) sourceMaps++;
				else scripts++;
				const contents = await readFile(path, 'utf8');
				const marker = fixtureMarkers.find((value) => contents.includes(value));
				if (marker)
					throw new Error(`Test-only search leaked into ${relative(directory, path)}: ${marker}`);
			}
		}
	}
	await inspect(directory);
	if (!scripts || !sourceMaps)
		throw new Error('Expected production JavaScript and JavaScript source maps to inspect');
	return { scripts, sourceMaps };
}

async function main() {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
	const reportPath = join(root, 'dist/verification/compiled-search/production-exclusion.json');
	await rm(reportPath, { force: true });
	const [
		{ Architect },
		{ WorkspaceNodeModulesArchitectHost },
		{ workspaces, schema, logging },
		{ NodeJsSyncHost },
	] = await Promise.all([
		import('@angular-devkit/architect'),
		import('@angular-devkit/architect/node/index.js'),
		import('@angular-devkit/core'),
		import('@angular-devkit/core/node/index.js'),
	]);
	const { workspace } = await workspaces.readWorkspace(
		root,
		workspaces.createWorkspaceHost(new NodeJsSyncHost()),
	);
	const project = 'maretha-angular-webui';
	const outputPath = 'dist/verification/compiled-search/production';
	const registry = new schema.CoreSchemaRegistry();
	registry.addPostTransform(schema.transforms.addUndefinedDefaults);
	const architect = new Architect(new WorkspaceNodeModulesArchitectHost(workspace, root), registry);
	const logger = new logging.Logger('compiled-search-production');
	logger.subscribe((entry) => process.stdout.write(entry.message + '\n'));
	const run = await architect.scheduleTarget(
		{ project, target: 'build', configuration: 'production' },
		{ aot: true, outputPath, progress: false },
		{ logger },
	);
	try {
		const result = await run.result;
		if (!result.success) throw new Error('Optimized production verification build failed');
	} finally {
		await run.stop();
	}
	const counts = await verifyFixtureExclusion(join(root, outputPath));
	const report = {
		...counts,
		fixtureExcluded: true,
		configuration: 'production',
		componentStyleVerificationCeiling: '8kb',
		productionComponentStyleCeilingUnchanged: true,
	};
	await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
	process.stdout.write(
		`Fixture absent from ${counts.scripts} scripts and ${counts.sourceMaps} source maps.\n`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		process.stderr.write(error.stack + '\n');
		process.exitCode = 1;
	});
}
