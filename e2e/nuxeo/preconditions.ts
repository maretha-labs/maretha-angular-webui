import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { externalStatePath, readPreparedSession } from './prepared-session';
import { assertNativeReachability } from './reachability.mjs';

export function localUrl(value: string | undefined, name: string): string {
	if (!value) throw new Error(`PRECONDITION NOT MET: ${name} must name the local test deployment.`);
	const url = new URL(value);
	if (
		!['http:', 'https:'].includes(url.protocol) ||
		!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
		url.username ||
		url.password ||
		url.search ||
		url.hash
	)
		throw new Error(
			`PRECONDITION NOT MET: ${name} must be a loopback HTTP(S) URL without credentials, query or fragment.`,
		);
	return url.href.replace(/\/$/, '');
}

export function settings() {
	const app = localUrl(process.env['NUXEO_E2E_BASE_URL'], 'NUXEO_E2E_BASE_URL');
	const api = localUrl(process.env['NUXEO_E2E_API_URL'], 'NUXEO_E2E_API_URL');
	const storageState = process.env['NUXEO_E2E_STORAGE_STATE'];
	if (!storageState || !existsSync(storageState))
		throw new Error(
			'PRECONDITION NOT MET: provide NUXEO_E2E_STORAGE_STATE pointing to a user-prepared authenticated Playwright state file. No credentials are discovered or submitted by this suite.',
		);
	try {
		externalStatePath(storageState);
	} catch {
		throw new Error(
			'PRECONDITION NOT MET: authenticated storage state must be outside the checkout.',
		);
	}
	const sessionPath = process.env['NUXEO_E2E_SESSION_STATE'];
	const session = sessionPath ? readPreparedSession(sessionPath, app, api) : undefined;
	const documentId = process.env['NUXEO_E2E_DOCUMENT_ID'];
	if (!documentId || !/^[A-Za-z0-9_-]+$/.test(documentId))
		throw new Error(
			'PRECONDITION NOT MET: NUXEO_E2E_DOCUMENT_ID must identify an existing readable test document.',
		);
	return {
		app,
		api,
		storageState,
		session,
		documentId,
		search: process.env['NUXEO_E2E_SEARCH_TERM'] || documentId,
	};
}

export default async function preconditions(): Promise<void> {
	const report = resolve('dist/verification/nuxeo/precondition.json');
	mkdirSync(resolve('dist/verification/nuxeo'), { recursive: true });
	try {
		const config = settings();
		await assertNativeReachability(config.app, config.api);
		writeFileSync(
			report,
			JSON.stringify(
				{
					status: 'SERVER_REACHABLE_AUTH_NOT_YET_VERIFIED',
					scope: 'local Nuxeo critical paths; not hosted-to-installed acceptance',
				},
				null,
				2,
			),
		);
	} catch (error) {
		const message =
			error instanceof Error && error.message.startsWith('PRECONDITION NOT MET:')
				? error.message
				: 'PRECONDITION NOT MET: configured local WebUI or Nuxeo server is unavailable.';
		writeFileSync(
			report,
			JSON.stringify(
				{ status: 'PRECONDITION NOT MET', reason: message, executedCriticalPaths: 0 },
				null,
				2,
			),
		);
		// Never attach raw URL/network causes: configuration may contain credentials.
		// eslint-disable-next-line preserve-caught-error
		throw new Error(message);
	}
}
