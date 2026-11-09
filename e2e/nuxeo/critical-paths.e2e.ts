import { Browser, Page, expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { settings } from './preconditions';
import { scan } from '../a11y/scan';
import { restrictToLoopback } from '../local-boundary.mjs';
import { PreparedSession, restorePreparedSession } from './prepared-session';
import { quickSearchDocumentIdentityPattern } from './quick-search-identity.mjs';
import {
	NativeDocumentIdentity,
	isExactNativeDocumentRoute,
	isExactNativeRoute,
	nativeRouteUrl,
	readNativeDocumentIdentity,
} from './native-route.mjs';

function failedPrecondition(reason: string): never {
	mkdirSync('dist/verification/nuxeo', { recursive: true });
	writeFileSync(
		'dist/verification/nuxeo/precondition.json',
		JSON.stringify(
			{
				status: 'PRECONDITION NOT MET',
				reason,
				criticalPathResults:
					'See the Playwright report for any paths completed before this failure.',
			},
			null,
			2,
		),
	);
	throw new Error(`PRECONDITION NOT MET: ${reason}`);
}

async function authenticatedContext(
	browser: Browser,
	storageState: string,
	session?: PreparedSession,
) {
	try {
		const context = await browser.newContext({ storageState, serviceWorkers: 'block' });
		const assertBoundary = await restrictToLoopback(context);
		if (session) await restorePreparedSession(context, session);
		return { context, assertBoundary };
	} catch {
		return failedPrecondition(
			'Prepared browser state could not initialize the local authenticated context. Regenerate it manually.',
		);
	}
}

function failedAuthentication(): never {
	return failedPrecondition(
		'Prepared browser state did not authenticate the local WebUI. Refresh it manually; this suite does not discover or submit credentials.',
	);
}

async function assertLoadedDocument(
	page: Page,
	document: NativeDocumentIdentity,
	applicationBase: string,
) {
	await expect(page.locator('nx-document-views')).toBeVisible();
	await expect
		.poll(() => isExactNativeDocumentRoute(page.url(), document, applicationBase), {
			message: 'Loaded document must match the exact configured native identity and default view.',
		})
		.toBe(true);
}

test('local Nuxeo login page has labelled keyboard controls and passes both accessibility engines', async ({
	browser,
}, info) => {
	const { api } = settings();
	const context = await browser.newContext({ serviceWorkers: 'block' });
	const assertBoundary = await restrictToLoopback(context);
	const page = await context.newPage();
	try {
		await page.goto(`${api}/login.jsp`);
		if (!(await page.locator('input[type="password"]').count()))
			throw new Error(
				'PRECONDITION NOT MET: local Nuxeo login form is not available (external SSO/custom login needs an explicit test adapter).',
			);
		await page.locator('input[type="password"]').focus();
		await page.keyboard.press('Tab');
		await expect(page.locator(':focus')).not.toHaveAttribute('type', 'password');
		await scan(
			page,
			info,
			'local-nuxeo-login',
			'configured local Nuxeo; not hosted-to-installed acceptance',
		);
	} finally {
		await context.close();
		assertBoundary();
	}
});

test.describe('authenticated local Nuxeo critical paths', () => {
	test.beforeEach(async ({ browser: _browser }, info) => {
		info.annotations.push({
			type: 'scope',
			description:
				'read-only local server; supplied browser session and existing document required',
		});
	});
	test('authenticated shell, quick search, document navigation and user-menu keyboard dismissal', async ({
		browser,
	}) => {
		const config = settings();
		const { context, assertBoundary } = await authenticatedContext(
			browser,
			config.storageState,
			config.session,
		);
		const page = await context.newPage();
		try {
			const document = await readNativeDocumentIdentity(
				context.request,
				config.api,
				config.documentId,
			);
			await page.goto(nativeRouteUrl(config.app, '/dashboard'));
			const menu = page.getByRole('button', { name: 'User menu', exact: true });
			try {
				await menu.waitFor({ state: 'visible', timeout: 15_000 });
			} catch {
				failedAuthentication();
			}
			await expect.poll(() => isExactNativeRoute(page.url(), '/dashboard', config.app)).toBe(true);
			const trigger = page.locator('nx-quick-search > button');
			await trigger.focus();
			await page.keyboard.press('Enter');
			const search = page.locator('nx-quick-search dialog input[type=search]');
			await expect(search).toBeFocused();
			await search.fill(config.search);
			const result = page
				.locator('nx-quick-search dialog [data-search-result][role="option"]')
				.filter({
					has: page.locator('small').filter({
						hasText: new RegExp(
							`^(?:/browse(?:${document.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|/documents/${config.documentId})|${quickSearchDocumentIdentityPattern(config.documentId).source.slice(1, -1)})$`,
						),
					}),
				});
			await expect(result).toHaveCount(1);
			await expect(
				result,
				'Configured readable document must be indexed and returned by quick search',
			).toBeVisible();
			await result.focus();
			await page.keyboard.press('Enter');
			await assertLoadedDocument(page, document, config.app);
			await menu.focus();
			await page.keyboard.press('Enter');
			await expect(menu).toHaveAttribute('aria-expanded', 'true');
			await page.keyboard.press('Escape');
			await expect(menu).toBeFocused();
			await expect(menu).toHaveAttribute('aria-expanded', 'false');
		} finally {
			await context.close();
			assertBoundary();
		}
	});
	test('creation destination can open and cancel without persisting a document', async ({
		browser,
	}) => {
		const config = settings();
		const { context, assertBoundary } = await authenticatedContext(
			browser,
			config.storageState,
			config.session,
		);
		const page = await context.newPage();
		try {
			const document = await readNativeDocumentIdentity(
				context.request,
				config.api,
				config.documentId,
			);
			const route = `/browse/documents/${config.documentId}`;
			await page.goto(nativeRouteUrl(config.app, route));
			try {
				await page
					.getByRole('button', { name: 'User menu', exact: true })
					.waitFor({ state: 'visible', timeout: 15_000 });
			} catch {
				failedAuthentication();
			}
			await assertLoadedDocument(page, document, config.app);
			const create = page.locator('nx-global-create button.create');
			await expect(
				create,
				'Configured application must expose the default creation action',
			).toBeVisible();
			await create.focus();
			await page.keyboard.press('Enter');
			await expect(page.locator('nx-destination-create-dialog')).toBeVisible();
			await expect(page.locator('#creation-destination')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(page.locator('nx-destination-create-dialog')).toHaveCount(0);
			await expect(create).toBeFocused();
			await assertLoadedDocument(page, document, config.app);
		} finally {
			await context.close();
			assertBoundary();
		}
	});
});
