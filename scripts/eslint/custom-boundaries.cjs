// @ts-check
// Enforces the customization zone in both directions: custom/ code imports only its own files, the
// public SDK and npm packages, never core files; core imports nothing from custom/ except the
// entry point that main.ts registers.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

/** @param {string} specifier */
function packageName(specifier) {
	const parts = specifier.split('/');
	return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const within = (/** @type {string} */ file, /** @type {string} */ directory) =>
	file === directory || file.startsWith(directory + path.sep);

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
	meta: {
		type: 'problem',
		docs: {
			description: 'Keep custom/ and core code on their sides of the customization boundary.',
		},
		schema: [
			{
				type: 'object',
				properties: { root: { type: 'string' } },
				additionalProperties: false,
			},
		],
		messages: {
			customImport:
				"custom/ code may import only custom/ files, '@maretha/webui-sdk' and npm packages, never core files; '{{specifier}}' is outside them.",
			coreImport:
				"Core code must not import custom/ ('{{specifier}}'); only main.ts registers custom/index.ts.",
		},
	},
	create(context) {
		const root = path.resolve(context.options[0]?.root ?? ROOT);
		const custom = path.join(root, 'custom');
		const entry = path.join(custom, 'index');
		const entryTargets = new Set([custom, entry, `${entry}.ts`]);
		const file = path.resolve(context.filename);
		const inCustom = within(file, custom);

		/** Resolves like TypeScript with baseUrl "./": relative, then root-relative, else a package. */
		const resolve = (/** @type {string} */ specifier) => {
			if (specifier.startsWith('.')) return path.resolve(path.dirname(file), specifier);
			if (path.isAbsolute(specifier)) return path.resolve(specifier);
			const first = specifier.split('/')[0];
			if (!first.startsWith('@') && fs.existsSync(path.join(root, first)))
				return path.join(root, specifier);
			return undefined;
		};

		/** @param {import('estree').Node | null | undefined} source */
		const check = (source) => {
			if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return;
			const specifier = source.value;
			const target = resolve(specifier);
			if (inCustom) {
				const name = packageName(specifier);
				const ok = target
					? within(target, custom)
					: name !== '@maretha/webui-sdk' || specifier === name;
				if (!ok) context.report({ node: source, messageId: 'customImport', data: { specifier } });
				return;
			}
			if (!target || !within(target, custom)) return;
			if (file !== path.join(root, 'main.ts') || !entryTargets.has(target))
				context.report({ node: source, messageId: 'coreImport', data: { specifier } });
		};

		return {
			ImportDeclaration: (node) => check(node.source),
			ExportAllDeclaration: (node) => check(node.source),
			ExportNamedDeclaration: (node) => check(node.source),
			ImportExpression: (node) => check(node.source),
			/** @param {any} node */
			TSImportType: (node) => check(node.argument?.literal ?? node.argument),
			/** @param {any} node */
			TSExternalModuleReference: (node) => check(node.expression),
		};
	},
};
