import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { executablePath } from './playwright.shared';

export default defineConfig({
	testDir: './i18n',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 60_000,
	outputDir: '../dist/verification/i18n/test-results',
	reporter: [['list'], ['json', { outputFile: resolve('dist/verification/i18n/playwright.json') }]],
	use: {
		serviceWorkers: 'block',
		baseURL: 'http://127.0.0.1:4311',
		viewport: { width: 1280, height: 900 },
		launchOptions: { executablePath },
		trace: 'retain-on-failure',
	},
	webServer: {
		command: 'npm run ng -- serve --configuration i18n --host 127.0.0.1 --port 4311 --open=false',
		url: 'http://127.0.0.1:4311',
		reuseExistingServer: false,
		timeout: 180_000,
	},
});
