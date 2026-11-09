import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isLoopbackRequest } from '../../local-boundary.mjs';

export const fixtureFailure = () =>
	new Error('NATIVE CI FIXTURE: dedicated fixture identity, paths or credentials are not valid.');
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

export function externalFile(path, privateFile = false, checkout = process.cwd()) {
	if (typeof path !== 'string' || !isAbsolute(path)) throw fixtureFailure();
	const stat = lstatSync(path);
	if (
		!stat.isFile() ||
		stat.isSymbolicLink() ||
		stat.size > 65_536 ||
		(privateFile && stat.mode & 0o077)
	)
		throw fixtureFailure();
	const actual = realpathSync(path);
	const inside = relative(realpathSync(checkout), actual);
	if (inside !== '..' && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))
		throw fixtureFailure();
	return actual;
}

export function checkedFixture(value) {
	if (
		!value ||
		value.format !== 'maretha.nuxeo-ci-fixture' ||
		value.version !== 1 ||
		!identifier.test(value.id) ||
		!/^[a-f0-9]{64}$/.test(value.nonce)
	)
		throw fixtureFailure();
	for (const key of ['api', 'app']) {
		if (typeof value[key] !== 'string' || !isLoopbackRequest(value[key])) throw fixtureFailure();
		const url = new URL(value[key]);
		if (url.search || url.hash || url.href.replace(/\/$/, '') !== value[key])
			throw fixtureFailure();
	}
	const api = new URL(value.api),
		app = new URL(value.app);
	if (
		api.origin !== app.origin ||
		api.pathname !== '/nuxeo' ||
		!/^\/nuxeo\/[A-Za-z][A-Za-z0-9_-]*$/.test(app.pathname)
	)
		throw fixtureFailure();
	if (
		!identifier.test(value.applicationId) ||
		!identifier.test(value.clientId) ||
		!/^[A-Za-z0-9_-]+$/.test(value.documentId) ||
		!/^\d+\.\d+$/.test(value.configurationVersion)
	)
		throw fixtureFailure();
	if (
		typeof value.searchTerm !== 'string' ||
		!value.searchTerm.trim() ||
		value.searchTerm.length > 128 ||
		/[\r\n\0]/.test(value.searchTerm)
	)
		throw fixtureFailure();
	for (const key of ['webRoot', 'credentials'])
		if (typeof value[key] !== 'string' || !isAbsolute(value[key]) || /[\r\n\0]/.test(value[key]))
			throw fixtureFailure();
	if (
		value.webRoot !== resolve(value.webRoot) ||
		!value.webRoot.endsWith(`/nxserver/nuxeo.war${app.pathname.slice('/nuxeo'.length)}`)
	)
		throw fixtureFailure();
	return value;
}

export function readFixture(path = process.env.NUXEO_E2E_FIXTURE_CONFIG) {
	return checkedFixture(JSON.parse(readFileSync(externalFile(path), 'utf8')));
}

export function checkedCredentials(value) {
	if (
		!value ||
		typeof value.username !== 'string' ||
		!/^maretha_ci_[A-Za-z0-9_]+$/.test(value.username) ||
		typeof value.password !== 'string' ||
		value.password.length < 24 ||
		value.password.length > 256 ||
		/[\r\n\0]/.test(value.password)
	)
		throw fixtureFailure();
	return value;
}

export function readCredentials(fixture) {
	return checkedCredentials(
		JSON.parse(readFileSync(externalFile(fixture.credentials, true), 'utf8')),
	);
}

export function sameMarker(marker, fixture) {
	return (
		marker?.format === 'maretha.nuxeo-ci-instance' &&
		marker.version === 1 &&
		marker.id === fixture.id &&
		marker.nonce === fixture.nonce
	);
}

export async function verifyInstance(fixture, fetcher = fetch) {
	const response = await fetcher(`${fixture.app}/maretha-ci-fixture.json`, {
		redirect: 'error',
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok || !sameMarker(await response.json(), fixture)) throw fixtureFailure();
}

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
