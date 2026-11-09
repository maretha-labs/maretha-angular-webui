import { rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectInputs, hashFile } from './verify-coverage.mjs';

const report = resolve('coverage/maretha-angular-webui/coverage-final.json');
const snapshot = resolve('coverage/maretha-angular-webui/source-snapshot.json');
rmSync(report, { force: true });
rmSync(snapshot, { force: true });
const inputs = collectInputs(process.cwd());
const result = spawnSync(
	process.execPath,
	[
		'node_modules/@angular/cli/bin/ng.js',
		'test',
		'--watch=false',
		'--browsers=ChromeHeadless',
		'--progress=false',
		'--code-coverage',
	],
	{
		stdio: 'inherit',
		env: {
			...process.env,
			MARETHA_COVERAGE: '1',
			MARETHA_KARMA_PORT: process.env.MARETHA_KARMA_PORT || '9888',
			NG_BUILD_MAX_WORKERS: process.env.NG_BUILD_MAX_WORKERS || '2',
		},
	},
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
if (result.status === 0) {
	if (JSON.stringify(inputs) !== JSON.stringify(collectInputs(process.cwd()))) {
		console.error('Coverage source changed during collection. Run test:coverage again.');
		rmSync(report, { force: true });
		process.exitCode = 1;
	} else {
		writeFileSync(
			snapshot,
			JSON.stringify({ version: 1, inputs, coverageSha256: hashFile(report) }, null, 2) + '\n',
		);
	}
}
