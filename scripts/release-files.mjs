#!/usr/bin/env node
// Collects the files a release publishes: the SDK archive `npm pack` wrote and
// core.manifest.json go to dist/release/ next to a `sha256sums` file (sha256sum format, base
// names). The tag workflow uploads that directory and attests every file sha256sums lists.
// Run after `npm run pack:sdk`; the last check of `npm run verify:release`.
//
//   npm run release:files
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST } from './core-manifest.mjs';
import { sdkArchiveName } from './release-identity.mjs';

export const RELEASE_DIR = 'dist/release';
export const CHECKSUMS = 'sha256sums';

/** The files a release publishes, relative to the root, in sha256sums order. */
export function releaseSources(root) {
	return [path.join('dist', sdkArchiveName(root)), MANIFEST];
}

/** Replaces dist/release/ with the release files and sha256sums; returns the checksum lines. */
export function writeReleaseFiles(root) {
	const sources = releaseSources(root);
	const missing = sources.filter((file) => !existsSync(path.join(root, file)));
	if (missing.length)
		throw new Error(`Release files missing: ${missing.join(', ')}. Run npm run pack:sdk first.`);
	const directory = path.join(root, RELEASE_DIR);
	rmSync(directory, { recursive: true, force: true });
	mkdirSync(directory, { recursive: true });
	const lines = sources.map((file) => {
		const name = path.basename(file);
		const bytes = readFileSync(path.join(root, file));
		copyFileSync(path.join(root, file), path.join(directory, name));
		return `${createHash('sha256').update(bytes).digest('hex')}  ${name}`;
	});
	writeFileSync(path.join(directory, CHECKSUMS), `${lines.join('\n')}\n`);
	return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const lines = writeReleaseFiles(root);
	console.log(`Release files in ${RELEASE_DIR}/:\n${lines.join('\n')}`);
}
