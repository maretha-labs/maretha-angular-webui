#!/usr/bin/env node
// Checks the release identity of the built archives: the SDK tarball and the Nuxeo package are
// named after package.json's version and carry it inside (the SDK's package.json and release
// notes, package.xml, the manifest of every bundle). Run after `npm run pack:sdk` and
// `node scripts/nuxeo-package.mjs` (`--ui-only` or the full package).
//
//   npm run verify:release-identity
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { OUT, SDK_PACKAGE, packageName, serverJarName, versions } from './nuxeo-package.mjs';

const text = (bytes) => new TextDecoder().decode(bytes);
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sdkPackage = (root) => JSON.parse(readFileSync(path.join(root, SDK_PACKAGE), 'utf8'));

/** The file `npm pack` writes for the SDK: `@maretha/webui-sdk` at 1.0.0 is maretha-webui-sdk-1.0.0.tgz. */
export function sdkArchiveName(root) {
	const { name } = sdkPackage(root);
	return `${name.replace(/^@/, '').replace('/', '-')}-${versions(root).plain}.tgz`;
}

/** The regular files of a gzipped tar (ustar, pax path records honoured) as { name: bytes }. */
export function tarEntries(tgz) {
	const tar = gunzipSync(tgz);
	const entries = {};
	let paxPath;
	for (let at = 0; at + 512 <= tar.length; ) {
		const header = tar.subarray(at, at + 512);
		if (header.every((byte) => byte === 0)) break;
		const field = (start, length) =>
			text(header.subarray(start, start + length)).replace(/\0[\s\S]*$/, '');
		const size = parseInt(field(124, 12), 8) || 0;
		const type = field(156, 1);
		const prefix = field(345, 155);
		const data = tar.subarray(at + 512, at + 512 + size);
		at += 512 + Math.ceil(size / 512) * 512;
		if (type === 'x') {
			paxPath = [...text(data).matchAll(/^\d+ path=(.*)$/gm)].at(-1)?.[1] ?? paxPath;
			continue;
		}
		if (type !== '0' && type !== '') continue;
		entries[paxPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100))] = data;
		paxPath = undefined;
	}
	return entries;
}

/** What the SDK tarball `name` with contents `bytes` gets wrong about the release identity. */
export function sdkArchiveProblems(root, name, bytes) {
	const { plain } = versions(root);
	const expected = sdkArchiveName(root);
	const problems = [];
	if (name !== expected) problems.push(`${name}: expected the SDK archive to be named ${expected}`);
	let entries;
	try {
		entries = tarEntries(bytes);
	} catch (error) {
		return [...problems, `${name}: not a gzipped tar (${error.message})`];
	}
	const manifest = entries['package/package.json'];
	if (!manifest) problems.push(`${name}: package/package.json is missing`);
	else {
		const { name: sdkName, version } = JSON.parse(text(manifest));
		if (sdkName !== sdkPackage(root).name)
			problems.push(
				`${name}: package/package.json names ${sdkName}, expected ${sdkPackage(root).name}`,
			);
		if (version !== plain)
			problems.push(`${name}: package/package.json has version ${version}, expected ${plain}`);
	}
	const notes = entries['package/CHANGELOG.md'];
	if (!notes) problems.push(`${name}: package/CHANGELOG.md is missing`);
	else if (!new RegExp(`^## ${escape(plain)}\\b`, 'm').test(text(notes)))
		problems.push(`${name}: package/CHANGELOG.md has no "## ${plain}" entry`);
	return problems;
}

/** What the package zip `name` with contents `bytes` gets wrong about the release identity. */
export function packageArchiveProblems(root, name, bytes) {
	const { maven, osgi } = versions(root);
	const full = packageName(root);
	const uiOnly = packageName(root, { uiOnly: true });
	const problems = [];
	if (name !== full && name !== uiOnly)
		problems.push(`${name}: expected ${full} or ${uiOnly}; delete stale packages or rebuild`);
	let files;
	try {
		files = unzipSync(bytes);
	} catch (error) {
		return [...problems, `${name}: not a zip (${error.message})`];
	}
	const descriptor = files['package.xml'];
	if (!descriptor) problems.push(`${name}: package.xml is missing`);
	else {
		const xml = text(descriptor);
		if (!xml.includes(`version="${maven}"`))
			problems.push(`${name}: package.xml does not carry version="${maven}"`);
		if (xml.includes('@VERSION@')) problems.push(`${name}: package.xml still has @VERSION@`);
	}
	const expected = [
		`install/bundles/maretha-angular-webui-ui-${maven}.jar`,
		...(name === uiOnly ? [] : [`install/bundles/${serverJarName(root)}`]),
	];
	const bundles = Object.keys(files).filter(
		(file) => file.startsWith('install/bundles/') && file.endsWith('.jar'),
	);
	for (const bundle of expected)
		if (!bundles.includes(bundle)) problems.push(`${name}: ${bundle} is missing`);
	for (const bundle of bundles) {
		if (!expected.includes(bundle)) {
			problems.push(`${name}: unexpected bundle ${bundle}`);
			continue;
		}
		const manifest = unzipSync(files[bundle])['META-INF/MANIFEST.MF'];
		if (!manifest) problems.push(`${name}: ${bundle} has no META-INF/MANIFEST.MF`);
		else if (!new RegExp(`^Bundle-Version: ${escape(osgi)}\\r?$`, 'm').test(text(manifest)))
			problems.push(`${name}: ${bundle} does not carry Bundle-Version: ${osgi}`);
	}
	return problems;
}

/** Every problem with the archives under dist/, and the archives that were checked. */
export function releaseProblems(root) {
	const problems = [];
	const archives = [];
	const sdk = path.join('dist', sdkArchiveName(root));
	if (!existsSync(path.join(root, sdk)))
		problems.push(`${sdk} is missing: run npm run pack:sdk first.`);
	else {
		archives.push(sdk);
		problems.push(
			...sdkArchiveProblems(root, path.basename(sdk), readFileSync(path.join(root, sdk))),
		);
	}
	const out = path.join(root, OUT);
	const zips = existsSync(out)
		? readdirSync(out)
				.filter((file) => file.endsWith('.zip'))
				.sort()
		: [];
	if (!zips.length)
		problems.push(
			`${OUT}/ holds no package: run node scripts/nuxeo-package.mjs --no-build --ui-only (or npm run package:nuxeo) first.`,
		);
	for (const zip of zips) {
		archives.push(`${OUT}/${zip}`);
		problems.push(...packageArchiveProblems(root, zip, readFileSync(path.join(out, zip))));
	}
	return { problems, archives };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const { problems, archives } = releaseProblems(root);
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	console.log(`Release identity ${versions(root).plain}: ${archives.join(', ')}`);
}
