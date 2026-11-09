import { Browser, BrowserContext, expect, Page, test } from '@playwright/test';
import { scan } from '../a11y/scan';
import { restrictToLoopback } from '../local-boundary.mjs';
import { settings } from './preconditions';
import { restorePreparedSession } from './prepared-session';
import { isExactNativeRoute, nativeRouteUrl } from './native-route.mjs';

test.setTimeout(120_000);

async function openCandidate(browser: Browser, route: string) {
	const config = settings();
	let context: BrowserContext;
	try {
		context = await browser.newContext({
			storageState: config.storageState,
			serviceWorkers: 'block',
		});
	} catch {
		throw new Error('PRECONDITION NOT MET: regenerate the manually prepared local browser state.');
	}
	const assertBoundary = await restrictToLoopback(context);
	try {
		if (config.session) await restorePreparedSession(context, config.session);
		const page = await context.newPage();
		await page.goto(nativeRouteUrl(config.app, route));
		await expect
			.poll(() => page.getByRole('button', { name: 'User menu', exact: true }).isVisible(), {
				message: 'PRECONDITION NOT MET: manually prepared state must authenticate the candidate.',
				timeout: 15_000,
			})
			.toBe(true);
		await expect.poll(() => isExactNativeRoute(page.url(), route, config.app)).toBe(true);
		return { page, context, assertBoundary, config };
	} catch {
		await context.close();
		assertBoundary();
		throw new Error(
			'PRECONDITION NOT MET: the installed candidate did not open an authenticated shell. Refresh the manually prepared local state.',
		);
	}
}

async function stableRender(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
	});
}

test('authenticated installed candidate dashboard passes both accessibility engines', async ({
	browser,
}, info) => {
	const { page, context, assertBoundary } = await openCandidate(browser, '/dashboard');
	try {
		const dashboard = page.locator('nx-dashboard-page nx-dashboard');
		await expect.poll(() => dashboard.isVisible()).toBe(true);
		await expect
			.poll(() => dashboard.locator('[aria-busy="true"]').count(), { timeout: 15_000 })
			.toBe(0);
		await expect.poll(() => dashboard.locator('[role="alert"]').count()).toBe(0);
		await stableRender(page);
		await scan(
			page,
			info,
			'native-candidate-dashboard',
			'authenticated local installed candidate; read-only dashboard; not hosted-to-installed acceptance',
		);
	} finally {
		await context.close();
		assertBoundary();
	}
});
