// Angular side of the slot parity: the context fields each SDK slot declares and the components
// that host each slot.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Reads each exported *_SLOT definition of the SDK entry point with the TypeScript checker and
// returns the property names of its context type, including inherited ones, by slot name.
export function slotContexts(entry = path.join(root, 'app/extensions/index.ts')) {
	const program = ts.createProgram([entry], {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ES2022,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		experimentalDecorators: true,
		skipLibCheck: true,
		noEmit: true,
		strict: true,
	});
	const checker = program.getTypeChecker();
	const module = checker.getSymbolAtLocation(program.getSourceFile(entry));
	const contexts = {};
	for (const exported of checker.getExportsOfModule(module)) {
		if (!exported.name.endsWith('_SLOT')) continue;
		const symbol =
			exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
		const declaration = symbol.valueDeclaration;
		const slot = checker.getTypeOfSymbolAtLocation(symbol, declaration);
		const name = declaration.initializer?.arguments?.[0];
		const isContext = checker.getTypeOfSymbolAtLocation(slot.getProperty('isContext'), declaration);
		const predicate = checker.getTypePredicateOfSignature(isContext.getCallSignatures()[0]);
		const key = ts.isStringLiteral(name) ? name.text : name.name.text;
		contexts[key] = checker
			.getPropertiesOfType(predicate.type)
			.map((property) => property.name)
			.sort();
	}
	return contexts;
}

// SDK elements that host a fixed slot, or a slot pair when no itemSlot/pageSlot is bound.
const WRAPPERS = {
	'nx-webui-page': ['PAGES'],
	'nx-webui-theme-picker': ['THEMES'],
	'nx-document-views': ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'],
	'nx-paired-views': ['DOCUMENT_VIEWS_ITEMS', 'DOCUMENT_VIEWS_PAGES'],
};
const SLOT_NAME = /'([A-Z][A-Z_]+)'/g;

const sources = (directory) =>
	readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
		const name = `${directory}/${entry.name}`;
		if (entry.isDirectory()) return name === 'app/testing' ? [] : sources(name);
		return /\.(ts|html)$/.test(name) && !/\.(spec|generated)\.ts$/.test(name) ? [name] : [];
	});

// Component files outside the SDK that render a slot by a literal name: <nx-webui-slot>, a
// registry lookup, or an SDK wrapper element. Templates count toward their component's .ts file.
export function slotHosts() {
	const hosts = new Map();
	const add = (slot, file) => {
		const component = file.replace(/\.html$/, '.ts');
		hosts.set(slot, [...new Set([...(hosts.get(slot) ?? []), component])].sort());
	};
	for (const file of sources('app').filter((name) => !name.startsWith('app/extensions/'))) {
		const text = readFileSync(path.join(root, file), 'utf8');
		const component = () => readFileSync(path.join(root, file.replace(/\.html$/, '.ts')), 'utf8');
		for (const [, attributes] of text.matchAll(/<nx-webui-slot\b([\s\S]*?)\/?>/g)) {
			const literal = /(?:^|\s)name="([A-Z_]+)"/.exec(attributes)?.[1];
			const bound = /\[name\]="([^"]+)"/.exec(attributes)?.[1] ?? '';
			const property = /^\w+$/.test(bound)
				? new RegExp(`\\b${bound}\\s*=\\s*POLYMER_SLOTS\\.([A-Z_]+)`).exec(component())?.[1]
				: undefined;
			const names = [literal, property, ...[...bound.matchAll(SLOT_NAME)].map((m) => m[1])];
			for (const name of names.filter(Boolean)) add(name, file);
		}
		for (const [, name] of text.matchAll(/\bregistry\.resolve\(\s*'([A-Z_]+)'/g)) add(name, file);
		for (const [element, defaults] of Object.entries(WRAPPERS))
			for (const [, attributes] of text.matchAll(
				new RegExp(`<${element}\\b([\\s\\S]*?)\\/?>`, 'g'),
			)) {
				const item = /\bitemSlot="([A-Z_]+)"/.exec(attributes)?.[1];
				const page = /\bpageSlot="([A-Z_]+)"/.exec(attributes)?.[1];
				for (const name of item || page ? [item, page] : defaults) if (name) add(name, file);
			}
	}
	return Object.fromEntries([...hosts].sort(([a], [b]) => a.localeCompare(b)));
}

if (process.argv[1] === fileURLToPath(import.meta.url))
	console.log(JSON.stringify({ contexts: slotContexts(), hosts: slotHosts() }, null, 2));
