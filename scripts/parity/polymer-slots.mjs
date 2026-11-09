#!/usr/bin/env node
// Inventories the slot hosts with their model fields, default slot contributions and non-slot
// customization resources (document, search and workflow task layouts, themes, page providers) of a
// Polymer Nuxeo Web UI checkout: node scripts/parity/polymer-slots.mjs --source <nuxeo-web-ui> [--out <file>]
// The committed contracts/polymer-slots.json is this output for the pinned revision.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import * as prettier from 'prettier';

const ATTRIBUTE = /([a-zA-Z][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
const FILTERS = ['type', 'facet', 'schema', 'state', 'path', 'permission', 'expression', 'group'];
// Literal server page provider names; nx-provider attributes name local elements instead.
const PROVIDER = /(?<![\w-])(?:page-)?provider="([a-z][a-z0-9_]*)"/g;

const attributes = (text) =>
	Object.fromEntries([...text.matchAll(ATTRIBUTE)].map((m) => [m[1], m[2] ?? m[3] ?? '']));
const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const objectKeys = (text, start) => objectLiteral(text, start).keys;
const camel = (name) => name.replace(/-([a-z])/g, (_, char) => char.toUpperCase());

// Top-level keys and closing index of the object literal whose opening brace is at text[start].
function objectLiteral(text, start) {
	const keys = [];
	const entry = /\s*([A-Za-z_$][\w$]*)\s*[:,}]/y;
	const next = (index) => {
		entry.lastIndex = index + 1;
		const match = entry.exec(text);
		if (match) keys.push(match[1]);
	};
	let depth = 0;
	let quote = null;
	for (let index = start; index < text.length; index++) {
		const char = text[index];
		if (quote) {
			if (char === '\\') index++;
			else if (char === quote) quote = null;
		} else if (`"'\``.includes(char)) quote = char;
		else if ('{[('.includes(char)) {
			if (++depth === 1) next(index);
		} else if ('}])'.includes(char)) {
			if (--depth === 0) return { keys, end: index };
		} else if (char === ',' && depth === 1) next(index);
	}
	throw new Error(`Unterminated object literal at ${start}`);
}

// Fields of the object a host binds as `model="[[property]]"`: a computed property's returned
// literal, a literal assigned to the property, or the same property of a child element bound
// two-way (`attribute="{{property}}"`). Returns null when none of these shapes is present.
function modelFields(file, property, read) {
	const text = read(file);
	const declaration = new RegExp(`\\b${property}:\\s*\\{`).exec(text);
	const span =
		declaration &&
		text.slice(
			declaration.index,
			objectLiteral(text, declaration.index + declaration[0].length - 1).end,
		);
	const computed = span && /\bcomputed:\s*'(\w+)\(/.exec(span);
	if (computed) {
		const method = new RegExp(`\\n\\s*${computed[1]}\\(\\)\\s*\\{`).exec(text);
		if (!method) return null;
		return objectKeys(text, text.indexOf('{', text.indexOf('return', method.index)));
	}
	const assigned = new RegExp(`(?:this\\.|const )${property} = \\{`).exec(text);
	if (assigned) {
		const extra = [...text.matchAll(new RegExp(`\\b${property}\\.(\\w+) =`, 'g'))];
		return [
			...objectKeys(text, assigned.index + assigned[0].length - 1),
			...extra.map((m) => m[1]),
		];
	}
	const bound = new RegExp(
		`<([a-z][a-z0-9]*-[a-z0-9-]+)\\s[^>]*?([a-z-]+)="\\{\\{${property}\\}\\}"`,
	).exec(text);
	const child = bound && read.element(bound[1]);
	return child ? modelFields(child, camel(bound[2]), read) : null;
}
const sources = (directory) =>
	readdirSync(directory).flatMap((name) => {
		const full = path.join(directory, name);
		if (name === 'node_modules' || name === 'test' || name.startsWith('.')) return [];
		if (statSync(full).isDirectory()) return sources(full);
		return /\.(html|js)$/.test(name) ? [full] : [];
	});

export function inventory(source) {
	const files = ['elements', 'addons']
		.flatMap((directory) => sources(path.join(source, directory)))
		.sort();
	const hosts = [];
	const contributions = [];
	const providers = new Map();
	let sharedModel = null;
	const read = (file) => readFileSync(file, 'utf8');
	read.element = (tag) => files.find((file) => /^[^.]+/.exec(path.basename(file))[0] === tag);
	for (const file of files) {
		const text = read(file);
		const relative = path.relative(source, file).replaceAll(path.sep, '/');
		const shared = /\bsetSharedModel\(\{/.exec(text);
		if (shared)
			sharedModel = {
				fields: objectKeys(text, shared.index + shared[0].length - 1).sort(),
				file: relative,
				line: lineOf(text, shared.index),
			};
		const origin = relative.startsWith('addons/') ? relative.split('/')[1] : 'core';
		for (const [, name] of text.matchAll(PROVIDER)) {
			const uses = providers.get(name) ?? new Map();
			uses.set(relative, origin);
			providers.set(name, uses);
		}
		for (const match of text.matchAll(/<nuxeo-slot(\s[^>]*)?>/g)) {
			const attrs = attributes(match[1] ?? '');
			const property = /^\[\[(\w+)\]\]$/.exec(attrs.model ?? '')?.[1];
			const fields = property ? modelFields(file, property, read) : [];
			if (!fields) throw new Error(`${relative}: cannot resolve the fields of ${attrs.model}`);
			hosts.push({
				slot: attrs.name ?? attrs.slot,
				model: attrs.model ?? null,
				fields: [...new Set(fields)].sort(),
				file: relative,
				line: lineOf(text, match.index),
			});
		}
		for (const match of text.matchAll(
			/<nuxeo-slot-content(\s[^>]*)>([\s\S]*?)<\/nuxeo-slot-content>/g,
		)) {
			const attrs = attributes(match[1]);
			const body = match[2];
			const filter = /<nuxeo-filter(\s[^>]*)>/.exec(body);
			const filterAttrs = filter ? attributes(filter[1]) : {};
			const element = /<((?!nuxeo-filter\b|dom-if\b|dom-repeat\b)[a-z][a-z0-9]*-[a-z0-9-]+)/.exec(
				body,
			);
			contributions.push({
				slot: attrs.slot,
				name: attrs.name,
				order: attrs.order === undefined ? null : Number(attrs.order),
				...(attrs.priority !== undefined && { priority: Number(attrs.priority) }),
				...('disabled' in attrs && { disabled: true }),
				filter: Object.fromEntries(
					FILTERS.filter((key) => filterAttrs[key]).map((key) => [key, filterAttrs[key]]),
				),
				element: element?.[1] ?? null,
				origin,
				file: relative,
				line: lineOf(text, match.index),
			});
		}
	}
	const sort = (a, b) =>
		a.slot.localeCompare(b.slot) || a.file.localeCompare(b.file) || a.line - b.line;
	const relativeFiles = files.map((file) => path.relative(source, file).replaceAll(path.sep, '/'));
	const matching = (pattern) => relativeFiles.map((file) => pattern.exec(file)).filter(Boolean);
	// Per-type layouts follow nuxeo-document-layout's href convention.
	const layouts = matching(/^elements\/document\/([^/]+)\/nuxeo-\1-([a-z]+)-layout\.html$/).map(
		([file, type, mode]) => ({ type, mode, file }),
	);
	// nuxeo-search-form loads search/<name>/nuxeo-<name>-search-form.html (and -results).
	const searches = matching(/^elements\/search\/([^/]+)\/nuxeo-\1-search-form\.html$/).map(
		([file, name]) => ({
			name,
			form: file,
			results: relativeFiles.includes(file.replace('-form.html', '-results.html'))
				? file.replace('-form.html', '-results.html')
				: null,
		}),
	);
	// nuxeo-document-task loads <workflow model>/nuxeo-<task node>-layout.html.
	const workflowLayouts = matching(/^elements\/workflow\/([^/]+)\/nuxeo-([^/]+)-layout\.html$/).map(
		([file, model, task]) => ({ model, task, file }),
	);
	const themesDirectory = path.join(source, 'themes');
	const themes = (existsSync(themesDirectory) ? readdirSync(themesDirectory) : [])
		.filter((name) =>
			statSync(path.join(themesDirectory, name, 'theme.html'), { throwIfNoEntry: false }),
		)
		.sort()
		.map((name) => ({ name, file: `themes/${name}/theme.html` }));
	const pageProviders = [...providers]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, uses]) => ({
			name,
			origins: [...new Set(uses.values())].sort(),
			files: [...uses.keys()].sort(),
		}));
	return {
		sharedModel,
		hosts: hosts.sort(sort),
		contributions: contributions.sort(sort),
		layouts,
		searches,
		workflowLayouts,
		themes,
		pageProviders,
	};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const { values } = parseArgs({
		options: { source: { type: 'string' }, out: { type: 'string' } },
	});
	if (!values.source)
		throw new Error('Usage: polymer-slots.mjs --source <nuxeo-web-ui> [--out <file>]');
	const git = (args) => execFileSync('git', args, { cwd: values.source, encoding: 'utf8' }).trim();
	const result = {
		format: 1,
		source: 'https://github.com/nuxeo/nuxeo-web-ui',
		revision: git(['rev-parse', 'HEAD']),
		license: 'Apache-2.0',
		...inventory(path.resolve(values.source)),
	};
	const target = path.resolve(values.out ?? 'contracts/polymer-slots.json');
	const text = await prettier.format(JSON.stringify(result, null, 2), {
		...(await prettier.resolveConfig(target)),
		parser: 'json',
	});
	if (values.out) writeFileSync(values.out, text);
	else process.stdout.write(text);
}
