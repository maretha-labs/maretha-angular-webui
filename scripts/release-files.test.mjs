import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { CHECKSUMS, RELEASE_DIR, releaseSources, writeReleaseFiles } from './release-files.mjs';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const root = mkdtempSync(path.join(tmpdir(), 'release-files-'));
const write = (file, content) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	writeFileSync(path.join(root, file), content);
};
const manifest = '{"version":"1.2.3"}';

before(() => {
	write('package.json', JSON.stringify({ version: '1.2.3' }));
	write('app/extensions/package.json', JSON.stringify({ name: '@maretha/webui-sdk' }));
	write('nuxeo/pom.xml', '<project><version>1.2.3</version></project>');
	write('core.manifest.json', manifest);
});
after(() => rmSync(root, { recursive: true, force: true }));

describe('release files', () => {
	it('are the SDK archive npm pack writes and the core manifest', () => {
		assert.deepEqual(releaseSources(root), [
			'dist/maretha-webui-sdk-1.2.3.tgz',
			'core.manifest.json',
		]);
	});

	it('fail by name while the archive is missing', () => {
		assert.throws(() => writeReleaseFiles(root), /dist\/maretha-webui-sdk-1\.2\.3\.tgz/);
		assert.ok(!existsSync(path.join(root, RELEASE_DIR)));
	});

	it('replace dist/release/ with the files and sha256sums in sha256sum format', () => {
		write(`${RELEASE_DIR}/stale.txt`, 'old');
		write('dist/maretha-webui-sdk-1.2.3.tgz', 'tgz bytes');
		const lines = writeReleaseFiles(root);
		assert.deepEqual(lines, [
			`${sha256('tgz bytes')}  maretha-webui-sdk-1.2.3.tgz`,
			`${sha256(manifest)}  core.manifest.json`,
		]);
		const out = (file) => readFileSync(path.join(root, RELEASE_DIR, file), 'utf8');
		assert.equal(out(CHECKSUMS), `${lines.join('\n')}\n`);
		assert.equal(out('maretha-webui-sdk-1.2.3.tgz'), 'tgz bytes');
		assert.equal(out('core.manifest.json'), manifest);
		assert.ok(!existsSync(path.join(root, RELEASE_DIR, 'stale.txt')));
	});
});
