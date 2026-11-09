import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
	assetIdentityAllowed,
	baselineIssue,
	requestAllowed,
	routeUrl,
	safeUrl,
	settings,
	validateManifest,
} from './policy.mjs';
import { aggregate } from './report.mjs';
import { comparePixels } from './pixels.mjs';

const manifest = JSON.parse(readFileSync('e2e/parity/scenarios.json', 'utf8'));
test('local mode cannot inherit credentials; hosted mode needs an explicit runtime opt-in', () => {
	const local = settings({ PARITY_USERNAME: 'private-user', PARITY_PASSWORD: 'private-password' });
	assert.equal(local.mode, 'local');
	assert.equal(local.username, undefined);
	assert.equal(local.password, undefined);
	for (const env of [
		{ PARITY_MODE: 'hosted' },
		{ PARITY_MODE: 'hosted', PARITY_ALLOW_HOSTED: 'read-only' },
	])
		assert.throws(() => settings(env), /PARITY PRECONDITION/);
	const hostedEnv = {
		PARITY_MODE: 'hosted',
		PARITY_ALLOW_HOSTED: 'read-only',
		PARITY_USERNAME: 'u',
		PARITY_PASSWORD: 'p',
		PARITY_REFERENCE_ORIGIN: 'https://reference.example',
		PARITY_CANDIDATE_ORIGIN: 'https://candidate.example',
	};
	for (const env of [
		{ ...hostedEnv, PARITY_REFERENCE_ORIGIN: undefined },
		{ ...hostedEnv, PARITY_CANDIDATE_ORIGIN: 'http://candidate.example' },
		{ ...hostedEnv, PARITY_CANDIDATE_ORIGIN: 'https://candidate.example/nuxeo/' },
		{ ...hostedEnv, PARITY_REFERENCE_ORIGIN: 'https://u:p@reference.example' },
		{ ...hostedEnv, PARITY_REFERENCE_ORIGIN: 'https://reference.example/?token=x' },
		{ ...hostedEnv, PARITY_REFERENCE_ORIGIN: 'not a url' },
	])
		assert.throws(() => settings(env), /PARITY PRECONDITION/);
	const hosted = settings(hostedEnv);
	assert.equal(hosted.mode, 'hosted');
	assert.deepEqual(hosted.bases, {
		local: 'http://127.0.0.1:4314/',
		reference: 'https://reference.example/nuxeo/ui/',
		candidate: 'https://candidate.example/nuxeo/ng/',
	});
	assert.deepEqual(hosted.origins, ['https://reference.example', 'https://candidate.example']);
	assert.deepEqual(
		settings({ ...hostedEnv, PARITY_CANDIDATE_ORIGIN: 'https://reference.example/' }).origins,
		['https://reference.example'],
	);
	assert.deepEqual(settings({}).bases, { local: 'http://127.0.0.1:4314/' });
	assert.deepEqual(settings({}).origins, []);
	assert.throws(() => settings({ PARITY_RUN_ID: '../overwrite' }), /PARITY PRECONDITION/);
	assert.equal(
		settings({ PARITY_SCENARIO: 'shell.rest.en-default' }).scenario,
		'shell.rest.en-default',
	);
});
test('capture routes cannot escape their application or carry authentication state', () => {
	const base = 'https://reference.example/nuxeo/ui/';
	assert.equal(routeUrl(base, '/#!/browse'), `${base}#!/browse`);
	for (const route of [
		'//evil.example/',
		'https://evil.example',
		'../ng/',
		'%2e%2e/ng/',
		'/?access_token=secret',
		'/#access_token=secret',
	])
		assert.throws(() => routeUrl(base, route), /PARITY PRECONDITION/);
	assert.equal(
		safeUrl('https://reference.example/nuxeo/ui/main.js?token=secret#private'),
		'https://reference.example/nuxeo/ui/main.js',
	);
});
test('read-only boundary rejects hosted writes, unknown automation, redirects destinations and other origins', () => {
	const base = 'https://reference.example/nuxeo/';
	const origins = ['https://reference.example', 'https://candidate.example'];
	const hostedAllowed = (method, url) => requestAllowed('hosted', method, url, origins);
	assert.equal(requestAllowed('hosted', 'GET', `${base}ui/main.bundle.js`), false);
	assert.equal(hostedAllowed('GET', 'https://candidate.example/nuxeo/ng/main.js'), true);
	assert.equal(hostedAllowed('GET', 'https://other.example/nuxeo/ui/main.js'), false);
	assert.equal(hostedAllowed('GET', `${base}ui/main.bundle.js`), true);
	assert.equal(hostedAllowed('POST', `${base}site/automation/Document.Query`), true);
	assert.equal(hostedAllowed('POST', `${base}site/automation/Repository.PageProvider`), true);
	for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'])
		assert.equal(hostedAllowed(method, `${base}api/v1/id/private`), false);
	for (const path of [
		'site/automation/Document.Delete',
		'site/automation/Custom.Query',
		'logout',
		'nxlogout',
		'%6e%78logout',
	])
		assert.equal(
			hostedAllowed(path.includes('automation') ? 'POST' : 'GET', `${base}${path}`),
			false,
		);
	for (const url of [
		'https://evil.example/nuxeo/ui/',
		'https://reference.example/admin',
		'https://u:p@reference.example/nuxeo/ui/',
	])
		assert.equal(hostedAllowed('GET', url), false);
	assert.equal(requestAllowed('local', 'GET', 'http://127.0.0.1:4314/main.js'), true);
	assert.equal(requestAllowed('local', 'GET', base), false);
	assert.equal(requestAllowed('local', 'GET', 'http://127.0.0.1:4310/'), false);
	assert.equal(requestAllowed('local', 'POST', 'http://127.0.0.1:4314/'), false);
});
test('asset identity hashes served static JS/CSS while excluding dynamic configuration and inline sources', () => {
	for (const url of [
		'https://reference.example/nuxeo/ui/main.bundle.js',
		'http://127.0.0.1:4314/styles.css',
	])
		assert.equal(assetIdentityAllowed(url), true);
	for (const url of [
		'data:text/javascript,private',
		'blob:https://reference.example/private',
		'https://reference.example/nuxeo/ui/config.jsp',
		'http://127.0.0.1:4314/env.js',
		'https://reference.example/nuxeo/api/v1/me',
	])
		assert.equal(assetIdentityAllowed(url), false);
});
test('strict schema and cross references reject widened scope, masks, bindings, unknown fixtures and metrics', () => {
	assert.equal(validateManifest(structuredClone(manifest)).scenarios.length, 28);
	const changes = [
		(m) => {
			m.scope.referenceReadOnly = false;
		},
		(m) => {
			m.captureDefaults.masks = [{ selector: 'body' }];
		},
		(m) => {
			m.scenarios[0].fixtures = ['unknown-fixture'];
		},
		(m) => {
			m.scenarios[0].inventory = ['F99'];
		},
		(m) => {
			m.fixtures['hosted-reader'].identity = { private: 'binding' };
		},
		(m) => {
			m.scenarios[0].excludedRegions = [{ selector: 'main' }];
		},
		(m) => {
			m.scenarios[0].targets.local.measurements[0].property = 'unknown-property';
		},
		(m) => {
			m.scenarios[0].targets.local.steps = [{ type: 'click', selector: 'button', safe: false }];
		},
	];
	for (const change of changes) {
		const m = structuredClone(manifest);
		change(m);
		assert.throws(() => validateManifest(m), /PARITY PRECONDITION/);
	}
});
test('failed, mislabeled, blocked and stale-identity reference captures never become a match', () => {
	const expected = {
		path: '/nuxeo/ui/main.bundle.js',
		sha256: 'a'.repeat(64),
		source: 'independent observation',
	};
	const valid = {
		status: 'captured-unverified',
		scenario: 'shell.rest',
		target: 'reference',
		blocked: [],
		measurements: [{ matched: true }],
		images: { viewport: {} },
		assets: [{ url: `https://reference.example${expected.path}`, sha256: expected.sha256 }],
		identityVerified: true,
	};
	assert.equal(baselineIssue(valid, 'shell.rest', 'reference', expected), undefined);
	for (const patch of [
		{ status: 'failed' },
		{ scenario: 'other' },
		{ target: 'candidate' },
		{ blocked: [{}] },
		{ measurements: [{ matched: false }] },
		{ images: {} },
		{ assets: [] },
	])
		assert.ok(baselineIssue({ ...valid, ...patch }, 'shell.rest', 'reference', expected));
	assert.ok(
		baselineIssue(valid, 'shell.rest', 'reference', { ...expected, sha256: 'b'.repeat(64) }),
	);
});
test('pixel comparison keeps every pixel and rejects changed pixels and dimensions', () => {
	const require = createRequire(resolve('package.json'));
	const { PNG } = require(
		join(dirname(require.resolve('playwright-core/package.json')), 'lib/utilsBundle.js'),
	);
	const image = new PNG({ width: 2, height: 2 });
	image.data.fill(255);
	const first = PNG.sync.write(image);
	assert.equal(comparePixels(first, first).matched, true);
	image.data[0] = 0;
	const different = comparePixels(first, PNG.sync.write(image));
	assert.equal(different.matched, false);
	assert.equal(different.changedPixels, 1);
	assert.ok(different.diff.length > 0);
	assert.equal(
		comparePixels(first, PNG.sync.write(new PNG({ width: 1, height: 1 }))).reason,
		'dimensions',
	);
});
test('aggregation retains failed worker results and cannot pass a missing or mislabeled report', () => {
	const dir = mkdtempSync(join(tmpdir(), 'parity-report-'));
	try {
		assert.equal(aggregate(dir, ['first'], 'local', 'test', 0).captureChecksPassed, false);
		writeFileSync(
			join(dir, 'first.result.json'),
			JSON.stringify({ scenario: 'first', status: 'failed' }),
		);
		writeFileSync(
			join(dir, 'second.result.json'),
			JSON.stringify({ scenario: 'second', status: 'captured-unverified' }),
		);
		const result = aggregate(dir, ['first', 'second'], 'local', 'test', 0);
		assert.equal(result.captureChecksPassed, false);
		assert.deepEqual(
			result.results.map((row) => row.status),
			['failed', 'captured-unverified'],
		);
		assert.equal(result.parityVerified, false);
		writeFileSync(
			join(dir, 'first.result.json'),
			JSON.stringify({ scenario: 'wrong', status: 'captured-unverified' }),
		);
		assert.equal(aggregate(dir, ['first'], 'local', 'test', 0).captureChecksPassed, false);
		assert.equal(aggregate(dir, ['second'], 'local', 'test', null).captureChecksPassed, false);
		assert.equal(
			aggregate(dir, ['second', 'second'], 'local', 'test', 0).captureChecksPassed,
			false,
		);
		writeFileSync(
			join(dir, 'unexpected.result.json'),
			JSON.stringify({ scenario: 'unexpected', status: 'captured-unverified' }),
		);
		assert.equal(aggregate(dir, ['second'], 'local', 'test', 0).captureChecksPassed, false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
test('runner fails invalid CLI/hosted opt-in without printing runtime credentials or launching a server', () => {
	const secret = 'not-for-output-private';
	for (const args of [['--unsupported=yes'], ['--mode=hosted'], ['--scenario=unknown.scenario']]) {
		const result = spawnSync(process.execPath, ['e2e/parity/run.mjs', ...args], {
			encoding: 'utf8',
			env: {
				...process.env,
				PARITY_ALLOW_HOSTED: '',
				PARITY_USERNAME: secret,
				PARITY_PASSWORD: secret,
			},
		});
		assert.notEqual(result.status, 0);
		assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
	}
});
test('runner refuses to overwrite an existing capture directory', () => {
	const id = `guard-existing-${process.pid}`;
	const directory = resolve('dist/verification/parity', id);
	mkdirSync(directory, { recursive: true });
	const marker = join(directory, 'fixed-reference.txt');
	writeFileSync(marker, 'fixed');
	try {
		const result = spawnSync(process.execPath, ['e2e/parity/run.mjs', `--run-id=${id}`], {
			encoding: 'utf8',
		});
		assert.notEqual(result.status, 0);
		assert.equal(readFileSync(marker, 'utf8'), 'fixed');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
