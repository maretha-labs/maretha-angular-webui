import assert from 'node:assert/strict';
import test from 'node:test';
import { isLoopbackRequest, isExactDocumentRoute, restrictToLoopback } from './local-boundary.mjs';

test('loopback boundary rejects credentials, remote hosts and non-HTTP requests', () => {
	for (const url of ['http://localhost:4310/a', 'https://127.0.0.1/a', 'http://[::1]/a'])
		assert.equal(isLoopbackRequest(url), true);
	for (const url of [
		'https://remote.example/a',
		'http://localhost.remote.example',
		'http://secret@localhost',
		'file:///tmp/a',
		'invalid',
	])
		assert.equal(isLoopbackRequest(url), false);
});
test('redirect is never followed, popups share context routing, and WebSockets close', async () => {
	let handler;
	let socketHandler;
	let options;
	let aborted;
	let disposed = false;
	const assertBoundary = await restrictToLoopback({
		route: async (_pattern, callback) => {
			handler = callback;
		},
		routeWebSocket: async (_pattern, callback) => {
			socketHandler = callback;
		},
	});
	let closed = false;
	socketHandler({
		close() {
			closed = true;
		},
	});
	assert.equal(closed, true);
	await handler({
		request: () => ({ url: () => 'http://127.0.0.1/login.jsp' }),
		fetch: async (supplied) => {
			options = supplied;
			return {
				status: () => 302,
				headers: () => ({ location: 'https://external.example/sso' }),
				dispose: async () => {
					disposed = true;
				},
			};
		},
		abort: async (reason) => {
			aborted = reason;
		},
		fulfill: () => assert.fail('Redirect must not reach the browser'),
	});
	assert.deepEqual(options, { maxRedirects: 0 });
	assert.equal(aborted, 'blockedbyclient');
	assert.equal(disposed, true);
	assert.throws(assertBoundary, /PRECONDITION NOT MET: redirects are unsupported/);
});
test('document navigation cannot accept a prefix or another path segment', () => {
	assert.equal(isExactDocumentRoute('http://localhost/browse/documents/abc', 'abc'), true);
	assert.equal(
		isExactDocumentRoute(
			'http://localhost/nuxeo/ng/browse/documents/abc',
			'abc',
			'http://localhost/nuxeo/ng',
		),
		true,
	);
	assert.equal(
		isExactDocumentRoute(
			'http://localhost/elsewhere/browse/documents/abc',
			'abc',
			'http://localhost/nuxeo/ng',
		),
		false,
	);
	assert.equal(
		isExactDocumentRoute(
			'http://other.example/#/browse/documents/abc',
			'abc',
			'http://localhost/nuxeo/ng',
		),
		false,
	);
	assert.equal(
		isExactDocumentRoute('http://localhost/ng/#/browse/documents/abc?tab=view', 'abc'),
		true,
	);
	for (const route of ['abc-more', 'abc/other', 'other/abc'])
		assert.equal(
			isExactDocumentRoute(`http://localhost/ng/#/browse/documents/${route}`, 'abc'),
			false,
		);
});
