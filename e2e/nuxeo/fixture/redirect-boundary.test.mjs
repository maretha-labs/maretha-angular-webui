import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { fixtureAuthRoute } from './prepare-state.mjs';

function routeFor(
	status,
	location,
	resourceType = 'document',
	url = 'http://127.0.0.1:18080/login',
) {
	const calls = [];
	return {
		calls,
		request: () => ({ url: () => url, resourceType: () => resourceType }),
		fetch: async (options) => {
			calls.push(['fetch', options]);
			return { status: () => status, headers: () => ({ location }) };
		},
		fulfill: async (value) => calls.push(['fulfill', value]),
		abort: async (value) => calls.push(['abort', value]),
	};
}

test('authentication redirects fail closed for cross-origin, credentialed, missing and method-preserving targets', async () => {
	const origin = 'http://127.0.0.1:18080';
	for (const [status, location, kind] of [
		[307, 'http://127.0.0.1:18081/receive', 'document'],
		[308, '/receive', 'document'],
		[302, 'https://outside.invalid/receive', 'document'],
		[302, 'http://user:synthetic@127.0.0.1:18080/receive', 'document'],
		[302, '//127.0.0.1:18081/receive', 'document'],
		[302, undefined, 'document'],
		[302, '/receive', 'xhr'],
	]) {
		const route = routeFor(status, location, kind);
		await fixtureAuthRoute(route, origin);
		assert.deepEqual(route.calls[0], ['fetch', { maxRedirects: 0, timeout: 30_000 }]);
		assert.deepEqual(route.calls[1], ['abort', 'blockedbyclient']);
		assert.equal(route.calls.length, 2);
	}
	const outside = routeFor(200, undefined, 'document', 'http://127.0.0.1:18081/receive');
	await fixtureAuthRoute(outside, origin);
	assert.deepEqual(outside.calls, [['abort', 'blockedbyclient']]);
});

test('same-origin OAuth document redirects are converted to a no-store navigation and cannot inject bridge markup', async () => {
	for (const status of [301, 302, 303]) {
		const route = routeFor(status, '/callback?code=synthetic#<script>');
		await fixtureAuthRoute(route, 'http://127.0.0.1:18080');
		const [name, response] = route.calls[1];
		assert.equal(name, 'fulfill');
		assert.equal(response.status, 200);
		assert.equal(response.headers['cache-control'], 'no-store');
		assert.match(response.body, /location\.replace\(/);
		assert.doesNotMatch(response.body, /#<script>/);
		assert.equal(route.calls.length, 2);
	}
});

async function listen(server) {
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
	server.closeAllConnections();
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
}

test(
	'real browser login follows only rechecked same-origin redirects and never forwards a synthetic credential POST externally',
	{ timeout: 45_000 },
	async () => {
		const received = [];
		const external = createServer(async (request, response) => {
			let bytes = 0;
			for await (const chunk of request) bytes += chunk.length;
			received.push({ method: request.method, bytes });
			response.end('Unexpected credential destination');
		});
		const externalOrigin = await listen(external);
		const localRequests = [];
		const local = createServer(async (request, response) => {
			let body = '';
			for await (const chunk of request) body += chunk;
			localRequests.push({ path: request.url, method: request.method, body });
			response.setHeader('Content-Type', 'text/html');
			if (request.url.startsWith('/form/')) {
				const action = request.url.replace('/form/', '/submit/');
				response.end(
					`<form method="post" action="${action}"><input name="password" value="synthetic-only-test-value"><button>Sign in</button></form>`,
				);
			} else if (request.url.startsWith('/submit/')) {
				const mode = request.url.slice('/submit/'.length);
				response.writeHead(mode === 'external307' ? 307 : 302, {
					Location:
						mode === 'external307'
							? `${externalOrigin}/receive`
							: mode === 'chain'
								? '/escape'
								: '/callback',
					'Set-Cookie': 'fixture=synthetic; HttpOnly; SameSite=Strict; Path=/',
				});
				response.end();
			} else if (request.url === '/escape') {
				response.writeHead(302, { Location: `${externalOrigin}/receive` });
				response.end();
			} else {
				response.end('<h1>Authenticated synthetic fixture</h1>');
			}
		});
		const origin = await listen(local);
		let browser;
		try {
			browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN });
			const context = await browser.newContext({ serviceWorkers: 'block' });
			await context.routeWebSocket('**/*', (socket) => socket.close());
			await context.route('**/*', (route) => fixtureAuthRoute(route, origin));
			for (const mode of ['external307', 'chain', 'allowed']) {
				const page = await context.newPage();
				await page.goto(`${origin}/form/${mode}`);
				const blocked =
					mode === 'allowed'
						? null
						: page.waitForEvent('requestfailed', {
								predicate: (request) => request.isNavigationRequest(),
							});
				await page.getByRole('button', { name: 'Sign in', exact: true }).click();
				if (mode === 'allowed') {
					await page.waitForURL(`${origin}/callback`);
					assert.equal(
						await page.getByRole('heading', { name: 'Authenticated synthetic fixture' }).count(),
						1,
					);
				} else {
					assert.match((await blocked).failure().errorText, /ERR_BLOCKED_BY_CLIENT/);
				}
				await page.close();
			}
			assert.equal(received.length, 0, 'No request or credential body may reach the second origin');
			assert.equal(localRequests.filter((value) => value.method === 'POST').length, 3);
			assert.equal(localRequests.find((value) => value.path === '/callback').method, 'GET');
			assert.equal(localRequests.find((value) => value.path === '/callback').body, '');
			assert.equal(
				(await context.cookies(origin)).find((cookie) => cookie.name === 'fixture').value,
				'synthetic',
			);
			await context.close();
		} finally {
			await browser?.close();
			await close(local);
			await close(external);
		}
	},
);
