import { test as base } from '@playwright/test';
import { restrictToLoopback } from '../local-boundary.mjs';

export const test = base.extend({
	page: async ({ context }, use) => {
		const assertBoundary = await restrictToLoopback(context);
		const page = await context.newPage();
		try {
			await use(page);
		} finally {
			await page.close();
			assertBoundary();
		}
	},
});
