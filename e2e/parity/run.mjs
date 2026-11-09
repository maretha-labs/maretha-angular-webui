import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { settings, validateManifest } from './policy.mjs';
import { aggregate } from './report.mjs';

const args = process.argv.slice(2);
const env = { ...process.env };
for (const argument of args) {
	const [name, ...parts] = argument.split('=');
	const key = {
		'--mode': 'PARITY_MODE',
		'--scenario': 'PARITY_SCENARIO',
		'--baseline': 'PARITY_BASELINE_DIR',
		'--run-id': 'PARITY_RUN_ID',
	}[name];
	if (!key || !parts.length)
		throw new Error(
			'PARITY PRECONDITION: unsupported runner option. Credentials are environment-only.',
		);
	env[key] = parts.join('=');
}
const run = settings(env);
const manifest = validateManifest(
	JSON.parse(readFileSync(resolve('e2e/parity/scenarios.json'), 'utf8')),
);
if (run.scenario && !manifest.scenarios.some((scenario) => scenario.id === run.scenario))
	throw new Error('PARITY PRECONDITION: scenario filter did not identify a manifest row.');
if (existsSync(run.output))
	throw new Error(
		'PARITY PRECONDITION: capture directory already exists; fixed evidence is never overwritten.',
	);
mkdirSync(run.output, { recursive: true });
writeFileSync(
	resolve(run.output, 'execution.json'),
	JSON.stringify(
		{
			format: 'maretha.visual-parity.execution',
			version: 1,
			mode: run.mode,
			runId: run.runId,
			status: 'in-progress',
			parityVerified: false,
		},
		null,
		2,
	) + '\n',
);
env.PARITY_RUN_ID = run.runId;
env.PARITY_RUNNER_ACTIVE = '1';
const result = spawnSync(
	process.execPath,
	[
		resolve('node_modules/@playwright/test/cli.js'),
		'test',
		'-c',
		'e2e/playwright.parity.config.ts',
	],
	{ env, stdio: 'inherit' },
);
const expected = manifest.scenarios
	.filter((scenario) => !run.scenario || scenario.id === run.scenario)
	.map((scenario) => scenario.id);
if (run.mode === 'local' && !run.scenario)
	expected.push(
		'local-responsive-shell-contracts',
		'local-custom-font-contract',
		'local-simulated-drawer-tree-contract',
		'local-user-adjustable-drawer-widths-contract',
		'local-real-browse-drawer-contract',
	);
const report = aggregate(run.output, expected, run.mode, run.runId, result.status);
writeFileSync(resolve(run.output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
writeFileSync(
	resolve(run.output, 'execution.json'),
	JSON.stringify(
		{
			format: 'maretha.visual-parity.execution',
			version: 1,
			mode: run.mode,
			runId: run.runId,
			status: report.captureChecksPassed ? 'capture-checks-passed' : 'failed',
			parityVerified: false,
			exitCode: result.status,
			signal: result.signal,
			report: existsSync(resolve(run.output, 'report.json')) ? 'report.json' : null,
		},
		null,
		2,
	) + '\n',
);
console.log(
	JSON.stringify({
		status: report.captureChecksPassed ? 'capture-checks-passed' : 'failed',
		parityVerified: false,
		output: run.output,
	}),
);
process.exitCode = result.status || (report.captureChecksPassed ? 0 : 1);
