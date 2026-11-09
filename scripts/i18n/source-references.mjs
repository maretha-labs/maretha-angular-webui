import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const keyFields = new Set([
	'labelKey',
	'titleKey',
	'messageKey',
	'reasonKey',
	'descriptionKey',
	'ariaLabelKey',
	'emptyKey',
	'captionKey',
	'tooltipKey',
	'placeholderKey',
	'confirmButtonTitleKey',
	'declineButtonTitleKey',
]);

/** Statically explicit built-in keys only. Dynamic customer keys are not inferred. */
export function messageReferences(file, source) {
	const references = [],
		seen = new Set();
	const add = (key, offset, kind) => {
		if (typeof key !== 'string' || !key.trim()) return;
		const line = source.slice(0, offset).split('\n').length;
		const identity = `${key}:${line}:${kind}`;
		if (seen.has(identity)) return;
		seen.add(identity);
		references.push({ file, line, key, kind });
	};
	const template = (html, base = 0) => {
		const parsed = parseTemplate(html, file);
		const visited = new Set();
		const walk = (node) => {
			if (!node || typeof node !== 'object' || visited.has(node)) return;
			visited.add(node);
			const offset = base + (node.sourceSpan?.start?.offset ?? node.sourceSpan?.start ?? 0);
			if (node.constructor?.name === 'BindingPipe' && /^(webuiMessage|translate)$/.test(node.name))
				add(node.exp?.value, offset, 'template-pipe');
			if (keyFields.has(node.name)) {
				if (typeof node.value === 'string') add(node.value, offset, 'template-key');
				else add(node.value?.ast?.value, offset, 'template-key');
			}
			for (const [key, value] of Object.entries(node)) {
				if (/span|location|errors|tokens|source/i.test(key)) continue;
				if (Array.isArray(value)) value.forEach(walk);
				else if (value && typeof value === 'object') walk(value);
			}
		};
		parsed.nodes.forEach(walk);
	};
	if (file.endsWith('.html')) {
		template(source);
		return references;
	}
	const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
	const aliases = new Map();
	for (const statement of ast.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		const module = statement.moduleSpecifier.text;
		if (!/webui-sdk|webui-messages|localized-message|localized-state/.test(module)) continue;
		for (const element of statement.importClause?.namedBindings?.elements ?? [])
			aliases.set(element.name.text, element.propertyName?.text ?? element.name.text);
	}
	const services = new Set(),
		descriptorStates = new Set(),
		localizedStates = new Set();
	const findReceivers = (node) => {
		if (
			ts.isParameter(node) &&
			ts.isIdentifier(node.name) &&
			node.type &&
			ts.isTypeReferenceNode(node.type) &&
			ts.isIdentifier(node.type.typeName) &&
			aliases.get(node.type.typeName.text) === 'WebUiMessages'
		)
			services.add(node.name.text);
		if (
			(ts.isPropertyDeclaration(node) || ts.isVariableDeclaration(node)) &&
			node.initializer &&
			node.name &&
			ts.isIdentifier(node.name)
		) {
			const init = node.initializer;
			if (ts.isCallExpression(init)) {
				const first = init.arguments[0];
				if (first && ts.isIdentifier(first) && aliases.get(first.text) === 'WebUiMessages')
					services.add(node.name.text);
				if (
					ts.isIdentifier(init.expression) &&
					aliases.get(init.expression.text) === 'localizedMessage'
				)
					descriptorStates.add(node.name.text);
				if (
					ts.isIdentifier(init.expression) &&
					aliases.get(init.expression.text) === 'localizedState'
				)
					localizedStates.add(node.name.text);
			}
		}
		ts.forEachChild(node, findReceivers);
	};
	findReceivers(ast);
	const literal = (node) => (node && ts.isStringLiteralLike(node) ? node.text : undefined);
	const receiver = (node) =>
		ts.isIdentifier(node)
			? node.text
			: ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword
				? node.name.text
				: undefined;
	const walk = (node) => {
		if (
			ts.isPropertyDeclaration(node) &&
			ts.isIdentifier(node.name) &&
			keyFields.has(node.name.text) &&
			node.initializer
		) {
			const init = node.initializer;
			add(
				literal(
					ts.isCallExpression(init) &&
						ts.isIdentifier(init.expression) &&
						init.expression.text === 'input'
						? init.arguments[0]
						: init,
				),
				node.getStart(ast),
				'input-key',
			);
		}
		if (ts.isPropertyAssignment(node)) {
			const name = node.name.getText(ast).replace(/^['"]|['"]$/g, '');
			if (keyFields.has(name)) add(literal(node.initializer), node.getStart(ast), 'metadata-key');
			if (name === 'template' && ts.isStringLiteralLike(node.initializer))
				template(node.initializer.text, node.initializer.getStart(ast) + 1);
		}
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			const expression = node.expression;
			if (
				ts.isIdentifier(expression) &&
				['messageText', 'LocalizedUiError'].includes(aliases.get(expression.text))
			)
				add(literal(node.arguments?.[0]), node.getStart(ast), 'message-descriptor');
			if (ts.isPropertyAccessExpression(expression)) {
				const object = receiver(expression.expression),
					method = expression.name.text;
				if (
					(services.has(object) && ['text', 'format'].includes(method)) ||
					(descriptorStates.has(object) && method === 'set')
				)
					add(literal(node.arguments?.[0]), node.getStart(ast), 'message-call');
				if (localizedStates.has(object) && ['setMessage', 'setError'].includes(method))
					add(
						literal(node.arguments?.[method === 'setError' ? 1 : 0]),
						node.getStart(ast),
						'localized-state',
					);
			}
		}
		ts.forEachChild(node, walk);
	};
	walk(ast);
	return references;
}

export function collectMessageReferences(root) {
	const references = [];
	const walk = (directory) => {
		for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, item.name);
			if (item.isDirectory()) {
				if (path.relative(root, full).replaceAll(path.sep, '/') !== 'app/testing') walk(full);
			} else if (
				/\.(ts|html|json)$/.test(item.name) &&
				!/\.(?:spec|test|generated)\.(?:ts|json)$/.test(item.name) &&
				!/\.fixture\.json$/.test(item.name)
			)
				references.push(
					...messageReferences(
						path.relative(root, full).replaceAll(path.sep, '/'),
						fs.readFileSync(full, 'utf8'),
					),
				);
		}
	};
	walk(path.join(root, 'app'));
	return references;
}

export function missingMessageReferences(references, catalog) {
	return references.filter((reference) => !Object.hasOwn(catalog, reference.key));
}
