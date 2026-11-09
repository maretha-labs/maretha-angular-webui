import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';
import { loadProductionCatalogues } from './catalogue.mjs';

const args = process.argv.slice(2),
	root = process.cwd();
const directory = args[0],
	draftAt = args.indexOf('--draft'),
	namespaceAt = args.indexOf('--namespace');
if (!directory || draftAt < 0 || namespaceAt < 0)
	throw new Error(
		'Usage: migrate-static.mjs <source-dir> --draft <json> --namespace <prefix> [--write]',
	);
const draftPath = path.resolve(args[draftAt + 1]),
	prefix = args[namespaceAt + 1],
	write = args.includes('--write');
if (!/^app\.[a-zA-Z][\w.]*$/.test(prefix)) throw new Error('Use an app.* namespace.');
const draft = fs.existsSync(draftPath) ? JSON.parse(fs.readFileSync(draftPath, 'utf8')) : {};
const english = loadProductionCatalogues(root).catalogues['en-US'];
const byEnglish = new Map();
for (const [key, text] of Object.entries(english)) {
	const keys = byEnglish.get(text) ?? [];
	keys.push(key);
	byEnglish.set(text, keys);
}
const attrs =
	/^(?:title|placeholder|aria-label|aria-description|alt|label|tooltip|matTooltip|ngbTooltip|heading|notFoundText|loadingText|clearAllText|addTagText|typeToSearchText|[A-Za-z][A-Za-z0-9]*Label)$/;
const changes = [],
	files = new Map(),
	skipped = [];
const read = (file) => {
	if (!files.has(file)) files.set(file, { source: fs.readFileSync(file, 'utf8'), edits: [] });
	return files.get(file);
};
const slug = (value) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 42) || 'text';
const literal = (value) =>
	`'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\r', '\\r').replaceAll('\n', '\\n')}'`;
const bind = (key, text) => `${literal(key)} | webuiMessage:${literal(text)}`;
const htmlEncode = (value) =>
	value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const generate = (file, text, kind, offset) => {
	const unique = byEnglish.get(text);
	const component = slug(
		path.basename(file).replace(/\.component\.(?:html|ts)$|\.(?:html|ts)$/, ''),
	);
	const key =
		unique?.length === 1
			? unique[0]
			: `${prefix}.${component}.${slug(text)}-${crypto.createHash('sha256').update(`${file}\0${text}`).digest('hex').slice(0, 6)}`;
	if (!Object.hasOwn(english, key)) draft[key] = text;
	changes.push({
		file: path.relative(root, file),
		line: read(file).source.slice(0, offset).split('\n').length,
		kind,
		key,
		english: text,
		reused: !!unique && unique.length === 1,
	});
	return key;
};
const migrate = (file, html, base = 0, inlineQuote) => {
	const parsed = parseTemplate(html, file, { preserveWhitespaces: true });
	if (parsed.errors?.length) {
		skipped.push({ file, reason: 'Template parse errors; inspect manually.' });
		return false;
	}
	let edited = false;
	const add = (start, end, replacement) => {
		if (inlineQuote) {
			replacement = replacement
				.replaceAll('\\', '\\\\')
				.replaceAll(inlineQuote, '\\' + inlineQuote);
			if (inlineQuote === '`') replacement = replacement.replaceAll('${', '\\${');
		}
		const previous = read(file).edits.find(
			(edit) => edit.start === base + start && edit.end === base + end,
		);
		if (previous) {
			if (previous.replacement !== replacement)
				throw new Error(`Conflicting duplicate edit in ${file}`);
			edited = true; // Every standalone consumer needs the pipe, even when a shared template edit was queued already.
			return;
		}
		read(file).edits.push({ start: base + start, end: base + end, replacement });
		edited = true;
	};

	// Only display branches are candidates. Conditions, property keys, calls, pipe keys,
	// format arguments and compound phrases retain their original meaning for manual review.
	const displayBranch = (expression, inAttribute = false, branch = false) => {
		if (!expression || typeof expression !== 'object') return;
		const kind = expression.constructor.name;
		if (kind === 'ASTWithSource') return displayBranch(expression.ast, inAttribute, branch);
		if (kind === 'Interpolation') {
			if (expression.expressions.length !== 1 || expression.strings.some((text) => text.trim()))
				return;
			for (const child of expression.expressions) displayBranch(child, inAttribute, true);
		} else if (kind === 'Conditional') {
			displayBranch(expression.trueExp, inAttribute, true);
			displayBranch(expression.falseExp, inAttribute, true);
		} else if (kind === 'Binary' && ['||', '??'].includes(expression.operation)) {
			// Only the fallback is app-owned display prose; preserve the left/customer expression.
			displayBranch(expression.right, inAttribute, true);
		} else if (kind === 'ParenthesizedExpression')
			displayBranch(expression.expression, inAttribute, branch);
		else if (
			(branch || inAttribute) &&
			kind === 'LiteralPrimitive' &&
			typeof expression.value === 'string' &&
			/\p{L}/u.test(expression.value)
		) {
			const { start, end } = expression.sourceSpan;
			const key = generate(file, expression.value, 'conditional-display-literal', base + start);
			const replacement = '(' + bind(key, expression.value) + ')';
			add(start, end, inAttribute ? htmlEncode(replacement) : replacement);
		}
	};
	const walk = (node, parent = '') => {
		const name = node.name ?? parent;
		if (['script', 'style', 'code', 'pre', 'mat-icon'].includes(name)) return;
		if (typeof node.value === 'string' && !node.name && /\p{L}/u.test(node.value)) {
			const text = node.value.trim();
			if (text && !/^[{}@]/.test(text)) {
				const key = generate(file, text, 'static-text', base + node.sourceSpan.start.offset);
				const leading = node.value.match(/^\s*/)[0],
					trailing = node.value.match(/\s*$/)[0];
				add(
					node.sourceSpan.start.offset,
					node.sourceSpan.end.offset,
					`${leading}{{ ${bind(key, text)} }}${trailing}`,
				);
			}
		}
		if (node.value?.ast && !node.name) displayBranch(node.value.ast);
		for (const input of node.inputs ?? [])
			if (attrs.test(input.name) && input.name !== 'bindLabel') displayBranch(input.value, true);
		for (const attribute of node.attributes ?? [])
			if (
				attrs.test(attribute.name) &&
				attribute.name !== 'bindLabel' &&
				/\p{L}/u.test(attribute.value)
			) {
				const key = generate(
					file,
					attribute.value,
					`attribute:${attribute.name}`,
					base + attribute.sourceSpan.start.offset,
				);
				const target = ['title', 'placeholder', 'aria-label', 'aria-description', 'alt'].includes(
					attribute.name,
				)
					? `attr.${attribute.name}`
					: attribute.name;
				add(
					attribute.sourceSpan.start.offset,
					attribute.sourceSpan.end.offset,
					`[${target}]="${htmlEncode(bind(key, attribute.value))}"`,
				);
			}
		for (const key of ['children', 'branches', 'cases', 'groups'])
			for (const child of node[key] ?? []) walk(child, name);
		for (const key of ['empty', 'placeholder', 'loading', 'error'])
			if (node[key]) walk(node[key], name);
	};
	parsed.nodes.forEach((node) => walk(node));
	return edited;
};
const componentFiles = [];
const excluded = args
	.filter((value) => value.startsWith('--exclude='))
	.map((value) => path.resolve(value.slice('--exclude='.length)));
const isExcluded = (file) =>
	excluded.some((prefix) => file === prefix || file.startsWith(prefix + path.sep));
const walkDir = (dir) => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (isExcluded(file)) continue;
		if (entry.isDirectory()) walkDir(file);
		else if (file.endsWith('.ts') && !/\.(spec|generated)\.ts$/.test(file))
			componentFiles.push(file);
	}
};
walkDir(path.resolve(directory));
for (const file of componentFiles) {
	const state = read(file),
		sourceFile = ts.createSourceFile(file, state.source, ts.ScriptTarget.Latest, true);
	let needsPipe = false;
	const appendedArrays = new Set();
	const localArrays = new Map();
	for (const statement of sourceFile.statements) {
		if (
			!ts.isVariableStatement(statement) ||
			!(statement.declarationList.flags & ts.NodeFlags.Const)
		)
			continue;
		for (const declaration of statement.declarationList.declarations)
			if (
				ts.isIdentifier(declaration.name) &&
				declaration.initializer &&
				ts.isArrayLiteralExpression(declaration.initializer)
			)
				localArrays.set(declaration.name.text, declaration.initializer);
	}
	const visit = (node) => {
		if (
			ts.isCallExpression(node) &&
			node.expression.getText(sourceFile) === 'Component' &&
			node.arguments[0] &&
			ts.isObjectLiteralExpression(node.arguments[0])
		) {
			const object = node.arguments[0];
			const properties = Object.fromEntries(
				object.properties
					.filter(ts.isPropertyAssignment)
					.map((property) => [property.name.getText(sourceFile), property]),
			);
			if (properties.standalone?.initializer.kind === ts.SyntaxKind.FalseKeyword) {
				skipped.push({
					file,
					reason: 'Non-standalone component; import pipe through owning module manually.',
				});
				return;
			}
			const imports = properties.imports?.initializer;
			const importArray =
				imports &&
				(ts.isArrayLiteralExpression(imports)
					? imports
					: ts.isIdentifier(imports)
						? localArrays.get(imports.text)
						: undefined);
			if (imports && !importArray) {
				skipped.push({
					file,
					reason:
						'Component imports are not an inline array or a local const array; migrate manually.',
				});
				return;
			}
			let changed = false;
			if (properties.template && ts.isStringLiteralLike(properties.template.initializer)) {
				const raw = properties.template.initializer.getText(sourceFile);
				changed = /\|\s*webuiMessage\b/.test(properties.template.initializer.text);
				if (raw.slice(1, -1) !== properties.template.initializer.text)
					skipped.push({ file, reason: 'Inline source escapes need manual span mapping.' });
				else
					changed =
						migrate(
							file,
							properties.template.initializer.text,
							properties.template.initializer.getStart(sourceFile) + 1,
							raw[0],
						) || changed;
			}
			if (properties.templateUrl && ts.isStringLiteralLike(properties.templateUrl.initializer)) {
				const templateFile = path.resolve(
					path.dirname(file),
					properties.templateUrl.initializer.text,
				);
				if (isExcluded(templateFile)) {
					skipped.push({ file: templateFile, reason: 'Explicit migration ownership exclusion.' });
					return;
				}
				const html = read(templateFile).source;
				changed = migrate(templateFile, html) || /\|\s*webuiMessage\b/.test(html) || changed;
			}
			if (changed) {
				needsPipe = true;
				if (importArray) {
					const imports = importArray;
					if (
						!appendedArrays.has(imports) &&
						!imports.elements.some((element) => element.getText(sourceFile) === 'WebUiMessagePipe')
					) {
						appendedArrays.add(imports);
						const end = imports.end - 1;
						const before = state.source.slice(imports.pos, end).trimEnd();
						state.edits.push({
							start: end,
							end,
							replacement: imports.elements.length
								? before.endsWith(',')
									? ' WebUiMessagePipe'
									: ', WebUiMessagePipe'
								: 'WebUiMessagePipe',
						});
					}
				} else if (!imports)
					state.edits.push({
						start: object.getStart(sourceFile) + 1,
						end: object.getStart(sourceFile) + 1,
						replacement: '\n imports: [WebUiMessagePipe],',
					});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	if (
		needsPipe &&
		!sourceFile.statements.some(
			(statement) =>
				ts.isImportDeclaration(statement) &&
				statement.importClause?.namedBindings &&
				ts.isNamedImports(statement.importClause.namedBindings) &&
				statement.importClause.namedBindings.elements.some(
					(element) => element.name.text === 'WebUiMessagePipe',
				),
		)
	)
		state.edits.push({
			start: 0,
			end: 0,
			replacement: `import { WebUiMessagePipe } from '${
				path.relative(root, file).startsWith('app/extensions/')
					? (() => {
							const relative = path
								.relative(path.dirname(file), path.join(root, 'app/extensions/webui-messages'))
								.replaceAll(path.sep, '/');
							return relative.startsWith('.') ? relative : './' + relative;
						})()
					: '@maretha/webui-sdk'
			}';\n`,
		});
}
const edited = [],
	outputs = new Map();
for (const [file, state] of files) {
	if (!state.edits.length) continue;
	const sorted = state.edits.sort((a, b) => b.start - a.start);
	let result = state.source,
		last = Infinity;
	for (const edit of sorted) {
		if (edit.end > last) throw new Error(`Overlapping edits in ${file}`);
		result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
		last = edit.start;
	}
	outputs.set(file, result);
	edited.push(path.relative(root, file));
}
const out = path.resolve('dist/verification/i18n');
fs.mkdirSync(out, { recursive: true });
if (write) {
	for (const [file, result] of outputs) fs.writeFileSync(file, result);
	fs.mkdirSync(path.dirname(draftPath), { recursive: true });
	fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2) + '\n');
}
fs.writeFileSync(
	path.join(out, `${prefix}.migration.json`),
	JSON.stringify({ write, edited, changes, skipped, draft: draftPath }, null, 2) + '\n',
);
console.log(
	JSON.stringify({
		write,
		files: edited.length,
		messages: changes.length,
		newKeys: Object.keys(draft).length,
		skipped,
		report: `dist/verification/i18n/${prefix}.migration.json`,
	}),
);
