import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { executablePath } from './playwright.shared';

export default defineConfig({
	testDir: './a11y',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	outputDir: '../dist/verification/a11y/test-results',
	reporter: [['list'], ['json', { outputFile: resolve('dist/verification/a11y/playwright.json') }]],
	use: {
		serviceWorkers: 'block',
		baseURL: 'http://127.0.0.1:4310',
		viewport: { width: 1280, height: 900 },
		launchOptions: { executablePath },
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'npm run ng -- serve --configuration a11y --host 127.0.0.1 --port 4310 --open=false',
		url: 'http://127.0.0.1:4310',
		reuseExistingServer: false,
		timeout: 180_000,
	},
});
