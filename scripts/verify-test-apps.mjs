import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readConfiguration } from '@angular/compiler-cli';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = JSON.parse(readFileSync(resolve(root, 'angular.json'), 'utf8'));
const require = createRequire(import.meta.url);
const compilerPackagePath = require.resolve('@angular/compiler-cli/package.json');
const compilerPackage = JSON.parse(readFileSync(compilerPackagePath, 'utf8'));
const compiler = resolve(dirname(compilerPackagePath), compilerPackage.bin.ngc);
const normalize = (path) => path.replaceAll('\\', '/').replace(/^\.\//, '');
const applications = new Map();

// Discover fixture entries from the build configuration, including an inherited
// entry replaced through fileReplacements. One Angular check covers each tsconfig.
for (const [projectName, project] of Object.entries(workspace.projects)) {
	const build = (project.architect ?? project.targets)?.build;
	if (!build) continue;
	for (const [name, configuration] of Object.entries(build.configurations ?? {})) {
		const options = { ...build.options, ...configuration };
		let entry = options.browser ?? options.main;
		if (typeof entry !== 'string') continue;
		entry =
			options.fileReplacements?.find((item) => normalize(item.replace) === normalize(entry))
				?.with ?? entry;
		if (!/^(e2e|preview)\//.test(normalize(entry))) continue;
		if (!options.tsConfig) throw new Error(`Missing tsConfig for ${projectName}:${name}`);
		const config = resolve(root, options.tsConfig);
		const application = applications.get(config) ?? { names: [], entries: new Set() };
		application.names.push(`${projectName}:${name}`);
		application.entries.add(resolve(root, entry));
		applications.set(config, application);
	}
}

if (!applications.size) throw new Error('No test application build configurations found');
// The i18n test entry imports this generated catalog. A fresh checkout must be
// template-checkable without relying on artifacts left by a previous browser run.
const pseudo = spawnSync(process.execPath, [resolve(root, 'scripts/i18n/pseudo.mjs')], {
	cwd: root,
	stdio: 'inherit',
});
if (pseudo.error) throw pseudo.error;
if (pseudo.status !== 0) process.exit(pseudo.status ?? 1);
for (const [config, { names, entries }] of applications) {
	const parsed = readConfiguration(config);
	if (parsed.options.strictTemplates !== true)
		throw new Error(`Test applications must enable strictTemplates: ${names.join(', ')}`);
	for (const entry of entries) {
		if (!parsed.rootNames.includes(entry))
			throw new Error(`Test tsConfig must include its configured entry: ${entry}`);
	}
	process.stdout.write(`Checking Angular templates: ${names.join(', ')}\n`);
	const result = spawnSync(process.execPath, [compiler, '--noEmit', '--project', config], {
		cwd: root,
		stdio: 'inherit',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}
process.stdout.write(
	`Angular template checks passed for ${applications.size} test applications.\n`,
);
