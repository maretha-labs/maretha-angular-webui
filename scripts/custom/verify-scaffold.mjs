#!/usr/bin/env node
// Generates every slot family and layout mode into out-tsc/custom-scaffold, compiles the
// output with the Angular compiler (strict templates) and lints it as if it lived in custom/,
// so a core or SDK change that breaks the generator templates fails here. `--keep` leaves
// the output for diagnosis.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import { newContribution, SLOTS } from './new-contribution.mjs';
import { MODES, newLayout } from './new-layout.mjs';
import { REPOSITORY } from './scaffold.mjs';

const root = path.join(REPOSITORY, 'out-tsc', 'custom-scaffold');
const list = (directory) =>
	readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory()
			? list(path.join(directory, entry.name))
			: [path.join(directory, entry.name)],
	);

rmSync(root, { recursive: true, force: true });
// The test builder discovers every *.spec.ts in the workspace, so never leave the output behind.
if (!process.argv.includes('--keep'))
	process.on('exit', () => rmSync(root, { recursive: true, force: true }));
mkdirSync(path.join(root, 'custom'), { recursive: true });
for (const file of ['index.ts', 'owner.json'])
	copyFileSync(path.join(REPOSITORY, 'custom', file), path.join(root, 'custom', file));
const { prefix } = JSON.parse(readFileSync(path.join(root, 'custom', 'owner.json'), 'utf8'));
for (const slot of Object.keys(SLOTS))
	await newContribution(
		['--root', root, '--slot', slot, '--id'].concat(
			`${prefix}.scaffold.${slot.toLowerCase().replaceAll('_', '-')}`,
		),
	);
await newLayout(['--root', root, '--type', 'ScaffoldCheck', '--modes', MODES.join(',')]);

const files = list(path.join(root, 'custom')).filter((file) => file.endsWith('.ts'));
writeFileSync(
	path.join(root, 'tsconfig.json'),
	JSON.stringify({
		extends: '../../tsconfig.json',
		compilerOptions: { noEmit: true, types: ['jasmine'] },
		files: files.map((file) => path.relative(root, file)),
	}),
);
const require = createRequire(import.meta.url);
const compiler = path.join(
	path.dirname(require.resolve('@angular/compiler-cli/package.json')),
	require('@angular/compiler-cli/package.json').bin.ngc,
);
const eslint = new ESLint({ cwd: REPOSITORY });

function compiles(quiet = false) {
	try {
		execFileSync(process.execPath, [compiler, '-p', path.join(root, 'tsconfig.json')], {
			stdio: quiet ? 'pipe' : 'inherit',
		});
		return true;
	} catch {
		return false;
	}
}

async function lintResults() {
	const results = await Promise.all(
		files.map(
			async (file) =>
				(
					await eslint.lintText(readFileSync(file, 'utf8'), {
						filePath: path.join(REPOSITORY, path.relative(root, file)),
					})
				)[0],
		),
	);
	return results;
}

const results = compiles() ? await lintResults() : process.exit(1);
if (results.some((result) => result.errorCount || result.warningCount)) {
	console.error((await eslint.loadFormatter('stylish')).format(results));
	process.exit(1);
}
console.log(
	`Generated ${Object.keys(SLOTS).length} slot contributions and ${MODES.length} layout modes; ${files.length} files compile and lint clean.`,
);

if (process.argv.includes('--prove-failures')) {
	// Each stage must reject a planted defect, or a passing run proves nothing.
	const view = files.find((file) => file.endsWith('.view.layout.ts'));
	const original = readFileSync(view, 'utf8');
	writeFileSync(view, original.replace('documentId()', 'missingMember()'));
	const compileFails = !compiles(true);
	writeFileSync(
		view,
		`export { WebUiMessages } from 'app/extensions/webui-messages';\n${original}`,
	);
	const lintFails = (await lintResults()).some((result) =>
		result.messages.some((message) => message.ruleId === 'maretha/custom-boundaries'),
	);
	writeFileSync(
		view,
		`${original}\nexport const password = process.env['NUXEO_PASSWORD'] ?? 'Administrator';\n`,
	);
	const credentialFails = (await lintResults()).some((result) =>
		result.messages.some((message) => message.ruleId === 'maretha/no-credential-default'),
	);
	writeFileSync(view, original);
	if (!compileFails || !lintFails || !credentialFails) {
		console.error(
			`Planted defects were not caught: template error ${compileFails ? 'failed' : 'passed'}, core import ${lintFails ? 'failed' : 'passed'}, credential default ${credentialFails ? 'failed' : 'passed'}.`,
		);
		process.exit(1);
	}
	console.log(
		'A planted template error fails compilation; a core import and a credential default fail lint.',
	);
}
