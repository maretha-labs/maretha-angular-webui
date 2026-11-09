import assert from 'node:assert/strict';
import test from 'node:test';
import {
	isExactNativeDocumentRoute,
	isExactNativeRoute,
	nativeDocumentIdentity,
	nativeDocumentRouteUrl,
	nativeRouteUrl,
	readNativeDocumentIdentity,
} from './native-route.mjs';

const base = 'http://localhost:8080/nuxeo/authoring-local';
for (const route of ['/dashboard', '/browse/documents/synthetic-id']) {
	test(`installed native route ${route} uses exact application path`, () => {
		assert.equal(nativeRouteUrl(base, route), `${base}${route}`);
		assert.equal(nativeRouteUrl(`${base}/`, route), `${base}${route}`);
		assert.equal(isExactNativeRoute(`${base}${route}`, route, base), true);
		assert.equal(isExactNativeRoute(`${base}/#${route}`, route, base), false);
		assert.equal(isExactNativeRoute(`${base}/dashboard#${route}`, route, base), false);
		assert.equal(
			isExactNativeRoute(`http://localhost:8080/nuxeo/other${route}`, route, base),
			false,
		);
		assert.equal(
			isExactNativeRoute(`http://127.0.0.1:8080/nuxeo/authoring-local${route}`, route, base),
			false,
		);
		assert.equal(isExactNativeRoute(`${base}${route}?different=1`, route, base), false);
	});
}

test('document route cannot match a similar UID or a default dashboard', () => {
	const route = '/browse/documents/synthetic-id';
	assert.equal(isExactNativeRoute(`${base}${route}-other`, route, base), false);
	assert.equal(isExactNativeRoute(`${base}/dashboard`, route, base), false);
});

test('route cannot introduce traversal, credentials, query or fragments', () => {
	for (const route of [
		'/../dashboard',
		'//other/dashboard',
		'/dashboard?query=1',
		'/dashboard#fragment',
		'/browse/documents/unsafe/id',
	])
		assert.throws(() => nativeRouteUrl(base, route));
	for (const candidate of [
		`${base}?query=1`,
		`${base}#fragment`,
		'http://user:password@localhost/nuxeo/app',
	])
		assert.throws(() => nativeRouteUrl(candidate, '/dashboard'));
	assert.equal(isExactNativeRoute('invalid', '/dashboard', base), false);
});

const documentId = 'synthetic-id';
const nativePath = '/default-domain/workspaces/qa/native-critical-file';
const metadata = { uid: documentId, repository: 'default', path: nativePath };
const document = nativeDocumentIdentity(metadata, documentId);
const canonical = base + '/browse' + nativePath;

test('loaded native document accepts exact canonical identity and only the literal default view', () => {
	assert.deepEqual(document, metadata);
	assert.equal(Object.isFrozen(document), true);
	assert.equal(nativeDocumentRouteUrl(base, document), canonical);
	assert.equal(nativeDocumentRouteUrl(base + '/', document), canonical);
	assert.equal(isExactNativeDocumentRoute(canonical, document, base), true);
	assert.equal(isExactNativeDocumentRoute(canonical + '?view=view', document, base), true);
});

for (const [name, value] of [
	['transient UID route', base + '/browse/documents/' + documentId],
	['UID route with default view', base + '/browse/documents/' + documentId + '?view=view'],
	['similar UID', base + '/browse/documents/' + documentId + '-other'],
	['similar native path', canonical + '-other'],
	['native path suffix', canonical + '/child'],
	['native path prefix', base + '/browse/prefix' + nativePath],
	['trailing slash', canonical + '/'],
	['root browse', base + '/browse'],
	['dashboard', base + '/dashboard'],
	['wrong application', canonical.replace('/authoring-local/', '/other/')],
	['wrong origin', canonical.replace('localhost', '127.0.0.1')],
	['wrong port', canonical.replace(':8080', ':8081')],
	['wrong protocol', canonical.replace('http:', 'https:')],
	['URL credentials', canonical.replace('http://', 'http://user:secret@')],
	[
		'path traversal alias',
		canonical.replace('/native-critical-file', '/other/../native-critical-file'),
	],
	['explicit default repository', canonical + '?repository=default'],
	['wrong repository', canonical + '?repository=other'],
	['other view', canonical + '?view=edit'],
	['duplicate view', canonical + '?view=view&view=view'],
	['duplicate repository', canonical + '?repository=default&repository=default'],
	['extra query', canonical + '?view=view&extra=1'],
	['encoded view key', canonical + '?%76iew=view'],
	['encoded view value', canonical + '?view=%76iew'],
	['empty query', canonical + '?'],
	['fragment', canonical + '#fragment'],
	['empty fragment', canonical + '#'],
	['default view plus fragment', canonical + '?view=view#fragment'],
	['hash document route', base + '/#' + '/browse' + nativePath],
]) {
	test('native document identity rejects ' + name, () => {
		assert.equal(isExactNativeDocumentRoute(value, document, base), false);
	});
}

test('metadata binds the path to the configured UID and default repository', () => {
	for (const value of [
		null,
		[],
		{ ...metadata, uid: documentId + '-other' },
		{ ...metadata, uid: 'prefix-' + documentId },
		{ ...metadata, uid: undefined },
		{ ...metadata, repository: 'other' },
		{ ...metadata, repository: undefined },
		{ ...metadata, isVersion: true },
		{ ...metadata, path: undefined },
		{ ...metadata, path: '/' },
		{ ...metadata, path: 'relative/path' },
		{ ...metadata, path: nativePath + '/' },
		{ ...metadata, path: '/default-domain//file' },
		{ ...metadata, path: '/default-domain/../file' },
		{ ...metadata, path: '/default-domain/./file' },
		{ ...metadata, path: '/default-domain/file\n' },
	])
		assert.throws(() => nativeDocumentIdentity(value, documentId), /PRECONDITION NOT MET/);
	assert.throws(() => nativeDocumentIdentity(metadata, documentId + '\n'));
	assert.equal(
		isExactNativeDocumentRoute(canonical, { ...document, repository: 'other' }, base),
		false,
	);
});

test('canonical native path encoding and reserved route prefixes remain exact', () => {
	const encoded = nativeDocumentIdentity(
		{ ...metadata, path: "/default-domain/a b?'" },
		documentId,
	);
	assert.equal(nativeDocumentRouteUrl(base, encoded), base + '/browse/default-domain/a%20b%3F%27');
	for (const path of ['/documents/file', '/collections/file', '/path/file']) {
		const reserved = nativeDocumentIdentity({ ...metadata, path }, documentId);
		assert.equal(nativeDocumentRouteUrl(base, reserved), base + '/browse/path' + path);
		assert.equal(isExactNativeDocumentRoute(base + '/browse' + path, reserved, base), false);
	}
});

test('metadata read uses the supplied session request, exact repository URL and no redirects', async () => {
	const calls = [];
	const request = {
		get: async (url, options) => {
			calls.push({ url, options });
			return { status: () => 200, json: async () => metadata };
		},
	};
	assert.deepEqual(
		await readNativeDocumentIdentity(request, 'http://localhost:8080/nuxeo/', documentId),
		document,
	);
	assert.deepEqual(calls, [
		{
			url: 'http://localhost:8080/nuxeo/api/v1/repo/default/id/' + documentId,
			options: { maxRedirects: 0, timeout: 15_000, headers: { Accept: 'application/json' } },
		},
	]);
});

for (const status of [301, 302, 307, 308, 401, 403, 404, 500]) {
	test('metadata read rejects status ' + status + ' before reading its body', async () => {
		const request = {
			get: async () => ({
				status: () => status,
				json: () => assert.fail('Unexpected response body must not be read'),
			}),
		};
		await assert.rejects(
			readNativeDocumentIdentity(request, 'http://localhost:8080/nuxeo', documentId),
			/PRECONDITION NOT MET/,
		);
	});
}

test('metadata read rejects unsafe configured endpoints before transport', async () => {
	const request = { get: () => assert.fail('Unsafe endpoint must not be requested') };
	for (const api of [
		'https://outside.example/nuxeo',
		'http://user:secret@localhost:8080/nuxeo',
		'http://localhost:8080/nuxeo?query=1',
		'http://localhost:8080/nuxeo#fragment',
	])
		await assert.rejects(
			readNativeDocumentIdentity(request, api, documentId),
			/PRECONDITION NOT MET/,
		);
	await assert.rejects(
		readNativeDocumentIdentity(request, 'http://localhost:8080/nuxeo', '../other'),
		/PRECONDITION NOT MET/,
	);
});

test('metadata parse and identity failures are sanitized without response or transport details', async () => {
	for (const request of [
		{
			get: async () => {
				throw new Error('private-session-data');
			},
		},
		{
			get: async () => ({
				status: () => 200,
				json: async () => {
					throw new Error('private-response-data');
				},
			}),
		},
		{ get: async () => ({ status: () => 200, json: async () => ({ ...metadata, uid: 'other' }) }) },
	])
		await assert.rejects(
			readNativeDocumentIdentity(request, 'http://localhost:8080/nuxeo', documentId),
			(error) => {
				assert.match(error.message, /^PRECONDITION NOT MET:/);
				assert.doesNotMatch(error.message, /private|other|http/);
				return true;
			},
		);
});
