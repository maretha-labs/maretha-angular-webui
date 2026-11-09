import { chromium } from '@playwright/test';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { isLoopbackRequest } from '../../local-boundary.mjs';
import { parsePreparedSession } from '../prepared-session.ts';
import {
	externalFile,
	fixtureFailure,
	readCredentials,
	readFixture,
	verifyInstance,
} from './contract.mjs';

export function environmentFor(fixture, stateRoot) {
	return {
		NUXEO_E2E_BASE_URL: fixture.app,
		NUXEO_E2E_API_URL: fixture.api,
		NUXEO_E2E_APPLICATION_ID: fixture.applicationId,
		NUXEO_E2E_DOCUMENT_ID: fixture.documentId,
		NUXEO_E2E_SEARCH_TERM: fixture.searchTerm,
		NUXEO_E2E_CONFIGURATION_VERSION: fixture.configurationVersion,
		NUXEO_E2E_BASE_HREF: `${new URL(fixture.app).pathname}/`,
		NUXEO_E2E_STORAGE_STATE: join(stateRoot, 'storage.json'),
		NUXEO_E2E_SESSION_STATE: join(stateRoot, 'session.json'),
		NUXEO_E2E_CI_STATE_ROOT: stateRoot,
	};
}

export async function configure(
	fixture,
	temporary = process.env.RUNNER_TEMP,
	output = process.env.GITHUB_ENV,
) {
	await verifyInstance(fixture);
	readCredentials(fixture);
	if (!temporary || !isAbsolute(temporary) || !output || !isAbsolute(output))
		throw fixtureFailure();
	const inside = relative(realpathSync(process.cwd()), realpathSync(temporary));
	if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))
		throw fixtureFailure();
	const root = mkdtempSync(join(realpathSync(temporary), 'maretha-native-ci-state-'));
	writeFileSync(
		join(root, 'owner.json'),
		JSON.stringify({ format: 'maretha.nuxeo-ci-state', fixtureId: fixture.id }),
		{ mode: 0o600 },
	);
	const values = environmentFor(fixture, root);
	if (Object.values(values).some((value) => /[\r\n\0]/.test(value))) throw fixtureFailure();
	appendFileSync(
		output,
		Object.entries(values)
			.map(([key, value]) => `${key}=${value}\n`)
			.join(''),
	);
}

export function cleanState(root, fixtureId, temporary = process.env.RUNNER_TEMP) {
	if (!root) return;
	if (!temporary || !isAbsolute(root) || !isAbsolute(temporary) || !existsSync(root))
		throw fixtureFailure();
	const expected = realpathSync(temporary);
	const actual = realpathSync(root);
	if (
		resolve(actual, '..') !== expected ||
		!actual.slice(expected.length + 1).startsWith('maretha-native-ci-state-')
	)
		throw fixtureFailure();
	const marker = JSON.parse(readFileSync(join(actual, 'owner.json'), 'utf8'));
	if (marker.format !== 'maretha.nuxeo-ci-state' || marker.fixtureId !== fixtureId)
		throw fixtureFailure();
	rmSync(actual, { recursive: true });
}

export async function fixtureAuthRoute(route, origin) {
	const request = route.request();
	if (!isLoopbackRequest(request.url()) || new URL(request.url()).origin !== origin)
		return route.abort('blockedbyclient');
	try {
		const response = await route.fetch({ maxRedirects: 0, timeout: 30_000 });
		const status = response.status();
		if (status >= 300 && status < 400 && status !== 304) {
			const location = response.headers()['location'];
			const target = location ? new URL(location, request.url()) : null;
			if (
				![301, 302, 303].includes(status) ||
				request.resourceType() !== 'document' ||
				!target ||
				!isLoopbackRequest(target.href) ||
				target.origin !== origin
			)
				return route.abort('blockedbyclient');
			// route.continue can bypass interception on later redirects. A navigation
			// bridge makes every native OAuth 302 a new intercepted browser request.
			const destination = JSON.stringify(target.href).replaceAll('<', '\\u003c');
			return route.fulfill({
				status: 200,
				headers: {
					'content-type': 'text/html; charset=utf-8',
					'cache-control': 'no-store',
					...(response.headers()['set-cookie']
						? { 'set-cookie': response.headers()['set-cookie'] }
						: {}),
				},
				body: `<!doctype html><title>Local fixture authentication</title><script>location.replace(${destination});</script>`,
			});
		}
		return route.fulfill({ response });
	} catch {
		return route.abort('blockedbyclient');
	}
}

export async function prepareState(fixture, storagePath, sessionPath) {
	await verifyInstance(fixture);
	const credentials = readCredentials(fixture);
	if (
		!storagePath ||
		!sessionPath ||
		storagePath === sessionPath ||
		existsSync(storagePath) ||
		existsSync(sessionPath)
	)
		throw fixtureFailure();
	const root = process.env.NUXEO_E2E_CI_STATE_ROOT;
	if (storagePath !== join(root, 'storage.json') || sessionPath !== join(root, 'session.json'))
		throw fixtureFailure();
	externalFile(join(root, 'owner.json'), true);
	let browser;
	let phase = 'browser';
	const http = [];
	let page;
	try {
		browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN });
		const context = await browser.newContext({ serviceWorkers: 'block' });
		await context.routeWebSocket('**/*', (socket) => socket.close());
		const origin = new URL(fixture.app).origin;
		await context.route('**/*', (route) => fixtureAuthRoute(route, origin));
		page = await context.newPage();
		page.on('response', (response) => {
			const path = new URL(response.url()).pathname;
			if (
				[
					'/nuxeo/startup',
					'/nuxeo/login.jsp',
					'/nuxeo/oauth2/authorize',
					'/nuxeo/oauth2/authorize_submit',
					'/nuxeo/oauth2/token',
					'/nuxeo/api/v1/me',
				].includes(path)
			) {
				http.push({ path, status: response.status() });
				if (http.length > 20) http.shift();
			}
		});
		phase = 'login-form';
		await page.goto(`${fixture.app}/#/dashboard`);
		await page.locator('#username').fill(credentials.username);
		await page.locator('#password').fill(credentials.password);
		phase = 'submit-login';
		await page.locator('input[type="submit"][name="Submit"]').click();
		const menu = page.getByRole('button', { name: 'User menu', exact: true });
		const consent = page.locator('button[name="grant_access"]');
		phase = 'consent-or-shell';
		await menu.or(consent).waitFor({ timeout: 60_000 });
		if (await consent.isVisible()) await consent.click();
		phase = 'authenticated-shell';
		await menu.waitFor({ timeout: 60_000 });
		phase = 'capture-scoped-session';
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
			fixture.app,
		);
		parsePreparedSession(session, fixture.app, fixture.api);
		writeFileSync(storagePath, JSON.stringify(await context.storageState()), {
			mode: 0o600,
			flag: 'wx',
		});
		writeFileSync(sessionPath, JSON.stringify(session), { mode: 0o600, flag: 'wx' });
		mkdirSync('dist/verification/nuxeo', { recursive: true });
		writeFileSync(
			'dist/verification/nuxeo/fixture-session.json',
			JSON.stringify({
				fixtureId: fixture.id,
				prepared: true,
				method: 'native OAuth authorization-code login',
				credentialsRecorded: false,
			}),
		);
	} catch {
		mkdirSync('dist/verification/nuxeo', { recursive: true });
		writeFileSync(
			'dist/verification/nuxeo/fixture-auth-diagnostic.json',
			JSON.stringify({
				phase,
				http,
				controls: page
					? {
							login: await page
								.locator('#username')
								.isVisible()
								.catch(() => false),
							consent: await page
								.locator('button[name="grant_access"]')
								.isVisible()
								.catch(() => false),
							shell: await page
								.getByRole('button', { name: 'User menu', exact: true })
								.isVisible()
								.catch(() => false),
						}
					: null,
			}),
		);
		const failure = fixtureFailure();
		failure.fixturePhase = phase;
		throw failure;
	} finally {
		await browser?.close();
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
	try {
		const fixture = readFixture();
		if (process.argv[2] === 'configure') await configure(fixture);
		else if (process.argv[2] === 'cleanup')
			cleanState(process.env.NUXEO_E2E_CI_STATE_ROOT, fixture.id);
		else if (process.argv[2] === 'login')
			await prepareState(
				fixture,
				process.env.NUXEO_E2E_STORAGE_STATE,
				process.env.NUXEO_E2E_SESSION_STATE,
			);
		else throw fixtureFailure();
	} catch (error) {
		// Never echo browser errors, login URLs, credentials or private DOM into CI logs.
		console.error(
			'NATIVE CI FIXTURE: scoped preparation/cleanup failed; check the dedicated runner fixture and its fresh authentication. No credentials were recorded.',
		);
		if (
			[
				'browser',
				'login-form',
				'submit-login',
				'consent-or-shell',
				'authenticated-shell',
				'capture-scoped-session',
			].includes(error?.fixturePhase)
		)
			console.error(`Preparation phase: ${error.fixturePhase}`);
		process.exitCode = 1;
	}
}
