#!/usr/bin/env node
// Writes core.manifest.json for a release: the package version and the SHA-256 of every
// locked file, meaning every tracked file outside the customization zone.
// `--check` compares the working tree (tracked and untracked, not ignored) with it.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'core.manifest.json';
/** The customization zone; everything else is core. Directories end with a slash. */
export const CUSTOMER_PATHS = Object.freeze([
	'custom/',
	'migration/mapping.json',
	'migration/polymer-source/',
]);

// `git ls-files` can print far more than execFileSync's 1 MiB default, as for a large untracked tree.
const GIT_OPTIONS = Object.freeze({ encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const customer = (file) =>
	CUSTOMER_PATHS.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

export function lockedFiles(root, { untracked = false } = {}) {
	const args = ['ls-files', '-z', ...(untracked ? ['-co', '--exclude-standard'] : [])];
	return [...new Set(execFileSync('git', args, { ...GIT_OPTIONS, cwd: root }).split('\0'))]
		.filter((file) => file && file !== MANIFEST && !customer(file))
		.sort();
}

const digest = (root, file) =>
	existsSync(path.join(root, file))
		? createHash('sha256')
				.update(readFileSync(path.join(root, file)))
				.digest('hex')
		: null;

export function createManifest(root) {
	const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const files = Object.fromEntries(
		lockedFiles(root)
			.map((file) => [file, digest(root, file)])
			.filter(([, hash]) => hash),
	);
	return { version, files };
}

/** Lists locked files that were changed, removed or added since the manifest was written. */
export function compareManifest(root, manifest) {
	const current = lockedFiles(root, { untracked: true });
	const changed = [];
	const removed = [];
	for (const [file, hash] of Object.entries(manifest.files)) {
		const actual = digest(root, file);
		if (actual === null) removed.push(file);
		else if (actual !== hash) changed.push(file);
	}
	const added = current.filter(
		(file) => !Object.hasOwn(manifest.files, file) && digest(root, file),
	);
	return { changed, removed, added };
}

function main(argv) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const target = path.join(root, MANIFEST);
	if (!argv.includes('--check')) {
		const manifest = createManifest(root);
		writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`);
		console.log(
			`Wrote ${MANIFEST} for ${manifest.version}: ${Object.keys(manifest.files).length} locked files.`,
		);
		return;
	}
	if (!existsSync(target)) throw new Error(`${MANIFEST} is missing; releases write it.`);
	const manifest = JSON.parse(readFileSync(target, 'utf8'));
	const drift = compareManifest(root, manifest);
	const lines = Object.entries(drift).flatMap(([kind, files]) =>
		files.map((file) => `${kind}: ${file}`),
	);
	if (lines.length) {
		console.error(
			`Core files differ from ${MANIFEST} (${manifest.version}). Customizations belong in ${CUSTOMER_PATHS.join(', ')}.\n${lines.join('\n')}`,
		);
		process.exitCode = 1;
		return;
	}
	console.log(`All ${Object.keys(manifest.files).length} locked files match ${manifest.version}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
