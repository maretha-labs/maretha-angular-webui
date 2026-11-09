import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { executablePath } from './playwright.shared';

export default defineConfig({
	testDir: './nuxeo',
	testMatch: '**/*.e2e.ts',
	globalSetup: './nuxeo/preconditions.ts',
	workers: 1,
	fullyParallel: false,
	retries: 0,
	timeout: 60_000,
	outputDir: '../dist/verification/nuxeo/test-results',
	reporter: [
		['list'],
		['json', { outputFile: resolve('dist/verification/nuxeo/playwright.json') }],
	],
	use: {
		serviceWorkers: 'block',
		launchOptions: { executablePath },
		trace: 'off',
		screenshot: 'off',
		video: 'off',
	},
});
