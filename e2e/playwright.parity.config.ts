import { defineConfig } from '@playwright/test';
import { executablePath } from './playwright.shared';
import { settings } from './parity/policy.mjs';
import { existsSync, mkdirSync } from 'fs';

const run = settings();
process.env['PARITY_RUN_ID'] = run.runId;
if (process.env['PARITY_RUNNER_ACTIVE'] !== '1') {
	if (existsSync(run.output))
		throw new Error('PARITY PRECONDITION: fixed capture evidence cannot be overwritten.');
	mkdirSync(run.output, { recursive: true });
	process.env['PARITY_RUNNER_ACTIVE'] = '1';
}
export default defineConfig({
	testDir: './parity',
	testMatch: '**/*.e2e.ts',
	workers: 1,
	fullyParallel: false,
	retries: 0,
	timeout: 90_000,
	outputDir: `${run.output}/playwright-results`,
	reporter: [['list']],
	use: {
		serviceWorkers: 'block',
		launchOptions: { executablePath },
		trace: 'off',
		screenshot: 'off',
		video: 'off',
	},
	webServer:
		run.mode === 'local'
			? {
					command:
						'npm run ng -- serve --configuration a11y --host 127.0.0.1 --port 4314 --open=false',
					url: run.bases.local,
					reuseExistingServer: false,
					timeout: 180_000,
				}
			: undefined,
});
