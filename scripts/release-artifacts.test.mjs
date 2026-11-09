import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { packageZip } from './nuxeo-package.mjs';
import {
	noticeProblems,
	packagePath,
	releaseArtifactProblems,
	SDK_NOTICES,
} from './release-artifacts.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encode = (value) => new TextEncoder().encode(value);

/** A gzipped ustar archive of { name, content } regular files. */
function tgz(entries) {
	const blocks = [];
	for (const { name, content } of entries) {
		const data = encode(content);
		const header = new Uint8Array(512);
		const put = (at, value) => header.set(encode(value), at);
		put(0, name);
		put(100, '0000644\0');
		put(108, '0000000\0');
		put(116, '0000000\0');
		put(124, `${data.length.toString(8).padStart(11, '0')}\0`);
		put(136, '00000000000\0');
		put(148, '        ');
		put(156, '0');
		put(257, 'ustar\0');
		put(263, '00');
		put(
			148,
			`${header
				.reduce((sum, byte) => sum + byte, 0)
				.toString(8)
				.padStart(6, '0')}\0 `,
		);
		blocks.push(header, data, new Uint8Array((512 - (data.length % 512)) % 512));
	}
	blocks.push(new Uint8Array(1024));
	return gzipSync(Buffer.concat(blocks.map((block) => Buffer.from(block))));
}

const sdkArchive = (names = SDK_NOTICES) =>
	tgz([
		{ name: 'package/package.json', content: '{"name":"@maretha/webui-sdk","version":"1.2.3"}' },
		...names.map((name) => ({ name, content: name })),
	]);
const bundleWith = (entries) =>
	zipSync({ 'META-INF/MANIFEST.MF': encode('Bundle-Version: 1.2.3\r\n\r\n'), ...entries });
const notices = { 'META-INF/LICENSE': encode('L'), 'META-INF/NOTICE': encode('N') };

describe('release artefacts of a planted repository', () => {
	let root;
	const write = (file, value) => {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), value);
	};
	const uiOnly = 'dist/nuxeo/maretha-angular-webui-package-1.2.3-ui-only.zip';

	before(() => {
		root = mkdtempSync(path.join(tmpdir(), 'release-artifacts-'));
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
		write(
			'nuxeo/ui/src/main/resources/META-INF/MANIFEST.MF',
			readFileSync(
				path.join(repo, 'nuxeo/ui/src/main/resources/META-INF/MANIFEST.MF'),
				'utf8',
			).replace(/^Bundle-Version: .*$/m, 'Bundle-Version: 1.2.3'),
		);
		write('dist/maretha-angular-webui/index.html', '<html></html>');
		write('dist/maretha-angular-webui/main.js', 'console.log(1)');
		write('dist/maretha-angular-webui/main.js.map', '{}');
		write('LICENSE', 'Apache License 2.0');
		write('NOTICE', 'Maretha');
	});
	after(() => rmSync(root, { recursive: true, force: true }));

	describe('with every artefact in place', () => {
		beforeEach(() => {
			write('dist/maretha-angular-webui/3rdpartylicenses.txt', 'MIT');
			write('dist/maretha-webui-sdk-1.2.3.tgz', sdkArchive());
			rmSync(path.join(root, 'dist/nuxeo'), { recursive: true, force: true });
			write(uiOnly, packageZip(root));
		});

		it('passes and lists what it checked', () => {
			assert.deepEqual(releaseArtifactProblems(root), {
				problems: [],
				checked: [
					'dist/maretha-angular-webui/3rdpartylicenses.txt',
					'dist/maretha-webui-sdk-1.2.3.tgz',
					uiOnly,
				],
			});
		});

		it('prefers the full package and checks the server bundle notices too', () => {
			const full = 'dist/nuxeo/maretha-angular-webui-package-1.2.3.zip';
			write(full, packageZip(root, { serverJar: bundleWith(notices) }));
			assert.equal(packagePath(root).relative, full);
			assert.deepEqual(releaseArtifactProblems(root).problems, []);
			write(full, packageZip(root, { serverJar: bundleWith({}) }));
			assert.deepEqual(noticeProblems(root).problems, [
				`${full} install/bundles/maretha-angular-webui-server-1.2.3.jar: META-INF/LICENSE is missing`,
				`${full} install/bundles/maretha-angular-webui-server-1.2.3.jar: META-INF/NOTICE is missing`,
			]);
		});
	});

	describe('with artefacts missing', () => {
		it('names the build commands and the missing notices', () => {
			for (const file of [
				'dist/maretha-angular-webui/3rdpartylicenses.txt',
				'dist/maretha-webui-sdk-1.2.3.tgz',
			])
				rmSync(path.join(root, file), { force: true });
			rmSync(path.join(root, 'dist/nuxeo'), { recursive: true, force: true });
			const { problems, checked } = releaseArtifactProblems(root);
			assert.deepEqual(checked, []);
			const text = problems.join('\n');
			assert.match(text, /3rdpartylicenses\.txt is missing: run npm run build:prod first/);
			assert.match(text, /maretha-webui-sdk-1\.2\.3\.tgz is missing: run npm run pack:sdk first/);
			assert.match(text, /dist\/nuxeo\/ holds neither .* nor .*ui-only\.zip/);

			write('dist/maretha-webui-sdk-1.2.3.tgz', sdkArchive(['package/NOTICE']));
			write(uiOnly, packageZip(root));
			const { problems: notice } = noticeProblems(root);
			assert.match(notice.join('\n'), /tgz: package\/LICENSE-APACHE-2\.0 is missing/);
			assert.match(notice.join('\n'), /tgz: package\/LICENSE-POLYMER-BSD is missing/);

			rmSync(path.join(root, 'NOTICE'));
			write(uiOnly, packageZip(root));
			const without = noticeProblems(root).problems.join('\n');
			assert.match(without, new RegExp(`${uiOnly.replaceAll('.', '\\.')}: NOTICE is missing`));
			assert.match(without, /maretha-angular-webui-ui-1\.2\.3\.jar: META-INF\/NOTICE is missing/);
			assert.doesNotMatch(without, /: LICENSE is missing/);
			write('NOTICE', 'Maretha');
		});
	});
});
