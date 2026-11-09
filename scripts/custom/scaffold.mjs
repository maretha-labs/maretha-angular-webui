// Shared helpers for the custom/ generators: owner prefix, names, and the marker-based
// registration edits in custom/index.ts. Generators never overwrite an existing file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';

export const REPOSITORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MARKERS = {
	imports: '// <custom:imports>',
	contributions: '// <custom:contributions>',
	layouts: '// <custom:layouts>',
};

/** Parses `--name value` flags; `--root` points the generators at another checkout (tests). */
export function readArgs(argv, options) {
	const { values } = parseArgs({
		args: argv,
		options: { ...options, root: { type: 'string' } },
		strict: true,
	});
	return { ...values, root: path.resolve(values.root ?? REPOSITORY) };
}

export function ownerPrefix(root) {
	const { prefix } = JSON.parse(readFileSync(path.join(root, 'custom', 'owner.json'), 'utf8'));
	if (typeof prefix !== 'string' || !/^[a-z][a-z0-9-]*$/.test(prefix) || prefix === 'maretha')
		throw new Error(
			'custom/owner.json needs a lowercase "prefix" other than "maretha", such as { "prefix": "acme" }.',
		);
	return prefix;
}

export function checkId(id, prefix) {
	if (typeof id !== 'string' || !new RegExp(`^${prefix}(\\.[a-z][a-z0-9-]*)+$`).test(id))
		throw new Error(
			`--id must be "${prefix}." followed by dot-separated lowercase segments, such as ${prefix}.contract.approve.`,
		);
	return id;
}

const words = (value) =>
	value
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
export const pascal = (value) =>
	words(value)
		.map((word) => word[0].toUpperCase() + word.slice(1))
		.join('');
export const kebab = (value) => words(value).join('-').toLowerCase();
export const sentence = (value) => {
	const text = words(value).join(' ').toLowerCase();
	return text[0].toUpperCase() + text.slice(1);
};
export const quote = (value) =>
	`'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

function insertBefore(text, marker, entries) {
	const at = text.indexOf(marker);
	if (at < 0) throw new Error(`custom/index.ts is missing its ${marker} marker comment.`);
	const lineStart = text.lastIndexOf('\n', at) + 1;
	return (
		text.slice(0, lineStart) + entries.map((entry) => `${entry}\n`).join('') + text.slice(lineStart)
	);
}

function addSdkImports(text, names) {
	if (!names.length) return text;
	const pattern = /import\s*\{([^}]*)\}\s*from\s*'@maretha\/webui-sdk';/;
	const match = pattern.exec(text);
	const existing = match ? match[1].split(',').map((name) => name.trim()) : [];
	const all = [...new Set([...existing, ...names].filter(Boolean))].sort((a, b) =>
		a.replace(/^type /, '').localeCompare(b.replace(/^type /, '')),
	);
	const statement = `import { ${all.join(', ')} } from '@maretha/webui-sdk';`;
	return match ? text.replace(pattern, statement) : `${statement}\n${text}`;
}

async function format(file, text) {
	const options = await prettier.resolveConfig(path.join(REPOSITORY, path.basename(file)), {
		config: path.join(REPOSITORY, '.prettierrc.json'),
	});
	return prettier.format(text, { ...options, filepath: file });
}

/**
 * Writes new files and registers them in custom/index.ts in one step. Nothing is written
 * when a target file exists, a marker is missing or an ID is already registered.
 */
export async function scaffold(
	root,
	{ files, ids, sdk = [], imports = [], contributions = [], layouts = [] },
) {
	const index = path.join(root, 'custom', 'index.ts');
	let text = readFileSync(index, 'utf8');
	const duplicate = ids.find((id) => text.includes(quote(id)));
	if (duplicate) throw new Error(`custom/index.ts already registers ${duplicate}.`);
	const fresh = files.filter((file) => !file.reuse || !existsSync(path.join(root, file.path)));
	const taken = fresh.filter((file) => existsSync(path.join(root, file.path)));
	if (taken.length)
		throw new Error(`Refusing to overwrite ${taken.map((file) => file.path).join(', ')}.`);
	text = insertBefore(text, MARKERS.imports, imports);
	text = insertBefore(
		text,
		MARKERS.contributions,
		contributions.map((entry) => `${entry},`),
	);
	text = insertBefore(
		text,
		MARKERS.layouts,
		layouts.map((entry) => `${entry},`),
	);
	text = addSdkImports(text, sdk);
	const outputs = [
		...(await Promise.all(
			fresh.map(async (file) => [file.path, await format(file.path, file.content)]),
		)),
		['custom/index.ts', await format(index, text)],
	];
	for (const [relative, content] of outputs) {
		const target = path.join(root, relative);
		mkdirSync(path.dirname(target), { recursive: true });
		writeFileSync(target, content);
	}
	return outputs.map(([relative]) => relative);
}

export async function run(main) {
	try {
		const written = await main(process.argv.slice(2));
		console.log(`Wrote ${written.join(', ')}.`);
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	}
}
