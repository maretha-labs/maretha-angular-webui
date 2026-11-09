import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyFixtureExclusion } from './verify-compiled-search-production.mjs';

async function fixture(t) {
	const directory = await mkdtemp(join(tmpdir(), 'compiled-search-exclusion-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, 'main.js'), '/* production entry */');
	await writeFile(join(directory, 'main.js.map'), '{"sources":["main.ts"]}');
	return directory;
}

test('checks production scripts and maps including nested lazy chunks', async (t) => {
	const directory = await fixture(t);
	await mkdir(join(directory, 'lazy'));
	await writeFile(join(directory, 'lazy', 'search.js'), '/* search host */');
	assert.deepEqual(await verifyFixtureExclusion(directory), { scripts: 2, sourceMaps: 1 });
});

for (const [name, contents] of [
	['lazy.js', 'const id="example-documents";'],
	['main.js.map', '{"sources":["e2e/compiled-search/searches.ts"]}'],
	['translated.js', 'const key="fixture.exampleDocuments";'],
]) {
	test(`rejects a fixture leak in ${name}`, async (t) => {
		const directory = await fixture(t);
		await writeFile(join(directory, name), contents);
		await assert.rejects(verifyFixtureExclusion(directory), /Test-only search leaked/);
	});
}

test('rejects an empty output and an output missing source maps', async (t) => {
	const directory = await fixture(t);
	await rm(join(directory, 'main.js.map'));
	await assert.rejects(verifyFixtureExclusion(directory), /Expected production JavaScript/);
	await rm(join(directory, 'main.js'));
	await assert.rejects(verifyFixtureExclusion(directory), /Expected production JavaScript/);
});
