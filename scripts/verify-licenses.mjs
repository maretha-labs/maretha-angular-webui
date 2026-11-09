#!/usr/bin/env node
// Licence gate: every production npm package's declared licence must satisfy the
// allowlist, or docs/third-party/exceptions.json must name it with a reason. `AND` needs
// every operand allowed, `OR` any; `WITH` exceptions and `+` keep the base licence's verdict.
// Also checks that the third-party inventory lists every vendored file under assets/js/ and,
// with --dist <dir>, that the production build ships 3rdpartylicenses.txt.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import parse from 'spdx-expression-parse';

export const ALLOWED = Object.freeze([
	'MIT',
	'Apache-2.0',
	'BSD-2-Clause',
	'BSD-3-Clause',
	'ISC',
	'0BSD',
	'CC0-1.0',
	'Unlicense',
	'CC-BY-4.0',
	'Unicode-DFS-2016',
]);
export const EXCEPTIONS = 'docs/third-party/exceptions.json';
export const INVENTORY = 'docs/third-party/inventory.json';
export const VENDORED = 'assets/js';

/** true, false, or a string explaining why the expression cannot be judged. */
export function satisfies(expression, allowed = ALLOWED) {
	let tree;
	try {
		tree = parse(expression);
	} catch {
		return `"${expression}" is not a valid SPDX expression`;
	}
	const allow = new Set(allowed);
	const walk = (node) =>
		node.conjunction === 'and'
			? walk(node.left) && walk(node.right)
			: node.conjunction === 'or'
				? walk(node.left) || walk(node.right)
				: allow.has(node.license);
	return walk(tree);
}

/** The SPDX expression a package.json declares, or null when it uses a form we do not guess at. */
export function declaredLicense(pkg) {
	if (typeof pkg.license === 'string') return pkg.license;
	if (typeof pkg.license?.type === 'string') return pkg.license.type;
	return null;
}

/** Production packages (dev dependencies excluded), one entry per name@version. */
export function productionPackages(cwd) {
	let output;
	try {
		output = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
	} catch (error) {
		// npm ls exits non-zero on extraneous or invalid trees; a missing tree is fatal.
		if (!error.stdout) throw error;
		output = error.stdout;
	}
	// npm prints real paths (macOS: /private/var for /var), so compare real paths.
	const root = realpathSync(cwd);
	const seen = new Map();
	for (const dir of output.split('\n').filter(Boolean)) {
		if (realpathSync(dir) === root) continue;
		const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
		const id = `${pkg.name}@${pkg.version}`;
		if (!seen.has(id))
			seen.set(id, {
				name: pkg.name,
				version: pkg.version,
				license: declaredLicense(pkg),
				raw: pkg.license ?? pkg.licenses,
				path: path.relative(root, realpathSync(dir)),
			});
	}
	return [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Problems for the package list; exceptions are { name, version?, reason }. */
export function checkPackages(packages, { allowed = ALLOWED, exceptions = [] } = {}) {
	const problems = [];
	const used = new Set();
	for (const [i, exception] of exceptions.entries())
		if (typeof exception?.name !== 'string' || !String(exception.reason ?? '').trim())
			problems.push(`${EXCEPTIONS} entry ${i} needs a name and a reason.`);
	for (const pkg of packages) {
		const verdict =
			pkg.license === null
				? `declares ${JSON.stringify(pkg.raw ?? null)}, not an SPDX expression`
				: satisfies(pkg.license, allowed);
		if (verdict === true) continue;
		const exception = exceptions.find(
			(e) => e?.name === pkg.name && (e.version === undefined || e.version === pkg.version),
		);
		if (exception && String(exception.reason ?? '').trim()) {
			used.add(exception);
			continue;
		}
		problems.push(
			`${pkg.name}@${pkg.version} (${pkg.path}): ${verdict === false ? `"${pkg.license}" is outside the allowlist` : verdict}.`,
		);
	}
	for (const exception of exceptions)
		if (typeof exception?.name === 'string' && !used.has(exception))
			problems.push(
				`${EXCEPTIONS}: the exception for ${exception.name}${exception.version ? `@${exception.version}` : ''} is no longer needed; remove it.`,
			);
	return problems;
}

/** Every file under assets/js/ must appear in some inventory component's `files`. */
export function checkVendored(root) {
	const dir = path.join(root, VENDORED);
	if (!existsSync(dir)) return [];
	const file = path.join(root, INVENTORY);
	if (!existsSync(file))
		return [`${INVENTORY} is missing; it must list every file under ${VENDORED}/.`];
	const listed = new Set(
		JSON.parse(readFileSync(file, 'utf8')).components?.flatMap((c) => c.files ?? []) ?? [],
	);
	return readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) =>
			path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'),
		)
		.filter((vendored) => !listed.has(vendored))
		.map((vendored) => `${vendored} is not in ${INVENTORY}.`);
}

export function checkDist(dist) {
	return existsSync(path.join(dist, '3rdpartylicenses.txt'))
		? []
		: [`${dist}/3rdpartylicenses.txt is missing from the production build.`];
}

function main(argv) {
	const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
	const distIndex = argv.indexOf('--dist');
	const exceptionsFile = path.join(root, EXCEPTIONS);
	const exceptions = existsSync(exceptionsFile)
		? (JSON.parse(readFileSync(exceptionsFile, 'utf8')).packages ?? [])
		: [];
	const packages = productionPackages(root);
	const problems = [
		...checkPackages(packages, { exceptions }),
		...checkVendored(root),
		...(distIndex >= 0 ? checkDist(path.resolve(root, argv[distIndex + 1])) : []),
	];
	if (problems.length) {
		console.error(
			`verify:licenses failed (${packages.length} production packages):\n${problems.map((p) => `- ${p}`).join('\n')}`,
		);
		process.exitCode = 1;
	} else
		console.log(
			`verify:licenses passed: ${packages.length} production packages, allowlist ${ALLOWED.join(', ')}.`,
		);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
	main(process.argv.slice(2));
