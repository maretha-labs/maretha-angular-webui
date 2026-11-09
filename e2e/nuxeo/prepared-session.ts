import type { BrowserContext } from '@playwright/test';
import { readFileSync, realpathSync, statSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';

export interface PreparedSession {
	format: 'maretha.nuxeo-e2e-session';
	version: 1;
	applicationBase: string;
	origin: string;
	entries: { name: string; value: string }[];
}

const failure = () =>
	new Error(
		'PRECONDITION NOT MET: prepared session state is invalid, expired, or belongs to another local application. Capture it again manually.',
	);

export function externalStatePath(path: string): string {
	if (!isAbsolute(path)) throw failure();
	const actual = realpathSync(path);
	const withinCheckout = relative(realpathSync(resolve('.')), actual);
	if (
		withinCheckout !== '..' &&
		!withinCheckout.startsWith(`..${sep}`) &&
		!isAbsolute(withinCheckout)
	)
		throw failure();
	return actual;
}

export function parsePreparedSession(
	value: unknown,
	app: string,
	api: string,
	now = Date.now(),
): PreparedSession {
	const session = value as PreparedSession;
	if (
		!session ||
		session.format !== 'maretha.nuxeo-e2e-session' ||
		session.version !== 1 ||
		session.applicationBase !== app ||
		session.origin !== new URL(app).origin ||
		!Array.isArray(session.entries) ||
		session.entries.length < 2 ||
		session.entries.length > 3
	)
		throw failure();
	const names = new Set<string>();
	let prefix: string | undefined;
	for (const entry of session.entries) {
		if (!entry || typeof entry.name !== 'string' || typeof entry.value !== 'string')
			throw failure();
		const match = /^maretha\.auth\.(.+)\.(accessToken|accessTokenValidity|refreshToken)$/.exec(
			entry.name,
		);
		if (!match || !entry.value || entry.value.length > 16_384 || names.has(entry.name))
			throw failure();
		const scope: unknown = JSON.parse(decodeURIComponent(match[1]));
		if (
			!Array.isArray(scope) ||
			scope.length !== 3 ||
			scope.some((part) => typeof part !== 'string') ||
			scope[0].replace(/\/$/, '') !== api ||
			!scope[1] ||
			scope[2].replace(/#.*$/, '').replace(/\/$/, '') !== app
		)
			throw failure();
		const candidate = `maretha.auth.${match[1]}.`;
		if (prefix !== undefined && prefix !== candidate) throw failure();
		prefix = candidate;
		names.add(entry.name);
	}
	const token = session.entries.find((entry) => entry.name === `${prefix}accessToken`);
	const validity = session.entries.find((entry) => entry.name === `${prefix}accessTokenValidity`);
	if (!token || !validity || !(Date.parse(validity.value) > now)) throw failure();
	return session;
}

export function readPreparedSession(path: string, app: string, api: string): PreparedSession {
	try {
		const actual = externalStatePath(path);
		if (!statSync(actual).isFile() || statSync(actual).size > 65_536) throw failure();
		return parsePreparedSession(JSON.parse(readFileSync(actual, 'utf8')), app, api);
	} catch {
		// Parse/network errors must never echo credential-bearing contents or URLs.
		throw failure();
	}
}

export async function restorePreparedSession(context: BrowserContext, session: PreparedSession) {
	await context.addInitScript((prepared) => {
		const base = new URL(prepared.applicationBase);
		if (
			location.origin !== prepared.origin ||
			!(location.pathname === base.pathname || location.pathname.startsWith(`${base.pathname}/`))
		)
			return;
		for (const entry of prepared.entries) sessionStorage.setItem(entry.name, entry.value);
	}, session);
}
