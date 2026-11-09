import { defineConfig } from '@playwright/test';
import { resolve } from 'path';
import { executablePath } from './playwright.shared';

const baseURL = 'http://127.0.0.1:4315';
const projectRoot = resolve(__dirname, '..');
export default defineConfig({
	testDir: './compiled-search',
	testMatch: '**/*.e2e.ts',
	outputDir: '../dist/verification/compiled-search/test-results',
	reporter: [
		['list'],
		[
			'json',
			{
				outputFile: resolve(projectRoot, 'dist/verification/compiled-search/browser-results.json'),
			},
		],
	],
	workers: 1,
	use: { baseURL, serviceWorkers: 'block', launchOptions: { executablePath } },
	webServer: {
		command:
			'npm run ng -- serve --configuration compiled-search --host 127.0.0.1 --port 4315 --open=false',
		url: baseURL,
		reuseExistingServer: false,
		timeout: 180_000,
	},
});
