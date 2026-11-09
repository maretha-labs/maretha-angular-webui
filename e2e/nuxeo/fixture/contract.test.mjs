import assert from 'node:assert/strict';
import test from 'node:test';
import {
	chmodSync,
	realpathSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	checkedCredentials,
	checkedFixture,
	externalFile,
	sameMarker,
	verifyInstance,
} from './contract.mjs';
import { candidateFiles } from './install-candidate.mjs';
import { cleanState, environmentFor } from './prepare-state.mjs';

const fixture = () => ({
	format: 'maretha.nuxeo-ci-fixture',
	version: 1,
	id: 'maretha-runtime-ci',
	nonce: 'a'.repeat(64),
	api: 'http://localhost:18080/nuxeo',
	app: 'http://localhost:18080/nuxeo/authoring',
	applicationId: 'maretha-authoring-demo',
	clientId: 'maretha-runtime-ci',
	documentId: 'synthetic-document',
	searchTerm: 'Synthetic document',
	configurationVersion: '0.0',
	webRoot: '/srv/nuxeo-ci/server/nxserver/nuxeo.war/authoring',
	credentials: '/srv/nuxeo-ci/credentials.json',
});
const marker = (f) => ({
	format: 'maretha.nuxeo-ci-instance',
	version: 1,
	id: f.id,
	nonce: f.nonce,
});
function scratch(t) {
	const p = mkdtempSync(join(tmpdir(), 'native-fixture-guards-'));
	t.after(() => rmSync(p, { recursive: true, force: true }));
	return p;
}

test('fixture requires the exact loopback origin, public native app path and dedicated marker', () => {
	assert.equal(checkedFixture(fixture()).id, 'maretha-runtime-ci');
	for (const replacement of [
		{ api: 'https://nuxeo.example/nuxeo' },
		{ app: 'http://localhost:18081/nuxeo/authoring' },
		{ app: 'http://user:password@localhost:18080/nuxeo/authoring' },
		{ api: 'http://localhost:18080/nuxeo?token=private' },
		{ app: 'http://localhost:18080/nuxeo/authoring/../other' },
		{ webRoot: '/var/lib/production/web' },
		{ nonce: '' },
		{ searchTerm: 'Synthetic\nINJECTED=value' },
		{ configurationVersion: 'latest' },
	])
		assert.throws(() => checkedFixture({ ...fixture(), ...replacement }));
	assert.equal(sameMarker(marker(fixture()), fixture()), true);
	assert.equal(sameMarker({ ...marker(fixture()), nonce: 'b'.repeat(64) }, fixture()), false);
});

test('native marker check rejects redirects, failures and another dedicated instance', async () => {
	let options;
	await verifyInstance(fixture(), async (_url, opts) => {
		options = opts;
		return { ok: true, json: async () => marker(fixture()) };
	});
	assert.equal(options.redirect, 'error');
	await assert.rejects(verifyInstance(fixture(), async () => ({ ok: false })));
	await assert.rejects(
		verifyInstance(fixture(), async () => ({
			ok: true,
			json: async () => marker({ ...fixture(), id: 'other' }),
		})),
	);
});

test('only explicitly provisioned synthetic credentials qualify', () => {
	assert.equal(
		checkedCredentials({ username: 'maretha_ci_runner', password: 'x'.repeat(32) }).username,
		'maretha_ci_runner',
	);
	for (const value of [
		{ username: 'Administrator', password: 'x'.repeat(32) },
		{ username: 'maretha_ci_runner', password: 'short' },
		{ username: 'maretha_ci_runner', password: `${'x'.repeat(32)}\n` },
	])
		assert.throws(() => checkedCredentials(value));
});

test('auth inputs must be regular owner-only files outside checkout; symlinks fail', (t) => {
	const root = scratch(t),
		checkout = join(root, 'checkout'),
		privatePath = join(root, 'private.json');
	mkdirSync(checkout);
	writeFileSync(privatePath, '{}', { mode: 0o600 });
	assert.equal(externalFile(privatePath, true, checkout), realpathSync(privatePath));
	chmodSync(privatePath, 0o644);
	assert.throws(() => externalFile(privatePath, true, checkout));
	chmodSync(privatePath, 0o600);
	symlinkSync(privatePath, join(root, 'link.json'));
	assert.throws(() => externalFile(join(root, 'link.json'), true, checkout));
	writeFileSync(join(checkout, 'private.json'), '{}', { mode: 0o600 });
	assert.throws(() => externalFile(join(checkout, 'private.json'), true, checkout));
});

test('candidate manifest binds every file and rejects symlink escapes or missing runtime', (t) => {
	const root = scratch(t);
	writeFileSync(join(root, 'index.html'), '<html></html>');
	assert.throws(() => candidateFiles(root));
	writeFileSync(join(root, 'main.123.js'), 'real candidate');
	mkdirSync(join(root, 'assets'));
	writeFileSync(join(root, 'assets', 'data.json'), '{"test":true}');
	const before = candidateFiles(root);
	assert.equal(before.length, 3);
	writeFileSync(join(root, 'main.123.js'), 'stale candidate');
	assert.notEqual(
		candidateFiles(root).find((f) => f.path.endsWith('.js')).sha256,
		before.find((f) => f.path.endsWith('.js')).sha256,
	);
	symlinkSync('/etc/hosts', join(root, 'assets', 'external'));
	assert.throws(() => candidateFiles(root));
});

test('cleanup deletes only an exact job-owned direct child, never another job or parent', (t) => {
	const temporary = scratch(t),
		root = mkdtempSync(join(temporary, 'maretha-native-ci-state-'));
	writeFileSync(
		join(root, 'owner.json'),
		JSON.stringify({ format: 'maretha.nuxeo-ci-state', fixtureId: 'maretha-runtime-ci' }),
	);
	writeFileSync(join(root, 'session.json'), 'synthetic private state');
	assert.throws(() => cleanState(root, 'another-fixture', temporary));
	assert.throws(() => cleanState(temporary, 'maretha-runtime-ci', temporary));
	cleanState(root, 'maretha-runtime-ci', temporary);
	assert.throws(() => externalFile(join(root, 'session.json')));
});

test('workflow environment contains identity and private paths but no authentication material', () => {
	const env = environmentFor(fixture(), '/tmp/maretha-native-ci-state-test');
	assert.equal(env.NUXEO_E2E_BASE_HREF, '/nuxeo/authoring/');
	assert.equal(env.NUXEO_E2E_DOCUMENT_ID, 'synthetic-document');
	assert.equal(
		Object.keys(env).some((key) => /password|token|credential/i.test(key)),
		false,
	);
});
