import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { compareManifest, createManifest, lockedFiles } from './core-manifest.mjs';

let root;
const write = (file, content) => {
	mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
	writeFileSync(path.join(root, file), content);
};

before(() => {
	root = mkdtempSync(path.join(tmpdir(), 'core-manifest-'));
	execFileSync('git', ['init', '-q'], { cwd: root });
	write('package.json', '{ "version": "1.2.3" }');
	write('app/core.ts', 'export const core = 1;\n');
	write('custom/index.ts', 'export {};\n');
	write('migration/mapping.json', '{}');
	write('migration/polymer-source/bundle.html', '<dom-module></dom-module>');
	write('migration/inventory.json', '[]');
	write('.gitignore', 'dist/\n');
	write('dist/build.js', 'ignored');
	execFileSync('git', ['add', '-A'], { cwd: root });
});
after(() => rmSync(root, { recursive: true, force: true }));

describe('core manifest', () => {
	it('hashes every tracked file outside the customer zone', () => {
		const manifest = createManifest(root);
		assert.equal(manifest.version, '1.2.3');
		assert.deepEqual(Object.keys(manifest.files), [
			'.gitignore',
			'app/core.ts',
			'migration/inventory.json',
			'package.json',
		]);
		assert.match(manifest.files['app/core.ts'], /^[0-9a-f]{64}$/);
	});

	it('ignores customer edits and reports changed, removed and added core files', () => {
		const manifest = createManifest(root);
		write('custom/index.ts', 'export const changed = true;\n');
		write('custom/contributions/new.component.ts', 'export {};\n');
		write('migration/mapping.json', '{ "items": [] }');
		assert.deepEqual(compareManifest(root, manifest), { changed: [], removed: [], added: [] });
		write('app/core.ts', 'export const core = 2;\n');
		unlinkSync(path.join(root, 'migration/inventory.json'));
		write('app/patch.ts', 'export {};\n');
		assert.deepEqual(compareManifest(root, manifest), {
			changed: ['app/core.ts'],
			removed: ['migration/inventory.json'],
			added: ['app/patch.ts'],
		});
	});

	it('lists an untracked tree larger than the default child-process output buffer', () => {
		const large = mkdtempSync(path.join(tmpdir(), 'core-manifest-large-'));
		try {
			execFileSync('git', ['init', '-q'], { cwd: large });
			const directory = path.join(large, 'd'.repeat(200));
			mkdirSync(directory);
			// About 405 bytes per listed path: 3000 of them exceed execFileSync's 1 MiB default.
			for (let index = 0; index < 3000; index++)
				writeFileSync(path.join(directory, `${String(index).padStart(200, '0')}.ts`), '');
			assert.equal(lockedFiles(large, { untracked: true }).length, 3000);
		} finally {
			rmSync(large, { recursive: true, force: true });
		}
	});
});
