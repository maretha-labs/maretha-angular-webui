import { spawnSync } from 'node:child_process';

const result = spawnSync(
	process.execPath,
	[
		'./node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js',
		'-p',
		'app/extensions/tsconfig.results-projection-template-context.json',
	],
	{ encoding: 'utf8' },
);
const output = `${result.stdout}${result.stderr}`;
const expected = [
	"Property 'rows' does not exist on type 'ResultsProjectionContext",
	"Property 'row' does not exist on type 'ResultsProjectionHostContext",
];

if (result.status === 0 || !expected.every((message) => output.includes(message))) {
	process.stderr.write(output);
	process.exitCode = 1;
}
