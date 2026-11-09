// The human signs in in this browser; this helper never discovers/submits credentials.
import { chromium } from '@playwright/test';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { isLoopbackRequest } from '../local-boundary.mjs';
import { parsePreparedSession } from './prepared-session.ts';

function localBase(value) {
	if (!value || !isLoopbackRequest(value))
		throw new Error('Supply final local application/API URLs.');
	const url = new URL(value);
	if (url.search || url.hash) throw new Error('Base URLs must have no query or fragment.');
	return url.href.replace(/\/$/, '');
}

function outputPath(value) {
	if (!value || !isAbsolute(value) || existsSync(value))
		throw new Error('Supply new absolute storage/session paths outside the checkout.');
	const directory = realpathSync(dirname(value));
	const withinCheckout = relative(realpathSync(resolve('.')), directory);
	if (
		withinCheckout !== '..' &&
		!withinCheckout.startsWith(`..${sep}`) &&
		!isAbsolute(withinCheckout)
	)
		throw new Error('Keep authentication files outside the checkout and reports.');
	return resolve(directory, value.slice(value.lastIndexOf('/') + 1));
}

let browser;
try {
	const app = localBase(process.env.NUXEO_E2E_BASE_URL);
	const api = localBase(process.env.NUXEO_E2E_API_URL);
	const origins = new Set([new URL(app).origin, new URL(api).origin]);
	const storagePath = outputPath(process.env.NUXEO_E2E_STORAGE_STATE);
	const sessionPath = outputPath(process.env.NUXEO_E2E_SESSION_STATE);
	if (storagePath === sessionPath) throw new Error('Storage and session paths must differ.');
	const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
	const executablePath = process.env.CHROME_BIN || (existsSync(chrome) ? chrome : undefined);
	browser = await chromium.launch({ headless: false, executablePath });
	const context = await browser.newContext({ serviceWorkers: 'block' });
	await context.routeWebSocket('**/*', (socket) => socket.close());
	// Manual local OAuth redirects are needed for sign-in. Every destination is
	// checked before sending its request; the automated acceptance suite still
	// rejects all redirects and never opens a login form with saved credentials.
	await context.route('**/*', (route) =>
		isLoopbackRequest(route.request().url()) && origins.has(new URL(route.request().url()).origin)
			? route.continue()
			: route.abort('blockedbyclient'),
	);
	const page = await context.newPage();
	console.log(
		'Sign in manually in the opened local browser. No credentials are read from files or submitted by this helper.',
	);
	await page.goto(`${app}/#/dashboard`);
	await page.getByRole('button', { name: 'User menu', exact: true }).waitFor({ timeout: 600_000 });
	const session = await page.evaluate(
		(applicationBase) => ({
			format: 'maretha.nuxeo-e2e-session',
			version: 1,
			applicationBase,
			origin: location.origin,
			entries: Object.keys(sessionStorage)
				.filter((name) =>
					/^maretha\.auth\..+\.(accessToken|accessTokenValidity|refreshToken)$/.test(name),
				)
				.map((name) => ({ name, value: sessionStorage.getItem(name) })),
		}),
		app,
	);
	parsePreparedSession(session, app, api);
	const storage = await context.storageState();
	writeFileSync(storagePath, JSON.stringify(storage), { mode: 0o600, flag: 'wx' });
	writeFileSync(sessionPath, JSON.stringify(session), { mode: 0o600, flag: 'wx' });
	console.log(
		'Authenticated storage and scoped session state saved with owner-only permissions. Run the configured local suite before this short-lived session expires.',
	);
} catch {
	// Playwright exceptions can contain login URLs and private DOM content.
	console.error(
		'PRECONDITION NOT MET: manual local state preparation failed. Check final local URLs, new external state paths, installed browser and successful sign-in. No credentials were printed.',
	);
	process.exitCode = 1;
} finally {
	await browser?.close();
}
