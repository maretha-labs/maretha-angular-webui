import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { zipSync } from 'fflate';
import { packageZip } from './nuxeo-package.mjs';
import {
	packageArchiveProblems,
	releaseProblems,
	sdkArchiveName,
	sdkArchiveProblems,
	tarEntries,
} from './release-identity.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const encode = (value) => new TextEncoder().encode(value);
const text = (bytes) => new TextDecoder().decode(bytes);

/** A gzipped ustar archive of { name, content, type = '0', prefix = '' } entries. */
function tgz(entries) {
	const blocks = [];
	for (const { name, content, type = '0', prefix = '' } of entries) {
		const data = typeof content === 'string' ? encode(content) : content;
		const header = new Uint8Array(512);
		const put = (at, value) => header.set(encode(value), at);
		put(0, name);
		put(100, '0000644\0');
		put(108, '0000000\0');
		put(116, '0000000\0');
		put(124, `${data.length.toString(8).padStart(11, '0')}\0`);
		put(136, '00000000000\0');
		put(148, '        ');
		put(156, type);
		put(257, 'ustar\0');
		put(263, '00');
		put(345, prefix);
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

/** A tarball as `npm pack` writes it for the SDK at `version`. */
const sdkArchive = (version, { notes = `## ${version} — unreleased\n` } = {}) =>
	tgz([
		{
			name: 'package/package.json',
			content: JSON.stringify({ name: '@maretha/webui-sdk', version }),
		},
		{ name: 'package/CHANGELOG.md', content: notes },
		{ name: 'package/index.d.ts', content: 'export {};' },
	]);

describe('tarEntries', () => {
	it('reads regular files, joins the ustar prefix and skips directories', () => {
		const entries = tarEntries(
			tgz([
				{ name: 'package/', content: '', type: '5' },
				{ name: 'package/a.txt', content: 'A' },
				{ name: 'b.txt', content: 'BB', prefix: 'package/deep' },
			]),
		);
		assert.deepEqual(Object.keys(entries), ['package/a.txt', 'package/deep/b.txt']);
		assert.equal(text(entries['package/deep/b.txt']), 'BB');
	});

	it('takes a long name from the pax header that precedes the entry', () => {
		const long = `package/${'x'.repeat(120)}.txt`;
		const record = ` path=${long}\n`;
		const pax = `${String(record.length + String(record.length + 2).length).length + record.length}${record}`;
		const entries = tarEntries(
			tgz([
				{ name: 'PaxHeader/x', content: pax, type: 'x' },
				{ name: long.slice(0, 100), content: 'long' },
				{ name: 'package/short.txt', content: 'short' },
			]),
		);
		assert.deepEqual(Object.keys(entries), [long, 'package/short.txt']);
	});

	it('reads the frozen SDK baseline that npm pack wrote', () => {
		const entries = tarEntries(readFileSync(path.join(repo, 'contracts/sdk-baseline/sdk.tgz')));
		const manifest = JSON.parse(text(entries['package/package.json']));
		const baseline = JSON.parse(
			readFileSync(path.join(repo, 'contracts/sdk-baseline/manifest.json'), 'utf8'),
		);
		assert.equal(manifest.name, baseline.package);
		assert.equal(manifest.version, baseline.version);
	});
});

describe('planted repository', () => {
	let root;
	const write = (file, value) => {
		mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
		writeFileSync(path.join(root, file), value);
	};
	const serverJar = (version) =>
		zipSync({ 'META-INF/MANIFEST.MF': encode(`Bundle-Version: ${version}\r\n\r\n`) });

	before(() => {
		root = mkdtempSync(path.join(tmpdir(), 'release-identity-'));
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
		write('LICENSE', 'Apache License 2.0');
		write('NOTICE', 'Maretha');
	});
	after(() => rmSync(root, { recursive: true, force: true }));

	describe('SDK archive', () => {
		it('is named after the scoped package and the version', () => {
			assert.equal(sdkArchiveName(root), 'maretha-webui-sdk-1.2.3.tgz');
		});

		it('passes when the name, the inner package.json and the release notes agree', () => {
			assert.deepEqual(
				sdkArchiveProblems(root, 'maretha-webui-sdk-1.2.3.tgz', sdkArchive('1.2.3')),
				[],
			);
		});

		it('reports another file name, another inner version and missing release notes', () => {
			assert.match(
				sdkArchiveProblems(root, 'maretha-webui-sdk-1.2.2.tgz', sdkArchive('1.2.3')).join('\n'),
				/expected the SDK archive to be named maretha-webui-sdk-1\.2\.3\.tgz/,
			);
			assert.match(
				sdkArchiveProblems(root, 'maretha-webui-sdk-1.2.3.tgz', sdkArchive('1.2.2')).join('\n'),
				/package\/package\.json has version 1\.2\.2, expected 1\.2\.3/,
			);
			assert.match(
				sdkArchiveProblems(
					root,
					'maretha-webui-sdk-1.2.3.tgz',
					sdkArchive('1.2.3', { notes: '## 1.2.2 — unreleased\n' }),
				).join('\n'),
				/CHANGELOG\.md has no "## 1\.2\.3" entry/,
			);
			assert.match(
				sdkArchiveProblems(root, 'maretha-webui-sdk-1.2.3.tgz', encode('not a tarball')).join('\n'),
				/not a gzipped tar/,
			);
		});
	});

	describe('package archive', () => {
		it('passes for the UI-only package and for the full package', () => {
			assert.deepEqual(
				packageArchiveProblems(
					root,
					'maretha-angular-webui-package-1.2.3-ui-only.zip',
					packageZip(root),
				),
				[],
			);
			assert.deepEqual(
				packageArchiveProblems(
					root,
					'maretha-angular-webui-package-1.2.3.zip',
					packageZip(root, { serverJar: serverJar('1.2.3') }),
				),
				[],
			);
		});

		it('reports another file name, a missing or stray bundle and a bundle with another version', () => {
			const full = packageZip(root, { serverJar: serverJar('1.2.3') });
			assert.match(
				packageArchiveProblems(root, 'maretha-angular-webui-package-1.2.2.zip', full).join('\n'),
				/expected maretha-angular-webui-package-1\.2\.3\.zip or maretha-angular-webui-package-1\.2\.3-ui-only\.zip/,
			);
			assert.match(
				packageArchiveProblems(
					root,
					'maretha-angular-webui-package-1.2.3.zip',
					packageZip(root),
				).join('\n'),
				/install\/bundles\/maretha-angular-webui-server-1\.2\.3\.jar is missing/,
			);
			assert.match(
				packageArchiveProblems(
					root,
					'maretha-angular-webui-package-1.2.3.zip',
					packageZip(root, { serverJar: serverJar('1.2.2') }),
				).join('\n'),
				/server-1\.2\.3\.jar does not carry Bundle-Version: 1\.2\.3/,
			);
			const stray = zipSync({
				'package.xml': encode('<package version="@VERSION@"/>'),
				'install/bundles/maretha-angular-webui-ui-1.2.3.jar': serverJar('1.2.3'),
				'install/bundles/maretha-angular-webui-ui-1.2.2.jar': serverJar('1.2.2'),
			});
			const problems = packageArchiveProblems(
				root,
				'maretha-angular-webui-package-1.2.3-ui-only.zip',
				stray,
			).join('\n');
			assert.match(problems, /package\.xml does not carry version="1\.2\.3"/);
			assert.match(problems, /package\.xml still has @VERSION@/);
			assert.match(
				problems,
				/unexpected bundle install\/bundles\/maretha-angular-webui-ui-1\.2\.2\.jar/,
			);
			assert.match(
				packageArchiveProblems(
					root,
					'maretha-angular-webui-package-1.2.3.zip',
					encode('zip?'),
				).join('\n'),
				/not a zip/,
			);
		});
	});

	describe('releaseProblems', () => {
		it('names the build commands while the archives are missing', () => {
			const { problems, archives } = releaseProblems(root);
			assert.deepEqual(archives, []);
			assert.match(
				problems.join('\n'),
				/dist\/maretha-webui-sdk-1\.2\.3\.tgz is missing: run npm run pack:sdk/,
			);
			assert.match(
				problems.join('\n'),
				/dist\/nuxeo\/ holds no package: run node scripts\/nuxeo-package\.mjs/,
			);
		});

		it('checks every archive under dist and flags a stale package next to the fresh one', () => {
			write('dist/maretha-webui-sdk-1.2.3.tgz', sdkArchive('1.2.3'));
			write('dist/nuxeo/maretha-angular-webui-package-1.2.3-ui-only.zip', packageZip(root));
			assert.deepEqual(releaseProblems(root), {
				problems: [],
				archives: [
					'dist/maretha-webui-sdk-1.2.3.tgz',
					'dist/nuxeo/maretha-angular-webui-package-1.2.3-ui-only.zip',
				],
			});
			write('dist/nuxeo/maretha-angular-webui-package-1.2.2.zip', packageZip(root));
			const { problems } = releaseProblems(root);
			assert.equal(problems.length, 2);
			assert.match(problems[0], /maretha-angular-webui-package-1\.2\.2\.zip: expected/);
			assert.match(
				problems[1],
				/maretha-angular-webui-package-1\.2\.2\.zip: install\/bundles\/maretha-angular-webui-server-1\.2\.3\.jar is missing/,
			);
		});
	});
});
