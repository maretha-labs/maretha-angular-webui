#!/usr/bin/env node
// Checks the built release artefacts beyond their identity: LICENSE and NOTICE travel in the
// package zip, in every bundle it carries and in the SDK archive, and the production build carries
// 3rdpartylicenses.txt. Run after `npm run build:prod`, `npm run pack:sdk` and
// `node scripts/nuxeo-package.mjs` (`--no-build --ui-only` or the full package).
//
//   npm run verify:release-artifacts   (a check of npm run verify:release)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { DIST, OUT, packageName, versions } from './nuxeo-package.mjs';
import { sdkArchiveName, tarEntries } from './release-identity.mjs';

export const SDK_NOTICES = Object.freeze([
	'package/NOTICE',
	'package/LICENSE-APACHE-2.0',
	'package/LICENSE-POLYMER-BSD',
]);
const missing = (archive, entries, expected) =>
	expected.filter((file) => !entries[file]).map((file) => `${archive}: ${file} is missing`);

/** The full package when dist/nuxeo holds it, else the UI-only package, else null. */
export function packagePath(root) {
	for (const uiOnly of [false, true]) {
		const name = packageName(root, { uiOnly });
		if (existsSync(path.join(root, OUT, name)))
			return { path: path.join(root, OUT, name), relative: `${OUT}/${name}`, uiOnly };
	}
	return null;
}

/** Notice problems of the production build, the SDK archive, the package and its bundles. */
export function noticeProblems(root) {
	const problems = [];
	const checked = [];
	const licences = `${DIST}/3rdpartylicenses.txt`;
	if (!existsSync(path.join(root, licences)))
		problems.push(`${licences} is missing: run npm run build:prod first.`);
	else checked.push(licences);
	const sdk = `dist/${sdkArchiveName(root)}`;
	if (!existsSync(path.join(root, sdk)))
		problems.push(`${sdk} is missing: run npm run pack:sdk first.`);
	else {
		checked.push(sdk);
		problems.push(...missing(sdk, tarEntries(readFileSync(path.join(root, sdk))), SDK_NOTICES));
	}
	const zip = packagePath(root);
	if (!zip)
		problems.push(
			`${OUT}/ holds neither ${packageName(root)} nor ${packageName(root, { uiOnly: true })}: run node scripts/nuxeo-package.mjs --no-build --ui-only (or npm run package:nuxeo) first.`,
		);
	else {
		checked.push(zip.relative);
		const files = unzipSync(readFileSync(zip.path));
		problems.push(...missing(zip.relative, files, ['LICENSE', 'NOTICE']));
		for (const bundle of Object.keys(files).filter(
			(file) => file.startsWith('install/bundles/') && file.endsWith('.jar'),
		))
			problems.push(
				...missing(`${zip.relative} ${bundle}`, unzipSync(files[bundle]), [
					'META-INF/LICENSE',
					'META-INF/NOTICE',
				]),
			);
	}
	return { problems, checked };
}

/** Every problem with the built artefacts, and what was checked. */
export function releaseArtifactProblems(root) {
	return noticeProblems(root);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const { problems, checked } = releaseArtifactProblems(root);
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	console.log(`Release artefacts ${versions(root).plain}: ${checked.join(', ')}`);
}
