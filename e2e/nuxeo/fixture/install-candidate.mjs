import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import {
	digest,
	fixtureFailure,
	readFixture,
	readCredentials,
	sameMarker,
	verifyInstance,
} from './contract.mjs';

export function candidateFiles(root) {
	const files = [];
	function walk(dir) {
		for (const item of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, item.name);
			if (item.isSymbolicLink()) throw fixtureFailure();
			if (item.isDirectory()) walk(path);
			else if (item.isFile())
				files.push({
					path: relative(root, path).split('\\').join('/'),
					sha256: digest(readFileSync(path)),
				});
			else throw fixtureFailure();
		}
	}
	if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw fixtureFailure();
	walk(root);
	if (
		!files.some((f) => f.path === 'index.html') ||
		!files.some((f) => /^main.*\.js$/.test(f.path))
	)
		throw fixtureFailure();
	return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function installCandidate(fixture, build, revision) {
	if (!/^[a-f0-9]{40}$/.test(revision)) throw fixtureFailure();
	await verifyInstance(fixture);
	const credentials = readCredentials(fixture);
	const authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;
	const parent = dirname(fixture.webRoot);
	if (
		!sameMarker(JSON.parse(readFileSync(join(parent, 'maretha-ci-fixture.json'), 'utf8')), fixture)
	)
		throw fixtureFailure();
	if (
		lstatSync(parent).isSymbolicLink() ||
		(existsSync(fixture.webRoot) &&
			(!lstatSync(fixture.webRoot).isDirectory() || lstatSync(fixture.webRoot).isSymbolicLink()))
	)
		throw fixtureFailure();
	candidateFiles(build);
	const staging = mkdtempSync(join(parent, '.maretha-ci-candidate-'));
	const backup = `${staging}-previous`;
	let installed = false;
	try {
		cpSync(build, staging, { recursive: true });
		cpSync(join(parent, 'maretha-ci-fixture.json'), join(staging, 'maretha-ci-fixture.json'));
		const env = {
			nuxeoUrl: fixture.api,
			webAppUrl: `${fixture.app}/#`,
			authClientId: fixture.clientId,
			applicationId: fixture.applicationId,
			dashboardStatisticsDocumentTypes: ['Audio', 'Video', 'File'],
			addons: { retention: false },
		};
		writeFileSync(join(staging, 'env.js'), `window.__env = ${JSON.stringify(env)};\n`);
		const files = candidateFiles(staging);
		const binding = { format: 'maretha.nuxeo-ci-candidate', version: 1, revision, files };
		writeFileSync(join(staging, 'maretha-ci-candidate.json'), JSON.stringify(binding));
		if (existsSync(fixture.webRoot)) renameSync(fixture.webRoot, backup);
		renameSync(staging, fixture.webRoot);
		installed = true;
		// Verify the actual server response, not just a locally written revision marker.
		for (let i = 0; i < files.length; i += 8) {
			await Promise.all(
				files.slice(i, i + 8).map(async (file) => {
					const path = file.path.split('/').map(encodeURIComponent).join('/');
					const response = await fetch(`${fixture.app}/${path}`, {
						redirect: 'error',
						headers: { Authorization: authorization },
						signal: AbortSignal.timeout(30_000),
					});
					if (!response.ok || digest(Buffer.from(await response.arrayBuffer())) !== file.sha256)
						throw fixtureFailure();
				}),
			);
		}
		rmSync(backup, { recursive: true, force: true });
		mkdirSync('dist/verification/nuxeo', { recursive: true });
		writeFileSync(
			'dist/verification/nuxeo/candidate-binding.json',
			JSON.stringify({ ...binding, fixtureId: fixture.id }, null, 2),
		);
	} catch (error) {
		if (installed) rmSync(fixture.webRoot, { recursive: true, force: true });
		if (existsSync(backup)) renameSync(backup, fixture.webRoot);
		throw error;
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
	try {
		await installCandidate(
			readFixture(),
			resolve('dist/maretha-angular-webui'),
			process.env.GITHUB_SHA,
		);
	} catch {
		console.error(
			'NATIVE CI FIXTURE: current candidate installation or exact served-byte verification failed.',
		);
		process.exitCode = 1;
	}
}
