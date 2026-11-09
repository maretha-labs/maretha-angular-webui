import assert from 'node:assert/strict';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { unzipSync, zipSync } from 'fflate';
import {
	jarManifest,
	packageName,
	packageProblems,
	packageZip,
	rewriteGaps,
	uiJar,
	versionMismatches,
	zipEntries,
} from './nuxeo-package.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (bytes) => new TextDecoder().decode(bytes);

/** Central-directory names, host system and external attributes, in order. */
function centralDirectory(zip) {
	const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
	const entries = [];
	for (let at = 0; at + 46 <= zip.length; at++) {
		if (view.getUint32(at, true) !== 0x02014b50) continue;
		const nameLength = view.getUint16(at + 28, true);
		entries.push({
			name: text(zip.subarray(at + 46, at + 46 + nameLength)),
			os: zip[at + 5],
			attrs: view.getUint32(at + 38, true),
			dosTime: view.getUint32(at + 12, true),
		});
		at += 45 + nameLength;
	}
	return entries;
}

describe('repository inputs', () => {
	it('carry one version and serve every route', () => {
		assert.deepEqual(versionMismatches(repo), []);
		assert.deepEqual(rewriteGaps(repo), []);
		assert.deepEqual(packageProblems(repo), []);
	});

	it('carry LICENSE and a NOTICE that repeats every source NOTICE', () => {
		assert.ok(existsSync(path.join(repo, 'LICENSE')));
		const notice = readFileSync(path.join(repo, 'NOTICE'), 'utf8');
		for (const source of ['app/extensions/NOTICE', 'assets/themes/NOTICE'])
			assert.ok(notice.includes(readFileSync(path.join(repo, source), 'utf8')), source);
	});
});

describe('jarManifest', () => {
	it('writes CRLF line ends and a closing blank line', () => {
		assert.equal(jarManifest('A: 1\nB: 2\n'), 'A: 1\r\nB: 2\r\n\r\n');
		assert.equal(jarManifest('A: 1\r\nB: 2\r\n\r\n'), 'A: 1\r\nB: 2\r\n\r\n');
	});

	it('refuses an unwrapped line longer than 72 bytes', () => {
		assert.throws(() => jarManifest(`Nuxeo-Component: ${'x'.repeat(60)}\n`), /must be wrapped/);
	});
});

describe('zipEntries', () => {
	it('adds each directory before its first child and fixes time and permissions', () => {
		const zip = zipEntries([
			['b/x.txt', new Uint8Array([1])],
			['a/y.txt', new Uint8Array([2])],
			['b/z/w.txt', new Uint8Array([3])],
		]);
		const entries = centralDirectory(zip);
		assert.deepEqual(
			entries.map((e) => e.name),
			['b/', 'b/x.txt', 'a/', 'a/y.txt', 'b/z/', 'b/z/w.txt'],
		);
		assert.ok(entries.every((e) => e.os === 3));
		assert.ok(entries.every((e) => (e.dosTime === 0 << 25) | (1 << 21) | (1 << 16)));
		assert.equal(entries[1].attrs >>> 16, 0o100644);
		assert.equal(entries[0].attrs >>> 16, 0o40755);
	});

	it('refuses duplicate and integer-like names', () => {
		assert.throws(
			() =>
				zipEntries([
					['a', new Uint8Array()],
					['a', new Uint8Array()],
				]),
			/Duplicate/,
		);
		assert.throws(() => zipEntries([['12', new Uint8Array()]]), /Unsupported/);
	});
});

describe('package assembly from a planted repository', () => {
	let root;
	const write = (file, value) => {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), value);
	};

	before(() => {
		root = mkdtempSync(path.join(tmpdir(), 'nuxeo-package-'));
		write('package.json', JSON.stringify({ version: '1.2.3' }));
		write(
			'package-lock.json',
			JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }),
		);
		write(
			'app/extensions/package.json',
			JSON.stringify({ name: '@maretha/webui-sdk', version: '1.2.3' }),
		);
		for (const pom of [
			'nuxeo/pom.xml',
			'nuxeo/ui/pom.xml',
			'nuxeo/server/pom.xml',
			'nuxeo/package/pom.xml',
		])
			write(pom, '<version>1.2.3</version>');
		for (const dir of ['nuxeo/ui/src/main/resources', 'nuxeo/package/src/main/resources'])
			cpSync(path.join(repo, dir), path.join(root, dir), { recursive: true });
		for (const file of [
			'nuxeo/ui/src/main/resources/META-INF/MANIFEST.MF',
			'nuxeo/server/src/main/resources/META-INF/MANIFEST.MF',
		])
			write(
				file,
				readFileSync(
					path.join(repo, 'nuxeo/ui/src/main/resources/META-INF/MANIFEST.MF'),
					'utf8',
				).replace(/^Bundle-Version: .*$/m, 'Bundle-Version: 1.2.3'),
			);
		write('app/app-routing.module.ts', "const routes = [{ path: 'browse' }, { path: '**' }];");
		write('dist/maretha-angular-webui/index.html', '<html></html>');
		write('dist/maretha-angular-webui/main.js', 'console.log(1);');
		write('dist/maretha-angular-webui/main.js.map', '{}');
		write('dist/maretha-angular-webui/assets/logo.svg', '<svg/>');
		write('LICENSE', 'Apache License 2.0');
		write('NOTICE', 'Maretha');
	});
	after(() => rmSync(root, { recursive: true, force: true }));

	const serverJar = zipSync({
		'META-INF/MANIFEST.MF': new TextEncoder().encode('Bundle-Version: 1.2.3\r\n\r\n'),
	});

	it('has no blocking problems and names both package kinds', () => {
		assert.deepEqual(packageProblems(root), []);
		assert.equal(packageName(root), 'maretha-angular-webui-package-1.2.3.zip');
		assert.equal(
			packageName(root, { uiOnly: true }),
			'maretha-angular-webui-package-1.2.3-ui-only.zip',
		);
	});

	it('writes the descriptors with the version and only the UI bundle by default', () => {
		const files = unzipSync(packageZip(root));
		assert.deepEqual(Object.keys(files).sort(), [
			'LICENSE',
			'NOTICE',
			'install.xml',
			'install/',
			'install/bundles/',
			'install/bundles/maretha-angular-webui-ui-1.2.3.jar',
			'package.xml',
		]);
		const descriptor = text(files['package.xml']);
		assert.match(descriptor, /version="1\.2\.3"/);
		assert.match(descriptor, /<version>\[2025\.0,2026\.0\)<\/version>/);
		assert.doesNotMatch(descriptor, /@VERSION@/);
	});

	it('adds a given server bundle unchanged', () => {
		const files = unzipSync(packageZip(root, { serverJar }));
		const bundled = files['install/bundles/maretha-angular-webui-server-1.2.3.jar'];
		assert.ok(bundled, 'the server bundle is in the package');
		assert.ok(Buffer.from(serverJar).equals(Buffer.from(bundled)));
		assert.ok('install/bundles/maretha-angular-webui-ui-1.2.3.jar' in files);
	});

	it('puts the manifest first in the UI bundle, adds notices and leaves out source maps and Maven metadata', () => {
		const jar = uiJar(root);
		const names = centralDirectory(jar).map((e) => e.name);
		assert.deepEqual(names.slice(0, 2), ['META-INF/', 'META-INF/MANIFEST.MF']);
		const files = unzipSync(jar);
		assert.match(
			text(files['META-INF/MANIFEST.MF']),
			/^Manifest-Version: 1\.0\r\n[\s\S]*Bundle-Version: 1\.2\.3\r\n[\s\S]*\r\n\r\n$/,
		);
		for (const name of [
			'OSGI-INF/deployment-fragment.xml',
			'OSGI-INF/auth-config.xml',
			'META-INF/LICENSE',
			'META-INF/NOTICE',
			'nuxeo.war/ng/index.html',
			'nuxeo.war/ng/main.js',
			'nuxeo.war/ng/assets/logo.svg',
		])
			assert.ok(name in files, `${name} is in the UI bundle`);
		assert.ok(!names.some((name) => name.endsWith('.map')), 'no source maps');
		assert.ok(!names.some((name) => name.startsWith('META-INF/maven/')), 'no Maven metadata');
	});

	it('is byte-identical across runs and time zones', () => {
		const zone = process.env.TZ;
		try {
			process.env.TZ = 'UTC';
			const first = packageZip(root, { serverJar });
			process.env.TZ = 'Asia/Kolkata';
			const second = packageZip(root, { serverJar });
			assert.ok(Buffer.from(first).equals(Buffer.from(second)));
		} finally {
			if (zone === undefined) delete process.env.TZ;
			else process.env.TZ = zone;
		}
	});

	it('blocks packaging on a version mismatch', () => {
		write('nuxeo/ui/pom.xml', '<version>1.2.2</version>');
		const problems = packageProblems(root);
		assert.ok(problems.some((p) => /nuxeo\/ui\/pom\.xml: expected <version>1\.2\.3/.test(p)));
		write('nuxeo/ui/pom.xml', '<version>1.2.3</version>');
	});

	it('blocks packaging when the lockfile root or the SDK carries another version', () => {
		write(
			'package-lock.json',
			JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.2' } } }),
		);
		assert.ok(
			packageProblems(root).some((p) =>
				/package-lock\.json: expected "version": "1\.2\.3"/.test(p),
			),
		);
		write(
			'package-lock.json',
			JSON.stringify({ version: '1.2.3', packages: { '': { version: '1.2.3' } } }),
		);
		write(
			'app/extensions/package.json',
			JSON.stringify({ name: '@maretha/webui-sdk', version: '0.2.0' }),
		);
		assert.ok(
			packageProblems(root).some((p) =>
				/app\/extensions\/package\.json: expected "version": "1\.2\.3"/.test(p),
			),
		);
		write(
			'app/extensions/package.json',
			JSON.stringify({ name: '@maretha/webui-sdk', version: '1.2.3' }),
		);
	});
});
