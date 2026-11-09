import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { parsePreparedSession, restorePreparedSession } from './prepared-session.ts';

const app = 'http://localhost:8080/nuxeo/authoring-local';
const api = 'http://localhost:8080/nuxeo';
const prefix = `maretha.auth.${encodeURIComponent(JSON.stringify([api, 'maretha-authoring-local', `${app}/#`]))}.`;
const sample = () => ({
	format: 'maretha.nuxeo-e2e-session',
	version: 1,
	applicationBase: app,
	origin: new URL(app).origin,
	entries: [
		{ name: `${prefix}accessToken`, value: 'synthetic-test-token' },
		{ name: `${prefix}accessTokenValidity`, value: new Date(2_000).toISOString() },
	],
});

test('prepared auth requires a current token scoped to the exact application and API', () => {
	assert.equal(parsePreparedSession(sample(), app, api, 1_000).entries.length, 2);
	assert.throws(() => parsePreparedSession(sample(), app, api, 3_000));
	assert.throws(() => parsePreparedSession(sample(), `${app}-other`, api, 1_000));
	assert.throws(() => parsePreparedSession(sample(), app, `${api}-other`, 1_000));
	const invalid = sample();
	invalid.entries[1].name = `${prefix}accessToken`;
	assert.throws(() => parsePreparedSession(invalid, app, api, 1_000));
});

test('only scoped auth entries can be restored; malformed scopes never qualify', () => {
	for (const name of [
		'maretha.auth.%invalid.accessToken',
		'other.accessToken',
		`${prefix}returnUrl`,
	]) {
		const invalid = sample();
		invalid.entries[0].name = name;
		assert.throws(() => parsePreparedSession(invalid, app, api, 1_000));
	}
});

test('session injection stays within the exact app path and origin', async () => {
	let script, prepared;
	await restorePreparedSession(
		{
			addInitScript: async (callback, value) => {
				script = callback;
				prepared = value;
			},
		},
		sample(),
	);
	for (const [url, expected] of [
		[`${app}/`, 2],
		[`${app}/route`, 2],
		[`${app}-other/`, 0],
		[`${api}/login.jsp`, 0],
		['http://127.0.0.1:8080/nuxeo/authoring-local/', 0],
	]) {
		const restored = [];
		vm.runInNewContext(`(${script.toString()})(prepared)`, {
			prepared,
			URL,
			location: new URL(url),
			sessionStorage: { setItem: (name, value) => restored.push([name, value]) },
		});
		assert.equal(restored.length, expected, url);
	}
});
