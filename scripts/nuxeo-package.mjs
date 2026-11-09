#!/usr/bin/env node
// Builds the Nuxeo package. Checks that the lockfile, the SDK and nuxeo/ carry package.json's
// version and that the server rewrites every top-level route to the application shell, builds the UI in production
// mode, then assembles the UI bundle and the package zip in Node. Entry order, timestamps and
// permissions are fixed, so two runs over one build give byte-identical output.
//
//   npm run package:nuxeo   also builds the server bundle with Maven (JDK 21, Maven 3.9) and
//                           runs its Java tests
//   --ui-only               leaves out the server bundle (CI's assembly check)
//   --no-build              reuses the existing production build
//   --check                 checks only
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const POMS = ['nuxeo/pom.xml', 'nuxeo/ui/pom.xml', 'nuxeo/server/pom.xml', 'nuxeo/package/pom.xml'];
const MANIFESTS = [
	'nuxeo/ui/src/main/resources/META-INF/MANIFEST.MF',
	'nuxeo/server/src/main/resources/META-INF/MANIFEST.MF',
];
const LOCKFILE = 'package-lock.json';
export const SDK_PACKAGE = 'app/extensions/package.json';
export const DIST = 'dist/maretha-angular-webui';
export const OUT = 'dist/nuxeo';
const UI_RESOURCES = 'nuxeo/ui/src/main/resources';
const PACKAGE_RESOURCES = 'nuxeo/package/src/main/resources';
const UNIX = 3;
const FILE_ATTRS = (0o100644 << 16) >>> 0;
const DIRECTORY_ATTRS = ((0o40755 << 16) | 0x10) >>> 0;

const posix = (file) => file.split(path.sep).join('/');

/** package.json's version in Maven and OSGi spelling (`-SNAPSHOT` / `.SNAPSHOT` when the parent pom uses it). */
export function versions(root) {
	const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
	const snapshot = readFileSync(path.join(root, 'nuxeo/pom.xml'), 'utf8').includes(
		`<version>${version}-SNAPSHOT</version>`,
	);
	return {
		plain: version,
		maven: `${version}${snapshot ? '-SNAPSHOT' : ''}`,
		osgi: `${version}${snapshot ? '.SNAPSHOT' : ''}`,
	};
}

export const serverJarName = (root) => `maretha-angular-webui-server-${versions(root).maven}.jar`;
const encode = (text) => new TextEncoder().encode(text);
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/** Files whose version differs from package.json's: the lockfile root, the SDK and nuxeo/. */
export function versionMismatches(root) {
	const read = (file) => readFileSync(path.join(root, file), 'utf8');
	const present = (file) => existsSync(path.join(root, file));
	const { plain, maven, osgi } = versions(root);
	const problems = [];
	if (!present(LOCKFILE)) problems.push(`${LOCKFILE}: missing`);
	else {
		const lock = JSON.parse(read(LOCKFILE));
		if (lock.version !== plain || lock.packages?.['']?.version !== plain)
			problems.push(
				`${LOCKFILE}: expected "version": "${plain}" at the root and in packages[""] (npm install --package-lock-only)`,
			);
	}
	if (!present(SDK_PACKAGE)) problems.push(`${SDK_PACKAGE}: missing`);
	else if (JSON.parse(read(SDK_PACKAGE)).version !== plain)
		problems.push(`${SDK_PACKAGE}: expected "version": "${plain}"`);
	return [
		...problems,
		...POMS.filter((file) => !read(file).includes(`<version>${maven}</version>`)).map(
			(file) => `${file}: expected <version>${maven}</version>`,
		),
		...MANIFESTS.filter((file) => !read(file).includes(`Bundle-Version: ${osgi}\n`)).map(
			(file) => `${file}: expected Bundle-Version: ${osgi}`,
		),
	];
}

/** Top-level routes in app-routing.module.ts that the UI bundle's rewrite rule does not serve. */
export function rewriteGaps(root) {
	const read = (file) => readFileSync(path.join(root, file), 'utf8');
	const routing = read('app/app-routing.module.ts');
	const segments = new Set([
		...[...routing.matchAll(/path:\s*[`']([^`'/$]+)/g)].map((match) => match[1]),
		...[...routing.matchAll(/\.\.\.\[([^\]]*)\]\.map\(\(pageId\)/g)].flatMap((match) =>
			[...match[1].matchAll(/'([^']+)'/g)].map((name) => name[1]),
		),
	]);
	segments.delete('**');
	const rule = read(`${UI_RESOURCES}/OSGI-INF/deployment-fragment.xml`).match(
		/RewriteRule \^\/ng\/\(([^)]*)\)/,
	);
	const served = new Set(rule ? rule[1].split('|') : []);
	return [...segments].filter((segment) => !served.has(segment)).sort();
}

/** Every file below `dir`, as sorted posix paths relative to it. */
function filesBelow(dir) {
	const files = [];
	const walk = (relative) => {
		for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
			const file = path.join(relative, entry.name);
			if (entry.isDirectory()) walk(file);
			else files.push(posix(file));
		}
	};
	walk('');
	return files.sort();
}

/**
 * A zip of `entries` ([name, bytes] in order). Each directory gets its own entry just before its
 * first child, as `jar` and Maven write them.
 */
export function zipEntries(entries) {
	// fflate writes local-time DOS fields; a local-time 1980-01-01 00:00 built now reads back as
	// the same fields in every time zone.
	const mtime = new Date(1980, 0, 1, 0, 0, 0);
	const FILE = { os: UNIX, attrs: FILE_ATTRS, mtime, level: 6 };
	const DIRECTORY = { os: UNIX, attrs: DIRECTORY_ATTRS, mtime, level: 0 };
	const zippable = {};
	for (const [name, data] of entries) {
		// Integer-like keys would be reordered by the object that carries the entries.
		if (/^\d+$/.test(name)) throw new Error(`Unsupported zip entry name ${name}.`);
		if (name in zippable) throw new Error(`Duplicate zip entry ${name}.`);
		const parts = name.split('/');
		for (let i = 1; i < parts.length; i++) {
			const dir = `${parts.slice(0, i).join('/')}/`;
			if (!(dir in zippable)) zippable[dir] = [new Uint8Array(0), DIRECTORY];
		}
		zippable[name] = [data, FILE];
	}
	return zipSync(zippable);
}

/** A jar manifest in its on-disk form: CRLF line ends, a closing blank line, lines of at most 72 bytes. */
export function jarManifest(text) {
	const lines = text.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
	const long = lines.filter((line) => Buffer.byteLength(line) > 72);
	if (long.length)
		throw new Error(`Manifest lines longer than 72 bytes must be wrapped:\n${long.join('\n')}`);
	return `${lines.join('\r\n')}\r\n\r\n`;
}

/**
 * The UI bundle: META-INF/MANIFEST.MF first, the bundle's other resources, LICENSE and NOTICE
 * when the repository has them, then the production build under nuxeo.war/ng/ without source
 * maps. Maven's META-INF/maven/ metadata is deliberately left out.
 */
export function uiJar(root, dist = path.join(root, DIST)) {
	const resources = path.join(root, UI_RESOURCES);
	const manifest = 'META-INF/MANIFEST.MF';
	return zipEntries([
		[manifest, encode(jarManifest(readFileSync(path.join(resources, manifest), 'utf8')))],
		...filesBelow(resources)
			.filter((file) => file !== manifest)
			.map((file) => [file, readFileSync(path.join(resources, file))]),
		...['LICENSE', 'NOTICE']
			.filter((file) => existsSync(path.join(root, file)))
			.map((file) => [`META-INF/${file}`, readFileSync(path.join(root, file))]),
		...filesBelow(dist)
			.filter((file) => !file.endsWith('.map'))
			.map((file) => [`nuxeo.war/ng/${file}`, readFileSync(path.join(dist, file))]),
	]);
}

/**
 * The Nuxeo package zip: descriptors with @VERSION@ filled in, LICENSE and NOTICE when the
 * repository has them, the server bundle when one is given (bytes of the Maven-built jar),
 * then the UI bundle.
 */
export function packageZip(root, { dist = path.join(root, DIST), serverJar = null } = {}) {
	const { maven } = versions(root);
	const resources = path.join(root, PACKAGE_RESOURCES);
	return zipEntries([
		...filesBelow(resources).map((file) => [
			file,
			encode(readFileSync(path.join(resources, file), 'utf8').replaceAll('@VERSION@', maven)),
		]),
		...['LICENSE', 'NOTICE']
			.filter((file) => existsSync(path.join(root, file)))
			.map((file) => [file, readFileSync(path.join(root, file))]),
		...(serverJar ? [[`install/bundles/${serverJarName(root)}`, serverJar]] : []),
		[`install/bundles/maretha-angular-webui-ui-${maven}.jar`, uiJar(root, dist)],
	]);
}

export const packageName = (root, { uiOnly = false } = {}) =>
	`maretha-angular-webui-package-${versions(root).maven}${uiOnly ? '-ui-only' : ''}.zip`;

/** Everything that blocks packaging. */
export function packageProblems(root) {
	const problems = versionMismatches(root).map(
		(line) => `Version mismatch with package.json: ${line}`,
	);
	const gaps = rewriteGaps(root);
	if (gaps.length)
		problems.push(
			`Add these routes to the RewriteRule in ${UI_RESOURCES}/OSGI-INF/deployment-fragment.xml: ${gaps.join(', ')}`,
		);
	return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const problems = packageProblems(root);
	if (problems.length) {
		console.error(problems.join('\n'));
		process.exit(1);
	}
	if (process.argv.includes('--check')) {
		console.log('Nuxeo package inputs are consistent.');
		process.exit(0);
	}
	const uiOnly = process.argv.includes('--ui-only');
	const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
	if (!process.argv.includes('--no-build')) run('npm', ['run', 'build:prod']);
	if (!existsSync(path.join(root, DIST, 'index.html'))) {
		console.error(`${DIST}/index.html is missing: run npm run build:prod first.`);
		process.exit(1);
	}
	let serverJar = null;
	if (!uiOnly) {
		run('mvn', ['-B', '-f', 'nuxeo/pom.xml', '-pl', 'server', '-am', 'clean', 'package']);
		serverJar = readFileSync(path.join(root, 'nuxeo/server/target', serverJarName(root)));
	}
	const zip = packageZip(root, { serverJar });
	const file = path.join(root, OUT, packageName(root, { uiOnly }));
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, zip);
	console.log(`Nuxeo package: ${posix(path.relative(root, file))} (sha256 ${sha256(zip)})`);
}
