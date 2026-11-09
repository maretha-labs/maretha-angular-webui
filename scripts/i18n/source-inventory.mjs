import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const UI_FIELDS =
	/^(?:label|placeholder|title|message|description|tooltip|ariaLabel|alt|heading|hint|help|emptyText|loadingText|notFoundText|confirmButtonTitle|declineButtonTitle|confirmLabel|cancelLabel|errorMessage)$/i;
const UI_ATTRIBUTES =
	/^(?:title|placeholder|aria-label|aria-description|alt|label|tooltip|matTooltip|ngbTooltip|heading|notFoundText|loadingText|clearAllText|addTagText|typeToSearchText|[\w-]*Label)$/i;
const prose = (value) =>
	typeof value === 'string' &&
	/\p{L}/u.test(value) &&
	!/^\s*(?:https?:|[.#]\w|[A-Za-z]+:[\w/])/.test(value);
const technical =
	/^(?:id|key|labelKey|messageKey|icon|class|type|path|name|selector|templateUrl|styleUrl|styleUrls|styles|providedIn|scope|xpath|property|operation|url|href)$/i;
const pos = (source, offset) => source.slice(0, offset).split('\n').length;
const identity = (entry) =>
	crypto
		.createHash('sha256')
		.update(`${entry.file}\0${entry.kind}\0${entry.text}`)
		.digest('hex')
		.slice(0, 16);

export function inventorySource(file, source) {
	const findings = [];
	const seen = new Set();
	const add = (kind, text, offset, ownership = 'app-owned', detail = '') => {
		text = String(text).trim();
		if (!prose(text)) return;
		const entry = { file, line: pos(source, offset), kind, text, ownership, detail };
		entry.id = identity(entry);
		const unique = `${entry.id}:${entry.line}`;
		if (!seen.has(unique)) {
			seen.add(unique);
			findings.push(entry);
		}
	};
	const template = (html, base = 0) => {
		const parsed = parseTemplate(html, file, { preserveWhitespaces: true });
		if (parsed.errors?.length) {
			for (const error of parsed.errors)
				add('template-parse-error', error.msg, base + (error.span?.start.offset ?? 0), 'review');
		}
		const expression = (ast, offset, kind, owner = 'app-owned') => {
			if (!ast || typeof ast !== 'object') return;
			if (ast.constructor.name === 'BindingPipe' && /translate|webUiMessage/i.test(ast.name))
				return;
			if (ast.constructor.name === 'BindingPipe') {
				expression(ast.exp, offset, kind, owner);
				for (const arg of ast.args ?? []) expression(arg, offset, kind, 'review');
				return;
			}
			if (ast.constructor.name === 'Conditional') {
				expression(ast.trueExp, offset, kind, owner);
				expression(ast.falseExp, offset, kind, owner);
				return;
			}
			if (['Call', 'KeyedRead', 'Binary'].includes(ast.constructor.name) && ast.operation !== '+')
				owner = 'review';
			if (typeof ast.value === 'string') add(kind, ast.value, offset, owner);
			if (Array.isArray(ast.strings))
				for (const value of ast.strings) add('mixed-template-text', value, offset);
			for (const [key, value] of Object.entries(ast)) {
				if (
					[
						'sourceSpan',
						'span',
						'nameSpan',
						'strings',
						'value',
						'source',
						'location',
						'errors',
					].includes(key)
				)
					continue;
				if (Array.isArray(value)) value.forEach((child) => expression(child, offset, kind, owner));
				else if (value && typeof value === 'object') expression(value, offset, kind, owner);
			}
		};
		const walk = (node, parent = '') => {
			const offset = base + (node.sourceSpan?.start.offset ?? 0);
			const name = node.name ?? parent;
			if (['script', 'style', 'mat-icon'].includes(name)) return;
			if (typeof node.value === 'string' && !node.name) add('template-text', node.value, offset);
			if (node.value?.ast && !node.name) {
				expression(node.value.ast, offset, 'template-expression-literal');
				if (!node.value.source?.includes('|'))
					add(
						'dynamic-template',
						node.value.source,
						offset,
						'dynamic-review',
						'Confirm origin at its producing component; do not translate repository values.',
					);
			}
			for (const attribute of node.attributes ?? [])
				if (
					UI_ATTRIBUTES.test(attribute.name) &&
					!(name === 'ng-select' && attribute.name === 'bindLabel')
				)
					add(
						'template-attribute',
						attribute.value,
						base + attribute.sourceSpan.start.offset,
						'app-owned',
						attribute.name,
					);
			for (const input of node.inputs ?? [])
				if (UI_ATTRIBUTES.test(input.name))
					expression(
						input.value?.ast,
						base + input.sourceSpan.start.offset,
						'bound-attribute-literal',
					);
			for (const key of ['children', 'branches', 'cases', 'groups'])
				for (const child of node[key] ?? []) walk(child, name);
			for (const key of ['empty', 'placeholder', 'loading', 'error'])
				if (node[key]) walk(node[key], name);
		};
		for (const node of parsed.nodes) walk(node);
	};
	if (file.endsWith('.html')) template(source);
	else {
		const sourceFile = ts.createSourceFile(
			file,
			source,
			ts.ScriptTarget.Latest,
			true,
			file.endsWith('.json') ? ts.ScriptKind.JSON : ts.ScriptKind.TS,
		);
		// Only imported descriptor constructors identify their fallback as translated text.
		// localizedText('literal') deliberately stays in the inventory: its string API is literal.
		const messageDescriptors = new Set();
		const messageTypes = new Set();
		const messageInstances = new Set();
		for (const statement of sourceFile.statements) {
			if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
				continue;
			const helperImport = /(?:^|\/)helpers\/localized-message$/.test(
				statement.moduleSpecifier.text,
			);
			const sdkImport =
				statement.moduleSpecifier.text === '@maretha/webui-sdk' ||
				/(?:^|\/)webui-messages$/.test(statement.moduleSpecifier.text);
			const bindings = statement.importClause?.namedBindings;
			if (!bindings || !ts.isNamedImports(bindings)) continue;
			for (const binding of bindings.elements) {
				if (sdkImport && (binding.propertyName?.text ?? binding.name.text) === 'WebUiMessages')
					messageTypes.add(binding.name.text);
				if (helperImport && (binding.propertyName?.text ?? binding.name.text) === 'messageText')
					messageDescriptors.add(binding.name.text);
			}
		}
		const findMessageInstances = (node) => {
			if (
				(ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) &&
				node.initializer &&
				ts.isCallExpression(node.initializer) &&
				messageTypes.has(node.initializer.arguments[0]?.getText(sourceFile))
			)
				messageInstances.add(node.name.getText(sourceFile));
			ts.forEachChild(node, findMessageInstances);
		};
		findMessageInstances(sourceFile);
		const visit = (node) => {
			if (
				ts.isPropertyAssignment(node) &&
				node.name.getText(sourceFile).replace(/['"]/g, '') === 'template' &&
				ts.isStringLiteralLike(node.initializer)
			) {
				template(node.initializer.text, node.initializer.getStart(sourceFile) + 1);
				return;
			}
			if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
				const text = ts.isTemplateExpression(node)
					? node.getText(sourceFile).slice(1, -1)
					: node.text;
				const parent = node.parent;
				// JSON/quoted property names are identifiers, not displayed values.
				if (ts.isPropertyAssignment(parent) && parent.name === node) return;
				const field = ts.isPropertyAssignment(parent)
					? parent.name.getText(sourceFile).replace(/['"]/g, '')
					: '';
				if (technical.test(field) || (field && /(?:Key|Id|Url)$/.test(field))) return;
				if (UI_FIELDS.test(field))
					add(
						'typescript-ui-field',
						text,
						node.getStart(sourceFile),
						/^(?:title|message)$/.test(field) ? 'review' : 'app-owned',
						field,
					);
				else if (ts.isCallExpression(parent)) {
					const call = parent.expression.getText(sourceFile);
					const messageCall = /^(?:this\.)?(\w+)\.(text|format)$/.exec(call);
					if (
						messageCall &&
						messageInstances.has(messageCall[1]) &&
						ts.isStringLiteralLike(parent.arguments[0]) &&
						(parent.arguments[0] === node ||
							parent.arguments[messageCall[2] === 'format' ? 2 : 1] === node)
					)
						return;

					if (
						messageDescriptors.has(call) &&
						parent.arguments.length >= 2 &&
						ts.isStringLiteralLike(parent.arguments[0]) &&
						ts.isStringLiteralLike(parent.arguments[1]) &&
						(parent.arguments[0] === node || parent.arguments[1] === node)
					)
						return;
					if (
						/(?:translate|messages|webUiMessages)\.(?:instant|text|format|get|stream)$/.test(call)
					)
						return;
					if (/(?:toast|toastr|snackBar|notification|alert|confirm)/i.test(call))
						add('typescript-ui-call', text, node.getStart(sourceFile), 'app-owned', call);
					else if (/^(?:console\.|Error$)/.test(call))
						add('diagnostic', text, node.getStart(sourceFile), 'diagnostic-review', call);
					else if (/\s/.test(text))
						add('typescript-string', text, node.getStart(sourceFile), 'review', call);
				} else if (
					ts.isNewExpression(parent) &&
					parent.expression.getText(sourceFile).endsWith('Error')
				)
					add(
						'diagnostic',
						text,
						node.getStart(sourceFile),
						'diagnostic-review',
						parent.expression.getText(sourceFile),
					);
				else if (
					!ts.isImportDeclaration(parent) &&
					!ts.isExportDeclaration(parent) &&
					/\s/.test(text) &&
					!/^[{.#@]/.test(text)
				)
					add('typescript-string', text, node.getStart(sourceFile), 'review', field);
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	return findings;
}

export function collectInventory(root) {
	const files = [];
	const walk = (directory) => {
		for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (path.relative(root, full).replaceAll(path.sep, '/') !== 'app/testing') walk(full);
			} else if (
				/\.(?:ts|html|json)$/.test(entry.name) &&
				!/\.(?:spec|test|generated)\.(?:ts|json)$/.test(entry.name) &&
				!/\.fixture\.json$/.test(entry.name)
			)
				files.push(full);
		}
	};
	walk(path.join(root, 'app'));
	const findings = files
		.sort()
		.flatMap((file) =>
			inventorySource(
				path.relative(root, file).replaceAll(path.sep, '/'),
				fs.readFileSync(file, 'utf8'),
			),
		);
	return {
		version: 1,
		scope:
			'Runtime app source candidates; dynamic and diagnostic text require origin review. This inventory alone does not prove complete localization.',
		files: files.length,
		findings,
	};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const report = collectInventory(process.cwd());
	const out = path.resolve('dist/verification/i18n');
	fs.mkdirSync(out, { recursive: true });
	fs.writeFileSync(path.join(out, 'source-inventory.json'), JSON.stringify(report, null, 2) + '\n');
	const counts = Object.fromEntries(
		[...new Set(report.findings.map((f) => f.ownership))].map((owner) => [
			owner,
			report.findings.filter((f) => f.ownership === owner).length,
		]),
	);
	const rows = report.findings
		.filter((f) => f.ownership === 'app-owned' || f.ownership === 'review')
		.map(
			(f) =>
				`| ${f.file}:${f.line} | ${f.kind} | ${f.ownership} | ${f.text.replaceAll('|', '\\|').replaceAll('\n', ' ').slice(0, 180)} |`,
		);
	fs.writeFileSync(
		path.join(out, 'source-inventory.md'),
		`# Runtime message inventory\n\n${report.scope}\n\n${JSON.stringify(counts)}\n\n| Source | Shape | Ownership | Text |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`,
	);
	console.log(
		JSON.stringify({
			files: report.files,
			counts,
			report: 'dist/verification/i18n/source-inventory.json',
		}),
	);
}
